"""Market event provenance and incident history regressions."""
import unittest
from unittest.mock import patch

from src import market_events as events, operations

OBSERVED = "2026-11-11T18:00:00Z"
CHECKED = events.milliseconds(OBSERVED)
POOL = "Bgf45Fjqeobgd5viMX8P8AfhiydRewEFKPd7nmcFNQRb"
QUOTE = "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS"
SIG = "5" * 87


def encoded(data):
    number = int.from_bytes(data, "big")
    result = ""
    while number:
        number, digit = divmod(number, 58)
        result = events.BASE58[digit] + result
    return result


class MarketEventTests(unittest.TestCase):
    def test_trade_sample_uses_execution_time_and_aggressor_side(self):
        rows = [{"id": index, "time": CHECKED - (index + 1) * 1000 + 19, "price": "0.01",
                 "qty": str(index + 1), "quoteQty": str((index + 1) / 100),
                 "isBuyerMaker": bool(index % 2)} for index in range(20)]
        rows += [rows[0], dict(rows[0], id=20, time=CHECKED + 6000), dict(rows[0], id=21, qty="nan")]
        sample = events.trade_sample(rows, events.STAMP, OBSERVED)
        self.assertEqual(sample["sample_count"], 20)
        self.assertEqual(sample["first_ms"], CHECKED - 19981)
        self.assertEqual([e["side"] for e in sample["events"]], ["sell", "buy"])
        self.assertEqual(sample["events"][0]["notional"], .20)
        self.assertEqual(sample["events"][0]["time_ms"], rows[19]["time"])
        self.assertEqual(events.trade_sample([], events.STAMP, OBSERVED)["status"], "empty")
        self.assertEqual(events.trade_sample({}, events.STAMP, OBSERVED)["status"], "unavailable")

    def test_missing_ids_preserve_equal_fills_but_merge_overlap(self):
        row = {"id": None, "time": CHECKED - 1, "price": "1", "qty": "20", "isBuyerMaker": False}
        filler = [dict(row, id=i, qty="1") for i in range(18)]
        first = events.trade_sample([row, row, *filler], events.STAMP, OBSERVED)
        second = events.trade_sample([*filler, row, row], events.STAMP, OBSERVED)
        self.assertEqual(first["sample_count"], 20)
        self.assertEqual(len(events.merge_events((first["events"], second["events"]))), 2)

    def test_live_btc_cannot_inherit_stamp_events(self):
        row = {"id": 1, "time": CHECKED - 1, "price": "1", "qty": "20", "isBuyerMaker": False}
        stamp = events.trade_sample([row], events.STAMP, OBSERVED)
        btc = events.trade_sample([row], "BTCUSDT", OBSERVED)
        with patch.object(events, "live_trade_sample", return_value=btc):
            result = events.dashboard_events("BTCUSDT", {"events": {"records": stamp["events"]}})
        self.assertEqual([e["symbol"] for e in result["records"]], ["BTCUSDT"])
        self.assertIsNone(result["liquidity"])

    def test_pump_amm_instructions_require_success_exact_pool_program_and_mints(self):
        accounts = [POOL, "", "", events.MINT, QUOTE, "", "", "", "", "", ""]
        deposit = {"programId": events.PUMPSWAP, "accounts": accounts,
                   "data": encoded(bytes.fromhex("f223c68952e1f2b6") + bytes(24))}
        withdraw = dict(deposit, data=encoded(bytes.fromhex("b712469c946da122") + bytes(24)))
        other_pool = dict(withdraw, accounts=[QUOTE, *accounts[1:]])
        wrong_mint = dict(withdraw, accounts=[*accounts[:3], QUOTE, *accounts[4:]])
        spoofed_program = dict(deposit, programId=POOL)
        tx = {"blockTime": CHECKED // 1000, "meta": {"err": None, "innerInstructions": [
            {"instructions": [withdraw, other_pool, wrong_mint, spoofed_program]}
        ]}, "transaction": {"message": {"instructions": [deposit]}}}
        actual = events.liquidity_instructions(tx, SIG, POOL, QUOTE)
        self.assertEqual([e["kind"] for e in actual], ["liquidity_add", "liquidity_remove"])
        self.assertTrue(all(e["signature"] == SIG and e["time_ms"] == CHECKED for e in actual))
        self.assertEqual(events.liquidity_instructions(dict(tx, meta={"err": {"failed": True}}), SIG, POOL, QUOTE), [])

    def test_failed_rpc_is_partial_and_is_retried_in_next_scan(self):
        raw = {"contract": events.MINT, "dex": {"data": [{
            "chainId": "solana", "dexId": "pumpswap", "pairAddress": POOL,
            "baseToken": {"address": events.MINT}, "quoteToken": {"address": QUOTE}
        }]}}
        second_signature = "6" * 87
        rows = [{"signature": signature, "err": None, "blockTime": CHECKED // 1000}
                for signature in (SIG, second_signature)]
        tx = {"blockTime": CHECKED // 1000, "meta": {"err": None}, "transaction": {"message": {}}}

        def rpc(method, args):
            if method == "getSignaturesForAddress":
                self.assertEqual(args[1]["commitment"], "finalized")
                return rows, None
            return (None, "timeout") if args[0] == second_signature else (tx, None)

        coverage, actual, inspected = events.scan_liquidity(raw, {}, rpc)
        self.assertEqual((coverage["status"], coverage["inspected_count"], actual, inspected),
                         ("partial", 1, [], [SIG]))

        def recovered(method, args):
            if method == "getSignaturesForAddress":
                return rows, None
            self.assertEqual(args[0], second_signature)
            return tx, None

        coverage, _, _ = events.scan_liquidity(raw, {"pool": POOL, "inspected_signatures": inspected}, recovered)
        self.assertEqual((coverage["status"], coverage["inspected_count"]), ("ok", 2))

    def test_outage_and_recovery_preserve_observation_time_and_last_success(self):
        def reading(status, hour):
            return {"mexc_trades": {"status": status, "observed_utc": f"2026-11-11T{hour}:00:00Z"}}

        states, incidents = operations.observe({}, reading("ok", "15"), OBSERVED)
        self.assertFalse(incidents)
        states, incidents = operations.observe({"sources": states}, reading("unavailable", "16"), OBSERVED)
        self.assertEqual(states["mexc_trades"]["last_ok_utc"], "2026-11-11T15:00:00Z")
        previous = {"sources": states, "incidents": incidents}
        self.assertEqual(operations.observe(previous, reading("ok", "15"), OBSERVED), (states, incidents))
        states, incidents = operations.observe(previous, reading("empty", "17"), OBSERVED)
        self.assertEqual([e["to"] for e in incidents], ["empty", "unavailable"])
        self.assertEqual(states["mexc_trades"]["last_ok_utc"], "2026-11-11T17:00:00Z")

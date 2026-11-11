"""REST fallback keeps trade time, 24h statistics and candle finality independent."""
import time
import unittest
from unittest.mock import patch

from src import market_updates as live


class MarketUpdatesTests(unittest.TestCase):
    def setUp(self):
        live.cached_statistics.cache_clear()

    def test_current_trade_and_open_candle_have_their_own_timestamps(self):
        now = 1_800_000_123_456
        step = 900_000
        start = now // step * step
        trade_time = now - 1200
        requests = []

        def ticker(symbol):
            self.assertEqual(symbol, "BTCUSDT")
            return {
                "status": "fresh", "price": 100, "provider_at_utc": live.iso_ms(now - 300_000),
                "retrieved_at_utc": live.iso_ms(now), "change_24h_pct": 4, "volume_24h_usdt": 900
            }

        def fetch(endpoint, params, timeout):
            requests.append((endpoint, params["symbol"]))
            if endpoint == "trades":
                return [
                    {"price": "101", "time": trade_time}, {"price": "99", "time": now - 5000},
                    {"price": "600", "time": now + 10_000}
                ]
            return [
                [start - step, "95", "103", "90", "97", "3", start - 1],
                [start, "97", "104", "96", "101", "2", start + step],
                [start + step, "1", "2", "1", "2", "5", start + step * 2]
            ]

        with patch.object(live, "fetch", side_effect=fetch), patch.object(time, "time", return_value=now / 1000):
            result = live.market_update("btc/usdt", "15m", ticker)
        self.assertEqual(set(requests), {("trades", "BTCUSDT"), ("klines", "BTCUSDT")})
        self.assertEqual(result["quote"]["price"], 101)
        self.assertEqual(result["quote"]["status"], "fresh")
        self.assertEqual(result["quote"]["provider_at_utc"], live.iso_ms(trade_time))
        self.assertEqual(result["quote"]["stats_at_utc"], live.iso_ms(now - 300_000))
        self.assertEqual([row["t"] for row in result["closed"]], [start - step])
        self.assertEqual(result["forming"]["t"], start)
        self.assertEqual(result["forming"]["transport"], "rest")

    def test_ticker_is_a_snapshot_and_stale_trade_keeps_its_time(self):
        now = 1_800_000_123_456

        def ticker(_):
            return {
                "status": "fresh", "price": 100, "provider_at_utc": live.iso_ms(now - 300_000),
                "retrieved_at_utc": live.iso_ms(now), "change_24h_pct": 4
            }

        with patch.object(time, "time", return_value=now / 1000):
            with patch.object(live, "fetch", side_effect=OSError("source offline")):
                snapshot = live.market_update("STAMPUSDT", "1h", ticker)
            with patch.object(live, "fetch", return_value=[{"price": "99", "time": now - 30_000}]):
                trade = live.market_update("STAMPUSDT", "1h", ticker)
        self.assertEqual(snapshot["quote"]["status"], "snapshot")
        self.assertIsNone(snapshot["forming"])
        self.assertEqual(trade["quote"]["status"], "stale")
        self.assertEqual(trade["quote"]["provider_at_utc"], live.iso_ms(now - 30_000))
        with self.assertRaises(ValueError):
            live.market_update("STAMPUSDT", "invented", ticker)


if __name__ == "__main__":
    unittest.main()

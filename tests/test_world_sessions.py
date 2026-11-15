"""Trading-calendar and execution-provenance checks for the world view."""
import datetime as dt
import unittest
from unittest.mock import patch

from src import world_sessions as world


class WorldSessionsTests(unittest.TestCase):
    def test_calendar_respects_weekend_holidays_and_lunch(self):
        def status(when, code):
            return next(item for item in world.session_status(dt.datetime.fromisoformat(when))
                        if item["exchange"] == code)

        self.assertEqual(status("2026-11-15T15:00:00+00:00", "XNYS")["status"], "closed")
        self.assertEqual(status("2026-11-26T15:00:00+00:00", "XNYS")["status"], "closed")
        self.assertEqual(status("2026-11-16T15:00:00+00:00", "XNYS")["status"], "open")
        lunch = status("2026-11-16T04:00:00+00:00", "XSHG")
        self.assertEqual(lunch["status"], "break")
        self.assertEqual(lunch["next_change_utc"], "2026-11-16T05:00:00+00:00")

    def test_execution_totals_are_bounded_samples_and_keep_taker_side(self):
        world.crypto_sample.cache_clear()
        reference = dt.datetime.now(dt.timezone.utc)
        now_ms = int(reference.timestamp() * 1000)
        def rows(venue, pair):
            if venue != "OKX" or pair != "BTCUSDT":
                raise OSError("venue unavailable")
            return [{"id": "buy", "time": now_ms - 1000, "price": "100", "qty": "2", "isBuyerMaker": False},
                    {"id": "sell", "time": now_ms - 2000, "price": "100", "qty": "3", "isBuyerMaker": True},
                    {"id": "old", "time": now_ms - 61000, "price": "100", "qty": "9", "isBuyerMaker": False}]
        with patch.object(world, "venue_trade_rows", side_effect=rows):
            result = world.crypto_sample(now_ms)
        btc = result["assets"][0]
        self.assertEqual((btc["symbol"], btc["buy_usdt"], btc["sell_usdt"], btc["trades"]),
                         ("BTCUSDT", 200.0, 300.0, 2))
        self.assertEqual(btc["venues"], ["OKX"])
        self.assertEqual(result["status"], "ok")
        self.assertIn("geography of participants is unknown", result["scope"])
        world.crypto_sample.cache_clear()


if __name__ == "__main__":
    unittest.main()

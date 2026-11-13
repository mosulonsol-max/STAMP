import datetime as dt
import unittest
from unittest.mock import patch

from src import market_map


class MarketMapTests(unittest.TestCase):
    def setUp(self):
        market_map.pair_window.cache_clear()
        self.now = 1_800_000_000_000
        self.rows = [
            {"t": self.now - index * 60_000, "o": 10, "h": 12, "l": 9, "c": 11, "v": 1}
            for index in range(5, 0, -1)
        ]

    def test_recent_quote_comes_from_same_venue_as_complete_window(self):
        with patch.object(market_map.multi_asset, "venue_candles", side_effect=[[], self.rows]), \
             patch.object(market_map.multi_asset, "venue_ticker", return_value={"lastPrice": "11.5"}) as ticker:
            row = market_map.pair_window("BTCUSDT", "5m", ("MEXC", "OKX"), self.now // 30_000)
        self.assertEqual(row["venue"], "OKX")
        self.assertEqual(row["last_price"], 11.5)
        self.assertEqual(row["price"], 11)
        self.assertEqual(row["price_at_ms"], self.now)
        self.assertIn("quote_received_at", row)
        ticker.assert_called_once_with("OKX", "BTCUSDT")

    def test_quote_failure_preserves_identified_closed_window(self):
        with patch.object(market_map.multi_asset, "venue_candles", return_value=self.rows), \
             patch.object(market_map.multi_asset, "venue_ticker", side_effect=OSError):
            row = market_map.pair_window("BTCUSDT", "5m", ("OKX",), self.now // 30_000)
        self.assertNotIn("last_price", row)
        self.assertEqual(row["price"], 11)

    def test_gap_in_period_is_unavailable(self):
        self.assertIsNone(market_map.summarize(self.rows[:-1], "5m", self.now))

    def test_unverified_supply_does_not_get_a_market_cap(self):
        now = dt.datetime.now(dt.timezone.utc)
        row = {"last_updated": now.isoformat(), "market_cap": 100}
        value = market_map.normalize_valuation(row, row, "Test", now.timestamp())
        self.assertIsNone(value["market_cap_usd"])

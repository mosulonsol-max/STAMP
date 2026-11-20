import datetime as dt
import unittest
from unittest.mock import patch

from src import session_rankings as rankings


class SessionRankingTests(unittest.TestCase):
    def tearDown(self):
        rankings.rank.cache_clear()

    def test_completed_session_excludes_recess_and_next_candle(self):
        now = dt.datetime.fromisoformat("2026-11-20T09:00:00+00:00")
        periods = rankings.periods_for("XHKG", "closed", now)
        self.assertEqual(len(periods), 2)
        def candle(start):
            return [start, "10", "13", "9", "12", "4", start + 299999,
                    "42", 3, "1", "12"]
        rows = [candle(periods[0][0]), candle(periods[0][1]),
                candle(periods[1][0]), candle(periods[1][1])]
        result = rankings.summarize("BTCUSDT", rows, periods)
        self.assertEqual((result["trades"], result["buy_quantity"], result["sell_quantity"]),
                         (6, 2, 6))
        self.assertEqual((result["buy_price"], result["sell_price"], result["volume_usdt"]),
                         (12, 10, 84))

    def test_live_results_rank_by_executed_turnover_and_report_missing_source(self):
        symbols = [f"COIN{i}USDT" for i in range(12)]
        def public(endpoint, **params):
            i = symbols.index(params["symbol"])
            if i == 0:
                raise OSError("feed unavailable")
            return [[0, "1", "1", "1", "1", str(i), 59999, str(i), i, "0", "0"]]
        with patch.object(rankings, "public", side_effect=public), patch.object(
                rankings, "candidates", return_value=symbols):
            result = rankings.rank(((0, 60000),), True)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["covered_count"], 11)
        self.assertEqual([row["volume_usdt"] for row in result["pairs"]],
                         list(range(11, 1, -1)))
        self.assertIsNone(result["pairs"][0]["buy_price"])

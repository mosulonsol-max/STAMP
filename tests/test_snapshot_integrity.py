"""Regression tests for the read-only snapshot integrity gate."""
import json
import tempfile
import unittest
from pathlib import Path
from scripts.check_latest_snapshot import check, MINT

class SnapshotIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "latest.json"
        self.payload = {
            "raw": {
                "contract": MINT,
                "collected_at_utc": "2026-10-31T19:58:39+00:00",
                "mexc": {"ticker": {"data": {"symbol": "STAMPUSDT", "lastPrice": "0.0002668"}}}
            }
        }

    def tearDown(self):
        self.temp.cleanup()

    def validate(self, **kwargs):
        self.path.write_text(json.dumps(self.payload), encoding="utf-8")
        return check(self.path, kwargs.get("max_age_minutes"))

    def test_valid_archived_snapshot(self):
        self.assertEqual([], self.validate())

    def test_wrong_mint_rejected(self):
        self.payload["raw"]["contract"] = "wrong"
        self.assertTrue(any("mint" in x for x in self.validate()))

    def test_missing_ticker_rejected(self):
        self.payload["raw"]["mexc"]["ticker"]["data"] = None
        self.assertTrue(any("ticker" in x for x in self.validate()))

    def test_zero_price_rejected(self):
        self.payload["raw"]["mexc"]["ticker"]["data"]["lastPrice"] = "0"
        self.assertTrue(any("positive" in x for x in self.validate()))

    def test_invalid_json_rejected(self):
        self.path.write_text("{", encoding="utf-8")
        self.assertTrue(check(self.path, None))

    def test_stale_snapshot_rejected_when_requested(self):
        self.assertTrue(any("stale" in x for x in self.validate(max_age_minutes=60)))

if __name__ == "__main__":
    unittest.main()

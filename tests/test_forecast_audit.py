"""Run with PYTHONPATH=src python -m unittest discover -s tests -p 'test_forecast_audit.py'."""
import datetime as dt
import math
import unittest
from multi_asset_governor import audit_records

UTC=dt.timezone.utc
BASE=dt.datetime(2026,11,10,12,tzinfo=UTC)
def record():
    reference=100.0;predicted=101.0;actual=102.0
    return {"id":"BTCUSDT|1h|"+BASE.isoformat(),"pair":"BTCUSDT","frame":"1h",
        "reference_price":reference,"predicted_price":predicted,
        "reference_at_utc":BASE.isoformat(),"due_at_utc":(BASE+dt.timedelta(hours=1)).isoformat(),
        "outcome":{"actual_price":actual,"measured_at_utc":(BASE+dt.timedelta(hours=1)).isoformat(),
            "squared_log_error":math.log(actual/predicted)**2,
            "baseline_squared_log_error":math.log(actual/reference)**2}}

class ForecastAuditTests(unittest.TestCase):
    def test_valid_record(self):
        result=audit_records([record()],BASE+dt.timedelta(hours=2))
        self.assertTrue(result["passed"]);self.assertEqual(result["counts"]["settled"],1)
    def test_duplicate(self):
        r=record();result=audit_records([r,r],BASE+dt.timedelta(hours=2))
        self.assertFalse(result["passed"]);self.assertEqual(result["counts"]["duplicates"],1)
    def test_wrong_horizon(self):
        r=record();r["due_at_utc"]=(BASE+dt.timedelta(hours=2)).isoformat()
        self.assertFalse(audit_records([r],BASE+dt.timedelta(hours=3))["passed"])
    def test_metric_tamper(self):
        r=record();r["outcome"]["squared_log_error"]=0.9
        self.assertEqual(audit_records([r],BASE+dt.timedelta(hours=2))["counts"]["metric_mismatches"],1)
    def test_early_measurement(self):
        r=record();r["outcome"]["measured_at_utc"]=BASE.isoformat()
        self.assertEqual(audit_records([r],BASE+dt.timedelta(hours=2))["counts"]["early_settlements"],1)
    def test_pending(self):
        r=record();r["outcome"]=None
        x=audit_records([r],BASE+dt.timedelta(hours=2))
        self.assertTrue(x["passed"]);self.assertEqual(x["counts"]["pending"],1)
    def test_future_reference(self):
        r=record()
        self.assertEqual(audit_records([r],BASE-dt.timedelta(hours=1))["counts"]["future_issued"],1)

if __name__=="__main__":unittest.main()

"""Autonomous multi-asset governance: no premature approval."""
import datetime as dt,pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import multi_asset_governor as gov
class GovernanceTests(unittest.TestCase):
 def test_empty_journal_has_no_approval(self):
  result=gov.reconcile({"records":[]})
  self.assertEqual(result["approvals"],{})
 def test_unverified_forecast_does_not_become_validated(self):
  now=dt.datetime.now(dt.timezone.utc)
  due=(now-dt.timedelta(hours=1)).isoformat()
  record={"id":"BTCUSDT|1h|test","pair":"BTCUSDT","frame":"1h",
    "reference_at_utc":due,"due_at_utc":due,
    "predicted_price":110.0,"reference_price":100.0,"outcome":None}
  result=gov.reconcile({"records":[record]},now=now)
  self.assertEqual(result["records"][0]["outcome"],None)
  self.assertEqual(result["approvals"]["BTCUSDT|1h"]["status"],"research_only")
  self.assertEqual(result["approvals"]["BTCUSDT|1h"]["prospective_samples"],0)
if __name__=="__main__":unittest.main()

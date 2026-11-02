"""Autonomous multi-asset governance: no premature approval."""
import datetime as dt,pathlib,sys,unittest
from unittest.mock import patch
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
  with patch.object(gov,"candles",return_value=[]):
   result=gov.reconcile({"records":[record]},now=now)
  self.assertEqual(result["records"][0]["outcome"],None)
  self.assertEqual(result["approvals"]["BTCUSDT|1h"]["status"],"research_only")
  self.assertEqual(result["approvals"]["BTCUSDT|1h"]["prospective_samples"],0)
 def test_discovery_rotates_without_a_fixed_coin_allowlist(self):
  import tempfile
  universe={"pairs":[f"ASSET{i:03}USDT" for i in range(100)]}
  with tempfile.TemporaryDirectory() as folder:
   with patch.object(gov,"PATH",pathlib.Path(folder)/"journal.json"),patch.object(gov,"universe",return_value=universe),patch.object(gov,"candles",return_value=[]):
    first=gov.cycle()
    second=gov.cycle()
  self.assertEqual(first["coverage"]["discovered"],100)
  self.assertEqual(first["coverage"]["processed_this_cycle"],48)
  self.assertEqual(first["coverage"]["next_cursor"],48)
  self.assertEqual(second["coverage"]["next_cursor"],96)
  self.assertEqual(len(second["known_pairs"]),100)
 def test_pending_forecasts_are_not_silently_pruned(self):
  now=dt.datetime.now(dt.timezone.utc)
  due=(now+dt.timedelta(days=4)).isoformat()
  rows=[{"id":f"BTCUSDT|1h|{i}","pair":"BTCUSDT","frame":"1h","due_at_utc":due,"reference_price":1,"predicted_price":1,"outcome":None} for i in range(1600)]
  result=gov.reconcile({"records":rows},now=now)
  self.assertEqual(len(result["records"]),1600)
if __name__=="__main__":unittest.main()

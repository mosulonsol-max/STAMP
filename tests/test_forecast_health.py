"""Freshness watchdog must not claim success from pipeline exit codes alone."""
import datetime as dt,json,pathlib,sys,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from forecast_health import assess
class WatchdogTests(unittest.TestCase):
 def test_detects_forecast_stall_with_fresh_market(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);(root/"data").mkdir()
   now=dt.datetime(2026,10,27,2,tzinfo=dt.timezone.utc)
   (root/"data"/"latest.json").write_text(json.dumps({"raw":{"collected_at_utc":(now-dt.timedelta(minutes=2)).isoformat()}}))
   (root/"data"/"forecast_journal.jsonl").write_text(json.dumps({"event":"forecast","created_at_utc":(now-dt.timedelta(hours=3)).isoformat(),"forecast_class":"shadow_unvalidated"})+"\n")
   r=assess(root,now)
   self.assertEqual(r["status"],"degraded")
   self.assertIn("forecast_not_issued_recently",r["reasons"])
   self.assertNotIn("market_snapshot_stale",r["reasons"])
   self.assertFalse(r["model_validated"])
 def test_healthy_issuance_is_not_validated_signal(self):
  with tempfile.TemporaryDirectory() as t:
   root=pathlib.Path(t);(root/"data").mkdir()
   now=dt.datetime(2026,10,27,2,tzinfo=dt.timezone.utc)
   (root/"data"/"latest.json").write_text(json.dumps({"raw":{"collected_at_utc":now.isoformat()}}))
   (root/"data"/"forecast_journal.jsonl").write_text(json.dumps({"event":"forecast","created_at_utc":(now-dt.timedelta(minutes=50)).isoformat(),"forecast_class":"shadow_unvalidated"})+"\n")
   r=assess(root,now)
   self.assertEqual(r["status"],"healthy")
   self.assertFalse(r["model_validated"])
if __name__=="__main__":unittest.main()

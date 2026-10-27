"""Regression tests for delayed GitHub Actions runs and immutable forecast outcomes."""
import datetime as dt,json,pathlib,sys,tempfile,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import forecast_audit,research_engine
UTC=dt.timezone.utc
def stamp(s):return dt.datetime.fromisoformat(s.replace("Z","+00:00"))
def f(fid,due):
 return {"event":"forecast","id":fid,"due_at_utc":due.isoformat(),"reference_price":0.0002,
         "predicted_log_return":0.01,"model_version":"shadow","horizon":"1h"}
class HistoricalRecoveryTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory()
  self.addCleanup(self.tmp.cleanup)
  self.root=pathlib.Path(self.tmp.name)
  (self.root/"data"/"candles").mkdir(parents=True)
  self.journal=self.root/"data"/"forecast_journal.jsonl"
 def save(self,rows):
  self.journal.write_text("".join(json.dumps(x)+"\n" for x in rows))
 def read(self):
  return [json.loads(x) for x in self.journal.read_text().splitlines()]
 def candles(self,rows):
  (self.root/"data"/"candles"/"15m.json").write_text(json.dumps(rows))
 def test_delayed_run_recovers_from_completed_close_not_late_ticker(self):
  due=stamp("2026-10-26T13:02:00Z")
  now=stamp("2026-10-26T13:42:00Z")
  # Candle opens 13:00 and closes 13:15; 13 minutes after target.
  self.candles([{"t":int(stamp("2026-10-26T13:00:00Z").timestamp()*1000),"c":0.00021}])
  self.save([f("a",due),{"event":"outcome","forecast_id":"a","status":"missing_timely_observation"}])
  with patch.object(forecast_audit,"JOURNAL",self.journal):
   forecast_audit.evaluate(self.read(),now,0.0005,self.root)
   outcomes=[x for x in self.read() if x["event"]=="outcome"]
   self.assertEqual(outcomes[-1]["status"],"evaluated_historical")
   self.assertEqual(outcomes[-1]["actual_price"],0.00021)
   self.assertEqual(outcomes[-1]["measurement_offset_seconds"],780)
   self.assertTrue(outcomes[-1]["historical_reconstruction"])
   forecast_audit.evaluate(self.read(),now,0.0005,self.root)
   self.assertEqual(len([x for x in self.read() if x["event"]=="outcome"]),2)
 def test_no_candle_close_after_due_plus_15_minutes_or_in_future(self):
  due=stamp("2026-10-26T13:02:00Z")
  now=stamp("2026-10-26T13:45:00Z")
  self.candles([{"t":int(stamp("2026-10-26T13:15:00Z").timestamp()*1000),"c":0.0003}])
  self.assertIsNone(forecast_audit.historical_close(due,now,self.root))
  self.save([f("a",due)])
  with patch.object(forecast_audit,"JOURNAL",self.journal):
   forecast_audit.evaluate(self.read(),now,0.0005,self.root)
  self.assertEqual(self.read()[-1]["status"],"missing_timely_observation")
 def test_historical_and_live_scores_are_separate_and_recovery_is_not_double_counted(self):
  due=stamp("2026-10-26T13:02:00Z")
  self.save([f("a",due),f("b",due),
   {"event":"outcome","forecast_id":"a","status":"missing_timely_observation"},
   {"event":"outcome","forecast_id":"a","status":"evaluated_historical","absolute_log_error":0.01,
    "baseline_zero_error":0.02,"direction_correct":True},
   {"event":"outcome","forecast_id":"b","status":"evaluated","absolute_log_error":0.03,
    "baseline_zero_error":0.02,"direction_correct":False}])
  result=research_engine.score(self.root)
  self.assertEqual(result["forecasts_total"],2)
  self.assertEqual(result["evaluated_total"],1)
  self.assertEqual(result["evaluated_historical_total"],1)
  self.assertEqual(result["missing_total"],0)
  self.assertEqual(result["evaluation_coverage"],1)
  self.assertEqual(result["models"]["shadow|1h"]["historical_reconstructions"],1)
  self.assertFalse(result["models"]["shadow|1h"]["promotion_eligible"])
if __name__=="__main__":unittest.main()

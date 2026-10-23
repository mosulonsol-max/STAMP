"""Statistical guardrails: uncertainty must remain visible and no weak model is promoted."""
import json,pathlib,sys,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from research_engine import score,wilson_interval
class ForecastConfidenceTests(unittest.TestCase):
 def test_wilson_interval_is_wide_for_small_samples(self):
  low,high=wilson_interval(5,10)
  self.assertLess(low,0.25)
  self.assertGreater(high,0.75)
  self.assertEqual(wilson_interval(0,0),[None,None])
 def test_perfect_small_sample_not_promoted(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/"data").mkdir()
   rows=[]
   for i in range(10):
    fid="f"+str(i)
    rows.append({"event":"forecast","id":fid,"model_version":"test","horizon":"1h"})
    rows.append({"event":"outcome","forecast_id":fid,"status":"evaluated","absolute_log_error":0.001,"baseline_zero_error":0.01,"direction_correct":True})
   rows.append({"event":"forecast","id":"pending","model_version":"test","horizon":"1h"})
   rows.append({"event":"forecast","id":"missing","model_version":"test","horizon":"1h"})
   rows.append({"event":"outcome","forecast_id":"missing","status":"missing_timely_observation"})
   (root/"data"/"forecast_journal.jsonl").write_text("\n".join(json.dumps(x) for x in rows)+"\n")
   result=score(root)
   m=result["models"]["test|1h"]
   self.assertEqual(result["forecasts_total"],12)
   self.assertEqual(result["pending_total"],1)
   self.assertEqual(result["missing_total"],1)
   self.assertEqual(result["evaluated_total"],10)
   self.assertAlmostEqual(result["evaluation_coverage"],10/12)
   self.assertFalse(m["promotion_eligible"])
   self.assertEqual(m["direction_accuracy"],1)
   self.assertLess(m["direction_accuracy_wilson_95"][0],1)
 def test_bad_direction_never_promoted_even_if_mae_is_small(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/"data").mkdir()
   rows=[]
   for i in range(110):
    fid="f"+str(i)
    rows.append({"event":"forecast","id":fid,"model_version":"test","horizon":"1h"})
    rows.append({"event":"outcome","forecast_id":fid,"status":"evaluated","absolute_log_error":0.001,"baseline_zero_error":0.01,"direction_correct":i%2==0})
   (root/"data"/"forecast_journal.jsonl").write_text("\n".join(json.dumps(x) for x in rows)+"\n")
   m=score(root)["models"]["test|1h"]
   self.assertFalse(m["promotion_eligible"])
   self.assertLess(m["direction_accuracy_wilson_95"][0],0.5)
if __name__=="__main__":unittest.main()

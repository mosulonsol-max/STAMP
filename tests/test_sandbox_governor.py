import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
from sandbox_governor import decide
class GovernorTests(unittest.TestCase):
 def test_insufficient_evidence_cannot_promote(self):
  r=decide({"results":[{"id":"x","status":"sandbox_evaluated","test_samples":12,"skill_vs_zero":0.8}]})
  self.assertEqual(r["decisions"][0]["decision"],"needs_more_forward_tests")
  self.assertFalse(r["decisions"][0]["approved_for_production"])
 def test_invalid_results_are_quarantined(self):
  r=decide({"results":[{"id":"x","status":"isolated_failure","test_samples":0}]})
  self.assertEqual(r["decisions"][0]["decision"],"quarantined")

 def test_same_candle_data_waits_without_promoting_or_quarantining(self):
  r=decide({"results":[{"id":"repeat","status":"no_new_candle_evidence","test_samples":0}]})
  d=r["decisions"][0]
  self.assertEqual(d["decision"],"awaiting_new_data")
  self.assertEqual(d["next_action"],"wait_for_new_closed_candle")
  self.assertFalse(d["approved_for_production"])

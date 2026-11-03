"""Regression tests for autonomous causal selection."""
import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
from autonomous_selector import choose_candidate

class SelectorTests(unittest.TestCase):
 def test_prefers_lower_error(self):
  winner,audit=choose_candidate([1.0]*30,{"no_change":[0.0]*30,"accurate":[1.0]*30})
  self.assertEqual(winner,"accurate")
  self.assertFalse(audit["approved"])
 def test_recent_regime_shift(self):
  y=[0.01]*30+[1.0]*30
  winner,audit=choose_candidate(y,{"no_change":[0.0]*60,"adaptive":[0.01]*30+[1.0]*30})
  self.assertEqual(winner,"adaptive")
  self.assertGreater(audit["volatility_ratio"],2)
 def test_invalid_predictions_rejected(self):
  winner,_=choose_candidate([0.0]*20,{"no_change":[0.0]*20,"bad":[float("nan")]*20})
  self.assertEqual(winner,"no_change")
 def test_tie_favors_baseline(self):
  winner,_=choose_candidate([0.0]*20,{"other":[0.0]*20,"no_change":[0.0]*20})
  self.assertEqual(winner,"no_change")
if __name__=="__main__":unittest.main()

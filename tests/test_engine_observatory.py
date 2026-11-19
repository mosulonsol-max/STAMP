"""The observatory must describe saved computations without inventing evidence."""
import math,pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'src'))
from engine_observatory import summarize
class EngineObservatoryTests(unittest.TestCase):
 def record(self,**changes):
  r=dict(id='BTCUSDT|1h|2026-11-19T12:00:00+00:00',pair='BTCUSDT',frame='1h',reference_price=100,predicted_price=100*math.exp(.01),reference_at_utc='2026-11-19T12:00:00+00:00',due_at_utc='2026-11-19T13:00:00+00:00',model_version='causal_6_return_momentum',features={'recent_returns':[.01]*20},outcome=None)
  r.update(changes);return r
 def test_recomputes_original_record_and_excludes_other_pairs(self):
  result=summarize({'records':[self.record(),self.record(pair='ETHUSDT')]},'BTCUSDT',{'storage':'postgres'})
  self.assertEqual(result['coverage']['pair_records'],1)
  self.assertTrue(result['latest']['1h']['calculation']['matches_recorded'])
  self.assertEqual(result['latest']['1h']['inputs']['lookback'],6)
  self.assertFalse(result['trading_approved'])
 def test_missing_features_never_imply_verified_calculation(self):
  result=summarize({'records':[self.record(features={})]},'BTCUSDT')
  self.assertFalse(result['latest']['1h']['inputs']['available'])
  self.assertIsNone(result['latest']['1h']['calculation']['matches_recorded'])
 def test_selected_model_uses_recorded_version_not_current_selection(self):
  r=self.record(model_version='momentum_20',features={'recent_returns':[.02]*14+[.01]*6})
  result=summarize({'records':[r],'model_selections':{'BTCUSDT|1h':{'version':'momentum_3'}}},'BTCUSDT')
  self.assertEqual(result['latest']['1h']['inputs']['lookback'],20)
  self.assertFalse(result['latest']['1h']['calculation']['matches_recorded'])
 def test_empty_archive_has_no_synthetic_forecast(self):
  result=summarize({},'STAMPUSDT')
  self.assertEqual(result['latest'],{})
  self.assertEqual(result['recent_outcomes'],[])
  self.assertEqual(result['coverage']['pair_records'],0)
if __name__=='__main__':unittest.main()

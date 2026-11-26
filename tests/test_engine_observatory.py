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
 def test_early_outcome_is_excluded_from_verified_history(self):
  result=summarize({'records':[self.record(outcome={'actual_price':100,
      'measured_at_utc':'2026-11-19T12:30:00+00:00','squared_log_error':.0001,
      'baseline_squared_log_error':0})]},'BTCUSDT')
  self.assertEqual(result['coverage']['pair_records'],1)
  self.assertEqual(result['coverage']['settled'],0)
  self.assertEqual(result['coverage']['invalid_outcomes'],1)
  self.assertEqual(result['recent_outcomes'],[])
 def test_target_rate_uses_only_verified_same_model_outcomes(self):
  import datetime as dt
  start=dt.datetime(2026,11,1,tzinfo=dt.timezone.utc)
  rows=[]
  for i in range(30):
   at=start+dt.timedelta(hours=i)
   due=at+dt.timedelta(hours=1)
   actual=100 if i<21 else 102
   error=math.log(actual/100)**2
   rows.append(self.record(id=str(i),reference_at_utc=at.isoformat(),due_at_utc=due.isoformat(),
       predicted_price=100,outcome={'actual_price':actual,'measured_at_utc':due.isoformat(),
         'squared_log_error':error,'baseline_squared_log_error':error}))
  model='causal_6_return_momentum'
  self.assertIsNone(summarize({'records':rows[:-1]},'BTCUSDT')['target_rates']['1h'][model]['rate'])
  result=summarize({'records':rows},'BTCUSDT')
  rate=result['target_rates']['1h'][model]
  self.assertEqual({key:rate[key] for key in ('hits','samples','rate')},{'hits':21,'samples':30,'rate':.7})
  self.assertEqual(rate['direction_accuracy'],.7)
  self.assertEqual(result['scene_outcomes'][-1]['id'],'29')
 def test_empty_archive_has_no_synthetic_forecast(self):
  result=summarize({},'STAMPUSDT')
  self.assertEqual(result['latest'],{})
  self.assertEqual(result['recent_outcomes'],[])
  self.assertEqual(result['coverage']['pair_records'],0)
if __name__=='__main__':unittest.main()

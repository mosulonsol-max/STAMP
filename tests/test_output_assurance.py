import copy,datetime as dt,pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'src'))
from output_assurance import assess,HOURS
class AssuranceTests(unittest.TestCase):
 def setUp(self):
  self.now=dt.datetime(2026,10,30,10,tzinfo=dt.timezone.utc);self.payload={'forecasts':{},'model_decisions':{}}
  for h,hours in HOURS.items():
   f={'created_at_utc':(self.now-dt.timedelta(minutes=1)).isoformat(),'reference_at_utc':self.now.isoformat(),'due_at_utc':(self.now+dt.timedelta(hours=hours)).isoformat(),'horizon':h,'reference_price':1.,'predicted_price':1.,'predicted_log_return':0.,'model_version':'version_'+h}
   f['created_at_utc']=self.now.isoformat()
   self.payload['forecasts'][h]={'forecast':f}
   m=dict(samples=120,direction_samples=120,skill_vs_zero=.2,direction_wilson_95=[.6,.8])
   self.payload['model_decisions'][h]=dict(status='approved',automatic=True,engine='internal_model_governor_v1',model_version=f['model_version'],decided_at_utc=self.now.isoformat(),forward_validation=m.copy(),prospective=m.copy(),reason_codes=[])
 def test_approved_single_pair_never_approves_all_pairs(self):
  r=assess(self.payload,self.now);self.assertEqual(r['production_status'],'healthy');self.assertEqual(r['horizons']['1h']['predictive_validity'],'approved_research');self.assertFalse(r['rollout']['ready'])
 def test_live_quote_cannot_refresh_stale_model(self):
  p=copy.deepcopy(self.payload);p['live_quote']={'status':'fresh','retrieved_at_utc':self.now.isoformat()}
  d=p['model_decisions']['1h'];d['decided_at_utc']=(self.now-dt.timedelta(hours=3)).isoformat()
  r=assess(p,self.now);self.assertEqual(r['production_status'],'degraded');self.assertIn('model_decision_stale',r['horizons']['1h']['issues'])
 def test_false_approval_cannot_bypass_evidence(self):
  self.payload['model_decisions']['1h']['prospective']['samples']=0
  h=assess(self.payload,self.now)['horizons']['1h'];self.assertNotEqual(h['predictive_validity'],'approved_research');self.assertIn('approval_evidence_inconsistent',h['issues'])
 def test_corrupt_values_and_causal_target_rejected(self):
  f=self.payload['forecasts']['4h']['forecast'];f['predicted_price']=float('nan');f['due_at_utc']=self.now.isoformat()
  h=assess(self.payload,self.now)['horizons']['4h'];self.assertIn('invalid_forecast_values',h['issues']);self.assertIn('invalid_forecast_timestamps',h['issues']);self.assertIn('incorrect_target_horizon',h['issues'])
 def test_failed_quality_and_unmeasured_results_visible(self):
  self.payload['model_decisions']['1h'].update(status='experimental',reason_codes=['forward_error_not_better_than_baseline'])
  self.payload['forecast_review']={'rows':[{'due_utc':(self.now-dt.timedelta(hours=2)).isoformat(),'actual_price':None}]}
  r=assess(self.payload,self.now);self.assertEqual(r['horizons']['1h']['predictive_validity'],'failed_evidence');self.assertEqual(r['overdue_unverified_in_recent_journal'],1);self.assertEqual(r['production_status'],'degraded')

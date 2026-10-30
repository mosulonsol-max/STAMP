"""The program must promote, demote and reject contaminated evidence itself."""
import copy,datetime as dt,json,math,pathlib,sys,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from model_governor import decide,govern,journal_metrics
from market_overview import summarize,CONTRACT

class AutomaticDecisions(unittest.TestCase):
 def setUp(self):
  self.now=dt.datetime(2026,10,30,12,tzinfo=dt.timezone.utc)
  self.report=dict(horizon='1h',selected_model='test',validation_samples=120,asof_candle_close_ms=int(self.now.timestamp()*1000),
   promotion_gate=dict(min_validation_samples=100,min_mae_improvement_vs_zero=.1,wilson_95_lower_direction_accuracy_gt=.5),
   challengers={'test':dict(skill_vs_zero=.3,direction_wilson_95=[.6,.8],direction_samples=120)},forecast={'model_version':'test_v1'})
 def evidence(self,count=110,horizon='1h',overlap=False,approximate=False):
  events=[];hours=4 if horizon=='4h' else 1
  start=self.now-dt.timedelta(hours=count*hours+10)
  for i in range(count):
   reference=start+dt.timedelta(hours=i if overlap else i*hours);due=reference+dt.timedelta(hours=hours)
   events.append(dict(event='forecast',id=str(i),model_version='test_v1',horizon=horizon,reference_at_utc=reference.isoformat(),created_at_utc=(reference+dt.timedelta(minutes=1)).isoformat(),due_at_utc=due.isoformat(),reference_price=1,predicted_log_return=.02))
   events.append(dict(event='outcome',forecast_id=str(i),status='evaluated_historical',measurement_time_utc=(due+dt.timedelta(minutes=5 if approximate else 0)).isoformat(),price_source='MEXC_15m_completed_candle',actual_price=math.exp(.021)))
  return events
 def test_program_promotes_from_independent_prospective_results(self):
  decision=decide(self.report,self.evidence(),self.now)
  self.assertEqual(decision['status'],'approved');self.assertTrue(decision['automatic'])
  self.assertEqual(decision['prospective']['samples'],110)
 def test_program_demotes_and_records_transition_after_performance_drops(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory)
   good=govern({'1h':self.report},self.evidence(),root,self.now)
   changed=copy.deepcopy(self.report);changed['challengers']['test']['skill_vs_zero']=-.2
   bad=govern({'1h':changed},self.evidence(),root,self.now)
   self.assertEqual(good['1h']['status'],'approved');self.assertEqual(bad['1h']['status'],'experimental')
   transitions=[json.loads(x) for x in (root/'data/model_decisions.jsonl').read_text().splitlines()]
   self.assertEqual(transitions[-1]['from_status'],'approved');self.assertEqual(transitions[-1]['to_status'],'experimental')
   registry=json.loads((root/'data/model_registry.json').read_text());self.assertFalse(registry['manual_override_available'])
 def test_approximate_or_mismatched_model_outcomes_cannot_promote(self):
  approximate=decide(self.report,self.evidence(approximate=True),self.now)
  self.assertEqual(approximate['status'],'experimental');self.assertEqual(approximate['prospective']['samples'],0)
  report=copy.deepcopy(self.report);report['forecast']['model_version']='other_model'
  self.assertEqual(decide(report,self.evidence(),self.now)['status'],'experimental')
 def test_overlapping_long_horizon_outcomes_are_not_independent_trials(self):
  report=copy.deepcopy(self.report);report['horizon']='4h'
  decision=decide(report,self.evidence(horizon='4h',overlap=True),self.now)
  self.assertLess(decision['prospective']['samples'],100);self.assertEqual(decision['status'],'experimental')
 def test_stale_future_and_nonfinite_inputs_fail_approval(self):
  for value in (float('nan'),int((self.now-dt.timedelta(hours=3)).timestamp()*1000),int((self.now+dt.timedelta(hours=1)).timestamp()*1000)):
   report=copy.deepcopy(self.report);report['asof_candle_close_ms']=value
   self.assertEqual(decide(report,self.evidence(),self.now)['status'],'experimental')
  report=copy.deepcopy(self.report);report['challengers']['test']['skill_vs_zero']=float('nan')
  self.assertEqual(decide(report,self.evidence(),self.now)['status'],'experimental')

class OverviewMetrics(unittest.TestCase):
 def test_liquidity_deduplicates_contract_pools_and_does_not_substitute_fdv(self):
  pool=dict(chainId='solana',pairAddress='pool',baseToken={'address':CONTRACT},quoteToken={'address':'SOL'},liquidity={'usd':123},fdv=9000)
  wrong=dict(pool,pairAddress='wrong',baseToken={'address':'WRONG'})
  summary=summarize([pool,pool,wrong],'2026-10-30T00:00:00Z')
  self.assertEqual(summary['liquidity_usd'],123);self.assertIsNone(summary['market_cap_usd']);self.assertEqual(summary['pools'],1)
 def test_market_cap_is_taken_only_from_exact_base_mint(self):
  pool=dict(chainId='solana',pairAddress='pool',baseToken={'address':'SOL'},quoteToken={'address':CONTRACT},liquidity={'usd':123},marketCap=9000)
  self.assertIsNone(summarize([pool])['market_cap_usd'])

if __name__=='__main__':unittest.main()

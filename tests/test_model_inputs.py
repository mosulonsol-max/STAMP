import datetime as dt,json,pathlib,sys,tempfile,unittest,math
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'src'))
from model_inputs import Inputs,extract,capture,GROUPS,NAMES,SCHEMA,CONTRACT,HOUR
from context_prediction import score,rows_for
import evidence_sources
class InputTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);(self.root/'data').mkdir()
  self.cut=1793322000000
  self.cs=[dict(t=self.cut-(40-i)*HOUR,o=1.,h=1.1,l=.9,c=1.,v=10.) for i in range(40)]
 def tearDown(self):self.temp.cleanup()
 def write(self,rows,name='model_input_events.jsonl'):(self.root/'data'/name).write_text(''.join(json.dumps(x)+'\n' for x in rows))
 def event(self,group='dex',available=None,observed=None,**values):return dict(contract=CONTRACT,schema=SCHEMA,group=group,available_ms=self.cut if available is None else available,observed_ms=self.cut if observed is None else observed,values=values,status='measured',id='x')
 def cell(self,vector,name):return vector[NAMES.index(name)],vector[NAMES.index(name)+1]
 def test_future_availability_and_stale_observation_never_backfill(self):
  self.write([self.event(available=self.cut+1,liquidity_log=9)])
  self.assertEqual(self.cell(Inputs(self.root).vector(self.cs,39),'dex.liquidity_log'),(0,0))
  self.write([self.event(observed=self.cut-3600001,liquidity_log=9)])
  self.assertEqual(self.cell(Inputs(self.root).vector(self.cs,39),'dex.liquidity_log'),(0,0))
 def test_measured_zero_differs_from_missing_and_other_mint(self):
  self.write([self.event(liquidity_log=0)])
  self.assertEqual(self.cell(Inputs(self.root).vector(self.cs,39),'dex.liquidity_log'),(0,1))
  event=self.event(liquidity_log=7);event['contract']='wrong';self.write([event])
  self.assertEqual(self.cell(Inputs(self.root).vector(self.cs,39),'dex.liquidity_log'),(0,0))
 def test_context_reconstruction_excludes_future_and_gaps(self):
  folder=self.root/'data/context_candles';folder.mkdir();bars=[dict(c) for c in self.cs];bars[-1]['c']=2
  (folder/'BTC.json').write_text(json.dumps(bars+[dict(t=self.cut,c=999)]))
  vector=Inputs(self.root).vector(self.cs,39);value,mask=self.cell(vector,'market.BTC_return_1h');self.assertAlmostEqual(value,math.log(2));self.assertEqual(mask,1)
  (folder/'BTC.json').write_text(json.dumps(bars[:-2]+bars[-1:]));self.assertEqual(self.cell(Inputs(self.root).vector(self.cs,39),'market.BTC_return_1h'),(0,0))
 def test_capture_is_idempotent_and_unverified_repository_is_excluded(self):
  stamp=dt.datetime.fromtimestamp(self.cut/1000,dt.timezone.utc).isoformat()
  snap={'raw':{'contract':CONTRACT,'project':{'retrieved_at_utc':stamp,'data':[{'message':'bullish'}]}},'analysis':{'news':{'repository_attribution':'unverified_against_contract'}}}
  (self.root/'data/latest.json').write_text(json.dumps(snap));now=dt.datetime.fromtimestamp((self.cut+1000)/1000,dt.timezone.utc)
  self.assertGreater(capture(self.root,now),0);self.assertEqual(capture(self.root,now),0)
  self.assertEqual(Inputs(self.root).inventory(self.cut+1000)['project']['status'],'missing')
 def test_error_feedback_requires_outcome_available_before_feature(self):
  def iso(t):return dt.datetime.fromtimestamp(t/1000,dt.timezone.utc).isoformat()
  f={'event':'forecast','id':'f','horizon':'1h','model_version':'context_walk_forward_v3_test','reference_at_utc':iso(self.cut-2*HOUR),'created_at_utc':iso(self.cut-2*HOUR+1000),'due_at_utc':iso(self.cut-HOUR),'reference_price':1,'predicted_log_return':.1}
  o={'event':'outcome','forecast_id':'f','status':'evaluated','measurement_time_utc':iso(self.cut-HOUR),'evaluated_at_utc':iso(self.cut+1),'actual_price':math.exp(.2)}
  self.write([f,o],'forecast_journal.jsonl');self.assertEqual(Inputs(self.root).feedback(self.cut)[1],0)
  o['evaluated_at_utc']=iso(self.cut);self.write([f,o],'forecast_journal.jsonl');values,n=Inputs(self.root).feedback(self.cut);self.assertEqual(n,1);self.assertAlmostEqual(values['recent_log_mae'],.1)
 def test_provider_failure_uses_bounded_previous_observation(self):
  good=self.event(available=self.cut-1000,observed=self.cut-1000,liquidity_log=5);bad=self.event();bad['status']='unavailable';self.write([good,bad])
  row,reason=Inputs(self.root).at('dex',self.cut);self.assertEqual(row['values']['liquidity_log'],5);self.assertIn('prior_valid',reason)
 def test_rpc_falls_back_without_returning_private_credentials(self):
  class Response:
   def raise_for_status(self):pass
   def json(self):return {'result':{'value':1}}
  with patch.object(evidence_sources.requests,'post',side_effect=[TimeoutError('private-token'),Response()]):
   value,error=evidence_sources.rpc('getTokenSupply',[CONTRACT]);self.assertEqual(value,{'value':1});self.assertIsNone(error)
 def test_no_change_can_win_without_fake_direction_accuracy(self):
  result=score([.1,-.1],[0,0]);self.assertIsNone(result['direction_accuracy']);self.assertFalse(result['eligible']);self.assertEqual(result['skill_vs_zero'],0)
 def test_news_text_is_separated_by_verification_and_future_is_excluded(self):
  stamp=dt.datetime.fromtimestamp(self.cut/1000,dt.timezone.utc).isoformat()
  mention={'query_contract':CONTRACT,'title':'new liquidity market','first_seen_at_utc':stamp,'publication_at_utc':stamp}
  snap={'raw':{'contract':CONTRACT},'analysis':{'news':{'status':'partial','retrieved_at_utc':stamp,'verified_causal_events':[],'discovery':{'status':'searched','mentions':[mention]}}}}
  row=next(r for r in extract(snap,stamp) if r['group']=='news')
  self.assertTrue(any(row['values']['discovery_text_'+str(i)]>0 for i in range(8)))
  self.assertTrue(all(row['values']['verified_text_'+str(i)] is None for i in range(8)))
  mention['first_seen_at_utc']=dt.datetime.fromtimestamp((self.cut+1000)/1000,dt.timezone.utc).isoformat()
  row=next(r for r in extract(snap,stamp) if r['group']=='news');self.assertEqual(row['values']['unverified_mentions_24h_log'],0)
 def test_source_drops_zero_both_value_and_mask(self):
  self.write([self.event(liquidity_log=9)])
  self.assertEqual(self.cell(Inputs(self.root).vector(self.cs,39,drop='dex'),'dex.liquidity_log'),(0,0))

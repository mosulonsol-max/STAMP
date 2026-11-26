import pathlib,sys,unittest
from unittest.mock import patch,MagicMock
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'src'))
import research_storage as storage
class ResearchStorageTests(unittest.TestCase):
 def test_pair_views_preserve_evidence_without_other_pairs_or_global_decisions(self):
  a={'id':'BTCUSDT|1h|a','pair':'BTCUSDT','features':{'recent_returns':[.01]*20},'outcome':{'actual_price':100}}
  b={'id':'ETHUSDT|1h|b','pair':'ETHUSDT','outcome':None}
  state={'records':[a,b],'validation':{'BTCUSDT|1h':{'status':'research_only'},'ETHUSDT|1h':{}},'autonomous_review':{'checked_at_utc':'now','decisions':{a['id']:{'status':'accepted'},b['id']:{'status':'pending'}}},'venue_evidence':{'pairs':{'BTCUSDT':{'MEXC':1},'ETHUSDT':{'OKX':2}}}}
  views=dict(storage.pair_states(state));btc=views['BTCUSDT']
  self.assertEqual(btc['records'],[a]);self.assertEqual(btc['archive_records_total'],2)
  self.assertEqual(set(btc['autonomous_review']['decisions']),{a['id']})
  self.assertEqual(set(btc['validation']),{'BTCUSDT|1h'})
  self.assertEqual(set(btc['venue_evidence']['pairs']),{'BTCUSDT'})
  decoded=storage.decode_state(storage.encode_state(btc))
  returns=decoded['records'][0]['features']['recent_returns']
  self.assertEqual(list(returns),a['features']['recent_returns'])
  decoded['records'][0]['features']['recent_returns']=list(returns)
  self.assertEqual(decoded,btc)
 def test_http_pair_read_never_decodes_global_archive(self):
  import os
  c=MagicMock();c.execute.side_effect=[MagicMock(fetchone=lambda:('research_pair_state',)),MagicMock(fetchone=lambda:(storage.encode_state({'records':[]}),))]
  client=MagicMock();client.connect.return_value.__enter__.return_value=c
  with patch.dict(os.environ,{'DATABASE_URL':'postgres://test'}),patch.dict(sys.modules,{'psycopg':client}):
   self.assertEqual(storage.load_pair('BTCUSDT'),{'records':[]})
  queries=' '.join(call.args[0] for call in c.execute.call_args_list)
  self.assertNotIn('research_state_compact',queries)
  self.assertIn('WHERE pair=%s',queries)
 def test_unknown_pair_does_not_load_global_archive(self):
  import os
  c=MagicMock();c.execute.side_effect=[MagicMock(fetchone=lambda:('research_pair_state',)),MagicMock(fetchone=lambda:None)]
  client=MagicMock();client.connect.return_value.__enter__.return_value=c
  with patch.dict(os.environ,{'DATABASE_URL':'postgres://test'}),patch.dict(sys.modules,{'psycopg':client}):
   self.assertEqual(storage.load_pair('UNKNOWNUSDT'),{'records':[]})
 def test_streaming_archive_rejects_nan(self):
  with self.assertRaises(ValueError):storage.encode_state({'records':[{'price':float('nan')}]})
if __name__=='__main__':unittest.main()

import pathlib,sys,io,json,unittest
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'src'))
import market_gateway as gateway
class MarketGatewayTests(unittest.TestCase):
 def test_gateway_rejects_wrong_symbol_or_venue(self):
  for result in ({'symbol':'ETHUSDT','venue':'MEXC'},{'symbol':'BTCUSDT','venue':'OKX'}):
   with patch.object(gateway,'urlopen',return_value=io.BytesIO(json.dumps(result).encode())):
    with self.assertRaises(ValueError):gateway.fetch_gateway('snapshot','BTCUSDT','MEXC')
 def test_requested_venue_is_kept_during_regional_failure(self):
  with patch.object(gateway,'fetch_gateway',side_effect=OSError('gateway unavailable')),patch.object(gateway.assets,'snapshot',return_value={'venue':'OKX'}) as local:
   self.assertEqual(gateway.snapshot('BTCUSDT','OKX')['venue'],'OKX')
  local.assert_called_once_with('BTCUSDT','OKX')
 def test_worker_catalog_restores_pairs_missing_from_frontend_region(self):
  local={'venues':{'BTCUSDT':['OKX']},'sources':{'MEXC':{'status':'unavailable','count':0}}}
  remote={'venues':{'STAMPUSDT':['MEXC'],'BTCUSDT':['MEXC']},'sources':{'MEXC':{'status':'ok','count':2}}}
  with patch.object(gateway.assets,'dashboard_universe',return_value=local),patch.object(gateway,'fetch_gateway',return_value=remote):d=gateway.catalog()
  self.assertEqual(d['pairs'],['BTCUSDT','STAMPUSDT'])
  self.assertEqual(d['venues']['BTCUSDT'],['MEXC','OKX'])
  self.assertEqual(d['sources']['MEXC']['status'],'ok')
if __name__=='__main__':unittest.main()

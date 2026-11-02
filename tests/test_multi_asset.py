"""Contract tests for the multi-currency research backend."""
import pathlib,sys,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import multi_asset as assets
class MultiAssetTests(unittest.TestCase):
 def test_validation_rejects_unbounded_or_non_usdt_symbols(self):
  self.assertEqual(assets.symbol("btc/usdt"),"BTCUSDT")
  for bad in ("BTCUSD","../BTCUSDT","", "BTCUSDT?x=1"):
   with self.assertRaises(ValueError):assets.symbol(bad)
 def test_exactly_aligned_hourly_returns_do_not_imply_causality(self):
  a=[{"t":i*3600000,"c":100+i,"o":100+i,"h":100+i,"l":100+i,"v":1} for i in range(100)]
  b=[dict(c={**x}) for x in []]
  with patch.object(assets,"candles",side_effect=lambda pair:a):
   res=assets.compare("BTCUSDT","ETHUSDT")
  self.assertEqual(res["hourly_samples"],99)
  self.assertEqual(res["lead_lag_hours"]["0"]["samples"],99)
  self.assertAlmostEqual(res["correlation"],1.0)
  self.assertIn("not evidence of causation",res["interpretation"])
 def test_selected_asset_uses_isolated_timeframes(self):
  with patch.object(assets,"fetch",return_value={"symbol":"BTCUSDT","lastPrice":"100"}),patch.object(assets,"candles",return_value=[{"t":0,"o":1,"h":1,"l":1,"c":1,"v":1}]):
   result=assets.snapshot("BTCUSDT")
  self.assertEqual(set(result["candles"]),{"15m","1h","4h","1d"})
  self.assertEqual(result["symbol"],"BTCUSDT")
if __name__=="__main__":unittest.main()

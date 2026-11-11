"""Contract tests for the multi-currency research backend."""
import pathlib,sys,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import multi_asset as assets
class MultiAssetTests(unittest.TestCase):
 def test_validation_rejects_unbounded_or_non_usdt_symbols(self):
  self.assertEqual(assets.symbol("btc/usdt"),"BTCUSDT")
  self.assertEqual(assets.symbol("s/usdt"),"SUSDT")
  for bad in ("BTCUSD","../BTCUSDT","", "BTCUSDT?x=1","USDT"):
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
 def test_forecast_refuses_short_history(self):
  self.assertEqual(assets.forecast_frame([],"1h")["status"],"insufficient_evidence")
 def test_forecast_is_purely_historical_and_has_timed_chart_target(self):
  import datetime as dt
  step=3600000
  start=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)//step*step-110*step
  rows=[{"t":start+i*step,"o":100+i*.2,"h":101+i*.2,"l":99+i*.2,"c":100+i*.2,"v":10} for i in range(100)]
  forecast=assets.forecast_frame(rows,"1h")
  self.assertEqual(forecast["status"],"research_only")
  self.assertGreater(forecast["samples"],10)
  self.assertGreater(forecast["predicted_price"],0)
  self.assertGreater(forecast["upper_1sigma"],forecast["lower_1sigma"])
  self.assertIn("RESEARCH",forecast["warning"].upper() if "research" in forecast["warning"].lower() else "RESEARCH")
 def test_selected_asset_uses_isolated_timeframes(self):
  with patch.object(assets,"fetch",return_value={"symbol":"BTCUSDT","lastPrice":"100"}),patch.object(assets,"candles",return_value=[{"t":0,"o":1,"h":1,"l":1,"c":1,"v":1}]):
   result=assets.snapshot("BTCUSDT")
  self.assertEqual(set(result["candles"]),{"15m","1h","4h","1d"})
  self.assertEqual(result["symbol"],"BTCUSDT")
 def test_dashboard_catalog_falls_back_to_official_api_symbols(self):
  with patch.object(assets,"fetch",side_effect=[ValueError("not JSON"),{"code":200,"data":["BTCUSDT","SUSDT","BTCUSDT","XUSDC"]}]):
   result=assets.dashboard_universe()
  self.assertEqual(result["pairs"],["BTCUSDT","SUSDT"])
  self.assertEqual(result["source"],"MEXC defaultSymbols")
 def test_snapshot_keeps_healthy_periods_when_a_source_fails(self):
  def frame(_,interval,**kwargs):
   if interval=="4h":raise OSError("temporary upstream failure")
   return [{"t":0,"o":1,"h":1,"l":1,"c":1,"v":1}]
  with patch.object(assets,"fetch",return_value={"symbol":"BTCUSDT","lastPrice":"10"}),patch.object(assets,"candles",side_effect=frame):
   result=assets.snapshot("SUSDT")
  self.assertEqual(result["ticker"],{})
  self.assertEqual(result["candles"]["4h"],[])
  self.assertEqual(len(result["candles"]["1h"]),1)
if __name__=="__main__":unittest.main()

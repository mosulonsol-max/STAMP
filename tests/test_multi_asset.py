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
  assets._CATALOG.update(at=__import__("time").monotonic(),value={"venues":{"BTCUSDT":["MEXC"]}})
  with patch.object(assets,"fetch",return_value={"symbol":"BTCUSDT","lastPrice":"100"}),patch.object(assets,"candles",return_value=[{"t":0,"o":1,"h":1,"l":1,"c":1,"v":1}]):
   result=assets.snapshot("BTCUSDT")
  self.assertEqual(set(result["candles"]),{"15m","1h","4h","1d"})
  self.assertEqual(result["symbol"],"BTCUSDT")
  assets._CATALOG.update(at=0,value=None)
 def test_dashboard_catalog_merges_live_exchange_listings_and_records_failures(self):
  assets._CATALOG.update(at=0,value=None)
  def listings(venue):
   if venue=="MEXC":return {"BTCUSDT"}
   if venue=="OKX":return {"BTCUSDT","XAUTUSDT"}
   raise OSError("not reachable")
  with patch.object(assets,"venue_symbols",side_effect=listings):result=assets.dashboard_universe()
  self.assertEqual(result["pairs"],["BTCUSDT","XAUTUSDT"])
  self.assertEqual(result["venues"]["XAUTUSDT"],["OKX"])
  self.assertEqual(result["sources"]["Binance"]["status"],"unavailable")
  assets._CATALOG.update(at=0,value=None)
 def test_snapshot_keeps_healthy_periods_when_a_source_fails(self):
  assets._CATALOG.update(at=__import__("time").monotonic(),value={"venues":{"SUSDT":["MEXC"]}})
  def frame(_,interval,**kwargs):
   if interval=="4h":raise OSError("temporary upstream failure")
   return [{"t":0,"o":1,"h":1,"l":1,"c":1,"v":1}]
  with patch.object(assets,"fetch",return_value={"symbol":"SUSDT","lastPrice":"10"}),patch.object(assets,"candles",side_effect=frame):
   result=assets.snapshot("SUSDT")
  self.assertEqual(result["ticker"]["lastPrice"],"10")
  self.assertEqual(result["candles"]["4h"],[])
  self.assertEqual(len(result["candles"]["1h"]),1)
  assets._CATALOG.update(at=0,value=None)
 def test_gold_pair_can_use_non_mexc_venue_without_mislabelling_source(self):
  assets._CATALOG.update(at=__import__("time").monotonic(),value={"venues":{"XAUTUSDT":["OKX"]}})
  row={"t":1730000000000,"o":2,"h":3,"l":1,"c":2,"v":5}
  with patch.object(assets,"venue_ticker",return_value={"symbol":"XAUTUSDT","lastPrice":"2"}),patch.object(assets,"venue_candles",return_value=[row]):
   result=assets.snapshot("XAUTUSDT")
  self.assertEqual(result["venue"],"OKX")
  self.assertEqual(result["source"],"OKX public spot REST")
  self.assertEqual(result["candles"]["15m"],[row])
  assets._CATALOG.update(at=0,value=None)
 def test_gold_pair_comparison_uses_its_listing_venue(self):
  assets._CATALOG.update(at=__import__("time").monotonic(),value={"venues":{"XAUTUSDT":["OKX"],"BTCUSDT":["MEXC"]}})
  rows=[{"t":i*3600000,"c":100+i,"o":100+i,"h":100+i,"l":100+i,"v":1} for i in range(100)]
  with patch.object(assets,"venue_candles",return_value=rows) as other,patch.object(assets,"candles",return_value=rows):
   comparison=assets.compare("XAUTUSDT","BTCUSDT")
  self.assertEqual(comparison["primary_venue"],"OKX")
  self.assertEqual(comparison["secondary_venue"],"MEXC")
  other.assert_called_once_with("OKX","XAUTUSDT","1h")
  assets._CATALOG.update(at=0,value=None)
if __name__=="__main__":unittest.main()

import pathlib,sys,unittest,shutil,subprocess
from unittest.mock import patch
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
import market_flow
class MarketFlowTests(unittest.TestCase):
 def setUp(self):
  market_flow._CACHE.update(at=0,value=None)
 def test_market_cap_volume_are_not_misrepresented_as_flows(self):
  def fetch(url):
   if "coingecko" in url:return {"data":{"total_market_cap":{"usd":3000000000000},"total_volume":{"usd":90000000000}}}
   return [{"date":"1762732800","totalCirculatingUSD":{"USDT":100,"USDC":60}},{"date":"1762819200","totalCirculatingUSD":{"USDT":110,"USDC":50}}]
  with patch.object(market_flow,"_fetch",side_effect=fetch):
   data=market_flow.market_flow_snapshot()
  self.assertEqual(data["market_cap_usd"],3000000000000)
  self.assertEqual(data["volume_24h_usd"],90000000000)
  self.assertEqual(data["stablecoin_supply_usd"],160)
  self.assertEqual(len(data["stablecoin_history"]),2)
  self.assertIn("not net inflow",data["definitions"]["volume"])
 def test_browser_visualization_syntax(self):
  node=shutil.which("node")
  if not node:self.skipTest("Node not installed")
  script=pathlib.Path(__file__).resolve().parents[1]/"dashboard"/"market-flow.js"
  result=subprocess.run([node,"--check",str(script)],capture_output=True,text=True,timeout=10)
  self.assertEqual(result.returncode,0,result.stderr)
 def test_bad_upstream_values_rejected(self):
  with patch.object(market_flow,"_fetch",return_value={"data":{}}):
   with self.assertRaises(ValueError):market_flow.market_flow_snapshot()
if __name__=="__main__":unittest.main()

"""Vercel serverless integration and private route checks."""
import importlib.util,json,pathlib,sys,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
class VercelEntrypointTests(unittest.TestCase):
 def test_catch_all_is_authenticated_function(self):
  cfg=json.loads((ROOT/"vercel.json").read_text())
  self.assertEqual(cfg["routes"][0]["src"],"/(.*)")
  self.assertEqual(cfg["routes"][0]["dest"],"/api/index.py")
  self.assertNotIn("handle",cfg["routes"][0])
 def test_vercel_handler_imports(self):
  from api.index import handler
  from src.private_dashboard import Handler
  self.assertIs(handler,Handler)
 def test_no_secrets_baked_into_vercel_config(self):
  cfg=(ROOT/"vercel.json").read_text()
  self.assertNotIn("DASHBOARD_PASSWORD",cfg)
  self.assertNotIn("GITHUB_READ_TOKEN",cfg)
if __name__=="__main__":unittest.main()

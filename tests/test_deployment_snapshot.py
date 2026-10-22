"""Regression tests for hourly bundled private dashboard data."""
import base64,json,pathlib,sys,tempfile,unittest,zlib
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import build_deployment_snapshot as builder
import private_dashboard as dashboard

class DeploymentSnapshotTests(unittest.TestCase):
 def test_hourly_bundle_is_compressed_and_excludes_public_quote(self):
  fake={"source":"deployment_snapshot","market":{"price":0.0001837},
   "observed_utc":"2026-10-22T12:00:00Z","live_quote":{"status":"fresh","price":0.0001838}}
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory)
   (root/"src").mkdir()
   with patch.object(builder,"build",return_value=fake.copy()):
    output=builder.generate(root)
   text=output.read_text()
   self.assertNotIn("0.0001838",text)
   namespace={}
   exec(compile(text,str(output),"exec"),namespace)
   restored=json.loads(zlib.decompress(base64.b64decode(namespace["COMPRESSED_JSON"])))
   self.assertEqual(restored["market"]["price"],0.0001837)
   self.assertNotIn("live_quote",restored)
 def test_cached_prefers_embedded_research_and_independent_public_quote(self):
  embedded={"source":"deployment_snapshot","market":{"price":0.0001837},
   "observed_utc":"2020-01-01T00:00:00Z","market_status":"FRESH"}
  with patch.dict(dashboard.os.environ,{"GITHUB_READ_TOKEN":""}),\
       patch.dict(dashboard.CACHE,{"time":0.0,"payload":None},clear=True),\
       patch.object(dashboard,"read_embedded",return_value=embedded),\
       patch.object(dashboard,"fetch_mexc_quote",return_value={"status":"fresh","price":0.0001851}),\
       patch.object(dashboard,"build",side_effect=AssertionError("unexpected rebuild")):
   result=dashboard.cached()
  self.assertEqual(result["market"]["price"],0.0001837)
  self.assertEqual(result["live_quote"]["price"],0.0001851)
  self.assertEqual(result["market_status"],"STALE")
if __name__=="__main__":unittest.main()

"""Offline dashboard generation and XSS-safe JSON embedding."""
import json,pathlib,sys,tempfile,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import build_offline_dashboard as offline
class OfflineTests(unittest.TestCase):
 def test_single_file_contains_safe_embedded_snapshot(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);(root/"dashboard").mkdir()
   (root/"dashboard"/"vendor").mkdir()
   (root/"dashboard"/"vendor"/"lightweight-charts-5.0.9.js").write_text((ROOT/"dashboard"/"vendor"/"lightweight-charts-5.0.9.js").read_text())
   for name in ("private.html","private.css","private.js","market-stream.js","market-flow.js","technical-overlays.js","chart-events.js","workspace-tabs.js","market-lens.js"):
    (root/"dashboard"/name).write_text((ROOT/"dashboard"/name).read_text())
   with patch.object(offline,"build",return_value={"price":0.0002,"injected":"</script><script>alert(1)</script>"}):
    result=offline.generate(root)
   text=result.read_text()
   self.assertIn('id="stamp-snapshot"',text)
   self.assertIn('offline_snapshot',text)
   self.assertNotIn('src="/assets/market-stream.js',text)
   self.assertNotIn('src="/assets/market-flow.js',text)
   self.assertNotIn('src="/assets/technical-overlays.js',text)
   self.assertNotIn('src="/assets/chart-events.js',text)
   self.assertIn('StampEvents',text)
   self.assertIn('StampTechnical',text)
   self.assertIn('StampMarket',text)
   self.assertNotIn('src="/assets/app.js',text)
   self.assertNotIn('href="/assets/style.css',text)
   self.assertNotIn('src="/assets/chart.js',text)
   self.assertIn('TradingView Lightweight Charts',text)
   self.assertIn('<style>',text)
   self.assertIn('<script>',text)
   self.assertNotIn('</script><script>alert(1)',text)
   self.assertIn('\\u003c/script\\u003e',text)
if __name__=="__main__":unittest.main()


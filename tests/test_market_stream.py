import pathlib,shutil,subprocess,unittest
class MarketStreamTests(unittest.TestCase):
 def test_binary_market_feed_and_reconnect(self):
  if not shutil.which('node'):self.skipTest('Node unavailable')
  root=pathlib.Path(__file__).resolve().parents[1]
  r=subprocess.run(['node','tests/market_stream.cjs'],cwd=root,capture_output=True,text=True,timeout=20)
  self.assertEqual(r.returncode,0,r.stdout+r.stderr)

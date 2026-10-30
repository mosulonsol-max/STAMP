"""Compact interface contract and actual client data/forecast behavior."""
import pathlib,shutil,subprocess,unittest
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]
HTML=(ROOT/'dashboard/private.html').read_text()
class Elements(HTMLParser):
 def __init__(self):super().__init__();self.ids=set();self.tags={}
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if 'id' in attrs:self.ids.add(attrs['id']);self.tags[attrs['id']]=tag
class PrivateUIRegressionTests(unittest.TestCase):
 def test_compact_market_fields_and_interactive_chart(self):
  parsed=Elements();parsed.feed(HTML)
  for key in ('coinName','price','liquidity','marketCap','volume','high24','low24','change','chart','forecastHorizon','modelStatus','forecastHistory'):self.assertIn(key,parsed.ids)
  self.assertEqual(parsed.tags['chart'],'div')
  for old in ('marketBrief','marketContext','onchainEvidence','portfolioResults'):self.assertNotIn(old,parsed.ids)
  self.assertIn('audit-details',HTML)
 def test_browser_runtime_recovers_and_preserves_measurement_times(self):
  node=shutil.which('node')
  if not node:self.skipTest('Node unavailable')
  result=subprocess.run([node,str(ROOT/'tests/browser_runtime_smoke.cjs')],capture_output=True,text=True,timeout=20)
  self.assertEqual(result.returncode,0,result.stdout+result.stderr);self.assertEqual(result.stdout.count('PASS '),4)
 def test_chart_script_parses_and_is_self_hosted(self):
  node=shutil.which('node')
  if node:self.assertEqual(subprocess.run([node,'--check',str(ROOT/'dashboard/private.js')],capture_output=True).returncode,0)
  self.assertIn('/assets/chart.js',HTML)
  self.assertTrue((ROOT/'dashboard/vendor/lightweight-charts-5.0.9.js').exists())
  self.assertIn('www.tradingview.com',HTML)
 def test_language_and_private_session_controls(self):
  for key in ('langSelect','zoneSelect','settings','logoutButton','changePassword','diagnose'):self.assertIn('id="'+key+'"',HTML)
  self.assertIn('lang="ar"',HTML);self.assertIn('dir="rtl"',HTML)
  self.assertNotIn('type="password"',HTML)
if __name__=='__main__':unittest.main()

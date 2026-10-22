"""Regression checks for the private STAMP browser client.

The JS syntax test catches a class of real production failures that backend tests missed.
"""
import pathlib,re,shutil,subprocess,unittest
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]
HTML=(ROOT/"dashboard"/"private.html").read_text(encoding="utf-8")
JS=(ROOT/"dashboard"/"private.js").read_text(encoding="utf-8")
CSS=(ROOT/"dashboard"/"private.css").read_text(encoding="utf-8")
class Elements(HTMLParser):
 def __init__(self):super().__init__();self.ids=set();self.links=[]
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if "id" in attrs:self.ids.add(attrs["id"])
  if tag=="a":self.links.append(attrs.get("href",""))
class PrivateUIRegressionTests(unittest.TestCase):
 def test_javascript_parses_and_has_no_duplicate_core_functions(self):
  node=shutil.which("node")
  if node:
   result=subprocess.run([node,"--check",str(ROOT/"dashboard"/"private.js")],capture_output=True,text=True,timeout=15)
   self.assertEqual(result.returncode,0,result.stderr)
  else:self.skipTest("Node.js not available on runner")
  for name in ("render","refresh","renderChart","renderPortfolio","exportCsv"):
   self.assertEqual(len(re.findall(r"function\s+"+name+r"\s*\(",JS)),1,name+" duplicated")
 def test_price_sources_are_separate_and_recovery_is_present(self):
  for value in ('quoteFresh?q:m','quoteFresh?q.change_24h_pct','quoteFresh?q.volume_24h_usdt','/api/dashboard','/api/dashboard-lite','stamp-snapshot','/api/status'):
   self.assertIn(value,JS)
 def test_forecasts_are_unvalidated_and_horizons_exist(self):
  self.assertIn("forecast-grid",HTML)
  self.assertIn('["1h","4h","24h","7d"]',JS)
  self.assertIn('t("unverified")',JS)
  self.assertNotIn("STRONG BUY",JS)
 def test_security_controls_are_real_not_fake(self):
  doc=Elements();doc.feed(HTML)
  for key in ("settingsButton","settings","changePassword","langSelect","zoneSelect","forecasts","sourceLine","exportCandles","diagnose","diagnosticResult","holdingQty","holdingCost","portfolioClear","portfolioResults"):
   self.assertIn(key,doc.ids)
  self.assertTrue(any(url.startswith("https://vercel.com/") for url in doc.links))
  self.assertNotIn('type="password"',HTML)
  self.assertIn("DASHBOARD_PASSWORD",JS)
  self.assertIn("stamp_position",JS)
  self.assertIn("renderPortfolio",JS)
  self.assertNotIn("DASHBOARD_PASSWORD=",HTML)
 def test_language_and_layout(self):
  self.assertIn('lang="ar"',HTML);self.assertIn('dir="rtl"',HTML)
  self.assertIn("Asia/Baghdad",HTML);self.assertIn("UTC",HTML)
  self.assertIn("document.documentElement.dir",JS)
  self.assertIn("@media(max-width:560px)",CSS)
if __name__=="__main__":unittest.main()

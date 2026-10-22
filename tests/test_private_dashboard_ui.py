"""Static regression checks for the private STAMP dashboard UI.

These checks complement the HTTP authentication and data-integrity tests.
"""
import pathlib,re,unittest
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[1]
HTML=(ROOT/"dashboard"/"private.html").read_text(encoding="utf-8")
JS=(ROOT/"dashboard"/"private.js").read_text(encoding="utf-8")
CSS=(ROOT/"dashboard"/"private.css").read_text(encoding="utf-8")
class Elements(HTMLParser):
 def __init__(self):
  super().__init__();self.ids=set();self.links=[]
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if "id" in attrs:self.ids.add(attrs["id"])
  if tag=="a":self.links.append(attrs.get("href",""))
class PrivateUIRegressionTests(unittest.TestCase):
 def test_research_and_live_prices_are_distinct(self):
  self.assertIn("quoteFresh?q.price:a.price",JS)
  self.assertIn("quoteFresh?q.change_24h_pct",JS)
  self.assertIn("quoteFresh?q.bid:a.bid",JS)
  self.assertIn("quoteFresh?q.volume_24h_usdt:a.volume",JS)
  self.assertIn("analysisTime",JS)
  self.assertIn("quoteTime",JS)
 def test_forecast_cards_are_explicit_and_unvalidated(self):
  self.assertIn("forecast-grid",HTML)
  self.assertIn("['1h','1H']",JS)
  self.assertIn("['7d','7D']",JS)
  self.assertIn("t('insufficient')",JS)
  self.assertIn("t('unverified')",JS)
  self.assertNotIn("STRONG BUY",JS)
 def test_password_action_does_not_falsely_claim_to_rotate_server_secret(self):
  doc=Elements();doc.feed(HTML)
  for key in ("settingsButton","settings","changePassword","langSelect","zoneSelect","forecasts","sourceLine","exportCandles"):
   self.assertIn(key,doc.ids)
  self.assertTrue(any(url.startswith("https://vercel.com/") for url in doc.links))
  self.assertNotIn('type="password"',HTML)
  self.assertIn("DASHBOARD_PASSWORD",JS)
  self.assertNotIn("DASHBOARD_PASSWORD=",HTML)
 def test_accessibility_and_localization(self):
  self.assertIn('lang="ar"',HTML)
  self.assertIn('dir="rtl"',HTML)
  self.assertIn("Asia/Baghdad",HTML)
  self.assertIn("UTC",HTML)
  self.assertIn("document.documentElement.dir",JS)
  self.assertIn("@media(max-width:560px)",CSS)
if __name__=="__main__":unittest.main()

"""Security and rendering regressions for the private STAMP dashboard."""
import base64,datetime,io,importlib.util,json,os,pathlib,sys,tempfile,unittest,threading,http.client
from http.server import ThreadingHTTPServer
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import private_dashboard as app
class PrivateDashboardTests(unittest.TestCase):
 def test_authentication_denies_missing_and_invalid(self):
  with patch.dict(os.environ,{"DASHBOARD_USER":"private","DASHBOARD_PASSWORD":"long-test-password"},clear=True):
   self.assertFalse(app.authorized(None))
   self.assertFalse(app.authorized("Bearer abc"))
   self.assertFalse(app.authorized("Basic invalid@@"))
   self.assertFalse(app.authorized("Basic "+base64.b64encode(b"private:wrong").decode()))
   self.assertTrue(app.authorized("Basic "+base64.b64encode(b"private:long-test-password").decode()))
 def test_http_requires_auth_for_ui_and_market_api(self):
  with patch.dict(os.environ,{"DASHBOARD_USER":"private","DASHBOARD_PASSWORD":"long-test-password"},clear=True):
   server=ThreadingHTTPServer(("127.0.0.1",0),app.Handler)
   worker=threading.Thread(target=server.serve_forever,daemon=True)
   worker.start()
   try:
    conn=http.client.HTTPConnection("127.0.0.1",server.server_address[1],timeout=3)
    for path in ("/","/api/dashboard","/assets/app.js"):
     conn.request("GET",path)
     res=conn.getresponse()
     self.assertEqual(res.status,401)
     res.read()
    with patch.object(app,"cached",return_value={"source":"deployment_snapshot","market":{"price":0.0001851},"observed_utc":"2026-10-22T11:24:29Z"}):
     header="Basic "+base64.b64encode(b"private:long-test-password").decode()
     conn.request("GET","/api/dashboard",headers={"Authorization":header})
     res=conn.getresponse()
     self.assertEqual(res.status,200)
     self.assertEqual(res.getheader("Cache-Control"),"no-store, max-age=0")
     self.assertEqual(json.loads(res.read())["market"]["price"],0.0001851)
    conn.request("GET","/healthz")
    res=conn.getresponse()
    self.assertEqual(res.status,200)
    self.assertEqual(res.read(),b"ok")
    conn.close()
   finally:
    server.shutdown()
    server.server_close()
    worker.join(timeout=3)
 def test_recovery_api_returns_archived_research_without_network(self):
  archived={"source":"deployment_snapshot","observed_utc":"2026-10-22T10:00:00Z","market":{"price":0.00019}}
  with patch.dict(os.environ,{"DASHBOARD_USER":"private","DASHBOARD_PASSWORD":"test-password"},clear=True),patch.object(app,"read_embedded",return_value=archived),patch.object(app,"fetch_mexc_quote",side_effect=AssertionError("should not call network")),patch.dict(app.CACHE,{"time":0.0,"payload":None},clear=True):
   server=ThreadingHTTPServer(("127.0.0.1",0),app.Handler)
   worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
   try:
    conn=http.client.HTTPConnection("127.0.0.1",server.server_address[1],timeout=3)
    conn.request("GET","/api/dashboard-lite")
    response=conn.getresponse();self.assertEqual(response.status,401);response.read()
    auth={"Authorization":"Basic "+base64.b64encode(b"private:test-password").decode()}
    conn.request("GET","/api/dashboard-lite",headers=auth)
    response=conn.getresponse();self.assertEqual(response.status,200)
    payload=json.loads(response.read())
    self.assertEqual(payload["market"]["price"],0.00019)
    self.assertEqual(payload["live_quote"]["status"],"unavailable")
    self.assertEqual(payload["source"],"deployment_snapshot_recovery")
    conn.request("GET","/api/status",headers=auth)
    response=conn.getresponse();self.assertEqual(response.status,200)
    self.assertTrue(json.loads(response.read())["embedded_research"])
    conn.close()
   finally:
    server.shutdown();server.server_close();worker.join(timeout=3)
 def test_authenticated_html_embeds_archived_fallback_safely(self):
  archived={"market":{"price":0.00019},"observed_utc":"2026-10-22T10:00:00Z","note":"</script><script>alert(1)</script>"}
  with patch.dict(os.environ,{"DASHBOARD_USER":"private","DASHBOARD_PASSWORD":"test-password"},clear=True),patch.object(app,"read_embedded",return_value=archived),patch.dict(app.CACHE,{"time":0.0,"payload":None},clear=True):
   server=ThreadingHTTPServer(("127.0.0.1",0),app.Handler)
   worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
   try:
    conn=http.client.HTTPConnection("127.0.0.1",server.server_address[1],timeout=3)
    auth={"Authorization":"Basic "+base64.b64encode(b"private:test-password").decode()}
    conn.request("GET","/",headers=auth)
    response=conn.getresponse();self.assertEqual(response.status,200)
    body=response.read().decode()
    self.assertIn('id="stamp-snapshot"',body)
    self.assertIn('"price":0.00019',body)
    self.assertIn('id="price">$0.00019000</div>',body)
    self.assertIn('ARCHIVED UTC: 2026-10-22T10:00:00Z',body)
    self.assertNotIn("</script><script>alert(1)</script>",body)
    self.assertIn("u003c",body)
    conn.close()
   finally:
    server.shutdown();server.server_close();worker.join(timeout=3)
 def test_live_quote_has_independent_timestamp_and_correct_percent(self):
  stamp=datetime.datetime.now(datetime.timezone.utc)
  provider=int(stamp.timestamp()*1000)
  payload=json.dumps({"symbol":"STAMPUSDT","lastPrice":"0.0001837","bidPrice":"0.0001836","askPrice":"0.0001838","priceChangePercent":"0.042","quoteVolume":"1250","closeTime":provider}).encode()
  class Response(io.BytesIO):
   status=200
  with patch.object(app,"urlopen",return_value=Response(payload)):
   result=app.fetch_mexc_quote()
  self.assertEqual(result["status"],"fresh")
  self.assertEqual(result["price"],0.0001837)
  self.assertAlmostEqual(result["change_24h_pct"],4.2)
  self.assertIsNotNone(result["provider_at_utc"])
 def test_live_quote_fails_closed_on_bad_symbol(self):
  class Response(io.BytesIO):
   status=200
  with patch.object(app,"urlopen",return_value=Response(b'{"symbol":"WRONG","lastPrice":"1"}')):
   result=app.fetch_mexc_quote()
  self.assertEqual(result["status"],"unavailable")
  self.assertNotIn("price",result)
 def test_numeric_safety(self):
  self.assertIsNone(app.num(float("nan")))
  self.assertIsNone(app.num(float("inf")))
  self.assertIsNone(app.num("bad"))
  self.assertEqual(app.num("1.5"),1.5)
 def test_freshness(self):
  self.assertIsNone(app.age(None))
  self.assertIsNone(app.age("bad"))
 def test_dashboard_build_uses_snapshot_and_does_not_leak_secrets(self):
  fake={"latest.json":{"raw":{"collected_at_utc":"2020-01-01T00:00:00+00:00","mexc":{"ticker":{"data":{"lastPrice":"0.0002","priceChangePercent":"0.01"}}}},"analysis":{"advanced_indicators":{"1h":{"rsi14_simple":55}},"recent_executed_trades":{"aggressive_buy_notional_usdt":42},"forecast_1h":"insufficient_evidence"}},"workflow_health.json":{"pipeline_passed":True},"learning_controller.json":{"champion":None},"forecast_scorecard.json":{"forecasts_total":3},"candle_quality.json":{},"observations.jsonl":[]}
  def reader(path,token):return fake.get(path,[] if path.startswith("candles/") else {}),None
  with patch.dict(os.environ,{"DASHBOARD_PASSWORD":"SECRET_NEVER_EXPOSE","GITHUB_READ_TOKEN":""}),patch.object(app,"load",side_effect=reader),patch.object(app,"fetch_mexc_quote",return_value={"status":"unavailable"}):
   result=app.build()
   self.assertEqual(result["market_status"],"STALE")
   self.assertEqual(result["market"]["price"],0.0002)
   self.assertEqual(result["health"]["passed"],True)
   self.assertEqual(result["technical"]["1h"]["rsi14_simple"],55)
   self.assertEqual(result["market"]["trades"]["aggressive_buy_notional_usdt"],42)
   self.assertEqual(result["forecasts"]["1h"],"insufficient_evidence")
   self.assertNotIn("SECRET_NEVER_EXPOSE",json.dumps(result))
if __name__=="__main__":unittest.main()

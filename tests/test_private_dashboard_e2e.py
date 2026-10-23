"""Authenticated HTTP end-to-end smoke tests for the STAMP browser dashboard.

Uses isolated test credentials and real HTTP requests to the production handler,
but never reads or changes production passwords.
"""
import base64,http.client,json,os,pathlib,sys,threading,unittest,urllib.parse
from http.server import ThreadingHTTPServer
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import private_dashboard as app

class AuthenticatedBrowserFlow(unittest.TestCase):
 def setUp(self):
  self.env=patch.dict(os.environ,{"DASHBOARD_USER":"test-user","DASHBOARD_PASSWORD":"long-test-password","GITHUB_READ_TOKEN":""},clear=True)
  self.env.start()
  self.research={
   "source":"deployment_snapshot","observed_utc":"2026-10-22T10:00:00Z",
   "market":{"price":0.00019,"change":-0.0444,"bid":0.000189,"ask":0.000191,"volume":70000,"book":{},"trades":{}},
   "technical":{},"forecasts":{"1h":"insufficient_evidence"},"candles":{},"dex":[],
   "scorecard":{"evaluated_total":10},"learning":{"champion":None},
   "health":{"passed":True,"steps":{"monitor":"success"}}
  }
  self.embedded=patch.object(app,"read_embedded",return_value=self.research)
  self.embedded.start()
  self.live=patch.object(app,"fetch_mexc_quote",return_value={
   "status":"fresh","price":0.000194,"bid":0.000193,"ask":0.000195,
   "retrieved_at_utc":"2026-10-22T10:00:00Z","change_24h_pct":-4.44,"volume_24h_usdt":90000
  })
  self.live.start()
  self.cache=patch.dict(app.CACHE,{"time":0.0,"payload":None},clear=True)
  self.cache.start()
  self.server=ThreadingHTTPServer(("127.0.0.1",0),app.Handler)
  self.worker=threading.Thread(target=self.server.serve_forever,daemon=True);self.worker.start()
 def tearDown(self):
  self.server.shutdown();self.server.server_close();self.worker.join(timeout=3)
  self.cache.stop();self.live.stop();self.embedded.stop();self.env.stop()
 def req(self,method,path,body=None,cookie=None):
  conn=http.client.HTTPConnection("127.0.0.1",self.server.server_address[1],timeout=5)
  headers={}
  if cookie:headers["Cookie"]=cookie
  if body is not None:headers["Content-Type"]="application/x-www-form-urlencoded"
  conn.request(method,path,body=body,headers=headers)
  res=conn.getresponse();status=res.status;head=dict(res.getheaders());data=res.read();conn.close()
  return status,head,data
 def test_full_login_assets_research_quote_logout(self):
  status,headers,body=self.req("GET","/")
  self.assertEqual(status,200);self.assertIn(b'action="/login"',body)
  status,headers,body=self.req("GET","/api/dashboard")
  self.assertEqual(status,401);self.assertIn(b'login_required',body)
  status,headers,body=self.req("POST","/login",urllib.parse.urlencode({"user":"test-user","password":"wrong"}))
  self.assertEqual(status,401);self.assertNotIn("Set-Cookie",headers)
  status,headers,body=self.req("POST","/login",urllib.parse.urlencode({"user":"test-user","password":"long-test-password"}))
  self.assertEqual(status,303)
  self.assertIn("HttpOnly",headers["Set-Cookie"]);self.assertIn("Secure",headers["Set-Cookie"])
  cookie=headers["Set-Cookie"].split(";",1)[0]
  for path in ("/","/assets/app.js","/assets/style.css","/api/dashboard","/api/dashboard-lite","/api/quote","/api/status"):
   status,head,body=self.req("GET",path,cookie=cookie)
   self.assertEqual(status,200,path+" "+body[:200].decode(errors="replace"))
   if path=="/":self.assertIn(b'id="stamp-snapshot"',body);self.assertIn(b'id="price">$0.00019000',body)
   if path=="/assets/app.js":self.assertIn(b'function render(',body)
   if path=="/api/dashboard":
    j=json.loads(body);self.assertEqual(j["market"]["price"],0.00019);self.assertEqual(j["live_quote"]["price"],0.000194)
   if path=="/api/dashboard-lite":self.assertEqual(json.loads(body)["source"],"deployment_snapshot_recovery")
   if path=="/api/quote":self.assertEqual(json.loads(body)["quote"]["status"],"fresh")
  status,headers,body=self.req("POST","/logout",cookie=cookie)
  self.assertEqual(status,303);self.assertIn("Max-Age=0",headers["Set-Cookie"])
  status,_,body=self.req("GET","/api/dashboard")
  self.assertEqual(status,401)
 def test_invalid_or_expired_cookie_rejected(self):
  for cookie in ("stamp_session=garbage","stamp_session=1.abc.def","stamp_session=0.abc."+("0"*64)):
   status,_,_=self.req("GET","/api/dashboard",cookie=cookie)
   self.assertEqual(status,401)
if __name__=="__main__":unittest.main()

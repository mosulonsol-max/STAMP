"""Test actual production responses from GitHub Actions (outside Vercel).

No password is needed or logged. Public /healthz and the login form must return 200.
All other routes must return 401 with the app's Basic challenge, not
a Vercel access page, a redirect, or a missing-function 500.
"""
import sys,time,urllib.request,urllib.error,urllib.parse,json,datetime,pathlib
HOST="https://stamp-one-opal.vercel.app"
CHECKS=[("/healthz",200),("/",200),("/assets/app.js",401),("/assets/style.css",200),("/api/dashboard",401),("/api/dashboard-lite",401),("/api/quote",401),("/api/status",401)]
def request(path):
 req=urllib.request.Request(HOST+path,headers={"User-Agent":"STAMP-production-smoke/1.0","Accept":"*/*"})
 try:
  with urllib.request.urlopen(req,timeout=15) as response:
   return response.status,{k.lower():v for k,v in response.headers.items()},response.read(16384)
 except urllib.error.HTTPError as e:
  return e.code,{k.lower():v for k,v in e.headers.items()},e.read(16384)
def main():
 # Allow Vercel production alias propagation following a commit.
 time.sleep(12)
 failed=[];checks=[]
 for path,expected in CHECKS:
  try:
   status,headers,body=request(path)
   challenge=headers.get("www-authenticate","")
   content_type=headers.get("content-type","")
   # Existing production may still use Basic while the safer JSON 401 is deploying.
   protected=(b'login_required' in body and path.startswith("/api/")) or 'Basic realm="STAMP Private Dashboard"' in challenge
   ok=status==expected and (expected==200 or protected)
   if path=="/" and ok:ok=b'action="/login"' in body and b'type="password"' in body
   print(f"{'PASS' if ok else 'FAIL'} {path} status={status} expected={expected} content_type={content_type} challenge={'STAMP_BASIC' if 'STAMP Private Dashboard' in challenge else 'OTHER_OR_MISSING'}")
   checks.append({"path":path,"http_status":status,"expected":expected,"passed":ok})
   if not ok:failed.append(f"{path}: HTTP {status}, expected {expected} (or wrong authentication challenge)")
  except Exception as e:
   print(f"FAIL {path} {type(e).__name__}: {e}")
   checks.append({"path":path,"http_status":None,"expected":expected,"passed":False,"error":type(e).__name__})
   failed.append(path+": "+type(e).__name__)
 # Verify bad passwords never create a session. No real credentials are used.
 try:
  bad=urllib.parse.urlencode({"user":"invalid-smoke-user","password":"invalid-smoke-password"}).encode()
  req=urllib.request.Request(HOST+"/login",data=bad,method="POST",headers={"Content-Type":"application/x-www-form-urlencoded","User-Agent":"STAMP-production-smoke/1.0"})
  try:
   with urllib.request.urlopen(req,timeout=15) as response:
    status=response.status;headers={k.lower():v for k,v in response.headers.items()}
  except urllib.error.HTTPError as e:
   status=e.code;headers={k.lower():v for k,v in e.headers.items()}
  ok=status==401 and "stamp_session=" not in headers.get("set-cookie","")
  checks.append({"path":"POST /login (invalid credentials)","http_status":status,"expected":401,"passed":ok})
  print(("PASS" if ok else "FAIL")+" POST /login (invalid credentials): HTTP "+str(status))
  if not ok:failed.append("invalid login accepted or session created")
 except Exception as e:
  checks.append({"path":"POST /login (invalid credentials)","passed":False,"error":type(e).__name__})
  failed.append("login rejection check: "+type(e).__name__)
 pathlib.Path("data").mkdir(exist_ok=True)
 pathlib.Path("data/production_smoke.json").write_text(json.dumps({"checked_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"host":HOST,"passed":not failed,"checks":checks},indent=2)+"\\n")
 if failed:
  print("PRODUCTION SMOKE FAILED:",*failed,sep="\n - ")
  return 1
 print("Production routing and Basic auth gates confirmed. Authenticated data/API still require a separate authorized browser test.")
 return 0
if __name__=="__main__":sys.exit(main())

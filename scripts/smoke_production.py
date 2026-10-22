"""Test actual production responses from GitHub Actions (outside Vercel).

No password is needed or logged. Public /healthz must return 200.
All other routes must return 401 with the app's Basic challenge, not
a Vercel access page, a redirect, or a missing-function 500.
"""
import sys,time,urllib.request,urllib.error,json,datetime,pathlib
HOST="https://stamp-one-opal.vercel.app"
CHECKS=[("/healthz",200),("/",401),("/assets/app.js",401),("/assets/style.css",401),("/api/dashboard",401),("/api/dashboard-lite",401),("/api/status",401)]
def request(path):
 req=urllib.request.Request(HOST+path,headers={"User-Agent":"STAMP-production-smoke/1.0","Accept":"*/*"})
 try:
  with urllib.request.urlopen(req,timeout=15) as response:
   return response.status,dict(response.headers),response.read(120)
 except urllib.error.HTTPError as e:
  return e.code,dict(e.headers),e.read(120)
def main():
 # Allow Vercel production alias propagation following a commit.
 time.sleep(12)
 failed=[];checks=[]
 for path,expected in CHECKS:
  try:
   status,headers,body=request(path)
   challenge=headers.get("WWW-Authenticate","")
   content_type=headers.get("Content-Type","")
   ok=status==expected and (path=="/healthz" or 'Basic realm="STAMP Private Dashboard"' in challenge)
   print(f"{'PASS' if ok else 'FAIL'} {path} status={status} expected={expected} content_type={content_type} challenge={'STAMP_BASIC' if 'STAMP Private Dashboard' in challenge else 'OTHER_OR_MISSING'}")
   checks.append({"path":path,"http_status":status,"expected":expected,"passed":ok})
   if not ok:failed.append(f"{path}: HTTP {status}, expected {expected} (or wrong authentication challenge)")
  except Exception as e:
   print(f"FAIL {path} {type(e).__name__}: {e}")
   checks.append({"path":path,"http_status":None,"expected":expected,"passed":False,"error":type(e).__name__})
   failed.append(path+": "+type(e).__name__)
 pathlib.Path("data").mkdir(exist_ok=True)
 pathlib.Path("data/production_smoke.json").write_text(json.dumps({"checked_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"host":HOST,"passed":not failed,"checks":checks},indent=2)+"\\n")
 if failed:
  print("PRODUCTION SMOKE FAILED:",*failed,sep="\n - ")
  return 1
 print("Production routing and Basic auth gates confirmed. Authenticated data/API still require a separate authorized browser test.")
 return 0
if __name__=="__main__":sys.exit(main())

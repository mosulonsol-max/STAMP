"""Private read-only STAMP web dashboard. Optional private GitHub API refresh."""
import base64,datetime as dt,hmac,json,math,os,pathlib,threading,time
from concurrent.futures import ThreadPoolExecutor,as_completed
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from urllib.parse import urlsplit,quote
ROOT=pathlib.Path(__file__).resolve().parents[1]
REPO="mosulonsol-max/STAMP"
PATHS=("latest.json","workflow_health.json","learning_controller.json","forecast_scorecard.json","candles/15m.json","candles/1h.json","candles/4h.json","candles/1d.json")
CACHE={"time":0.0,"payload":None}
LOCK=threading.Lock()
def age(stamp):
 try:
  when=dt.datetime.fromisoformat(str(stamp).replace("Z","+00:00"))
  if when.tzinfo is None:return None
  return max(0,int((dt.datetime.now(dt.timezone.utc)-when).total_seconds()))
 except (ValueError,TypeError,OverflowError):return None
def num(v):
 try:
  f=float(v)
  return f if math.isfinite(f) else None
 except (TypeError,ValueError):return None
def load(path,token):
 if path not in PATHS:raise ValueError("path")
 try:
  if token:
   url="https://api.github.com/repos/"+REPO+"/contents/"+quote("data/"+path,safe="/")+"?ref=main"
   req=Request(url,headers={"Authorization":"Bearer "+token,"Accept":"application/vnd.github.raw+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"STAMP-private-dashboard"})
   with urlopen(req,timeout=12) as res:raw=res.read(3000001)
  else:raw=(ROOT/"data"/path).read_bytes()
  if len(raw)>3000000:raise ValueError("size")
  text=raw.decode("utf-8")
  return ([json.loads(line) for line in text.splitlines() if line.strip()] if path.endswith(".jsonl") else json.loads(text)),None
 except (OSError,HTTPError,URLError,ValueError,UnicodeError) as exc:
  return ([] if path.endswith(".jsonl") or path.startswith("candles/") else {}),type(exc).__name__
def build():
 token=os.getenv("GITHUB_READ_TOKEN","").strip()
 items={};errors={}
 # GitHub API fetches must run concurrently: serial network requests exceed
 # serverless time limits and can make the authenticated dashboard unusable.
 with ThreadPoolExecutor(max_workers=8) as pool:
  tasks={pool.submit(load,path,token):path for path in PATHS}
  for task in as_completed(tasks):
   path=tasks[task]
   try:items[path],err=task.result()
   except Exception as exc:
    items[path]=[] if path.endswith(".jsonl") or path.startswith("candles/") else {}
    err=type(exc).__name__
   if err:errors[path]=err
 latest=items["latest.json"];raw=latest.get("raw") or {};a=latest.get("analysis") or {}
 ticker=((raw.get("mexc") or {}).get("ticker") or {}).get("data") or {}
 observed=raw.get("collected_at_utc");seconds=age(observed)
 health=items["workflow_health.json"];learning=items["learning_controller.json"];score=items["forecast_scorecard.json"]
 frames={}
 for tf in ("15m","1h","4h","1d"):
  frames[tf]=[]
  for c in (items["candles/"+tf+".json"] if isinstance(items["candles/"+tf+".json"],list) else [])[-500:]:
   if not isinstance(c,dict):continue
   t=num(c.get("t"));vals=[num(c.get(k)) for k in ("o","h","l","c","v")]
   if t is not None and all(v is not None and v>0 for v in vals[:4]) and vals[1]>=max(vals[0],vals[3]) and vals[2]<=min(vals[0],vals[3]):
    frames[tf].append(dict(t=int(t),o=vals[0],h=vals[1],l=vals[2],c=vals[3],v=vals[4]))
 pools=[]
 for d in (raw.get("dex") or {}).get("data") or []:
  if not isinstance(d,dict):continue
  pools.append(dict(dex=d.get("dexId"),quote=(d.get("quoteToken") or {}).get("symbol"),liquidity=num((d.get("liquidity") or {}).get("usd")),volume=num((d.get("volume") or {}).get("h24"))))
 pools.sort(key=lambda p:p["liquidity"] or 0,reverse=True)
 return dict(fetched_utc=dt.datetime.now(dt.timezone.utc).isoformat(),source="private_github_api" if token else "deployment_snapshot",
  observed_utc=observed,age_seconds=seconds,market_status="FRESH" if seconds is not None and seconds<=900 else "STALE",
  market=dict(price=num(ticker.get("lastPrice")),change=num(ticker.get("priceChangePercent")),bid=num(ticker.get("bidPrice")),ask=num(ticker.get("askPrice")),volume=num(ticker.get("quoteVolume")),book=a.get("order_book_features") or {},trades=a.get("recent_executed_trades") or {},flags=a.get("flags") or []),
  technical=a.get("advanced_indicators") or {},forecasts={tf:a.get("forecast_"+tf) for tf in ("1h","4h","24h","7d")},candles=frames,dex=pools[:10],learning=learning,scorecard=score,
  health=dict(passed=health.get("pipeline_passed"),at=health.get("timestamp_utc"),event=health.get("event_name"),run=health.get("run_id"),steps=health.get("steps") or {}),
  errors=errors,note="Research only. Experimental model outputs are not executable trading signals.")
def cached():
 with LOCK:
  now=time.monotonic()
  if CACHE["payload"] is not None and now-CACHE["time"]<90:return CACHE["payload"]
  result=build();CACHE.update(time=now,payload=result);return result
def authorized(header):
 user=os.getenv("DASHBOARD_USER","");password=os.getenv("DASHBOARD_PASSWORD","")
 if not user or not password or not header or not header.startswith("Basic "):return False
 try:u,p=base64.b64decode(header[6:],validate=True).decode("utf-8").split(":",1)
 except (ValueError,UnicodeError):return False
 return hmac.compare_digest(u.encode(),user.encode()) and hmac.compare_digest(p.encode(),password.encode())
class Handler(BaseHTTPRequestHandler):
 server_version="STAMPPrivate"
 def send(self,status,body,kind="text/plain; charset=utf-8",extra=None):
  self.send_response(status)
  headers={"Content-Type":kind,"Content-Length":str(len(body)),"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"no-referrer","Cross-Origin-Resource-Policy":"same-origin","Content-Security-Policy":"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'","Strict-Transport-Security":"max-age=31536000; includeSubDomains"}
  headers.update(extra or {})
  for k,v in headers.items():self.send_header(k,v)
  self.end_headers();self.wfile.write(body)
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=="/healthz":return self.send(200,b"ok")
  if not authorized(self.headers.get("Authorization")):return self.send(401,b"Authentication required",extra={"WWW-Authenticate":'Basic realm="STAMP Private Dashboard", charset="UTF-8"'})
  if path=="/api/dashboard":
   try:return self.send(200,json.dumps(cached(),allow_nan=False).encode(),"application/json; charset=utf-8")
   except Exception:return self.send(503,b'{"error":"Data temporarily unavailable"}',"application/json")
  paths={"/":"private.html","/index.html":"private.html","/assets/app.js":"private.js","/assets/style.css":"private.css"}
  if path not in paths:return self.send(404,b"Not found")
  name=paths[path];kind="text/html" if name.endswith(".html") else "text/javascript" if name.endswith(".js") else "text/css"
  try:return self.send(200,(ROOT/"dashboard"/name).read_bytes(),kind+"; charset=utf-8")
  except OSError:return self.send(503,b"Asset unavailable")
 def do_POST(self):self.send(405,b"Method not allowed")
def main():
 if not os.getenv("DASHBOARD_USER") or not os.getenv("DASHBOARD_PASSWORD"):raise SystemExit("Refusing to start without dashboard authentication")
 port=int(os.getenv("PORT","10000"))
 ThreadingHTTPServer(("0.0.0.0",port),Handler).serve_forever()
if __name__=="__main__":main()

"""Private read-only STAMP web dashboard. Optional private GitHub API refresh."""
import base64,datetime as dt,hmac,json,math,os,pathlib,threading,time,zlib,hashlib,secrets
from concurrent.futures import ThreadPoolExecutor,as_completed
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from urllib.parse import urlsplit,quote,parse_qs
ROOT=pathlib.Path(__file__).resolve().parents[1]
REPO="mosulonsol-max/STAMP"
PATHS=("latest.json","workflow_health.json","learning_controller.json","forecast_scorecard.json","forecast_journal.jsonl","candles/15m.json","candles/1h.json","candles/4h.json","candles/1d.json")
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
 except HTTPError as exc:
  return ([] if path.endswith(".jsonl") or path.startswith("candles/") else {}),"HTTP_"+str(exc.code)
 except (OSError,URLError,ValueError,UnicodeError) as exc:
  return ([] if path.endswith(".jsonl") or path.startswith("candles/") else {}),type(exc).__name__
def fetch_mexc_quote():
 """Independently timestamped public MEXC ticker; never a substitute for archived analytics."""
 url="https://api.mexc.com/api/v3/ticker/24hr?symbol=STAMPUSDT"
 try:
  req=Request(url,headers={"Accept":"application/json","User-Agent":"STAMP-private-dashboard/1.0"})
  with urlopen(req,timeout=5) as response:
   if response.status!=200:raise ValueError("unexpected_http_status")
   raw=response.read(16385)
  if len(raw)>16384:raise ValueError("oversized_quote")
  ticker=json.loads(raw)
  if not isinstance(ticker,dict) or ticker.get("symbol")!="STAMPUSDT":raise ValueError("unexpected_symbol")
  price=num(ticker.get("lastPrice"));bid=num(ticker.get("bidPrice"));ask=num(ticker.get("askPrice"))
  if not price or price<=0 or (bid is not None and bid<=0) or (ask is not None and ask<=0):
   raise ValueError("invalid_quote")
  stamp=dt.datetime.now(dt.timezone.utc)
  provider_ms=num(ticker.get("closeTime"))
  provider_utc=None
  if provider_ms is not None:
   try:
    provider=dt.datetime.fromtimestamp(provider_ms/1000,dt.timezone.utc)
    provider_utc=provider.isoformat()
    if abs((stamp-provider).total_seconds())>600:raise ValueError("stale_provider_timestamp")
   except (OverflowError,OSError) as exc:raise ValueError("invalid_provider_timestamp") from exc
  return dict(status="fresh",source="MEXC public 24h ticker",retrieved_at_utc=stamp.isoformat(),
   provider_at_utc=provider_utc,price=price,bid=bid,ask=ask,
   change_24h_pct=(num(ticker.get("priceChangePercent"))*100 if num(ticker.get("priceChangePercent")) is not None else None),
   volume_24h_usdt=num(ticker.get("quoteVolume")))
 except (OSError,HTTPError,URLError,ValueError,TypeError,json.JSONDecodeError) as exc:
  return dict(status="unavailable",source="MEXC public 24h ticker",error=type(exc).__name__)

def build():
 token=os.getenv("GITHUB_READ_TOKEN","").strip()
 items={};errors={}
 # GitHub API fetches must run concurrently: serial network requests exceed
 # serverless time limits and can make the authenticated dashboard unusable.
 with ThreadPoolExecutor(max_workers=8) as pool:
  quote_task=pool.submit(fetch_mexc_quote)
  tasks={pool.submit(load,path,token):path for path in PATHS}
  for task in as_completed(tasks):
   path=tasks[task]
   try:items[path],err=task.result()
   except Exception as exc:
    items[path]=[] if path.endswith(".jsonl") or path.startswith("candles/") else {}
    err=type(exc).__name__
   if err:errors[path]=err
  try:live_quote=quote_task.result()
  except Exception as exc:live_quote={"status":"unavailable","error":type(exc).__name__}
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
 # Surface upstream availability explicitly; a successful workflow is not proof
 # that every independent source returned usable data.
 sources={"mexc_ticker":(raw.get("mexc") or {}).get("ticker"),
          "mexc_orderbook":(raw.get("mexc") or {}).get("book"),
          "mexc_trades":(raw.get("mexc") or {}).get("trades"),
          "mexc_1h_candles":(raw.get("mexc") or {}).get("klines_1h"),
          "dexscreener":raw.get("dex"),"project_github":raw.get("project"),
          "macro_coingecko":raw.get("macro")}
 source_health={}
 for name,entry in sources.items():
  valid=isinstance(entry,dict)
  item=entry if valid else {}
  payload=item.get("data")
  source_health[name]={"status":"ok" if payload is not None and not item.get("error") else "unavailable",
                       "observed_utc":item.get("retrieved_at_utc"),"error":item.get("error")}
 return dict(fetched_utc=dt.datetime.now(dt.timezone.utc).isoformat(),source="private_github_api" if token else "deployment_snapshot",
  observed_utc=observed,age_seconds=seconds,market_status="FRESH" if seconds is not None and seconds<=900 else "STALE",
  live_quote=live_quote,source_health=source_health,
  market=dict(price=num(ticker.get("lastPrice")),change=num(ticker.get("priceChangePercent")),bid=num(ticker.get("bidPrice")),ask=num(ticker.get("askPrice")),volume=num(ticker.get("quoteVolume")),book=a.get("order_book_features") or {},trades=a.get("recent_executed_trades") or {},flags=a.get("flags") or []),
  technical=a.get("advanced_indicators") or {},forecasts={tf:a.get("forecast_"+tf) for tf in ("1h","4h","24h","7d")},forecast_history=recent_forecasts(items["forecast_journal.jsonl"]),candles=frames,dex=pools[:10],learning=learning,scorecard=score,
  health=dict(passed=health.get("pipeline_passed"),production_smoke_passed=health.get("production_smoke_passed"),
              at=health.get("timestamp_utc"),event=health.get("event_name"),run=health.get("run_id"),steps=health.get("steps") or {}),
  errors=errors,note="Research only. Experimental model outputs are not executable trading signals.")
def recent_forecasts(events,limit=12):
 """Join immutable forecast and outcome events without inventing evaluations."""
 if not isinstance(events,list):return []
 outcomes={}
 for e in events:
  if isinstance(e,dict) and e.get("event")=="outcome" and e.get("forecast_id"):
   outcomes[e["forecast_id"]]=e
 forecasts=[e for e in events if isinstance(e,dict) and e.get("event")=="forecast" and e.get("id")]
 now=dt.datetime.now(dt.timezone.utc)
 result=[]
 for e in forecasts[-limit:][::-1]:
  outcome=outcomes.get(e["id"],{})
  status=outcome.get("status")
  if not status:
   try:status="overdue_unverified" if dt.datetime.fromisoformat(e["due_at_utc"].replace("Z","+00:00"))<now else "pending"
   except (ValueError,KeyError,TypeError):status="pending"
  result.append({"created_utc":e.get("created_at_utc"),"due_utc":e.get("due_at_utc"),
   "model":e.get("model_version"),"class":e.get("forecast_class"),"horizon":e.get("horizon"),
   "reference_price":num(e.get("reference_price")),"predicted_log_return":num(e.get("predicted_log_return")),
   "direction":e.get("predicted_direction"),"status":status,
   "actual_price":num(outcome.get("actual_price")) if status in ("evaluated","evaluated_historical") else None,
   "actual_log_return":num(outcome.get("actual_log_return")) if status in ("evaluated","evaluated_historical") else None,
   "direction_correct":outcome.get("direction_correct") if status in ("evaluated","evaluated_historical") else None,
   "price_source":outcome.get("price_source"),"measurement_time_utc":outcome.get("measurement_time_utc"),
   "measurement_offset_seconds":outcome.get("measurement_offset_seconds"),
   "evaluated_utc":outcome.get("evaluated_at_utc")})
 return result

def read_embedded():
 """Import the GitHub Actions-built, private deployment snapshot as a Python module.
 This works even when Vercel's Python function excludes non-imported data files.
 """
 try:
  try:
   from src.deployment_snapshot import COMPRESSED_JSON
  except ImportError:
   # When started as `python src/private_dashboard.py`, the repo root is not on sys.path.
   from deployment_snapshot import COMPRESSED_JSON
  if not COMPRESSED_JSON:return None
  obj=json.loads(zlib.decompress(base64.b64decode(COMPRESSED_JSON)).decode("utf-8"))
  if not isinstance(obj,dict) or not isinstance(obj.get("market"),dict):return None
  return obj
 except (ImportError,ValueError,TypeError,zlib.error,UnicodeError):
  return None

def cached():
 with LOCK:
  now=time.monotonic()
  if CACHE["payload"] is not None and now-CACHE["time"]<90:return CACHE["payload"]
  if not os.getenv("GITHUB_READ_TOKEN","").strip():
   result=read_embedded()
   if result is not None:
    # Only the exchange quote is fetched live. Research remains an archived snapshot.
    result["live_quote"]=fetch_mexc_quote()
    result["source"]="deployment_snapshot"
    result["fetched_utc"]=dt.datetime.now(dt.timezone.utc).isoformat()
    result["age_seconds"]=age(result.get("observed_utc"))
    result["market_status"]="FRESH" if result["age_seconds"] is not None and result["age_seconds"]<=900 else "STALE"
    CACHE.update(time=now,payload=result)
    return result
  result=build()
  # A broken GitHub token/network must not replace a usable archived snapshot with blanks.
  if not isinstance(result.get("market"),dict) or result["market"].get("price") is None:
   archive=read_embedded()
   if archive is not None:
    archive=dict(archive)
    archive["live_quote"]=result.get("live_quote") or {"status":"unavailable"}
    archive["source"]="deployment_snapshot_github_fallback"
    archive["github_errors"]=result.get("errors") or {}
    archive["fetched_utc"]=dt.datetime.now(dt.timezone.utc).isoformat()
    archive["age_seconds"]=age(archive.get("observed_utc"))
    archive["market_status"]="FRESH" if archive["age_seconds"] is not None and archive["age_seconds"]<=900 else "STALE"
    result=archive
  CACHE.update(time=now,payload=result);return result
def github_connection_state(current,configured):
 """Report observed private GitHub API access, never just token presence."""
 if not configured:return "not_configured"
 if not isinstance(current,dict):return "not_checked"
 origin=current.get("source")
 if origin=="private_github_api":
  errors=current.get("errors") or {}
  if "latest.json" in errors:return "failed"
  return "degraded" if errors else "connected"
 if origin=="deployment_snapshot_github_fallback":return "failed_fallback"
 return "not_checked"

def cached_research_only():
 """Fast, network-independent recovery endpoint for the private UI.

 The public exchange ticker must not block access to the archived research.
 """
 with LOCK:
  current=CACHE.get("payload")
  if isinstance(current,dict) and isinstance(current.get("market"),dict):
   result=dict(current)
  else:
   result=read_embedded()
  if not isinstance(result,dict) or not isinstance(result.get("market"),dict):
   return None
  result=dict(result)
  result["live_quote"]={"status":"unavailable","source":"recovery_mode","error":"Live_quote_not_checked"}
  result["source"]="deployment_snapshot_recovery"
  result["fetched_utc"]=dt.datetime.now(dt.timezone.utc).isoformat()
  result["age_seconds"]=age(result.get("observed_utc"))
  result["market_status"]="FRESH" if result["age_seconds"] is not None and result["age_seconds"]<=900 else "STALE"
  return result

def authorized(header):
 user=os.getenv("DASHBOARD_USER","");password=os.getenv("DASHBOARD_PASSWORD","")
 if not user or not password or not header or not header.startswith("Basic "):return False
 try:u,p=base64.b64decode(header[6:],validate=True).decode("utf-8").split(":",1)
 except (ValueError,UnicodeError):return False
 return hmac.compare_digest(u.encode(),user.encode()) and hmac.compare_digest(p.encode(),password.encode())

def session_key():
 user=os.getenv("DASHBOARD_USER","")
 password=os.getenv("DASHBOARD_PASSWORD","")
 return hashlib.sha256(("STAMP:session:v1:"+user+"\0"+password).encode()).digest()
def make_session():
 expiry=int(time.time())+43200
 nonce=secrets.token_urlsafe(12)
 body=str(expiry)+"."+nonce
 sig=hmac.new(session_key(),body.encode(),hashlib.sha256).hexdigest()
 return body+"."+sig
def session_valid(cookie_header):
 if not cookie_header:return False
 try:
  cookies=dict(part.strip().split("=",1) for part in cookie_header.split(";") if "=" in part)
  expiry,nonce,sig=cookies.get("stamp_session","").split(".",2)
  if not expiry.isdigit() or int(expiry)<int(time.time()) or int(expiry)>int(time.time())+43200:return False
  body=expiry+"."+nonce
  expected=hmac.new(session_key(),body.encode(),hashlib.sha256).hexdigest()
  return bool(os.getenv("DASHBOARD_USER") and os.getenv("DASHBOARD_PASSWORD")) and hmac.compare_digest(sig,expected)
 except (ValueError,TypeError):return False
def login_html(error=False):
 message='<p role="alert">اسم المستخدم أو كلمة المرور غير صحيحة. / Invalid credentials.</p>' if error else ''
 return ('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
 '<title>STAMP — تسجيل الدخول</title><link rel="stylesheet" href="/assets/style.css"></head><body>'
 '<main><h1>STAMP INTELLIGENCE</h1><p>لوحة التحليل الخاصة · تسجيل الدخول</p>'+message+
 '<form method="post" action="/login"><p><label for="user">اسم المستخدم</label><input id="user" name="user" autocomplete="username" required></p>'
 '<p><label for="password">كلمة المرور</label><input id="password" type="password" name="password" autocomplete="current-password" required></p>'
 '<button type="submit">دخول / Sign in</button></form></main></body></html>').encode("utf-8")

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
  if path=="/healthz":
   # A 200 response must mean the deployment can actually serve its UI and archived data.
   try:
    healthy=all((ROOT/"dashboard"/name).is_file() for name in ("private.html","private.js","private.css")) and read_embedded() is not None
   except Exception:healthy=False
   return self.send(200 if healthy else 503,b"ok" if healthy else b"deployment_assets_or_research_missing")
  if path=="/assets/style.css" and not (authorized(self.headers.get("Authorization")) or session_valid(self.headers.get("Cookie"))):
   try:return self.send(200,(ROOT/"dashboard"/"private.css").read_bytes(),"text/css; charset=utf-8")
   except OSError:return self.send(503,b"Asset unavailable")
  if not (authorized(self.headers.get("Authorization")) or session_valid(self.headers.get("Cookie"))):
   if path in ("/","/index.html","/login"):return self.send(200,login_html(),"text/html; charset=utf-8")
   if path.startswith("/api/"):
    # Browser fetches must not trigger a confusing HTTP Basic modal when a cookie expires.
    return self.send(401,b'{"error":"login_required"}',"application/json; charset=utf-8")
   return self.send(401,b"Authentication required",extra={"WWW-Authenticate":'Basic realm="STAMP Private Dashboard", charset="UTF-8"'})
  if path=="/api/quote":
   # Independently fetched public exchange quote; research can remain archived.
   # Endpoint stays authenticated, like the rest of the private dashboard.
   try:
    quote=fetch_mexc_quote()
    return self.send(200,json.dumps({"quote":quote,"server_utc":dt.datetime.now(dt.timezone.utc).isoformat()},allow_nan=False).encode(),"application/json; charset=utf-8")
   except Exception as exc:
    return self.send(503,json.dumps({"error":"quote_unavailable","code":type(exc).__name__}).encode(),"application/json; charset=utf-8")
  if path=="/api/dashboard":
   try:return self.send(200,json.dumps(cached(),allow_nan=False).encode(),"application/json; charset=utf-8")
   except Exception as exc:
    # Return a machine-readable, non-secret error code for client recovery.
    code=type(exc).__name__
    return self.send(503,json.dumps({"error":"dashboard_unavailable","code":code}).encode(),"application/json; charset=utf-8")
  if path=="/api/dashboard-lite":
   try:
    data=cached_research_only()
    if data is None:return self.send(503,b'{"error":"no_embedded_research"}',"application/json; charset=utf-8")
    return self.send(200,json.dumps(data,allow_nan=False).encode(),"application/json; charset=utf-8")
   except Exception as exc:
    return self.send(503,json.dumps({"error":"recovery_unavailable","code":type(exc).__name__}).encode(),"application/json; charset=utf-8")
  if path=="/api/diagnostics":
   # This endpoint is authenticated; never return credentials or token values.
   try:
    snapshot=read_embedded()
    current=cached_research_only()
    snapshot_age=age(snapshot.get("observed_utc")) if snapshot else None
    payload={"api":"ok","utc":dt.datetime.now(dt.timezone.utc).isoformat(),
      "snapshot_available":bool(snapshot),"snapshot_at_utc":snapshot.get("observed_utc") if snapshot else None,
      "snapshot_age_seconds":snapshot_age,"snapshot_fresh":snapshot_age is not None and snapshot_age<=900,
      "github_live_refresh_configured":bool(os.getenv("GITHUB_READ_TOKEN","").strip()),
      "github_connection_state":github_connection_state(CACHE.get("payload"),bool(os.getenv("GITHUB_READ_TOKEN","").strip())),
      "snapshot_mode":"hourly_deployment" if not os.getenv("GITHUB_READ_TOKEN","").strip() else "github_api_with_fallback",
      "research_available":bool(current),"live_quote_status":"not_checked",
      "auth":"authenticated_session"}
    return self.send(200,json.dumps(payload,allow_nan=False).encode(),"application/json; charset=utf-8")
   except Exception as exc:
    return self.send(503,json.dumps({"error":"diagnostics_unavailable","code":type(exc).__name__}).encode(),"application/json; charset=utf-8")
  if path=="/api/status":
   # No sensitive data, and still behind the same application authentication.
   try:
    embedded=read_embedded()
    current=CACHE.get("payload")
    obs=(current or embedded or {}).get("observed_utc")
    return self.send(200,json.dumps({"api":"ok","embedded_research":bool(embedded),"cached_research":isinstance(current,dict),
      "research_source":(current or embedded or {}).get("source","unavailable"),
      "observation_utc":obs,"observation_age_seconds":age(obs),
      "research_fresh":age(obs) is not None and age(obs)<=900,
      "github_refresh_enabled":bool(os.getenv("GITHUB_READ_TOKEN","").strip()),
      "github_connection_state":github_connection_state(current,bool(os.getenv("GITHUB_READ_TOKEN","").strip())),
      "github_errors":(current or {}).get("errors") or (current or {}).get("github_errors") or {},
      "quote_status":(current or {}).get("live_quote",{}).get("status","not_checked"),
      "utc":dt.datetime.now(dt.timezone.utc).isoformat()}).encode(),"application/json; charset=utf-8")
   except Exception:
    return self.send(503,b'{"api":"error"}',"application/json; charset=utf-8")
  paths={"/":"private.html","/index.html":"private.html","/assets/app.js":"private.js","/assets/style.css":"private.css"}
  if path not in paths:return self.send(404,b"Not found")
  name=paths[path];kind="text/html" if name.endswith(".html") else "text/javascript" if name.endswith(".js") else "text/css"
  try:
   content=(ROOT/"dashboard"/name).read_bytes()
   if name=="private.html":
    # A self-contained, authenticated archival fallback survives API/network outages.
    research=cached_research_only()
    if research is not None:
     payload=json.dumps(research,ensure_ascii=False,allow_nan=False,separators=(",",":"))
     payload=payload.replace("<","\\u003c").replace(">","\\u003e").replace("&","\\u0026")
     # Non-executable template is compatible with a strict script-src 'self' CSP.
     embed=('<template id="stamp-snapshot">'+payload+'</template>').encode("utf-8")
     # Insert the JSON snapshot before the external script, regardless of cache-busting query.
     marker=b'<script src="/assets/app.js'
     if marker in content:content=content.replace(marker,embed+marker,1)
     # Server-side archived price: visible even when browser JS or API calls fail.
     market=research.get("market") or {}
     value=num(market.get("price"))
     observed=research.get("observed_utc")
     if value is not None and value>0:
      from html import escape
      display=("$"+format(value,".8f")).encode("ascii")
      timestamp=escape(str(observed or "unknown"),quote=True).encode("utf-8")
      dash="—".encode("utf-8")
      content=content.replace(b'id="price">'+dash+b'</div>',b'id="price">'+display+b'</div>',1)
      content=content.replace(b'id="observed">'+dash+b'</div>',b'id="observed">ARCHIVED UTC: '+timestamp+b'</div>',1)
      content=content.replace('id="status" role="status">جاري الاتصال</span>'.encode("utf-8"),b'id="status" role="status">ARCHIVED</span>',1)
      content=content.replace(b'id="sourceLine" aria-live="polite">'+dash+b'</div>',b'id="sourceLine" aria-live="polite">Archived research: '+timestamp+b' UTC. Not a live quote.</div>',1)
   return self.send(200,content,kind+"; charset=utf-8")
  except OSError:return self.send(503,b"Asset unavailable")
 def do_POST(self):
  path=urlsplit(self.path).path
  if path=="/logout":
   return self.send(303,b"",extra={"Location":"/","Set-Cookie":"stamp_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"})
  if path!="/login":return self.send(405,b"Method not allowed")
  try:
   length=int(self.headers.get("Content-Length","0"))
   if length<1 or length>2048:return self.send(400,b"Invalid request")
   fields=parse_qs(self.rfile.read(length).decode("utf-8"),keep_blank_values=True)
   username=fields.get("user",[""])[0]
   password=fields.get("password",[""])[0]
   good=authorized("Basic "+base64.b64encode((username+":"+password).encode()).decode())
  except (ValueError,UnicodeError,TypeError):good=False
  if not good:return self.send(401,login_html(True),"text/html; charset=utf-8")
  return self.send(303,b"",extra={"Location":"/","Set-Cookie":"stamp_session="+make_session()+"; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax"})
def main():
 if not os.getenv("DASHBOARD_USER") or not os.getenv("DASHBOARD_PASSWORD"):raise SystemExit("Refusing to start without dashboard authentication")
 port=int(os.getenv("PORT","10000"))
 ThreadingHTTPServer(("0.0.0.0",port),Handler).serve_forever()
if __name__=="__main__":main()

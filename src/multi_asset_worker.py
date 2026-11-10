"""Resilient independent worker loop. Run under a platform process supervisor."""
import datetime as dt,json,logging,os,pathlib,signal,time,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
from multi_asset_governor import cycle,load,audit_records
STOP=False
def stop(*_):
 global STOP
 STOP=True
signal.signal(signal.SIGTERM,stop)
signal.signal(signal.SIGINT,stop)
ROOT=pathlib.Path(__file__).resolve().parents[1]
LAST={"success":None,"attempt":None,"error":None,"cycles":0,"failures":0,"running":False,"discovered":0,"processed":0}
class Health(BaseHTTPRequestHandler):
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=="/research/audit":
   pair=parse_qs(urlsplit(self.path).query).get("symbol",["BTCUSDT"])[0].upper()
   if not pair.endswith("USDT") or len(pair)>26 or not pair.isalnum():return self.respond(400,{"error":"invalid_symbol"})
   try:
    archive=load()
    rows=[r for r in archive.get("records",[]) if r.get("pair")==pair]
    result=audit_records(rows)
    result.update({"symbol":pair,"archive_updated_at_utc":archive.get("loop_updated_at_utc"),"storage":"postgres" if os.getenv("DATABASE_URL") else "ephemeral_filesystem","has_records":bool(rows)})
    return self.respond(200,result)
   except Exception as exc:return self.respond(503,{"error":"forecast_audit_unavailable","reason":type(exc).__name__})
  if path=="/research/diagnostics":
   pair=parse_qs(urlsplit(self.path).query).get("symbol",["BTCUSDT"])[0].upper()
   if not pair.endswith("USDT") or len(pair)>26 or not pair.isalnum():return self.respond(400,{"error":"invalid_symbol"})
   try:
    archive=load()
    rows=[r for r in archive.get("records",[]) if r.get("pair")==pair]
    settled=[r for r in rows if r.get("outcome")]
    selected={k:v for k,v in (archive.get("model_selections") or {}).items() if k.startswith(pair+"|")}
    cycle_result=archive.get("cycle_result") or {}
    failed=(cycle_result.get("failed") or {}).get(pair)
    last_success=LAST.get("success")
    stages={"worker":{"ok":bool(last_success),"last_success_utc":dt.datetime.fromtimestamp(last_success,dt.timezone.utc).isoformat() if last_success else None,"error":LAST.get("error")},"collection":{"ok":pair in (cycle_result.get("processed") or []),"last_cycle_utc":cycle_result.get("at_utc"),"last_failure":failed},"research":{"ok":bool(rows),"records":len(rows)},"forecast":{"ok":bool(rows),"pending":len(rows)-len(settled)},"outcome":{"ok":bool(settled),"settled":len(settled)},"learning":{"ok":bool(settled) and bool([v for k,v in (archive.get("learning") or {}).items() if k.startswith(pair+"|") and v.get("last_outcome_id")]),"evaluations":len(settled)},"model":{"ok":bool(selected),"selected":selected,"note":"research_only; no live-trading approval"}}
    return self.respond(200,{"symbol":pair,"checked_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"archive_updated_at_utc":archive.get("loop_updated_at_utc"),"storage":"postgres" if os.getenv("DATABASE_URL") else "ephemeral_filesystem","stages":stages})
   except Exception as exc:return self.respond(503,{"error":"diagnostics_unavailable","reason":type(exc).__name__})
  if path=="/research/loop":
   pair=parse_qs(urlsplit(self.path).query).get("symbol",[""])[0].upper()
   if not pair.endswith("USDT") or len(pair)>26 or not pair.isalnum():return self.respond(400,{"error":"invalid_symbol"})
   try:
    archive=load()
    records=[r for r in archive.get("records",[]) if r.get("pair")==pair]
    return self.respond(200,{"symbol":pair,"source":"worker_persistent_research_state","storage":"postgres" if os.getenv("DATABASE_URL") else "ephemeral_filesystem","loop_updated_at_utc":archive.get("loop_updated_at_utc"),"archive_checked_at_utc":archive.get("checked_at_utc"),"records_total":len(records),"settled_total":sum(bool(r.get("outcome")) for r in records),"pending_forecasts":[{"id":r.get("id"),"frame":r.get("frame"),"reference_price":r.get("reference_price"),"predicted_price":r.get("predicted_price"),"reference_at_utc":r.get("reference_at_utc"),"due_at_utc":r.get("due_at_utc"),"model_version":r.get("model_version"),"validation_at_issue":r.get("validation_at_issue")} for r in records if not r.get("outcome")][-40:],"recent_outcomes":[{"id":r.get("id"),"frame":r.get("frame"),"reference_price":r.get("reference_price"),"predicted_price":r.get("predicted_price"),"outcome":r.get("outcome"),"due_at_utc":r.get("due_at_utc")} for r in records if r.get("outcome")][-12:],"learning":{k:v for k,v in archive.get("learning",{}).items() if k.startswith(pair+"|")},"feedback":{k:v for k,v in archive.get("feedback",{}).items() if k.startswith(pair+"|")},"validation":{k:v for k,v in archive.get("validation",{}).items() if k.startswith(pair+"|")},"model_retraining_active":bool([k for k in archive.get("model_selections",{}) if k.startswith(pair+"|")]),"model_selections":{k:v for k,v in archive.get("model_selections",{}).items() if k.startswith(pair+"|")},"venue_evidence":(archive.get("venue_evidence") or {}).get("pairs",{}).get(pair,{}),"venue_evidence_at_utc":(archive.get("venue_evidence") or {}).get("retrieved_at_utc")})
   except Exception as exc:return self.respond(503,{"error":"research_state_unavailable","reason":type(exc).__name__})
  if path not in ("/healthz","/status"):return self.respond(404,{"error":"not_found"})
  timestamp=LAST["success"]
  fresh=timestamp is not None and time.time()-timestamp<max(3600,int(os.environ.get("STAMP_WORKER_INTERVAL_SECONDS","1800"))*3)
  payload={"healthy":fresh,"running":LAST["running"],"cycles":LAST["cycles"],"consecutive_failures":LAST["failures"],"last_attempt_utc":dt.datetime.fromtimestamp(LAST["attempt"],dt.timezone.utc).isoformat() if LAST["attempt"] else None,"last_cycle_utc":dt.datetime.fromtimestamp(timestamp,dt.timezone.utc).isoformat() if timestamp else None,"error":LAST["error"],"discovered":LAST["discovered"],"processed":LAST["processed"],"storage":"postgres" if os.getenv("DATABASE_URL") else "ephemeral_filesystem"}
  return self.respond(200 if self.path=="/healthz" else (200 if fresh else 503),payload)
 def respond(self,code,data):
  body=json.dumps(data).encode()
  self.send_response(code);self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(body)));self.end_headers();self.wfile.write(body)
 def log_message(self,*_):pass
def serve():
 server=ThreadingHTTPServer(("0.0.0.0",int(os.getenv("PORT","10000"))),Health)
 server.serve_forever()
def run(interval=None):
 logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")
 interval=max(60,int(interval or os.environ.get("STAMP_WORKER_INTERVAL_SECONDS","1800")))
 failures=0
 while not STOP:
  start=time.monotonic()
  LAST.update(attempt=time.time(),running=True)
  try:
   result=cycle()
   coverage=result.get("coverage") or {}
   logging.info("cycle ok discovered=%s processed=%s record_count=%s",coverage.get("discovered"),coverage.get("processed_this_cycle"),len(result.get("records") or []))
   actual=len((result.get("cycle_result") or {}).get("processed") or [])
   if not coverage.get("discovered") or actual==0:raise RuntimeError("market_discovery_or_data_collection_failed")
   LAST.update(discovered=coverage["discovered"],processed=actual)
   failures=0
   LAST.update(success=time.time(),error=None,failures=0,cycles=LAST["cycles"]+1)
  except Exception:
   failures+=1
   LAST.update(error="cycle_failed",failures=failures)
   logging.exception("cycle failed: will retry")
  finally:
   LAST["running"]=False
  backoff=min(interval, min(300,2**min(8,failures))) if failures else interval
  sleep=max(1,backoff-(time.monotonic()-start)) if failures else max(1,interval-(time.monotonic()-start))
  end=time.monotonic()+sleep
  while not STOP and time.monotonic()<end:
   time.sleep(min(2,end-time.monotonic()))
if __name__=="__main__":
 threading.Thread(target=run,daemon=True).start()
 serve()

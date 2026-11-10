"""Resilient independent worker loop. Run under a platform process supervisor."""
import datetime as dt,json,logging,os,pathlib,signal,time,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from multi_asset_governor import cycle
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
  if self.path not in ("/healthz","/status"):return self.respond(404,{"error":"not_found"})
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

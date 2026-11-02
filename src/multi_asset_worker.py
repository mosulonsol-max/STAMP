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
LAST={"success":None,"error":None,"cycles":0}
class Health(BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path not in ("/healthz","/status"):return self.respond(404,{"error":"not_found"})
  timestamp=LAST["success"]
  fresh=timestamp is not None and time.time()-timestamp<max(3600,int(os.environ.get("STAMP_WORKER_INTERVAL_SECONDS","1800"))*3)
  return self.respond(200 if fresh else 503,{"healthy":fresh,"cycles":LAST["cycles"],"last_cycle_utc":dt.datetime.fromtimestamp(timestamp,dt.timezone.utc).isoformat() if timestamp else None,"error":LAST["error"]})
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
  try:
   result=cycle()
   coverage=result.get("coverage") or {}
   logging.info("cycle ok discovered=%s processed=%s record_count=%s",coverage.get("discovered"),coverage.get("processed_this_cycle"),len(result.get("records") or []))
   failures=0
   LAST.update(success=time.time(),error=None,cycles=LAST["cycles"]+1)
  except Exception:
   failures+=1
   LAST["error"]="cycle_failed"
   logging.exception("cycle failed: will retry")
  backoff=min(interval, min(300,2**min(8,failures))) if failures else interval
  sleep=max(1,backoff-(time.monotonic()-start)) if failures else max(1,interval-(time.monotonic()-start))
  end=time.monotonic()+sleep
  while not STOP and time.monotonic()<end:
   time.sleep(min(2,end-time.monotonic()))
if __name__=="__main__":
 threading.Thread(target=run,daemon=True).start()
 serve()

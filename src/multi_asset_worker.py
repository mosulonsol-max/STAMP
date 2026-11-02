"""Resilient independent worker loop. Run under a platform process supervisor."""
import datetime as dt,json,logging,os,pathlib,signal,time
from multi_asset_governor import cycle
STOP=False
def stop(*_):
 global STOP
 STOP=True
signal.signal(signal.SIGTERM,stop)
signal.signal(signal.SIGINT,stop)
ROOT=pathlib.Path(__file__).resolve().parents[1]
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
  except Exception:
   failures+=1
   logging.exception("cycle failed: will retry")
  backoff=min(interval, min(300,2**min(8,failures))) if failures else interval
  sleep=max(1,backoff-(time.monotonic()-start)) if failures else max(1,interval-(time.monotonic()-start))
  end=time.monotonic()+sleep
  while not STOP and time.monotonic()<end:
   time.sleep(min(2,end-time.monotonic()))
if __name__=="__main__":run()

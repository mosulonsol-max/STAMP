"""Long-running STAMP monitor supervisor. Requires a persistent host and durable storage."""
import os,time,subprocess,sys,datetime,json,pathlib,signal
ROOT=pathlib.Path(__file__).resolve().parents[1]
STOP=False
def stop(*_):
    global STOP
    STOP=True
signal.signal(signal.SIGTERM,stop)
signal.signal(signal.SIGINT,stop)
INTERVAL=max(60,int(os.getenv("STAMP_POLL_SECONDS","300")))
while not STOP:
    start=time.monotonic()
    result=subprocess.run([sys.executable,str(ROOT/"src"/"monitor.py")],cwd=str(ROOT),capture_output=True,text=True,timeout=180)
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    health={"timestamp_utc":now,"exit_code":result.returncode,"stdout_tail":result.stdout[-1200:],"stderr_tail":result.stderr[-1200:]}
    (ROOT/"data").mkdir(exist_ok=True)
    (ROOT/"data"/"health.json").write_text(json.dumps(health,ensure_ascii=False,indent=2))
    print(json.dumps(health,ensure_ascii=False),flush=True)
    delay=max(0,INTERVAL-(time.monotonic()-start))
    if STOP:break
    time.sleep(delay)

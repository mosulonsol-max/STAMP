"""Read current workflow step state and latest persisted artifact handoffs."""
import base64
import datetime as dt
import json
import os
import threading
import time
from urllib.request import Request,urlopen

REPO="mosulonsol-max/STAMP"
BASE="https://api.github.com/repos/"+REPO
STEPS={
 "Acquire snapshot and analyze":"monitor",
 "Archive completed candles before evaluating forecast outcomes":"archive",
 "Collect synchronized market correlations and finalized on-chain evidence":"evidence",
 "Retrain all research horizons before issuing forecasts":"research",
 "Evaluate due predictions using time-aligned historical candles, then journal next forecast":"audit",
 "Reassess automatic model approval after newly matured outcomes":"governance",
 "Diagnose model error against baselines and later time windows":"diagnosis",
 "Verify matured multi-asset predictions and record fresh forecasts":"multi_asset_governance",
 "Verify forecast issuance and market freshness":"forecast_health",
 "Verify production HTTP endpoints":"production_smoke",
 "Build research dashboard":"dashboard",
}
_CACHE={"at":0.0,"value":None}
_LOCK=threading.Lock()

def get(path,limit=2000000):
 headers={"Accept":"application/vnd.github+json","User-Agent":"STAMP-pipeline-status","X-GitHub-Api-Version":"2022-11-28"}
 token=os.getenv("GITHUB_READ_TOKEN","").strip()
 if token:headers["Authorization"]="Bearer "+token
 with urlopen(Request(BASE+path,headers=headers),timeout=5) as response:raw=response.read(limit+1)
 if len(raw)>limit:raise ValueError("oversized_github_response")
 return json.loads(raw)

def read_latest():
 response=get("/contents/data/workflow_health.json?ref=main")
 if response.get("encoding")!="base64":raise ValueError("unsupported_github_content")
 content=base64.b64decode(response["content"],validate=False)
 if len(content)>1500000:raise ValueError("oversized_workflow_health")
 health=json.loads(content)
 return {"run":str(health.get("run_id") or ""),"at":health.get("timestamp_utc"),
         "passed":health.get("pipeline_passed"),"steps":health.get("steps") or {},"trace":health.get("trace") or []}

def read_state():
 now=dt.datetime.now(dt.timezone.utc).isoformat()
 try:
  runs=get("/actions/workflows/frequent-monitor.yml/runs?branch=main&per_page=1")["workflow_runs"]
  run=runs[0] if runs else None
  if run is None:raise ValueError("no_workflow_runs")
  stage_states={}
  if run.get("status")!="completed":
   jobs=get("/actions/runs/"+str(int(run["id"]))+"/jobs?per_page=100")["jobs"]
   for job in jobs:
    for step in job.get("steps") or []:
     name=STEPS.get(step.get("name"))
     if name:stage_states[name]={key:step.get(key) for key in ("status","conclusion","started_at","completed_at")}
  latest=None
  if os.getenv("GITHUB_READ_TOKEN","").strip():
   try:latest=read_latest()
   except (OSError,ValueError,KeyError,TypeError):pass
  return {"status":run.get("status"),"conclusion":run.get("conclusion"),"run":str(run["id"]),
          "run_url":"https://github.com/"+REPO+"/actions/runs/"+str(run["id"]),
          "checked_at_utc":now,"stages":stage_states,"latest":latest,
  "archive_status":"available" if latest else "served_by_dashboard_snapshot"}
 except (OSError,ValueError,KeyError,TypeError) as exc:
  return {"status":"unavailable","reason":type(exc).__name__,"checked_at_utc":now,"archive_status":"unavailable"}

def current():
 with _LOCK:
  if _CACHE["value"] and time.monotonic()-_CACHE["at"]<45:return _CACHE["value"]
 value=read_state()
 with _LOCK:_CACHE.update(at=time.monotonic(),value=value)
 return value

def worker_events(after=0):
 cursor=max(0,int(after))
 url="https://stamp-autonomous-worker.onrender.com/pipeline/events?after="+str(cursor)
 with urlopen(Request(url,headers={"Accept":"application/json","User-Agent":"STAMP-dashboard-telemetry"}),timeout=4) as response:
  raw=response.read(120001)
 if len(raw)>120000:raise ValueError("oversized_worker_telemetry")
 value=json.loads(raw)
 if value.get("source")!="worker_runtime_telemetry" or not isinstance(value.get("events"),list):raise ValueError("invalid_worker_telemetry")
 return value

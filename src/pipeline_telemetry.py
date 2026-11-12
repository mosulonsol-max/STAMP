"""Bounded in-memory relay for authenticated GitHub Actions file-read events."""
import datetime as dt
import json
import re
import threading
from collections import deque
from functools import lru_cache

AUDIENCE="stamp-pipeline-telemetry"
ISSUER="https://token.actions.githubusercontent.com"
WORKFLOW="mosulonsol-max/STAMP/.github/workflows/frequent-monitor.yml@refs/heads/main"
STAGES={"monitor","archive","evidence","research","audit","governance","diagnosis","multi_asset_governance","forecast_health","production_smoke","dashboard"}
ARTIFACTS={"data/latest.json","data/learning_controller.json","data/candle_quality.json","data/forecast_journal.jsonl","data/forecast_activity.json","data/forecast_scorecard.json","data/model_registry.json","data/model_diagnosis.json","data/multi_asset_forecasts.json","data/evidence_sources.json","data/candles/15m.json","data/candles/1h.json","data/candles/4h.json","data/candles/1d.json"}
_EVENTS=deque(maxlen=500)
_LOCK=threading.Lock()
_SEQUENCE=0

@lru_cache(maxsize=1)
def signing_keys():
 import jwt
 return jwt.PyJWKClient("https://token.actions.githubusercontent.com/.well-known/jwks",cache_keys=True,lifespan=3600)

def claims(token):
 import jwt
 key=signing_keys().get_signing_key_from_jwt(token).key
 decoded=jwt.decode(token,key,algorithms=["RS256"],audience=AUDIENCE,issuer=ISSUER,
                    options={"require":["exp","iat","aud","iss","sub"]})
 if decoded.get("repository")!="mosulonsol-max/STAMP" or decoded.get("ref")!="refs/heads/main" or decoded.get("workflow_ref")!=WORKFLOW:
  raise ValueError("untrusted_workflow")
 if not re.fullmatch(r"\d{5,20}",str(decoded.get("run_id",""))):raise ValueError("missing_run_id")
 return decoded

def accept(token,payload):
 global _SEQUENCE
 claim=claims(token)
 if not isinstance(payload,dict):raise ValueError("invalid_payload")
 source=payload.get("from");target=payload.get("to");artifact=payload.get("artifact")
 digest=payload.get("sha256");bytes_count=payload.get("bytes");observed=payload.get("observed_utc")
 if source not in STAGES or target not in STAGES or source==target or artifact not in ARTIFACTS:
  raise ValueError("invalid_handoff")
 if not isinstance(digest,str) or not re.fullmatch(r"[a-f0-9]{64}",digest):raise ValueError("invalid_digest")
 if type(bytes_count) is not int or not 0<bytes_count<=3000000:raise ValueError("invalid_size")
 try:when=dt.datetime.fromisoformat(observed.replace("Z","+00:00"))
 except (AttributeError,ValueError):raise ValueError("invalid_time")
 now=dt.datetime.now(dt.timezone.utc)
 if when.tzinfo is None or not -5<=(now-when).total_seconds()<=120:raise ValueError("stale_event")
 event={"from":source,"to":target,"artifact":artifact,"sha256":digest,"bytes":bytes_count,
        "observed_utc":when.isoformat(),"run":str(claim["run_id"]),"received_at_utc":now.isoformat()}
 with _LOCK:
  if any(all(prior.get(k)==event.get(k) for k in ("from","to","artifact","sha256","observed_utc","run")) for prior in _EVENTS):
   return {"accepted":True,"duplicate":True}
  _SEQUENCE+=1;event["sequence"]=_SEQUENCE;_EVENTS.append(event)
 return {"accepted":True,"sequence":event["sequence"]}

def read(after=0):
 try:cursor=max(0,int(after))
 except (TypeError,ValueError):raise ValueError("invalid_cursor")
 with _LOCK:
  latest=_SEQUENCE
  rows=[dict(e) for e in _EVENTS if e["sequence"]>cursor][-100:]
 return {"source":"worker_runtime_telemetry","checked_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
         "sequence":latest,"events":rows}

"""Forecast issuance watchdog: successful pipeline steps do not imply fresh predictions."""
import datetime as dt,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
MAX_FORECAST_AGE_SECONDS=9000  # 150 minutes, tolerant of GitHub schedule drift
MAX_MARKET_AGE_SECONDS=5400  # 90 minutes
def parse(s):
 try:return dt.datetime.fromisoformat(str(s).replace("Z","+00:00"))
 except (TypeError,ValueError):return None
def assess(root=ROOT,now=None):
 now=now or dt.datetime.now(dt.timezone.utc)
 data=root/"data"
 try:
  journal=[json.loads(line) for line in (data/"forecast_journal.jsonl").read_text().splitlines() if line.strip()]
 except (OSError,ValueError):journal=[]
 try:snapshot=json.loads((data/"latest.json").read_text())
 except (OSError,ValueError):snapshot={}
 forecasts=[x for x in journal if x.get("event")=="forecast"]
 last=forecasts[-1] if forecasts else {}
 issued=parse(last.get("created_at_utc"))
 market=parse((snapshot.get("raw") or {}).get("collected_at_utc"))
 forecast_age=max(0,(now-issued).total_seconds()) if issued else None
 market_age=max(0,(now-market).total_seconds()) if market else None
 reasons=[]
 if forecast_age is None or forecast_age>MAX_FORECAST_AGE_SECONDS:reasons.append("forecast_not_issued_recently")
 if market_age is None or market_age>MAX_MARKET_AGE_SECONDS:reasons.append("market_snapshot_stale")
 report={"checked_at_utc":now.isoformat(),"status":"healthy" if not reasons else "degraded",
  "forecast_total":len(forecasts),"last_forecast_utc":last.get("created_at_utc"),
  "last_forecast_class":last.get("forecast_class"),"last_forecast_age_seconds":forecast_age,
  "last_market_observation_utc":(snapshot.get("raw") or {}).get("collected_at_utc"),
  "market_age_seconds":market_age,"reasons":reasons,
  "model_validated":last.get("forecast_class") in ("validated_experimental","approved_internal_model"),
  "note":"Shadow forecasts are recorded but not validated trading signals."}
 (data/"forecast_activity.json").write_text(json.dumps(report,indent=2)+"\n")
 return report
if __name__=="__main__":
 report=assess()
 print(json.dumps(report))
 sys.exit(0 if report["status"]=="healthy" else 1)


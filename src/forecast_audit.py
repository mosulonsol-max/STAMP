"""Immutable forecast journal and strictly time-ordered outcome scoring.

Forecasts are experimental observations, NOT trading recommendations.
Run on every monitoring cycle; outcomes use future observed prices only.
"""
import datetime as dt,json,math,pathlib,uuid
from adaptive_feedback import calibrate
ROOT=pathlib.Path(__file__).resolve().parents[1]
JOURNAL=ROOT/"data"/"forecast_journal.jsonl"
HORIZONS={"15m":900,"1h":3600,"4h":14400,"24h":86400,"7d":604800}
def utc(s):return dt.datetime.fromisoformat(s.replace("Z","+00:00"))
def read():
    if not JOURNAL.exists():return []
    out=[]
    for line in JOURNAL.read_text().splitlines():
        if line.strip():
            try:out.append(json.loads(line))
            except json.JSONDecodeError:pass
    return out
def append(event):
    JOURNAL.parent.mkdir(exist_ok=True)
    with JOURNAL.open("a") as f:f.write(json.dumps(event,ensure_ascii=False,sort_keys=True)+"\n")
def evaluate(rows,now,price):
    """Do not score a matured prediction against an unrelated much later price."""
    for event in rows:
        if event.get("event")!="forecast":continue
        fid=event["id"]
        if any(x.get("event")=="outcome" and x.get("forecast_id")==fid for x in rows):continue
        due=utc(event["due_at_utc"])
        elapsed=(now-due).total_seconds()
        if elapsed<0:continue
        # 5-minute scheduled polls can drift; after 20 minutes outcome is missing, not a valid backfill.
        if elapsed>1200:
            append({"event":"outcome","forecast_id":fid,"status":"missing_timely_observation","evaluated_at_utc":now.isoformat()})
            continue
        base=event["reference_price"]
        actual=math.log(price/base)
        predicted=event["predicted_log_return"]
        append({"event":"outcome","forecast_id":fid,"status":"evaluated","evaluated_at_utc":now.isoformat(),
                "actual_price":price,"actual_log_return":actual,"predicted_log_return":predicted,
                "absolute_log_error":abs(actual-predicted),"baseline_zero_error":abs(actual),
                "direction_correct":(actual>0)==(predicted>0) if actual!=0 and predicted!=0 else None,
                "explanation":"Outcome comparison only; causal attribution not established."})
def run(snapshot):
    now=utc(snapshot["raw"]["collected_at_utc"])
    ticker=snapshot["raw"]["mexc"]["ticker"]["data"]
    if not isinstance(ticker,dict):return {"status":"no_ticker"}
    price=float(ticker["lastPrice"])
    if not math.isfinite(price) or price<=0:return {"status":"invalid_price"}
    rows=read()
    evaluate(rows,now,price)
    model=snapshot["analysis"]["ml_experimental"]
    # Predictions are issued only when out-of-sample gate passed.
    validated=model.get("status")=="experimental_validated"
    # Shadow forecasts accumulate evidence even when ML fails validation; never publish as signals.
    if not validated and snapshot["analysis"]["indicators"]["1h"].get("quality")!="indicators_only_not_calibrated_forecast":
        return {"status":"abstain","reason":"insufficient hourly indicators"}
    # one forecast per hourly candle, prevent duplicate issuance across five-minute polls
    candle=snapshot["analysis"]["indicators"]["1h"].get("last_closed_open_time_ms")
    if candle is None:return {"status":"no_candle"}
    key=str(candle)
    if any(x.get("event")=="forecast" and x.get("source_candle")==key for x in rows):
        return {"status":"already_issued"}
    prediction=float(model["predicted_return_log"]) if validated else math.log(snapshot["analysis"]["indicators"]["1h"]["ema6"]/snapshot["analysis"]["indicators"]["1h"]["ema20"])*0.10
    if not math.isfinite(prediction):return {"status":"invalid_prediction"}
    version="gradient_boosting_v1" if validated else "ema_gap_shadow_v1"
    # Re-read to include outcomes appended by evaluate() in this cycle.
    feedback=calibrate(read(),version,prediction)
    prediction=feedback["prediction"]
    fid=str(uuid.uuid4())
    append({"event":"forecast","id":fid,"source_candle":key,"created_at_utc":now.isoformat(),
            "due_at_utc":(now+dt.timedelta(hours=1)).isoformat(),"horizon":"1h",
            "reference_price":price,"predicted_log_return":prediction,
            "predicted_direction":"up" if prediction>0 else "down" if prediction<0 else "flat",
            "model_status":model["status"],"forecast_class":"validated_experimental" if validated else "shadow_unvalidated",
            "model_version":version,"feedback":feedback,
            "validation_mae":model.get("mae"),
            "baseline_mae":model.get("zero_return_baseline_mae"),
            "evidence_flags":snapshot["analysis"].get("flags",[])})
    return {"status":"forecast_issued","id":fid}
if __name__=="__main__":
    p=ROOT/"data"/"latest.json"
    print(json.dumps(run(json.loads(p.read_text())),ensure_ascii=False))

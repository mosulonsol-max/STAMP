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
def historical_close(due,now,root=ROOT):
    """Nearest *completed* 15m exchange candle close at/after due (max 15m late).

    This is a retrospective, approximate outcome, never a live-at-due tick.
    """
    path=root/"data"/"candles"/"15m.json"
    try: candles=json.loads(path.read_text())
    except (OSError,ValueError):return None
    due_ms=int(due.timestamp()*1000)
    now_ms=int(now.timestamp()*1000)
    choices=[]
    for c in candles:
        try:
            close_ms=int(c["t"])+900000
            price=float(c["c"])
            if due_ms<=close_ms<=min(due_ms+900000,now_ms) and math.isfinite(price) and price>0:
                choices.append((close_ms,price))
        except (TypeError,ValueError,KeyError):continue
    if not choices:return None
    close_ms,price=min(choices)
    return price,dt.datetime.fromtimestamp(close_ms/1000,dt.timezone.utc)

def evaluate(rows,now,price,root=ROOT):
    """Use exchange candle history when GitHub scheduled runs arrive too late.

    Preserve original missing outcomes and append a separately labelled recovery;
    never silently promote retrospective candles to live observations.
    """
    outcomes={x.get("forecast_id"):x for x in rows if x.get("event")=="outcome"}
    for event in rows:
        if event.get("event")!="forecast":continue
        fid=event["id"]
        previous=outcomes.get(fid,{})
        if previous.get("status") in ("evaluated","evaluated_historical"):continue
        due=utc(event["due_at_utc"])
        elapsed=(now-due).total_seconds()
        if elapsed<0:continue
        observation=historical_close(due,now,root)
        if observation is not None:
            actual_price,measurement_time=observation
            status="evaluated_historical"
            provenance={"price_source":"MEXC_15m_completed_candle","measurement_time_utc":measurement_time.isoformat(),
                        "measurement_offset_seconds":round((measurement_time-due).total_seconds()),
                        "historical_reconstruction":True}
        elif 0<=elapsed<=1200 and not previous:
            # A current ticker is a delayed observation, not a timestamp-perfect price.
            actual_price=price
            status="evaluated"
            provenance={"price_source":"MEXC_current_ticker","measurement_time_utc":now.isoformat(),
                        "measurement_offset_seconds":round(elapsed),"historical_reconstruction":False}
        else:
            if elapsed>1200 and not previous:
                append({"event":"outcome","forecast_id":fid,"status":"missing_timely_observation",
                        "evaluated_at_utc":now.isoformat(),"reason":"No close-enough completed candle or timely ticker"})
            continue
        base=float(event["reference_price"])
        predicted=float(event["predicted_log_return"])
        if not all(map(math.isfinite,(base,actual_price,predicted))) or base<=0:continue
        actual=math.log(actual_price/base)
        append({"event":"outcome","forecast_id":fid,"status":status,"evaluated_at_utc":now.isoformat(),
                "actual_price":actual_price,"actual_log_return":actual,"predicted_log_return":predicted,
                "absolute_log_error":abs(actual-predicted),"baseline_zero_error":abs(actual),
                "direction_correct":(actual>0)==(predicted>0) if actual!=0 and predicted!=0 else None,
                "explanation":"Historical candle close is approximate, not proof of execution or a live price at due.",
                **provenance})
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

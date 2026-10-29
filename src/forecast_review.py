"""Auditable forecast review: immutable forecast/outcome events, never retroactively change predictions."""
import math
from datetime import datetime, timezone

def _timestamp(value):
    try:
        t=datetime.fromisoformat(str(value).replace("Z","+00:00"))
        return t if t.tzinfo else None
    except (ValueError,TypeError):
        return None

def review(events, limit=100):
    """Return chronological comparisons and a diagnostic summary; no causal claims."""
    forecasts={}
    outcomes={}
    for event in events if isinstance(events,list) else []:
        if not isinstance(event,dict):
            continue
        if event.get("event")=="forecast" and event.get("id"):
            forecasts.setdefault(event["id"],event)
        elif event.get("event")=="outcome" and event.get("forecast_id"):
            outcomes[event["forecast_id"]]=event
    rows=[]
    for fid,f in forecasts.items():
        o=outcomes.get(fid,{})
        reference=f.get("reference_price")
        predicted=f.get("predicted_log_return")
        actual=o.get("actual_price")
        try:
            reference=float(reference)
            predicted=float(predicted)
            prediction_valid=math.isfinite(reference) and math.isfinite(predicted) and reference>0 and abs(predicted)<100
        except (ValueError,TypeError):
            prediction_valid=False
        predicted_price=reference*math.exp(predicted) if prediction_valid else None
        try:
            actual=float(actual)
            actual_valid=math.isfinite(actual) and actual>0
        except (ValueError,TypeError):
            actual_valid=False
        evaluated=o.get("status") in ("evaluated","evaluated_historical") and prediction_valid and actual_valid
        due=_timestamp(f.get("due_at_utc"))
        measured=_timestamp(o.get("measurement_time_utc"))
        rows.append({
            "id":fid,"created_utc":f.get("created_at_utc"),"due_utc":f.get("due_at_utc"),
            "horizon":f.get("horizon"),"model":f.get("model_version"),
            "forecast_class":f.get("forecast_class"),
            "status":o.get("status","pending"),
            "reference_price":reference if prediction_valid else None,
            "predicted_price":predicted_price,
            "actual_price":actual if evaluated else None,
            "absolute_error":abs(predicted_price-actual) if evaluated else None,
            "absolute_log_error":abs(predicted-math.log(actual/reference)) if evaluated else None,
            "baseline_log_error":abs(math.log(actual/reference)) if evaluated else None,
            "direction_correct":((predicted>0)==(actual>reference)) if evaluated and predicted!=0 and actual!=reference else None,
            "measurement_time_utc":o.get("measurement_time_utc"),
            "measurement_offset_seconds":(measured-due).total_seconds() if due and measured else None,
            "evidence_flags":f.get("evidence_flags",[])
        })
    rows=rows[-limit:][::-1]
    valid=[r for r in rows if r["absolute_log_error"] is not None]
    n=len(valid)
    model_mae=sum(r["absolute_log_error"] for r in valid)/n if n else None
    baseline_mae=sum(r["baseline_log_error"] for r in valid)/n if n else None
    directions=[r["direction_correct"] for r in valid if r["direction_correct"] is not None]
    return {"rows":rows,"summary":{
        "evaluated":n,"pending_or_unverified":len(rows)-n,
        "direction_accuracy":sum(directions)/len(directions) if directions else None,
        "model_log_mae":model_mae,"zero_return_log_mae":baseline_mae,
        "beats_baseline":model_mae<baseline_mae if model_mae is not None and baseline_mae is not None else None,
        "warning":"Historical evaluation only; no causality or calibrated probability. Do not promote models from in-sample feedback."
    }}

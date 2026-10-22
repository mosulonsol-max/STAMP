"""Causal feedback controller: learn from matured predictions, never rewrite history."""
import math
def calibrate(rows,model_version,raw_prediction,min_samples=20):
    forecasts={x.get("id"):x for x in rows if x.get("event")=="forecast" and x.get("model_version")==model_version}
    paired=[]
    for x in rows:
        if x.get("event")!="outcome" or x.get("status")!="evaluated":continue
        f=forecasts.get(x.get("forecast_id"))
        if f and math.isfinite(float(x.get("actual_log_return",float("nan")))):
            paired.append((float(f["predicted_log_return"]),float(x["actual_log_return"])))
    if len(paired)<min_samples:
        return {"status":"collecting_evidence","samples":len(paired),"prediction":raw_prediction,
                "adjustment":0.0,"version":"causal_feedback_v1"}
    # Calibrate only using previously matured outcomes. Shrink unstable signals toward zero.
    recent=paired[-100:]
    raw_mae=sum(abs(a-p) for p,a in recent)/len(recent)
    zero_mae=sum(abs(a) for p,a in recent)/len(recent)
    # Never magnify unproven signal; progressively shrink if historical error exceeds zero baseline.
    shrink=min(1.0,max(0.0,(zero_mae/raw_mae-0.8))) if raw_mae>0 else 1.0
    calibrated=raw_prediction*shrink
    return {"status":"feedback_applied","samples":len(recent),"prediction":calibrated,
            "adjustment":calibrated-raw_prediction,"shrink_factor":shrink,
            "recent_mae":raw_mae,"recent_zero_baseline_mae":zero_mae,"version":"causal_feedback_v1",
            "note":"Causal risk shrinkage only, not proof of forecasting accuracy."}

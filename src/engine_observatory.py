"""A bounded view of the worker's actual computation and prospective evidence."""
import datetime as dt
import math
from collections import Counter
from multi_asset_governor import audit_records
try:
    from forecast_adaptation import transferred_model
except ImportError:
    from src.forecast_adaptation import transferred_model

FRAMES=("15m","1h","4h","1d")
def summarize(data,pair,worker=None):
    now=dt.datetime.now(dt.timezone.utc)
    records=[r for r in data.get("records",[]) if r.get("pair")==pair]
    records.sort(key=lambda r:(r.get("reference_at_utc", ""),r.get("id", "")))
    reviews=(data.get("autonomous_review") or {}).get("decisions") or {}
    def entry(r):
        features=r.get("features") or {}
        returns=features.get("recent_returns")
        version=r.get("model_version") or r.get("method") or "unknown"
        scale=0 if version=="no_change" else .5 if version.startswith("damped_") else -.5 if version.startswith("reversal_") else 1
        lookback=int(version.split("_")[-1]) if version.startswith(("momentum_","damped_","reversal_")) and version.split("_")[-1].isdigit() else 6
        valid=isinstance(returns,list) and len(returns)>=lookback and all(isinstance(x,(float,int)) and math.isfinite(x) for x in returns)
        expected=None;matches=None
        if valid:
            try:
                expected=float(r["reference_price"])*math.exp(scale*sum(returns[-lookback:])/lookback)
                if not math.isfinite(expected) or expected<=0:raise ValueError("invalid_calculation")
                matches=math.isclose(expected,float(r["predicted_price"]),rel_tol=1e-9)
            except (KeyError,TypeError,ValueError,OverflowError):expected=None
        return {k:r.get(k) for k in ("id","frame","reference_at_utc","due_at_utc","reference_price","predicted_price","outcome","validation_at_issue","model_origin")}|{
            "model_version":version,"inputs":{"source":"MEXC closed spot candles","recent_log_returns":returns if valid else [],"lookback":lookback,"available":valid},
            "calculation":{"formula":f"Reference × exp({scale:g} × mean of last {lookback} log returns)","recomputed_price":expected,"matches_recorded":matches},
            "review":reviews.get(r.get("id"),{"status":"unreviewed","reason":"no_saved_decision"})}
    ids = Counter(record.get("id") for record in records)
    valid = [record for record in records if ids[record.get("id")] == 1
             and audit_records([record], now)["passed"]]
    latest = {}
    for record in reversed(valid):
        frame = record["frame"]
        if frame not in latest:
            latest[frame] = entry(record)
    settled = [record for record in valid if record.get("outcome")]
    invalid_outcomes = sum(bool(record.get("outcome")) for record in records) - len(settled)
    counts = {status: sum(reviews.get(record.get("id"), {}).get("status") == status
                          for record in valid) for status in ("accepted", "rejected", "pending")}
    last_cycle=data.get("cycle_result") or {}
    diagnostic=data.get("model_selection_diagnostics") or {}
    return {"symbol":pair,"source":"worker_recorded_computation","generated_utc":now.isoformat(),"storage":"postgres" if worker and worker.get("storage")=="postgres" else "ephemeral_filesystem",
        "worker":worker or {},"archive_updated_at_utc":data.get("loop_updated_at_utc"),"review_updated_at_utc":(data.get("autonomous_review") or {}).get("checked_at_utc"),
        "coverage":{"universe":(data.get("universe") or {}).get("count"),"archive_records":data.get("archive_records_total",len(data.get("records",[]))),"pair_records":len(records),"settled":len(settled),"invalid_outcomes":invalid_outcomes,"decisions":counts},
        "collection":{"source":"MEXC closed spot candles","processed_in_last_batch":pair in last_cycle.get("processed",[]),"last_batch_at_utc":last_cycle.get("at_utc"),"last_error":last_cycle.get("failed",{}).get(pair),"retry_queued":pair in data.get("retry_pairs",[])},
        "settlement_queue":data.get("settlement") or {},"latest":latest,"recent_outcomes":[entry(r) for r in settled[-16:]],
        "validation":{frame:(data.get("validation") or {}).get(pair+"|"+frame,{}) for frame in FRAMES},
        "learning":{"peer_models":{frame:model for frame in FRAMES if (model:=transferred_model(data,pair,frame))},"selected_models":{frame:value for frame in FRAMES if (value:=(data.get("model_selections") or {}).get(pair+"|"+frame))},"adaptation":{frame:value for frame in FRAMES if (value:=(data.get("forecast_adaptation") or {}).get(pair+"|"+frame))},"next_action":diagnostic.get("next_action"),"missing_historical_features":diagnostic.get("historical_features_unrecoverable"),"policy":"Candidates must improve error by 5% on a chronological holdout and 20 later outcomes. Degraded adaptive models revert to unchanged price."},
        "input_contract":{"used":["Closed candle prices","Recorded recent log returns","Verified target candle outcomes for evaluation"],"observed_only":["Cross-venue order books","Cross-venue candle momentum","Global exchange sessions","Public executed buy/sell samples"],"not_implemented":["News-driven forecasts","On-chain holder features in this model","Automatic live trade execution"]},
        "trading_approved":False}

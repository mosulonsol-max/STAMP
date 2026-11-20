"""A bounded view of the worker's actual computation and prospective evidence."""
import datetime as dt
import math

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
        lookback=int(version.split("_")[-1]) if version.startswith("momentum_") and version.split("_")[-1].isdigit() else 6
        valid=isinstance(returns,list) and len(returns)>=lookback and all(isinstance(x,(float,int)) and math.isfinite(x) for x in returns)
        expected=None;matches=None
        if valid:
            try:
                expected=float(r["reference_price"])*math.exp(sum(returns[-lookback:])/lookback)
                if not math.isfinite(expected) or expected<=0:raise ValueError("invalid_calculation")
                matches=math.isclose(expected,float(r["predicted_price"]),rel_tol=1e-9)
            except (KeyError,TypeError,ValueError,OverflowError):expected=None
        return {k:r.get(k) for k in ("id","frame","reference_at_utc","due_at_utc","reference_price","predicted_price","outcome","validation_at_issue")}|{
            "model_version":version,"inputs":{"source":"MEXC closed spot candles","recent_log_returns":returns if valid else [],"lookback":lookback,"available":valid},
            "calculation":{"formula":"reference_price × exp(mean(last N log returns))","recomputed_price":expected,"matches_recorded":matches},
            "review":reviews.get(r.get("id"),{"status":"unreviewed","reason":"no_saved_decision"})}
    latest={frame:entry(next(r for r in reversed(records) if r.get("frame")==frame)) for frame in FRAMES if any(r.get("frame")==frame for r in records)}
    settled=[r for r in records if r.get("outcome")]
    counts={status:sum(reviews.get(r.get("id"),{}).get("status")==status for r in records) for status in ("accepted","rejected","pending")}
    last_cycle=data.get("cycle_result") or {}
    diagnostic=data.get("model_selection_diagnostics") or {}
    return {"symbol":pair,"source":"worker_recorded_computation","generated_utc":now.isoformat(),"storage":"postgres" if worker and worker.get("storage")=="postgres" else "ephemeral_filesystem",
        "worker":worker or {},"archive_updated_at_utc":data.get("loop_updated_at_utc"),"review_updated_at_utc":(data.get("autonomous_review") or {}).get("checked_at_utc"),
        "coverage":{"universe":(data.get("universe") or {}).get("count"),"archive_records":data.get("archive_records_total",len(data.get("records",[]))),"pair_records":len(records),"settled":len(settled),"decisions":counts},
        "collection":{"source":"MEXC closed spot candles","processed_in_last_batch":pair in last_cycle.get("processed",[]),"last_batch_at_utc":last_cycle.get("at_utc"),"last_error":last_cycle.get("failed",{}).get(pair),"retry_queued":pair in data.get("retry_pairs",[])},
        "latest":latest,"recent_outcomes":[entry(r) for r in settled[-16:]],
        "validation":{frame:(data.get("validation") or {}).get(pair+"|"+frame,{}) for frame in FRAMES},
        "learning":{"selected_models":{frame:value for frame in FRAMES if (value:=(data.get("model_selections") or {}).get(pair+"|"+frame))},"next_action":diagnostic.get("next_action"),"missing_historical_features":diagnostic.get("historical_features_unrecoverable"),"policy":"Chronological training and holdout; candidate must improve holdout error by at least 5% against incumbent and no-change baseline."},
        "input_contract":{"used":["Closed candle prices","Recorded recent log returns","Verified target candle outcomes for evaluation"],"observed_only":["Cross-venue order books","Cross-venue candle momentum","Global exchange sessions","Public executed buy/sell samples"],"not_implemented":["News-driven forecasts","On-chain holder features in this model","Automatic live trade execution"]},
        "trading_approved":False}

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
        base_version=version.removesuffix("_validated_news")
        scale=0 if base_version=="no_change" else .5 if base_version.startswith("damped_") else -.5 if base_version.startswith("reversal_") else 1
        lookback=int(base_version.split("_")[-1]) if base_version.startswith(("momentum_","damped_","reversal_")) and base_version.split("_")[-1].isdigit() else 6
        valid=isinstance(returns,list) and len(returns)>=lookback and all(isinstance(x,(float,int)) and math.isfinite(x) for x in returns)
        expected=None;matches=None
        if valid:
            try:
                expected=float(r["reference_price"])*math.exp(scale*sum(returns[-lookback:])/lookback)
                news_effect=r.get("news_effect") or {}
                if news_effect.get("used_in_directional_forecast"):
                    expected*=math.exp(float(news_effect["applied_log_return_adjustment"]))
                if not math.isfinite(expected) or expected<=0:raise ValueError("invalid_calculation")
                matches=math.isclose(expected,float(r["predicted_price"]),rel_tol=1e-9)
            except (KeyError,TypeError,ValueError,OverflowError):expected=None
        news_effect=r.get("news_effect") or {}
        display_version=version+"_validated_news" if news_effect.get("used_in_directional_forecast") else version
        return {k:r.get(k) for k in ("id","frame","reference_at_utc","due_at_utc","reference_price","predicted_price","outcome","validation_at_issue","model_origin")}|{
            "model_version":display_version,"inputs":{"source":"MEXC closed spot candles","recent_log_returns":returns if valid else [],"lookback":lookback,"news":features.get("news"),"available":valid},
            "calculation":{"formula":f"Reference × exp({scale:g} × mean of last {lookback} log returns + validated news correction)","recomputed_price":expected,"matches_recorded":matches},
            "news_effect":r.get("news_effect"),
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
    # A target is achieved when the audited close is within 1% of its price.
    # Compare only the same pair, frame and model, with no pooling across venues.
    groups = {}
    for record in settled:
        model = record.get("model_version") or record.get("method")
        if (record.get("news_effect") or {}).get("used_in_directional_forecast"):
            model += "_validated_news"
        if model:
            groups.setdefault(record["frame"], {}).setdefault(model, []).append(record)
    target_rates = {}
    for frame, models in groups.items():
        target_rates[frame] = {}
        for model, outcomes in models.items():
            sample = outcomes[-100:]
            hits = sum(abs(float(record["outcome"]["actual_price"]) /
                           float(record["predicted_price"]) - 1) <= .01 for record in sample)
            target_rates[frame][model] = {"hits": hits, "samples": len(sample),
                                         "rate": hits / len(sample) if len(sample) >= 30 else None}
    by_verified_at = sorted(settled, key=lambda record: record["outcome"]["measured_at_utc"])[-16:]
    scene_outcomes = [{"id": record["id"], "frame": record["frame"],
                       "measured_at_utc": record["outcome"]["measured_at_utc"]}
                      for record in by_verified_at]
    invalid_outcomes = sum(bool(record.get("outcome")) for record in records) - len(settled)
    counts = {status: sum(reviews.get(record.get("id"), {}).get("status") == status
                          for record in valid) for status in ("accepted", "rejected", "pending")}
    last_cycle=data.get("cycle_result") or {}
    diagnostic=data.get("model_selection_diagnostics") or {}
    news=data.get("news_intelligence") or {}
    news_models=news.get("models") or {}
    news_active=any((model or {}).get("used_in_directional_forecast") for model in news_models.values())
    used_inputs=["Closed candle prices","Recorded recent log returns","Verified target candle outcomes for evaluation"]
    if news_active:used_inputs.append("Economic, political and digital-asset headline correction with prospective walk-forward validation")
    observed_inputs=["Corroborated headline sentiment awaiting prospective validation","Cross-venue order books","Cross-venue candle momentum","Global exchange sessions","Public executed buy/sell samples"]
    return {"symbol":pair,"source":"worker_recorded_computation","generated_utc":now.isoformat(),"storage":"postgres" if worker and worker.get("storage")=="postgres" else "ephemeral_filesystem",
        "worker":worker or {},"archive_updated_at_utc":data.get("loop_updated_at_utc"),"review_updated_at_utc":(data.get("autonomous_review") or {}).get("checked_at_utc"),
        "coverage":{"universe":(data.get("universe") or {}).get("count"),"archive_records":data.get("archive_records_total",len(data.get("records",[]))),"pair_records":len(records),"settled":len(settled),"invalid_outcomes":invalid_outcomes,"decisions":counts},
        "collection":{"source":"MEXC closed spot candles","processed_in_last_batch":pair in last_cycle.get("processed",[]),"last_batch_at_utc":last_cycle.get("at_utc"),"last_error":last_cycle.get("failed",{}).get(pair),"retry_queued":pair in data.get("retry_pairs",[])},
        "target_rates":target_rates,"scene_outcomes":scene_outcomes,"settlement_queue":data.get("settlement") or {},"latest":latest,"recent_outcomes":[entry(r) for r in settled[-16:]],
        "validation":{frame:(data.get("validation") or {}).get(pair+"|"+frame,{}) for frame in FRAMES},
        "learning":{"peer_models":{frame:model for frame in FRAMES if (model:=transferred_model(data,pair,frame))},"selected_models":{frame:value for frame in FRAMES if (value:=(data.get("model_selections") or {}).get(pair+"|"+frame))},"adaptation":{frame:value for frame in FRAMES if (value:=(data.get("forecast_adaptation") or {}).get(pair+"|"+frame))},"next_action":diagnostic.get("next_action"),"missing_historical_features":diagnostic.get("historical_features_unrecoverable"),"policy":"Candidates must improve error by 5% on a chronological holdout and 20 later outcomes. Degraded adaptive models revert to unchanged price."},
        "news_model":{"status":"validated" if news_active else "collecting_prospective_evidence","models":news_models,"source_status":news.get("status"),"checked_at_utc":news.get("checked_at_utc")},
        "input_contract":{"used":used_inputs,"observed_only":observed_inputs,"not_implemented":["On-chain holder features in this model","Automatic live trade execution"]},
        "trading_approved":False}

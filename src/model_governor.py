"""Automatic, auditable approval and demotion of the internal forecasting models.

The UI has no approval control. Decisions use the model's causal forward tests
and independently matured, nonoverlapping journal outcomes for that exact version.
"""
import datetime as dt
import json
import math
import pathlib
from research_engine import wilson_interval

ROOT=pathlib.Path(__file__).resolve().parents[1]

def timestamp(value):
    try:
        parsed=dt.datetime.fromisoformat(str(value).replace("Z","+00:00"))
        return parsed if parsed.tzinfo else None
    except (ValueError,TypeError):return None

def finite(value):
    try:return math.isfinite(float(value))
    except (ValueError,TypeError):return False

def journal_metrics(events,version,horizon,now):
    forecasts={};outcomes={}
    for e in events:
        if e.get("event")=="forecast" and e.get("id"):forecasts.setdefault(e["id"],e)
        elif e.get("event")=="outcome" and e.get("forecast_id"):outcomes[e["forecast_id"]]=e
    verified=[]
    for fid,f in forecasts.items():
        if f.get("model_version")!=version or f.get("horizon")!=horizon:continue
        outcome=outcomes.get(fid,{})
        created=timestamp(f.get("created_at_utc"));due=timestamp(f.get("due_at_utc"))
        measured=timestamp(outcome.get("measurement_time_utc"));reference=timestamp(f.get("reference_at_utc")) or created
        if not all((created,due,measured,reference)) or not reference<=created<due<=now or measured>now:continue
        offset=abs((measured-due).total_seconds())
        timely=outcome.get("status")=="evaluated" and offset<=120
        # An immutable forecast issued before its target, measured at the exact
        # target candle close, is prospective evidence even if collected later.
        exact=outcome.get("status")=="evaluated_historical" and offset==0 and f.get("reference_at_utc") and outcome.get("price_source")=="MEXC_15m_completed_candle"
        if not (timely or exact):continue
        try:
            base=float(f["reference_price"]);actual_price=float(outcome["actual_price"]);pred=float(f["predicted_log_return"])
            if min(base,actual_price)<=0 or not all(map(math.isfinite,(base,actual_price,pred))):continue
            actual=math.log(actual_price/base)
            verified.append((reference,due,abs(actual-pred),abs(actual),None if actual==0 or pred==0 else (actual>0)==(pred>0)))
        except (ValueError,TypeError,KeyError):continue
    # Overlapping multi-hour predictions cannot be counted as independent trials.
    independent=[];last_end=None
    for row in sorted(verified,key=lambda r:(r[0],r[1])):
        if last_end is not None and row[0]<last_end:continue
        independent.append(row);last_end=row[1]
    independent=independent[-120:]
    directions=[r[4] for r in independent if r[4] is not None];n=len(independent)
    mae=sum(r[2] for r in independent)/n if n else None
    baseline=sum(r[3] for r in independent)/n if n else None
    return dict(samples=n,direction_samples=len(directions),direction_correct=sum(directions),
        direction_accuracy=sum(directions)/len(directions) if directions else None,
        direction_wilson_95=wilson_interval(sum(directions),len(directions)),
        mae=mae,baseline_mae=baseline,skill_vs_zero=1-mae/baseline if baseline else None,
        excluded_overlapping_or_old=max(0,len(verified)-n),
        measurement_policy="timely tick or exact future candle close; approximate reconstructions excluded")

def decide(report,events,now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    f=report.get("forecast") or {};h=report.get("horizon")
    version=f.get("model_version");selected=report.get("selected_model")
    candidate=(report.get("challengers") or {}).get(selected) or {}
    gate=report.get("promotion_gate") or {}
    minimum=gate.get("min_validation_samples",100);gain=gate.get("min_mae_improvement_vs_zero",.10)
    lower=gate.get("wilson_95_lower_direction_accuracy_gt",.5)
    metrics=journal_metrics(events,version,h,now) if version else journal_metrics([],None,h,now)
    reasons=[]
    if report.get("validation_samples",0)<minimum:reasons.append("insufficient_forward_validation")
    if not finite(candidate.get("skill_vs_zero")) or candidate["skill_vs_zero"]<gain:reasons.append("forward_error_not_better_than_baseline")
    ci=candidate.get("direction_wilson_95") or [None,None]
    if not finite(ci[0]) or ci[0]<=lower:reasons.append("forward_direction_uncertain")
    if metrics["samples"]<minimum or metrics["direction_samples"]<minimum:reasons.append("insufficient_prospective_outcomes")
    if metrics["samples"]>=minimum:
        if metrics["skill_vs_zero"] is None or metrics["skill_vs_zero"]<gain:reasons.append("recent_prediction_error_not_better_than_baseline")
        if metrics["direction_wilson_95"][0] is None or metrics["direction_wilson_95"][0]<=lower:reasons.append("recent_direction_uncertain")
    asof=report.get("asof_candle_close_ms")
    if not f or not finite(asof) or now.timestamp()*1000-float(asof)>5400000 or float(asof)>now.timestamp()*1000+300000:reasons.append("model_input_unavailable_or_stale")
    approved=not reasons and bool(version)
    return dict(status="approved" if approved else "experimental",automatic=True,
        engine="internal_model_governor_v1",scope="research_forecasting",horizon=h,
        model_version=version,selected_model=selected,decided_at_utc=now.isoformat(),
        reason_codes=reasons or ["forward_and_prospective_evidence_passed"],
        forward_validation=dict(samples=report.get("validation_samples",0),**candidate),
        prospective=metrics,policy=dict(minimum_outcomes=minimum,minimum_error_improvement=gain,directional_lower_bound_gt=lower),
        next_review="on newly completed candles and matured forecast outcomes")

def read_events(path):
    rows=[]
    if path.exists():
        for line in path.read_text().splitlines():
            try:rows.append(json.loads(line))
            except ValueError:continue
    return rows

def govern(reports,events,root=ROOT,now=None):
    now=now or dt.datetime.now(dt.timezone.utc);data=root/"data";data.mkdir(exist_ok=True)
    path=data/"model_registry.json"
    try:previous=json.loads(path.read_text()) if path.exists() else {}
    except ValueError:previous={}
    decisions={h:decide(r,events,now) for h,r in reports.items()}
    for h,d in decisions.items():
        old=(previous.get("horizons") or {}).get(h,{})
        if (old.get("status"),old.get("model_version"))!=(d["status"],d["model_version"]):
            transition=dict(event="automatic_state_transition",from_status=old.get("status"),to_status=d["status"],**{k:d[k] for k in ("horizon","model_version","decided_at_utc","reason_codes")})
            with (data/"model_decisions.jsonl").open("a") as stream:stream.write(json.dumps(transition)+"\n")
    registry=dict(generated_at_utc=now.isoformat(),authority="internal_model_governor_v1",manual_override_available=False,horizons=decisions)
    path.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+"\n")
    return decisions

def refresh(root=ROOT,now=None):
    data=root/"data";path=data/"latest.json";snapshot=json.loads(path.read_text())
    reports=snapshot.get("analysis",{}).get("prediction_report",{}).get("horizons",{})
    decisions=govern(reports,read_events(data/"forecast_journal.jsonl"),root,now)
    snapshot["analysis"]["model_decisions"]=decisions
    path.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+"\n")
    return decisions

if __name__=="__main__":print(json.dumps({h:d["status"] for h,d in refresh().items()}))

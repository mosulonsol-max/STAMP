"""Fail-closed output checks. Operational health is separate from predictive validity.

Single-pair approval is never evidence that all pairs are ready. Uses the server
model governor's evidence for the exact version and horizon; no manual overrides.
"""
import datetime as dt
import math
HOURS={"1h":1,"4h":4,"24h":24,"7d":168}
def timestamp(s):
    try:
        t=dt.datetime.fromisoformat(str(s).replace('Z','+00:00'))
        return t if t.tzinfo else None
    except (ValueError,TypeError):return None
def finite(v):
    try:return v is not None and math.isfinite(float(v))
    except (ValueError,TypeError):return False

def assess(payload,now=None):
    now=now or dt.datetime.now(dt.timezone.utc);rows={}
    decisions=payload.get('model_decisions') or {};forecasts=payload.get('forecasts') or {}
    for h,hours in HOURS.items():
        report=forecasts.get(h);report=report if isinstance(report,dict) else {}
        f=report.get('forecast') or {};d=decisions.get(h) or {};issues=[]
        issued=timestamp(f.get('created_at_utc'));reference=timestamp(f.get('reference_at_utc'));due=timestamp(f.get('due_at_utc'))
        if not all((issued,reference,due)) or not reference<=issued<due or issued>now:issues.append('invalid_forecast_timestamps')
        if reference and due and abs((due-reference).total_seconds()-hours*3600)>1:issues.append('incorrect_target_horizon')
        if not all(finite(f.get(k)) for k in ('reference_price','predicted_price','predicted_log_return')) or not float(f.get('reference_price',0))>0 or not float(f.get('predicted_price',0))>0:issues.append('invalid_forecast_values')
        elif abs(float(f['predicted_log_return']))>100 or not math.isclose(float(f['predicted_price']),float(f['reference_price'])*math.exp(float(f['predicted_log_return'])),rel_tol=1e-6):issues.append('inconsistent_forecast_values')
        if f.get('horizon')!=h:issues.append('incorrect_forecast_horizon')
        if not d.get('automatic') or d.get('engine')!='internal_model_governor_v1' or d.get('model_version')!=f.get('model_version'):issues.append('missing_matching_model_decision')
        checked=timestamp(d.get('decided_at_utc'))
        if not checked or not -300<=(now-checked).total_seconds()<=9000:issues.append('model_decision_stale')
        if not reference or not -300<=(now-reference).total_seconds()<=9000:issues.append('model_input_stale')
        if due and due<=now:issues.append('forecast_target_elapsed')
        forward=d.get('forward_validation') or {};prospective=d.get('prospective') or {}
        reasons=d.get('reason_codes') or []
        failed=any(code in reasons for code in ('forward_error_not_better_than_baseline','forward_direction_uncertain','recent_prediction_error_not_better_than_baseline','recent_direction_uncertain'))
        validity='failed_evidence' if failed else 'insufficient_evidence'
        evidence_passed=all(finite(m.get('samples')) and float(m['samples'])>=100 and
            finite(m.get('skill_vs_zero')) and float(m['skill_vs_zero'])>=.10 and
            isinstance(m.get('direction_wilson_95'),list) and len(m['direction_wilson_95'])==2 and
            finite(m['direction_wilson_95'][0]) and float(m['direction_wilson_95'][0])>.5
            for m in (forward,prospective)) and finite(prospective.get('direction_samples')) and float(prospective['direction_samples'])>=100
        if d.get('status')=='approved' and not evidence_passed:issues.append('approval_evidence_inconsistent')
        if d.get('status')=='approved' and evidence_passed and not issues:validity='approved_research'
        rows[h]=dict(production_status='valid' if not issues else 'degraded',issues=issues,
            predictive_validity=validity,model_version=f.get('model_version'),issued_at_utc=f.get('created_at_utc'),
            target_at_utc=f.get('due_at_utc'),decision_at_utc=d.get('decided_at_utc'),
            forward=forward,prospective=prospective,reason_codes=reasons)
    review=(payload.get('forecast_review') or {}).get('rows') or []
    overdue=sum(1 for r in review if timestamp(r.get('due_utc')) and timestamp(r['due_utc'])<now-dt.timedelta(minutes=15) and r.get('actual_price') is None)
    production_ok=all(r['production_status']=='valid' for r in rows.values())
    reasons=['no_independent_cross_pair_validation','single_pair_results_do_not_generalize']
    if not production_ok:reasons.append('output_checks_degraded')
    if any(r['predictive_validity']!='approved_research' for r in rows.values()):reasons.append('forecast_quality_not_approved')
    if overdue:reasons.append('overdue_outcomes_unverified')
    return dict(checked_at_utc=now.isoformat(),production_status='healthy' if production_ok and not overdue else 'degraded',
        horizons=rows,overdue_unverified_in_recent_journal=overdue,
        rollout=dict(ready=False,status='blocked',scope='all_pairs',reason_codes=reasons,
            required_evidence=['independent per-pair causal validation and prospective outcomes','symbol-isolated storage and model state','multi-pair load, reconnect, and rate-limit verification']),
        note='Research validity is not trading profitability. Rollout needs independent multi-pair evidence.')

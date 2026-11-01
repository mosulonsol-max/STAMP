"""Fail-closed autonomous research lab and end-to-end data-flow audit.

This module NEVER writes production model selections or places orders.
It evaluates immutable diagnostic candidates and recommends sandbox actions.
Promotion remains the exclusive responsibility of model_governor.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import math
import pathlib
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
HORIZONS = ("1h", "4h", "24h", "7d")
GROUPS = ("regime","market","ticker","orderbook","trades","dex","onchain",
          "news","project","macro","derivatives","feedback")
REQUIRED_STEPS = ("tests","monitor","audit","archive","forecast_health",
                  "research","governance","evidence","diagnosis","dashboard")

def load(path: pathlib.Path) -> dict:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
        return result if isinstance(result, dict) else {}
    except (OSError, ValueError):
        return {}

def iso(value: Any) -> dt.datetime | None:
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace("Z","+00:00"))
        return parsed.astimezone(dt.timezone.utc) if parsed.tzinfo else None
    except (ValueError,TypeError):
        return None

def number(value):
    try:
        x=float(value)
        return x if math.isfinite(x) else None
    except (ValueError,TypeError):
        return None

def audit_flow(root: pathlib.Path = ROOT, now=None) -> dict:
    """Verify *consistency and provenance*, not network availability or predictive skill."""
    now=now or dt.datetime.now(dt.timezone.utc)
    d=root/"data"
    health=load(d/"workflow_health.json")
    registry=load(d/"model_registry.json")
    report=load(d/"model_diagnosis.json")
    activity=load(d/"forecast_activity.json")
    score=load(d/"forecast_scorecard.json")
    controller=load(d/"learning_controller.json")
    issues=[]
    checks={}
    def check(name,ok,details=""):
        checks[name]={"passed":bool(ok),"details":details}
        if not ok:issues.append(name)
    steps=health.get("steps") or {}
    check("pipeline_steps",all(steps.get(s)=="success" for s in REQUIRED_STEPS),
          "Every required stage must report success; a missing stage is a failure.")
    check("pipeline_outcome",health.get("pipeline_passed") is True)
    contract=(load(d/"STAMP_archive.json").get("contract"))
    check("exact_contract",contract=="EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc")
    times={key:iso(val) for key,val in (
        ("pipeline",health.get("timestamp_utc")),
        ("registry",registry.get("generated_at_utc")),
        ("diagnosis",report.get("generated_at_utc")),
        ("activity",activity.get("checked_at_utc")),
        ("scorecard",score.get("generated_at_utc")))}
    check("clock_integrity",all(t is not None and t<=now+dt.timedelta(minutes=5)
            for t in times.values()), "No missing/future clock")
    check("fresh_pipeline",times["pipeline"] is not None and
          dt.timedelta(0)<=now-times["pipeline"]<=dt.timedelta(hours=3),
          "Scheduled Actions are best effort; 3 hours is a health threshold.")
    states=registry.get("horizons") or {}
    diagnosis=report.get("horizons") or {}
    check("horizon_wiring",all(h in states and h in diagnosis for h in HORIZONS))
    check("model_identity",all(
          states.get(h,{}).get("model_version")==
          (diagnosis.get(h,{}).get("forecast") or {}).get("model_version")
          for h in HORIZONS), "Registry must refer to the same evaluated model version")
    check("governor_authority",registry.get("manual_override_available") is False and
          registry.get("authority")=="internal_model_governor_v1")
    check("shadow_separation",all(states.get(h,{}).get("status") in ("experimental","approved")
          for h in HORIZONS))
    check("activity_link",number(activity.get("forecast_total"))==
          number(score.get("forecasts_total")) and number(score.get("forecasts_total")) is not None)
    check("research_engine_link",controller.get("engine")==report.get("engine") and
          controller.get("feature_signature")==(
            (diagnosis.get("1h") or {}).get("input_manifest") or {}).get("feature_signature",
            controller.get("feature_signature")),
          "Learning controller and diagnosis must refer to the same engine")
    # Real source availability is separate from historical feature coverage.
    groups=((diagnosis.get("1h") or {}).get("input_manifest") or {}).get("groups") or {}
    # Some reports place feature_coverage next to input_manifest.
    coverage=(diagnosis.get("1h") or {}).get("feature_coverage") or {}
    source_status={}
    for group in GROUPS:
        meta=groups.get(group) or {}
        count=(coverage.get(group) or {}).get("points_with_data")
        source_status[group]={"status":meta.get("status","missing"),
                              "historical_points":count,
                              "currently_available":meta.get("available_features",0)>0}
    check("feature_manifest",len(groups)>=len(GROUPS)-2,
          "Feature-group status and freshness must remain explicit")
    return {"generated_at_utc":now.isoformat(),"state":"healthy" if not issues else "degraded",
            "failed_checks":issues,"checks":checks,"sources":source_status,
            "policy":"Consistency audit only; does not certify forecast accuracy or deploy."}

def evaluate_lab(root: pathlib.Path = ROOT, now=None) -> dict:
    """Automatic experiment triage; never promote from diagnostic hindsight."""
    now=now or dt.datetime.now(dt.timezone.utc)
    d=root/"data"
    flow=audit_flow(root,now)
    diagnosis=load(d/"model_diagnosis.json")
    registry=load(d/"model_registry.json")
    decisions=[]
    for horizon in HORIZONS:
        row=(diagnosis.get("horizons") or {}).get(horizon) or {}
        selected=((row.get("selection") or {}).get("selected_model"))
        metrics=row.get("reproduced_metrics") or {}
        saved=row.get("saved_metrics") or {}
        samples=number(metrics.get("samples"))
        skill=number(metrics.get("skill_vs_zero"))
        # Exact replay consistency check; no arbitrary retraining on changed output.
        replay_ok=(samples is not None and saved.get("samples")==metrics.get("samples") and
                   number(saved.get("mae")) is not None and
                   number(metrics.get("mae")) is not None and
                   abs(float(saved["mae"])-float(metrics["mae"]))<=1e-9)
        production=(registry.get("horizons") or {}).get(horizon) or {}
        # Failed runs must be isolated even if their retrospective score looks promising.
        if not replay_ok or flow["failed_checks"]:
            action="quarantine"
            reason="invalid_replay_or_dataflow"
        elif samples<100 or skill is None:
            action="continue_sandbox"
            reason="insufficient_independent_later_tests"
        elif skill<=0:
            action="revise_in_sandbox"
            reason="failed_no_change_baseline"
        elif skill<0.10:
            action="continue_sandbox"
            reason="improvement_below_research_gate"
        else:
            action="collect_prospective_evidence"
            reason="retrospective_gain_requires_independent_prospective_validation"
        identity=f"{diagnosis.get('engine')}:{horizon}:{selected}:{(row.get('input_manifest') or {}).get('schema')}"
        decisions.append({"id":hashlib.sha256(identity.encode()).hexdigest()[:16],
                          "horizon":horizon,"candidate":selected,"action":action,"reason":reason,
                          "replay_consistent":replay_ok,"later_samples":samples,
                          "skill_vs_zero":skill,
                          "production_status":production.get("status","unknown"),
                          "promotion_permitted_by_lab":False})
    return {"generated_at_utc":now.isoformat(),"authority":"autonomous_lab_v1",
            "flow":flow,"experiments":decisions,
            "policy":"Sandbox recommendations only; governor requires forward and prospective evidence."}

def run(root: pathlib.Path = ROOT) -> dict:
    outcome=evaluate_lab(root)
    path=root/"data"/"autonomous_lab.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(".json.tmp")
    temp.write_text(json.dumps(outcome,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    temp.replace(path)
    return outcome

if __name__=="__main__":
    summary=run()
    print(json.dumps({"flow":summary["flow"]["state"],
                      "decisions":{r["horizon"]:r["action"] for r in summary["experiments"]}}))

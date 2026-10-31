"""Retrain and publish every horizon through one causal model path."""
import datetime as dt,json,pathlib,hashlib,copy,importlib.metadata
from prediction_engine import HORIZONS
from context_prediction import evaluate,VERSION,SPEC
from model_inputs import Inputs,capture,backfill,ms,NAMES,SCHEMA
from model_governor import govern,read_events
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run(root=ROOT,now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    data=root/"data";data.mkdir(exist_ok=True)
    path=data/"candles"/"1h.json"
    cs=json.loads(path.read_text()) if path.exists() else []
    previous=json.loads((data/"learning_controller.json").read_text()) if (data/"learning_controller.json").exists() else {}
    backfill(root);capture(root,now);inputs=Inputs(root)
    closed=[c for c in cs if c['t']+3600000<=now.timestamp()*1000]
    cutoff=closed[-1]['t']+3600000 if closed else 0
    fingerprint=hashlib.sha256(json.dumps({'engine':VERSION,'schema':SCHEMA,'features':NAMES,'spec':SPEC,'candles':closed,'events':{g:[r for r in rs if r['available_ms']<=cutoff] for g,rs in inputs.by.items()},'feedback_journal':[e for e in inputs.journal if (e.get('event')=='forecast' and ms(e.get('created_at_utc')) is not None and ms(e.get('created_at_utc'))<=cutoff) or (e.get('event')=='outcome' and ms(e.get('evaluated_at_utc')) is not None and ms(e.get('evaluated_at_utc'))<=cutoff)],'context':{s:[c for c in bars if c.get('t',float('inf'))+3600000<=cutoff] for s,bars in inputs.context.items()},'runtime':{n:importlib.metadata.version(n) for n in ('numpy','scikit-learn','scipy')}},sort_keys=True).encode()).hexdigest()
    reused=previous.get('training_fingerprint')==fingerprint and previous.get('horizons')
    reports=copy.deepcopy(previous['horizons']) if reused else {h:evaluate(cs,h,now,inputs) for h in HORIZONS}
    for r in reports.values():
        r['source_access']=inputs.inventory(int(now.timestamp()*1000));r['reused_unchanged_training_inputs']=bool(reused)
        r['last_reassessment_at_utc']=now.isoformat()
    for h,current in reports.items():
        prior=previous.get("horizons",{}).get(h,{})
        current["learning_update"]={"previous_at_utc":prior.get("at_utc"),"new_matured_labels":max(0,current["samples"]-prior.get("samples",0)) if prior else None,
            "previous_selected_model":prior.get("selected_model"),"selected_model":current.get("selected_model"),
            "method":"Refit on matured labels with point-in-time multi-source features, robust absolute-error loss and earlier selection/later evaluation. Feature masks preserve missingness; prospective outcomes decide approval."}
    decisions=govern(reports,read_events(data/"forecast_journal.jsonl"),root,now)
    for h,current in reports.items():
        current["model_decision"]=decisions[h]
        if current.get("forecast"):
            current["forecast"]["approval_passed"]=decisions[h]["status"]=="approved"
            current["forecast"]["forecast_class"]="approved_internal_model" if decisions[h]["status"]=="approved" else "research_unvalidated"
    report=dict(reports["1h"],horizons=reports,training_fingerprint=fingerprint)
    (data/"learning_controller.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    path=data/"latest.json"
    if path.exists():
        snapshot=json.loads(path.read_text());a=snapshot.setdefault("analysis",{})
        a["model_decisions"]=decisions;a["prediction_report"]=report;a["ml_experimental"]=dict(reports["1h"])
        for h,result in reports.items():a["forecast_"+h]=result
        a["reason"]=reports["1h"].get("reason")
        path.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+"\n")
    return report
if __name__=="__main__":
    result=run()
    print(json.dumps({h:{"status":r["status"],"selected_model":r["selected_model"],"validation_samples":r["validation_samples"],"has_forecast":bool(r["forecast"])} for h,r in result["horizons"].items()}))

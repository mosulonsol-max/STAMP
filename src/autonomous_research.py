"""Retrain and publish every horizon through one causal model path."""
import datetime as dt,json,pathlib
from prediction_engine import HORIZONS,evaluate
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run(root=ROOT,now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    data=root/"data";data.mkdir(exist_ok=True)
    path=data/"candles"/"1h.json"
    cs=json.loads(path.read_text()) if path.exists() else []
    previous=json.loads((data/"learning_controller.json").read_text()) if (data/"learning_controller.json").exists() else {}
    reports={h:evaluate(cs,h,now) for h in HORIZONS}
    for h,current in reports.items():
        prior=previous.get("horizons",{}).get(h,{})
        current["learning_update"]={"previous_at_utc":prior.get("at_utc"),"new_matured_labels":max(0,current["samples"]-prior.get("samples",0)) if prior else None,
            "previous_selected_model":prior.get("selected_model"),"selected_model":current.get("selected_model"),
            "method":"Refit on all matured exchange labels; re-evaluate causal forward windows. A changed window score does not prove general improvement."}
    report=dict(reports["1h"],horizons=reports)
    (data/"learning_controller.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    path=data/"latest.json"
    if path.exists():
        snapshot=json.loads(path.read_text());a=snapshot.setdefault("analysis",{})
        a["prediction_report"]=report;a["ml_experimental"]=dict(reports["1h"])
        for h,result in reports.items():a["forecast_"+h]=result
        a["reason"]=reports["1h"].get("reason")
        path.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+"\n")
    return report
if __name__=="__main__":
    result=run()
    print(json.dumps({h:{"status":r["status"],"selected_model":r["selected_model"],"validation_samples":r["validation_samples"],"has_forecast":bool(r["forecast"])} for h,r in result["horizons"].items()}))

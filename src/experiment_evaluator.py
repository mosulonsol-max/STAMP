"""Bounded isolated out-of-sample evaluation of laboratory parameter proposals.

Sandbox only: no forecasts, registry writes, deployments or order placement.
Train only on labels matured before each test feature timestamp.
"""
import argparse,datetime as dt,json,math,pathlib
from autonomous_lab import ROOT
from experiment_generator import DEFAULTS
from prediction_engine import clean,features,HORIZONS,HOUR
import numpy as np

def _model(family,parameters):
    from sklearn.ensemble import RandomForestRegressor,HistGradientBoostingRegressor
    if family=="forest_absolute":
        return RandomForestRegressor(criterion="absolute_error",random_state=42,n_jobs=1,**parameters)
    if family in ("hist_absolute","market_absolute","technical_absolute"):
        return HistGradientBoostingRegressor(loss="absolute_error",random_state=42,**parameters)
    raise ValueError("unapproved_family")

def score_proposal(proposal,candles,inputs=None,max_tests=12):
    """Dedicated later holdout not used to choose current production model."""
    horizon=proposal["horizon"]; hours=HORIZONS[horizon]
    rows=[]
    for index in range(25,len(candles)-hours):
        if any(b["t"]-a["t"]!=HOUR for a,b in zip(candles[index:index+hours+1],candles[index+1:index+hours+1])):continue
        row=features(candles,index)
        if row is None:continue
        rows.append((candles[index]["t"]+HOUR,candles[index+hours]["t"]+HOUR,row,math.log(candles[index+hours]["c"]/candles[index]["c"])))
    if len(rows)<160:return {"status":"insufficient_data","test_samples":0}
    # Conservative chronological separation: only matured labels may train.
    test_rows=rows[-max_tests:]
    results=[]
    for feature_ms,target_ms,z,actual in test_rows:
        training=[r for r in rows if r[0]<feature_ms and r[1]<=feature_ms]
        if len(training)<100:continue
        x=np.array([r[2] for r in training]);y=np.array([r[3] for r in training])
        try:
            estimator=_model(proposal["family"],proposal["parameters"])
            estimator.fit(x,y)
            prediction=float(estimator.predict(np.array([z]))[0])
            if not math.isfinite(prediction):raise ValueError("nonfinite prediction")
        except Exception as exc:
            return {"status":"isolated_failure","error":type(exc).__name__,"test_samples":len(results)}
        results.append((actual,prediction))
    if not results:return {"status":"insufficient_data","test_samples":0}
    error=sum(abs(a-p) for a,p in results)/len(results)
    baseline=sum(abs(a) for a,p in results)/len(results)
    return {"status":"sandbox_evaluated","test_samples":len(results),
            "mae":error,"zero_change_mae":baseline,
            "skill_vs_zero":1-error/baseline if baseline else None,
            "production_eligible":False,
            "note":"Bounded isolated later-window diagnostic; not independent of research or prospective deployment approval."}

def run(root=ROOT,limit=6):
    source=root/"data/lab_experiments.json"
    proposals=json.loads(source.read_text()).get("experiments",[])
    candle_source=root/"data/candles/1h.json"
    candles=clean(json.loads(candle_source.read_text()),int(dt.datetime.now(dt.timezone.utc).timestamp()*1000))
    results=[]
    for proposal in proposals[:max(0,min(limit,16))]:
        result=score_proposal(proposal,candles)
        results.append({"id":proposal["id"],"horizon":proposal["horizon"],
                        "family":proposal["family"],"parameters":proposal["parameters"],**result})
    output={"generated_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
            "engine":"bounded_isolated_lab_evaluator_v1","results":results,
            "evaluated":sum(r.get("status")=="sandbox_evaluated" for r in results),
            "authority":"research_only_no_deployment_or_model_promotion"}
    path=root/"data/lab_evaluations.json"
    path.write_text(json.dumps(output,indent=2)+"\n")
    return output

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--limit",type=int,default=6);args=parser.parse_args()
    print(json.dumps({"evaluated":run(limit=args.limit)["evaluated"]}))

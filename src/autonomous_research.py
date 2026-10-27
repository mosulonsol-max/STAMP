"""Autonomous research controller: causal, out-of-sample model competition.

Runs after monitoring. Does not trade or modify executable source.
"""
import datetime as dt,json,math,pathlib
from research_engine import wilson_interval
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run(root=ROOT):
    from sklearn.linear_model import Ridge
    from sklearn.ensemble import HistGradientBoostingRegressor,RandomForestRegressor
    import numpy as np
    data=root/"data"; data.mkdir(exist_ok=True)
    p=data/"candles"/"1h.json"
    now=dt.datetime.now(dt.timezone.utc).isoformat()
    report={"at_utc":now,"status":"insufficient_data","champion":None,"challengers":{},
            "next_action":"collect more completed hourly candles"}
    if not p.exists():
        (data/"learning_controller.json").write_text(json.dumps(report,indent=2)+"\n")
        return report
    cs=json.loads(p.read_text())
    # Features at candle i; target is NEXT completed candle. Never train on future features.
    X=[];y=[]
    skipped_gaps=0
    for i in range(25,len(cs)-1):
        # Never treat disconnected exchange candles as adjacent hourly returns.
        times=[int(c["t"]) for c in cs[i-24:i+2]]
        if any(b-a!=3600000 for a,b in zip(times,times[1:])):
            skipped_gaps+=1
            continue
        window=cs[i-24:i+2]
        if any(z["c"]<=0 or z["v"]<0 for z in window):continue
        try:
            features=[math.log(cs[i-j]["c"]/cs[i-j-1]["c"]) for j in (0,1,2,3,5,12,23)]
            features += [(cs[i]["h"]-cs[i]["l"])/cs[i]["c"],math.log1p(cs[i]["v"]),
                         sum(cs[k]["c"]/cs[k-1]["c"]-1 for k in range(i-5,i+1))]
            target=math.log(cs[i+1]["c"]/cs[i]["c"])
            if all(map(math.isfinite,features+[target])):X.append(features);y.append(target)
        except (ValueError,ZeroDivisionError):continue
    report["samples"]=len(y)
    report["skipped_gap_windows"]=skipped_gaps
    report["data_quality"]="gaps_present" if skipped_gaps else "contiguous_windows"
    if len(y)<240:
        (data/"learning_controller.json").write_text(json.dumps(report,indent=2)+"\n")
        return report
    X=np.asarray(X);y=np.asarray(y)
    # Three sequential, nonoverlapping validation windows; each fold trains only on its past.
    splits=[(len(y)-120,len(y)-80),(len(y)-80,len(y)-40),(len(y)-40,len(y))]
    candidates={"ridge":lambda:Ridge(alpha=10.0),
                "hist_gradient_boosting":lambda:HistGradientBoostingRegressor(max_iter=80,max_leaf_nodes=7,l2_regularization=10,random_state=42),
                "random_forest":lambda:RandomForestRegressor(n_estimators=60,max_depth=5,min_samples_leaf=8,random_state=42,n_jobs=1)}
    base_errors=[];results={k:[] for k in candidates}
    directions={k:[] for k in candidates}
    fold_metrics=[]
    for start,end in splits:
        if start<100:continue
        base_errors.extend(abs(y[start:end]).tolist())
        fold_metrics.append({"train_samples":start,"test_samples":end-start,"train_end_index":start-1,"test_start_index":start})
        for name,make in candidates.items():
            try:
                model=make();model.fit(X[:start],y[:start])
                predictions=model.predict(X[start:end])
                results[name].extend(abs(y[start:end]-predictions).tolist())
                directions[name].extend([bool((a>0)==(b>0)) for a,b in zip(y[start:end],predictions) if a!=0 and b!=0])
            except Exception as e:
                report.setdefault("errors",{})[name]=str(e)[:180]
    if not base_errors:
        (data/"learning_controller.json").write_text(json.dumps(report,indent=2)+"\n")
        return report
    baseline=float(np.mean(base_errors))
    report["baseline_mae"]=baseline;report["validation_samples"]=len(base_errors)
    report["folds"]=fold_metrics
    report["promotion_gate"]={"min_validation_samples":100,"min_mae_improvement_vs_zero":0.10,"wilson_95_lower_direction_accuracy_gt":0.5}
    for name,errors in results.items():
        if len(errors)!=len(base_errors):continue
        mae=float(np.mean(errors))
        hits=sum(directions[name]);direction_n=len(directions[name]);ci=wilson_interval(hits,direction_n)
        report["challengers"][name]={"mae":mae,"skill_vs_zero":1-mae/baseline if baseline else None,
                                     "direction_accuracy":hits/direction_n if direction_n else None,
                                     "direction_samples":direction_n,"direction_wilson_95":ci,
                                     "eligible":bool(baseline>0 and len(base_errors)>=100 and direction_n>=100
                                                     and mae<baseline*.9 and ci[0] is not None and ci[0]>0.5)}
    eligible={k:v for k,v in report["challengers"].items() if v["eligible"]}
    report["champion"]=min(eligible,key=lambda k:eligible[k]["mae"]) if eligible else None
    report["status"]="validated_champion" if eligible else "no_model_beats_baseline"
    report["next_action"]="continue monitoring and periodic re-evaluation" if eligible else "retain baseline; collect new evidence and re-test"
    report["warning"]="Validation is research-only, not proof of execution profitability. Correlated hourly outcomes and model selection can overstate confidence."
    if report["champion"]:
        try:
            name=report["champion"];m=candidates[name]();m.fit(X,y)
            i=len(cs)-1
            f=[math.log(cs[i-j]["c"]/cs[i-j-1]["c"]) for j in (0,1,2,3,5,12,23)]
            f += [(cs[i]["h"]-cs[i]["l"])/cs[i]["c"],math.log1p(cs[i]["v"]),
                  sum(cs[k]["c"]/cs[k-1]["c"]-1 for k in range(i-5,i+1))]
            report["next_hour_log_return_research_only"]=float(m.predict(np.asarray([f]))[0])
        except Exception as e:report["inference_error"]=str(e)[:180]
    (data/"learning_controller.json").write_text(json.dumps(report,indent=2)+"\n")
    return report
if __name__=="__main__":
    print(json.dumps(run(),ensure_ascii=False))

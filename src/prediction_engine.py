"""Causal multi-horizon research. Output visibility is independent of approval.

Training labels end before the first test feature; test targets do not overlap.
Every forecast uses a completed candle reference and a fixed target timestamp.
"""
import datetime as dt
import math
from research_engine import wilson_interval
HOUR=3600000
HORIZONS={"1h":1,"4h":4,"24h":24,"7d":168}
VERSION="walk_forward_v2"

def clean(candles,now_ms=None):
    rows={}
    for c in candles:
        try:
            t=int(c["t"]);o,h,l,p,v=[float(c[k]) for k in ("o","h","l","c","v")]
            if not all(map(math.isfinite,(o,h,l,p,v))) or not 0<l<=min(o,p)<=max(o,p)<=h or v<0:continue
            if now_ms is not None and t+HOUR>now_ms:continue
            rows[t]=dict(t=t,o=o,h=h,l=l,c=p,v=v)
        except (ValueError,TypeError,KeyError,OverflowError):continue
    return [rows[t] for t in sorted(rows)]

def features(cs,i):
    w=cs[i-24:i+1]
    if len(w)!=25 or any(b["t"]-a["t"]!=HOUR for a,b in zip(w,w[1:])):return None
    f=[math.log(cs[i-j]["c"]/cs[i-j-1]["c"]) for j in (0,1,2,3,5,12,23)]
    f += [(cs[i]["h"]-cs[i]["l"])/cs[i]["c"],math.log1p(cs[i]["v"]),sum(cs[k]["c"]/cs[k-1]["c"]-1 for k in range(i-5,i+1))]
    return f if all(map(math.isfinite,f)) else None

def dataset(cs,horizon):
    rows=[];skipped=0
    for i in range(25,len(cs)-horizon):
        f=features(cs,i);w=cs[i:i+horizon+1]
        if f is None or any(b["t"]-a["t"]!=HOUR for a,b in zip(w,w[1:])):
            skipped+=1;continue
        rows.append(dict(x=f,y=math.log(cs[i+horizon]["c"]/cs[i]["c"]),feature_ms=cs[i]["t"]+HOUR,target_ms=cs[i+horizon]["t"]+HOUR))
    return rows,skipped

def factories():
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.linear_model import Ridge
    from sklearn.ensemble import HistGradientBoostingRegressor,RandomForestRegressor
    return {"ridge":lambda:make_pipeline(StandardScaler(),Ridge(alpha=100)),
        "hist_gradient_boosting":lambda:HistGradientBoostingRegressor(max_iter=60,max_leaf_nodes=7,l2_regularization=10,random_state=42),
        "random_forest":lambda:RandomForestRegressor(n_estimators=40,max_depth=5,min_samples_leaf=8,random_state=42,n_jobs=1)}

def evaluate(candles,horizon="1h",now=None):
    import numpy as np
    now=now or dt.datetime.now(dt.timezone.utc);hours=HORIZONS[horizon]
    cs=clean(candles,int(now.timestamp()*1000));rows,skipped=dataset(cs,hours)
    report=dict(at_utc=now.isoformat(),horizon=horizon,status="insufficient_data",champion=None,selected_model=None,
        challengers={},samples=len(rows),skipped_gap_windows=skipped,data_quality="gaps_present" if skipped else "contiguous_windows",
        promotion_gate=dict(min_validation_samples=100,min_mae_improvement_vs_zero=.10,wilson_95_lower_direction_accuracy_gt=.5),
        validation_samples=0,folds=[],forecast=None,
        warning="Research only. Historical accuracy is not this forecast's probability; selection is not independent confirmation. Serial dependence can invalidate nominal confidence coverage.")
    if len(rows)<120:
        report.update(reason="need >=120 matured training labels; have %d"%len(rows),missing_training_labels=max(0,120-len(rows)))
        return report
    selected=[];last=math.inf
    for j in range(len(rows)-1,-1,-1):
        r=rows[j]
        if r["target_ms"]>last:continue
        if sum(p["target_ms"]<=r["feature_ms"] for p in rows[:j])<100:break
        selected.append(j);last=r["feature_ms"]
        if len(selected)==120:break
    selected.reverse()
    if not selected:
        report["reason"]="No forward test target with 100 prior matured labels";return report
    blocks=[list(map(int,x)) for x in np.array_split(selected,min(3,len(selected))) if len(x)]
    makers=factories();results={k:[] for k in makers};base=[]
    for block in blocks:
        cutoff=rows[block[0]]["feature_ms"]
        train=[r for r in rows if r["feature_ms"]<cutoff and r["target_ms"]<=cutoff];test=[rows[j] for j in block]
        report["folds"].append(dict(train_samples=len(train),test_samples=len(test),train_last_target_ms=max(r["target_ms"] for r in train),
            test_first_feature_ms=cutoff,test_last_target_ms=test[-1]["target_ms"],train_end_index=rows.index(train[-1]),test_start_index=block[0]))
        actual=np.array([r["y"] for r in test]);base.extend(abs(actual).tolist())
        for name,factory in makers.items():
            try:
                m=factory();m.fit(np.array([r["x"] for r in train]),np.array([r["y"] for r in train]))
                p=m.predict(np.array([r["x"] for r in test]))
                if not np.isfinite(p).all():raise ValueError("nonfinite_prediction")
                results[name].extend(zip(actual.tolist(),p.tolist()))
            except Exception as exc:report.setdefault("errors",{})[name]=type(exc).__name__
    baseline=float(np.mean(base));report.update(baseline_mae=baseline,validation_samples=len(base))
    for name,pairs in results.items():
        if len(pairs)!=len(base):continue
        errors=[abs(a-p) for a,p in pairs];directions=[(a>0)==(p>0) for a,p in pairs if a!=0 and p!=0]
        low,high=wilson_interval(sum(directions),len(directions));mae=sum(errors)/len(errors)
        eligible=bool(len(base)>=100 and len(directions)>=100 and baseline>0 and mae<baseline*.9 and low is not None and low>.5)
        report["challengers"][name]=dict(mae=mae,skill_vs_zero=1-mae/baseline if baseline else None,
            direction_accuracy=sum(directions)/len(directions) if directions else None,direction_samples=len(directions),
            direction_wilson_95=[low,high],eligible=eligible,empirical_abs_log_error_p90=float(np.quantile(errors,.9)))
    if not report["challengers"]:
        report.update(status="model_error",reason="all candidate fits failed");return report
    eligible={k:v for k,v in report["challengers"].items() if v["eligible"]}
    champion=min(eligible,key=lambda k:eligible[k]["mae"]) if eligible else None
    selected_model=champion or min(report["challengers"],key=lambda k:report["challengers"][k]["mae"])
    report.update(champion=champion,selected_model=selected_model,status="validated_champion" if champion else "no_validated_champion",
        next_action="retrain using newly matured targets; repeat forward validation",
        reason=f"Approval requires >=100 nonoverlapping horizon outcomes, >=10% lower MAE and directional Wilson lower bound >50%; missing outcomes: {max(0,100-len(base))}")
    f=features(cs,len(cs)-1);ref_ms=cs[-1]["t"]+HOUR;due_ms=ref_ms+hours*HOUR
    report["asof_candle_close_ms"]=ref_ms
    if f is None or int(now.timestamp()*1000)-ref_ms>HOUR or due_ms<=int(now.timestamp()*1000):
        report["inference_status"]="stale_or_disconnected_latest_window";return report
    model=makers[selected_model]();model.fit(np.array([r["x"] for r in rows]),np.array([r["y"] for r in rows]))
    prediction=float(model.predict(np.array([f]))[0])
    if not math.isfinite(prediction) or abs(prediction)>5:
        report["inference_status"]="nonfinite_or_extreme_prediction";return report
    reference=cs[-1]["c"];error=report["challengers"][selected_model]["empirical_abs_log_error_p90"]
    report["forecast"]=dict(created_at_utc=now.isoformat(),reference_at_utc=dt.datetime.fromtimestamp(ref_ms/1000,dt.timezone.utc).isoformat(),
        due_at_utc=dt.datetime.fromtimestamp(due_ms/1000,dt.timezone.utc).isoformat(),horizon=horizon,reference_price=reference,source_candle=str(cs[-1]["t"]),
        predicted_log_return=prediction,predicted_price=reference*math.exp(prediction),
        empirical_error_range=[reference*math.exp(max(-10,prediction-error)),reference*math.exp(min(10,prediction+error))],
        range_label="Empirical validation error band, not calibrated coverage",model_version=VERSION+"_"+selected_model+"_"+horizon,
        forecast_class="validated_experimental" if champion else "research_unvalidated",approval_passed=bool(champion),
        validation_samples=len(base),direction_accuracy=report["challengers"][selected_model]["direction_accuracy"],
        direction_wilson_95=report["challengers"][selected_model]["direction_wilson_95"])
    return report

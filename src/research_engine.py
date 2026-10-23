"""Incremental candle archive, quality checks and independent forecast scorecard."""
import json,math,pathlib,datetime as dt
ROOT=pathlib.Path(__file__).resolve().parents[1]
INTERVALS={"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000}
def archive(snapshot,root=ROOT):
    from monitor import candles
    d=root/"data"/"candles";d.mkdir(parents=True,exist_ok=True)
    report={}
    for tf,ms in INTERVALS.items():
        key="klines_"+tf;incoming=candles(snapshot["raw"]["mexc"][key],ms)
        path=d/(tf+".json")
        try:old=json.loads(path.read_text()) if path.exists() else []
        except (ValueError,OSError):old=[]
        rows={}
        for c in old+incoming:
            try:
                t=int(c["t"]);o,h,l,close,v=[float(c[k]) for k in ("o","h","l","c","v")]
                if not all(map(math.isfinite,(o,h,l,close,v))) or not (0<l<=min(o,close)<=max(o,close)<=h) or v<0:continue
                rows[t]={"t":t,"o":o,"h":h,"l":l,"c":close,"v":v}
            except (ValueError,KeyError,TypeError):continue
        ordered=[rows[k] for k in sorted(rows)]
        path.write_text(json.dumps(ordered,separators=(",",":"))+"\n")
        gaps=sum(1 for a,b in zip(ordered,ordered[1:]) if b["t"]-a["t"]>ms)
        report[tf]={"count":len(ordered),"gaps":gaps,"last_open_ms":ordered[-1]["t"] if ordered else None}
    (root/"data"/"candle_quality.json").write_text(json.dumps(report,indent=2)+"\n")
    return report
def wilson_interval(correct,total,z=1.959963984540054):
    """Wilson 95% interval for directional hit rate; descriptive, not a trading edge."""
    if total<=0:return [None,None]
    p=correct/total
    den=1+z*z/total
    center=(p+z*z/(2*total))/den
    half=z*math.sqrt((p*(1-p)+z*z/(4*total))/total)/den
    return [max(0,center-half),min(1,center+half)]

def score(root=ROOT):
    path=root/"data"/"forecast_journal.jsonl"
    rows=[]
    if path.exists():
        for line in path.read_text().splitlines():
            try:rows.append(json.loads(line))
            except ValueError:pass
    forecasts={x["id"]:x for x in rows if x.get("event")=="forecast" and x.get("id")}
    groups={}
    for x in rows:
        if x.get("event")!="outcome" or x.get("status")!="evaluated":continue
        f=forecasts.get(x.get("forecast_id"))
        if not f:continue
        key=f.get("model_version","unknown")+"|"+f.get("horizon","unknown")
        groups.setdefault(key,[]).append(x)
    result={}
    for k,v in groups.items():
        n=len(v);correct=[x["direction_correct"] for x in v if x.get("direction_correct") is not None]
        mae=sum(x["absolute_log_error"] for x in v)/n
        base=sum(x["baseline_zero_error"] for x in v)/n
        low,high=wilson_interval(sum(correct),len(correct))
        # This is a strict preliminary research gate, NOT an execution authorization.
        gate=bool(n>=100 and len(correct)>=100 and base>0 and mae<base*.9 and low is not None and low>0.5)
        result[k]={"evaluated":n,"mae":mae,"zero_baseline_mae":base,
          "skill_vs_zero":1-mae/base if base>0 else None,
          "direction_accuracy":sum(correct)/len(correct) if correct else None,
          "direction_correct":sum(correct),"direction_scored":len(correct),
          "direction_accuracy_wilson_95":[low,high],
          "promotion_eligible":gate,
          "note":"Preliminary research gate only. Out-of-sample statistical evidence, fees, slippage and execution tests are still required."}
    outcome_ids={x.get("forecast_id") for x in rows if x.get("event")=="outcome"}
    missing=sum(1 for x in rows if x.get("event")=="outcome" and x.get("status")=="missing_timely_observation")
    out={"generated_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"forecasts_total":len(forecasts),
         "pending_total":sum(fid not in outcome_ids for fid in forecasts),"missing_total":missing,
         "evaluated_total":sum(len(v) for v in groups.values()),"models":result}
    out["evaluation_coverage"]=out["evaluated_total"]/out["forecasts_total"] if out["forecasts_total"] else None
    out["reliability_warning"]="Missing or pending outcomes are excluded from accuracy. This is not evidence of profitable execution."
    (root/"data").mkdir(exist_ok=True)
    (root/"data"/"forecast_scorecard.json").write_text(json.dumps(out,indent=2)+"\n")
    return out
if __name__=="__main__":
    snap=json.loads((ROOT/"data"/"latest.json").read_text())
    print(json.dumps({"candles":archive(snap),"scorecard":score()},ensure_ascii=False))

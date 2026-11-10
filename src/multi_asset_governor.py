"""Autonomous per-asset prospective validation. Never promote from backtests alone."""
import datetime as dt,json,math,os,pathlib
from multi_asset import symbol,forecasts,candles,universe

ROOT=pathlib.Path(__file__).resolve().parents[1]
PATH=ROOT/"data"/"multi_asset_forecasts.json"
HORIZONS={"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000}
MIN_VERIFIED=30
def load():
    if os.getenv("DATABASE_URL"):
        import psycopg
        with psycopg.connect(os.environ["DATABASE_URL"],connect_timeout=10) as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS research_state (id INTEGER PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())")
            row=conn.execute("SELECT payload FROM research_state WHERE id=1").fetchone()
            return row[0] if row else {}
    try:
        d=json.loads(PATH.read_text())
        return d if isinstance(d,dict) else {}
    except (OSError,ValueError):return {}
def retrain_candidates(data):
    """Prospective research-only model selection with chronological holdout."""
    selections=data.get("model_selections") or {}
    records=data.get("records") or []
    keys=sorted({(r["pair"],r["frame"]) for r in records if r.get("pair") and r.get("frame")})
    for pair,frame in keys:
        eligible=[r for r in records if r.get("pair")==pair and r.get("frame")==frame and r.get("outcome") and audit_records([r])["passed"] and len((r.get("features") or {}).get("recent_returns") or [])>=20]
        eligible=eligible[-160:]
        if len(eligible)<40:continue
        split=int(len(eligible)*0.7)
        train,test=eligible[:split],eligible[split:]
        def error(rows,n):
            return sum(math.log(float(r["outcome"]["actual_price"])/(float(r["reference_price"])*math.exp(sum(r["features"]["recent_returns"][-n:])/n)))**2 for r in rows)/len(rows)
        best=min((3,6,12,20),key=lambda n:error(train,n))
        key=pair+"|"+frame
        incumbent=int(selections.get(key,{}).get("lookback",6))
        baseline=sum(r["outcome"]["baseline_squared_log_error"] for r in test)/len(test)
        candidate_mse=error(test,best);incumbent_mse=error(test,incumbent)
        if best!=incumbent and candidate_mse<incumbent_mse*0.95 and candidate_mse<baseline*0.95:
            selections[key]={"lookback":best,"version":"momentum_"+str(best),"holdout_samples":len(test),"holdout_mse":candidate_mse,"incumbent_mse":incumbent_mse,"approved_for":"research_only","selected_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
    data["model_selections"]=selections
    return data

def audit_records(records,now=None):
    """Read-only audit: never silently repair or count unverified forecasts as successes."""
    now=now or dt.datetime.now(dt.timezone.utc)
    problems=[]
    counts={"total":0,"pending":0,"settled":0,"invalid":0,"duplicates":0,"future_issued":0,"early_settlements":0,"metric_mismatches":0}
    seen=set()
    by_frame={}
    for index,r in enumerate(records):
        counts["total"]+=1
        errors=[]
        pair=r.get("pair");frame=r.get("frame");rid=r.get("id")
        if not isinstance(pair,str) or not pair.endswith("USDT") or frame not in HORIZONS:errors.append("invalid_identity_or_frame")
        if not isinstance(rid,str) or not rid:errors.append("missing_id")
        elif rid in seen:counts["duplicates"]+=1;errors.append("duplicate_id")
        seen.add(rid)
        try:
            reference=float(r["reference_price"]);predicted=float(r["predicted_price"])
            if not all(math.isfinite(x) and x>0 for x in (reference,predicted)):raise ValueError()
            issued=dt.datetime.fromisoformat(r["reference_at_utc"]);due=dt.datetime.fromisoformat(r["due_at_utc"])
            if issued.tzinfo is None or due.tzinfo is None:raise ValueError()
            if frame in HORIZONS and abs((due-issued).total_seconds()*1000-HORIZONS[frame])>1000:errors.append("horizon_mismatch")
            if issued>now+dt.timedelta(minutes=2):counts["future_issued"]+=1;errors.append("future_reference")
            outcome=r.get("outcome")
            if outcome:
                counts["settled"]+=1
                actual=float(outcome["actual_price"])
                if not math.isfinite(actual) or actual<=0:raise ValueError()
                measured=dt.datetime.fromisoformat(outcome["measured_at_utc"])
                if measured.tzinfo is None or measured<due-dt.timedelta(seconds=1):counts["early_settlements"]+=1;errors.append("invalid_measurement_time")
                expected=math.log(actual/predicted)**2
                baseline=math.log(actual/reference)**2
                if not math.isclose(expected,float(outcome["squared_log_error"]),rel_tol=1e-7,abs_tol=1e-12) or not math.isclose(baseline,float(outcome["baseline_squared_log_error"]),rel_tol=1e-7,abs_tol=1e-12):
                    counts["metric_mismatches"]+=1;errors.append("metric_mismatch")
                if not errors:
                    x=by_frame.setdefault(frame,{"settled":0,"squared_log_error_sum":0.0,"baseline_squared_log_error_sum":0.0})
                    x["settled"]+=1;x["squared_log_error_sum"]+=expected;x["baseline_squared_log_error_sum"]+=baseline
            else:counts["pending"]+=1
        except (KeyError,ValueError,TypeError,OverflowError,ZeroDivisionError):
            errors.append("invalid_price_or_timestamp")
        if errors:
            counts["invalid"]+=1
            if len(problems)<30:problems.append({"index":index,"id":rid,"errors":errors})
    for frame,x in by_frame.items():
        n=x["settled"];x["mse"]=x["squared_log_error_sum"]/n
        x["baseline_mse"]=x["baseline_squared_log_error_sum"]/n
        x["skill_vs_no_change"]=1-x["mse"]/x["baseline_mse"] if x["baseline_mse"]>0 else None
    return {"passed":counts["invalid"]==0,"counts":counts,"by_frame":by_frame,"problems_sample":problems,"audit_at_utc":now.isoformat(),"note":"Integrity and historical error checks only; not proof of prospective trading performance"}

def reconcile(data,now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    records=data.get("records") or []
    # De-duplicate by pair/frame/reference; once issued, values stay immutable.
    by_id={}
    for rec in records:
        if isinstance(rec,dict) and isinstance(rec.get("id"),str):by_id.setdefault(rec["id"],rec)
    records=list(by_id.values())
    # Never evaluate against a later/future candle without matching the recorded target.
    due_pairs={r.get("pair") for r in records if r.get("pair") and not r.get("outcome") and r.get("due_at_utc") and dt.datetime.fromisoformat(r["due_at_utc"])<=now}
    for pair in sorted(due_pairs):
        for frame in HORIZONS:
            pending=[r for r in records if r.get("pair")==pair and r.get("frame")==frame and r.get("outcome") is None]
            pending=[r for r in pending if r.get("due_at_utc") and dt.datetime.fromisoformat(r["due_at_utc"])<=now]
            if not pending:continue
            try:rows=candles(pair,{"1h":"60m"}.get(frame,frame),500)
            except (OSError,ValueError):continue
            indexed={int(c["t"]):c for c in rows}
            for rec in pending:
                due=dt.datetime.fromisoformat(rec["due_at_utc"])
                if due>now:continue
                # The target is at candle opening, so an already-closed preceding
                # candle is needed. Its close corresponds to the target boundary.
                prev=indexed.get(int(due.timestamp()*1000)-HORIZONS[frame])
                if prev is None or int(prev["t"])+HORIZONS[frame]>int(now.timestamp()*1000):continue
                actual=float(prev["c"])
                rec["outcome"]={"actual_price":actual,"measured_at_utc":now.isoformat(),"target_at_utc":due.isoformat(),
                    "squared_log_error":math.log(actual/rec["predicted_price"])**2,
                    "baseline_squared_log_error":math.log(actual/rec["reference_price"])**2}
    # Keep every issued forecast and outcome. Do not truncate evidence or silently discard history.
    data["records"]=records
    approvals={}
    learning={}
    feedback={}
    validation={}
    for pair,frame in sorted({(r["pair"],r["frame"]) for r in records}):
        settled=[r for r in records if r["pair"]==pair and r["frame"]==frame and r.get("outcome") and audit_records([r])["passed"]]
        settled=settled[-120:]
        skill=None
        if settled:
            err=sum(r["outcome"]["squared_log_error"] for r in settled)
            base=sum(r["outcome"]["baseline_squared_log_error"] for r in settled)
            skill=1-err/base if base>0 else None
        eligible=len(settled)>=MIN_VERIFIED and skill is not None and skill>0.05
        approvals[pair+"|"+frame]={"status":"validated_research" if eligible else "research_only",
            "prospective_samples":len(settled),"prospective_skill_vs_no_change":skill,
            "reason":"Prospective accuracy threshold passed; not approval to trade" if eligible else "Insufficient verified outcomes or no demonstrated predictive advantage"}
        key=pair+"|"+frame
        latest=settled[-1] if settled else None
        outcome_id=latest.get("id") if latest else None
        selected=(data.get("model_selections") or {}).get(key) or {}
        learning[key]={"status":"evaluated" if settled else "awaiting_outcomes","model_version":selected.get("version","causal_6_return_momentum_v1"),"prospective_samples":len(settled),"skill_vs_baseline":skill,"last_outcome_id":outcome_id,"retraining_performed":bool(selected)}
        feedback[key]={"status":"recorded" if settled else "awaiting_outcomes","last_outcome_id":outcome_id,"evidence_samples":len(settled),"validation_status":"eligible_research" if eligible else "research_only","updated_at_utc":now.isoformat()}
        validation[key]={"status":"eligible_research" if eligible else "research_only","evidence_source":"prospective_closed_candles_MEXC","min_samples":MIN_VERIFIED,"observed_samples":len(settled),"skill_threshold":0.05,"observed_skill":skill,"last_evaluated_outcome_id":outcome_id,"trading_approved":False,"model_retrained":bool(selected)}
    # Forecast decisions are computed by the worker; learning eligibility must use valid outcomes only.
    data["measurement_summary"]={key:{"settled":entry["prospective_samples"],"skill_vs_baseline":entry["skill_vs_baseline"],"last_outcome_id":entry["last_outcome_id"],"research_eligible":validation[key]["status"]=="eligible_research"} for key,entry in learning.items()}
    data["learning"]=learning
    data["feedback"]=feedback
    data["validation"]=validation
    data["loop_updated_at_utc"]=now.isoformat()
    data["approvals"]=approvals
    data["checked_at_utc"]=now.isoformat()
    return data
def autonomous_review(data):
    """System-owned forecast acceptance decisions. No human approval required."""
    records=data.get("records") or []
    # Audit all records individually; the public audit response samples only 30 problems.
    reviews={}
    for rec in records:
        rid=rec.get("id")
        if not rid:continue
        individual=audit_records([rec])
        outcome=rec.get("outcome")
        if not individual["passed"]:
            status="rejected";reason="integrity_or_chronology_failure"
        elif not outcome:
            status="pending";reason="awaiting_verified_target_candle"
        else:
            err=float(outcome["squared_log_error"])
            baseline=float(outcome["baseline_squared_log_error"])
            status="accepted" if err<baseline else "rejected"
            reason="outperformed_no_change_baseline" if status=="accepted" else "did_not_outperform_no_change_baseline"
        reviews[rid]={"status":status,"reason":reason}
    counts={k:sum(v["status"]==k for v in reviews.values()) for k in ("accepted","rejected","pending")}
    data["autonomous_review"]={"counts":counts,"decisions":reviews,"checked_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"policy":"per_forecast_integrity_then_error_vs_no_change; model approval separately requires prospective holdout"}
    return data

def cycle(pairs=None):
    data=load()
    if pairs is None:
        # Rotate through the entire discovered market universe to respect API quotas.
        try:
            available=universe()["pairs"]
            if not available:raise ValueError("empty_exchange_universe")
            data["universe"]={"source":"MEXC exchangeInfo","count":len(available)}
        except (OSError,ValueError,KeyError,TypeError) as exc:
            available=data.get("known_pairs") or []
            data["universe_error"]=type(exc).__name__
        requested=sorted(set(available)|set(data.get("known_pairs") or []))
        data["known_pairs"]=requested
        cursor=int(data.get("cursor",0))%max(len(requested),1)
        batch=min(max(1,int(os.getenv("STAMP_BATCH_SIZE","48"))),len(requested))
        retry=[p for p in (data.get("retry_pairs") or []) if p in requested][:max(1,batch//4)]
        # Revisit actively monitored liquid pairs each cycle, without bypassing market discovery.
        priority=[p.strip().upper() for p in os.getenv("STAMP_PRIORITY_PAIRS","BTCUSDT,ETHUSDT,SOLUSDT,STAMPUSDT").split(",")]
        priority=[p for p in dict.fromkeys(priority) if p in requested]
        pairs=priority[:batch]
        for p in retry:
            if p not in pairs and len(pairs)<batch:pairs.append(p)
        scanned=0
        while requested and len(pairs)<batch and scanned<len(requested):
            candidate=requested[(cursor+scanned)%len(requested)]
            if candidate not in pairs:pairs.append(candidate)
            scanned+=1
        data["cursor"]=(cursor+scanned)%max(len(requested),1)
        data["coverage"]={"discovered":len(requested),"processed_this_cycle":len(pairs),
                          "next_cursor":data["cursor"],"complete_this_cycle":batch==len(requested)}
    data=reconcile(data)
    data=autonomous_review(data)
    data=retrain_candidates(data)
    issued={r["id"] for r in data["records"]}
    processed=[]
    failed={}
    for pair in pairs:
        try:
            frame_rows={tf:candles(pair,{"1h":"60m"}.get(tf,tf)) for tf in HORIZONS}
            values=forecasts(frame_rows)
        except (OSError,ValueError,TimeoutError) as exc:
            failed[pair]=type(exc).__name__
            continue
        processed.append(pair)
        for frame,result in values.items():
            if result.get("status")!="research_only":continue
            selected=(data.get("model_selections") or {}).get(pair+"|"+frame) or {}
            lookback=int(selected.get("lookback",6))
            if lookback!=6:
                closed=[bar for bar in frame_rows[frame] if bar["t"]+HORIZONS[frame]<=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)]
                rr=[math.log(b["c"]/a["c"]) for a,b in zip(closed,closed[1:]) if b["t"]-a["t"]==HORIZONS[frame]]
                if len(rr)>=lookback:
                    drift=sum(rr[-lookback:])/lookback
                    result=dict(result,predicted_price=result["reference_price"]*math.exp(drift),method="momentum_"+str(lookback))
            rid=pair+"|"+frame+"|"+result["reference_at_utc"]
            if rid in issued:continue
            gate=(data.get("validation") or {}).get(pair+"|"+frame) or {}
            closed=[bar for bar in frame_rows[frame] if bar["t"]+HORIZONS[frame]<=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)]
            recent=[math.log(b["c"]/a["c"]) for a,b in zip(closed,closed[1:]) if b["t"]-a["t"]==HORIZONS[frame]][-20:]
            data["records"].append(dict(features={"recent_returns":recent},validation_at_issue=gate.get("status","research_only"),model_version=result["method"],id=rid,pair=pair,frame=frame,reference_price=result["reference_price"],
                predicted_price=result["predicted_price"],reference_at_utc=result["reference_at_utc"],
                due_at_utc=result["due_at_utc"],method=result["method"],outcome=None))
            issued.add(rid)
    # Cross-venue microstructure is independently sourced and timestamped.
    # Only major verified-symbol pairs are eligible for cross-venue comparison.
    if os.getenv("STAMP_MULTI_VENUE","1")=="1":
        try:
            from venue_microstructure import collect
            from concurrent.futures import ThreadPoolExecutor
            monitored=[p for p in ("BTCUSDT","ETHUSDT","SOLUSDT") if p in processed]
            with ThreadPoolExecutor(max_workers=6) as pool:
                tasks={(p,v):pool.submit(collect,v,p) for p in monitored for v in ("MEXC","Binance","OKX","Bybit","KuCoin","Gate")}
                multi={}
                for (p,v),task in tasks.items():
                    try:
                        item=task.result(timeout=18)
                        multi.setdefault(p,{})[v]={"book":item["book"],"candles":item["candles"],"engine_effect":item["engine_effect"]}
                    except Exception as exc:multi.setdefault(p,{})[v]={"status":"unavailable","reason":type(exc).__name__}
            data["venue_evidence"]={"retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"pairs":multi,"used_in_forecast":False,"identity_scope":"major_pairs_only"}
        except Exception as exc:data["venue_evidence_error"]=type(exc).__name__
    data=autonomous_review(data)
    data["retry_pairs"]=sorted(failed)
    data["cycle_result"]={"processed":processed,"failed":failed,"at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
    if os.getenv("DATABASE_URL"):
        import psycopg
        from psycopg.types.json import Jsonb
        with psycopg.connect(os.environ["DATABASE_URL"],connect_timeout=10) as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS research_state (id INTEGER PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())")
            conn.execute("INSERT INTO research_state (id,payload) VALUES (1,%s) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()",(Jsonb(data),))
    else:
        PATH.parent.mkdir(parents=True,exist_ok=True)
        temp=PATH.with_suffix(".json.tmp")
        temp.write_text(json.dumps(data,indent=2,allow_nan=False))
        temp.replace(PATH)
    return data
if __name__=="__main__":
    d=cycle()
    print(json.dumps({"total":len(d["records"]),"approvals":d["approvals"]},ensure_ascii=False))

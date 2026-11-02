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
def reconcile(data,now=None):
    now=now or dt.datetime.now(dt.timezone.utc)
    records=data.get("records") or []
    # De-duplicate by pair/frame/reference; once issued, values stay immutable.
    by_id={}
    for rec in records:
        if isinstance(rec,dict) and isinstance(rec.get("id"),str):by_id.setdefault(rec["id"],rec)
    records=list(by_id.values())
    # Never evaluate against a later/future candle without matching the recorded target.
    for pair in sorted({r.get("pair") for r in records if r.get("pair")}):
        for frame in HORIZONS:
            pending=[r for r in records if r.get("pair")==pair and r.get("frame")==frame and r.get("outcome") is None]
            if not pending:continue
            try:rows=candles(pair,{"1h":"60m"}.get(frame,frame),500)
            except (OSError,ValueError):continue
            indexed={int(c["t"]):c for c in rows}
            for rec in pending:
                due=dt.datetime.fromisoformat(rec["due_at_utc"])
                if due>now:continue
                candle=indexed.get(int(due.timestamp()*1000))
                if candle is None or int(candle["t"])+HORIZONS[frame]>int(now.timestamp()*1000):continue
                # The target is at candle opening, so an already-closed preceding
                # candle is needed. Its close corresponds to the target boundary.
                prev=indexed.get(int(due.timestamp()*1000)-HORIZONS[frame])
                if prev is None:continue
                actual=float(prev["c"])
                rec["outcome"]={"actual_price":actual,"measured_at_utc":due.isoformat(),
                    "squared_log_error":math.log(actual/rec["predicted_price"])**2,
                    "baseline_squared_log_error":math.log(actual/rec["reference_price"])**2}
    # Preserve all pending evaluations; pruning them would silently lose evidence.
    pending=[r for r in records if not r.get("outcome")]
    settled_all=[r for r in records if r.get("outcome")]
    data["records"]=settled_all[-5000:]+pending
    approvals={}
    for pair,frame in sorted({(r["pair"],r["frame"]) for r in records}):
        settled=[r for r in records if r["pair"]==pair and r["frame"]==frame and r.get("outcome")]
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
    data["approvals"]=approvals
    data["checked_at_utc"]=now.isoformat()
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
        pairs=list(retry)
        scanned=0
        while requested and len(pairs)<batch and scanned<len(requested):
            candidate=requested[(cursor+scanned)%len(requested)]
            if candidate not in pairs:pairs.append(candidate)
            scanned+=1
        data["cursor"]=(cursor+scanned)%max(len(requested),1)
        data["coverage"]={"discovered":len(requested),"processed_this_cycle":len(pairs),
                          "next_cursor":data["cursor"],"complete_this_cycle":batch==len(requested)}
    data=reconcile(data)
    issued={r["id"] for r in data["records"]}
    processed=[]
    failed={}
    for pair in pairs:
        try:values=forecasts({tf:candles(pair,{"1h":"60m"}.get(tf,tf)) for tf in HORIZONS})
        except (OSError,ValueError,TimeoutError) as exc:
            failed[pair]=type(exc).__name__
            continue
        processed.append(pair)
        for frame,result in values.items():
            if result.get("status")!="research_only":continue
            rid=pair+"|"+frame+"|"+result["reference_at_utc"]
            if rid in issued:continue
            data["records"].append(dict(id=rid,pair=pair,frame=frame,reference_price=result["reference_price"],
                predicted_price=result["predicted_price"],reference_at_utc=result["reference_at_utc"],
                due_at_utc=result["due_at_utc"],method=result["method"],outcome=None))
            issued.add(rid)
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

"""Safe declarative feature evolution and chronological isolated research lab.

No eval/exec, imports from candidate strings, network, filesystem writes, or
generated Python code. Candidates are immutable JSON-compatible expression
trees over already available, point-in-time numeric inputs.
"""
from dataclasses import dataclass,asdict
import hashlib,json,math,random,statistics

OPERATIONS=("identity","abs","clip","signed_log","square","multiply","difference")
MAX_DEPTH=2
MAX_NODES=7
MAX_CANDIDATES=64
ALLOWED_GROUPS=("regime","market","ticker","orderbook","trades","dex","onchain","news","project","macro","derivatives","feedback")

def fingerprint(spec):
    return hashlib.sha256(json.dumps(spec,sort_keys=True,separators=(",",":")).encode()).hexdigest()[:16]

def validate(spec,depth=0):
    if depth>MAX_DEPTH or not isinstance(spec,dict) or set(spec)-{"op","args","name"}:
        raise ValueError("invalid expression")
    op=spec.get("op")
    if op=="feature":
        name=spec.get("name")
        if not isinstance(name,str) or "." not in name or name.split(".",1)[0] not in ALLOWED_GROUPS or len(name)>100 or "args" in spec:
            raise ValueError("unapproved feature")
        return 1
    if op not in OPERATIONS or "name" in spec:
        raise ValueError("unapproved operator")
    args=spec.get("args")
    arity=2 if op in ("multiply","difference") else 1
    if not isinstance(args,list) or len(args)!=arity:
        raise ValueError("invalid arity")
    nodes=1+sum(validate(x,depth+1) for x in args)
    if nodes>MAX_NODES:raise ValueError("expression too large")
    return nodes

def compute(spec,features):
    validate(spec)
    def walk(node):
        op=node["op"]
        if op=="feature":
            x=features.get(node["name"])
            if x is None:return None
            try:x=float(x)
            except (TypeError,ValueError,OverflowError):return None
            return x if math.isfinite(x) else None
        args=[walk(a) for a in node["args"]]
        if any(a is None for a in args):return None
        a=args[0]
        if op=="identity":v=a
        elif op=="abs":v=abs(a)
        elif op=="clip":v=max(-10.,min(10.,a))
        elif op=="signed_log":v=math.copysign(math.log1p(abs(a)),a)
        elif op=="square":v=min(a*a,1e12)
        elif op=="multiply":v=a*args[1]
        else:v=a-args[1]
        return v if math.isfinite(v) else None
    return walk(spec)

def propose(feature_names,seed=0,limit=MAX_CANDIDATES):
    names=sorted({n for n in feature_names if isinstance(n,str) and "." in n and n.split(".",1)[0] in ALLOWED_GROUPS})
    rng=random.Random(seed)
    pool=[{"op":"feature","name":n} for n in names]
    specs=[]
    for base in pool:
        specs.extend([base,{"op":"signed_log","args":[base]},{"op":"clip","args":[base]},{"op":"abs","args":[base]}])
    for _ in range(min(3*limit,300)):
        if len(pool)<2:break
        a,b=rng.sample(pool,2)
        specs.append({"op":rng.choice(("difference","multiply")),"args":[a,b]})
    unique={}
    for s in specs:
        validate(s)
        unique[fingerprint(s)]=s
    return [unique[k] for k in sorted(unique)[:max(0,min(limit,MAX_CANDIDATES))]]

def chronological_lab(rows,spec,minimum_train=40,minimum_test=15):
    """Forward-only one-feature ridge-like slope; no fitted future information.

    Each row has feature_ms, target_ms, features and y. The label is usable only
    if target_ms <= the prediction's feature_ms. This is a research benchmark,
    not production approval.
    """
    validate(spec)
    data=sorted(rows,key=lambda r:r["feature_ms"])
    if len(data)<minimum_train+minimum_test:
        return {"status":"insufficient_data","samples":len(data)}
    predictions=[];actual=[];baseline=[]
    for i in range(minimum_train,len(data)):
        row=data[i];cut=row["feature_ms"]
        train=[r for r in data[:i] if r["target_ms"]<=cut and math.isfinite(float(r["y"]))]
        values=[(compute(spec,r["features"]),float(r["y"])) for r in train]
        values=[(x,y) for x,y in values if x is not None]
        current=compute(spec,row["features"])
        if current is None or len(values)<minimum_train:continue
        xs=[v[0] for v in values];ys=[v[1] for v in values]
        xm=statistics.mean(xs);ym=statistics.mean(ys)
        variance=sum((x-xm)**2 for x in xs)
        slope=sum((x-xm)*(y-ym) for x,y in values)/(variance+max(1e-8,variance*0.01))
        prediction=max(-1.,min(1.,ym+slope*(current-xm)))
        predictions.append(prediction);actual.append(float(row["y"]));baseline.append(0.)
    if len(actual)<minimum_test:return {"status":"insufficient_independent_tests","samples":len(actual)}
    mae=statistics.mean(abs(y-p) for y,p in zip(actual,predictions))
    baseline_mae=statistics.mean(abs(y) for y in actual)
    return {"status":"research_only","samples":len(actual),"mae":mae,
            "baseline_mae":baseline_mae,"skill":1-mae/baseline_mae if baseline_mae else None,
            "expression_version":fingerprint(spec),"production_approved":False}

def search(rows,names,seed=0):
    """Bounded, deterministic search; never grants production authority."""
    results=[]
    for spec in propose(names,seed):
        try:
            report=chronological_lab(rows,spec)
            if report["status"]=="research_only":results.append((report["mae"],fingerprint(spec),spec,report))
        except (ValueError,TypeError,OverflowError,ZeroDivisionError):
            continue
    if not results:return {"status":"no_valid_candidate","tested":0,"approved":False}
    results.sort(key=lambda r:(r[0],r[1]))
    _,_,spec,report=results[0]
    return {"status":"research_only","tested":len(results),"best_expression":spec,
            "best_report":report,"approved":False,
            "limitation":"Repeated search scores are exploratory; separate untouched holdout and prospective governor approval required"}

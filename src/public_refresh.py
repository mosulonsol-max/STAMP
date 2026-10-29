"""Refresh public market data independently of private GitHub credentials.

Forecasts/journal remain the scheduled, persisted outputs. Request-time prices
never silently refresh the timestamp or approval of an archived model.
"""
import copy,datetime as dt,json,math
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
try:
    from src.market_features import technical,orderbook,trades
    from src.evidence_brief import compose
except ImportError:
    from market_features import technical,orderbook,trades
    from evidence_brief import compose

def closed(raw,ms,now_ms):
    rows=[]
    for c in raw if isinstance(raw,list) else []:
        try:
            t=int(c[0]);o,h,l,p,v=map(float,c[1:6])
            if t+ms>now_ms or not all(map(math.isfinite,(o,h,l,p,v))) or not 0<l<=min(o,p)<=max(o,p)<=h or v<0:continue
            rows.append(dict(t=t,o=o,h=h,l=l,c=p,v=v))
        except (ValueError,IndexError,TypeError):continue
    return rows

def fetch(path):
    try:
        req=Request("https://api.mexc.com/api/v3/"+path,headers={"Accept":"application/json","User-Agent":"STAMP-public-research/2"})
        with urlopen(req,timeout=4) as res:raw=res.read(1000001)
        if len(raw)>1000000:raise ValueError("oversized_response")
        return json.loads(raw),None
    except Exception as exc:return None,type(exc).__name__

def refresh(payload):
    q=payload.get("live_quote") or {}
    if q.get("status")!="fresh":return payload
    try:
        observed=dt.datetime.fromisoformat(q["retrieved_at_utc"].replace("Z","+00:00"))
        if abs((dt.datetime.now(dt.timezone.utc)-observed).total_seconds())>180:return payload
    except (KeyError,ValueError,TypeError):return payload
    paths={"book":"depth?symbol=STAMPUSDT&limit=100","trades":"trades?symbol=STAMPUSDT&limit=1000",
           **{tf:"klines?symbol=STAMPUSDT&interval="+interval+"&limit=500" for tf,interval in (("15m","15m"),("1h","60m"),("4h","4h"),("1d","1d"))}}
    with ThreadPoolExecutor(max_workers=6) as pool:fetched=dict(zip(paths,pool.map(fetch,paths.values())))
    now=dt.datetime.now(dt.timezone.utc);now_ms=int(now.timestamp()*1000)
    hour=closed(fetched["1h"][0],3600000,now_ms)
    # A current ticker alone must not relabel stale analytics as fresh.
    if not hour or now_ms-(hour[-1]["t"]+3600000)>5400000:return payload
    result=copy.deepcopy(payload);result["archive_observed_utc"]=payload.get("archive_observed_utc") or payload.get("observed_utc")
    result["model_observed_utc"]=(payload.get("learning") or {}).get("at_utc") or payload.get("observed_utc")
    result["observed_utc"]=now.isoformat();result["market_status"]="FRESH";result["age_seconds"]=0
    result["source"]="public_market_with_private_archive";result["public_refresh"]={"at_utc":now.isoformat(),"persisted":False,"scope":"market and indicators only; forecasts retain their original issue times"}
    result["market"].update(price=q["price"],bid=q.get("bid"),ask=q.get("ask"),change=q.get("change_24h_pct",0)/100 if q.get("change_24h_pct") is not None else None,volume=q.get("volume_24h_usdt"))
    result.setdefault("source_health",{})
    for name,(raw,error) in fetched.items():
        result["source_health"]["live_mexc_"+name]={"status":"unavailable" if error else "ok","observed_utc":now.isoformat(),"error":error}
    for tf,ms in (("15m",900000),("1h",3600000),("4h",14400000),("1d",86400000)):
        incoming=closed(fetched[tf][0],ms,now_ms)
        if not incoming:continue
        merged={c["t"]:c for c in result.get("candles",{}).get(tf,[])+incoming}
        series=[merged[t] for t in sorted(merged)][-5000:]
        result.setdefault("candles",{})[tf]=series
        result.setdefault("technical",{})[tf]=technical(series)
    for name,fn in (("book",orderbook),("trades",trades)):
        if not fetched[name][1]:
            result["market"][name]=fn(fetched[name][0])
            result["market"][name+"_at_utc"]=now.isoformat()
        elif name+"_at_utc" not in result["market"]:
            result["market"][name+"_at_utc"]=result["archive_observed_utc"]
    result["market_brief"]=compose(result)
    return result

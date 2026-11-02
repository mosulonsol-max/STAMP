"""Authenticated on-demand multi-pair market comparisons; descriptive, not causal."""
import json,math,re,datetime as dt
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from urllib.parse import urlencode

BASE="https://api.mexc.com/api/v3/"
ALLOWED=re.compile(r"^[A-Z0-9]{2,22}USDT$")
INTERVALS={"15m","30m","60m","4h","1d"}
def fetch(endpoint,params=None):
    url=BASE+endpoint+("?" + urlencode(params) if params else "")
    req=Request(url,headers={"Accept":"application/json","User-Agent":"STAMP-Research/1.0"})
    with urlopen(req,timeout=8) as res:
        raw=res.read(700001)
    if len(raw)>700000:raise ValueError("oversized_response")
    return json.loads(raw)
def symbol(value):
    v=str(value or "").upper().strip().replace("/","")
    if not ALLOWED.fullmatch(v):raise ValueError("invalid_usdt_symbol")
    return v
def universe():
    info=fetch("exchangeInfo")
    pairs=sorted({x.get("symbol") for x in info.get("symbols",[]) if isinstance(x,dict) and isinstance(x.get("symbol"),str) and ALLOWED.fullmatch(x["symbol"]) and x.get("status") in ("1","ENABLED","TRADING",None)})
    return {"pairs":pairs,"count":len(pairs),"source":"MEXC exchangeInfo","retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
def candles(pair,interval="60m",limit=300):
    pair=symbol(pair)
    if interval not in INTERVALS:raise ValueError("invalid_interval")
    raw=fetch("klines",{"symbol":pair,"interval":interval,"limit":min(500,max(60,int(limit)))})
    points=[]
    for row in raw:
        try:
            t=int(row[0]);o,h,l,c=map(float,row[1:5]);v=float(row[5])
            if all(math.isfinite(x) for x in (o,h,l,c,v)) and min(o,h,l,c)>0 and h>=max(o,c) and l<=min(o,c):
                points.append({"t":t,"o":o,"h":h,"l":l,"c":c,"v":v})
        except (TypeError,ValueError,IndexError):pass
    points.sort(key=lambda x:x["t"])
    return points
def corr(xs,ys):
    if len(xs)<30:return None
    xm=sum(xs)/len(xs);ym=sum(ys)/len(ys)
    den=math.sqrt(sum((x-xm)**2 for x in xs)*sum((y-ym)**2 for y in ys))
    return round(sum((x-xm)*(y-ym) for x,y in zip(xs,ys))/den,5) if den>0 else None
def compare(primary,secondary):
    primary=symbol(primary);secondary=symbol(secondary)
    a=candles(primary);b=candles(secondary)
    def returns(series):
        out={}
        for previous,current in zip(series,series[1:]):
            if current["t"]-previous["t"]==3600000:out[current["t"]]=math.log(current["c"]/previous["c"])
        return out
    aa=returns(a);bb=returns(b)
    aligned=sorted(aa.keys()&bb.keys())[-240:]
    vals=[aa[t] for t in aligned];other=[bb[t] for t in aligned]
    lagged={}
    # secondary leads primary by k *hourly bars*: compare secondary[t-k] to primary[t].
    for k in (0,1,2,4,8,12,24):
        joined=[(aa[t],bb[t-k*3600000]) for t in sorted(aa) if t-k*3600000 in bb][-240:]
        lagged[str(k)]=dict(correlation=corr([x for x,y in joined],[y for x,y in joined]),samples=len(joined))
    return {"primary":primary,"secondary":secondary,"hourly_samples":len(aligned),
      "correlation":corr(vals,other),"lead_lag_hours":lagged,
      "source":"MEXC public 1h closed-candle log returns",
      "interpretation":"Associations are not evidence of causation or predictive skill; overlapping windows and market-wide factors can create spurious correlations.",
      "observed_through_utc":dt.datetime.fromtimestamp(aligned[-1]/1000,dt.timezone.utc).isoformat() if aligned else None}

def forecast_frame(rows,frame):
    """Leakage-free one-step holdout: compare momentum forecast to no-change baseline."""
    step={"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000}[frame]
    now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
    valid=[c for c in rows if c["t"]+step<=now]
    returns=[math.log(b["c"]/a["c"]) for a,b in zip(valid,valid[1:]) if b["t"]-a["t"]==step]
    if len(returns)<65 or len(valid)<66:return {"status":"insufficient_evidence","samples":len(returns)}
    # Prequential validation: each forecast uses only historical returns preceding the target.
    errors=[];baseline=[]
    for i in range(40,len(returns)):
        history=returns[i-20:i]
        estimate=sum(history[-6:])/6
        errors.append((returns[i]-estimate)**2)
        baseline.append(returns[i]**2)
    improvement=1-sum(errors)/sum(baseline) if sum(baseline)>0 else None
    last=valid[-1];drift=sum(returns[-6:])/6
    # Research projection only: strict skill gate and no invented probability.
    target=last["c"]*math.exp(drift)
    volatility=math.sqrt(sum((v-sum(returns[-30:])/30)**2 for v in returns[-30:])/29)
    due=dt.datetime.fromtimestamp((last["t"]+2*step)/1000,dt.timezone.utc).isoformat()
    return {"status":"research_only","method":"causal_6_return_momentum",
      "samples":len(errors),"relative_mse_improvement":round(improvement,5) if improvement is not None else None,
      "reference_price":last["c"],"reference_at_utc":dt.datetime.fromtimestamp((last["t"]+step)/1000,dt.timezone.utc).isoformat(),
      "predicted_price":target,"due_at_utc":due,"direction":"up" if drift>0 else "down" if drift<0 else "flat",
      "volatility_1sigma_log":volatility,"lower_1sigma":target*math.exp(-volatility),
      "upper_1sigma":target*math.exp(volatility),
      "invalidation_price":last["c"]*math.exp(-volatility if drift>0 else volatility),
      "warning":"Unapproved experimental projection, NOT a trading signal; no causal proof or validated confidence probability."}
def forecasts(frames):
    return {frame:forecast_frame(rows,frame) for frame,rows in frames.items() if frame in ("15m","1h","4h","1d")}

def snapshot(pair):
    pair=symbol(pair)
    quote=fetch("ticker/24hr",{"symbol":pair})
    if not isinstance(quote,dict) or quote.get("symbol")!=pair:raise ValueError("wrong_symbol_quote")
    with ThreadPoolExecutor(max_workers=4) as pool:
        frames=dict(zip(("15m","1h","4h","1d"),pool.map(lambda tf:candles(pair,tf),("15m","60m","4h","1d"))))
    result={"symbol":pair,"ticker":quote,"candles":frames,"research_forecasts":forecasts(frames),"source":"MEXC public REST",
      "retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
    return result

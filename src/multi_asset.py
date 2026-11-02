"""Authenticated on-demand multi-pair market comparisons; descriptive, not causal."""
import json,math,re,datetime as dt
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
def snapshot(pair):
    pair=symbol(pair)
    quote=fetch("ticker/24hr",{"symbol":pair})
    if not isinstance(quote,dict) or quote.get("symbol")!=pair:raise ValueError("wrong_symbol_quote")
    result={"symbol":pair,"ticker":quote,"candles":candles(pair,"15m"),"source":"MEXC public REST",
      "retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
    return result

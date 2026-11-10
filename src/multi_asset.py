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
    limit=15000000 if endpoint=="exchangeInfo" else 3000000
    with urlopen(req,timeout=12) as res:
        raw=res.read(limit+1)
    if len(raw)>limit:raise ValueError("oversized_response")
    return json.loads(raw)
def symbol(value):
    v=str(value or "").upper().strip().replace("/","")
    if not ALLOWED.fullmatch(v):raise ValueError("invalid_usdt_symbol")
    return v
def universe():
    info=fetch("exchangeInfo")
    pairs=sorted({x.get("symbol") for x in info.get("symbols",[]) if isinstance(x,dict) and isinstance(x.get("symbol"),str) and ALLOWED.fullmatch(x["symbol"]) and str(x.get("status","1")).upper() in ("1","ENABLED","TRADING","TRUE")})
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


def venue_comparison(pair):
    """Independent public spot quotes. A failed venue is never treated as zero price."""
    pair=symbol(pair)
    base=pair[:-4]
    endpoints={
      "MEXC":("https://api.mexc.com/api/v3/ticker/bookTicker?"+urlencode({"symbol":pair}),lambda x:(x["bidPrice"],x["askPrice"])),
      "Binance":("https://api.binance.com/api/v3/ticker/bookTicker?"+urlencode({"symbol":pair}),lambda x:(x["bidPrice"],x["askPrice"])),
      "OKX":("https://www.okx.com/api/v5/market/ticker?"+urlencode({"instId":base+"-USDT"}),lambda x:(x["data"][0]["bidPx"],x["data"][0]["askPx"])),
      "Bybit":("https://api.bybit.com/v5/market/tickers?"+urlencode({"category":"spot","symbol":pair}),lambda x:(x["result"]["list"][0]["bid1Price"],x["result"]["list"][0]["ask1Price"])),
      "KuCoin":("https://api.kucoin.com/api/v1/market/orderbook/level1?"+urlencode({"symbol":base+"-USDT"}),lambda x:(x["data"]["bestBid"],x["data"]["bestAsk"])),
      "Gate":("https://api.gateio.ws/api/v4/spot/order_book?"+urlencode({"currency_pair":base+"_USDT","limit":1}),lambda x:(x["bids"][0][0],x["asks"][0][0])),
      "Bitget":("https://api.bitget.com/api/v2/spot/market/tickers?"+urlencode({"symbol":pair}),lambda x:(x["data"][0]["bidPr"],x["data"][0]["askPr"])),
    }
    def query(item):
        name,(url,extract)=item
        try:
            req=Request(url,headers={"Accept":"application/json","User-Agent":"STAMP-Research/1.0"})
            with urlopen(req,timeout=5) as res:raw=res.read(150001)
            if len(raw)>150000:raise ValueError("oversized_quote")
            obj=json.loads(raw);bid,ask=map(float,extract(obj))
            if not all(math.isfinite(v) and v>0 for v in (bid,ask)) or bid>ask:raise ValueError("invalid_bid_ask")
            return name,{"status":"ok","bid":bid,"ask":ask,"mid":(bid+ask)/2,"spread_pct":100*(ask-bid)/((ask+bid)/2),"retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
        except Exception as exc:
            return name,{"status":"unavailable","reason":type(exc).__name__}
    with ThreadPoolExecutor(max_workers=len(endpoints)) as pool:venues=dict(pool.map(query,endpoints.items()))
    valid={k:v for k,v in venues.items() if v["status"]=="ok"}
    mids=sorted(v["mid"] for v in valid.values())
    median=mids[len(mids)//2] if len(mids)%2 else (mids[len(mids)//2-1]+mids[len(mids)//2])/2 if mids else None
    for v in valid.values():v["deviation_from_median_pct"]=round(100*(v["mid"]/median-1),5) if median and pair in {"BTCUSDT","ETHUSDT","SOLUSDT"} else None
    # Symbol equality does not establish token identity, especially on DEX-linked or new listings.
    identity_verified=pair in {"BTCUSDT","ETHUSDT","SOLUSDT"}
    dispersion=100*(max(mids)/min(mids)-1) if len(mids)>1 and identity_verified else None
    return {"symbol":pair,"venues":venues,"available_venues":len(valid),"mid_dispersion_pct":dispersion,"median_mid":median if identity_verified else None,"identity_status":"verified_major_pair" if identity_verified else "unverified_cross_venue_asset_identity","retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"warning":"Public spot quotes are not executable prices. Venue symbols may refer to different assets; verify contract/network identity before comparing, especially STAMP. No causal flow or cross-exchange transfer is inferred."}

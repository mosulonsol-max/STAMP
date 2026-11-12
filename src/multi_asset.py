"""Authenticated on-demand multi-pair market comparisons; descriptive, not causal."""
import json,math,re,datetime as dt,threading,time
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request,urlopen
from urllib.parse import urlencode

BASE="https://api.mexc.com/api/v3/"
ALLOWED=re.compile(r"^[A-Z0-9]{1,22}USDT$")
INTERVALS={"15m","30m","60m","4h","1d"}
VENUES=("MEXC","Binance","OKX","Bybit","KuCoin","Gate","Bitget")
_CATALOG={"at":0.0,"value":None}
_CATALOG_LOCK=threading.Lock()
def public_json(url, timeout=6, limit=20000000):
    req=Request(url,headers={"Accept":"application/json","User-Agent":"STAMP-Research/1.0"})
    with urlopen(req,timeout=timeout) as res:raw=res.read(limit+1)
    if len(raw)>limit:raise ValueError("oversized_catalog")
    return json.loads(raw)
def venue_symbols(venue):
    """Spot USDT instruments that the venue reports as tradeable now."""
    if venue=="MEXC":
        obj=fetch("exchangeInfo",timeout=6)
        rows=obj["symbols"]
        return {r["symbol"] for r in rows if isinstance(r,dict) and str(r.get("status","1")).upper() in ("1","ENABLED","TRADING","TRUE") and ALLOWED.fullmatch(str(r.get("symbol","")))}
    if venue=="Binance":
        rows=public_json("https://api.binance.com/api/v3/exchangeInfo")["symbols"]
        return {r["symbol"] for r in rows if r.get("status")=="TRADING" and r.get("isSpotTradingAllowed",True) and ALLOWED.fullmatch(str(r.get("symbol","")))}
    if venue=="OKX":
        rows=public_json("https://www.okx.com/api/v5/public/instruments?instType=SPOT")["data"]
        return {r["baseCcy"]+"USDT" for r in rows if r.get("quoteCcy")=="USDT" and r.get("state")=="live" and ALLOWED.fullmatch(str(r.get("baseCcy",""))+"USDT")}
    if venue=="Bybit":
        rows=[];cursor=""
        for _ in range(20):
            obj=public_json("https://api.bybit.com/v5/market/instruments-info?"+urlencode({"category":"spot","limit":1000,**({"cursor":cursor} if cursor else {})}))
            if obj.get("retCode")!=0:raise ValueError("bybit_catalog_error")
            result=obj["result"];rows.extend(result["list"])
            next_cursor=result.get("nextPageCursor") or ""
            if not next_cursor or next_cursor==cursor:break
            cursor=next_cursor
        return {r["symbol"] for r in rows if r.get("status")=="Trading" and ALLOWED.fullmatch(str(r.get("symbol","")))}
    if venue=="KuCoin":
        obj=public_json("https://api.kucoin.com/api/v2/symbols")
        if str(obj.get("code"))!="200000":raise ValueError("kucoin_catalog_error")
        return {r["baseCurrency"]+"USDT" for r in obj["data"] if r.get("quoteCurrency")=="USDT" and r.get("enableTrading") is True and ALLOWED.fullmatch(str(r.get("baseCurrency",""))+"USDT")}
    if venue=="Gate":
        rows=public_json("https://api.gateio.ws/api/v4/spot/currency_pairs")
        return {r["base"]+"USDT" for r in rows if r.get("quote")=="USDT" and r.get("trade_status")=="tradable" and ALLOWED.fullmatch(str(r.get("base",""))+"USDT")}
    if venue=="Bitget":
        obj=public_json("https://api.bitget.com/api/v2/spot/public/symbols")
        if obj.get("code")!="00000":raise ValueError("bitget_catalog_error")
        return {r["symbol"] for r in obj["data"] if r.get("quoteCoin")=="USDT" and r.get("status")=="online" and ALLOWED.fullmatch(str(r.get("symbol","")))}
    raise ValueError("unsupported_venue")
def fetch(endpoint,params=None,timeout=12):
    url=BASE+endpoint+("?" + urlencode(params) if params else "")
    req=Request(url,headers={"Accept":"application/json","User-Agent":"STAMP-Research/1.0"})
    limit=15000000 if endpoint=="exchangeInfo" else 3000000
    with urlopen(req,timeout=timeout) as res:
        raw=res.read(limit+1)
    if len(raw)>limit:raise ValueError("oversized_response")
    return json.loads(raw)
def symbol(value):
    v=str(value or "").upper().strip().replace("/","")
    if not ALLOWED.fullmatch(v):raise ValueError("invalid_usdt_symbol")
    return v
def pair_catalog(values, source):
    pairs = sorted({pair for pair in values if isinstance(pair, str) and ALLOWED.fullmatch(pair)})
    if not pairs:
        raise OSError("empty_mexc_pair_catalog")
    return {
        "pairs": pairs, "count": len(pairs), "source": source,
        "retrieved_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
    }

def universe(timeout=12):
    info = fetch("exchangeInfo", timeout=timeout)
    rows = info.get("symbols") if isinstance(info, dict) else None
    if not isinstance(rows, list):
        raise OSError("invalid_mexc_pair_catalog")
    return pair_catalog((
        row.get("symbol") for row in rows
        if isinstance(row, dict) and str(row.get("status", "1")).upper() in ("1", "ENABLED", "TRADING", "TRUE")
    ), "MEXC exchangeInfo")

def dashboard_universe():
    with _CATALOG_LOCK:
        if _CATALOG["value"] and time.monotonic()-_CATALOG["at"]<300:return _CATALOG["value"]
    def query(venue):
        try:
            values=venue_symbols(venue)
            if not values:raise ValueError("empty_venue_catalog")
            return venue,values,None
        except (OSError,ValueError,KeyError,TypeError,IndexError) as exc:
            return venue,set(),type(exc).__name__
    with ThreadPoolExecutor(max_workers=len(VENUES)) as pool:
        results=list(pool.map(query,VENUES))
    sources={venue:{"status":"ok" if values else "unavailable","count":len(values),**({"reason":error} if error else {})}
             for venue,values,error in results}
    by_pair={}
    for venue,values,_ in results:
        for pair in values:by_pair.setdefault(pair,[]).append(venue)
    if not by_pair:raise OSError("all_venue_catalogs_unavailable")
    result={"pairs":sorted(by_pair),"count":len(by_pair),"venues":by_pair,"sources":sources,
            "source":"connected spot USDT exchange catalogs","retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
    with _CATALOG_LOCK:_CATALOG.update(at=time.monotonic(),value=result)
    return result

def candles(pair,interval="60m",limit=300,timeout=12):
    pair=symbol(pair)
    if interval not in INTERVALS:raise ValueError("invalid_interval")
    raw=fetch("klines",{"symbol":pair,"interval":interval,"limit":min(500,max(60,int(limit)))},timeout=timeout)
    if not isinstance(raw,list):raise OSError("invalid_mexc_candles")
    points=[]
    for row in raw:
        try:
            t=int(row[0]);o,h,l,c=map(float,row[1:5]);v=float(row[5])
            if all(math.isfinite(x) for x in (o,h,l,c,v)) and min(o,h,l,c)>0 and h>=max(o,c) and l<=min(o,c):
                points.append({"t":t,"o":o,"h":h,"l":l,"c":c,"v":v})
        except (TypeError,ValueError,IndexError,KeyError):pass
    points.sort(key=lambda x:x["t"])
    return points
def corr(xs,ys):
    if len(xs)<30:return None
    xm=sum(xs)/len(xs);ym=sum(ys)/len(ys)
    den=math.sqrt(sum((x-xm)**2 for x in xs)*sum((y-ym)**2 for y in ys))
    return round(sum((x-xm)*(y-ym) for x,y in zip(xs,ys))/den,5) if den>0 else None
def comparison_candles(pair):
    """Select an observed venue for an hourly pair history, including non-MEXC pairs."""
    with _CATALOG_LOCK:catalog=_CATALOG["value"]
    venues=catalog.get("venues",{}).get(pair) if catalog else None
    candidates=venues or VENUES
    for venue in candidates:
        try:
            rows=candles(pair) if venue=="MEXC" else venue_candles(venue,pair,"1h")
            if len(rows)>=30:return rows,venue
        except (OSError,ValueError,KeyError,TypeError,IndexError):continue
    raise OSError("hourly_pair_history_unavailable")
def compare(primary,secondary):
    primary=symbol(primary);secondary=symbol(secondary)
    a,primary_venue=comparison_candles(primary);b,secondary_venue=comparison_candles(secondary)
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
      "source":primary_venue+" / "+secondary_venue+" public 1h closed-candle log returns",
      "primary_venue":primary_venue,"secondary_venue":secondary_venue,
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

def venue_ticker(venue,pair):
    base=pair[:-4]
    if venue=="MEXC":return fetch("ticker/24hr",{"symbol":pair},timeout=5)
    if venue=="Binance":
        obj=public_json("https://api.binance.com/api/v3/ticker/24hr?"+urlencode({"symbol":pair}))
        return {"symbol":obj["symbol"],"lastPrice":obj["lastPrice"],"priceChangePercent":obj["priceChangePercent"],"quoteVolume":obj["quoteVolume"],"highPrice":obj["highPrice"],"lowPrice":obj["lowPrice"],"closeTime":obj.get("closeTime")}
    if venue=="OKX":
        obj=public_json("https://www.okx.com/api/v5/market/ticker?"+urlencode({"instId":base+"-USDT"}))
        if obj.get("code")!="0":raise ValueError("okx_ticker_error")
        row=obj["data"][0];last=float(row["last"]);open24=float(row["open24h"])
        return {"symbol":pair,"lastPrice":last,"priceChangePercent":100*(last/open24-1) if open24>0 else None,
                "quoteVolume":float(row["volCcy24h"]),"highPrice":row["high24h"],"lowPrice":row["low24h"],"closeTime":int(row["ts"])}
    if venue=="Bybit":
        obj=public_json("https://api.bybit.com/v5/market/tickers?"+urlencode({"category":"spot","symbol":pair}))
        if obj.get("retCode")!=0:raise ValueError("bybit_ticker_error")
        row=obj["result"]["list"][0]
        return {"symbol":pair,"lastPrice":row["lastPrice"],"priceChangePercent":float(row["price24hPcnt"])*100,
                "quoteVolume":row["turnover24h"],"highPrice":row["highPrice24h"],"lowPrice":row["lowPrice24h"]}
    if venue=="KuCoin":
        obj=public_json("https://api.kucoin.com/api/v1/market/stats?"+urlencode({"symbol":base+"-USDT"}))
        if str(obj.get("code"))!="200000":raise ValueError("kucoin_ticker_error")
        row=obj["data"]
        return {"symbol":pair,"lastPrice":row["last"],"priceChangePercent":float(row["changeRate"])*100,
                "quoteVolume":row["volValue"],"highPrice":row["high"],"lowPrice":row["low"],"closeTime":obj.get("time")}
    if venue=="Gate":
        row=public_json("https://api.gateio.ws/api/v4/spot/tickers?"+urlencode({"currency_pair":base+"_USDT"}))[0]
        return {"symbol":pair,"lastPrice":row["last"],"priceChangePercent":row.get("change_percentage"),
                "quoteVolume":row.get("quote_volume"),"highPrice":row.get("high_24h"),"lowPrice":row.get("low_24h")}
    if venue=="Bitget":
        obj=public_json("https://api.bitget.com/api/v2/spot/market/tickers?"+urlencode({"symbol":pair}))
        if obj.get("code")!="00000":raise ValueError("bitget_ticker_error")
        row=obj["data"][0]
        return {"symbol":pair,"lastPrice":row["lastPr"],"priceChangePercent":float(row["change24h"])*100,
                "quoteVolume":row["usdtVolume"],"highPrice":row["high24h"],"lowPrice":row["low24h"],"closeTime":row.get("ts")}
    raise ValueError("unsupported_venue")

def venue_candles(venue,pair,frame):
    if venue=="MEXC":return candles(pair,{"1h":"60m"}.get(frame,frame),timeout=6)
    base=pair[:-4];interval={"15m":"15m","1h":"1h","4h":"4h","1d":"1d"}[frame]
    if venue=="Binance":
        rows=public_json("https://api.binance.com/api/v3/klines?"+urlencode({"symbol":pair,"interval":interval,"limit":300}))
        values=[(r[0],r[1],r[2],r[3],r[4],r[5]) for r in rows]
    elif venue=="OKX":
        rows=public_json("https://www.okx.com/api/v5/market/candles?"+urlencode({"instId":base+"-USDT","bar":{"1h":"1H","4h":"4H","1d":"1D"}.get(frame,"15m"),"limit":300}))["data"]
        values=[(r[0],r[1],r[2],r[3],r[4],r[5]) for r in rows if len(r)>8 and r[8]=="1"]
    elif venue=="Bybit":
        obj=public_json("https://api.bybit.com/v5/market/kline?"+urlencode({"category":"spot","symbol":pair,"interval":{"15m":"15","1h":"60","4h":"240","1d":"D"}[frame],"limit":300}))
        if obj.get("retCode")!=0:raise ValueError("bybit_candle_error")
        values=[(r[0],r[1],r[2],r[3],r[4],r[5]) for r in obj["result"]["list"]]
    elif venue=="KuCoin":
        obj=public_json("https://api.kucoin.com/api/v1/market/candles?"+urlencode({"symbol":base+"-USDT","type":{"15m":"15min","1h":"1hour","4h":"4hour","1d":"1day"}[frame]}))
        if str(obj.get("code"))!="200000":raise ValueError("kucoin_candle_error")
        values=[(int(r[0])*1000,r[1],r[3],r[4],r[2],r[5]) for r in obj["data"][:300]]
    elif venue=="Gate":
        rows=public_json("https://api.gateio.ws/api/v4/spot/candlesticks?"+urlencode({"currency_pair":base+"_USDT","interval":frame,"limit":300}))
        values=[(int(r[0])*1000,r[5],r[3],r[4],r[2],r[1]) for r in rows]
    elif venue=="Bitget":
        obj=public_json("https://api.bitget.com/api/v2/spot/market/candles?"+urlencode({"symbol":pair,"granularity":{"15m":"15min","1h":"1h","4h":"4h","1d":"1day"}[frame],"limit":300}))
        if obj.get("code")!="00000":raise ValueError("bitget_candle_error")
        values=[(r[0],r[1],r[2],r[3],r[4],r[5]) for r in obj["data"]]
    else:raise ValueError("unsupported_venue")
    out={}
    for raw in values:
        try:
            t=int(raw[0]);o,h,l,c,v=map(float,raw[1:]);
            if t>0 and all(math.isfinite(x) for x in (o,h,l,c,v)) and min(o,h,l,c)>0 and h>=max(o,c) and l<=min(o,c) and v>=0:
                out[t]={"t":t,"o":o,"h":h,"l":l,"c":c,"v":v}
        except (ValueError,TypeError,IndexError):continue
    return [out[t] for t in sorted(out)]

def snapshot(pair):
    pair = symbol(pair)
    with _CATALOG_LOCK:catalog=_CATALOG["value"]
    candidates=(catalog.get("venues",{}).get(pair,[]) if catalog else list(VENUES))
    if not candidates:candidates=list(VENUES)
    # A venue's actual response, not a catalog entry alone, establishes availability.
    def probe(name):
        try:
            item=venue_ticker(name,pair)
            if item.get("symbol")!=pair or not math.isfinite(float(item["lastPrice"])) or float(item["lastPrice"])<=0:return None
            return item
        except (OSError,ValueError,KeyError,TypeError,IndexError):return None
    with ThreadPoolExecutor(max_workers=len(candidates)) as pool:
        responses=dict(zip(candidates,pool.map(probe,candidates)))
    available=[name for name in candidates if responses[name] is not None]
    venue=available[0] if available else None
    ticker=responses.get(venue) if venue else None
    if venue is None:raise OSError("all_venue_pair_data_unavailable")
    with ThreadPoolExecutor(max_workers=4) as pool:
        tasks={frame:pool.submit(venue_candles,venue,pair,frame) for frame in ("15m","1h","4h","1d")}
        frames={}
        for frame,task in tasks.items():
            try:frames[frame]=task.result()
            except (OSError,ValueError,KeyError,TypeError,IndexError):frames[frame]=[]
    return {
        "symbol": pair, "ticker": ticker, "candles": frames,
        "research_forecasts": forecasts(frames), "source": venue+" public spot REST","venue":venue,
        "available_venues":available,"venue_identity":"symbol_match_only" if pair not in {"BTCUSDT","ETHUSDT","SOLUSDT"} else "major_pair",
        "retrieved_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


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

def venue_diagnostics(pair):
    """Explicit connector diagnostics. HTTP success is not proof of venue success."""
    data=venue_comparison(pair)
    rows=[]
    for name,v in data["venues"].items():
        rows.append({"venue":name,"connected":v["status"]=="ok","status":v["status"],
          "error":v.get("reason"),"retrieved_at_utc":v.get("retrieved_at_utc"),
          "bid":v.get("bid"),"ask":v.get("ask"),"spread_pct":v.get("spread_pct")})
    return {"symbol":data["symbol"],"connected":sum(x["connected"] for x in rows),
      "total":len(rows),"connectors":rows,"identity_status":data["identity_status"],
      "retrieved_at_utc":data["retrieved_at_utc"],
      "analysis_source":"One responding spot venue per selected pair; STAMP research: MEXC",
      "model_status":"research_only","cross_venue_flow":True,"cross_venue_model_ingestion":False,
      "warning":"Venue trade samples are shown separately for unverified assets. A responding quote is not proof that same-named tokens have identical contracts or networks."}

"""Evidence-rich market microstructure and technical feature extraction.

Snapshots are not complete exchange history. Values are descriptive, not forecasts.
"""
import math,statistics
def finite(x):
    try:
        v=float(x)
        return v if math.isfinite(v) else None
    except (TypeError,ValueError):return None
def ema_series(xs,n):
    if len(xs)<n:return []
    a=2/(n+1);v=sum(xs[:n])/n;out=[None]*(n-1)+[v]
    for x in xs[n:]:v=a*x+(1-a)*v;out.append(v)
    return out
def technical(cs):
    if len(cs)<35:return {"status":"insufficient_data","candles":len(cs)}
    close=[x["c"] for x in cs];high=[x["h"] for x in cs];low=[x["l"] for x in cs];vol=[x["v"] for x in cs]
    n=len(cs);e9=ema_series(close,9);e21=ema_series(close,21);e50=ema_series(close,50);e200=ema_series(close,200)
    fast=ema_series(close,12);slow=ema_series(close,26)
    macd=[a-b for a,b in zip(fast[25:],slow) if a is not None and b is not None]
    sig=ema_series(macd,9)
    last=close[-1];window=close[-20:];avg=sum(window)/20;sd=statistics.pstdev(window)
    tp=[(h+l+c)/3 for h,l,c in zip(high,low,close)]
    v20=sum(vol[-20:]);vwap=sum(t*v for t,v in zip(tp[-20:],vol[-20:]))/v20 if v20 else None
    tr=[max(high[i]-low[i],abs(high[i]-close[i-1]),abs(low[i]-close[i-1])) for i in range(1,n)]
    atr14=sum(tr[-14:])/14
    up=[max(close[i]-close[i-1],0) for i in range(1,n)]
    dn=[max(close[i-1]-close[i],0) for i in range(1,n)]
    up14=sum(up[-14:]);dn14=sum(dn[-14:])
    rsi=100 if dn14==0 else 100-100/(1+up14/dn14)
    # Directional movement / ADX using Wilder smoothing on complete history.
    plus=[];minus=[]
    for i in range(1,n):
        u=high[i]-high[i-1];d=low[i-1]-low[i]
        plus.append(u if u>d and u>0 else 0)
        minus.append(d if d>u and d>0 else 0)
    def smooth(xs,p=14):
        if len(xs)<p:return []
        v=sum(xs[:p]);out=[v]
        for x in xs[p:]:v=v-v/p+x;out.append(v)
        return out
    ts=smooth(tr);ps=smooth(plus);ms=smooth(minus)
    dx=[100*abs(p-m)/(p+m) if p+m else 0 for p,m in zip(ps,ms)]
    adx=smooth(dx)
    adx14=adx[-1]/14 if adx else None
    # OBV from candle-close direction, not exchange trade-side classification.
    obv=sum(vol[i] if close[i]>close[i-1] else -vol[i] if close[i]<close[i-1] else 0 for i in range(1,n))
    # Money Flow Index (14 completed candles).
    positive=negative=0
    for i in range(n-14,n):
        flow=tp[i]*vol[i]
        if tp[i]>tp[i-1]:positive+=flow
        elif tp[i]<tp[i-1]:negative+=flow
    mfi=100 if negative==0 else 100-100/(1+positive/negative)
    # Stochastic oscillator.
    hh=max(high[-14:]);ll=min(low[-14:])
    stoch=100*(last-ll)/(hh-ll) if hh>ll else None
    # Chaikin money flow, using OHLCV approximation.
    cmf_num=sum(((2*c-h-l)/(h-l) if h>l else 0)*v for h,l,c,v in zip(high[-20:],low[-20:],close[-20:],vol[-20:]))
    cmf=cmf_num/v20 if v20 else None
    returns=[math.log(close[i]/close[i-1]) for i in range(n-19,n) if close[i]>0 and close[i-1]>0]
    realized_vol=statistics.stdev(returns) if len(returns)>1 else None
    return {"status":"descriptive","candles":n,"last_close":last,"ema9":e9[-1],"ema21":e21[-1],
      "ema50":e50[-1] if e50 else None,"ema200":e200[-1] if e200 else None,
      "sma20":avg,"bollinger_upper":avg+2*sd,"bollinger_lower":avg-2*sd,
      "bollinger_bandwidth":4*sd/avg if avg else None,"vwap_20_candles":vwap,
      "macd":macd[-1] if macd else None,"macd_signal":sig[-1] if sig else None,
      "macd_histogram":macd[-1]-sig[-1] if macd and sig else None,
      "atr14":atr14,"atr_pct":100*atr14/last if last else None,
      "rsi14_simple":rsi,"adx14":adx14,"stochastic_k14":stoch,"mfi14":mfi,
      "cmf20":cmf,"obv_cumulative_window":obv,"realized_volatility_20":realized_vol,
      "volume_20_average":v20/20,"relative_volume":vol[-1]/(sum(vol[-21:-1])/20) if sum(vol[-21:-1]) else None,
      "prior20_high":max(high[-21:-1]),"prior20_low":min(low[-21:-1]),
      "note":"Indicators use available candles; OBV is window-dependent, not a full historical OBV."}
def orderbook(data):
    if not isinstance(data,dict):return {"status":"unavailable"}
    try:
        bids=sorted([(float(p),float(q)) for p,q in data["bids"]],reverse=True)
        asks=sorted([(float(p),float(q)) for p,q in data["asks"]])
        if not bids or not asks:return {"status":"empty"}
        bid,ask=bids[0][0],asks[0][0]
        if bid<=0 or ask<=bid:return {"status":"crossed_or_invalid"}
        mid=(bid+ask)/2;result={"status":"snapshot","bid":bid,"ask":ask,"mid":mid,
          "spread_bps":10000*(ask-bid)/mid,"levels_bid":len(bids),"levels_ask":len(asks)}
        for pct in (0.005,0.01,0.02,0.05):
            b=sum(p*q for p,q in bids if p>=mid*(1-pct))
            a=sum(p*q for p,q in asks if p<=mid*(1+pct))
            label=str(int(pct*10000))+"bps"
            result["depth_"+label]={"bid_notional_usdt":b,"ask_notional_usdt":a,
                "imbalance":(b-a)/(b+a) if b+a else None}
        bq=bids[0][1];aq=asks[0][1]
        result["microprice"]=(ask*bq+bid*aq)/(bq+aq) if bq+aq else None
        result["top5_bid_notional"]=sum(p*q for p,q in bids[:5])
        result["top5_ask_notional"]=sum(p*q for p,q in asks[:5])
        return result
    except (KeyError,ValueError,TypeError,IndexError,ZeroDivisionError):return {"status":"invalid"}
def trades(data):
    if not isinstance(data,list):return {"status":"unavailable"}
    seen=set();buys=sells=unknown=0;bn=sn=0.;timestamps=[]
    for t in data:
        if not isinstance(t,dict):continue
        key=t.get("id")
        if key is not None:
            if key in seen:continue
            seen.add(key)
        price=finite(t.get("price"));qty=finite(t.get("qty"))
        if price is None or qty is None or price<=0 or qty<=0:continue
        notional=price*qty
        # MEXC spot trade field 'isBuyerMaker': true = aggressive sell.
        side=t.get("isBuyerMaker")
        if side is True:sells+=1;sn+=notional
        elif side is False:buys+=1;bn+=notional
        else:unknown+=1
        if t.get("time") is not None:
            try:timestamps.append(int(t["time"]))
            except (TypeError,ValueError):pass
    return {"status":"limited_recent_trades_snapshot","unique_trade_ids":len(seen),
      "aggressive_buy_count":buys,"aggressive_sell_count":sells,"unknown_side_count":unknown,
      "aggressive_buy_notional_usdt":bn,"aggressive_sell_notional_usdt":sn,
      "net_aggressive_notional_usdt":bn-sn,"taker_buy_fraction":bn/(bn+sn) if bn+sn else None,
      "first_trade_ms":min(timestamps) if timestamps else None,
      "last_trade_ms":max(timestamps) if timestamps else None,
      "warning":"Limited API window; not a complete trade tape or market-wide flow."}

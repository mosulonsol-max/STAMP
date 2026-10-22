"""Reproduce Pine EMA6/20 crossover signals from CLOSED exchange candles.

Only complete bars are eligible. TradingView ta.ema uses first-value initialization,
not the SMA seed used by other indicators in this repository.
"""
import datetime,math
PERIOD_MS={"15m":900000,"1h":3600000,"4h":14400000,"1d":86400000}
def pine_ema(values,period):
    if period<1:raise ValueError("period")
    result=[];prev=None;alpha=2/(period+1)
    for raw in values:
        v=float(raw)
        if not math.isfinite(v) or v<=0:raise ValueError("invalid close")
        prev=v if prev is None else alpha*v+(1-alpha)*prev
        result.append(prev)
    return result
def signals(candles,timeframe="1h",now_ms=None):
    if timeframe not in PERIOD_MS:raise ValueError("timeframe")
    if now_ms is None:now_ms=int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000)
    ms=PERIOD_MS[timeframe];seen={}
    for c in candles:
        try:
            t=int(c["t"]);close=float(c["c"])
            if t%ms or t+ms>now_ms or not math.isfinite(close) or close<=0:continue
            seen[t]=close
        except (KeyError,TypeError,ValueError):continue
    times=sorted(seen);closes=[seen[t] for t in times]
    if len(times)<21:return {"status":"insufficient_closed_candles","closed_candles":len(times),"events":[]}
    fast=pine_ema(closes,6);slow=pine_ema(closes,20)
    events=[]
    for i in range(20,len(times)):
        # Never infer a crossover across missing candles.
        if times[i]-times[i-1]!=ms:continue
        bull=fast[i]>slow[i] and fast[i-1]<=slow[i-1]
        bear=fast[i]<slow[i] and fast[i-1]>=slow[i-1]
        if bull or bear:
            events.append({"bar_time_ms":times[i],"timeframe":timeframe,"signal":"bullish" if bull else "bearish",
                           "close":closes[i],"ema_fast":fast[i],"ema_slow":slow[i],
                           "source":"mexc_closed_candles_pine_ema_parity"})
    return {"status":"computed","closed_candles":len(times),"last_closed_bar_ms":times[-1],"events":events}

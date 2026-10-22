"""Completed OHLCV candle patterns; descriptive, not trading signals."""
def analyze(cs):
    if len(cs)<3:return {"status":"insufficient","count":len(cs)}
    p,c=cs[-2:]
    o,h,l,close,v=[float(c[k]) for k in ("o","h","l","c","v")]
    po,ph,pl,pc=[float(p[k]) for k in ("o","h","l","c")]
    if not (0<l<=min(o,close)<=max(o,close)<=h) or v<0:
        return {"status":"invalid"}
    span=h-l;body=abs(close-o)
    upper=h-max(o,close);lower=min(o,close)-l
    patterns=[]
    if span and body/span<=0.1:patterns.append("doji")
    if span and lower>=2*body and upper<=body:patterns.append("hammer_shape")
    if span and upper>=2*body and lower<=body:patterns.append("inverted_hammer_shape")
    if pc<po and close>o and o<=pc and close>=po:patterns.append("bullish_engulfing")
    if pc>po and close<o and o>=pc and close<=po:patterns.append("bearish_engulfing")
    if close>ph:patterns.append("close_above_previous_high")
    if close<pl:patterns.append("close_below_previous_low")
    return {"status":"descriptive","count":len(cs),"last_open_ms":c["t"],
      "ohlcv":{"open":o,"high":h,"low":l,"close":close,"volume":v},
      "body_fraction":body/span if span else 0,
      "upper_wick_fraction":upper/span if span else 0,
      "lower_wick_fraction":lower/span if span else 0,
      "direction":"bullish" if close>o else "bearish" if close<o else "flat",
      "higher_high":h>ph,"higher_low":l>pl,"lower_high":h<ph,"lower_low":l<pl,
      "patterns":patterns,"warning":"Pattern labels do not imply predictive skill."}

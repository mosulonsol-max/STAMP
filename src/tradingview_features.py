"""Validate TradingView alert payloads without trusting remote indicator claims.

TradingView alerts are observations, not authoritative market data.
"""
import datetime,math
SCHEMA="stamp.tv.signal.v1"
FIELDS=("close","ema_fast","ema_slow","rsi","macd_hist")
def validate(payload,allowed_symbols=None):
    if not isinstance(payload,dict) or payload.get("schema")!=SCHEMA:
        raise ValueError("Unsupported TradingView signal schema")
    symbol=payload.get("symbol")
    if not isinstance(symbol,str) or len(symbol)>100 or not symbol.upper().endswith(":STAMPUSDT"):
        raise ValueError("Unexpected TradingView symbol")
    if allowed_symbols is not None and symbol not in allowed_symbols:
        raise ValueError("Symbol not allowlisted")
    tf=payload.get("timeframe")
    if tf not in ("15","60","240","1D"):raise ValueError("Unsupported timeframe")
    t=payload.get("bar_time_ms")
    if not isinstance(t,int) or t<1_500_000_000_000:raise ValueError("Invalid bar time")
    datetime.datetime.fromtimestamp(t/1000,datetime.timezone.utc)
    if payload.get("signal") not in ("bullish","bearish"):
        raise ValueError("Invalid signal")
    values={}
    for key in FIELDS:
        value=float(payload[key])
        if not math.isfinite(value):raise ValueError("Non-finite "+key)
        values[key]=value
    if values["close"]<=0 or values["ema_fast"]<=0 or values["ema_slow"]<=0 or not 0<=values["rsi"]<=100:
        raise ValueError("Out-of-range indicator")
    return {"schema":SCHEMA,"symbol":symbol,"timeframe":tf,"bar_time_ms":t,
            "signal":payload["signal"],**values}

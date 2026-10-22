#!/usr/bin/env python3
"""STAMP hourly data acquisition and evidence-gated analysis. Public endpoints; no trading."""
import os, json, time, math, datetime, pathlib, statistics
import requests
from model import predict
from market_features import technical,orderbook,trades
ROOT=pathlib.Path(__file__).resolve().parents[1]
CONTRACT="EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc"
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
S=requests.Session(); S.headers.update({"User-Agent":"STAMP-private-monitor/0.1","Accept":"application/json"})
def get(url,params=None):
    try:
        r=S.get(url,params=params,timeout=18); r.raise_for_status(); return r.json(),None
    except Exception as e: return None,str(e)[:240]
def record(source,url,data,error=None):
    return {"source":source,"url":url,"retrieved_at_utc":NOW,"data":data,"error":error}
def mexc():
    base="https://api.mexc.com/api/v3"
    out={}
    for label,path,params in [
      ("ticker","/ticker/24hr",{"symbol":"STAMPUSDT"}),
      ("book","/depth",{"symbol":"STAMPUSDT","limit":100}),
      ("trades","/trades",{"symbol":"STAMPUSDT","limit":1000}),
      ("klines_15m","/klines",{"symbol":"STAMPUSDT","interval":"15m","limit":500}),
      ("klines_1h","/klines",{"symbol":"STAMPUSDT","interval":"60m","limit":500}),
      ("klines_4h","/klines",{"symbol":"STAMPUSDT","interval":"4h","limit":500}),
      ("klines_1d","/klines",{"symbol":"STAMPUSDT","interval":"1d","limit":300})]:
        u=base+path; d,e=get(u,params);out[label]=record("MEXC",u,d,e)
    return out
def dex():
    url="https://api.dexscreener.com/token-pairs/v1/solana/"+CONTRACT
    d,e=get(url)
    if isinstance(d,list):
        d=[{"chainId":p.get("chainId"),"dexId":p.get("dexId"),"pairAddress":p.get("pairAddress"),
        "baseToken":p.get("baseToken"),"quoteToken":p.get("quoteToken"),"priceUsd":p.get("priceUsd"),
        "liquidity":p.get("liquidity"),"volume":p.get("volume"),"txns":p.get("txns"),
        "priceChange":p.get("priceChange"),"fdv":p.get("fdv"),"pairCreatedAt":p.get("pairCreatedAt")}
        for p in d if p.get("baseToken",{}).get("address")==CONTRACT or p.get("quoteToken",{}).get("address")==CONTRACT]
    return record("DexScreener",url,d,e)
def project():
    u="https://api.github.com/repos/BasedDEV101/ZcashMEME/commits"
    d,e=get(u,{"per_page":5})
    if isinstance(d,list): d=[{"sha":x.get("sha"),"date":x.get("commit",{}).get("committer",{}).get("date"),"message":x.get("commit",{}).get("message"),"url":x.get("html_url")} for x in d]
    return record("GitHub",u,d,e)
def macro():
    u="https://api.coingecko.com/api/v3/coins/markets"
    d,e=get(u,{"vs_currency":"usd","ids":"bitcoin,ethereum,solana,zcash","price_change_percentage":"1h,24h"})
    if isinstance(d,list):d=[{"id":x.get("id"),"price":x.get("current_price"),"change_24h":x.get("price_change_percentage_24h"),"last_updated":x.get("last_updated")} for x in d]
    return record("CoinGecko",u,d,e)
def candles(item,interval_ms):
    d=item.get("data"); nowms=int(time.time()*1000)
    if not isinstance(d,list):return []
    out=[]
    for c in d:
        try:
            t=int(c[0]); close_t=int(c[6]) if len(c)>6 and str(c[6]).isdigit() else t+interval_ms
            if close_t>nowms:continue
            out.append({"t":t,"o":float(c[1]),"h":float(c[2]),"l":float(c[3]),"c":float(c[4]),"v":float(c[5])})
        except (TypeError,ValueError,IndexError):continue
    return sorted(out,key=lambda x:x["t"])
def ema(values,n):
    if len(values)<n:return None
    v=sum(values[:n])/n; alpha=2/(n+1)
    for x in values[n:]:v=alpha*x+(1-alpha)*v
    return v
def rsi(values,n=14):
    if len(values)<n+1:return None
    dif=[values[i]-values[i-1] for i in range(1,len(values))]
    gains=[max(0,x) for x in dif]; losses=[max(0,-x) for x in dif]
    ag=sum(gains[:n])/n; al=sum(losses[:n])/n
    for g,l in zip(gains[n:],losses[n:]):ag=(ag*(n-1)+g)/n;al=(al*(n-1)+l)/n
    return 100 if al==0 else 100-100/(1+ag/al)
def atr(cs,n=14):
    if len(cs)<n+1:return None
    tr=[max(cs[i]["h"]-cs[i]["l"],abs(cs[i]["h"]-cs[i-1]["c"]),abs(cs[i]["l"]-cs[i-1]["c"])) for i in range(1,len(cs))]
    return sum(tr[-n:])/n
def metrics(cs):
    if len(cs)<35:return {"quality":"insufficient_completed_candles","count":len(cs)}
    c=[x["c"] for x in cs]; v=[x["v"] for x in cs]
    e12=ema(c,12);e26=ema(c,26)
    prev12=ema(c[:-1],12);prev26=ema(c[:-1],26)
    return {"quality":"indicators_only_not_calibrated_forecast","count":len(cs),"last_closed_open_time_ms":cs[-1]["t"],
      "last_close":c[-1],"ema6":ema(c,6),"ema12":e12,"ema20":ema(c,20),
      "rsi14":rsi(c),"macd_line":e12-e26 if e12 and e26 else None,
      "macd_line_previous":prev12-prev26 if prev12 and prev26 else None,
      "atr14":atr(cs),"volume_last_vs_prev20":v[-1]/(sum(v[-21:-1])/20) if sum(v[-21:-1])>0 else None,
      "highest_high_prev20":max(x["h"] for x in cs[-21:-1]),"lowest_low_prev20":min(x["l"] for x in cs[-21:-1])}
def depth(d):
    if not isinstance(d,dict):return {"quality":"unavailable"}
    try:
        bids=[(float(p),float(q)) for p,q in d["bids"]];asks=[(float(p),float(q)) for p,q in d["asks"]]
        if not bids or not asks:return {"quality":"empty"}
        mid=(bids[0][0]+asks[0][0])/2
        return {"quality":"snapshot_only","bid":bids[0][0],"ask":asks[0][0],"spread_pct":100*(asks[0][0]-bids[0][0])/mid,
        "bid_depth_usdt_2pct":sum(p*q for p,q in bids if p>=mid*.98),
        "ask_depth_usdt_2pct":sum(p*q for p,q in asks if p<=mid*1.02),
        "levels_bids":len(bids),"levels_asks":len(asks)}
    except (KeyError,ValueError,TypeError,IndexError,ZeroDivisionError):return {"quality":"invalid"}
def main():
    data={"collected_at_utc":NOW,"contract":CONTRACT,"mexc":mexc(),"dex":dex(),"project":project(),"macro":macro()}
    indicators={tf:metrics(candles(data["mexc"][key],ms)) for tf,key,ms in [
        ("15m","klines_15m",900000),("1h","klines_1h",3600000),("4h","klines_4h",14400000),("1d","klines_1d",86400000)]}
    advanced={tf:technical(candles(data["mexc"][key],ms)) for tf,key,ms in [("15m","klines_15m",900000),("1h","klines_1h",3600000),("4h","klines_4h",14400000),("1d","klines_1d",86400000)]}
    executed_trades=trades(data["mexc"]["trades"].get("data"))
    book_features=orderbook(data["mexc"]["book"].get("data"))
    ml=predict(candles(data["mexc"]["klines_1h"],3600000))
    ob=depth(data["mexc"]["book"].get("data"))
    flags=[]
    if ob.get("quality")=="snapshot_only" and ob.get("bid_depth_usdt_2pct",0)<500:flags.append("thin_visible_bid_depth")
    for tf,m in indicators.items():
        if m.get("count",0)<35:flags.append("insufficient_"+tf+"_candles")
        elif m.get("volume_last_vs_prev20",0)>1.5 and m["last_close"]>m["highest_high_prev20"]:flags.append("confirmed_closed_candle_breakout_"+tf)
        elif m.get("volume_last_vs_prev20",0)>1.5 and m["last_close"]<m["lowest_low_prev20"]:flags.append("confirmed_closed_candle_breakdown_"+tf)
    analysis={"computed_at_utc":NOW,"order_book":ob,"order_book_features":book_features,"recent_executed_trades":executed_trades,"advanced_indicators":advanced,"indicators":indicators,"flags":flags,"ml_experimental":ml,
      "forecast_1h":"لا توجد بيانات كافية لتوقع موثوق",
      "forecast_4h":"لا توجد بيانات كافية لتوقع موثوق",
      "forecast_24h":"لا توجد بيانات كافية لتوقع موثوق",
      "forecast_7d":"لا توجد بيانات كافية لتوقع موثوق",
      "reason":"No validated walk-forward calibrated predictive model; indicators are descriptive, not price forecasts.",
      "limitations":["MEXC API may not support this symbol/interval","CoinGecko may rate-limit","order book is cancellable not executed volume","on-chain burns/holders and aligned correlations not yet implemented"]}
    (ROOT/"data").mkdir(exist_ok=True)
    (ROOT/"data"/"latest.json").write_text(json.dumps({"raw":data,"analysis":analysis},ensure_ascii=False,indent=2)+"\n")
    with (ROOT/"data"/"observations.jsonl").open("a") as f:
        f.write(json.dumps({"at":NOW,"mexc_ticker":data["mexc"]["ticker"],"mexc_book_summary":ob,"dex":data["dex"],"project":data["project"],"macro":data["macro"],"indicators":indicators,"advanced_indicators":advanced,"order_book_features":book_features,"recent_executed_trades":executed_trades,"flags":flags},ensure_ascii=False)+"\n")
    errors={k:v["error"] for k,v in data["mexc"].items() if v["error"]}
    critical=[]
    for k in ("ticker","book","klines_1h"):
        if data["mexc"][k]["error"] or data["mexc"][k]["data"] is None:
            critical.append(k)
    if ob.get("quality")!="snapshot_only":critical.append("invalid_order_book")
    if indicators["1h"].get("count",0)<35:critical.append("insufficient_hourly_candles")
    print(json.dumps({"timestamp":NOW,"flags":flags,"errors":errors,"critical":critical},ensure_ascii=False))
    if critical:
        raise SystemExit("Critical market data unavailable: "+", ".join(critical))
if __name__=="__main__":main()

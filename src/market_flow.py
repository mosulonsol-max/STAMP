"""Read-only global crypto indicators. Never label volume or market-cap change as cash inflows."""
import datetime as dt
import json
import threading
import time
from urllib.request import Request,urlopen

_CACHE={"at":0,"value":None}
_LOCK=threading.Lock()
def _fetch(url):
 req=Request(url,headers={"Accept":"application/json","User-Agent":"STAMP-MarketFlow/1.0"})
 with urlopen(req,timeout=12) as res:
  raw=res.read(3500000)
  if len(raw)>=3500000:raise ValueError("oversized upstream payload")
  return json.loads(raw)
def market_flow_snapshot():
 now=time.time()
 with _LOCK:
  if _CACHE["value"] is not None and now-_CACHE["at"]<300:return _CACHE["value"]
 # CoinGecko market-wide spot indicators; DefiLlama circulating stablecoin supply history.
 global_data=_fetch("https://api.coingecko.com/api/v3/global").get("data",{})
 cap=global_data.get("total_market_cap",{}).get("usd")
 volume=global_data.get("total_volume",{}).get("usd")
 if not isinstance(cap,(int,float)) or not isinstance(volume,(int,float)) or cap<=0 or volume<0:raise ValueError("invalid global market values")
 chart=_fetch("https://stablecoins.llama.fi/stablecoincharts/all")
 points=[]
 for row in chart:
  try:
   ts=int(row["date"])
   totals=row["totalCirculatingUSD"]
   supply=sum(float(x) for x in totals.values() if isinstance(x,(int,float)) and float(x)>0)
   if supply>0:points.append({"t":ts,"v":round(supply,2)})
  except (KeyError,ValueError,TypeError,AttributeError):continue
 points=sorted({p["t"]:p for p in points}.values(),key=lambda x:x["t"])
 if not points:raise ValueError("stablecoin supply history unavailable")
 points=points[-370:]
 result={"observed_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"market_cap_usd":cap,"volume_24h_usd":volume,"stablecoin_supply_usd":points[-1]["v"],"stablecoin_supply_observed_at_utc":dt.datetime.fromtimestamp(points[-1]["t"],dt.timezone.utc).isoformat(),"stablecoin_history":points,"sources":{"market":"CoinGecko /api/v3/global","stablecoins":"DefiLlama /stablecoincharts/all"},"definitions":{"volume":"Gross traded value, not net inflow","stablecoin_delta":"Change in aggregate circulating USD supply; proxy only","market_cap":"Asset valuation, not available cash"}}
 with _LOCK:_CACHE.update(at=time.time(),value=result)
 return result

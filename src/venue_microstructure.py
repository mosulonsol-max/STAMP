"""Independent venue microstructure snapshots. Research only, never a trade signal."""
import datetime as dt,json,math
from urllib.request import Request,urlopen
from urllib.parse import urlencode
from concurrent.futures import ThreadPoolExecutor
try:from src.multi_asset import symbol
except ImportError:from multi_asset import symbol

VENUES=("MEXC","Binance","OKX","Bybit","KuCoin","Gate","Bitget")
def get(url):
 req=Request(url,headers={"Accept":"application/json","User-Agent":"STAMP-NEXUS/1.0"})
 with urlopen(req,timeout=6) as response:
  raw=response.read(300001)
 if len(raw)>300000:raise ValueError("oversized_response")
 return json.loads(raw)
def endpoint(venue,pair,kind):
 base=pair[:-4]
 if kind=="book":
  return {
   "MEXC":("https://api.mexc.com/api/v3/depth?"+urlencode({"symbol":pair,"limit":20}),lambda x:(x["bids"],x["asks"])),
   "Binance":("https://api.binance.com/api/v3/depth?"+urlencode({"symbol":pair,"limit":20}),lambda x:(x["bids"],x["asks"])),
   "OKX":("https://www.okx.com/api/v5/market/books?"+urlencode({"instId":base+"-USDT","sz":20}),lambda x:(x["data"][0]["bids"],x["data"][0]["asks"])),
   "Bybit":("https://api.bybit.com/v5/market/orderbook?"+urlencode({"category":"spot","symbol":pair,"limit":25}),lambda x:(x["result"]["b"],x["result"]["a"])),
   "KuCoin":("https://api.kucoin.com/api/v1/market/orderbook/level2_20?"+urlencode({"symbol":base+"-USDT"}),lambda x:(x["data"]["bids"],x["data"]["asks"])),
   "Gate":("https://api.gateio.ws/api/v4/spot/order_book?"+urlencode({"currency_pair":base+"_USDT","limit":20}),lambda x:(x["bids"],x["asks"])),
   "Bitget":("https://api.bitget.com/api/v2/spot/market/orderbook?"+urlencode({"symbol":pair,"limit":20}),lambda x:(x["data"]["bids"],x["data"]["asks"]))
  }[venue]
 return {
  "MEXC":("https://api.mexc.com/api/v3/klines?"+urlencode({"symbol":pair,"interval":"15m","limit":80}),lambda x:x),
  "Binance":("https://api.binance.com/api/v3/klines?"+urlencode({"symbol":pair,"interval":"15m","limit":80}),lambda x:x),
  "OKX":("https://www.okx.com/api/v5/market/candles?"+urlencode({"instId":base+"-USDT","bar":"15m","limit":80}),lambda x:x["data"]),
  "Bybit":("https://api.bybit.com/v5/market/kline?"+urlencode({"category":"spot","symbol":pair,"interval":"15","limit":80}),lambda x:x["result"]["list"]),
  "KuCoin":("https://api.kucoin.com/api/v1/market/candles?"+urlencode({"symbol":base+"-USDT","type":"15min"}),lambda x:x["data"]),
  "Gate":("https://api.gateio.ws/api/v4/spot/candlesticks?"+urlencode({"currency_pair":base+"_USDT","interval":"15m","limit":80}),lambda x:x),
  "Bitget":("https://api.bitget.com/api/v2/spot/market/candles?"+urlencode({"symbol":pair,"granularity":"15min","limit":80}),lambda x:x["data"])
 }[venue]
def valid_price(value):
 x=float(value)
 if not math.isfinite(x) or x<=0:raise ValueError("invalid_price")
 return x
def book(venue,pair):
 url,extract=endpoint(venue,pair,"book")
 bids,asks=extract(get(url))
 def clean(rows,reverse):
  out=[]
  for row in rows:
   try:
    p,q=valid_price(row[0]),valid_price(row[1])
    out.append({"price":p,"quantity":q,"notional_usdt":p*q})
   except (ValueError,TypeError,IndexError):continue
  return sorted(out,key=lambda x:x["price"],reverse=reverse)[:20]
 b,a=clean(bids,True),clean(asks,False)
 if not b or not a or b[0]["price"]>=a[0]["price"]:raise ValueError("invalid_orderbook")
 bid=sum(x["notional_usdt"] for x in b);ask=sum(x["notional_usdt"] for x in a)
 mid=(b[0]["price"]+a[0]["price"])/2
 return {"bids":b,"asks":a,"bid_depth_usdt":bid,"ask_depth_usdt":ask,"imbalance":(bid-ask)/(bid+ask) if bid+ask else None,"spread_pct":100*(a[0]["price"]-b[0]["price"])/mid,"levels":min(len(b),len(a))}
def bars(venue,pair):
 url,extract=endpoint(venue,pair,"candles")
 rows=extract(get(url));result=[]
 for row in rows:
  try:
   if venue=="KuCoin":t=int(float(row[0])*1000);o,c,h,l,v=map(float,(row[1],row[2],row[3],row[4],row[5]))
   elif venue=="Gate":t=int(float(row[0])*1000);o,h,l,c,v=map(float,(row[5],row[3],row[4],row[2],row[1]))
   else:t=int(float(row[0]));o,h,l,c,v=map(float,row[1:6])
   if not all(math.isfinite(x) for x in (o,h,l,c,v)) or min(o,h,l,c)<=0 or h<max(o,c) or l>min(o,c) or v<0:continue
   result.append({"t":t,"o":o,"h":h,"l":l,"c":c,"v":v})
  except (TypeError,ValueError,IndexError):continue
 result.sort(key=lambda x:x["t"])
 now=int(dt.datetime.now(dt.timezone.utc).timestamp()*1000)
 result=[x for x in result if x["t"]+900000<=now and x["t"]>=now-86400000]
 if len(result)<2:raise ValueError("insufficient_closed_candles")
 return result[-80:]
def collect(venue,pair):
 def run(kind):
  try:return {"status":"ok","data":book(venue,pair) if kind=="book" else bars(venue,pair),"retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat()}
  except Exception as exc:return {"status":"unavailable","reason":type(exc).__name__}
 with ThreadPoolExecutor(max_workers=2) as pool:
  a=pool.submit(run,"book");b=pool.submit(run,"candles")
  depth,ohlc=a.result(),b.result()
 result={"venue":venue,"book":depth,"candles":ohlc}
 if depth["status"]=="ok" and ohlc["status"]=="ok":
  rows=ohlc["data"];last=rows[-1];previous=rows[-2];imb=depth["data"]["imbalance"]
  delta=last["c"]/previous["c"]-1
  # Descriptive observations only; no calibrated direction or confidence.
  result["engine_effect"]={"status":"research_only","book_imbalance":imb,"closed_candle_return_pct":delta*100,
   "agreement":"aligned_up" if imb>0.1 and delta>0 else "aligned_down" if imb<-.1 and delta<0 else "mixed_or_neutral",
   "decision":"NO_TRADE_SIGNAL","reason":"Order-book depth is a transient snapshot; candle momentum and depth agreement is not a validated predictive model."}
 else:result["engine_effect"]={"status":"insufficient_data","decision":"NO_TRADE_SIGNAL"}
 return result
def microstructure(pair,venue):
 pair=symbol(pair)
 if venue not in VENUES:raise ValueError("unsupported_venue")
 return {"symbol":pair,"venue":venue,"retrieved_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),"identity_status":"unverified_cross_venue_asset_identity" if pair not in ("BTCUSDT","ETHUSDT","SOLUSDT") else "major_pair_symbol_match_only","result":collect(venue,pair)}

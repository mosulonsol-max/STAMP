"""Timestamped MEXC trade samples and finalized STAMP liquidity events."""
import datetime as dt
import hashlib
import math
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

try:
    from src.multi_asset import fetch, symbol
except ImportError:
    from multi_asset import fetch, symbol

STAMP = "STAMPUSDT"
MINT = "EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc"
PUMPSWAP = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"
BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
ADDRESS = re.compile(f"[{BASE58}]{{32,44}}")
SIGNATURE = re.compile(f"[{BASE58}]{{85,88}}")
# Pump public IDL, deposit and withdraw instructions with the same account order.
LP_OPS = {bytes.fromhex("f223c68952e1f2b6"): "liquidity_add",
          bytes.fromhex("b712469c946da122"): "liquidity_remove"}
TRADE_LIMIT = 250
POOL_LIMIT = 16
DAY = 86_400_000


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def milliseconds(stamp):
    try:
        value = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        return int(value.timestamp() * 1000) if value.tzinfo is not None else None
    except (AttributeError, ValueError, TypeError, OverflowError, OSError):
        return None


def positive(value):
    try:
        result = float(value)
        return result if math.isfinite(result) and result > 0 else None
    except (ValueError, TypeError, OverflowError):
        return None


def trade_sample(rows, pair, observed_utc, venue="MEXC"):
    """Rank recent executions by quote value within this returned sample."""
    checked = milliseconds(observed_utc)
    if not isinstance(rows, list) or checked is None:
        return {"status": "unavailable", "observed_utc": observed_utc, "events": []}
    trades = {}
    occurrences = Counter()
    for row in rows[:1000]:
        if not isinstance(row, dict):
            continue
        when = positive(row.get("time"))
        price = positive(row.get("price"))
        quantity = positive(row.get("qty"))
        maker = row.get("isBuyerMaker")
        if not (when and 10**12 <= when <= checked + 5000 and price and quantity and isinstance(maker, bool)):
            continue
        notional = positive(row.get("quoteQty")) or positive(price * quantity)
        if not notional:
            continue
        # Some MEXC responses return a null trade ID. Preserve repeated equal
        # fills in one response while making overlapping samples idempotent.
        exchange_id = row.get("id")
        if exchange_id is not None and str(exchange_id).strip() and len(str(exchange_id)) <= 80:
            key = str(exchange_id)
        else:
            fingerprint = (int(when), price, quantity, maker)
            occurrences[fingerprint] += 1
            key = hashlib.sha256(repr((fingerprint, occurrences[fingerprint])).encode()).hexdigest()[:24]
        event_id = f"{venue.lower()}:{pair}:{key}"
        trades[event_id] = {"id": event_id, "kind": "trade", "symbol": pair, "time_ms": int(when),
                            "source": venue+" Spot", "side": "sell" if maker else "buy",
                            "price": price, "quantity": quantity, "notional": notional}
    sample = list(trades.values())
    first = min((e["time_ms"] for e in sample), default=None)
    last = max((e["time_ms"] for e in sample), default=None)
    width = max(1000, ((last - first + 12) // 12)) if sample else 1000
    buckets = {}
    for event in sample:
        start = first + (event["time_ms"] - first) // width * width
        bucket = buckets.setdefault(start, {"time_ms": start, "buy": 0.0, "sell": 0.0, "count": 0})
        bucket[event["side"]] += event["notional"]
        bucket["count"] += 1
    flow = [buckets[key] for key in sorted(buckets)]
    largest = sorted(sample, key=lambda e: (-e["notional"], -e["time_ms"], e["id"]))
    events = largest[:min(16, (len(sample) + 9) // 10)]
    freshness = checked - last if last is not None else None
    return {"status": "ok" if sample and -5000 <= freshness <= 120000 else "stale" if sample else "unavailable" if rows else "empty",
            "observed_utc": observed_utc, "sample_count": len(sample),
            "latest_execution_age_ms": freshness,
            "first_ms": min((e["time_ms"] for e in sample), default=None),
            "last_ms": max((e["time_ms"] for e in sample), default=None),
            "selected_count": len(events), "events": events, "_executions": sample, "flow": {
                "bucket_ms": width, "buckets": flow,
                "buy": sum(bucket["buy"] for bucket in flow),
                "sell": sum(bucket["sell"] for bucket in flow),
            }}


def archived_trade_sample(raw):
    entry = (raw.get("mexc") or {}).get("trades") or {}
    return trade_sample(entry.get("data") if not entry.get("error") else None,
                        STAMP, entry.get("retrieved_at_utc"))


@lru_cache(maxsize=128)
def live_trade_sample(pair, time_bucket):
    try:
        rows = fetch("trades", {"symbol": pair, "limit": TRADE_LIMIT}, timeout=5)
    except (OSError, ValueError):
        rows = None
    return trade_sample(rows, pair, utc())


def venue_trade_rows(venue,pair):
    """Read public spot executions; explicit taker side is retained per venue."""
    from urllib.parse import urlencode
    try:from src.multi_asset import public_json
    except ImportError:from multi_asset import public_json
    base=pair[:-4]
    routes={
      "Binance":("https://api.binance.com/api/v3/trades?"+urlencode({"symbol":pair,"limit":250}),lambda x:x),
      "OKX":("https://www.okx.com/api/v5/market/trades?"+urlencode({"instId":base+"-USDT","limit":100}),lambda x:x["data"] if x.get("code")=="0" else None),
      "Bybit":("https://api.bybit.com/v5/market/recent-trade?"+urlencode({"category":"spot","symbol":pair,"limit":250}),lambda x:x["result"]["list"] if x.get("retCode")==0 else None),
      "KuCoin":("https://api.kucoin.com/api/v1/market/histories?"+urlencode({"symbol":base+"-USDT"}),lambda x:x["data"] if str(x.get("code"))=="200000" else None),
      "Gate":("https://api.gateio.ws/api/v4/spot/trades?"+urlencode({"currency_pair":base+"_USDT","limit":250}),lambda x:x),
      "Bitget":("https://api.bitget.com/api/v3/market/fills?"+urlencode({"category":"SPOT","symbol":pair,"limit":100}),lambda x:x["data"] if x.get("code")=="00000" else None),
    }
    if venue=="MEXC":return fetch("trades",{"symbol":pair,"limit":TRADE_LIMIT},timeout=5)
    url,extract=routes[venue]
    rows=extract(public_json(url,timeout=5,limit=3000000))
    if not isinstance(rows,list):raise ValueError("invalid_venue_trades")
    result=[]
    for row in rows:
      if not isinstance(row,dict):continue
      if venue=="Binance":result.append(row);continue
      try:
        if venue=="OKX":t,p,q,side,key=row["ts"],row["px"],row["sz"],row["side"],row["tradeId"]
        elif venue=="Bybit":t,p,q,side,key=row["time"],row["price"],row["size"],row["side"],row["execId"]
        elif venue=="KuCoin":t,p,q,side,key=row["time"],row["price"],row["size"],row["side"],row["sequence"]
        elif venue=="Gate":t,p,q,side,key=row["create_time_ms"],row["price"],row["amount"],row["side"],row["id"]
        else:t,p,q,side,key=row["ts"],row["price"],row["size"],row["side"],row["execId"]
        direction=str(side).lower()
        if direction not in ("buy","sell"):continue
        result.append({"time":t,"price":p,"qty":q,"id":key,"isBuyerMaker":direction=="sell"})
      except (KeyError,TypeError):continue
    return result

@lru_cache(maxsize=80)
def multi_venue_trade_samples(pair,time_bucket):
    try:from src.multi_asset import VENUES, _CATALOG, _CATALOG_LOCK
    except ImportError:from multi_asset import VENUES, _CATALOG, _CATALOG_LOCK
    with _CATALOG_LOCK:catalog=_CATALOG["value"]
    available=set(catalog.get("venues",{}).get(pair,VENUES) if catalog else VENUES)
    def sample(venue):
        if venue not in available:return venue,{"status":"unlisted","sample_count":0,"events":[]}
        observed=utc()
        try:return venue,trade_sample(venue_trade_rows(venue,pair),pair,observed,venue)
        except (OSError,ValueError,KeyError,TypeError,IndexError) as exc:
            return venue,{"status":"unavailable","reason":type(exc).__name__,"observed_utc":observed,"sample_count":0,"events":[]}
    with ThreadPoolExecutor(max_workers=len(VENUES)) as pool:return dict(pool.map(sample,VENUES))

def aggregate_samples(samples):
    events={event["id"]:event for row in samples if row.get("status")=="ok" for event in row.get("_executions",[])}
    if not events:return None,0,None,None
    start=min(e["time_ms"] for e in events.values());end=max(e["time_ms"] for e in events.values())
    width=max(1000,((end-start+12)//12));buckets={}
    for event in events.values():
        slot=start+(event["time_ms"]-start)//width*width
        row=buckets.setdefault(slot,{"time_ms":slot,"buy":0.0,"sell":0.0,"count":0})
        row[event["side"]]+=event["notional"];row["count"]+=1
    return {"bucket_ms":width,"buckets":[buckets[t] for t in sorted(buckets)],
            "buy":sum(row["buy"] for row in buckets.values()),"sell":sum(row["sell"] for row in buckets.values())},len(events),start,end

def pair_market_flow(value):
    pair=symbol(value)
    samples=multi_venue_trade_samples(pair,int(dt.datetime.now(dt.timezone.utc).timestamp()//10))
    venues={venue:{k:v for k,v in item.items() if k not in ("events","_executions")} for venue,item in samples.items()}
    identity=pair in {"BTCUSDT","ETHUSDT","SOLUSDT"}
    eligible=[item for item in samples.values() if item.get("status")=="ok"]
    flow,count,first,last=aggregate_samples(eligible) if identity else (None,0,None,None)
    return {"symbol":pair,"source":"public spot executions","status":"ok" if eligible else "unavailable",
            "observed_utc":utc(),"identity_status":"major_pair_symbol_match" if identity else "cross_venue_identity_unverified",
            "aggregate_note":"Observed recent trade samples only; venue windows and caps differ. Not complete market volume.",
            "venues":venues,"available_venues":len(eligible),"sample_count":count,"flow":flow,"first_ms":first,"last_ms":last}


def merge_events(groups, cutoff_ms=0, limit=160):
    unique = {}
    for group in groups:
        for event in group:
            if event["time_ms"] >= cutoff_ms:
                unique[event["id"]] = event
    return sorted(unique.values(), key=lambda e: (-e["time_ms"], e["id"]))[:limit]


def dashboard_events(value, operations):
    pair = symbol(value)
    samples=multi_venue_trade_samples(pair,int(dt.datetime.now(dt.timezone.utc).timestamp()//10))
    live=samples.get("MEXC",{})
    archive = (operations.get("events") or {}) if pair == STAMP else {}
    records = merge_events([archive.get("records") or [],*(row.get("events") or [] for row in samples.values())])
    return {"symbol": pair, "records": records,
            "trades": {k: v for k, v in live.items() if k not in ("events", "flow", "_executions")},
            "venue_trades":{venue:{"status":row.get("status"),"sample_count":row.get("sample_count"),"last_ms":row.get("last_ms")}
                            for venue,row in samples.items()},
            "archived_trades": archive.get("trades"),
            "liquidity": archive.get("liquidity")}


def valid_address(pattern, value):
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def pool_identity(raw):
    if raw.get("contract") != MINT:
        return None
    dex = raw.get("dex") or {}
    if dex.get("error"):
        return None
    for pair in dex.get("data") or []:
        if not isinstance(pair, dict) or pair.get("chainId") != "solana" or pair.get("dexId") != "pumpswap":
            continue
        base = (pair.get("baseToken") or {}).get("address")
        quote = (pair.get("quoteToken") or {}).get("address")
        address = pair.get("pairAddress")
        if base == MINT and valid_address(ADDRESS, address) and valid_address(ADDRESS, quote):
            return address, quote
    return None


def discriminator(data):
    if not isinstance(data, str) or not 8 <= len(data) <= 256:
        return None
    value = 0
    for digit in data:
        index = BASE58.find(digit)
        if index < 0:
            return None
        value = value * 58 + index
    decoded = b"\0" * (len(data) - len(data.lstrip("1"))) + value.to_bytes((value.bit_length() + 7) // 8, "big")
    return decoded[:8]


def liquidity_instructions(tx, signature, address, quote_mint):
    meta = tx.get("meta")
    when = tx.get("blockTime")
    if not isinstance(meta, dict) or "err" not in meta or meta["err"] is not None or not isinstance(when, int) or when <= 0:
        return []
    message = (tx.get("transaction") or {}).get("message") or {}
    instructions = list(message.get("instructions") or [])
    for group in meta.get("innerInstructions") or []:
        instructions.extend(group.get("instructions") or [])
    events = []
    for index, instruction in enumerate(instructions):
        if not isinstance(instruction, dict) or instruction.get("programId") != PUMPSWAP:
            continue
        accounts = instruction.get("accounts") or []
        if not isinstance(accounts, list) or len(accounts) < 11 or accounts[0] != address or accounts[3:5] != [MINT, quote_mint]:
            continue
        kind = LP_OPS.get(discriminator(instruction.get("data")))
        if kind:
            events.append({"id": f"solana:{signature}:{index}", "kind": kind, "symbol": STAMP,
                           "time_ms": when * 1000, "source": "PumpSwap · Solana",
                           "pool": address, "signature": signature})
    return events


def scan_liquidity(raw, previous, rpc):
    pool = pool_identity(raw)
    if not pool:
        return {"status": "unavailable", "observed_utc": utc(), "pool": previous.get("pool")}, [], previous.get("inspected_signatures", [])
    address, quote_mint = pool
    coverage = {"observed_utc": utc(), "pool": address, "limit": POOL_LIMIT}
    known = set(previous.get("inspected_signatures", [])) if previous.get("pool") == address else set()
    rows, error = rpc("getSignaturesForAddress", [address, {"limit": POOL_LIMIT, "commitment": "finalized"}])
    if error or not isinstance(rows, list):
        return dict(coverage, status="unavailable"), [], sorted(known)
    rows = [row for row in rows if isinstance(row, dict) and valid_address(SIGNATURE, row.get("signature"))]
    succeeded = [row["signature"] for row in rows if "err" in row and row["err"] is None]

    def inspect(signature):
        tx, error = rpc("getTransaction", [signature, {"encoding": "jsonParsed", "commitment": "finalized",
                                                       "maxSupportedTransactionVersion": 0}])
        if error or not isinstance(tx, dict) or not isinstance(tx.get("meta"), dict):
            return signature, None
        return signature, liquidity_instructions(tx, signature, address, quote_mint)

    events = []
    # Bound RPC work even on a public provider with no configured API key.
    with ThreadPoolExecutor(max_workers=6) as pool:
        for signature, found in pool.map(inspect, [s for s in succeeded if s not in known]):
            if found is not None:
                known.add(signature)
                events.extend(found)
    inspected = [signature for signature in succeeded if signature in known]
    times = [row["blockTime"] * 1000 for row in rows if isinstance(row.get("blockTime"), int) and row["blockTime"] > 0]
    status = "ok" if len(inspected) == len(succeeded) else "partial"
    coverage.update(status=status, observed_utc=utc(), returned_count=len(rows),
                    inspected_count=len(inspected), successful_count=len(succeeded),
                    first_ms=min(times, default=None), last_ms=max(times, default=None))
    return coverage, events, inspected


def burn_events(rows):
    events = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        signature = row.get("signature")
        when = row.get("event_time_unix")
        index = row.get("instruction_index")
        if (row.get("mint") == MINT and valid_address(SIGNATURE, signature) and
                isinstance(when, int) and when > 0 and isinstance(index, int) and index >= 0):
            events.append({"id": f"burn:{signature}:{index}", "kind": "burn", "symbol": STAMP,
                           "time_ms": when * 1000, "source": "Solana", "signature": signature})
    return events

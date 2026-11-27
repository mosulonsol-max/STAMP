"""Normalize recent public executions while preserving venue and quote units."""
import datetime as dt
import re
from concurrent.futures import ThreadPoolExecutor

try:
    from src.market_events import MINT, milliseconds, multi_venue_trade_samples, positive, utc, symbol
    from src.multi_asset import public_json
except ImportError:
    from market_events import MINT, milliseconds, multi_venue_trade_samples, positive, utc, symbol
    from multi_asset import public_json

DEX_ROOT = "https://api.geckoterminal.com/api/v2/networks/"
NETWORKS = {"solana", "eth", "base", "bsc", "arbitrum", "polygon_pos"}
POOL_CAP = 6


def address_key(network, address):
    if network not in NETWORKS:
        raise ValueError("unsupported_network")
    pattern = r"[1-9A-HJ-NP-Za-km-z]{32,44}" if network == "solana" else r"0x[a-fA-F0-9]{40}"
    if not re.fullmatch(pattern, address):
        raise ValueError("invalid_contract")
    return address if network == "solana" else address.lower()


def dex_rows(network, address, pool, rows, now):
    result = []
    for row in rows:
        a = row["attributes"]
        when = milliseconds(a.get("block_timestamp"))
        if not when or when > now + 5000 or a.get("is_anomalous"):
            continue
        from_address = a.get("from_token_address") or ""
        to_address = a.get("to_token_address") or ""
        if network != "solana":
            from_address, to_address = from_address.lower(), to_address.lower()
        sell, buy = from_address == address, to_address == address
        if sell == buy:
            continue
        leg = "from" if sell else "to"
        quantity = positive(a.get(leg+"_token_amount"))
        volume = positive(a.get("volume_in_usd"))
        if not quantity or not volume:
            continue
        result.append({"id":network+":"+pool["address"]+":"+row["id"],
                       "time_ms":when,"source":pool["venue"],"type":"DEX",
                       "side":"sell" if sell else "buy","quantity":quantity,
                       "price":volume/quantity,"notional":volume,"quote":"USD",
                       "pool":pool["address"],"tx":a.get("tx_hash")})
    return result


def dex_sample(network, address):
    url = DEX_ROOT + network + "/"
    pools = public_json(url+"tokens/"+address+"/pools?page=1",timeout=6)["data"]
    found = [{"venue":row["relationships"]["dex"]["data"]["id"],
              "address":address_key(network,row["attributes"]["address"])} for row in pools]
    # Give distinct DEXes a slot before taking additional pools from the same DEX.
    unique = {}
    for pool in found:
        unique.setdefault(pool["venue"], pool)
    chosen = (list(unique.values())+[pool for pool in found if pool not in unique.values()])[:POOL_CAP]
    def fetch_pool(pool):
        try:
            trades = public_json(url+"pools/"+pool["address"]+"/trades",timeout=6)["data"]
            rows = dex_rows(network,address,pool,trades,milliseconds(utc()))
            return rows, {**pool,"type":"DEX","status":"ok" if rows else "empty","count":len(rows)}
        except (OSError,ValueError,TypeError,KeyError,IndexError):
            return [], {**pool,"type":"DEX","status":"unavailable","count":0}
    with ThreadPoolExecutor(max_workers=POOL_CAP) as executor:
        outcomes=list(executor.map(fetch_pool,chosen))
    return ([row for rows,_ in outcomes for row in rows],
            [item for _,item in outcomes], len(found))


def cex_sample(pair):
    venues = dict(multi_venue_trade_samples(pair,int(dt.datetime.now(dt.timezone.utc).timestamp()//15)))
    if venues.get("MEXC",{}).get("status") in ("unavailable","unlisted"):
        try:
            from src.market_gateway import fetch_gateway
        except ImportError:
            from market_gateway import fetch_gateway
        try:
            venues["MEXC"] = fetch_gateway("trades",pair,"MEXC")["sample"]
        except (OSError,ValueError,TypeError,KeyError):
            pass
    return venues

def snapshot(pair, network="", address=""):
    pair=symbol(pair)
    if not address and pair=="STAMPUSDT":
        network,address="solana",MINT
    if address:
        address=address_key(network,address)
    with ThreadPoolExecutor(max_workers=2) as executor:
        cex=executor.submit(cex_sample,pair)
        dex=executor.submit(dex_sample,network,address) if address else None
        venues=cex.result()
        records=[{**item,"type":"CEX","quote":"USDT"} for venue in venues.values()
                 for item in venue.get("_executions",[])]
        sources=[{"venue":name,"type":"CEX","status":value["status"],"count":value.get("sample_count",0)}
                 for name,value in venues.items()]
        found=0
        if dex:
            try:
                rows,coverage,found=dex.result()
                records.extend(rows)
                sources.extend(coverage)
            except (OSError,ValueError,TypeError,KeyError,IndexError):
                sources.append({"venue":"GeckoTerminal","type":"DEX","status":"unavailable","count":0})
    records.sort(key=lambda row:(row["time_ms"],row["id"]),reverse=True)
    return {"symbol":pair,"network":network if address else None,"contract":address or None,
            "observed_utc":utc(),"sources":sources,"dex_pools_discovered":found,
            "dex_pool_limit":POOL_CAP,"trades":records}


def dex_market_catalog(network, feed):
    """Public DEX discovery keyed by mint, retaining each quoting pool."""
    if network not in NETWORKS:
        raise ValueError("unsupported_network")
    paths = {"trending": "trending_pools", "new": "new_pools"}
    if network == "solana":
        paths.update(pump="dexes/pump-fun/pools", pumpswap="dexes/pumpswap/pools")
    if feed not in paths:
        raise ValueError("unsupported_market_feed")
    payload = public_json(DEX_ROOT+network+"/"+paths[feed]+"?include=base_token,dex&page=1",timeout=8)
    tokens = {item["id"]:item.get("attributes",{}) for item in payload.get("included",[]) if item.get("type")=="token"}
    markets = []
    for pool in payload.get("data",[]):
        try:
            a, refs = pool["attributes"], pool["relationships"]
            base = refs["base_token"]["data"]["id"]
            mint = address_key(network,base.removeprefix(network+"_"))
            pool_address = address_key(network,a["address"])
            token = tokens.get(base,{})
            venue = refs["dex"]["data"]["id"]
            markets.append({"mint":mint,"pool":pool_address,"venue":venue,
                            "name":token.get("name") or a.get("name") or mint,
                            "symbol":token.get("symbol") or "",
                            "price_usd":positive(a.get("base_token_price_usd")),
                            "liquidity_usd":positive(a.get("reserve_in_usd")),
                            "volume_24h_usd":positive((a.get("volume_usd") or {}).get("h24")),
                            "created_at":a.get("pool_created_at")})
        except (KeyError,TypeError,ValueError):
            continue
    return {"network":network,"feed":feed,"source":"GeckoTerminal","observed_utc":utc(),"markets":markets}


def dex_token_trades(network, contract):
    contract = address_key(network,contract)
    records, feeds, found = dex_sample(network,contract)
    records.sort(key=lambda row:(row["time_ms"],row["id"]),reverse=True)
    return {"network":network,"contract":contract,"observed_utc":utc(),
            "sources":feeds,"discovered_pools":found,"trades":records[:80]}

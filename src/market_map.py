"""Read-only spot market map with explicit asset identity for valuations."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from math import isfinite
from os import getenv
from threading import Lock
from time import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json

try:
    from src import multi_asset
except ModuleNotFoundError:
    import multi_asset

WINDOWS = {"5m": ("1m", 1, 5), "1h": ("5m", 5, 12),
           "4h": ("15m", 15, 16), "24h": ("15m", 15, 96)}
# Explicit spot asset identities. Never join arbitrary tickers to valuation data.
ASSETS = {
    "BTC": ("bitcoin", "bitcoin"), "ETH": ("ethereum", "layer1"),
    "SOL": ("solana", "layer1"), "BNB": ("binancecoin", "layer1"),
    "XRP": ("ripple", "payments"), "TRX": ("tron", "layer1"),
    "HYPE": ("hyperliquid", "defi"), "DOGE": ("dogecoin", "meme"),
    "ZEC": ("zcash", "privacy"), "LINK": ("chainlink", "infrastructure"),
    "ADA": ("cardano", "layer1"), "XLM": ("stellar", "payments"),
    "BCH": ("bitcoin-cash", "payments"), "TON": ("the-open-network", "layer1"),
    "LTC": ("litecoin", "payments"), "HBAR": ("hedera-hashgraph", "layer1"),
    "AVAX": ("avalanche-2", "layer1"), "SHIB": ("shiba-inu", "meme"),
    "SUI": ("sui", "layer1"), "UNI": ("uniswap", "defi"),
    "TAO": ("bittensor", "ai"), "NEAR": ("near", "layer1"),
    "AAVE": ("aave", "defi"), "ONDO": ("ondo-finance", "rwa"),
    "ENA": ("ethena", "defi"), "PEPE": ("pepe", "meme"),
    "DOT": ("polkadot", "infrastructure"), "ICP": ("internet-computer", "infrastructure"),
    "ATOM": ("cosmos", "infrastructure"), "RENDER": ("render-token", "ai"),
    "JUP": ("jupiter-exchange-solana", "defi"), "XAUT": ("tether-gold", "rwa"),
    "PAXG": ("pax-gold", "rwa"), "USDC": ("usd-coin", "stablecoin"),
}
PAPRIKA_IDS = {
    "BTC": "btc-bitcoin", "ETH": "eth-ethereum", "SOL": "sol-solana",
    "BNB": "bnb-binance-coin", "XRP": "xrp-xrp", "TRX": "trx-tron",
    "DOGE": "doge-dogecoin", "ZEC": "zec-zcash", "LINK": "link-chainlink",
    "ADA": "ada-cardano", "XLM": "xlm-stellar", "BCH": "bch-bitcoin-cash",
    "LTC": "ltc-litecoin", "HBAR": "hbar-hedera-hashgraph", "AVAX": "avax-avalanche",
    "SHIB": "shib-shiba-inu", "SUI": "sui-sui", "UNI": "uni-uniswap",
    "NEAR": "near-near-protocol", "AAVE": "aave-aave", "DOT": "dot-polkadot",
    "ICP": "icp-internet-computer", "ATOM": "atom-cosmos", "USDC": "usdc-usd-coin",
}
_CACHE = {"values": {}, "attempt": 0, "available": False}
_LOCK = Lock()


def positive(value):
    return value if type(value) in (int, float) and isfinite(value) and value > 0 else None


def normalize_valuation(row, quote, source, now):
    try:
        stamp = datetime.fromisoformat(row["last_updated"].replace("Z", "+00:00"))
        if stamp.tzinfo is None or not now - 900 < stamp.timestamp() <= now + 300:
            return None
    except (KeyError, AttributeError, ValueError, TypeError, OverflowError, OSError):
        return None
    supply = positive(row.get("circulating_supply"))
    return {
        "market_cap_usd": positive(quote.get("market_cap")) if supply is not None else None,
        "circulating_supply": supply,
        "volume_24h_usd": positive(quote.get("total_volume", quote.get("volume_24h"))),
        "valuation_at": stamp.isoformat(), "valuation_source": source,
    }


def coingecko(now):
    ids = {asset[0] for asset in ASSETS.values()}
    params = urlencode({"vs_currency": "usd", "ids": ",".join(sorted(ids)),
                        "per_page": len(ids), "page": 1})
    headers = {"Accept": "application/json", "User-Agent": "STAMP-MarketMap/1.0"}
    if key := getenv("COINGECKO_DEMO_API_KEY"):
        headers["x-cg-demo-api-key"] = key
    request = Request("https://api.coingecko.com/api/v3/coins/markets?" + params, headers=headers)
    with urlopen(request, timeout=5) as response:
        rows = json.loads(response.read(500000))
    if not isinstance(rows, list):
        raise ValueError("invalid valuations")
    return {row["id"]: value for row in rows if isinstance(row, dict) and row.get("id") in ids
            if (value := normalize_valuation(row, row, "CoinGecko", now)) is not None}


def coinpaprika(now):
    ids = {provider_id: ASSETS[base][0] for base, provider_id in PAPRIKA_IDS.items()}
    rows = multi_asset.public_json("https://api.coinpaprika.com/v1/tickers?quotes=USD", timeout=5, limit=5_000_000)
    if not isinstance(rows, list):
        raise ValueError("invalid valuations")
    return {ids[row["id"]]: value for row in rows if isinstance(row, dict) and row.get("id") in ids
            if (value := normalize_valuation(row, (row.get("quotes") or {}).get("USD") or {},
                                             "CoinPaprika", now)) is not None}


def valuation_rows():
    with _LOCK:
        now = time()
        if now - _CACHE["attempt"] < 120:
            return _CACHE["values"], _CACHE["available"]
        _CACHE["attempt"] = now
        values = {}
        for provider in (coingecko, coinpaprika):
            try:
                values = provider(now)
            except (OSError, ValueError, TypeError, KeyError):
                continue
            if any(value["market_cap_usd"] is not None for value in values.values()):
                break
        if values:
            _CACHE["values"] = values
        _CACHE["available"] = any(value["market_cap_usd"] is not None for value in values.values())
        return _CACHE["values"], _CACHE["available"]


def catalog():
    with ThreadPoolExecutor(max_workers=2) as pool:
        valuation = pool.submit(valuation_rows)
        universe = multi_asset.dashboard_universe()
        values, available = valuation.result()
    assets = {}
    for base, (asset_id, sector) in ASSETS.items():
        pair = base + "USDT"
        if pair in universe["venues"]:
            entry = values.get(asset_id, {})
            updated = entry.get("valuation_at")
            fresh = updated and time() - datetime.fromisoformat(updated).timestamp() < 900
            assets[pair] = {"sector": sector, **(entry if fresh else {})}
    if "STAMPUSDT" in universe["venues"]:
        assets["STAMPUSDT"] = {"sector": "other"}
    return {"pairs": universe["pairs"], "assets": assets, "valuation_available": available}


def summarize(rows, period, now_ms):
    _, minutes, count = WINDOWS[period]
    step = minutes * 60_000
    end = now_ms // step * step
    start = end - count * step
    closed = {row["t"]: row for row in rows if start <= row["t"] < end}
    expected = range(start, end, step)
    if any(timestamp not in closed for timestamp in expected):
        return None
    window = [closed[timestamp] for timestamp in expected]
    price = window[-1]["c"]
    return {
        "price": price, "change": (price / window[0]["o"] - 1) * 100,
        "high": max(row["h"] for row in window), "low": min(row["l"] for row in window),
        "prices": [window[0]["o"], *(row["c"] for row in window)], "window_start_ms": start,
        "price_at_ms": end,
    }


@lru_cache(maxsize=1024)
def pair_window(pair, period, venues, bucket):
    now_ms = bucket * 30_000
    for venue in venues[:3]:
        try:
            rows = multi_asset.venue_candles(venue, pair, WINDOWS[period][0])
            summary = summarize(rows, period, now_ms)
            if summary is not None:
                return {"pair": pair, "venue": venue, **summary}
        except (OSError, ValueError, KeyError, TypeError, IndexError):
            continue
    return {"pair": pair}


def windows(period, pairs):
    if period not in WINDOWS or not 1 <= len(pairs) <= 12 or len(set(pairs)) != len(pairs):
        raise ValueError("invalid market map selection")
    pairs = [multi_asset.symbol(pair) for pair in pairs]
    venues = multi_asset.dashboard_universe()["venues"]
    bucket = int(time() // 30)
    with ThreadPoolExecutor(max_workers=min(12, len(pairs))) as pool:
        cards = list(pool.map(lambda pair: pair_window(pair, period, tuple(venues.get(pair, ())), bucket), pairs))
    return {"period": period, "cards": cards}

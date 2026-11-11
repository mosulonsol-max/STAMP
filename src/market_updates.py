"""Short-window MEXC spot updates for the authenticated chart."""
import datetime as dt
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import math
import time

try:
    from src.multi_asset import fetch, symbol
except ModuleNotFoundError:
    from multi_asset import fetch, symbol

FRAME_INTERVALS = {
    "15m": ("15m", 900_000),
    "1h": ("60m", 3_600_000),
    "4h": ("4h", 14_400_000),
    "1d": ("1d", 86_400_000),
}


def iso_ms(value):
    return dt.datetime.fromtimestamp(value / 1000, dt.timezone.utc).isoformat()


def request_market(endpoint, params):
    try:
        return fetch(endpoint, params, timeout=4)
    except (OSError, ValueError, TypeError):
        return None


@lru_cache(maxsize=256)
def cached_statistics(pair, slot, load_ticker):
    # The rolling ticker has a separate observation time from the last trade.
    return load_ticker(pair)


def latest_trade(rows, now_ms):
    latest = None
    for row in rows if isinstance(rows, list) else []:
        try:
            px, observed = float(row["price"]), int(row["time"])
        except (TypeError, ValueError, KeyError, OverflowError):
            continue
        if not math.isfinite(px) or px <= 0 or not 0 < observed <= now_ms + 5000:
            continue
        if latest is None or observed >= latest[1]:
            latest = (px, observed)
    return latest


def recent_candles(rows, step, now_ms):
    closed = {}
    forming = None
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, (list, tuple)):
            continue
        try:
            start, end = int(row[0]), int(row[6])
            o, h, l, c, v = map(float, row[1:6])
        except (TypeError, ValueError, IndexError, OverflowError):
            continue
        if (
            not 0 < start <= now_ms or start % step or end not in (start + step, start + step - 1)
            or not all(math.isfinite(x) for x in (o, h, l, c, v))
            or not 0 < l <= min(o, c) <= max(o, c) <= h or v < 0
        ):
            continue
        bar = {"t": start, "o": o, "h": h, "l": l, "c": c, "v": v}
        if start + step <= now_ms:
            closed[start] = bar
        else:
            forming = {**bar, "end": start + step, "observed_utc": iso_ms(now_ms), "transport": "rest"}
    return [closed[t] for t in sorted(closed)], forming


def market_update(pair, frame, load_ticker):
    pair = symbol(pair)
    if frame not in FRAME_INTERVALS:
        raise ValueError("invalid_live_interval")
    interval, step = FRAME_INTERVALS[frame]
    with ThreadPoolExecutor(max_workers=3) as pool:
        stats_task = pool.submit(cached_statistics, pair, int(time.monotonic() // 60), load_ticker)
        trade_task = pool.submit(request_market, "trades", {"symbol": pair, "limit": 5})
        bars_task = pool.submit(request_market, "klines", {"symbol": pair, "interval": interval, "limit": 8})
        ticker, trades, bars = stats_task.result(), trade_task.result(), bars_task.result()

    now_ms = int(time.time() * 1000)
    observed = iso_ms(now_ms)
    trade = latest_trade(trades, now_ms)
    statistics = {}
    if ticker.get("status") == "fresh" and ticker.get("provider_at_utc"):
        statistics = {key: ticker.get(key) for key in (
            "change_24h_pct", "high_24h", "low_24h", "volume_24h_usdt", "base_volume_24h",
        )}
        statistics["stats_at_utc"] = ticker["provider_at_utc"]
    quote = {"status": "unavailable", "symbol": pair}
    if trade:
        px, when = trade
        quote = {
            **statistics, "symbol": pair, "status": "fresh" if now_ms - when <= 15_000 else "stale",
            "price": px, "provider_at_utc": iso_ms(when), "retrieved_at_utc": observed,
            "transport": "rest", "source": "MEXC public recent trades", "price_kind": "trade",
        }
    elif statistics:
        quote = {
            **statistics, "symbol": pair, "status": "snapshot", "price": ticker["price"],
            "provider_at_utc": ticker["provider_at_utc"], "retrieved_at_utc": ticker["retrieved_at_utc"],
            "transport": "rest", "source": "MEXC public 24h ticker", "price_kind": "ticker",
        }

    closed, forming = recent_candles(bars, step, now_ms)
    return {
        "symbol": pair, "frame": frame, "quote": quote,
        "closed": closed, "forming": forming, "observed_at_utc": observed,
    }

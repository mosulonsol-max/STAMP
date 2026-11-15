"""Exchange session calendars and bounded, timestamped crypto execution samples."""
import datetime as dt
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache

import exchange_calendars
import pandas as pd

try:
    from src.market_events import trade_sample, venue_trade_rows
except ImportError:
    from market_events import trade_sample, venue_trade_rows


# Exchange calendars include local holidays, partial sessions, lunch breaks, and DST.
SESSIONS = (
    ("New York", "XNYS", "America/New_York"),
    ("London", "XLON", "Europe/London"),
    ("Frankfurt", "XETR", "Europe/Berlin"),
    ("Tokyo", "XTKS", "Asia/Tokyo"),
    ("Shanghai", "XSHG", "Asia/Shanghai"),
    ("Hong Kong", "XHKG", "Asia/Hong_Kong"),
    ("Sydney", "XASX", "Australia/Sydney"),
)
PAIRS = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "ZECUSDT")
VENUES = ("MEXC", "OKX", "Binance")
WINDOW_MS = 60_000


def iso(value):
    return value.isoformat() if value is not None and not pd.isna(value) else None


@lru_cache(maxsize=len(SESSIONS))
def calendar(name):
    return exchange_calendars.get_calendar(name)


def session_status(now):
    minute = pd.Timestamp(now).floor("min")
    result = []
    for label, code, zone in SESSIONS:
        try:
            cal = calendar(code)
            is_open = bool(cal.is_open_on_minute(minute))
            is_break = bool(cal.is_break_minute(minute))
            if is_break:
                current = cal.minute_to_session(minute, direction="previous")
                next_change = cal.session_break_end(current)
            elif is_open:
                current = cal.minute_to_session(minute, direction="previous")
                lunch = cal.session_break_start(current)
                close = cal.session_close(current)
                next_change = lunch if lunch is not None and not pd.isna(lunch) and lunch > minute else close
            else:
                next_change = cal.next_open(minute)
            result.append({"name": label, "exchange": code, "timezone": zone,
                           "status": "open" if is_open else "break" if is_break else "closed",
                           "next_change_utc": iso(next_change)})
        except (ValueError, KeyError, IndexError, OverflowError):
            result.append({"name": label, "exchange": code, "timezone": zone,
                           "status": "unknown", "next_change_utc": None})
    return result


def sampled_execution(venue, pair, observed):
    try:
        rows = venue_trade_rows(venue, pair)
        sample = trade_sample(rows, pair, observed.isoformat(), venue)
        return venue, pair, rows, sample
    except (OSError, ValueError, KeyError, TypeError, IndexError):
        return venue, pair, None, {"status": "unavailable", "_executions": []}


@lru_cache(maxsize=3)
def crypto_sample(bucket):
    observed = dt.datetime.now(dt.timezone.utc)
    checked_ms = int(observed.timestamp() * 1000)
    assets = {pair: {"symbol": pair, "buy_usdt": 0.0, "sell_usdt": 0.0,
                     "trades": 0, "first_ms": None, "last_ms": None, "venues": [],
                     "capped_venues": []} for pair in PAIRS}
    coverage = []
    with ThreadPoolExecutor(max_workers=len(PAIRS) * len(VENUES)) as pool:
        futures = [pool.submit(sampled_execution, venue, pair, observed)
                   for pair in PAIRS for venue in VENUES]
        for future in as_completed(futures):
            venue, pair, rows, sample = future.result()
            events = [event for event in sample.get("_executions", [])
                      if checked_ms - WINDOW_MS <= event["time_ms"] <= checked_ms + 5000]
            asset = assets[pair]
            if sample["status"] in ("ok", "stale", "empty"):
                asset["venues"].append(venue)
            if isinstance(rows, list) and len(rows) >= (100 if venue == "OKX" else 250):
                asset["capped_venues"].append(venue)
            coverage.append({"symbol": pair, "venue": venue,
                             "status": sample["status"], "sample_count": len(events),
                             "latest_execution_ms": sample.get("last_ms")})
            for event in events:
                asset[event["side"] + "_usdt"] += event["notional"]
                asset["trades"] += 1
                when = event["time_ms"]
                asset["first_ms"] = min(asset["first_ms"] or when, when)
                asset["last_ms"] = max(asset["last_ms"] or when, when)
    ordered = sorted(assets.values(), key=lambda asset: -(asset["buy_usdt"] + asset["sell_usdt"]))
    for asset in ordered:
        asset["venues"].sort()
        asset["capped_venues"].sort()
        asset["buy_usdt"] = round(asset["buy_usdt"], 2)
        asset["sell_usdt"] = round(asset["sell_usdt"], 2)
    return {"observed_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "window_seconds": 60, "assets": ordered,
            "coverage": sorted(coverage, key=lambda row: (row["symbol"], row["venue"])),
            "status": "ok" if any(asset["trades"] for asset in ordered) else "unavailable",
            "scope": "Recent public spot executions only, BTC/ETH/SOL/ZEC against USDT, MEXC/OKX/Binance. "
                     "Trade endpoints cap returned rows; totals may cover less than 60 seconds and are not full market volume. "
                     "Buy/sell means taker side; geography of participants is unknown."}


def snapshot():
    now = dt.datetime.now(dt.timezone.utc)
    data = crypto_sample(int(time.time() // 15))
    return {"generated_utc": now.isoformat(), "sessions": session_status(now), "crypto": data}

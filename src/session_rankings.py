"""Rank Binance spot executions inside exchange calendar windows."""
import datetime as dt
import json
import math
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from threading import Lock

from urllib.parse import urlencode
from urllib.request import Request, urlopen

SOURCE = "Binance Spot"
BASE = "https://data-api.binance.vision/api/v3/"
CANDIDATES = 48
UTC = dt.timezone.utc
LOCK = Lock()


def public(endpoint, **params):
    url = BASE + endpoint + "?" + urlencode(params)
    request = Request(url, headers={"User-Agent": "STAMP-Market-Dashboard"})
    with urlopen(request, timeout=7) as response:
        return json.load(response)


@lru_cache(maxsize=2)
def candidates(bucket):
    rows = public("ticker/24hr", type="MINI")
    ranked = sorted(
        ((float(row["quoteVolume"]), row["symbol"]) for row in rows
         if re.fullmatch(r"[A-Z0-9]{1,20}USDT", row["symbol"])),
        reverse=True,
    )
    return tuple(symbol for volume, symbol in ranked[:CANDIDATES] if volume > 0)


def summarize(symbol, candles, periods):
    rows = [row for row in candles if any(start <= row[0] and row[6] < end
                                         for start, end in periods)]
    if not rows:
        return None
    total_base = sum(float(row[5]) for row in rows)
    total_quote = sum(float(row[7]) for row in rows)
    buy_base = sum(float(row[9]) for row in rows)
    buy_quote = sum(float(row[10]) for row in rows)
    sell_base = max(0, total_base - buy_base)
    sell_quote = max(0, total_quote - buy_quote)
    if total_quote <= 0 or not all(math.isfinite(v) for v in
                                    (total_base, total_quote, buy_base, buy_quote)):
        return None
    return {"symbol": symbol, "buy_quantity": buy_base, "sell_quantity": sell_base,
            "buy_usdt": buy_quote, "sell_usdt": sell_quote, "volume_usdt": total_quote,
            "buy_price": buy_quote / buy_base if buy_base else None,
            "sell_price": sell_quote / sell_base if sell_base else None,
            "last_price": float(rows[-1][4]), "trades": sum(row[8] for row in rows),
            "change_pct": (float(rows[-1][4]) / float(rows[0][1]) - 1) * 100}


@lru_cache(maxsize=24)
def rank(periods, live):
    symbols = candidates(int(time.time() // 120))
    start, end = periods[0][0], periods[-1][1]
    interval = "1m" if live else "5m"
    step = 60_000 if live else 300_000
    if any(bound % step for period in periods for bound in period):
        interval = "1m"
    def collect(symbol):
        try:
            candles = public("klines", symbol=symbol, interval=interval,
                             startTime=start, endTime=end - 1, limit=1000)
            return True, summarize(symbol, candles, periods)
        except (OSError, ValueError, TypeError, IndexError, KeyError):
            return False, None

    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(collect, symbols))
    ranked = sorted((row for ok, row in results if row),
                    key=lambda row: (-row["volume_usdt"], row["symbol"]))[:10]
    coverage = sum(ok for ok, _ in results)
    return {"pairs": ranked, "source": SOURCE, "candidate_count": len(symbols),
            "covered_count": coverage, "observed_utc": dt.datetime.now(UTC).isoformat(),
            "status": "ok" if coverage and coverage == len(symbols)
            else "partial" if coverage else "unavailable"}


def periods_for(code, status, now):
    try:
        from src.world_sessions import calendar
    except ImportError:
        from world_sessions import calendar
    import pandas as pd
    cal = calendar(code)
    minute = pd.Timestamp(now).floor("min")
    session = cal.minute_to_session(minute, direction="previous")
    opening, closing = cal.session_open(session), cal.session_close(session)
    if status == "closed" and closing > minute:
        session = cal.previous_session(session)
        opening, closing = cal.session_open(session), cal.session_close(session)
    ms = lambda ts: int(ts.timestamp() * 1000)
    if status == "open":
        end = minute
        start = max(opening, end - pd.Timedelta(minutes=5))
        lunch_end = cal.session_break_end(session)
        if not pd.isna(lunch_end) and lunch_end <= end:
            start = max(start, lunch_end)
        return ((ms(start), ms(end)),) if start < end else ()
    if status == "break":
        closing = cal.session_break_start(session)
    lunch_start, lunch_end = cal.session_break_start(session), cal.session_break_end(session)
    if not pd.isna(lunch_start) and opening < lunch_start < lunch_end < closing:
        return ((ms(opening), ms(lunch_start)), (ms(lunch_end), ms(closing)))
    return ((ms(opening), ms(closing)),)


def archived_rank(code, periods):
    """Keep a completed ranking stable across restarts and candidate changes."""
    database = os.getenv("DATABASE_URL")
    if not database:
        return rank(periods, False)
    import psycopg
    end = periods[-1][1]
    with psycopg.connect(database, connect_timeout=4) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS world_session_ranking (
                exchange TEXT NOT NULL, close_ms BIGINT NOT NULL,
                payload JSONB NOT NULL, PRIMARY KEY(exchange, close_ms)
            )
        """)
        existing = conn.execute(
            "SELECT payload FROM world_session_ranking WHERE exchange=%s AND close_ms=%s",
            (code, end),
        ).fetchone()
    if existing:
        return existing[0]
    result = rank(periods, False)
    if result["status"] != "ok" or len(result["pairs"]) < 10:
        return result
    with psycopg.connect(database, connect_timeout=4) as conn:
        conn.execute("""
            INSERT INTO world_session_ranking(exchange,close_ms,payload)
            VALUES (%s,%s,%s::jsonb) ON CONFLICT DO NOTHING
        """, (code, end, json.dumps(result, allow_nan=False)))
        return conn.execute(
            "SELECT payload FROM world_session_ranking WHERE exchange=%s AND close_ms=%s",
            (code, end),
        ).fetchone()[0]


def snapshot(code, now=None):
    try:
        from src.world_sessions import session_status
    except ImportError:
        from world_sessions import session_status
    now = now or dt.datetime.now(UTC)
    session = next((entry for entry in session_status(now) if entry["exchange"] == code), None)
    if session is None:
        raise ValueError("unknown_exchange")
    status = session["status"]
    periods = periods_for(code, status, now) if status != "unknown" else ()
    if not periods:
        return {**session, "pairs": [], "status": "waiting", "session_status": status}
    # Collapse simultaneous requests for the same opening-session window.
    with LOCK:
        result = archived_rank(code, periods) if status == "closed" else rank(periods, status == "open")
        if result["status"] != "ok":
            rank.cache_clear()
    return {**session, **result, "session_status": status,
            "window_start_utc": dt.datetime.fromtimestamp(periods[0][0] / 1000, UTC).isoformat(),
            "window_end_utc": dt.datetime.fromtimestamp(periods[-1][1] / 1000, UTC).isoformat()}

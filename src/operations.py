"""Persist observed source state and market evidence during the background run."""
import json
import pathlib
from urllib.request import Request, urlopen

try:
    from src.market_events import (DAY, archived_trade_sample, burn_events, merge_events,
                                   milliseconds, scan_liquidity, utc)
except ImportError:
    from market_events import (DAY, archived_trade_sample, burn_events, merge_events,
                               milliseconds, scan_liquidity, utc)

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKER_URL = "https://stamp-autonomous-worker.onrender.com/status"
SOURCE_IDS = ("workflow", "worker", "mexc_ticker", "mexc_candles",
              "mexc_orderbook", "mexc_trades", "dexscreener", "pumpswap")


def worker_status():
    request = Request(WORKER_URL, headers={"Accept": "application/json", "User-Agent": "STAMP-operations"})
    with urlopen(request, timeout=8) as response:
        raw = response.read(8193)
    if len(raw) > 8192:
        raise ValueError("oversized_worker_health")
    result = json.loads(raw)
    if not isinstance(result, dict) or not isinstance(result.get("healthy"), bool):
        raise ValueError("invalid_worker_health")
    return result


def feed_observation(entry, collected):
    entry = entry or {}
    data = entry.get("data")
    valid = data is not None and not entry.get("error")
    return {"status": "ok" if valid and data else "empty" if valid and isinstance(data, list) else "unavailable",
            "observed_utc": entry.get("retrieved_at_utc") or collected}


def observe(previous, incoming, now):
    """Only a newer observation can change state or create an incident."""
    states = dict(previous.get("sources") or {})
    incidents = list(previous.get("incidents") or [])
    for name in SOURCE_IDS:
        reading = incoming.get(name) or {}
        observed = milliseconds(reading.get("observed_utc"))
        old = states.get(name) or {}
        if observed is None or observed <= (milliseconds(old.get("observed_utc")) or 0):
            continue
        status = reading["status"]
        last_ok = reading["observed_utc"] if status in ("ok", "empty") else old.get("last_ok_utc")
        states[name] = dict(reading, last_ok_utc=last_ok)
        old_status = old.get("status")
        old_level = "ok" if old_status in ("ok", "empty") else old_status
        level = "ok" if status in ("ok", "empty") else status
        if old_level and level != old_level:
            incidents.append({"source": name, "from": old_status, "to": status,
                              "observed_utc": reading["observed_utc"]})
    cutoff = (milliseconds(now) or 0) - 7 * DAY
    recent = [e for e in incidents if (milliseconds(e["observed_utc"]) or 0) >= cutoff]
    return states, sorted(recent, key=lambda e: milliseconds(e["observed_utc"]) or 0, reverse=True)[:40]


def archived_observations(raw, health):
    mexc = raw.get("mexc") or {}
    collected = raw.get("collected_at_utc")
    return {
        "workflow": {"status": "ok" if health.get("pipeline_passed") is True else "degraded",
                     "observed_utc": health.get("timestamp_utc"), "run_id": health.get("run_id")},
        "mexc_ticker": feed_observation(mexc.get("ticker"), collected),
        "mexc_candles": feed_observation(mexc.get("klines_15m"), collected),
        "mexc_orderbook": feed_observation(mexc.get("book"), collected),
        "mexc_trades": feed_observation(mexc.get("trades"), collected),
        "dexscreener": feed_observation(raw.get("dex"), collected),
    }


def archive_view(previous, raw, health):
    """Bootstrap existing deployments from recorded observations only."""
    if previous.get("checked_utc"):
        return {key: value for key, value in previous.items() if key != "scan"}
    trade = archived_trade_sample(raw)
    sources, _ = observe({}, archived_observations(raw, health), utc())
    return {"checked_utc": None, "sources": sources, "incidents": [],
            "events": {"records": trade["events"], "trades": {k: v for k, v in trade.items() if k != "events"}}}


def read_json(path):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return {}


def read_burns(path):
    if not path.exists():
        return []
    rows = []
    for line in path.read_text().splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    return rows


def collect(folder=ROOT / "data"):
    try:
        from src.evidence_sources import rpc
    except ImportError:
        from evidence_sources import rpc
    raw = read_json(folder / "latest.json").get("raw") or {}
    health = read_json(folder / "workflow_health.json")
    path = folder / "operations.json"
    previous = read_json(path)
    old_events = previous.get("events") or {}
    trade = archived_trade_sample(raw)
    with_worker = archived_observations(raw, health)
    try:
        worker = worker_status()
        with_worker["worker"] = {"status": "ok" if worker["healthy"] else "degraded",
                                 "observed_utc": utc(), "last_cycle_utc": worker.get("last_cycle_utc"),
                                 "processed": worker.get("processed"), "storage": worker.get("storage")}
    except (OSError, ValueError):
        with_worker["worker"] = {"status": "unavailable", "observed_utc": utc()}
    liquidity, found, inspected = scan_liquidity(raw, previous.get("scan") or {}, rpc)
    with_worker["pumpswap"] = {k: liquidity[k] for k in ("status", "observed_utc")}
    now = utc()
    checked = milliseconds(now)
    sources, incidents = observe(previous, with_worker, now)
    burns = burn_events(read_burns(folder / "verified_burns.jsonl"))
    existing = old_events.get("records") or []
    trades = merge_events((trade["events"], [e for e in existing if e["kind"] == "trade"]),
                          checked - 2 * DAY, 96)
    chain = merge_events((found, burns, [e for e in existing if e["kind"] != "trade"]),
                         checked - 30 * DAY, 64)
    if not trade["observed_utc"] or (milliseconds(trade["observed_utc"]) or 0) <= (
            milliseconds((old_events.get("trades") or {}).get("observed_utc")) or 0):
        trades_coverage = old_events.get("trades")
    else:
        trades_coverage = {k: v for k, v in trade.items() if k != "events"}
    result = {"checked_utc": now, "sources": sources, "incidents": incidents,
              "events": {"records": merge_events((trades, chain)), "trades": trades_coverage,
                         "liquidity": liquidity},
              "scan": {"pool": liquidity.get("pool"), "inspected_signatures": inspected}}
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    temp.replace(path)
    return result


if __name__ == "__main__":
    report = collect()
    print("Operations", report["checked_utc"], {k: v["status"] for k, v in report["sources"].items()},
          "events", len(report["events"]["records"]), "incidents", len(report["incidents"]))

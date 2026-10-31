#!/usr/bin/env python3
"""Read-only integrity check for STAMP latest research snapshot."""
import argparse
import datetime as dt
import json
import pathlib
import sys

MINT = "EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc"

def check(path, max_age_minutes):
    errors = []
    try:
        obj = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return [f"Cannot parse snapshot: {exc}"]
    if not isinstance(obj, dict):
        return ["Snapshot root must be an object"]
    raw = obj.get("raw")
    if not isinstance(raw, dict):
        return ["Missing raw market observation"]
    if raw.get("contract") != MINT:
        errors.append("Wrong or missing Solana mint")
    stamp = raw.get("collected_at_utc")
    try:
        observed = dt.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if observed.tzinfo is None:
            raise ValueError("Timezone missing")
        age = (dt.datetime.now(dt.timezone.utc) - observed).total_seconds() / 60
        if age < -5:
            errors.append("Snapshot timestamp is in the future")
        if max_age_minutes is not None and age > max_age_minutes:
            errors.append(f"Snapshot stale: {age:.1f} minutes")
    except (AttributeError, TypeError, ValueError) as exc:
        errors.append(f"Invalid collected_at_utc: {exc}")
    mexc = raw.get("mexc", {})
    if not isinstance(mexc, dict):
        errors.append("MEXC source is missing")
    else:
        ticker = mexc.get("ticker", {})
        data = ticker.get("data") if isinstance(ticker, dict) else None
        if not isinstance(data, dict) or data.get("symbol") != "STAMPUSDT":
            errors.append("MEXC STAMPUSDT ticker missing or unavailable")
        else:
            try:
                if float(data["lastPrice"]) <= 0:
                    errors.append("MEXC price must be positive")
            except (KeyError, ValueError, TypeError):
                errors.append("Invalid MEXC lastPrice")
    return errors

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/latest.json")
    parser.add_argument("--max-age-minutes", type=float, default=None)
    args = parser.parse_args()
    errors = check(args.file, args.max_age_minutes)
    if errors:
        for err in errors:
            print("FAIL:", err, file=sys.stderr)
        sys.exit(1)
    print("PASS: STAMP snapshot JSON, mint, timestamp and MEXC ticker")

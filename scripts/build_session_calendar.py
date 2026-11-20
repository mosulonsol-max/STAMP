"""Regenerate the compact exchange calendar used by the Render worker."""
import datetime as dt
import json
from pathlib import Path

import exchange_calendars
import pandas as pd

from src.session_rankings import EXCHANGES


def main():
    utc = dt.timezone.utc
    first = dt.date.today().replace(month=1, day=1)
    end = first.replace(year=first.year + 5)
    rows = {}
    for code in EXCHANGES:
        exchange = exchange_calendars.get_calendar(code)
        schedule = exchange.schedule.loc[str(first):str(end)]
        def timestamp(value):
            return None if pd.isna(value) else int(value.timestamp()) // 60
        rows[code] = [[timestamp(value) for value in values]
                      for values in schedule[["open", "break_start", "break_end", "close"]]
                      .itertuples(index=False, name=None)]
    bounds = [int(dt.datetime.combine(day, dt.time.min, utc).timestamp()) // 60
              for day in (first, end)]
    target = Path(__file__).resolve().parents[1] / "src" / "session_calendar.json"
    target.write_text(json.dumps({"bounds": bounds, "exchanges": rows}, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()

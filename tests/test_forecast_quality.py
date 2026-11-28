import datetime as dt
import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine_observatory import empirical_range, summarize
from multi_asset import forecast_frame, forecasts

class ForecastQualityTests(unittest.TestCase):
    def test_stale_and_gapped_series_are_not_issued(self):
        step = 3_600_000
        close = int(dt.datetime.now(dt.timezone.utc).timestamp() * 1000) // step * step
        rows = [{"t": close - (80 - i) * step, "c": 100 + i / 10} for i in range(80)]
        self.assertEqual(forecasts({"1h":rows})["1h"]["status"], "research_only")
        self.assertEqual(forecast_frame(rows[:68] + rows[69:], "1h")["status"], "insufficient_evidence")
        self.assertEqual(forecasts({"1h":rows[:-1]})["1h"]["status"], "stale_candles")

    def test_calibration_excludes_outcomes_measured_after_issue(self):
        start = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
        at = lambda index: (start + dt.timedelta(hours=index)).isoformat()
        def row(index, actual, measured=None):
            mse=math.log(actual / 100) ** 2
            return {"id": str(index), "pair":"BTCUSDT","frame":"1h","model_version":"causal_6_return_momentum",
                    "reference_at_utc":at(index),"due_at_utc":at(index+1),
                    "predicted_price":100,"reference_price":100,
                    "outcome":{"actual_price":actual,"measured_at_utc":at(measured if measured is not None else index+1),
                               "squared_log_error":mse,"baseline_squared_log_error":mse}}
        records=[row(i, 90+i*.5) for i in range(30)]
        future_measurement=row(30,1000,45)
        current={**row(40,100),"outcome":None}
        expected=empirical_range(current,records)
        self.assertEqual(expected["samples"],30)
        self.assertEqual(empirical_range(current,[*records,future_measurement]),expected)
        view=summarize({"records":[*records,future_measurement,current]},"BTCUSDT")
        self.assertEqual(view["latest"]["1h"]["historical_range"],expected)
        stats=view["target_rates"]["1h"]["causal_6_return_momentum"]
        self.assertEqual(stats["rate"],stats["flat_target_rate"])
        self.assertEqual(stats["skill_vs_flat"],0)

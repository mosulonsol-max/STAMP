import datetime as dt
import math
import unittest

from src.forecast_adaptation import DEFAULT, advance, shared_models, transferred_model


class ForecastAdaptationTests(unittest.TestCase):
    def test_shadow_confirmation_and_rollback(self):
        start = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
        stamp = lambda n: (start + dt.timedelta(hours=n)).isoformat()

        def row(n, actual, version=DEFAULT["version"]):
            return {"reference_at_utc": stamp(n), "due_at_utc": stamp(n+1),
                    "reference_price": 100, "predicted_price": 100*math.exp(.02),
                    "features": {"recent_returns": [.02]*20}, "model_version": version,
                    "outcome": {"actual_price": 100*math.exp(actual)}}

        training = [row(i, -.01) for i in range(60)]
        model, state = advance(training, DEFAULT, {}, stamp(61))
        self.assertIs(model, DEFAULT)
        self.assertEqual(state["error_hypothesis"], "momentum_direction_not_persistent")
        forward = [row(i, -.01) for i in range(61, 81)]
        model, state = advance(training+forward[:-1], model, state, stamp(81))
        self.assertEqual(state["forward_samples"], 19)
        model, state = advance(training+forward, model, state, stamp(82))
        self.assertEqual(state["status"], "promoted")
        self.assertEqual(model["scale"], -.5)
        drift = [row(i, 0, model["version"]) for i in range(82, 102)]
        model, state = advance(training+forward+drift, model, state, stamp(103))
        self.assertEqual((model["version"], state["status"]), ("no_change", "rolled_back_to_baseline"))

    def test_shared_model_never_counts_target_as_a_donor(self):
        rows = [{"reference_at_utc": str(n).zfill(2), "reference_price": 100,
                 "features": {"recent_returns": [.02]*20},
                 "outcome": {"actual_price": 100*math.exp(-.01)}} for n in range(30)]
        groups = {(f"COIN{n}USDT", "1h"): rows for n in range(5)}
        defaults, overrides = shared_models(groups)
        state = {"peer_models": defaults, "peer_model_overrides": overrides}
        self.assertEqual(transferred_model(state, "NEWUSDT", "1h")["peer_count"], 5)
        self.assertIsNone(transferred_model(state, "COIN0USDT", "1h"))
        self.assertIsNone(transferred_model(state, "NEWUSDT", "4h"))

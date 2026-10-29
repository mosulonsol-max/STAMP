import unittest
from src.forecast_review import review

class ForecastReviewTests(unittest.TestCase):
    def test_correct_and_wrong_outcomes(self):
        events=[
          {"event":"forecast","id":"a","reference_price":100,"predicted_log_return":0.1,"due_at_utc":"2026-10-30T01:00:00Z"},
          {"event":"outcome","forecast_id":"a","status":"evaluated","actual_price":110,"measurement_time_utc":"2026-10-30T01:01:00Z"},
          {"event":"forecast","id":"b","reference_price":100,"predicted_log_return":-0.1},
          {"event":"outcome","forecast_id":"b","status":"evaluated","actual_price":110},
        ]
        result=review(events)
        self.assertEqual(result["summary"]["evaluated"],2)
        self.assertEqual(result["summary"]["direction_accuracy"],0.5)
        self.assertEqual(result["rows"][1]["measurement_offset_seconds"],60)
    def test_pending_and_missing_are_not_scored(self):
        events=[{"event":"forecast","id":"a","reference_price":1,"predicted_log_return":0.1},
                {"event":"outcome","forecast_id":"a","status":"missing_timely_observation"}]
        result=review(events)
        self.assertEqual(result["summary"]["evaluated"],0)
        self.assertIsNone(result["summary"]["beats_baseline"])
    def test_invalid_prices_never_evaluated(self):
        result=review([{"event":"forecast","id":"a","reference_price":0,"predicted_log_return":1},
          {"event":"outcome","forecast_id":"a","status":"evaluated","actual_price":2}])
        self.assertEqual(result["summary"]["evaluated"],0)

if __name__=="__main__":
    unittest.main()

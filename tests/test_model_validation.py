"""Regression tests for research-only model promotion and candle continuity."""
import json, math, pathlib, sys, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
from autonomous_research import run

class ModelValidationTests(unittest.TestCase):
    def test_discontinuous_candles_are_excluded_and_gates_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory)
            (root/"data"/"candles").mkdir(parents=True)
            candles=[]
            for i in range(310):
                # A deliberate missing hourly candle between index 149 and 150.
                t=(i+(1 if i>=150 else 0))*3600000
                price=0.0002*(1+0.08*math.sin(i/13)+i/2000)
                candles.append({"t":t,"o":price,"h":price*1.01,"l":price*0.99,"c":price,"v":1000+i})
            (root/"data"/"candles"/"1h.json").write_text(json.dumps(candles))
            report=run(root)
            self.assertGreater(report["skipped_gap_windows"],0)
            self.assertEqual(report["data_quality"],"gaps_present")
            self.assertEqual(report["validation_samples"],120)
            self.assertEqual(len(report["folds"]),3)
            self.assertEqual(report["promotion_gate"]["wilson_95_lower_direction_accuracy_gt"],0.5)
            for challenger in report["challengers"].values():
                self.assertIn("direction_wilson_95",challenger)
                self.assertIn("direction_accuracy",challenger)
                if challenger["eligible"]:
                    self.assertLess(challenger["mae"],report["baseline_mae"]*0.9)
                    self.assertGreater(challenger["direction_wilson_95"][0],0.5)
    def test_no_candle_file_abstains(self):
        with tempfile.TemporaryDirectory() as directory:
            report=run(pathlib.Path(directory))
            self.assertEqual(report["status"],"insufficient_data")
            self.assertIsNone(report["champion"])

if __name__=="__main__":
    unittest.main()

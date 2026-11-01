"""Regression tests for the autonomous research laboratory."""
import datetime as dt
import json
import pathlib
import tempfile
import unittest
from autonomous_lab import evaluate_lab, audit_flow

class LabTest(unittest.TestCase):
    def fixture(self,root):
        d=root/"data";d.mkdir()
        def put(n,v):(d/n).write_text(json.dumps(v))
        stamp=dt.datetime.now(dt.timezone.utc).isoformat()
        put("STAMP_archive.json",{"contract":"EKtmPPLaCbEEKiwoHHtV7TsRsmPXs5CMGtQtZFSiinsc"})
        put("workflow_health.json",{"timestamp_utc":stamp,"pipeline_passed":True,
            "steps":{k:"success" for k in ("tests","monitor","audit","archive",
            "forecast_health","research","governance","evidence","diagnosis","dashboard")}})
        put("model_registry.json",{"generated_at_utc":stamp,
            "authority":"internal_model_governor_v1","manual_override_available":False,
            "horizons":{k:{"status":"experimental","model_version":"x"} for k in ("1h","4h","24h","7d")}})
        put("model_diagnosis.json",{"generated_at_utc":stamp,"engine":"v3",
            "horizons":{k:{"forecast":{"model_version":"x"},
              "selection":{"selected_model":"model"},"input_manifest":{
              "schema":"v1","groups":{g:{"status":"used","available_features":1}
                for g in ("regime","market","ticker","orderbook","trades","dex",
                          "onchain","news","project","macro","derivatives","feedback")}},
              "saved_metrics":{"samples":120,"mae":0.1},
              "reproduced_metrics":{"samples":120,"mae":0.1,"skill_vs_zero":-0.1}}
              for k in ("1h","4h","24h","7d")}})
        put("forecast_activity.json",{"checked_at_utc":stamp,"forecast_total":15})
        put("forecast_scorecard.json",{"generated_at_utc":stamp,"forecasts_total":15})
        put("learning_controller.json",{"engine":"v3","feature_signature":"test","forecast":{"model_version":"x"}})
    def test_rejects_bad_pipeline(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);self.fixture(root)
            health=json.loads((root/"data"/"workflow_health.json").read_text())
            health["steps"]["research"]="failure"
            (root/"data"/"workflow_health.json").write_text(json.dumps(health))
            result=evaluate_lab(root)
            self.assertEqual(result["flow"]["state"],"degraded")
            self.assertTrue(all(x["action"]=="quarantine" for x in result["experiments"]))
    def test_fails_closed_on_bad_replay(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);self.fixture(root)
            report=json.loads((root/"data"/"model_diagnosis.json").read_text())
            report["horizons"]["1h"]["saved_metrics"]["mae"]=0.2
            (root/"data"/"model_diagnosis.json").write_text(json.dumps(report))
            self.assertEqual(evaluate_lab(root)["experiments"][0]["action"],"quarantine")
    def test_no_unearned_promotion(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t);self.fixture(root)
            output=evaluate_lab(root)
            self.assertFalse(any(x["promotion_permitted_by_lab"] for x in output["experiments"]))
            self.assertTrue(all(x["action"]=="revise_in_sandbox" for x in output["experiments"]))

if __name__=="__main__":unittest.main()

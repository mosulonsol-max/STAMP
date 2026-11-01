import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
from experiment_evaluator import score_proposal
class EvaluationTest(unittest.TestCase):
    def test_short_history_is_not_claimed_as_validated(self):
        item={"horizon":"1h","family":"forest_absolute","parameters":{"n_estimators":12,"max_depth":3,"min_samples_leaf":12}}
        self.assertEqual(score_proposal(item,[])["status"],"insufficient_data")
    def test_unapproved_family_fails_closed(self):
        from experiment_evaluator import _model
        with self.assertRaises(ValueError):
            _model("arbitrary_python",{})

    def test_missing_archive_does_not_crash_pipeline(self):
        import json,tempfile
        from experiment_evaluator import run
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp);d=root/"data";d.mkdir()
            (d/"lab_experiments.json").write_text(json.dumps({"experiments":[]}))
            outcome=run(root,limit=2)
            self.assertEqual(outcome["evaluated"],0)
            self.assertEqual(outcome["results"],[])
            self.assertTrue((d/"lab_history.json").is_file())

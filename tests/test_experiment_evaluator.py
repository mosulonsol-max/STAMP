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

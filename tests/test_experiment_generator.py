import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
from experiment_generator import proposals
class GeneratorTests(unittest.TestCase):
 def test_bounded_and_no_production(self):
  lab={"experiments":[{"horizon":"1h","candidate":"forest_absolute","action":"revise_in_sandbox"}]}
  items=proposals(lab)
  self.assertEqual(len(items),6)
  self.assertTrue(all(x["production_eligible"] is False for x in items))
  self.assertTrue(all(len(set([x["changed_parameter"]]))==1 for x in items))
 def test_unknown_family_is_not_executed(self):
  self.assertEqual(proposals({"experiments":[{"horizon":"1h","candidate":"arbitrary_python","action":"revise_in_sandbox"}]}),[])

 def test_historical_results_prioritize_untried_variants(self):
  import json,tempfile
  from unittest.mock import patch
  from experiment_generator import generate
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);(root/"data").mkdir()
   lab={"flow":{"state":"healthy"},"experiments":[{"horizon":"1h","candidate":"forest_absolute","action":"revise_in_sandbox"}]}
   baseline=proposals(lab)
   (root/"data/lab_history.json").write_text(json.dumps({"experiments":{baseline[0]["id"]:{"attempts":3,"last_skill":-0.2}}}))
   with patch("experiment_generator.evaluate_lab",return_value=lab):
    out=generate(root)
   self.assertTrue(out["history_used"])
   self.assertEqual(len(out["experiments"]),6)
   self.assertNotEqual(out["experiments"][0]["id"],baseline[0]["id"])
   self.assertEqual(out["experiments"][-1]["id"],baseline[0]["id"])

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

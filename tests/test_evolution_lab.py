import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
from evolution_lab import validate,compute,propose,chronological_lab,search
class LabTests(unittest.TestCase):
 def test_rejects_code(self):
  for expr in ({"op":"__import__","args":[]},{"op":"feature","name":"os.system"},{"op":"feature","name":"market.BTC","extra":"x"}):
   with self.assertRaises(ValueError):validate(expr)
 def test_missing_is_not_zero(self):
  self.assertIsNone(compute({"op":"feature","name":"news.verified_events_24h_log"},{}))
 def test_deterministic_bounded(self):
  a=propose(["regime.rsi14","market.BTC_return_1h"],seed=7)
  self.assertEqual(a,propose(["market.BTC_return_1h","regime.rsi14"],seed=7))
  self.assertLessEqual(len(a),64)
 def test_forward_lab(self):
  spec={"op":"feature","name":"regime.rsi14"}
  rows=[{"feature_ms":i*3600000,"target_ms":(i+1)*3600000,"features":{"regime.rsi14":float(i%10)},"y":float(i%10)/100} for i in range(80)]
  result=chronological_lab(rows,spec)
  self.assertEqual(result["status"],"research_only")
  self.assertFalse(result["production_approved"])
  self.assertGreater(result["samples"],15)
 def test_search_never_approves(self):
  rows=[{"feature_ms":i*3600000,"target_ms":(i+1)*3600000,"features":{"regime.rsi14":float(i%10)},"y":float(i%10)/100} for i in range(80)]
  self.assertFalse(search(rows,["regime.rsi14"])["approved"])
if __name__=="__main__":unittest.main()

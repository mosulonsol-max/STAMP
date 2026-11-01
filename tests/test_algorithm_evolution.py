import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"src"))
from algorithm_evolution import candidates,version,evaluate_genomes
class EvolutionTests(unittest.TestCase):
 def test_unique_genomes(self):
  gs=list(candidates())
  self.assertEqual(len(gs),len({version(g) for g in gs}))
 def test_zero_baseline_fallback(self):
  out=evaluate_genomes([0.0]*30,{"no_change":[0.0]*30})
  self.assertEqual(out["selected_genome"]["estimator"],"no_change")
  self.assertFalse(out["production_approval"])
 def test_shrinkage_can_win(self):
  out=evaluate_genomes([0.5]*30,{"forest_absolute":[1.0]*30,"no_change":[0.0]*30})
  self.assertEqual(out["selected_genome"]["shrinkage"],0.5)
if __name__=="__main__":unittest.main()

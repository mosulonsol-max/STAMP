"""Diagnostic instrumentation must preserve forecasts and expose causal test errors."""
import datetime as dt,math,pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'src'))
from prediction_engine import evaluate,HOUR
from model_diagnosis import metrics
class ModelDiagnosisTests(unittest.TestCase):
 def test_trace_reconciles_scores_and_does_not_change_forecast(self):
  now=dt.datetime(2026,10,30,tzinfo=dt.timezone.utc);start=int(now.timestamp()*1000)-320*HOUR
  cs=[]
  for i in range(320):
   p=.001*math.exp(.1*math.sin(i/11)+.0002*i)
   cs.append(dict(t=start+i*HOUR,o=p,h=p*1.01,l=p*.99,c=p,v=1000+i))
  plain=evaluate(cs,'1h',now);traced=evaluate(cs,'1h',now,include_diagnostics=True)
  self.assertNotIn('validation_trace',plain);self.assertEqual(plain['forecast'],traced['forecast'])
  self.assertIn('scikit-learn',traced['runtime'])
  for name,score in traced['challengers'].items():
   trace=[r for r in traced['validation_trace'] if r['model']==name]
   self.assertEqual(len(trace),traced['validation_samples'])
   result=metrics([r['actual_log_return'] for r in trace],[r['predicted_log_return'] for r in trace])
   self.assertAlmostEqual(result['mae'],score['mae'],12)
   for row in trace:
    fold=traced['folds'][row['fold']]
    self.assertLessEqual(fold['train_last_target_ms'],row['feature_ms'])
    self.assertEqual(row['target_ms']-row['feature_ms'],HOUR)
 def test_zero_baseline_and_error_bias_are_not_hidden(self):
  m=metrics([.1,-.1],[0,0]);self.assertEqual(m['skill_vs_zero'],0);self.assertIsNone(m['direction_accuracy'])
  m=metrics([.1,.2],[-.1,-.2]);self.assertLess(m['skill_vs_zero'],0);self.assertLess(m['signed_bias'],0);self.assertEqual(m['error_larger_than_actual_move_fraction'],1)

"""Verify causal labels, immutable issuance, aligned returns and real burn parsing."""
import copy,datetime as dt,json,pathlib,sys,tempfile,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import forecast_audit as audit
import public_refresh as live
from prediction_engine import clean,dataset,evaluate
from evidence_sources import correlation,burn_instructions,CONTRACT

class EvidenceCycleTests(unittest.TestCase):
 def test_multihour_targets_are_purged_and_validation_is_nonoverlapping(self):
  cs=json.loads((ROOT/"data/candles/1h.json").read_text())
  now=dt.datetime.fromtimestamp((cs[-1]["t"]+3600000)/1000,dt.timezone.utc)+dt.timedelta(minutes=5)
  report=evaluate(cs,"4h",now)
  self.assertGreater(report["validation_samples"],0)
  for fold in report["folds"]:
   self.assertLessEqual(fold["train_last_target_ms"],fold["test_first_feature_ms"])
  self.assertIsNotNone(report["forecast"])
  f=report["forecast"]
  self.assertEqual((dt.datetime.fromisoformat(f["due_at_utc"])-dt.datetime.fromisoformat(f["reference_at_utc"])).total_seconds(),14400)
  self.assertEqual(f["approval_passed"],bool(report["champion"]))
  # A failed approval gate must not hide the experimental output.
  if not report["champion"]:self.assertEqual(f["forecast_class"],"research_unvalidated")
 def test_future_and_disconnected_labels_never_enter_training(self):
  cs=json.loads((ROOT/"data/candles/1h.json").read_text())[-80:]
  limit=cs[-2]["t"]+3600000
  self.assertEqual(clean(cs,limit)[-1]["t"],cs[-2]["t"])
  damaged=cs[:40]+cs[41:]
  rows,skipped=dataset(damaged,4)
  self.assertGreater(skipped,0)
  self.assertTrue(all(r["target_ms"]-r["feature_ms"]==4*3600000 for r in rows))
 def test_same_candle_issue_is_immutable_and_horizons_are_independent(self):
  now=dt.datetime.now(dt.timezone.utc)
  forecasts={}
  for h in ("1h","4h","24h","7d"):
   f=dict(source_candle="123",horizon=h,model_version="v2_"+h,created_at_utc=now.isoformat(),
     due_at_utc=(now+dt.timedelta(hours=1)).isoformat(),reference_price=1,predicted_log_return=.01,
     forecast_class="research_unvalidated",predicted_price=1.01)
   forecasts[h]=dict(forecast=f,status="no_validated_champion",selected_model="ridge",challengers={},baseline_mae=.1)
  snap={"raw":{"collected_at_utc":now.isoformat(),"mexc":{"ticker":{"data":{"lastPrice":"1"}}}},
        "analysis":{"ml_experimental":{},"prediction_report":{"horizons":forecasts}}}
  with tempfile.TemporaryDirectory() as directory,patch.object(audit,"JOURNAL",pathlib.Path(directory)/"journal.jsonl"):
   first=audit.run(copy.deepcopy(snap));self.assertEqual(len(first["ids"]),4)
   modified=copy.deepcopy(snap)
   modified["analysis"]["prediction_report"]["horizons"]["1h"]["forecast"]["predicted_price"]=99
   second=audit.run(modified)
   self.assertEqual(second["ids"],[])
   self.assertEqual(modified["analysis"]["forecast_1h"]["forecast"]["predicted_price"],1.01)
   self.assertEqual(len([r for r in audit.read() if r["event"]=="forecast"]),4)
 def test_correlation_joins_exact_return_times_without_forward_filling(self):
  cs=json.loads((ROOT/"data/candles/1h.json").read_text())[-100:]
  right=cs[:50]+cs[51:]
  report=correlation(cs,right)
  self.assertEqual(report["samples"],97)
  self.assertAlmostEqual(report["coefficient"],1)
 def test_burn_requires_successful_transaction_and_exact_mint(self):
  tx={"meta":{"err":None,"innerInstructions":[{"instructions":[{"program":"spl-token","parsed":{"type":"burnChecked","info":{"mint":CONTRACT,"tokenAmount":{"amount":"100"},"account":"token-account"}}}]}]},"transaction":{"message":{"instructions":[]}}}
  self.assertEqual(burn_instructions(tx)[0]["amount_raw"],"100")
  tx["meta"]["innerInstructions"][0]["instructions"][0]["parsed"]["info"]["mint"]="different-mint"
  self.assertEqual(burn_instructions(tx),[])
  tx["meta"]["err"]={"error":1}
  self.assertEqual(burn_instructions(tx),[])
 def test_public_refresh_does_not_retimestamp_model_or_change_journal_forecast(self):
  now=dt.datetime.now(dt.timezone.utc);hour=int(now.timestamp()*1000)//3600000*3600000
  q={"status":"fresh","retrieved_at_utc":now.isoformat(),"price":1.01,"change_24h_pct":2}
  payload={"observed_utc":"2020-01-01T00:00:00Z","learning":{"at_utc":"2020-01-01T00:00:00Z"},"live_quote":q,"market":{},"candles":{},"forecasts":{"1h":{"forecast":{"predicted_price":5}}}}
  bars=[[hour-3600000,1,1.1,.9,1.01,10]]
  with patch.object(live,"fetch",return_value=(bars,None)),patch.object(live,"dex_overview",return_value={"status":"unavailable"}):
   result=live.refresh(payload)
  self.assertEqual(result["model_observed_utc"],payload["learning"]["at_utc"])
  self.assertEqual(result["forecasts"],payload["forecasts"])
  self.assertEqual(result["archive_observed_utc"],payload["observed_utc"])
  self.assertFalse(result["public_refresh"]["persisted"])

if __name__=="__main__":unittest.main()

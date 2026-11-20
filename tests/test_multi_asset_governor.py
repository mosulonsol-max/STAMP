"""Autonomous multi-asset governance: no premature approval."""
import datetime as dt,pathlib,sys,unittest
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"src"))
import multi_asset_governor as gov
class GovernanceTests(unittest.TestCase):
 def test_settlement_is_bounded_rotates_and_keeps_every_pending_record(self):
  import os
  now=dt.datetime.now(dt.timezone.utc)
  rows=[{"id":str(i),"pair":f"ASSET{i:03}USDT","frame":"1h","reference_at_utc":(now-dt.timedelta(hours=2)).isoformat(),"due_at_utc":(now-dt.timedelta(hours=1)).isoformat(),"reference_price":100,"predicted_price":100,"outcome":None} for i in range(24)]
  with patch.dict(os.environ,{"STAMP_SETTLEMENT_BATCH":"8"}),patch.object(gov,"candles",return_value=[]) as fetch:
   first=gov.reconcile({"records":rows},now=now)
   first_pairs={c.args[0] for c in fetch.call_args_list}
   self.assertEqual(len(first_pairs),8)
   fetch.reset_mock()
   second=gov.reconcile(first,now=now)
   second_pairs={c.args[0] for c in fetch.call_args_list}
  self.assertEqual(len(second_pairs),8)
  self.assertFalse(first_pairs&second_pairs)
  self.assertEqual(len(second["records"]),24)
  self.assertEqual(second["settlement"]["due_pairs"],24)
  self.assertEqual(second["settlement"]["settled_this_cycle"],0)
 def test_compressed_state_roundtrip_preserves_forecasts(self):
  original={"records":[{"id":f"BTCUSDT|1h|{n}","outcome":{"actual_price":0.01*n}} for n in range(1,1001)],"cursor":497,"note":"بيانات حية"}
  payload=gov.encode_state(original)
  self.assertEqual(gov.decode_state(memoryview(payload)),original)
  self.assertLess(len(payload),len(str(original).encode("utf-8")))
 def test_invalid_database_payload_fails_closed(self):
  with self.assertRaises((OSError,ValueError)):
   gov.decode_state(b"not a gzip archive")
 def test_overlapping_workers_merge_unique_records_and_settlements(self):
  older={"loop_updated_at_utc":"2026-11-19T12:00:00+00:00","known_pairs":["BTCUSDT"],
   "records":[{"id":"shared","reference_at_utc":"2026-11-19T11:00:00+00:00","outcome":None},
              {"id":"old-only","reference_at_utc":"2026-11-19T11:01:00+00:00","outcome":None}]}
  newer={"loop_updated_at_utc":"2026-11-19T12:01:00+00:00","known_pairs":["ETHUSDT"],
   "records":[{"id":"shared","reference_at_utc":"2026-11-19T11:00:00+00:00","outcome":{"actual_price":1}},
              {"id":"new-only","reference_at_utc":"2026-11-19T11:02:00+00:00","outcome":None}]}
  with patch.object(gov,"autonomous_review",side_effect=lambda data:data):
   result=gov.merge_state(older,newer)
  self.assertEqual([r["id"] for r in result["records"]],["shared","old-only","new-only"])
  self.assertEqual(result["records"][0]["outcome"],{"actual_price":1})
  self.assertEqual(result["known_pairs"],["BTCUSDT","ETHUSDT"])
  self.assertEqual(result["loop_updated_at_utc"],newer["loop_updated_at_utc"])
 def test_missing_historical_features_are_not_fabricated(self):
  with patch.object(gov,"audit_records",return_value={"passed":True}):
   state=gov.retrain_candidates({"records":[{"pair":"BTCUSDT","frame":"1h","outcome":{"actual_price":100}}]})
  d=state["model_selection_diagnostics"]
  self.assertEqual(d["exclusions"]["missing_features"],1)
  self.assertEqual(d["eligible_samples"],0)
  self.assertEqual(d["max_eligible_per_group"],0)
  self.assertEqual(state["model_selections"],{})
 def test_settled_features_are_grouped_without_premature_promotion(self):
  now=dt.datetime.now(dt.timezone.utc).isoformat()
  rows=[]
  for i in range(39):
   rows.append({"id":str(i),"pair":"BTCUSDT","frame":"1h","reference_at_utc":now,
    "reference_price":100.0,"features":{"recent_returns":[0.001]*20},
    "outcome":{"actual_price":101.0,"baseline_squared_log_error":0.0001}})
  with patch.object(gov,"audit_records",return_value={"passed":True}):
   result=gov.retrain_candidates({"records":rows})
  d=result["model_selection_diagnostics"]
  self.assertEqual(d["eligible_samples"],39)
  self.assertEqual(d["max_eligible_per_group"],39)
  self.assertEqual(d["eligible_groups_ge_40"],0)
  self.assertEqual(d["selected_this_cycle"],0)
  self.assertEqual(result["model_selections"],{})
 def test_empty_journal_has_no_approval(self):
  result=gov.reconcile({"records":[]})
  self.assertEqual(result["approvals"],{})
 def test_unverified_forecast_does_not_become_validated(self):
  now=dt.datetime.now(dt.timezone.utc)
  due=(now-dt.timedelta(hours=1)).isoformat()
  record={"id":"BTCUSDT|1h|test","pair":"BTCUSDT","frame":"1h",
    "reference_at_utc":due,"due_at_utc":due,
    "predicted_price":110.0,"reference_price":100.0,"outcome":None}
  with patch.object(gov,"candles",return_value=[]):
   result=gov.reconcile({"records":[record]},now=now)
  self.assertEqual(result["records"][0]["outcome"],None)
  self.assertEqual(result["approvals"]["BTCUSDT|1h"]["status"],"research_only")
  self.assertEqual(result["approvals"]["BTCUSDT|1h"]["prospective_samples"],0)
 def test_discovery_rotates_without_a_fixed_coin_allowlist(self):
  import tempfile
  universe={"pairs":[f"ASSET{i:03}USDT" for i in range(100)]}
  with tempfile.TemporaryDirectory() as folder:
   with patch.object(gov,"PATH",pathlib.Path(folder)/"journal.json"),patch.object(gov,"universe",return_value=universe),patch.object(gov,"candles",return_value=[]):
    first=gov.cycle()
    second=gov.cycle()
  self.assertEqual(first["coverage"]["discovered"],100)
  self.assertEqual(first["coverage"]["processed_this_cycle"],48)
  self.assertEqual(first["coverage"]["next_cursor"],48)
  self.assertEqual(second["coverage"]["next_cursor"],96)
  self.assertEqual(len(second["known_pairs"]),100)
 def test_pending_forecasts_are_not_silently_pruned(self):
  now=dt.datetime.now(dt.timezone.utc)
  due=(now+dt.timedelta(days=4)).isoformat()
  rows=[{"id":f"BTCUSDT|1h|{i}","pair":"BTCUSDT","frame":"1h","due_at_utc":due,"reference_price":1,"predicted_price":1,"outcome":None} for i in range(1600)]
  result=gov.reconcile({"records":rows},now=now)
  self.assertEqual(len(result["records"]),1600)
if __name__=="__main__":unittest.main()

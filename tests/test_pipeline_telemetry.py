import datetime as dt
import unittest
from unittest.mock import patch
from src import pipeline_telemetry as relay


class TelemetryTests(unittest.TestCase):
 def test_signed_runner_handoff_is_deduplicated_and_queryable(self):
  observed=dt.datetime.now(dt.timezone.utc).isoformat()
  record={"from":"monitor","to":"archive","artifact":"data/latest.json","sha256":"a"*64,"bytes":100,"observed_utc":observed}
  with patch.object(relay,"claims",return_value={"run_id":"43234284958"}):
   first=relay.accept("signed",record)
   again=relay.accept("signed",record)
  self.assertTrue(first["accepted"])
  self.assertTrue(again["duplicate"])
  rows=relay.read(first["sequence"]-1)["events"]
  self.assertEqual(len([r for r in rows if r["sequence"]==first["sequence"]]),1)
  self.assertEqual(rows[-1]["run"],"43234284958")
  self.assertEqual(relay.read(first["sequence"])["events"],[])

 def test_rejects_unmatched_writer_stale_or_invalid_data(self):
  when=dt.datetime.now(dt.timezone.utc).isoformat()
  valid={"from":"monitor","to":"archive","artifact":"data/latest.json","sha256":"a"*64,"bytes":100,"observed_utc":when}
  with patch.object(relay,"claims",return_value={"run_id":"43234284958"}):
   for change in ({"from":"archive"},{"artifact":"data/secret.txt"},{"sha256":"bad"},
                  {"bytes":False},{"observed_utc":"2020-01-01T00:00:00Z"}):
    with self.assertRaises(ValueError):relay.accept("signed",{**valid,**change})


if __name__=="__main__":unittest.main()

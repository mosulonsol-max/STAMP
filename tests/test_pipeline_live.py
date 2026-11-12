import unittest
from unittest.mock import patch
from src import pipeline_live


class PipelineLiveTests(unittest.TestCase):
 def test_active_stage_reports_only_real_job_state(self):
  run={"workflow_runs":[{"id":321,"status":"in_progress","conclusion":None}]}
  jobs={"jobs":[{"steps":[{"name":"Acquire snapshot and analyze","status":"completed","conclusion":"success","started_at":"2026-11-12T10:00:00Z"},
                             {"name":"Archive completed candles before evaluating forecast outcomes","status":"in_progress","conclusion":None,"started_at":"2026-11-12T10:01:00Z"}]}]}
  with patch.object(pipeline_live,"get",side_effect=[run,jobs]),patch.object(pipeline_live,"read_latest",return_value=None):
   state=pipeline_live.read_state()
  self.assertEqual(state["status"],"in_progress")
  self.assertEqual(state["stages"]["archive"]["status"],"in_progress")
  self.assertEqual(state["stages"]["monitor"]["conclusion"],"success")
  self.assertIsNone(state["latest"])

 def test_error_is_explicit_and_does_not_invent_motion(self):
  with patch.object(pipeline_live,"get",side_effect=OSError("upstream")):
   state=pipeline_live.read_state()
  self.assertEqual(state["status"],"unavailable")
  self.assertEqual(state["archive_status"],"unavailable")
  self.assertNotIn("stages",state)


if __name__=="__main__":unittest.main()

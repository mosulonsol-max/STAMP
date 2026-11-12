"""Regression guards for the Nexus production network animation."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class NexusAnimationTests(unittest.TestCase):
    def test_packets_require_recent_observed_events(self):
        script = (ROOT / "dashboard" / "nexus.js").read_text(encoding="utf-8")
        self.assertNotIn("if(live&&a<7)", script)
        self.assertNotIn("t/2600", script)
        self.assertNotIn("t*.00016", script)
        self.assertIn("for(const ev of traceEvents)", script)
        self.assertIn("recent?performance.now():-Infinity", script)

    def test_production_html_references_new_asset_revision(self):
        html = (ROOT / "dashboard" / "nexus.html").read_text(encoding="utf-8")
        self.assertIn("/assets/nexus.js?v=20261111r27", html)

if __name__ == "__main__":
    unittest.main()

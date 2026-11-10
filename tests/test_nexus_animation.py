"""Regression guards for the Nexus production network animation."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class NexusAnimationTests(unittest.TestCase):
    def test_live_quote_particles_are_not_disabled(self):
        script = (ROOT / "dashboard" / "nexus.js").read_text(encoding="utf-8")
        self.assertNotIn("if(false&&live&&a<7)", script)
        self.assertIn("if(live&&a<7)", script)
        self.assertIn("requestAnimationFrame(draw)", script)

    def test_production_html_references_new_asset_revision(self):
        html = (ROOT / "dashboard" / "nexus.html").read_text(encoding="utf-8")
        self.assertIn("/assets/nexus.js?v=20261111r27", html)

if __name__ == "__main__":
    unittest.main()

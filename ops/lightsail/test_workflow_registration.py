"""Offline checks that preserved automation source does not register authority."""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]


class InactiveAutomationTests(unittest.TestCase):
    def test_merge_template_is_outside_registered_workflows(self):
        self.assertTrue((ROOT / "ops/lightsail/auto-fix.workflow.example.yml").is_file())
        self.assertFalse((ROOT / ".github/workflows/auto-fix.yml").exists())
        registered = ROOT / ".github/workflows"
        self.assertEqual({p.name for p in registered.iterdir() if p.suffix in {".yml", ".yaml"}},
                         {"ci.yml", "publish-containers.yml"})
        for path in registered.iterdir():
            if path.suffix not in {".yml", ".yaml"}:
                continue
            with self.subTest(workflow=path.name):
                text = path.read_text()
                self.assertNotIn("pull_request_target:", text)
                self.assertNotIn("workflow_run:", text)
                self.assertNotRegex(text, r"qa_policy\.py|auto_release\.py|install-automation|systemctl|auto-fix\.workflow\.example")
                self.assertNotRegex(text, r"(?m)^\s*permissions:\s*write-all\s*$")
                self.assertNotRegex(text, r"(?m)^\s*(contents|issues|actions|pull-requests|checks|id-token):\s*write\s*$")
                self.assertRegex(text, r"(?m)^permissions:\s*\n\s+contents:\s*read\s*$")

    def test_routine_release_does_not_install_or_activate_optional_automation(self):
        # The existing publisher must not invoke the root installer/poller/timer.
        publisher = (ROOT / "ops/lightsail/release.ps1").read_text()
        self.assertIsNone(re.search(r"install-automation|auto_release|qa_policy|systemctl",
                                   publisher, re.IGNORECASE))


if __name__ == "__main__":
    unittest.main()

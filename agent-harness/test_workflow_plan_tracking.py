"""The harness must reject a saved clinic plan absent from the tracker."""

from pathlib import Path
import runpy
import tempfile
import unittest


CHECK = runpy.run_path(str(Path(__file__).resolve().parents[1] / "bin" / "verify-agent-harness"))[
    "check_clinic_workflow_plan_tracking"
]


class WorkflowPlanTrackingTest(unittest.TestCase):
    def test_tracker_link_is_required(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = root / "docs/development/clinic-workflow-plans/example.md"
            tracker = root / "APPlyVault/03 Execution/Meta Clinic Implementation Tracker.md"
            plan.parent.mkdir(parents=True)
            tracker.parent.mkdir(parents=True)
            plan.write_text("# Example\n", encoding="utf-8")
            tracker.write_text("# Tracker\n", encoding="utf-8")

            errors = []
            self.assertEqual(CHECK(root, errors), 1)
            self.assertEqual(len(errors), 1)
            self.assertIn("missing Markdown link", errors[0])

            tracker.write_text(
                "[Example](../../docs/development/clinic-workflow-plans/example.md)\n",
                encoding="utf-8",
            )
            errors = []
            self.assertEqual(CHECK(root, errors), 1)
            self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()

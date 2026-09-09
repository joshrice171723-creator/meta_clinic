"""Offline contract tests for the staging delivery trigger and source revision."""
from pathlib import Path
import re
import unittest


WORKFLOW = Path(__file__).resolve().parents[3] / ".github" / "workflows" / "deploy-staging.yml"


class DeployWorkflowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text()

    def test_staging_delivery_is_manual_only(self):
        self.assertIn("  workflow_dispatch:\n", self.workflow)
        for automatic_trigger in ("workflow_run", "push", "schedule"):
            self.assertIsNone(
                re.search(rf"^  {automatic_trigger}:\s*$", self.workflow, re.MULTILINE),
                f"Unexpected automatic staging trigger: {automatic_trigger}",
            )

    def test_manual_request_is_guarded_before_aws_authentication(self):
        validation = self.workflow.index("- name: Validate manual staging request")
        authentication = self.workflow.index("- uses: aws-actions/configure-aws-credentials@")
        self.assertLess(validation, authentication)
        self.assertIn('CONFIRM: ${{ inputs.confirm }}', self.workflow)
        self.assertIn('test "$SOURCE_REF" = "refs/heads/main"', self.workflow)
        self.assertIn('test "$CONFIRM" = "deploy-staging"', self.workflow)

    def test_checkout_and_release_use_dispatched_main_sha(self):
        self.assertIn("ref: ${{ github.sha }}", self.workflow)
        self.assertIn("SOURCE_SHA: ${{ github.sha }}", self.workflow)
        self.assertNotIn("github.event.workflow_run", self.workflow)


if __name__ == "__main__":
    unittest.main()

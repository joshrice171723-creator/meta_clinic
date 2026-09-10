"""Offline release-readiness checks; no AWS, Docker or credentials."""

import importlib.util
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "release_readiness", Path(__file__).with_name("release_readiness.py")
)
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class ReleaseReadinessTest(unittest.TestCase):
    def test_current_checkout_passes_without_external_services(self):
        self.assertEqual(CHECK.run(ROOT), [])

    def test_secret_scanner_rejects_high_confidence_material(self):
        entries = [
            ("fixture.txt", "-----BEGIN " + "RSA PRIVATE KEY-----\nsynthetic\n"),
            ("other.txt", "AKIA" + "1234567890ABCDEF"),
            ("token.txt", "github_" + "pat-abcdefghijklmnopqrstuv"),
        ]
        findings = CHECK.secret_findings(entries)
        self.assertEqual(3, len(findings))

    def test_secret_scanner_ignores_documented_placeholders(self):
        entries = [("README.md", "<secret> disposable-ci-only fixture-only-password")]
        self.assertEqual([], CHECK.secret_findings(entries))

    def test_missing_release_gate_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".github" / "workflows").mkdir(parents=True)
            (root / "apps" / "api" / "config" / "environments").mkdir(parents=True)
            (root / "apps" / "web").mkdir(parents=True)
            (root / "ops" / "aws" / "ec2").mkdir(parents=True)
            for path in (
                ".github/workflows/ci.yml",
                ".github/workflows/deploy-staging.yml",
                ".github/workflows/promote-production.yml",
                "apps/api/Dockerfile",
                "apps/api/config/routes.rb",
                "apps/api/config/environments/production.rb",
                "apps/web/Dockerfile",
                "apps/web/nginx.conf",
                "ops/aws/ec2/apply-clinic-worker.service",
                "ops/aws/ec2/apply-run.sh",
                "ops/aws/ec2/install-release.sh",
                "ops/aws/ec2/postgres.sh",
                "ops/aws/ec2/render-ssm-command.py",
                "ops/aws/ec2/verify-container.py",
            ):
                (root / path).write_text("", encoding="utf-8")
            self.assertTrue(CHECK.run(root))

    def test_worker_contract_rejects_missing_lifecycle_and_failure_gates(self):
        errors = []
        CHECK.check_worker_contract_text(
            "[Service]\nExecStart=/usr/local/sbin/apply-run worker\n",
            "systemctl enable --now apply-clinic-worker.service\n",
            "files = {}\n",
            errors,
        )
        self.assertTrue(any("worker lifecycle binding" in error for error in errors))
        self.assertTrue(any("worker restart policy" in error for error in errors))
        self.assertTrue(any("worker stopped before migration" in error for error in errors))
        self.assertTrue(any("worker failure handling" in error for error in errors))


if __name__ == "__main__":
    unittest.main()

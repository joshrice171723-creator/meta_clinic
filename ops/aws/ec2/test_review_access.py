"""Review configuration boundaries without AWS, credentials or host changes."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import review_access


ROOT = Path(__file__).resolve().parent


class ReviewAccessTest(unittest.TestCase):
    def test_rejects_nonpublic_or_injected_addresses(self):
        for value in ("127.0.0.1", "10.0.0.1", "::1", "example.com", "8.8.8.8:443",
                      "8.8.8.8; return 200;", "8.8.8.8\ninclude bad;", "0.0.0.0"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                review_access.render(value, "active")

    def prepare(self, directory, environment, origin):
        source = (ROOT / "apply-run.sh").read_text().split("python3 - <<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
        review = directory / "review-origin"
        runtime = directory / "runtime.env"
        if origin is not None:
            review.write_text(origin)
        source = source.replace("'/etc/apply/review-origin'", repr(str(review)))
        source = source.replace("'/run/apply/runtime.env'", repr(str(runtime)))
        env = {"APPLY_ENVIRONMENT": environment}
        env.update({key: "test-reference" for key in (
            "APPLY_SESSION_SECRET", "APPLY_ENCRYPTION_SECRET", "APPLY_DETERMINISTIC_SECRET",
            "APPLY_SALT_SECRET", "APPLY_DATABASE_RUNTIME_SECRET")})
        result = subprocess.CompletedProcess([], 0, json.dumps({"SecretString": "A" * 64}), "")
        with patch.dict(os.environ, env, clear=True), patch("subprocess.run", return_value=result) as aws:
            try:
                exec(compile(source, "runtime-preparation", "exec"), {})
            except SystemExit:
                self.assertFalse(aws.called, "Invalid origin must fail before accessing secrets")
                self.assertFalse(runtime.exists())
                raise
        self.assertEqual(0o600, runtime.stat().st_mode & 0o777)
        return dict(line.split("=", 1) for line in runtime.read_text().splitlines())

    def test_default_keeps_both_environments_private(self):
        for environment in ("staging", "production"):
            with tempfile.TemporaryDirectory() as scratch:
                values = self.prepare(Path(scratch), environment, None)
                self.assertEqual("https://localhost:8443", values["APP_SITE_ORIGIN"])
                self.assertEqual("production", values["RAILS_ENV"])
                self.assertEqual("0", values["APP_DEVELOPMENT_LOGIN"])

    def test_only_exact_staging_https_ip_can_be_enabled(self):
        with tempfile.TemporaryDirectory() as scratch:
            values = self.prepare(Path(scratch), "staging", "https://8.8.8.8\n")
            self.assertEqual("https://8.8.8.8", values["APP_SITE_ORIGIN"])
            self.assertEqual("0", values["APP_DEVELOPMENT_LOGIN"])
        for environment, origin in (("production", "https://8.8.8.8"),
                                    ("staging", "http://8.8.8.8"),
                                    ("staging", "https://8.8.8.8/path"),
                                    ("staging", "https://8.8.8.8\nINJECTED=value"),
                                    ("staging", "https://127.0.0.1")):
            with self.subTest(environment=environment, origin=origin):
                with tempfile.TemporaryDirectory() as scratch, self.assertRaises(SystemExit):
                    self.prepare(Path(scratch), environment, origin)


if __name__ == "__main__":
    unittest.main()

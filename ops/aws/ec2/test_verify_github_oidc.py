"""Checks for the staging GitHub OIDC identity preflight."""

import base64
import importlib.util
import json
from pathlib import Path
import unittest


SCRIPT = Path(__file__).with_name("verify-github-oidc.py")
SPEC = importlib.util.spec_from_file_location("verify_github_oidc", SCRIPT)
OIDC = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OIDC)


def token(payload):
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return "header." + encoded + ".signature"


class VerifyGitHubOidcTest(unittest.TestCase):
    def claims(self):
        return {
            **OIDC.EXPECTED,
            "sub": OIDC.EXPECTED_SUBJECT,
            "sha": "a" * 40,
        }

    def test_decodes_and_accepts_exact_staging_identity(self):
        claims = OIDC.decode_claims(token(self.claims()))
        self.assertEqual(OIDC.EXPECTED_SUBJECT, OIDC.verify_claims(claims, "a" * 40))

    def test_rejects_each_identity_boundary(self):
        for field in (*OIDC.EXPECTED, "sub", "sha"):
            with self.subTest(field=field):
                claims = self.claims()
                claims[field] = "wrong"
                with self.assertRaisesRegex(RuntimeError, field):
                    OIDC.verify_claims(claims, "a" * 40)

    def test_rejects_malformed_token(self):
        with self.assertRaisesRegex(RuntimeError, "malformed"):
            OIDC.decode_claims("not-a-jwt")


if __name__ == "__main__":
    unittest.main()

"""Offline release-pair contract tests. No AWS calls, credentials or Docker operations."""
import copy
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release_pair", Path(__file__).with_name("release.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleasePairTest(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(Path(__file__).with_name("targets.json").read_text())
        self.api, self.web = "sha256:" + "a" * 64, "sha256:" + "b" * 64
        registry = f'{self.config["account"]}.dkr.ecr.us-east-1.amazonaws.com'
        staging_images = {
            "api": f'{registry}/{self.config["staging"]["repository"]}@{self.api}',
            "web": f'{registry}/{self.config["staging"]["repository"]}@{self.web}',
        }
        self.receipt = {
            "format": 2, "sha": "c" * 40, "tag": "synthetic-check",
            "images": {"api": self.api, "web": self.web}, "generation": "12301",
            "host_attestation": {
                "format": 1, "generation": 12301, "images": staging_images,
                "state": {"format": 1, "environment": "staging", "state_fingerprint": "d" * 64},
            },
        }

    def aws(self, *args):
        if args[:2] == ("sts", "get-caller-identity"):
            return {"Account": self.config["account"]}
        if args[:2] == ("ssm", "get-parameter"):
            return {"Parameter": {"Value": json.dumps(self.receipt)}}
        if args[:2] == ("ecr", "describe-images"):
            if "--image-ids" in args:
                return {"imageDetails": [{"imageDigest": self.web if args[-1].endswith("-web") else self.api}]}
            return {"imageDetails": []}
        if args[:2] == ("ssm", "put-parameter"):
            return {}
        raise AssertionError("Unexpected external operation in release test")

    def run_release(self, arguments):
        findings = {"findingSeverityCounts": {}, "imageScanCompletedAt": datetime.now(timezone.utc).isoformat()}
        def deployed(_target, api_image, web_image, generation, environment):
            attestation = {"format": 1, "generation": int(generation), "images": {"api": api_image, "web": web_image}}
            if environment == "staging":
                attestation["state"] = {"format": 1, "environment": "staging", "state_fingerprint": "e" * 64}
            else:
                attestation["environment"] = environment
            return "synthetic-command", attestation
        with patch.object(sys, "argv", ["release.py", *arguments]), patch.dict(os.environ, {"GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1"}, clear=True), patch.object(release, "aws", side_effect=self.aws) as aws, patch.object(release, "command") as command, patch.object(release, "scan", return_value=findings) as scan, patch.object(release, "deploy", return_value="synthetic-command") as deploy:
            deploy.side_effect = deployed
            release.main()
            return aws, command, scan, deploy

    def test_production_promotes_both_reviewed_digests_without_building(self):
        aws, command, scan, deploy = self.run_release(["production", "--expected-digest", self.api, "--expected-web-digest", self.web])
        self.assertEqual(2, scan.call_count)
        self.assertEqual(1, deploy.call_count)
        self.assertTrue(deploy.call_args.args[1].endswith(self.api))
        self.assertTrue(deploy.call_args.args[2].endswith(self.web))
        self.assertNotIn("build", str(command.call_args_list))
        saved = [call for call in aws.call_args_list if call.args[:2] == ("ssm", "put-parameter")]
        self.assertEqual(2, len(saved))
        self.assertEqual('/apply/releases/production/12301', saved[0].args[saved[0].args.index('--name') + 1])
        self.assertNotIn('--overwrite', saved[0].args)
        self.assertEqual(self.receipt["images"], json.loads(saved[0].args[-1])["images"])

    def test_one_changed_digest_blocks_the_entire_pair_before_deployment(self):
        for api, web in [(self.api, "sha256:" + "d" * 64), ("sha256:" + "e" * 64, self.web)]:
            with self.assertRaisesRegex(RuntimeError, "pair changed"):
                self.run_release(["production", "--expected-digest", api, "--expected-web-digest", web])

    def test_legacy_single_image_receipt_is_not_silently_promoted(self):
        self.receipt = {"sha": "c" * 40, "tag": "legacy", "digest": self.api}
        with self.assertRaisesRegex(RuntimeError, "legacy releases"):
            self.run_release(["production", "--expected-digest", self.api, "--expected-web-digest", self.web])

    def test_staging_receipt_without_matching_host_attestation_is_not_promoted(self):
        self.receipt.pop("host_attestation")
        with self.assertRaisesRegex(RuntimeError, "host attestation"):
            self.run_release(["production", "--expected-digest", self.api, "--expected-web-digest", self.web])

    def test_staging_records_one_pair_from_the_same_source_tag(self):
        _, command, scan, deploy = self.run_release(["staging", "--sha", "c" * 40, "--tag", "synthetic-check"])
        self.assertEqual(2, scan.call_count)
        self.assertEqual(1, deploy.call_count)
        self.assertEqual("staging", deploy.call_args.args[4])
        command.assert_not_called()

    def test_high_or_stale_scans_still_block_promotion(self):
        with self.assertRaises(RuntimeError):
            release.approve_scan({"findingSeverityCounts": {"HIGH": 1}, "imageScanCompletedAt": datetime.now(timezone.utc).isoformat()})
        with self.assertRaises(RuntimeError):
            release.approve_scan({"findingSeverityCounts": {}, "imageScanCompletedAt": "2000-01-01T00:00:00+00:00"})


if __name__ == "__main__":
    unittest.main()

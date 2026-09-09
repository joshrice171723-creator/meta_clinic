"""Configuration contract tests; all GitHub/AWS requests are mocked."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("configure_delivery", Path(__file__).with_name("configure-delivery.py"))
configure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configure)


class ConfigureDeliveryTest(unittest.TestCase):
    def setUp(self):
        self.config = json.loads(Path(__file__).with_name("targets.json").read_text())
        self.actions = ["Add", "Add", "Add"]

    def github(self, path, **kwargs):
        if path == "":
            return {"permissions": {"admin": True}, "owner": {"login": "Synthetic", "id": 1}, "name": "Example", "id": 2}
        if path == "actions/oidc/customization/sub":
            return {"use_default": True, "use_immutable_subject": False, "sub_claim_prefix": "repo:Synthetic/Example"}
        raise AssertionError("Staging-only setup must not access production settings")

    def aws(self, *args, **kwargs):
        if args[:2] == ("sts", "get-caller-identity"):
            return {"Account": self.config["account"]}
        if args[:2] == ("cloudformation", "describe-stacks"):
            return None
        if args[:2] == ("cloudformation", "create-change-set"):
            parameters = json.loads(args[args.index("--parameters") + 1])
            self.assertIn({"ParameterKey": "EnableProduction", "ParameterValue": "false"}, parameters)
            return {"Id": "synthetic-change"}
        if args[:2] == ("cloudformation", "describe-change-set"):
            return {"Status": "CREATE_COMPLETE", "Changes": [
                {"ResourceChange": {"Action": action, "LogicalResourceId": name}}
                for action, name in zip(self.actions, ("GitHubIdentity", "ReleaseCommand", "StagingRole"))
            ]}
        if args[:2] == ("cloudformation", "execute-change-set"):
            return {}
        raise AssertionError("Unexpected AWS operation")

    def run_setup(self, apply=False):
        arguments = ["configure-delivery.py", "--staging-only", *(["--apply"] if apply else [])]
        with patch.object(sys, "argv", arguments), patch.object(configure, "github", side_effect=self.github), \
                patch.object(configure, "run", side_effect=AssertionError("Unexpected external operation")), \
                patch.object(configure, "aws", side_effect=self.aws) as aws:
            configure.main()
            return aws

    def test_staging_preflight_is_read_only_and_skips_production(self):
        aws = self.run_setup()
        self.assertEqual(1, aws.call_count)

    def test_repository_endpoint_has_no_trailing_slash(self):
        with patch.object(configure, 'run', return_value={}) as run:
            configure.github('')
            self.assertEqual('repos/joshrice171723-creator/meta_clinic', run.call_args.args[0][-1])

    def test_immutable_default_does_not_require_explicit_opt_in(self):
        oidc = {"use_default": True, "use_immutable_subject": False,
                "sub_claim_prefix": "repo:Synthetic@1/Example@2"}
        self.assertEqual(oidc['sub_claim_prefix'], configure.subject_prefix(self.github(''), oidc))

    def test_missing_or_foreign_subject_prefix_fails_closed(self):
        for prefix in (None, 'repo:Other/Repository', 'repo:Synthetic@1/Example@999', '*'):
            with self.subTest(prefix=prefix), self.assertRaises(RuntimeError):
                configure.subject_prefix(self.github(''), {'sub_claim_prefix': prefix})

    def test_staging_apply_disables_production_resources_and_skips_its_controls(self):
        aws = self.run_setup(apply=True)
        self.assertEqual(1, sum(call.args[:2] == ("cloudformation", "execute-change-set") for call in aws.call_args_list))

    def test_existing_resource_changes_are_not_executed(self):
        self.actions[2] = "Modify"
        with self.assertRaisesRegex(RuntimeError, "Existing delivery resources would change"):
            self.run_setup(apply=True)


if __name__ == "__main__":
    unittest.main()

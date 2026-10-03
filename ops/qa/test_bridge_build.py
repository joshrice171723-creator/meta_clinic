"""Build provenance regressions using a fake carrier; no network or credentials."""
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import bridge


class FakeClient:
    def __init__(self, builds):
        self.builds = iter(builds)
        self.requests = []

    def build(self):
        value = next(self.builds)
        if isinstance(value, Exception):
            raise value
        return value

    def request(self, path, method="GET", payload=None):
        self.requests.append((path, method, payload))
        return {"recorded": True}


class BuildObservationTest(unittest.TestCase):
    def test_distinct_observations_have_distinct_keys_and_keep_prior_payload(self):
        client = FakeClient([{"revision": "a" * 40}, {"revision": "b" * 40}])
        args = SimpleNamespace(revision="a" * 40, kind="finding", summary="Synthetic finding")
        with patch.object(bridge, "authenticated", return_value=client), patch.object(bridge, "print_json"), \
                patch.object(bridge, "now", side_effect=["2031-01-01T00:00:00Z", "2031-01-01T00:01:00Z"]):
            bridge.command_event(args)
            bridge.command_event(args)
        first, second = [request[2]["event"] for request in client.requests]
        self.assertNotEqual(first["event_key"], second["event_key"])
        self.assertEqual("a" * 40, first["payload"]["build_observation"]["revision"])
        self.assertEqual("2031-01-01T00:00:00Z", first["payload"]["build_observation"]["observed_at"])
        self.assertEqual("b" * 40, second["payload"]["build_observation"]["revision"])

    def test_event_automatically_stamps_observed_build_without_pin(self):
        client = FakeClient([{"revision": "a" * 40, "version": "synthetic", "dirty": False}])
        args = SimpleNamespace(revision=None, kind="finding", summary="Synthetic finding")
        with patch.object(bridge, "authenticated", return_value=client), patch.object(bridge, "print_json"):
            bridge.command_event(args)
        event = client.requests[0][2]["event"]
        self.assertEqual("a" * 40, event["revision"])
        observation = event["payload"]["build_observation"]
        self.assertEqual("a" * 40, observation["revision"])
        self.assertEqual("observed", observation["status"])
        self.assertTrue(observation["observed_at"].endswith("Z"))

    def test_missing_and_failed_metadata_are_explicit_and_do_not_block_findings(self):
        for metadata in ({}, {"revision": "short"}, RuntimeError("synthetic unavailable")):
            with self.subTest(metadata=type(metadata).__name__):
                client = FakeClient([metadata])
                with patch.object(bridge, "authenticated", return_value=client), patch.object(bridge, "print_json"):
                    bridge.command_event(SimpleNamespace(revision=None, kind="finding", summary="Synthetic finding"))
                event = client.requests[0][2]["event"]
                self.assertEqual("unobserved", event["revision"])
                self.assertIsNone(event["payload"]["build_observation"]["revision"])
                self.assertEqual("unavailable", event["payload"]["build_observation"]["status"])

    def test_stale_reported_revision_is_preserved_with_current_observation(self):
        client = FakeClient([{"revision": "b" * 40}])
        with patch.object(bridge, "authenticated", return_value=client), patch.object(bridge, "print_json"):
            bridge.command_event(SimpleNamespace(revision="a" * 40, kind="finding", summary="Synthetic older finding"))
        event = client.requests[0][2]["event"]
        self.assertEqual("a" * 40, event["revision"])
        observation = event["payload"]["build_observation"]
        self.assertEqual("b" * 40, observation["revision"])
        self.assertEqual("deployment_changed", observation["boundary"])

    def test_deployment_mid_run_continues_and_does_not_relabel_prior_evidence(self):
        client = FakeClient([{"revision": revision * 40} for revision in ("b", "c", "d")])
        with tempfile.TemporaryDirectory() as directory:
            result_file = Path(directory) / "result.json"
            result_file.write_text(json.dumps({"summary": "Synthetic result", "build_before": {"revision": "a" * 40},
                                               "defects": [{"id": 1, "revision": "a" * 40, "evidence_refs": [17]}]}), encoding="utf-8")
            args = SimpleNamespace(id=7, run_id="synthetic-run", prepare_baseline=False, result=str(result_file))
            with patch.object(bridge, "authenticated", return_value=client), patch.object(bridge, "print_json"):
                bridge.command_transition(args, "completed")
        self.assertEqual(1, len(client.requests))
        submitted = client.requests[0][2]
        self.assertEqual("completed", submitted["status"])
        result = submitted["result"]
        self.assertEqual("a" * 40, result["build_before"]["revision"])
        self.assertEqual("c" * 40, result["build_submission"]["revision"])
        self.assertEqual("deployment_changed", result["build_boundary"])
        self.assertEqual("a" * 40, result["defects"][0]["revision"])
        self.assertEqual([17], result["defects"][0]["evidence_refs"])

    def test_missing_mid_run_metadata_continues_without_inventing_revision(self):
        client = FakeClient([{}, RuntimeError("synthetic unavailable"), {}])
        args = SimpleNamespace(id=7, run_id="synthetic-run", prepare_baseline=False, result=None)
        with patch.object(bridge, "authenticated", return_value=client), patch.object(bridge, "print_json"):
            bridge.command_transition(args, "claimed")
        submitted = client.requests[0][2]
        self.assertEqual("claimed", submitted["status"])
        self.assertEqual("unobserved", submitted["revision"])
        self.assertEqual("metadata_unavailable", submitted["result"]["build_boundary"])


if __name__ == "__main__":
    unittest.main()

"""Existing carrier HTTP contract over an isolated loopback fixture, never the live room."""
import json
import os
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
from threading import Thread
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import bridge


@contextmanager
def fixture_server(respond):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def handle_request(self):
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length)) if length else None
            request = {"method": self.command, "path": self.path,
                       "authorization": self.headers.get("Authorization"), "body": body}
            requests.append(request)
            status, payload = respond(request)
            data = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        do_GET = handle_request
        do_POST = handle_request

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with patch.object(bridge, "BASE_URL", "http://127.0.0.1:%s" % server.server_port):
            yield requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


class RoomExchangeTransportContractTest(unittest.TestCase):
    def test_public_poll_uses_explicit_cursor_and_preserves_empty_page_receipt(self):
        def respond(request):
            cursor = int(parse_qs(urlsplit(request["path"]).query)["after_id"][0])
            return 200, {"messages": [], "next_cursor": cursor, "has_more": False,
                         "can_post": False, "access": "public_read_owner_or_existing_qa_token_write"}

        with fixture_server(respond) as requests, patch.dict(os.environ, {}, clear=True), patch.object(bridge, "print_json") as output:
            bridge.command_room(SimpleNamespace(after_id=0))
            bridge.command_room(SimpleNamespace(after_id=42))
        self.assertEqual(["/api/qa/room?after_id=0", "/api/qa/room?after_id=42"], [item["path"] for item in requests])
        self.assertTrue(all(item["method"] == "GET" and item["body"] is None and item["authorization"] is None for item in requests))
        self.assertEqual(42, output.call_args.args[0]["next_cursor"])
        self.assertFalse(output.call_args.args[0]["can_post"])

    def test_explicit_carrier_reply_reuses_exact_post_schema_and_key(self):
        receipt = {"id": 43, "thread_id": 42, "delivery": "persisted", "message": {
            "agent": "Muse", "recipient": "Dot", "reply_to": 42, "correlation_nonce": "synthetic_contract_nonce"}}
        with tempfile.TemporaryDirectory() as directory:
            body_file = Path(directory) / "synthetic-reply.txt"
            body_file.write_text("Synthetic nonce acknowledgment; no workflow run", encoding="utf-8")
            args = SimpleNamespace(message_key="synthetic-contract-reply", agent="Muse", recipient="Dot", body_file=str(body_file),
                                   reference_revision="a" * 40, case_reference=None, reply_to=42, correlation_nonce="synthetic_contract_nonce")
            # Opaque fixture value is not a issued/valid QA credential. No live identity or token exists.
            with fixture_server(lambda _request: (201, receipt)) as requests, patch.dict(os.environ, {"QA_SERVICE_TOKEN": "fixture-only-not-issued"}, clear=True), patch.object(bridge, "print_json") as output:
                bridge.command_message(args)
                bridge.command_message(args)
        self.assertEqual(2, len(requests))
        self.assertEqual(requests[0], requests[1])
        self.assertEqual("/api/qa/room/messages", requests[0]["path"])
        self.assertEqual("POST", requests[0]["method"])
        self.assertEqual("Bearer fixture-only-not-issued", requests[0]["authorization"])
        self.assertEqual({"message": {"message_key": "synthetic-contract-reply", "agent": "Muse", "recipient": "Dot",
                                    "body": "Synthetic nonce acknowledgment; no workflow run", "reference_revision": "a" * 40,
                                    "reply_to": 42, "correlation_nonce": "synthetic_contract_nonce"}}, requests[0]["body"])
        self.assertEqual([receipt, receipt], [call.args[0] for call in output.call_args_list])

    def test_uncertain_send_never_replays_itself_or_prints_a_success_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            body_file = Path(directory) / "synthetic-reply.txt"
            body_file.write_text("Synthetic uncertain acknowledgment", encoding="utf-8")
            args = SimpleNamespace(message_key="synthetic-uncertain-reply", agent="Muse", recipient="Dot", body_file=str(body_file),
                                   reference_revision=None, case_reference=None, reply_to=42, correlation_nonce="synthetic_contract_nonce")
            with fixture_server(lambda _request: (503, {"error": "Synthetic response unavailable"})) as requests, patch.dict(os.environ, {"QA_SERVICE_TOKEN": "fixture-only-not-issued"}, clear=True), patch.object(bridge, "print_json") as output:
                with self.assertRaisesRegex(RuntimeError, "503 /api/qa/room/messages"):
                    bridge.command_message(args)
                self.assertEqual(1, len(requests))
                output.assert_not_called()
                self.assertEqual("synthetic-uncertain-reply", args.message_key)

    def test_denied_public_writer_does_not_become_an_acknowledgment(self):
        with fixture_server(lambda _request: (401, {"error": "Synthetic writer authentication required"})) as requests, patch.dict(os.environ, {}, clear=True):
            client = bridge.Client(require_token=False)
            with self.assertRaisesRegex(RuntimeError, "401 /api/qa/room/messages"):
                client.request("/api/qa/room/messages", "POST", {"message": {
                    "message_key": "synthetic-denied", "agent": "Muse", "recipient": "Dot", "body": "Synthetic label-only reply"}})
        self.assertEqual(1, len(requests))
        self.assertIsNone(requests[0]["authorization"])


if __name__ == "__main__":
    unittest.main()

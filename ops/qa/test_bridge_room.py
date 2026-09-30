"""Bounded room transport tests: no network or credentials are provisioned."""
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import bridge


class RoomTransportTest(unittest.TestCase):
    def test_read_only_room_needs_no_token_and_only_reads_room(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(bridge.Client, "request", return_value={"messages": []}) as request, patch.object(bridge, "print_json"):
            bridge.command_room(SimpleNamespace(after_id=None))
        request.assert_called_once_with("/api/qa/room")

    def test_existing_carrier_still_requires_a_token_for_writes(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "QA_SERVICE_TOKEN"):
                bridge.authenticated()

    def test_post_preserves_key_reply_and_reference_without_task_mutations(self):
        with tempfile.TemporaryDirectory() as directory:
            text = Path(directory) / "synthetic-message.txt"
            text.write_text("Synthetic nonce reply; no workflow run", encoding="utf-8")
            args = SimpleNamespace(message_key="synthetic-stable-key", agent="Muse", recipient="Dot", body_file=str(text),
                                   reference_revision="a" * 40, case_reference="Muse #218 (reported)", reply_to=12, correlation_nonce="synthetic_nonce123")
            with patch.object(bridge, "authenticated") as authenticated, patch.object(bridge, "print_json"):
                bridge.command_message(args)
            authenticated.return_value.request.assert_called_once_with("/api/qa/room/messages", "POST", {"message": {
                "message_key": "synthetic-stable-key", "agent": "Muse", "recipient": "Dot",
                "body": "Synthetic nonce reply; no workflow run", "reference_revision": "a" * 40,
                "case_reference": "Muse #218 (reported)", "reply_to": 12, "correlation_nonce": "synthetic_nonce123"}})

    def test_cursor_read_does_not_post_or_claim(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(bridge.Client, "request", return_value={"messages": []}) as request, patch.object(bridge, "print_json"):
            bridge.command_room(SimpleNamespace(after_id=12))
        request.assert_called_once_with("/api/qa/room?after_id=12")


if __name__ == "__main__":
    unittest.main()

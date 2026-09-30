#!/usr/bin/env python3
"""Offline, disposable credential/transport checks: python bin/office-client-check.py."""
import importlib.util
import os
from pathlib import Path
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("office_client", Path(__file__).with_name("office-client.py"))
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)

class Response:
    def __enter__(self): return self
    def __exit__(self, *_args): pass
    def read(self, limit):
        assert limit == 1_000_001
        return b'{"stored":true}'

class Transport:
    def open(self, request, timeout):
        assert request.full_url == "https://aimetaclinic.com/api/qa/office/work"
        assert request.get_header("Authorization") == "Bearer qa_" + "x" * 43
        assert timeout == 8
        return Response()

with tempfile.TemporaryDirectory(prefix="office-client-check-") as directory:
    credential = Path(directory) / "disposable"
    credential.write_text("qa_" + "x" * 43)
    credential.chmod(0o600)
    with patch.dict(os.environ, {"OFFICE_TOKEN_FILE": str(credential)}), patch.object(client.urllib.request, "build_opener", return_value=Transport()):
        assert client.call("/api/qa/office/work") == {"stored": True}
        for path in ("/api/qa/pin", "/api/qa/events", "https://elsewhere.invalid", "/api/qa/office/../pin"):
            try: client.call(path)
            except ValueError: pass
            else: raise AssertionError("unexpected route accepted")
        credential.write_text("invalid")
        try: client.call("/api/qa/office/work")
        except ValueError: pass
        else: raise AssertionError("invalid credential accepted")
    try: client.NoRedirect().redirect_request(None, None, None, None, None, None)
    except ValueError: pass
    else: raise AssertionError("redirect accepted")
print("Office client offline checks passed; no network or live credential used.")

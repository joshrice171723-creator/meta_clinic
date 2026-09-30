#!/usr/bin/env python3
"""Explicit Office calls. The credential never travels through agent prompts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        raise ValueError("Office redirects are not permitted")


def call(path, payload=None):
    if not re.fullmatch(r"/api/qa/(?:office(?:/actors|/work|/check-ins|/position|/work/[1-9]\d*/transition|/qa(?:/ledger|/defects|/retests|/batches/poll)?)?|room(?:/messages)?|tasks)", path):
        raise ValueError("Unsupported Office operation")
    token_file = Path(os.environ["OFFICE_TOKEN_FILE"]).expanduser()
    metadata = token_file.lstat()
    if not stat.S_ISREG(metadata.st_mode) or token_file.is_symlink() or metadata.st_size > 256:
        raise ValueError("Use a protected regular credential file")
    if os.name != "nt" and (metadata.st_mode & 0o077 or metadata.st_uid != os.getuid()):
        raise ValueError("Credential file must belong to this user and have mode 0600")
    token = token_file.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"qa_[A-Za-z0-9_-]{43}", token):
        raise ValueError("Invalid Office credential file")
    encoded = None if payload is None else json.dumps(payload).encode()
    maximum = 1_000_000 if path == "/api/qa/office/qa/ledger" else 16000
    if encoded and len(encoded) > maximum:
        raise ValueError("Office request exceeds its size limit")
    request = urllib.request.Request("https://aimetaclinic.com" + path, data=encoded,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=8) as response:
        body = response.read(1_000_001)
        if len(body) > 1_000_000:
            raise ValueError("Office response exceeds 1 MB")
        return json.loads(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", help="An allowed /api/qa/ Office route")
    parser.add_argument("--write", action="store_true", help="Read an explicit JSON mutation from stdin")
    parser.add_argument("--prepare-fingerprint", action="store_true", help="After approval, create a local secret and print only its public fingerprint")
    args = parser.parse_args()
    try:
        if args.prepare_fingerprint:
            if os.name == "nt":
                raise ValueError("Use an approved Windows secret store/ACL handoff")
            target = Path(os.environ["OFFICE_TOKEN_FILE"]).expanduser()
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            secret = "qa_" + secrets.token_urlsafe(32)
            descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as credential:
                credential.write(secret + "\n")
            print(json.dumps({"fingerprint": hashlib.sha256(secret.encode()).hexdigest(), "scope": "unapproved_local_secret"}))
            return 0
        if not args.path:
            raise ValueError("Provide an allowed Office path")
        payload = json.load(sys.stdin) if args.write else None
        print(json.dumps(call(args.path, payload)))
    except urllib.error.HTTPError as error:
        print(json.dumps({"error": "Office rejected the request", "status": error.code}), file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, urllib.error.URLError):
        print(json.dumps({"error": "Office unavailable or protected credential not configured"}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Fail fast when the staging workflow identity cannot match its AWS trust."""

import base64
import json
import os
import urllib.parse
import urllib.request


EXPECTED = {
    "iss": "https://token.actions.githubusercontent.com",
    "aud": "sts.amazonaws.com",
    "repository_id": "1363221319",
    "repository_owner_id": "267666251",
    "ref": "refs/heads/main",
}
EXPECTED_SUBJECT = (
    "repo:joshrice171723-creator@267666251/"
    "meta_clinic@1363221319:ref:refs/heads/main"
)


def decode_claims(token):
    parts = token.split(".")
    if len(parts) != 3:
        raise RuntimeError("GitHub returned a malformed OIDC token")
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


def verify_claims(claims, expected_sha):
    expected = {**EXPECTED, "sha": expected_sha}
    mismatches = [
        f"{name}: expected {value!r}, received {claims.get(name)!r}"
        for name, value in expected.items()
        if claims.get(name) != value
    ]
    if claims.get("sub") != EXPECTED_SUBJECT:
        mismatches.append(
            f"sub: expected {EXPECTED_SUBJECT!r}, received {claims.get('sub')!r}"
        )
    if mismatches:
        raise RuntimeError("OIDC claim mismatch; " + "; ".join(mismatches))
    return claims["sub"]


def main():
    request_url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
    separator = "&" if urllib.parse.urlsplit(request_url).query else "?"
    request = urllib.request.Request(
        request_url + separator + "audience=sts.amazonaws.com",
        headers={"Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        token = json.load(response)["value"]
    subject = verify_claims(decode_claims(token), os.environ["GITHUB_SHA"])
    print("Verified GitHub OIDC subject: " + subject)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Verify the hosted reviewer path over loopback with the real public TLS name.

Run on the staging host. Credentials/cookies stay in memory and never print.
Only the assigned synthetic reviewer is used; no other records are inspected.
"""
import argparse
import base64
import http.client
import json
from http.cookies import SimpleCookie
import socket
import ssl
import subprocess
from urllib.parse import urlsplit


PROFILES = {
    "owner-review": {
        "secret_id": "apply/staging/owner-review",
        "username": "owner-review",
        "email": "owner-review@example.test",
    },
    "StagingDemoUser": {
        "secret_id": "apply/staging/StagingDemoUser",
        "username": "StagingDemoUser",
        "email": "staging-demo-user@example.test",
    },
}


class LoopbackTLS(http.client.HTTPSConnection):
    def connect(self):
        raw = socket.create_connection(("127.0.0.1", 443), timeout=self.timeout)
        self.sock = self._context.wrap_socket(raw, server_hostname=self.host)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=tuple(PROFILES), default="owner-review")
    args = parser.parse_args()
    profile = PROFILES[args.profile]
    from pathlib import Path
    origin = Path("/etc/apply/review-origin").read_text().strip()
    host = urlsplit(origin).hostname
    result = subprocess.run([
        "aws", "secretsmanager", "get-secret-value", "--region", "us-east-1",
        "--secret-id", profile["secret_id"], "--output", "json",
    ], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit("Credential unavailable; details suppressed")
    credential = json.loads(json.loads(result.stdout)["SecretString"])
    if credential.get("username") != profile["username"] or credential.get("email") != profile["email"]:
        raise SystemExit("Unexpected reviewer identity")
    password = credential.get("password", "")
    if len(password) != 32 or not password.isascii() or not password.isalnum():
        raise SystemExit("Unexpected reviewer credential format")
    authorization = "Basic " + base64.b64encode((credential["username"] + ":" + credential["password"]).encode()).decode()
    cookies = SimpleCookie()

    def request(method, path, payload=None, token=None, gate=True, request_origin=origin, replay=None):
        connection = LoopbackTLS(host, 443, context=ssl.create_default_context(), timeout=15)
        headers = {"Host": host, "Origin": request_origin}
        if gate:
            headers["Authorization"] = authorization
        if replay is not None:
            headers["Cookie"] = replay
        elif cookies:
            headers["Cookie"] = "; ".join(key + "=" + value.value for key, value in cookies.items())
        if token:
            headers["X-CSRF-Token"] = token
        body = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload)
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            data = response.read()
            for key, value in response.getheaders():
                if key.lower() == "set-cookie":
                    parsed = SimpleCookie(value)
                    for item in parsed.values():
                        assert item["secure"] and item["httponly"] and item["samesite"].lower() == "lax"
                    cookies.load(value)
            return response.status, json.loads(data) if response.getheader("Content-Type", "").startswith("application/json") else None
        finally:
            connection.close()

    for path in ("/", "/api/csrf", "/api/session", "/up", "/health"):
        assert request("GET", path, gate=False)[0] == 401
    assert request("GET", "/api/session")[0] == 401
    status, config = request("GET", "/api/csrf")
    assert status == 200 and config["development_login"] is False and config["clinic_available"] is False
    token = config["csrf_token"]
    login = {"email_address": credential["email"], "password": credential["password"]}
    assert request("POST", "/api/session", login)[0] == 422
    assert request("POST", "/api/session", login, token=token, request_origin="https://foreign.invalid")[0] == 422
    status, data = request("POST", "/api/session", login, token=token)
    assert status == 200 and data["user"]["admin"] is False
    replay = "; ".join(key + "=" + value.value for key, value in cookies.items())
    try:
        assert request("GET", "/api/session")[0] == 200
        for path in ("/portal", "/paperwork", "/training", "/api/paperworks", "/api/materials"):
            assert request("GET", path)[0] == 200, "Reviewer route unavailable"
        assert request("GET", "/api/inquiries")[0] == 403
        assert request("GET", "/clinic")[0] == 200
        _, config = request("GET", "/api/csrf")
        if args.profile == "StagingDemoUser":
            assert config["clinic_available"] is True
            status, context = request("GET", "/api/clinic/context")
            assert status == 200
            assert context["practice"]["name"] == "APPly Staging Demo Clinic [Synthetic]"
            assert all(context["capabilities"].values())
            for path, key, minimum in (
                ("/api/clinic/patients", "patients", 4),
                ("/api/clinic/inventory", "items", 3),
                ("/api/clinic/staff", "staff", 2),
            ):
                status, collection = request("GET", path)
                assert status == 200 and len(collection[key]) >= minimum
        else:
            assert config["clinic_available"] is False
            for path in ("/api/clinic", "/api/clinic/context"):
                assert request("GET", path)[0] == 404
        assert request("POST", "/api/development_session", {}, token=config["csrf_token"])[0] == 404
    finally:
        _, config = request("GET", "/api/csrf")
        assert request("DELETE", "/api/session", token=config["csrf_token"])[0] == 204
    assert request("GET", "/api/session", replay=replay)[0] == 401
    print("PASS: public-name TLS, gateway denial, secure cookies, CSRF/foreign-origin denial, profile-scoped reviewer content, logout and replay rejection")


if __name__ == "__main__":
    main()

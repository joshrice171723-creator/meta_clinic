#!/usr/bin/env python3
"""Exercise generated nginx with isolated fictional upstreams and temporary TLS.

Uses an already-installed nginx:stable-alpine image; publishes random loopback
ports only. Never reads hosted secrets, opens AWS, or uses an application DB.
"""
import base64
import http.client
import json
import os
from pathlib import Path
import ssl
import subprocess
import tempfile
import time
import uuid

from review_access import render


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("nginx contract probe failed; raw output suppressed")
    return result.stdout.strip()


def verify(phase):
    name = "apply-edge-test-" + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix=name) as scratch:
        directory = Path(scratch)
        command("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                "-keyout", str(directory / "key.pem"), "-out", str(directory / "cert.pem"),
                "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1")
        # Wholly synthetic, disposable test credential; never a review password.
        (directory / "auth").write_text("reviewer:{PLAIN}fixture-only-password\n")
        challenge = directory / ".well-known/acme-challenge"
        challenge.mkdir(parents=True)
        (challenge / "fixture").write_text("synthetic-challenge")
        config = render("8.8.8.8", phase)
        config = config.replace("include /etc/apply/upstreams/api.conf;", "server 127.0.0.1:19001;")
        config = config.replace("include /etc/apply/upstreams/web.conf;", "server 127.0.0.1:19002;")
        for source, destination in (
            ("/etc/apply/tls/localhost.crt", "/fixture/cert.pem"),
            ("/etc/apply/tls/localhost.key", "/fixture/key.pem"),
            ("/etc/letsencrypt/live/apply-staging-review/fullchain.pem", "/fixture/cert.pem"),
            ("/etc/letsencrypt/live/apply-staging-review/privkey.pem", "/fixture/key.pem"),
            ("/etc/nginx/apply-review.htpasswd", "/fixture/auth"),
            ("/var/lib/apply-acme", "/fixture"),
        ):
            config = config.replace(source, destination)
        upstreams = ""
        for port, component in ((19001, "api"), (19002, "web")):
            upstreams += f'''server {{ listen 127.0.0.1:{port};
              location / {{ default_type application/json;
                return 200 '{{"component":"{component}","host":"$http_host","forwardedHost":"$http_x_forwarded_host","proto":"$http_x_forwarded_proto","port":"$http_x_forwarded_port","client":"$http_x_forwarded_for","origin":"$http_origin","authorization":"$http_authorization","forwarded":"$http_forwarded"}}';
              }} }}\n'''
        end = config.rfind("}")
        (directory / "nginx.conf").write_text(config[:end] + upstreams + config[end:])
        # Container workers must read fictional files; private TLS key stays 0600.
        directory.chmod(0o755)
        for path in (directory / "auth", directory / "cert.pem", directory / "nginx.conf"):
            path.chmod(0o644)
        try:
            command("docker", "run", "--detach", "--name", name, "--memory", "64m",
                    "--publish", "127.0.0.1::80", "--publish", "127.0.0.1::443",
                    "--mount", f"type=bind,src={directory},dst=/fixture,readonly",
                    "--entrypoint", "nginx", "nginx:stable-alpine",
                    "-c", "/fixture/nginx.conf", "-g", "daemon off;")
            ports = json.loads(command("docker", "inspect", "--format", "{{json .NetworkSettings.Ports}}", name))
            context = ssl.create_default_context(cafile=str(directory / "cert.pem"))

            def request(path, secure=False, auth=False, extra=None):
                port = int(ports["443/tcp" if secure else "80/tcp"][0]["HostPort"])
                connection = (http.client.HTTPSConnection("127.0.0.1", port, context=context, timeout=5)
                              if secure else http.client.HTTPConnection("127.0.0.1", port, timeout=5))
                headers = {"Host": "8.8.8.8"}
                if auth:
                    headers["Authorization"] = "Basic " + base64.b64encode(b"reviewer:fixture-only-password").decode()
                headers.update(extra or {})
                try:
                    connection.request("GET", path, headers=headers)
                    response = connection.getresponse()
                    return response.status, response.read().decode(), dict(response.getheaders())
                finally:
                    connection.close()

            for attempt in range(30):
                try:
                    status, body, _ = request("/.well-known/acme-challenge/fixture")
                    break
                except (OSError, http.client.HTTPException):
                    time.sleep(0.1)
            else:
                raise AssertionError("nginx did not become ready")
            assert status == 200 and body == "synthetic-challenge"
            for path in ("/", "/api/session", "/login", "/.well-known/acme-challenge/missing"):
                assert request(path)[0] == 404, (phase, path)
            if phase == "active":
                for path in ("/", "/api/session", "/up", "/health", "/clinic"):
                    assert request(path, secure=True)[0] == 401, path
                assert request("/", secure=True, extra={"Authorization": "Basic invalid"})[0] == 401
                for path, component in (("/", "web"), ("/api/session", "api"), ("/up", "api")):
                    status, body, headers = request(path, secure=True, auth=True, extra={
                        "Origin": "https://foreign.invalid", "X-Forwarded-Host": "foreign.invalid",
                        "X-Forwarded-Proto": "http", "X-Forwarded-Port": "80",
                        "X-Forwarded-For": "1.2.3.4", "Forwarded": "host=foreign.invalid",
                    })
                    assert status == 200
                    data = json.loads(body)
                    assert data["component"] == component
                    assert data["host"] == data["forwardedHost"] == "8.8.8.8"
                    assert data["proto"] == "https" and data["port"] == "443"
                    assert data["origin"] == "https://foreign.invalid", "Never rewrite Origin"
                    assert data["authorization"] == data["forwarded"] == ""
                    assert data["client"] != "1.2.3.4"
                    assert "no-store" in headers["Cache-Control"]
                try:
                    request("/", secure=True, auth=True, extra={"Host": "foreign.invalid"})
                    raise AssertionError("Unknown host was accepted")
                except http.client.RemoteDisconnected:
                    pass
            print(phase + ": challenge isolation, HTTP denial" + (", TLS/auth/routing/header/cache checks passed" if phase == "active" else " passed"))
        finally:
            subprocess.run(["docker", "rm", "--force", name], capture_output=True, check=False)


if __name__ == "__main__":
    verify("bootstrap")
    verify("active")

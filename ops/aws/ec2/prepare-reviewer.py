#!/usr/bin/env python3
"""Run only on staging: provision an allowlisted synthetic reviewer.

No password enters command arguments, output, source, or a plaintext file. The
edge stores a bcrypt hash; Rails receives credential data over process stdin.
Existing identities are never reset or granted additional privileges.
"""
import argparse
import base64
import grp
import json
import os
from pathlib import Path
import subprocess
import tempfile


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


def parse_htpasswd(contents):
    entries = {}
    allowed = {profile["username"] for profile in PROFILES.values()}
    for line in contents.splitlines():
        if not line:
            continue
        if ":" not in line:
            raise ValueError("Malformed reviewer gate")
        username, password_hash = line.split(":", 1)
        if username not in allowed or username in entries or not password_hash.startswith("$2"):
            raise ValueError("Unexpected reviewer gate identity or hash")
        entries[username] = line
    return entries


def merged_htpasswd(contents, username, entry):
    entries = parse_htpasswd(contents)
    if not entry.startswith(username + ":$2"):
        raise ValueError("Unexpected generated reviewer hash")
    entries[username] = entry
    order = [profile["username"] for profile in PROFILES.values()]
    return "\n".join(entries[name] for name in order if name in entries) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=tuple(PROFILES), default="owner-review")
    args = parser.parse_args()
    profile = PROFILES[args.profile]
    if os.geteuid() != 0 or os.environ.get("APPLY_ENVIRONMENT") != "staging":
        raise SystemExit("Requires root on the configured staging host")
    os.umask(0o077)
    result = subprocess.run([
        "aws", "secretsmanager", "get-secret-value", "--region", "us-east-1",
        "--secret-id", profile["secret_id"], "--output", "json",
    ], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit("Reviewer credential unavailable; details suppressed")
    credential = json.loads(json.loads(result.stdout)["SecretString"])
    if credential.get("username") != profile["username"] or credential.get("email") != profile["email"]:
        raise SystemExit("Unexpected reviewer identity")
    password = credential.get("password", "")
    if len(password) != 32 or not password.isascii() or not password.isalnum():
        raise SystemExit("Unexpected reviewer credential format")
    encoded = base64.b64encode(json.dumps(credential).encode()).decode()
    ruby = '''require "base64"
begin
  raise unless Rails.env.production? && ENV["APP_DEPLOYMENT_ENV"] == "staging"
  data = JSON.parse(Base64.strict_decode64("ENCODED"))
  User.transaction do
    user = User.find_by(email_address: data.fetch("email"))
    if user
      raise unless user.active? && !user.admin? && user.authenticate(data.fetch("password"))
    else
      user = User.create!(email_address: data.fetch("email"), password: data.fetch("password"), admin: false)
      Launch::Paperwork.assign_demo!(user)
    end
    Staging::DemoClinic.prepare!(user) if data.fetch("email") == Staging::DemoClinic::EMAIL
    puts "Synthetic non-admin reviewer ready"
  end
rescue StandardError
  warn "Reviewer provisioning refused; no identity reset; details suppressed"
  exit 1
end
'''.replace("ENCODED", encoded)
    result = subprocess.run(["docker", "exec", "-i", "apply-api", "./bin/rails", "runner", "-"],
                            input=ruby, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit("Reviewer provisioning refused; details suppressed")
    result = subprocess.run(["htpasswd", "-niB", "-C", "10", credential["username"]],
                            input=password + "\n", capture_output=True, text=True)
    if result.returncode or not result.stdout.startswith(credential["username"] + ":$2"):
        raise SystemExit("Reviewer hash generation failed; details suppressed")
    gate = Path("/etc/nginx/apply-review.htpasswd")
    existing = gate.read_text() if gate.exists() else ""
    try:
        merged = merged_htpasswd(existing, credential["username"], result.stdout.strip())
    except ValueError as error:
        raise SystemExit(str(error)) from None
    fd, temporary = tempfile.mkstemp(prefix=".apply-review-", dir="/etc/nginx")
    try:
        with os.fdopen(fd, "w") as output:
            output.write(merged)
        os.chown(temporary, 0, grp.getgrnam("nginx").gr_gid)
        os.chmod(temporary, 0o640)
        os.replace(temporary, gate)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print("Synthetic reviewer and private bcrypt gate ready; credential values suppressed")


if __name__ == "__main__":
    main()

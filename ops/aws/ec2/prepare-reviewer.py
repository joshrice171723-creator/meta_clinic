#!/usr/bin/env python3
"""Run only on staging: provision one synthetic reviewer from Secrets Manager.

No password enters command arguments, output, source, or a plaintext file. The
edge stores a bcrypt hash; Rails receives credential data over process stdin.
Existing identities are never reset or granted additional privileges.
"""
import base64
import grp
import json
import os
from pathlib import Path
import subprocess
import tempfile


def main():
    if os.geteuid() != 0 or os.environ.get("APPLY_ENVIRONMENT") != "staging":
        raise SystemExit("Requires root on the configured staging host")
    os.umask(0o077)
    result = subprocess.run([
        "aws", "secretsmanager", "get-secret-value", "--region", "us-east-1",
        "--secret-id", "apply/staging/owner-review", "--output", "json",
    ], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit("Reviewer credential unavailable; details suppressed")
    credential = json.loads(json.loads(result.stdout)["SecretString"])
    if credential.get("username") != "owner-review" or credential.get("email") != "owner-review@example.test":
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
    if result.returncode or not result.stdout.startswith("owner-review:$2"):
        raise SystemExit("Reviewer hash generation failed; details suppressed")
    fd, temporary = tempfile.mkstemp(prefix=".apply-review-", dir="/etc/nginx")
    try:
        with os.fdopen(fd, "w") as output:
            output.write(result.stdout.strip() + "\n")
        os.chown(temporary, 0, grp.getgrnam("nginx").gr_gid)
        os.chmod(temporary, 0o640)
        os.replace(temporary, "/etc/nginx/apply-review.htpasswd")
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print("Synthetic reviewer and private bcrypt gate ready; credential values suppressed")


if __name__ == "__main__":
    main()

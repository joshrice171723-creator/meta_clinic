#!/usr/bin/env python3
"""Offline release-readiness contract checks.

This command is deliberately credential-free: it reads source and tracked text
only.  It is a release *preflight* and does not claim hosted, clinical,
security, or production acceptance.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = ROOT / ".github" / "workflows"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def require(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"{label}: missing {needle!r}")


def require_order(text: str, first: str, second: str, label: str, errors: list[str]) -> None:
    if first not in text or second not in text or text.index(first) >= text.index(second):
        errors.append(f"{label}: {first!r} must precede {second!r}")


def check_workflows(errors: list[str]) -> None:
    ci = read(WORKFLOWS / "ci.yml")
    staging = read(WORKFLOWS / "deploy-staging.yml")
    production = read(WORKFLOWS / "promote-production.yml")

    require(ci, "permissions:\n  contents: read", "CI permissions", errors)
    for job in ("scan_ruby:", "frontend:", "delivery_contract:", "test:"):
        require(ci, job, "CI jobs", errors)
    if re.search(r"^  pull_request_target:\s*$", ci, re.MULTILINE):
        errors.append("CI: pull_request_target is not allowed")

    for name, workflow in (("staging", staging), ("production", production)):
        for trigger in ("push", "pull_request", "schedule", "workflow_run"):
            if re.search(rf"^  {trigger}:\s*$", workflow, re.MULTILINE):
                errors.append(f"{name}: automatic {trigger} trigger is not allowed")
        require(workflow, "workflow_dispatch:", f"{name} trigger", errors)
        require(workflow, "persist-credentials: false", f"{name} checkout", errors)
        if not re.search(r"uses: [^@]+@[0-9a-f]{40}", workflow):
            errors.append(f"{name}: deployment actions must be pinned to commit SHAs")

    require_order(staging, "- name: Validate manual staging request", "- uses: aws-actions/configure-aws-credentials@", "staging authentication gate", errors)
    require(staging, 'test "$SOURCE_REF" = "refs/heads/main"', "staging branch gate", errors)
    require(staging, 'test "$CONFIRM" = "deploy-staging"', "staging confirmation", errors)
    require(production, "if: github.ref == 'refs/heads/main' && inputs.confirmation == 'promote-production'", "production branch/confirmation gate", errors)
    require(production, "environment: production", "production environment gate", errors)
    require(production, "--expected-digest", "production API digest gate", errors)
    require(production, "--expected-web-digest", "production web digest gate", errors)


def check_runtime_boundaries(errors: list[str]) -> None:
    api_dockerfile = read(ROOT / "apps" / "api" / "Dockerfile")
    web_dockerfile = read(ROOT / "apps" / "web" / "Dockerfile")
    web_nginx = read(ROOT / "apps" / "web" / "nginx.conf")
    production = read(ROOT / "apps" / "api" / "config" / "environments" / "production.rb")
    routes = read(ROOT / "apps" / "api" / "config" / "routes.rb")

    require(api_dockerfile, "USER 1000:1000", "API image", errors)
    require(web_dockerfile, "USER 101:101", "web image", errors)
    require(web_nginx, "location = /health { return 200", "web readiness endpoint", errors)
    require(routes, 'get "up" => "rails/health#show"', "API readiness endpoint", errors)
    require(production, 'config.silence_healthcheck_path = "/up"', "API health logging", errors)
    require(production, 'config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")', "API log level", errors)

    installer = read(ROOT / "ops" / "aws" / "ec2" / "install-release.sh")
    postgres = read(ROOT / "ops" / "aws" / "ec2" / "postgres.sh")
    verifier = read(ROOT / "ops" / "aws" / "ec2" / "verify-container.py")
    for needle, label in (
        ("flock -n 9", "release serialization"),
        ("apply-postgres backup", "pre-release database backup"),
        ("/srv/apply/backups/before-$release.web-image", "prior web image recovery reference"),
        ("systemctl stop apply-web.service apply-api.service", "failed-release stop condition"),
        ("--format=custom", "custom-format backup"),
        ("pg_restore --list", "backup archive validation"),
        ("--exit-on-error", "restore fail-closed behavior"),
        ("restored_database", "separate restore target"),
    ):
        source = installer + postgres if needle in ("apply-postgres backup", "flock -n 9", "systemctl stop apply-web.service apply-api.service", "/srv/apply/backups/before-$release.web-image", "pg_restore --list") else verifier
        require(source, needle, label, errors)
    require(installer, "https://localhost:8443/up", "API health probe", errors)
    require(installer, "https://localhost:8443/health", "web health probe", errors)
    require(installer, "apply-run pilot-readiness", "staging pilot-readiness check", errors)
    require(installer, "systemctl restart apply-api.service apply-clinic-worker.service", "staging restart rehearsal", errors)
    require(installer, '"$before_restart" != "$after_restart"', "staging state-continuity check", errors)
    require(installer, 'restart_ready=0', "staging restart timeout state", errors)
    require(installer, 'if [ "$restart_ready" -ne 1 ]', "staging restart timeout failure", errors)
    require(installer, "$release-$generation-pilot-readiness.json", "staging readiness receipt", errors)
    require(installer, "API_IMAGE=\"$image\" WEB_IMAGE=\"$web_image\"", "staging receipt image identity", errors)
    require(installer, "ln \"$receipt_temp\" \"$receipt_path\"", "atomic staging receipt", errors)
    require(installer, "APPLY_RELEASE_ATTESTATION=", "host release attestation", errors)
    release = read(ROOT / "ops" / "aws" / "ec2" / "release.py")
    require(release, "invocation_attestation", "host attestation validation", errors)
    require(release, "receipt.get('host_attestation')", "staging attestation promotion gate", errors)
    require(release, "f'/apply/releases/{args.environment}/{generation}'", "immutable release receipt", errors)
    delivery = read(ROOT / "ops" / "aws" / "ec2" / "delivery.yaml")
    require(delivery, "parameter/apply/releases/staging/*", "staging immutable receipt permission", errors)
    require(delivery, "parameter/apply/releases/production/*", "production immutable receipt permission", errors)
    require(read(ROOT / "ops" / "aws" / "ec2" / "apply-run.sh"), "./bin/staging-pilot-readiness",
      "staging readiness command", errors)


def check_worker_contract_text(
    service: str, installer: str, renderer: str, errors: list[str]
) -> None:
    """Require the guarded clinic worker to ship and fail closed with a release."""
    for needle, label in (
        ("BindsTo=apply-api.service", "worker lifecycle binding"),
        ("Requires=docker.service apply-postgres.service apply-api.service", "worker dependencies"),
        ("ExecStart=/usr/local/sbin/apply-run worker", "worker command"),
        ("Restart=on-failure", "worker restart policy"),
        ("StartLimitBurst=3", "worker restart bound"),
    ):
        require(service, needle, label, errors)
    require(
        renderer,
        "'apply-clinic-worker.service': ('/etc/systemd/system/apply-clinic-worker.service', '644')",
        "worker installation",
        errors,
    )
    require_order(
        installer,
        "systemctl stop apply-clinic-worker.service || true",
        "/usr/local/sbin/apply-postgres migrate",
        "worker stopped before migration",
        errors,
    )
    require(
        installer,
        "systemctl enable --now apply-clinic-worker.service",
        "worker release startup",
        errors,
    )
    require(
        installer,
        "systemctl is-active --quiet apply-clinic-worker.service",
        "worker release health",
        errors,
    )
    if installer.count("systemctl stop apply-clinic-worker.service || true") < 3:
        errors.append("worker failure handling: release failure paths must stop the worker")


def check_worker_contract(errors: list[str]) -> None:
    check_worker_contract_text(
        read(ROOT / "ops" / "aws" / "ec2" / "apply-clinic-worker.service"),
        read(ROOT / "ops" / "aws" / "ec2" / "install-release.sh"),
        read(ROOT / "ops" / "aws" / "ec2" / "render-ssm-command.py"),
        errors,
    )


def tracked_text(root: Path) -> list[tuple[str, str]]:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "ls-files", "-z"],
            capture_output=True,
            check=True,
        )
        paths = result.stdout.decode().split("\0")
    except subprocess.CalledProcessError:
        # Unit tests and packaged copies may not include a .git directory.
        paths = [str(path.relative_to(root)) for path in root.rglob("*") if path.is_file()]
    entries: list[tuple[str, str]] = []
    for relative in paths:
        if not relative:
            continue
        path = root / relative
        if not path.is_file() or path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".woff", ".woff2"}:
            continue
        try:
            entries.append((relative, path.read_text(encoding="utf-8")))
        except UnicodeDecodeError:
            continue
    return entries


SECRET_PATTERNS = (
    (re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----"), "private key material"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "AWS access-key material"),
    (re.compile(r"\b(?:gh[pousr]|github_pat|xox[baprs])-[A-Za-z0-9_-]{20,}\b"), "provider token material"),
)


def secret_findings(entries: list[tuple[str, str]]) -> list[str]:
    findings = []
    for relative, text in entries:
        for pattern, label in SECRET_PATTERNS:
            if pattern.search(text):
                findings.append(f"{relative}: possible {label}")
    return findings


def check_secret_and_log_contract(entries: list[tuple[str, str]], errors: list[str]) -> None:
    errors.extend(secret_findings(entries))
    operations = {
        relative: text
        for relative, text in entries
        if relative.startswith("ops/aws/ec2/")
        and Path(relative).suffix in {".py", ".sh"}
        and not Path(relative).name.startswith("test_")
    }
    for relative, text in operations.items():
        if "subprocess.run" in text and "capture_output=True" in text:
            if "raw output suppressed" not in text and "details suppressed" not in text and "values suppressed" not in text:
                errors.append(f"{relative}: captured command output lacks a redaction contract")
    for relative in ("ops/aws/ec2/install-release.sh", "ops/aws/ec2/postgres.sh"):
        text = dict(entries).get(relative, "")
        require(text, "set -euo pipefail", relative, errors)
        require(text, "umask 077", relative, errors)
        if "set -x" in text or "set -o xtrace" in text:
            errors.append(f"{relative}: shell tracing would expose protected values")


def run(root: Path = ROOT) -> list[str]:
    global ROOT, WORKFLOWS
    ROOT = root
    WORKFLOWS = root / ".github" / "workflows"
    errors: list[str] = []
    check_workflows(errors)
    check_runtime_boundaries(errors)
    check_worker_contract(errors)
    check_secret_and_log_contract(tracked_text(root), errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    errors = run(args.root.resolve())
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print("PASS: workflow gates, image/runtime boundaries, recovery checks, and secret/log redaction contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

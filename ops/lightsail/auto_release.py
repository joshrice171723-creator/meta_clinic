#!/usr/bin/env python3
"""Root-owned, installed coordinator for the existing synthetic Lightsail host."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import html
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

from qa_policy import Blocked, GitHub, SHA, release_plan

ROOT = Path("/opt/meta-clinic")
STATE = Path("/var/lib/meta-clinic-release")
PUBLIC = STATE / "public"
ORIGIN = "https://aimetaclinic.com"
INSTALLED = ROOT / "automation"
CONFIG = Path("/etc/meta-clinic/auto-release.json")


def private_file(path):
    path = Path(path)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise Blocked("Configuration and credentials must be root-owned regular files, mode 0600")
    return path


def run(args, *, capture=False, env=None, pass_fds=(), cwd=None, timeout=None):
    # No shell, no credential values in argv/environment, no child logs containing secrets.
    result = subprocess.run(args, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, env=env, pass_fds=pass_fds,
                            cwd=cwd, timeout=timeout, check=False)
    if result.returncode:
        raise Blocked(f"{Path(args[0]).name} failed; stopped before the next release phase")
    return result.stdout.decode().strip() if capture else None


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def atomic_json(path, value):
    path = Path(path)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
        temporary = stream.name
    os.replace(temporary, path)


def remote_mount(destination, expected_source):
    destination = Path(destination)
    if not destination.is_absolute() or not destination.is_dir():
        raise Blocked("Encrypted off-host backup directory is not mounted")
    mount = json.loads(run(["findmnt", "--json", "--target", str(destination),
                           "--output", "FSTYPE,SOURCE"], capture=True))["filesystems"][0]
    if mount["fstype"] not in {"nfs", "nfs4", "cifs", "fuse.sshfs"}:
        raise Blocked("Backup destination must be a verified remote filesystem; local-only backups are insufficient")
    if mount["source"] != expected_source:
        raise Blocked("Off-host backup mount identity differs from configuration")
    return destination


def decrypt_hash(path, key):
    process = subprocess.Popen(
        ["gpg", "--batch", "--pinentry-mode", "loopback", "--no-symkey-cache",
         "--passphrase-file", str(key), "--decrypt", str(path)],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    digest = hashlib.sha256()
    try:
        for block in iter(lambda: process.stdout.read(1024 * 1024), b""):
            digest.update(block)
    finally:
        process.stdout.close()
    if process.wait():
        raise Blocked("Encrypted recovery archive cannot be decrypted")
    return digest.hexdigest()


def encrypt_recovery(revision, key, destination):
    archive = ROOT / "backups" / f"release-{revision}" / "recovery.tar.gz"
    expected = sha256(archive)
    encrypted = archive.with_suffix(archive.suffix + ".gpg")
    if encrypted.exists():
        raise Blocked("Encrypted archive already exists; inspect previous attempt")
    run(["gpg", "--batch", "--pinentry-mode", "loopback", "--no-symkey-cache",
         "--passphrase-file", str(key), "--symmetric", "--cipher-algo", "AES256",
         "--output", str(encrypted), str(archive)])
    if decrypt_hash(encrypted, key) != expected:
        raise Blocked("Encrypted recovery archive failed round-trip verification")
    remote = destination / f"MetaClinic-recovery-{revision}.tar.gz.gpg"
    # Never overwrite recovery material, including partial previous transfers.
    with remote.open("xb") as target, encrypted.open("rb") as source:
        shutil.copyfileobj(source, target)
        target.flush()
        os.fsync(target.fileno())
    if sha256(remote) != sha256(encrypted) or decrypt_hash(remote, key) != expected:
        raise Blocked("Off-host encrypted recovery failed checksum or decrypt verification")
    return expected


def read_manifest():
    return json.loads((PUBLIC / "current" / "version.json").read_text())


def render_page(manifest):
    entries = []
    for entry in manifest["releases"]:
        notes = []
        for item in entry["notes_for_qa"]:
            fields = "".join(f"<h4>{title}</h4><pre>{html.escape(item[key])}</pre>" for key, title in (
                ("changed", "What changed"), ("retest", "What to retest"),
                ("tradeoffs", "Intentional behavior / trade-offs")))
            notes.append(f"<section><h3>Issue #{item['issue']} · PR #{item['pr']}</h3>{fields}</section>")
        entries.append(f"<article><h2>{html.escape(entry['summary'])}</h2>"
                       f"<p><code>{entry['sha']}</code> · {entry.get('deployed_at') or entry.get('observed_at')}</p>"
                       f"<h3>Notes for QA</h3>{''.join(notes)}</article>")
    return ("<!doctype html><html lang='en'><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<title>Meta Clinic updates</title><style>body{font:16px system-ui;max-width:850px;"
            "margin:40px auto;padding:0 20px}pre{white-space:pre-wrap;font:inherit}"
            "article{border-top:1px solid #ccc;padding:20px 0}code{overflow-wrap:anywhere}</style>"
            "<h1>Meta Clinic updates</h1>" + "".join(entries) + "</html>")


def switch_public(directory):
    temporary = PUBLIC / "current.next"
    if temporary.exists() or temporary.is_symlink():
        raise Blocked("An unfinished version-pointer update needs inspection")
    temporary.symlink_to(directory)
    os.replace(temporary, PUBLIC / "current")


def publish(plan, previous_manifest):
    entry = {**plan, "deployed_at": datetime.now(timezone.utc).isoformat()}
    if entry.get("event") == "baseline":
        entry["observed_at"] = entry["deployed_at"]
        entry["deployed_at"] = None
    manifest = {"schema_version": 1, "current": entry,
                "releases": [entry] + previous_manifest.get("releases", [])}
    directory = PUBLIC / (entry["sha"] + "-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f"))
    directory.mkdir(mode=0o755)
    atomic_json(directory / "version.json", manifest)
    (directory / "version.json").chmod(0o644)
    (directory / "index.html").write_text(render_page(manifest))
    (directory / "index.html").chmod(0o644)
    switch_public(directory)
    request = urllib.request.Request(ORIGIN + "/version.json?release=" + entry["sha"],
                                     headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=30) as response:
        served = json.load(response)
    if served.get("current") != entry:
        raise Blocked("Public version endpoint did not confirm the deployed revision and QA notes")


def release_env(lock):
    return {**os.environ, "META_CLINIC_RELEASE_LOCK_FD": str(lock.fileno()),
            "META_CLINIC_RECOVERY_MODE": "host",
            "META_CLINIC_VERIFY_SCRIPT": str(INSTALLED / "verify-demo.py")}


def rollback_images(revision, lock):
    transaction = STATE / f"transaction-{revision}.json"
    record = json.loads(transaction.read_text())
    current_revision = (ROOT / "deploy" / "current-revision").read_text().strip()
    if current_revision not in {revision, record["previous_sha"]}:
        raise Blocked("A later release is installed; refuse this historical rollback")
    backup = ROOT / "backups" / f"release-{revision}"
    previous_env = backup / "previous.env"
    if sha256(previous_env) != record["previous_env_sha256"]:
        raise Blocked("Previous image references changed")
    refs = dict(line.split("=", 1) for line in previous_env.read_text().splitlines())
    if set(refs) != {"API_IMAGE", "WEB_IMAGE"}:
        raise Blocked("Previous image references are incomplete")
    for key, value in refs.items():
        if key in {"API_IMAGE", "WEB_IMAGE"}:
            actual = run(["docker", "image", "inspect", "--format",
                          '{{index .Config.Labels "org.opencontainers.image.revision"}}', value], capture=True)
            if actual != record["previous_sha"]:
                raise Blocked("Previous images are missing or their revision differs")
            image_id = run(["docker", "image", "inspect", "--format", "{{.Id}}", value], capture=True)
            if image_id != record["previous_image_ids"][key]:
                raise Blocked("Previous image identity changed")
    # This path is ONLY recorded for allowlisted app-only changes. No migration reversal.
    shutil.copyfile(previous_env, ROOT / "deploy" / "release.env")
    (ROOT / "deploy" / "release.env").chmod(0o600)
    run(["docker", "compose", "-f", "compose.yml", "-f", "guided-demo.compose.yml",
         "--env-file", "release.env", "up", "-d", "--pull", "never", "--wait",
         "--wait-timeout", "120", "api", "worker", "guided-demo", "web"], cwd=ROOT / "deploy")
    # Restore verifier includes bounded readiness retries before login/Sandbox checks.
    run(["python3", str(INSTALLED / "verify-demo.py")], pass_fds=(lock.fileno(),))
    (ROOT / "deploy" / "current-revision").write_text(record["previous_sha"] + "\n")
    restored = {**record["previous_manifest"]["current"]}
    restored["summary"] = "Rollback to " + record["previous_sha"][:12]
    restored["previous_sha"] = revision
    restored["event"] = "rollback"
    restored["notes_for_qa"] = [{**note,
        "changed": f"Rolled back {revision} to {record['previous_sha']}.",
        "retest": "Recheck the failed candidate's reproduction steps and the previously working journey.\n" + note["retest"],
        "tradeoffs": "Image rollback only. Database contents are not restored or reversed."}
        for note in record["notes_for_qa"]]
    restored.pop("deployed_at", None)
    publish(restored, read_manifest())
    atomic_json(STATE / "status.json", {"status": "rolled_back", "sha": record["previous_sha"]})


def deploy(config, lock):
    if (STATE / "blocked").exists():
        raise Blocked("Previous release failed; inspect status and recovery before clearing the stop file")
    previous = (ROOT / "deploy" / "current-revision").read_text().strip()
    if not SHA.fullmatch(previous):
        raise Blocked("Installed revision is unknown")
    manifest = read_manifest()
    if manifest["current"]["sha"] != previous:
        raise Blocked("Version manifest and installed revision disagree")
    api = GitHub(private_file(config["github_token_file"]).read_text())
    plan = release_plan(api, previous)
    if plan is None:
        return
    revision = plan["sha"]
    previous_refs = dict(line.split("=", 1) for line in
                         (ROOT / "deploy" / "release.env").read_text().splitlines())
    if set(previous_refs) != {"API_IMAGE", "WEB_IMAGE"}:
        raise Blocked("Installed image references are incomplete")
    previous_image_ids = {}
    for component, image in previous_refs.items():
        if run(["docker", "image", "inspect", "--format",
                '{{index .Config.Labels "org.opencontainers.image.revision"}}', image], capture=True) != previous:
            raise Blocked("Installed image revisions disagree with current-revision")
        previous_image_ids[component] = run(["docker", "image", "inspect", "--format", "{{.Id}}", image], capture=True)
    key = private_file(config["backup_key_file"])
    if key.stat().st_size < 32:
        raise Blocked("Backup encryption key is too short")
    destination = remote_mount(config["offhost_backup_directory"], config["offhost_mount_source"])
    # Require owner escrow of the SAME key, separately from encrypted backup archives.
    escrow = private_file(config["offhost_key_escrow_file"])
    remote_mount(escrow.parent, config["offhost_key_mount_source"])
    if (config["offhost_key_mount_source"] == config["offhost_mount_source"]
            or destination in escrow.parents or sha256(escrow) != sha256(key)):
        raise Blocked("Off-host recovery key escrow is missing or does not match")
    for binary in ("docker", "gpg", "git"):
        if not shutil.which(binary):
            raise Blocked(f"Required command is unavailable: {binary}")
    if shutil.disk_usage(ROOT).free < 12 * 1024**3:
        raise Blocked("Less than 12 GiB free for builds, images and recovery")
    source = ROOT / "source.git"
    run(["git", "--git-dir", str(source), "fetch", "origin", "main"])
    if run(["git", "--git-dir", str(source), "rev-parse", "FETCH_HEAD"], capture=True) != revision:
        raise Blocked("Main advanced during candidate selection; wait for its own CI")
    checkout = ROOT / "builds" / revision
    if checkout.exists():
        raise Blocked("Candidate build directory already exists; inspect previous attempt")
    checkout.parent.mkdir(mode=0o700, exist_ok=True)
    run(["git", "--git-dir", str(source), "worktree", "add", "--detach", str(checkout), revision])
    # Lock spans BOTH prepare/deploy phases, encryption, version signal and rollback.
    mutation_started = False
    try:
        atomic_json(STATE / "status.json", {"status": "building", "sha": revision})
        for component in ("api", "web"):
            run(["docker", "build", "--platform", "linux/amd64", "--label",
                 "org.opencontainers.image.revision=" + revision,
                 "-t", f"meta-clinic-{component}:{revision}", str(checkout / "apps" / component)], timeout=5400)
        if api.main() != revision:
            raise Blocked("Main advanced during build; candidate must be reconsidered")
        # This installed script is never replaced with code from the candidate checkout.
        env = release_env(lock)
        mutation_started = True
        run(["bash", str(INSTALLED / "release.sh"), "prepare", revision, "local"],
            env=env, pass_fds=(lock.fileno(),))
        digest = encrypt_recovery(revision, key, destination)
        remote_mount(config["offhost_backup_directory"], config["offhost_mount_source"])
        record = {**plan, "previous_manifest": manifest,
                  "previous_image_ids": previous_image_ids,
                  "previous_env_sha256": sha256(ROOT / "backups" / f"release-{revision}" / "previous.env")}
        atomic_json(STATE / f"transaction-{revision}.json", record)
        atomic_json(STATE / "status.json", {"status": "deploying", "sha": revision})
        run(["bash", str(INSTALLED / "release.sh"), "deploy", revision, digest],
            env=env, pass_fds=(lock.fileno(),))
        publish(plan, manifest)
        atomic_json(STATE / "status.json", {"status": "ready_to_retest", "sha": revision})
        print("READY_TO_RETEST=" + revision)
    except Exception:
        (STATE / "blocked").touch(mode=0o600)
        atomic_json(STATE / "status.json", {"status": "blocked", "sha": revision,
                   "recovery": "Inspect journal, transaction and backups; automatic retries are stopped"})
        # release.sh has its own image rollback. If deploy succeeded but signaling
        # failed, return to the previous verified release and verify it again.
        if mutation_started and (ROOT / "deploy" / "current-revision").read_text().strip() == revision:
            rollback_images(revision, lock)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["poll", "rollback", "bootstrap"])
    parser.add_argument("revision", nargs="?")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise Blocked("Run only as root on the configured synthetic Lightsail host")
    os.umask(0o077)
    config = json.loads(private_file(CONFIG).read_text())
    if config.get("origin") != ORIGIN:
        raise Blocked("Configuration does not name the authorized synthetic site")
    with (ROOT / "release.lock").open("a") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another release is active; skipping this tick")
            return
        if args.mode == "bootstrap":
            if (PUBLIC / "current").exists():
                raise Blocked("Version baseline already exists; do not overwrite it")
            previous = (ROOT / "deploy" / "current-revision").read_text().strip()
            if not SHA.fullmatch(previous):
                raise Blocked("Current revision is unknown")
            refs = dict(line.split("=", 1) for line in
                        (ROOT / "deploy" / "release.env").read_text().splitlines())
            if set(refs) != {"API_IMAGE", "WEB_IMAGE"}:
                raise Blocked("Current image references are incomplete")
            for image in refs.values():
                if run(["docker", "image", "inspect", "--format",
                        '{{index .Config.Labels "org.opencontainers.image.revision"}}', image], capture=True) != previous:
                    raise Blocked("Current images disagree with current-revision")
            run(["python3", str(INSTALLED / "verify-demo.py")])
            publish({"sha": previous, "previous_sha": None, "event": "baseline",
                     "summary": "Existing release observed before automated deployment",
                     "notes_for_qa": [{"issue": 0, "pr": 0,
                         "changed": "Release automation initialized; application images are unchanged.",
                         "retest": "Record this baseline. Future entries identify the fixes to retest.",
                         "tradeoffs": "Original deployment time is unknown; observed_at records verification time."}]},
                    {"releases": []})
        elif args.mode == "rollback":
            if not args.revision or not SHA.fullmatch(args.revision):
                raise Blocked("Rollback requires the full revision of the release to undo")
            (STATE / "blocked").touch(mode=0o600)
            rollback_images(args.revision, lock)
        else:
            deploy(config, lock)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Only policy errors contain operator-facing text; other exceptions may
        # contain response bodies, signed URLs or credentials, so never print them.
        print("BLOCKED: " + (str(error) if isinstance(error, Blocked) else
                            "Runtime/configuration error; inspect the installed setup"), file=sys.stderr)
        sys.exit(1)

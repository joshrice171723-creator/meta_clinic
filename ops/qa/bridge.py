#!/usr/bin/env python3
"""Authenticated mailbox bridge for QA agents. It never opens a browser or completes queued work."""
import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from pathlib import Path
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit
from import_muse import scrub, known_issues, retest


BASE_URL = os.environ.get("QA_BASE_URL", "http://127.0.0.1:3000").rstrip("/")
MAX_EVIDENCE_BYTES = 4 * 1024 * 1024


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def require(value, message):
    if not value:
        raise ValueError(message)
    return value


class Client:
    def __init__(self, require_token=True):
        target = urlsplit(BASE_URL)
        require(target.scheme == "https" or (target.scheme == "http" and target.hostname in ("localhost", "127.0.0.1", "::1")), "QA tokens require HTTPS outside loopback")
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        self.csrf = None
        self.token = os.environ.get("QA_SERVICE_TOKEN")
        if require_token:
            require(self.token, "An authorized host carrier must supply QA_SERVICE_TOKEN securely")

    def request(self, path, method="GET", payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        if data is not None:
            headers["Content-Type"] = "application/json"
        if self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        request = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=30) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", "replace")
            raise RuntimeError("%s %s: %s" % (error.code, path, body)) from error
        return json.loads(body) if body else None

    def sign_in(self):
        raise RuntimeError("Host carriers authenticate with QA_SERVICE_TOKEN")

    def build(self):
        return self.request("/build.json")


def authenticated():
    client = Client()
    return client


def print_json(value):
    print(json.dumps(value, indent=2, sort_keys=True))


def observed_build(client):
    try:
        supplied = client.build()
        build = {key: supplied.get(key) for key in ("revision", "version", "environment", "dirty")} if isinstance(supplied, dict) else {}
        revision = build.get("revision")
        if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
            build["revision"] = None
        build["status"] = "observed" if build.get("revision") else "unavailable"
    except (OSError, ValueError, RuntimeError):
        build = {"revision": None, "status": "unavailable"}
    return build.get("revision") or "unobserved", {**build, "observed_at": now()}


def build_boundary(before, after):
    before = before if isinstance(before, dict) else {}
    after = after if isinstance(after, dict) else {}
    if not before.get("revision") or not after.get("revision"):
        return "metadata_unavailable"
    return "deployment_changed" if before["revision"] != after["revision"] else "same_observed_revision"


def source_record(path):
    text = scrub(path.read_text(encoding="utf-8-sig"))
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None
    return {"path": path.name, "sha256": hashlib.sha256(text.encode()).hexdigest(), "parsed": parsed}


def records(value):
    return value if isinstance(value, list) else []


def sync_state(directory, existing=None):
    state = dict(existing or {})
    state.update(updated_at=now(), sources=dict(state.get("sources", {})))
    for name in ("BATCH_STATE.json", "COVERAGE_STATE.json", "QA_SCHEDULER_STATE.json", "RETEST_70.md", "KNOWN_ISSUES.md", "WORKFLOWS.md"):
        path = directory / name
        if path.is_file():
            item = source_record(path)
            state["sources"][name] = item
            parsed = item["parsed"]
            if name == "QA_SCHEDULER_STATE.json":
                require(isinstance(parsed, dict), "QA_SCHEDULER_STATE.json must contain an actual scheduler receipt")
                state["scheduler"] = parsed
            elif name == "BATCH_STATE.json" and isinstance(parsed, dict):
                state["batches"] = records(parsed.get("batches", parsed.get("batch_state"))) or ([parsed] if "batch" in parsed or "batch_number" in parsed else [])
                for field in ("retest", "releases", "last_qa_revision", "last_run_at"):
                    if field in parsed:
                        state[field] = parsed[field]
            elif name == "COVERAGE_STATE.json" and isinstance(parsed, dict):
                workflows = parsed.get("coverage", parsed.get("workflows"))
                state["coverage"] = [{"id": key, **item} for key, item in workflows.items()] if isinstance(workflows, dict) else records(workflows)
                pinned = parsed.get("pinned_build", {})
                if isinstance(pinned, dict) and pinned.get("revision"):
                    state["last_qa_revision"] = pinned["revision"]
                state["coverage_pointer"] = parsed.get("pointer")
                state["coverage_import_status"] = "expanded-export"
            elif name == "KNOWN_ISSUES.md":
                state["known_issues"] = known_issues(scrub(path.read_text(encoding="utf-8-sig")))
            elif name == "RETEST_70.md":
                rows, batches, candidates, revision = retest(scrub(path.read_text(encoding="utf-8-sig")))
                state.update(retest=rows, sweep_batches=batches, candidates=candidates, last_qa_revision=revision)
    return state


def event_key(kind, summary, revision, payload):
    raw = json.dumps([kind, summary, revision, payload], sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode()).hexdigest()


def command_status(_):
    client = authenticated()
    print_json(client.request("/api/qa"))


def command_inbox(_):
    client = authenticated()
    print_json(client.request("/api/qa/tasks"))


def command_room(args):
    # Public read-only handshake inspection. It never posts or claims work.
    path = "/api/qa/room" + ("?after_id=%d" % args.after_id if args.after_id is not None else "")
    print_json(Client(require_token=False).request(path))


def command_message(args):
    message = {"message_key": args.message_key, "agent": args.agent,
               "recipient": args.recipient, "body": Path(args.body_file).read_text(encoding="utf-8-sig")}
    for key in ("reference_revision", "case_reference", "reply_to", "correlation_nonce"):
        value = getattr(args, key)
        if value is not None:
            message[key] = value
    print_json(authenticated().request("/api/qa/room/messages", "POST", {"message": message}))


def command_sync(args):
    directory = Path(args.state_dir).resolve()
    require(directory.is_dir(), "--state-dir must be a directory")
    client = authenticated()
    existing = client.request("/api/qa")["state"]
    print_json(client.request("/api/qa/state", "POST", {"state": sync_state(directory, existing)}))


def command_transition(args, status):
    client = authenticated()
    before_revision, before = observed_build(client)
    if status == "claimed" and args.prepare_baseline:
        client.request("/api/qa/baseline", "POST", {"revision": before_revision})
    result = {"build_before": before}
    if args.result:
        result = json.loads(Path(args.result).read_text(encoding="utf-8-sig"))
        result.setdefault("build_before", before)
    _, submission = observed_build(client)
    result["build_submission"] = submission
    result["build_boundary"] = build_boundary(result["build_before"], submission)
    result["build_observations"] = [result["build_before"], before, submission]
    response = client.request("/api/qa/tasks/%s/transition" % args.id, "POST",
                              {"status": status, "result": result, "revision": before_revision, "run_id": args.run_id})
    _, after = observed_build(client)
    print_json({"transition": response, "build_before": before, "build_after": after})


def command_event(args):
    client = authenticated()
    observed_revision, observation = observed_build(client)
    revision = args.revision or observed_revision
    observation["reported_revision"] = args.revision
    observation["boundary"] = build_boundary({"revision": args.revision}, observation) if args.revision else "observed_at_submission"
    payload = {"event": {"kind": args.kind, "summary": args.summary, "revision": revision,
                         "payload": {"build_observation": observation}}}
    payload["event"]["event_key"] = event_key(args.kind, args.summary, revision, payload["event"]["payload"])
    print_json(client.request("/api/qa/events", "POST", payload))


def command_evidence(args):
    path = Path(args.file)
    data = path.read_bytes()
    require(len(data) <= MAX_EVIDENCE_BYTES, "evidence must be 4 MB or smaller")
    content_type = mimetypes.guess_type(path.name)[0]
    require(content_type in ("image/jpeg", "image/png"), "evidence must be a PNG or JPEG")
    client = authenticated()
    observed_revision, observation = observed_build(client)
    revision = args.revision or observed_revision
    context = json.loads(Path(args.context).read_text(encoding="utf-8-sig"))
    observation["reported_revision"] = args.revision
    context["submission_build_observation"] = observation
    evidence = {"issue": args.issue, "filename": path.name, "content_type": content_type,
                "data_base64": base64.b64encode(data).decode(), "caption": args.caption, "revision": revision,
                "phase": args.phase, "context": context}
    print_json(client.request("/api/qa/evidence", "POST", {"evidence": evidence}))


def command_context(args):
    client = authenticated()
    revision, build = observed_build(client)
    qa = client.request("/api/qa")
    text = "# QA context\n\nGenerated from the current application state; it is not a fixture or a claim of QA completion.\n\n"
    text += "- Observed live revision: `%s`\n- Build metadata: `%s`\n- Generated at: `%s`\n\n" % (revision, build["status"], now())
    text += "## Build\n\n```json\n%s\n```\n\n## QA state\n\n```json\n%s\n```\n" % (json.dumps(build, indent=2), json.dumps(qa, indent=2))
    Path(args.output).write_text(text, encoding="utf-8")
    print(args.output)


def command_observe(_):
    client = authenticated()
    _, observation = observed_build(client)
    print_json(observation)


def command_baseline(_):
    client = authenticated()
    revision, _ = observed_build(client)
    print_json(client.request("/api/qa/baseline", "POST", {"revision": revision}))


def command_notify(_):
    client = authenticated()
    events = client.request("/api/qa/notifications")["notifications"]
    topic = os.environ.get("QA_NTFY_URL")
    bot = os.environ.get("QA_TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("QA_TELEGRAM_CHAT_ID")
    require(topic or (bot and chat), "No notification carrier configured")
    delivered = 0
    for event in events[:10]:
        text = "%s\n%s\nRevision: %s" % (event["kind"], event["summary"], event.get("revision"))
        if topic:
            require(topic.startswith("https://"), "ntfy delivery requires HTTPS")
            request = urllib.request.Request(topic, data=text.encode(), method="POST", headers={"Title": "Meta Clinic QA"})
            token = os.environ.get("QA_NTFY_TOKEN")
            if token:
                request.add_header("Authorization", "Bearer " + token)
            channel = "ntfy"
        else:
            payload = json.dumps({"chat_id": chat, "text": text}).encode()
            request = urllib.request.Request("https://api.telegram.org/bot" + bot + "/sendMessage", data=payload, method="POST", headers={"Content-Type": "application/json"})
            channel = "telegram"
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                require(response.status == 200, "Notification delivery not confirmed")
        except (urllib.error.URLError, urllib.error.HTTPError) as error:
            raise RuntimeError("Notification carrier failed; delivery remains pending") from None
        client.request("/api/qa/notifications/%s/receipt" % event["id"], "POST", {"channel": channel})
        delivered += 1
    print_json({"confirmed_deliveries": delivered})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status").set_defaults(run=command_status)
    sub.add_parser("inbox").set_defaults(run=command_inbox)
    room = sub.add_parser("room")
    room.add_argument("--after-id", type=int)
    room.set_defaults(run=command_room)
    message = sub.add_parser("message")
    message.add_argument("--message-key", required=True)
    message.add_argument("--agent", required=True)
    message.add_argument("--recipient", required=True)
    message.add_argument("--body-file", required=True)
    message.add_argument("--reference-revision")
    message.add_argument("--case-reference")
    message.add_argument("--reply-to", type=int)
    message.add_argument("--correlation-nonce")
    message.set_defaults(run=command_message)
    sync = sub.add_parser("sync"); sync.add_argument("--state-dir", required=True); sync.set_defaults(run=command_sync)
    for name, status in (("claim", "claimed"), ("complete", "completed"), ("fail", "failed"), ("abort", "aborted")):
        item = sub.add_parser(name); item.add_argument("id"); item.add_argument("--result", required=name != "claim")
        item.add_argument("--run-id", required=True)
        item.add_argument("--prepare-baseline", action="store_true", help="Prepare the isolated QA clinic before claiming this bounded task")
        item.set_defaults(run=lambda args, value=status: command_transition(args, value))
    event = sub.add_parser("event"); event.add_argument("--kind", required=True); event.add_argument("--summary", required=True); event.add_argument("--revision"); event.set_defaults(run=command_event)
    evidence = sub.add_parser("evidence"); evidence.add_argument("--issue", type=int, required=True); evidence.add_argument("--file", required=True); evidence.add_argument("--caption", required=True); evidence.add_argument("--revision"); evidence.add_argument("--phase", choices=("before", "after", "observation"), required=True); evidence.add_argument("--context", required=True); evidence.set_defaults(run=command_evidence)
    sub.add_parser("observe-build").set_defaults(run=command_observe)
    sub.add_parser("baseline").set_defaults(run=command_baseline)
    sub.add_parser("notify").set_defaults(run=command_notify)
    context = sub.add_parser("context"); context.add_argument("--output", required=True); context.set_defaults(run=command_context)
    args = parser.parse_args()
    args.run(args)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        sys.exit("BLOCKED: %s" % error)

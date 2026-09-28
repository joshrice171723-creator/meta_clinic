#!/usr/bin/env python3
"""Trusted QA merge/release policy. Never execute code or expressions from a PR."""
import argparse
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPOSITORY = "joshrice171723-creator/meta_clinic"
OWNER = "joshrice171723-creator"
REQUIRED_JOBS = {
    "agent_docs", "scan_ruby", "lint", "rails_test (0)", "rails_test (1)",
    "backend_contracts", "frontend", "portable_delivery",
}
MARKER = "<!-- meta-clinic-auto-fix-attempt -->"
SHA = re.compile(r"[0-9a-f]{40}\Z")


class Blocked(RuntimeError):
    pass


class GitHub:
    def __init__(self, token):
        if not token:
            raise Blocked("GitHub credential is unavailable")
        self.token = token.strip()

    def request(self, path, method="GET", data=None):
        request = urllib.request.Request(
            f"https://api.github.com/repos/{REPOSITORY}/{path}",
            data=None if data is None else json.dumps(data).encode(), method=method,
            headers={"Authorization": f"Bearer {self.token}",
                     "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28",
                     "User-Agent": "meta-clinic-qa-release"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            # Do not echo URLs, tokens, response bodies or user-controlled messages.
            raise Blocked(f"GitHub request failed (HTTP {error.code})") from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            raise Blocked("GitHub request failed or returned invalid JSON") from None

    def pages(self, path, key=None):
        result = []
        for page in range(1, 101):
            separator = "&" if "?" in path else "?"
            payload = self.request(f"{path}{separator}per_page=100&page={page}")
            entries = payload[key] if key else payload
            result.extend(entries)
            if len(entries) < 100:
                return result
        raise Blocked("GitHub result exceeded the pagination bound")

    def main(self):
        return self.request("git/ref/heads/main")["object"]["sha"]

    def candidate(self, run_id):
        artifacts = self.pages(f"actions/runs/{run_id}/artifacts", "artifacts")
        artifacts = [a for a in artifacts if a["name"] == "ci-candidate" and not a["expired"]]
        if len(artifacts) != 1 or artifacts[0]["size_in_bytes"] > 65536:
            raise Blocked("CI candidate evidence is missing or ambiguous")

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        req = urllib.request.Request(
            f"https://api.github.com/repos/{REPOSITORY}/actions/artifacts/{artifacts[0]['id']}/zip",
            headers={"Authorization": f"Bearer {self.token}", "User-Agent": "meta-clinic-qa-release"})
        try:
            urllib.request.build_opener(NoRedirect).open(req, timeout=30)
        except urllib.error.HTTPError as error:
            if error.code != 302:
                raise Blocked("Cannot read CI candidate artifact") from None
            location = error.headers.get("Location", "")
        else:
            raise Blocked("Unexpected artifact download response")
        if urllib.parse.urlparse(location).scheme != "https":
            raise Blocked("Artifact redirect is not HTTPS")
        # The signed redirect is fetched WITHOUT the repository Authorization header.
        with urllib.request.urlopen(location, timeout=30) as response:
            data = response.read(65537)
        if len(data) > 65536:
            raise Blocked("Candidate artifact is too large")
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) != 1 or entries[0].filename != "ci-candidate.json" or entries[0].file_size > 4096:
                raise Blocked("Candidate artifact has unexpected contents")
            return json.loads(archive.read(entries[0]))


def allowed_path(path):
    parts = PurePosixPath(path).parts
    if not parts or any(p.startswith(".") or p in ("AGENTS.md", "AGENTS.override.md") for p in parts):
        return False
    # All database changes (including ostensibly safe migrations) need manual review.
    # Build tools, dependencies, workflows, infra, public HTML/scripts and secrets are excluded.
    return (
        path.startswith("apps/api/app/") and path.endswith(".rb")
        or path.startswith("apps/web/src/") and path.endswith((".ts", ".tsx", ".css"))
    )


def validate_files(files, expected_count=None):
    if not files or (expected_count is not None and len(files) != expected_count):
        raise Blocked("Changed-file inventory is empty or incomplete")
    for entry in files:
        paths = [entry["filename"]]
        if entry.get("previous_filename"):
            paths.append(entry["previous_filename"])
        if not all(allowed_path(path) for path in paths):
            raise Blocked("Change includes paths outside the application-code allowlist")


def qa_notes(body):
    body = body or ""
    issue = re.findall(r"^QA-Issue:\s*#([1-9][0-9]*)\s*$", body, re.M)
    if len(issue) != 1:
        raise Blocked("PR needs exactly one QA-Issue: #NUMBER")
    heading = "### Notes for QA\n"
    body = body.replace("\r\n", "\n")
    if body.count(heading) != 1:
        raise Blocked("PR needs exactly one Notes for QA section")
    section = body.split(heading, 1)[1].split("\n### ", 1)[0]
    notes = {}
    for key, title in (("changed", "What changed"), ("retest", "What to retest"),
                       ("tradeoffs", "Intentional behavior / trade-offs")):
        marker = f"#### {title}\n"
        if section.count(marker) != 1:
            raise Blocked(f"Notes for QA needs {title}")
        value = section.split(marker, 1)[1].split("\n#### ", 1)[0].strip()
        if not value or len(value) > 4000 or value.lower() in {"todo", "tbd", "..."}:
            raise Blocked("Notes for QA contains missing or placeholder content")
        notes[key] = value
    return int(issue[0]), notes


def check_ci(api, revision, event, merge_sha=None):
    query = {"head_sha": revision}
    if event != "main":
        query["event"] = event
    runs = api.pages("actions/workflows/ci.yml/runs?" + urllib.parse.urlencode(query), "workflow_runs")
    runs = [r for r in runs if r["head_sha"] == revision and (
        r["event"] == event if event != "main" else
        r["event"] in {"push", "workflow_dispatch"} and r["head_branch"] == "main")]
    if not runs:
        raise Blocked("No CI run exists for the exact candidate")
    run = max(runs, key=lambda r: (r["run_number"], r.get("run_attempt", 1)))
    if run["status"] != "completed" or run["conclusion"] != "success":
        raise Blocked("Latest CI for the exact candidate is not green")
    jobs = api.pages(f"actions/runs/{run['id']}/jobs?filter=latest", "jobs")
    if {j["name"] for j in jobs} != REQUIRED_JOBS or any(
        j["status"] != "completed" or j["conclusion"] != "success" or not j.get("steps") for j in jobs
    ):
        raise Blocked("Required CI jobs are missing, skipped, stale or failed")
    candidate = api.candidate(run["id"])
    if candidate.get("sha") != (merge_sha or revision):
        raise Blocked("CI did not check out the exact candidate revision")
    if merge_sha and candidate.get("head") != revision:
        raise Blocked("CI evidence refers to a different PR head")
    return run["id"]


def pr_contract(api, pr):
    if pr["base"]["ref"] != "main" or pr["head"]["repo"]["full_name"] != REPOSITORY:
        raise Blocked("Only same-repository fixes targeting main are eligible")
    if pr["user"]["login"] != OWNER or "auto-fix" not in {x["name"] for x in pr["labels"]}:
        raise Blocked("Fix is not owner-authored and labeled auto-fix")
    issue, notes = qa_notes(pr.get("body"))
    ticket = api.request(f"issues/{issue}")
    if ticket.get("pull_request") or ticket["user"]["login"] != OWNER:
        raise Blocked("QA-Issue must identify an owner-filed bug in this repository")
    files = api.pages(f"pulls/{pr['number']}/files")
    validate_files(files, pr["changed_files"])
    return issue, notes


def reserve_attempt(api, issue, pr):
    comments = api.pages(f"issues/{issue}/comments")
    attempts = {}
    for comment in comments:
        if not comment["body"].startswith(MARKER) or comment["user"]["login"] != "github-actions[bot]":
            continue
        try:
            item = json.loads(comment["body"].split("\n", 1)[1])
            attempts[(item["pr"], item["head"])] = item
        except (KeyError, ValueError, IndexError):
            raise Blocked("Attempt ledger is malformed; inspect the issue") from None
    key = (pr["number"], pr["head"]["sha"])
    if key in attempts:
        return
    if len(attempts) >= 3:
        limit_marker = "<!-- meta-clinic-auto-fix-limit -->"
        if not any(c["body"].startswith(limit_marker) and c["user"]["login"] == "github-actions[bot]"
                   for c in comments):
            api.request(f"issues/{issue}/comments", "POST", {"body": limit_marker +
                        "\nThree automatic fix candidates were attempted. Stop automated repairs for this issue; human review is required."})
        raise Blocked("Three automatic fix candidates already attempted for this issue; human review required")
    api.request(f"issues/{issue}/comments", "POST", {"body": MARKER + "\n" + json.dumps(
        {"pr": key[0], "head": key[1], "attempt": len(attempts) + 1}, sort_keys=True)})


def auto_merge(api, number):
    pr = api.request(f"pulls/{number}")
    if pr["state"] != "open" or pr["draft"]:
        return
    issue, _ = pr_contract(api, pr)
    # Serialize all attempts using the workflow's repository-wide concurrency group.
    reserve_attempt(api, issue, pr)
    if pr["mergeable"] is not True or pr["base"]["sha"] != api.main():
        raise Blocked("Merge candidate is conflicting, unknown or behind current main")
    head, base, merged = pr["head"]["sha"], pr["base"]["sha"], pr["merge_commit_sha"]
    check_ci(api, head, "pull_request", merged)
    merge = api.request(f"git/commits/{merged}")
    if [p["sha"] for p in merge["parents"]] != [base, head]:
        raise Blocked("Tested merge commit does not have the expected base and head")
    current = api.request(f"pulls/{number}")
    if (current["head"]["sha"], current["base"]["sha"], current["merge_commit_sha"], current["body"],
        current["state"], current["draft"]) != (head, base, merged, pr["body"], "open", False):
        raise Blocked("PR changed while its merge was being checked")
    if "auto-fix" not in {x["name"] for x in current["labels"]}:
        raise Blocked("auto-fix label was removed")
    # Fast-forward to the EXACT tested merge object. A concurrent main advance fails
    # the non-force update instead of creating an untested merge against a new base.
    # Normal repository protections still apply; never bypass them or force-push.
    api.request("git/refs/heads/main", "PATCH", {"sha": merged, "force": False})
    # GITHUB_TOKEN pushes don't trigger push CI. workflow_dispatch explicitly does.
    api.request("actions/workflows/ci.yml/dispatches", "POST", {"ref": "main"})
    print(f"Merged PR #{number}; dispatched main CI. Deployment waits for that exact revision.")


def release_plan(api, previous):
    revision = api.main()
    if revision == previous:
        return None
    check_ci(api, revision, "main")
    comparison = api.request(f"compare/{previous}...{revision}")
    if comparison["status"] != "ahead" or comparison["total_commits"] > 100:
        raise Blocked("Candidate does not advance the deployed revision within the bounded history")
    if len(comparison.get("commits", [])) != comparison["total_commits"]:
        raise Blocked("Deployment commit inventory is incomplete")
    files = comparison.get("files", [])
    if len(files) >= 300:  # Compare API caps files at 300; never accept a partial inventory.
        raise Blocked("Deployment change inventory may be truncated")
    validate_files(files)
    notes, seen_prs = [], set()
    # Every new commit must be covered by an eligible merged PR. No silent direct pushes.
    covered = set()
    for commit in comparison["commits"]:
        sha = commit["sha"]
        if sha in covered:
            continue
        matches = api.pages(f"commits/{sha}/pulls")
        matches = [p for p in matches if p.get("merged_at") and p["base"]["ref"] == "main"]
        if not matches:
            raise Blocked("Main contains a commit without a merged QA fix PR")
        pr = api.request(f"pulls/{matches[0]['number']}")
        issue, detail = pr_contract(api, pr)
        covered.add(pr["merge_commit_sha"])
        covered.update(c["sha"] for c in api.pages(f"pulls/{pr['number']}/commits"))
        if pr["number"] not in seen_prs:
            notes.append({"issue": issue, "pr": pr["number"], **detail})
            seen_prs.add(pr["number"])
    return {"sha": revision, "previous_sha": previous, "event": "deployment",
            "summary": "; ".join(f"QA issue #{n['issue']} (PR #{n['pr']})" for n in notes),
            "notes_for_qa": notes}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["merge"])
    args = parser.parse_args()
    api = GitHub(os.environ.get("GITHUB_TOKEN"))
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    if event.get("pull_request"):
        numbers = [event["pull_request"]["number"]]
    elif event.get("workflow_run"):
        numbers = [p["number"] for p in event["workflow_run"].get("pull_requests", [])]
    else:
        numbers = []
    if not numbers:
        numbers = [p["number"] for p in api.pages("pulls?state=open&base=main")
                   if "auto-fix" in {label["name"] for label in p["labels"]}]
    for number in numbers:
        try:
            auto_merge(api, number)
        except Blocked as error:
            print(f"PR #{number}: BLOCKED: {error}")
            print(f"::warning::PR #{number} is blocked; see the workflow summary")
            # A workflow warning/summary is visible to the owner; no recursive comments.
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
                summary.write(f"PR #{number}: **Blocked** — {error}\n\n")


if __name__ == "__main__":
    try:
        main()
    except Blocked as error:
        sys.exit(f"BLOCKED: {error}")
    except Exception:
        sys.exit("BLOCKED: Unexpected API/evidence error; no further automatic action")

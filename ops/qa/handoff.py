"""Local Muse QA ledger and guarded merge. No deployment or model invocation."""
import argparse
import base64
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import subprocess
import sys
import urllib.request

REPO = "joshrice171723-creator/meta_clinic"
OWNER = "joshrice171723-creator"
LABEL = "muse-qa"
SHA = re.compile(r"[0-9a-f]{40}")
RETEST = "<!-- muse-qa-retest-v1 -->"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run(*args):
    return subprocess.check_output(args, text=True, encoding="utf-8").strip()


def api(path, method="GET", data=None):
    args = ["gh", "api", f"repos/{REPO}/{path}", "--method", method]
    if data is not None:
        args += ["--input", "-"]
    result = subprocess.run(args, input=json.dumps(data) if data is not None else None,
                            capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(result.stdout) if result.stdout.strip() else None


def pages(path):
    result = []
    for page in range(1, 101):
        rows = api(f"{path}{'&' if '?' in path else '?'}per_page=100&page={page}")
        require(isinstance(rows, list), "Expected a paginated list")
        result.extend(rows)
        if len(rows) < 100:
            return result
    raise ValueError("GitHub inventory exceeded pagination bound")


def labeled(item):
    return LABEL in {x["name"] for x in item["labels"]}


def contract(number):
    pr = api(f"pulls/{number}")
    require(pr["state"] == "open" and not pr["draft"], "PR must be open and ready")
    require(pr["user"]["login"] == OWNER and labeled(pr), "PR needs owner author and muse-qa label")
    require(pr["base"]["ref"] == "main" and pr["head"]["repo"]["full_name"] == REPO,
            "Only same-repository PRs into main are eligible")
    require(pr["head"]["ref"].startswith("codex/muse-qa-"), "Branch must start codex/muse-qa-")
    body = (pr.get("body") or "").replace("\r\n", "\n")
    require("<!-- muse-qa-v1 -->" in body, "Missing Muse QA protocol marker")
    issue_lines = re.findall(r"^QA-Issues: (#[1-9][0-9]*(?:, #[1-9][0-9]*)*)$", body, re.M)
    require(len(issue_lines) == 1, "Use exactly one QA-Issues: #123, #124 line")
    issues = list(dict.fromkeys(int(x) for x in re.findall(r"[0-9]+", issue_lines[0])))
    require(issues, "Batch must contain stable defect issues")
    tickets = []
    for number in issues:
        ticket = api(f"issues/{number}")
        require(not ticket.get("pull_request") and ticket["user"]["login"] == OWNER and labeled(ticket),
                f"Defect #{number} must be an owner-filed muse-qa issue")
        prior = re.findall(r"^Prior-Attempts: ([0-3])$", ticket.get("body") or "", re.M)
        require(len(prior) == 1, f"Defect #{number} needs Prior-Attempts: 0..3 (include previous cloud repairs)")
        marker = f"### Notes for QA: #{number}\n"
        require(body.count(marker) == 1, f"Missing unique Notes for QA for #{number}")
        section = body.split(marker)[1].split("\n### ")[0]
        for title in ("What changed", "What to retest", "Intentional trade-offs"):
            detail = re.findall(rf"^{title}: (.+)$", section, re.M)
            require(len(detail) == 1 and detail[0].strip().lower() not in {"todo", "tbd", "..."},
                    f"Defect #{number} needs substantive {title}")
        tickets.append((number, int(prior[0])))
    files = pages(f"pulls/{pr['number']}/files")
    require(files and len(files) == pr["changed_files"], "Incomplete changed-file inventory")
    for item in files:
        for path in (item["filename"], item.get("previous_filename", item["filename"])):
            if path == "apps/web/package.json":
                versions = []
                packages = []
                for ref in (pr["base"]["sha"], pr["head"]["sha"]):
                    content = api(f"contents/{path}?ref={ref}")
                    package = json.loads(base64.b64decode(content["content"]))
                    versions.append(package.pop("version", ""))
                    packages.append(package)
                require(packages[0] == packages[1] and all(re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", v) for v in versions),
                        "Only package version changes are automatically eligible")
                continue
            parts = PurePosixPath(path).parts
            allowed = ((path.startswith(("apps/api/app/", "apps/api/test/")) and path.endswith(".rb"))
                       or (path.startswith(("apps/web/src/", "apps/web/test/")) and path.endswith((".ts", ".tsx", ".css"))))
            require(allowed and all(not p.startswith(".") and p != "AGENTS.md" for p in parts),
                    f"Manual review required for path: {path}")
    require(pr["mergeable"] is True and SHA.fullmatch(pr.get("merge_commit_sha") or ""),
            "Mergeability unknown or conflicting; wait or escalate, never force")
    return pr, tickets


def ci_evidence(head):
    checks = api(f"commits/{head}/check-runs?per_page=100")
    require(checks["total_count"] < 100, "Check inventory may be truncated")
    rows = checks["check_runs"]
    require(rows, "No CI evidence; manual review required")
    evidence = []
    for check in rows:
        require(check["status"] == "completed", "CI is still pending")
        if check["conclusion"] == "success":
            continue
        annotations = pages(f"check-runs/{check['id']}/annotations")
        job = api(f"actions/jobs/{check['id']}")
        billing = any("recent account payments have failed or your spending limit" in a.get("message", "")
                      for a in annotations)
        require(check["conclusion"] == "failure" and billing and job.get("steps") == [],
                f"CI {check['name']} failed or was skipped without verified pre-start billing evidence")
        evidence.append({"check": check["name"], "id": check["id"], "reason": "billing prevented start"})
    return evidence


def candidate(db, number, head):
    row = db.execute("SELECT * FROM candidates WHERE pr=? AND head=?", (number, head)).fetchone()
    require(row is not None, "Reserve this exact candidate before review")
    return row


def comment_once(number, marker, body):
    if not any(c["user"]["login"] == OWNER and c["body"].startswith(marker)
               for c in pages(f"issues/{number}/comments")):
        api(f"issues/{number}/comments", "POST", {"body": marker + "\n" + body})


def reserve(db, number):
    pr, tickets = contract(number)
    head = pr["head"]["sha"]
    with db:
        db.execute("BEGIN IMMEDIATE")
        for issue, prior in tickets:
            db.execute("INSERT OR IGNORE INTO defects VALUES (?,?)", (issue, prior))
            require(db.execute("SELECT prior FROM defects WHERE issue=?", (issue,)).fetchone()[0] == prior,
                    f"Prior attempts changed for #{issue}; inspect ledger")
        existing = db.execute("SELECT 1 FROM candidates WHERE pr=? AND head=?", (number, head)).fetchone()
        counts = {}
        for issue, prior in tickets:
            used = db.execute("SELECT COUNT(*) FROM attempts WHERE issue=?", (issue,)).fetchone()[0]
            require(existing or prior + used < 3, f"Defect #{issue} reached three repair candidates; escalate")
            counts[issue] = prior + used + (0 if existing else 1)
        if not existing:
            db.execute("INSERT INTO candidates(pr,head,base,merge_sha,issues,status) VALUES (?,?,?,?,?,?)",
                       (number, head, pr["base"]["sha"], pr["merge_commit_sha"], json.dumps([i for i, _ in tickets]), "reserved"))
            db.executemany("INSERT INTO attempts VALUES (?,?,?)", [(i, number, head) for i, _ in tickets])
        else:
            row = candidate(db, number, head)
            require(row["issues"] == json.dumps([i for i, _ in tickets]), "Defect list changed on reserved candidate")
            if (row["base"], row["merge_sha"]) != (pr["base"]["sha"], pr["merge_commit_sha"]):
                db.execute("UPDATE candidates SET base=?,merge_sha=?,status='reserved',evidence=NULL WHERE pr=? AND head=?",
                           (pr["base"]["sha"], pr["merge_commit_sha"], number, head))
    comment_once(number, f"<!-- muse-qa-candidate:{head} -->",
                 f"Local review reserved `{head}`. Repair attempts by defect: {json.dumps(counts)}. "
                 "Merged, deployed and browser-verified remain separate states.")
    print(json.dumps(dict(candidate(db, number, head))))


def approve(db, number, head, evidence_path):
    pr, tickets = contract(number)
    row = candidate(db, number, head)
    require((pr["head"]["sha"], pr["base"]["sha"], pr["merge_commit_sha"]) ==
            (head, row["base"], row["merge_sha"]), "Candidate/base changed; reserve and review current candidate")
    evidence = json.loads(Path(evidence_path).read_text(encoding="utf-8-sig"))
    require(evidence.get("head") == head and evidence.get("merge_sha") == row["merge_sha"] and
            evidence.get("source_review") == "pass" and evidence.get("findings") == [], "Source review is incomplete")
    checks = evidence.get("checks", [])
    require(checks and all(c.get("command") and c.get("result") == "pass" for c in checks), "Scoped checks must pass")
    require(evidence.get("notes"), "Record changed-path coverage and remaining browser proof")
    evidence["ci_infrastructure_failures"] = ci_evidence(head)
    evidence["pr_body"] = pr["body"]
    require(run("git", "rev-parse", "HEAD") == row["merge_sha"] and not run("git", "status", "--porcelain"),
            "Review checkout must be clean at the exact merge candidate")
    with db:
        db.execute("UPDATE candidates SET evidence=?,status='reviewed' WHERE pr=? AND head=?",
                   (json.dumps(evidence), number, head))
    print("reviewed " + head)


def merge(db, number, head):
    pr, tickets = contract(number)
    row = candidate(db, number, head)
    require(row["status"] == "reviewed" and row["evidence"], "No passing local review receipt")
    require(json.loads(row["evidence"])["pr_body"] == pr["body"], "QA notes changed since review")
    require((pr["head"]["sha"], pr["base"]["sha"], pr["merge_commit_sha"], json.dumps([i for i, _ in tickets])) ==
            (head, row["base"], row["merge_sha"], row["issues"]), "PR changed since review")
    require(run("git", "rev-parse", "HEAD") == row["merge_sha"] and not run("git", "status", "--porcelain"),
            "Checkout changed since review")
    parents = api(f"git/commits/{row['merge_sha']}")["parents"]
    require([p["sha"] for p in parents] == [row["base"], head], "Unexpected merge candidate parents")
    require(api("git/ref/heads/main")["object"]["sha"] == row["base"], "Main advanced; review new merge candidate")
    ci_evidence(head)
    # A normal fast-forward to the reviewed merge object fails if main races ahead.
    api("git/refs/heads/main", "PATCH", {"sha": row["merge_sha"], "force": False})
    with db:
        db.execute("UPDATE candidates SET status='merged' WHERE pr=? AND head=?", (number, head))
    comment_once(number, f"<!-- muse-qa-merged:{head} -->",
                 f"Locally reviewed and merged `{row['merge_sha']}`. Publisher will deploy through its existing recovery gate. "
                 "Browser retest is pending; wait for /build.json to identify the deployed commit.")
    print("merged " + row["merge_sha"])


def sync(db):
    with urllib.request.urlopen("https://aimetaclinic.com/build.json", timeout=20) as response:
        build = json.load(response)
    deployed = build.get("revision", "")
    require(SHA.fullmatch(deployed), "Public build identity is absent or invalid")
    with urllib.request.urlopen("https://aimetaclinic.com/up", timeout=20) as response:
        require(response.status == 200, "Public health check failed")
    run("git", "fetch", "origin", "main", "--quiet")
    for row in db.execute("SELECT * FROM candidates WHERE status IN ('reviewed','merged','deployed','failed','passed')").fetchall():
        if subprocess.run(["git", "merge-base", "--is-ancestor", row["merge_sha"], deployed], capture_output=True).returncode:
            continue
        results = {}
        for c in pages(f"issues/{row['pr']}/comments"):
            if c["user"]["login"] != OWNER or not c["body"].startswith(RETEST):
                continue
            data = json.loads(c["body"][len(RETEST):].strip())
            if data.get("revision") != deployed:
                continue
            require(data.get("head") == row["head"], "Retest head does not match candidate")
            for result in data.get("defects", []):
                require(result.get("issue") in json.loads(row["issues"]) and result.get("status") in ("passed", "failed")
                        and result.get("evidence"), "Retest needs issue, status and observed browser evidence")
                results[result["issue"]] = result
        state = ("failed" if any(r["status"] == "failed" for r in results.values()) else
                 "passed" if len(results) == len(json.loads(row["issues"])) else "deployed")
        with db:
            db.execute("UPDATE candidates SET status=?,deployed=?,retest=? WHERE pr=? AND head=?",
                       (state, deployed, json.dumps(results), row["pr"], row["head"]))
            db.execute("INSERT OR REPLACE INTO observations VALUES (?,?,?,?)",
                       (row["pr"], row["head"], deployed, json.dumps(results)))
        comment_once(row["pr"], f"<!-- muse-qa-deployed:{deployed}:{row['head']} -->",
                     f"Deployed build `{deployed}` includes candidate `{row['head']}`. "
                     "Muse: hard-reload, retest each defect, and post the documented muse-qa-retest-v1 result. "
                     "This is deployment evidence, not a browser acceptance claim.")
    print(json.dumps([dict(r) for r in db.execute("SELECT * FROM candidates")]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["scan", "reserve", "approve", "reject", "merge", "sync", "status"])
    parser.add_argument("--pr", type=int)
    parser.add_argument("--head")
    parser.add_argument("--evidence")
    parser.add_argument("--reason")
    args = parser.parse_args()
    state = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "automations/meta-clinic-muse-qa-review/state.sqlite3"
    state.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(state, timeout=30) as db:
        db.row_factory = sqlite3.Row
        db.executescript("""
            CREATE TABLE IF NOT EXISTS defects(issue INTEGER PRIMARY KEY, prior INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS attempts(issue INTEGER, pr INTEGER, head TEXT, PRIMARY KEY(issue,pr,head));
            CREATE TABLE IF NOT EXISTS candidates(pr INTEGER, head TEXT, base TEXT, merge_sha TEXT, issues TEXT,
                status TEXT, evidence TEXT, deployed TEXT, retest TEXT, PRIMARY KEY(pr,head));
            CREATE TABLE IF NOT EXISTS observations(pr INTEGER, head TEXT, revision TEXT, results TEXT,
                PRIMARY KEY(pr,head,revision));
        """)
        if args.command == "scan":
            for pr in pages("pulls?state=open&base=main"):
                if labeled(pr):
                    try:
                        item, tickets = contract(pr["number"])
                        print(json.dumps({"pr": item["number"], "head": item["head"]["sha"], "issues": tickets}))
                    except ValueError as error:
                        print(f"BLOCKED PR #{pr['number']}: {error}")
        elif args.command == "status":
            print(json.dumps([dict(r) for r in db.execute("SELECT * FROM candidates")]))
        elif args.command == "sync":
            sync(db)
        else:
            require(args.pr and args.pr > 0, "--pr is required")
            if args.command == "reserve":
                reserve(db, args.pr)
            else:
                require(args.head and SHA.fullmatch(args.head), "--head must be a full commit SHA")
                if args.command == "approve":
                    require(args.evidence, "--evidence is required")
                    approve(db, args.pr, args.head, args.evidence)
                elif args.command == "reject":
                    require(args.reason, "--reason is required")
                    candidate(db, args.pr, args.head)
                    with db:
                        db.execute("UPDATE candidates SET status='rejected',evidence=? WHERE pr=? AND head=?",
                                   (json.dumps({"reason": args.reason}), args.pr, args.head))
                    comment_once(args.pr, f"<!-- muse-qa-rejected:{args.head} -->", args.reason)
                else:
                    merge(db, args.pr, args.head)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f"BLOCKED: {error}")

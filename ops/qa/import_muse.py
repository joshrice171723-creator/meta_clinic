#!/usr/bin/env python3
"""Normalize Muse exports without inventing IDs, screenshots, or current verdicts."""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

SHA = re.compile(r"\b[0-9a-f]{40}\b")
STATUSES = {"FIXED": "passed", "STILL BROKEN": "failed", "PARTIAL": "partial",
            "BLOCKED": "blocked", "EXPECTED CONFIG": "expected-config", "NOT RETESTED": "not-retested"}


def scrub(text):
    text = re.sub(r"(?i)\b(PIN|passcode|password|bearer|service[_ -]?token)\s*[:=]?\s*[\"']?([A-Za-z0-9_+/=-]{4,})", r"\1 [REDACTED]", text)
    return re.sub(r"(?i)([?&](?:token|secret|password|activation_token)=)[^\s&\"<>]+", r"\1[REDACTED]", text)


def source(path):
    raw = Path(path).read_bytes()
    return scrub(raw.decode("utf-8-sig")), {"file": Path(path).name, "sha256": hashlib.sha256(raw).hexdigest()}


def known_issues(text):
    records, section, current = [], None, None
    for line_number, raw in enumerate(text.splitlines(), 1):
        line = re.sub(r"^#{1,6}\s+", "", raw.strip())
        if line == "Open":
            section = "open"
            continue
        if line.startswith("Pending-verify ("):
            section = "awaiting-retest"
            continue
        if line == "Fixed (verified)":
            section = "passed"
            continue
        if line.startswith("Update log /"):
            section = None
            continue
        if line.startswith("Test fixtures ("):
            break
        if not section or not line:
            continue
        # Export flattened numbered Markdown: never infer an issue ID from its position.
        if line.startswith(("RE-CONFIRMED", "UPDATED", "NOTE", "WATCH", "RETESTED", "JOSHUA", "SUBMITTED", "FIXED 20", "CORRECTION")):
            if current:
                current["notes"] += "\n" + line
            continue
        title = re.split(r"\s[—–]\s|\(First seen", line, maxsplit=1)[0].strip()
        explicit = re.match(r"(?:\*\*)?#?(\d+)[.)]\s+", line) or re.search(r"\(#(\d+)\)", title) or re.search(r"closes #(\d+)", line)
        gh = re.search(r"(?:GitHub issue|GH) #(\d+)", line)
        seen = re.search(r"First seen (\d{4}-\d{2}-\d{2})", line)
        revisions = SHA.findall(line)
        attempts = re.findall(r"Prior-Attempts:\s*(\d+)", line)
        current = {"id": "muse-source-" + hashlib.sha256(title.encode()).hexdigest()[:12],
                   "title": title, "status": section, "owner": "Muse", "notes": line,
                   "source_line": line_number, "first_seen": seen.group(1) if seen else None,
                   "revision": revisions[-1] if revisions else None,
                   "prior_attempts": int(attempts[-1]) if attempts else 0,
                   "muse_qa_id": int(explicit.group(1)) if explicit else None,
                   "github_issue": int(gh.group(1)) if gh else None,
                   "evidence_refs": [], "historical": True}
        records.append(current)
    return records


def retest(text):
    revision = SHA.search(text).group() if SHA.search(text) else None
    rows = {n: {"id": f"muse-{n}", "muse_qa_id": n, "title": f"Muse QA #{n}",
                "status": "pending", "owner": "Unassigned", "revision": revision,
                "evidence_refs": [], "historical": True,
                "notes": "No result supplied in the exported 70-issue tally."} for n in range(1, 71)}
    for line in text.splitlines():
        for label, status in STATUSES.items():
            if line.startswith(label + ":") or line.startswith(label + " ("):
                for number in re.findall(r"#(\d+)\b", line):
                    n = int(number)
                    if n in rows:
                        rows[n].update(status=status, notes=line)
    batches, candidates = [], []
    for line in text.splitlines():
        match = re.match(r"([JM][1-4]) \(([^)]*)\):?", line)
        if not match:
            continue
        key, detail = match.groups()
        owner = "Jack" if key.startswith("J") else "Muse"
        stamp = re.search(r"(\d{2}:\d{2}) UTC", detail)
        observed = f"2026-09-29T{stamp.group(1)}:00Z" if stamp else None
        if not stamp:
            continue
        batches.append({"id": key, "owner": owner, "status": "retested", "revision": revision,
                        "observed_at": observed, "notes": line, "historical": True})
        result_text = line.split("New candidates:")[0]
        for value in re.findall(r"#(\d+)\b", result_text):
            if int(value) in rows:
                rows[int(value)].update(owner=owner, source_batch=key, evidence_at=observed)
        for result in re.finditer(r"#(\d+)(?:/#(\d+))?\s*\(([^)]*)\)", result_text):
            for value in result.group(1, 2):
                if value and int(value) in rows:
                    rows[int(value)].update(owner=owner, source_batch=key, evidence_at=observed,
                                            evidence=result.group(3), notes=result.group(3))
        for candidate in re.finditer(r"([JM][1-4]-NC\d+)\s*\(([^)]*)\)", line):
            candidates.append({"id": candidate.group(1), "title": candidate.group(2), "status": "candidate",
                               "owner": owner, "revision": revision, "source_batch": key,
                               "first_seen": observed, "notes": candidate.group(2), "historical": True,
                               "evidence_refs": []})
    return list(rows.values()), batches, candidates, revision


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--known-issues", required=True)
    parser.add_argument("--retest", required=True)
    parser.add_argument("--coverage", help="Actual expanded COVERAGE_STATE.json, not a collapsed chat excerpt")
    parser.add_argument("--batch", help="Actual BATCH_STATE.json")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    issues_text, issues_source = source(args.known_issues)
    retest_text, retest_source = source(args.retest)
    rows, sweeps, candidates, revision = retest(retest_text)
    # One runnable consistency check guards the import contract, without claiming browser acceptance.
    assert len(rows) == 70 and len({row["muse_qa_id"] for row in rows}) == 70
    state = {"schema_version": 1, "last_qa_revision": revision,
             "pinned_build": {"version": "0.1.9", "revision": revision},
             "last_run_at": "2026-09-29T05:38:00Z", "imported_at": datetime.now(timezone.utc).isoformat(),
             "known_issues": known_issues(issues_text), "retest": rows, "sweep_batches": sweeps,
             "candidates": candidates, "batches": [], "coverage": [], "releases": [],
             "coverage_expected_total": 116, "coverage_pointer": 23,
             "coverage_updated_at": "2026-09-28T22:48:51-05:00",
             "coverage_import_status": "collapsed-export",
             "sources": {"known_issues": issues_source, "retest": retest_source},
             "import_notes": ["Historical Muse export, not a fresh verification of the current build.",
                              "The final tally names 67 issues. Issues #5, #9 and #28 have no supplied verdict.",
                              "Screenshots were discarded by the original runs; no screenshot evidence is imported.",
                              "The known-issues paste lost list numbering. Unnumbered entries retain source IDs, never guessed Muse IDs.",
                              "Actual BATCH_STATE.json and expanded COVERAGE_STATE.json were not attached."]}
    if args.coverage:
        coverage_text, state["sources"]["coverage"] = source(args.coverage)
        coverage = json.loads(coverage_text)
        workflows = coverage.get("workflows", {})
        state["coverage"] = [dict(value, id=key) for key, value in workflows.items()] if isinstance(workflows, dict) else workflows
        state["coverage_pointer"] = coverage.get("pointer")
        state["coverage_import_status"] = "expanded-export"
    if args.batch:
        batch_text, state["sources"]["batch"] = source(args.batch)
        state["batches"] = [json.loads(batch_text)]
    Path(args.output).write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"known_issues": len(state["known_issues"]), "retest": len(rows), "batches": len(sweeps),
                      "candidates": len(candidates), "missing_verdicts": [r["muse_qa_id"] for r in rows if r["status"] == "pending"]}))


if __name__ == "__main__":
    main()

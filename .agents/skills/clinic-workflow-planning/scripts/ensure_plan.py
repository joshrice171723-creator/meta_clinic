#!/usr/bin/env python3
"""Create or refresh the single durable output for a clinic workflow assignment."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
import subprocess


REPO_ROOT = Path(__file__).resolve().parents[4]
OUTPUT_DIR = REPO_ROOT / "docs" / "development" / "clinic-workflow-plans"
SECTIONS = (
    "Assignment and authority",
    "Current sources and decisions",
    "Connected journey",
    "Fields and action rules",
    "Ownership and dependency matrix references",
    "Implementation and acceptance",
    "Checkpoint",
)
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
LAST_RUN = re.compile(r"(?ms)^## Last run\s*\n.*?(?=^## |\Z)")


def ensure_plan(output_dir: Path, slug: str, revision: str, run_at: str) -> Path:
    if not SLUG.fullmatch(slug):
        raise ValueError("Assignment slug must contain lowercase letters, digits, and single hyphens.")

    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"{slug}.md"
    last_run = (
        "## Last run\n\n"
        f"- Started (UTC): {run_at}\n"
        f"- Starting revision: `{revision}`\n"
        "- Outcome: In progress; complete this section before handoff.\n"
    )
    if path.exists():
        content = path.read_text(encoding="utf-8")
        if LAST_RUN.search(content):
            content = LAST_RUN.sub(lambda _: last_run, content, count=1)
        else:
            content = content.rstrip() + "\n\n" + last_run
    else:
        title = slug.replace("-", " ").title()
        content = f"# {title}\n"
        for section in SECTIONS:
            content += f"\n## {section}\n\nNot yet assessed in this run.\n"
        content += "\n" + last_run
    path.write_text(content.rstrip() + "\n", encoding="utf-8")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug", help="Stable lowercase hyphenated assignment name")
    args = parser.parse_args()
    revision = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    run_at = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    print(ensure_plan(OUTPUT_DIR, args.slug, revision, run_at))


if __name__ == "__main__":
    main()

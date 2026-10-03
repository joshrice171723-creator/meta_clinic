# Branch and task handoff workflow

## Handoff record

Provide a concise, reproducible record containing:

1. Requested outcome and explicit exclusions.
2. Branch/worktree and base commit; note concurrent work that was deliberately excluded.
3. Vault/instruction scope reviewed and material gaps or conflicts.
4. Files and behavior changed, including migrations/dependencies/environment effects.
5. Failure hypothesis and negative/recovery evidence for substantive work.
6. Commands actually run with outcomes; identify checks not run and why.
7. Current working-tree/diff state and whether commits, pushes, PRs or deployments occurred.
8. Remaining risks, gates, decisions and the safest next action.

Do not present summaries or screenshots as stronger evidence than the underlying command, source, environment or review. A clean handoff does not expand the next person's authority.

Before transfer, run `git status --short`, inspect `git diff`/`git diff --cached`, and use `bin/agent-check`. Preserve unrelated work and task ownership.

## Coding agent return and parent relay

Every coding subagent returning to a parent reports, in the existing task handoff:

- Actual changed repository paths and the outcome; provide a usable diff reference or commit/patch reference. Include the full base/head SHAs for a committed change, or the patch SHA-256 and its base when handing back a patch.
- Checks passed, failed and not run, including the check type and material evidence limits; list remaining blockers.
- Separate status for **coded**, **integrated**, **checked**, **pushed** and **live**. State only what occurred, and use not applicable or unknown where appropriate.

The parent relays concise, meaningful results and actionable blockers to the user; intermediate edits and private working notes do not need separate updates. Never create a report-only commit for an individual handoff. Do not include credentials, patient or other sensitive runtime data. Repository instructions govern only agents that read and follow them; they do not change host tools, impose global enforcement or authorize claims that the native Codex/ChatGPT UI changed.

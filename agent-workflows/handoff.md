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

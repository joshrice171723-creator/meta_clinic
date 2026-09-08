# Knowledge maintenance workflow

## When to use

Use for periodic vault/docs/records cleanup, note splitting, archival, lifecycle review or routing changes. This procedure does not authorize deleting evidence, changing a decision or requirement, or changing Shortcut Story status.

## Classify before moving

For each candidate, identify one owner:

| Kind | Destination |
| --- | --- |
| Stable agent policy or path routing | nearest `AGENTS.md` |
| Reusable agent procedure | `agent-harness/workflows/` |
| Focused on-demand agent capability | `.agents/skills/` |
| Current developer mechanics or architecture | `docs/`, application README or runbook |
| Current product direction, decision, risk or research | `APPlyVault/` |
| Roadmap, Story scope/acceptance, claim or status | Shortcut Agent Workspace |
| Detailed dated/superseded evidence | `records/` |
| Implemented behavior | source, tests, migrations and runbooks |

When content mixes kinds, split it and leave a concise pointer at any stable vault stem that owns inbound links.

## Safe cleanup cycle

1. Run `bin/vault-audit` and inspect inbound links, identifiers, frontmatter and exact headings before editing.
2. Classify candidates as keep, compact, move, merge, supersede or delete. Deletion requires proof that the content is generated/duplicate, has no unique evidence or required backlink, and is recoverable.
3. Preserve source/task/decision IDs, dates, limits, failures, incidents, migrations, recovery, security findings and professional/release boundaries. Never use cleanup to rewrite history.
4. Move current developer material to `docs/`; move full historical text to `records/`. Use repository-relative Markdown links across these boundaries and retain compatibility headings/pointers where vault links depend on them.
5. Keep `Decisions`, `Risks and Assumptions` and `Source Register` as single canonical vault registers. Keep the roadmap and all task-level tracking in Shortcut; compact vault entries without creating parallel registers.
6. Re-run `bin/verify-vault`, `bin/verify-agent-harness`, `bin/vault-audit` and `git diff --check`. Compare counts/bytes and confirm no IDs, unresolved items or evidence categories disappeared.
7. Record the disposition and measured result in a dated `records/` manifest and add one concise Progress Log entry.

## Ongoing budget

Treat audit sizes and procedure signals as prompts for review, not automatic deletion. Prefer a small active window plus archive indexes for append-only logs. Add `lifecycle` and `canonical_for` when touching a note deeply enough to confirm them. Review weakly linked and procedure-heavy notes quarterly or when the vault crosses its current size budget.

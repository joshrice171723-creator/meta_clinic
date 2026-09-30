# APPly agent workflow playbooks

These procedures are loaded on demand. Repository-wide authority and safety rules remain in [`../../AGENTS.md`](../../AGENTS.md); directory-specific rules remain in the nearest nested `AGENTS.md`.

| Task | Playbook |
| --- | --- |
| Ordinary application or tooling change | [`code-change.md`](code-change.md) |
| Continuing or recurring engineering with bounded Goals | [`persistent-engineering.md`](persistent-engineering.md) |
| Failure hypothesis, negative evidence and recovery | [`failure-first.md`](failure-first.md) |
| Vault note or workflow-document change | [`vault-change.md`](vault-change.md) |
| Vault/docs/records cleanup and archival | [`knowledge-maintenance.md`](knowledge-maintenance.md) |
| Migration, schema or data-transition work | [`database-change.md`](database-change.md) |
| External/public-source research | [`research.md`](research.md) |
| Hosted release, cutover or infrastructure action | [`release.md`](release.md) |
| Potential sensitive-data or security incident | [`incident.md`](incident.md) |
| Branch, review or agent handoff | [`handoff.md`](handoff.md) |

Use only the playbooks relevant to the task. When several apply, follow the strictest stop condition and keep implementation, verification and release as separate evidence events.

The repository scripts provide the deterministic layer:

- `bin/agent-preflight --path <target>` reports worktree state, applicable instruction files and vault routes.
- `bin/agent-check --path <target> --level <focused|component|integration>` lists scoped checks and unrelated dirty paths; add `--run` to execute, `--json` for structured output or `--staged` to inspect only indexed changes.
- `bin/verify-agent-harness` validates instructions, workflows and skills.
- `bin/verify-vault` validates vault structure, links and reachability; `bin/vault-audit` reports size, lifecycle, duplication and misplaced-procedure signals.

Agents whose runtime does not discover nested instructions or repository skills must read the nearest canonical files explicitly. Add a host adapter only after that host is selected; do not maintain speculative mirrors.

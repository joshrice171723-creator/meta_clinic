# APPly agent workflow playbooks

These procedures are loaded on demand. Repository-wide authority and safety rules remain in [`../AGENTS.md`](../AGENTS.md); directory-specific rules remain in the nearest nested `AGENTS.md`.

| Task | Playbook |
| --- | --- |
| Ordinary application or tooling change | [`code-change.md`](code-change.md) |
| Vault note or workflow-document change | [`vault-change.md`](vault-change.md) |
| Migration, schema or data-transition work | [`database-change.md`](database-change.md) |
| External/public-source research | [`research.md`](research.md) |
| Hosted release, cutover or infrastructure action | [`release.md`](release.md) |
| Potential sensitive-data or security incident | [`incident.md`](incident.md) |
| Branch, review or agent handoff | [`handoff.md`](handoff.md) |

Use only the playbooks relevant to the task. When several apply, follow the strictest stop condition and keep implementation, verification and release as separate evidence events.

The repository scripts provide the deterministic layer:

- `bin/agent-preflight --path <target>` reports worktree state, applicable instruction files and vault routes.
- `bin/agent-check` lists checks selected from changed paths; `bin/agent-check --run` runs them.
- `bin/verify-vault` validates vault and instruction-document structure.

Cline path-conditional adapters in `.clinerules/` point back to the canonical nested instructions. Hermes can progressively discover nested `AGENTS.md` files. Other agents must read the nearest instructions explicitly if their runtime does not discover them.

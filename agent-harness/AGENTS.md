# Agent harness maintenance instructions

These instructions apply to `agent-harness/` and extend the repository root contract.

- Keep the harness product-agnostic except for repository safety and routing. Put current APPly requirements, decisions, risks and evidence in `APPlyVault/`.
- Keep root and nested `AGENTS.md` files as the canonical always-on policy. Workflows and skills may refine a task but may not weaken authority, sensitive-data or release boundaries.
- Keep `.agents/skills/` canonical. Do not add host-specific skill mirrors unless the user selects and authorizes that host integration.
- Distinguish prompt guidance from runtime enforcement. Never claim that a skill changes tool availability, sandboxing, approvals or host mode.
- For third-party adaptations, record the upstream repository, exact revision, reviewed paths, license and material changes without importing unrelated upstream content.
- Run `bin/verify-agent-harness`, `bin/verify-vault` when vault links changed, and `git diff --check` before handoff.

Use [workflows/code-change.md](workflows/code-change.md) for harness scripts or CI changes and [workflows/handoff.md](workflows/handoff.md) for final review.

# Code change workflow

## When to use

Use for local application, test, build-tool or repository-script changes that are not themselves a database transition or hosted release.

## Procedure

1. Follow [`shortcut-task.md`](shortcut-task.md): inspect Agent Workspace for the same objective and overlapping active claims, then reuse or create and claim one bounded Story before editing.
2. Run `bin/agent-preflight --story sc-<id> --path <target>` for each area in scope and read the applicable nested instructions.
3. Use the vault TOC to review the relevant architecture, requirements, decisions, risks, acceptance contracts and evidence. Inspect current source/tests rather than relying on dated notes alone.
4. Define one observable outcome, explicit exclusions and the smallest reviewable diff.
5. Name the principal failure. For auth, tenancy, protected values, billing, signing, clinical workflow or auditing, use the complete [failure-first procedure](failure-first.md).
6. Implement without broad formatting, unrelated cleanup, new external authority or hidden fallbacks. For frontend UI, load the `frontend-ui` skill and follow the composition-first Material UI hierarchy in `apps/web/AGENTS.md`: prefer existing APPly components, MUI primitives and supported composition; use semantic HTML with scoped CSS when it is clearer; reserve dependency patches/forks for confirmed reusable upstream limitations.
7. Add or update tests for success, ownership, denial, validation, retry/concurrency and recovery cases that apply.
8. Run `bin/agent-check --path <target> --level component` (or the justified focused/integration level) and then the selected checks. Inspect the diff for secrets, sensitive content and unrelated work.
9. Update canonical vault records only when direction, requirements, risks, durable evidence or a decision changed; never mirror mutable Story status there.
10. Update the Shortcut Story with verification evidence and residual risks, move it to In Review or Done as warranted, and hand off using [`handoff.md`](handoff.md).

For a local runtime check, use the managed lifecycle documented in `APPlyVault/03 Execution/CICD.md`. Keep servers detached when the repository provides a managed background path, wait for the relevant readiness endpoint and preserve consequential startup failures instead of reporting an unverified workaround as success.

## Stop conditions

Stop the affected path for suspected sensitive data, unclear destructive scope, missing authority, incompatible concurrent edits, unexplained data loss, a bypassed permission boundary or falsely reported success. Continue independent safe work.

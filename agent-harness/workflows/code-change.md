# Code change workflow

## When to use

Use for local application, test, build-tool or repository-script changes that are not themselves a database transition or hosted release.

## Procedure

1. Run `bin/agent-preflight --path` for each area in scope and read the applicable nested instructions.
2. Use the vault TOC to review the relevant architecture, task, decision and evidence sections. Inspect current source/tests rather than relying on dated notes alone.
3. Define one observable outcome, explicit exclusions and the smallest reviewable diff.
4. Name the principal failure. For auth, tenancy, protected values, billing, signing, clinical workflow or auditing, record the full failure-first fields from `Working Agreement.md`.
5. Implement without broad formatting, unrelated cleanup, new external authority or hidden fallbacks. For frontend UI, load the `frontend-ui` skill and follow the Material UI implementation hierarchy in `apps/web/AGENTS.md` before creating or styling a control.
6. Add or update tests for success, ownership, denial, validation, retry/concurrency and recovery cases that apply.
7. Run `bin/agent-check` and then the selected checks. Inspect the diff for secrets, sensitive content and unrelated work.
8. Update canonical vault evidence only when project state, task status or a decision changed.
9. Hand off using [`handoff.md`](handoff.md).

For a local runtime check, use the managed lifecycle documented in `APPlyVault/03 Execution/CICD.md`. Keep servers detached when the repository provides a managed background path, wait for the relevant readiness endpoint and preserve consequential startup failures instead of reporting an unverified workaround as success.

## Stop conditions

Stop the affected path for suspected sensitive data, unclear destructive scope, missing authority, incompatible concurrent edits, unexplained data loss, a bypassed permission boundary or falsely reported success. Continue independent safe work.

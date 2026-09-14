# Code change workflow

## When to use

Use for local application, test, build-tool or repository-script changes that are not themselves a database transition or hosted release.

## Procedure

1. Run `bin/agent-preflight --path <target>` for each area in scope and read the applicable nested instructions.
2. Use the vault TOC to review the relevant architecture, requirements, decisions, risks, acceptance contracts and evidence. Inspect current source/tests rather than relying on dated notes alone.
3. Define one observable outcome, explicit exclusions and the smallest reviewable diff.
4. Name the principal failure. For auth, tenancy, protected values, billing, signing, clinical workflow or auditing, use the complete [failure-first procedure](failure-first.md).
5. Implement without broad formatting, unrelated cleanup, new external authority or hidden fallbacks. For frontend UI, load the `frontend-ui` skill and follow the composition-first Material UI hierarchy in `apps/web/AGENTS.md`: prefer existing APPly components, MUI primitives and supported composition; use semantic HTML with scoped CSS when it is clearer; reserve dependency patches/forks for confirmed reusable upstream limitations.
6. Add or update tests for success, ownership, denial, validation, retry/concurrency and recovery cases that apply. While implementation is active, run only `bin/agent-check --phase build --path <target> --level focused --run` when a focused signal is useful.
7. After every requested slice is integrated, stop all writers and stage the exact candidate. Run one consolidated selection with `bin/agent-check --phase final --staged --path <target> --level component --run`, or use `integration` for a changed cross-application or runtime boundary. Inspect the diff for secrets, sensitive content and unrelated work.
8. Batch failures into one repair list. Rerun only failed or invalidated checks with `bin/agent-check --phase repair --path <target> --level <level> --check "<selected check name>" --run`. Repeat the final set only when a repair changed a shared contract or mandatory final gate.
9. Update canonical vault records only when direction, requirements, risks, durable evidence or a decision actually changed.
10. Hand off using [`handoff.md`](handoff.md). Do not repeat an unchanged passing check or reopen discovery after handoff.

For a local runtime check, use the managed lifecycle documented in `APPlyVault/03 Execution/CICD.md`. Keep servers detached when the repository provides a managed background path, wait for the relevant readiness endpoint and preserve consequential startup failures instead of reporting an unverified workaround as success.

## Stop conditions

Stop the affected path for suspected sensitive data, unclear destructive scope, missing authority, incompatible concurrent edits, unexplained data loss, a bypassed permission boundary or falsely reported success. Continue independent safe work.

# Concurrent Capability Execution Matrix

This document defines how to make meaningful progress across the five APPly capability roadmaps without creating shared-file, shared-database, or acceptance conflicts. It is a coordination and sequencing artifact, not a second task register. Shortcut remains authoritative for task ownership and status; the repository, tests, runtime, and audit evidence remain authoritative for implementation and acceptance.

## Verified starting point

- Authoritative repository: `C:\Users\joshr\Desktop\Work\APPly`, branch `main`.
- The working tree was clean at review time.
- All current PostgreSQL migrations are `up` in `apply_development`, including reminders, staff messaging, scribe workflow, and patient-portal lifecycle changes.
- Rails is responding on `127.0.0.1:3001`; the frontend is expected on `127.0.0.1:3000`.
- The five capability packets already exist under this directory.
- Active Shortcut coordination found during review:
  - `sc-97` — patient-reminders Rails security verification slice — In Progress and owned.
  - `sc-99` — bounded staff-messaging frontend slice — In Progress and owned.
  - `sc-102` — AI-scribe review workspace safety boundary — In Progress and owned.
  - `sc-96` — cash-pay billing acceptance evidence — To Do and currently unowned.
  - No active patient-portal story was found by the capability search.

The roadmap percentages are estimates, not acceptance decisions. A migration being applied or a frontend build passing does not prove a capability is ready.

## Operating model

Use two build lanes and one evidence lane. Keep work-in-progress capped at three independent slices. Rotate a lane only when its current slice has code or evidence, focused checks, and a written handoff.

The coordinator owns shared integration. Individual agents own isolated feature folders or test files. No parallel agent may modify shared routes, `Ability`, clinic context, `apps/web/src/api/contracts.ts`, migrations, seeds, shared navigation, the same database, or the same live runtime.

Each slice must finish as a small vertical checkpoint:

1. Define the exact user journey and explicit exclusions.
2. Make the smallest scoped implementation or verification change.
3. Run one focused check plus the proportionate runtime or browser smoke.
4. Record what was verified, what was only inspected, and what remains unresolved.
5. Commit the slice and merge it only after the scoped diff and ownership check pass.

Do not keep five broad capabilities open as five simultaneous coding projects. That creates integration debt faster than product evidence. “All five at once” should mean every capability has a queued bounded next slice, while only three slices are actively being changed or verified.

## Recommended execution waves

### Wave 0 — Shared baseline, serialized by the coordinator

Confirm migration status, service health, branch/worktree state, current Shortcut claims, and the exact shared contract versions. This wave is currently satisfied for the development database, but must be repeated for any task-owned test database. Do not use the shared development database for concurrent mutation tests.

### Wave 1 — Start now: three isolated slices

| Lane | Capability | Shortcut | Bounded outcome | Allowed ownership | Gate |
|---|---|---|---|---|---|
| Build A | Staff messaging | `sc-99` | Complete the inbox/conversation frontend checkpoint using the existing backend shape or a clearly bounded adapter. | `apps/web/src/features/staff-messaging/` and its focused tests only. | Focused web check, keyboard/live-region review, and narrow-layout observation. |
| Build B | AI scribe | `sc-102` | Complete the reviewer-edit, leave-warning, and server-authorized approval/export gating checkpoint. | `apps/web/src/features/scribe/` and `apps/web/test/scribe-review-workspace.test.tsx` only. | Focused test plus accessible unsaved/edit/blocked-state observation. |
| Evidence C | Patient reminders | `sc-97` | Execute the focused Rails security assertions against a migrated task-owned database. | `apps/api/test/integration/` for the bounded reminders test only. | Unauthenticated, wrong-practice, wrong-site, role, endpoint, preference, and replay outcomes are recorded. |

These three are already claimed in Shortcut and have explicit exclusions that avoid the principal shared-file collisions. They are the highest-leverage immediate wave because they convert existing domain checkpoints into tested or visible product behavior.

### Wave 2 — Rotate closed lanes

| Capability | Next bounded slice | Dependency | Why it follows Wave 1 |
|---|---|---|---|
| Patient portal | Verify activation, revocation, no-store context, cross-tenant denial, and one patient-safe request journey. Create one bounded Shortcut story before implementation. | Current portal identity/context contract and task-owned database. | The portal already has a vertical slice; the next value is lifecycle and access evidence, not another broad screen set. |
| Cash-pay billing | Run the focused Rails acceptance checks, then a read-only/browser-safe billing smoke. Execute synthetic financial mutations only after the required human approval in `sc-96`. | Migrated task-owned PostgreSQL database and authenticated API/browser context. | Billing is furthest along in implementation and can convert existing code into acceptance evidence without opening new product scope. |
| Patient reminders | Add provider callback signature/replay handling and durable worker/retry recovery as a separate slice after `sc-97`. | Reminder contract plus staff-messaging acknowledgement/escalation event contract. | Delivery reliability is a distinct state machine and should not be mixed into the security test slice. |

Run billing browser evidence serially with other browser evidence unless each run has a genuinely isolated runtime and database. Do not claim a billing pass from source inspection or a build.

### Wave 3 — Integrate, then deepen

After the first visible/tested checkpoint in each capability, the coordinator handles the shared integration pass: routes, capabilities, response contracts, navigation, seeds, correlation IDs, audit events, retention, and feature flags. Then proceed one capability at a time through its next end-to-end workflow:

1. Staff acknowledgement, assignment, escalation, and notification redaction.
2. Portal approved-content, request, recovery, and patient-safe error flows.
3. Reminders provider delivery, callback replay, quiet hours, failure recovery, and staff escalation.
4. Billing documents, reconciliation evidence, and fail-closed processor/check boundaries.
5. Scribe ingestion, provenance, human review, approval, export, deletion, and operational recovery.

The final integrated pilot gate is serialized. It must prove tenant isolation, event idempotency, audit correlation, retry/recovery, accessibility, narrow layouts, safe rollback, and explicit unresolved approvals across the complete set.

## Ownership rules

The coordinator exclusively owns:

- `apps/api/config/routes.rb`
- `apps/api/app/models/ability.rb`
- shared clinic context and authorization files
- `apps/web/src/App.tsx`
- `apps/web/src/api/contracts.ts`
- migrations, seeds, shared fixtures, and the roadmap index/progress records

Agents may propose shared-contract changes in their handoff, but they do not edit those files as part of an isolated slice. Integrate shared changes one at a time after checking all affected capability contracts.

Every implementation agent receives one branch or worktree, one bounded Shortcut story, an explicit file allowlist, an exclusion list, a task-owned database when Rails state is involved, and a single focused acceptance command. Never let two agents share a mutable Rails database or live browser session.

## Definition of meaningful progress

A capability has made meaningful progress when one named workflow moves from “domain/source checkpoint” to one of the following, with evidence attached to its handoff:

- focused Rails or web behavior verified;
- live desktop and narrow-layout behavior observed;
- an explicit failure/recovery path verified;
- a shared integration contract reconciled and tested; or
- a named blocker reduced to a concrete human decision or environment dependency.

The next slice is not complete when only a roadmap, mockup, migration, typecheck, screenshot, or agent handoff exists.

## Immediate coordinator checklist

1. Keep `sc-97`, `sc-99`, and `sc-102` as the active three-lane wave; do not start a fourth implementation agent.
2. Provision or confirm separate task-owned PostgreSQL databases for Rails checks.
3. Let each active lane finish its bounded artifact and commit before integration.
4. Create one patient-portal Shortcut story for the Wave 2 lifecycle/access verification slice; keep its scope narrower than the full portal roadmap.
5. Assign and approve `sc-96` before any billing mutation; otherwise run only read-only/source/test evidence.
6. Re-run the shared integration and browser gates after Wave 1 rather than continuously restarting the whole suite.

## Open decisions and gates

- Human approval is still required for any synthetic financial mutation during billing browser evidence.
- No capability is approved for real patient data, production use, HIPAA certification, clinical operations, or external provider execution.
- Provider credentials, callbacks, durable workers, support/recovery procedures, retention/deletion review, accessibility evidence, and rollback evidence remain capability-specific gates.
- Shortcut is the coordination/status authority; this file must not be used to infer that an active story is done.

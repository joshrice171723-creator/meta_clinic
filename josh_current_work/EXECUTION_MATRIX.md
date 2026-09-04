# Concurrent Capability Execution Matrix

This document defines how to make meaningful progress across the five APPly capability roadmaps without creating shared-file, shared-database, or acceptance conflicts. It is a coordination and sequencing artifact, not a second task register. Shortcut remains authoritative for task ownership and status; the repository, tests, runtime, and audit evidence remain authoritative for implementation and acceptance.

## Verified starting point

- Authoritative repository: `C:\Users\joshr\Desktop\Work\APPly`, branch `joshuarice/sc-132/make-inventory-movement-ledger-p`; latest roadmap evidence refresh is `49572d1`, with the inventory/helper commit at `e1b3040` in history.
- The working tree is clean at this checkpoint. The approved shared-checkout inventory work is included in that HEAD; no additional inventory diff is waiting to be staged.
- The migration directory and both checked databases report 65 migrations applied, latest `20260903001400` (`apply_development` and `apply_test`).
- Rails `/up` responds `200` on `127.0.0.1:3001`; the Vite root responds `200` on `127.0.0.1:3000`.
- The five capability packets and the portal Shortcut story exist under this directory and in Shortcut.
- Current Shortcut coordination: `sc-96`, `sc-97`, `sc-99`, `sc-102`, and `sc-120` In Review and owned; `sc-129` Done and owned.

## Current checkpoint — 2026-09-04

- Billing’s repaired focused checks are green, and one clean isolated full `test/integration/clinic_workspace_test.rb` rerun passed: 22 runs, 228 assertions, 0 failures, 0 errors, 0 skips. The scratch database was removed after the run.
- Browser/live evidence is partial but current: `/clinic/billing` and `/clinic/reminders` load the authenticated synthetic workspaces; `/clinic/staff` loads the employee directory; `/patient-portal` loads the assigned synthetic-account gate. No financial or patient mutation was executed in the browser.
- Staff messaging and AI-scribe remain source/test checkpoints only: their workspace components are present, but no visible route currently wires either one into `App.tsx`.
- The launch page at `/portal` is not the patient portal. Do not use it as patient-portal evidence.
- The next meaningful slice is serialized shared integration/browser evidence for the reviewed capabilities, beginning with route wiring/context and narrow-layout observation. Keep implementation WIP at three or fewer lanes.

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

### Wave 1 — Completed bounded checkpoints

| Lane | Capability | Shortcut | Bounded outcome | Allowed ownership | Gate |
|---|---|---|---|---|---|
| Build A | Staff messaging | `sc-99` | Inbox/conversation/composer frontend checkpoint is implemented and focused-tested; route wiring and live proof remain separate. | `apps/web/src/features/staff-messaging/` and its focused tests only. | Focused web check passes; live route wiring and narrow-layout observation remain. |
| Build B | AI scribe | `sc-102` | Reviewer-edit, leave-warning, and server-authorized approval/export gating checkpoint is implemented and focused-tested; route wiring remains separate. | `apps/web/src/features/scribe/` and its focused tests only. | Focused test and typecheck pass; live browser/server integration remains. |
| Evidence C | Patient reminders | `sc-97` | Rails security verification slice is recorded against a migrated task-owned database. | `apps/api/test/integration/patient_reminders_security_test.rb` only. | 2 runs, 14 assertions pass; delivery/recovery and live mutation evidence remain. |

These three bounded checkpoints are now in Shortcut review. They converted the existing domain slices into focused evidence without resolving the shared-route or live-browser gaps.

### Wave 2 — Current integration and evidence queue

| Capability | Next bounded slice | Dependency | Why it follows Wave 1 |
|---|---|---|---|
| Cash-pay billing | Attach the clean isolated full-suite result to `sc-96`, then complete serialized route/context and narrow-layout browser evidence. | `sc-96` is assigned/approved; focused and full isolated Rails checks are green. | Billing’s test blocker is cleared; remaining work is live integration evidence, not another billing mutation slice. |
| Patient portal | Wire/verify the canonical patient portal route and lifecycle/access browser evidence under `sc-120`. | Patient-portal Shortcut story, lifecycle test, and assigned synthetic-account gate exist. | `/portal` is only launch/onboarding; it cannot substitute for patient-portal evidence. |
| Staff messaging + AI scribe | Integrate one visible route at a time, then capture desktop and narrow-layout evidence for the existing focused-tested workspaces. | `sc-99` and `sc-102` are in review; shared `App.tsx` route ownership stays with the coordinator. | Components exist but are not reachable from the current browser navigation. |
| Patient reminders | Add provider callback signature/replay handling and durable worker/retry recovery as a separate slice after the current security evidence. | Reminder contract plus staff-messaging acknowledgement/escalation event contract. | Delivery reliability is a distinct state machine and should not be mixed into the security test slice. |

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

1. Treat the billing full-suite rerun as cleared: the isolated run passed 22/228 and its scratch database was removed; retain `sc-96` in review until the live route evidence is attached.
2. Keep task-owned databases for Rails checks and serialize shared-route/browser work; do not restart the full suite for every small UI change.
3. Treat `sc-97`, `sc-99`, `sc-102`, and `sc-120` as review-stage evidence, not as complete live journeys.
4. Use the existing `sc-120` portal story for lifecycle/access integration; do not create a duplicate story.
5. Wire and verify one shared route at a time, starting with the reviewed billing/portal context boundary, then staff messaging and scribe.
6. Keep implementation WIP capped at three lanes and update this matrix plus the capability evidence after each serialized integration checkpoint.

## Open decisions and gates

- Browser/live integration evidence remains open for billing, patient portal, staff messaging, and AI scribe; current pages were observed without executing a mutation.
- No capability is approved for real patient data, production use, HIPAA certification, clinical operations, or external provider execution.
- Provider credentials, callbacks, durable workers, support/recovery procedures, retention/deletion review, accessibility evidence, and rollback evidence remain capability-specific gates.
- Shortcut is the coordination/status authority; this file must not be used to infer that an active story is done.

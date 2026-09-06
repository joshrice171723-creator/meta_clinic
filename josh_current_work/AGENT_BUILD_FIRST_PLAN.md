# APPly build-first agent execution plan

## Objective and operating mode

Finish the currently scoped APPly product work as coherent, reachable implementation while deliberately saving model usage. This is a build-first pass, not a readiness, test, browser-proof, or polish pass.

Use one `GPT-6 Astra` coordinator at `high` reasoning and up to three `GPT-5.6 Sol` implementation agents at `medium`. Use `GPT-5.6 Terra` at `medium` only for cheap, bounded source inventory or merge-conflict assistance. Do not use an agent to create tests, expand test suites, run broad tests, repeatedly typecheck/build, conduct browser smoke tests, generate screenshots, or polish spacing/copy/responsiveness in this pass. Those jobs belong to the later stabilization pass.

The coordinator delegates every independently writable slice. It retains shared integration, migration allocation, branch integration, and final product-flow decisions. Astra must not implement a task that can safely be given to a Sol agent.

## Scope

This plan covers APPly only:

1. Inventory procurement: Plan order, supplier routing, cart checkout, generated purchase orders, receiving, reconciliation, and the known transactional-hardening backlog.
2. Cash-pay billing and the billing-only patient portal journey.
3. Patient portal lifecycle and bounded patient requests.
4. Staff messaging and its acknowledgement/escalation workflow.
5. Patient reminders and staff escalation integration.
6. AI scribe review, approval, export, provenance, and retention workflow.

Existing source remains authoritative. These are implementation targets, not claims that a workflow is currently safe for production, clinical use, external providers, or real patient data.

## Explicit exclusions to save usage

- No new automated tests and no editing existing tests.
- No test, full typecheck, production build, audit, browser, screenshot, load, security, or accessibility run.
- No repeated exploratory investigation after the coordinator assigns a bounded slice.
- No visual polish, refactor, rename, dependency upgrade, seed-data expansion, deployment, external message, payment execution, or provider credential work.
- No agent may erase, stage, or alter the pre-existing unrelated change at `apps/api/db/structure.sql` unless its assigned migration requires the matching generated schema update. The coordinator decides and records that exception.

Each handoff must say `implementation only; tests and live verification intentionally deferred`. A feature is "implemented pending verification," never "done" or "ready."

## Shared-file and agent rules

Create isolated worktrees from the current `APPly` `main` HEAD. Keep no more than three Sol agents active. Give every agent a branch, one outcome, an exact allowlist, and one exclusion list. Each agent commits its completed implementation before handoff; the coordinator integrates commits serially and commits its integration changes.

Only the Astra coordinator may edit:

- `apps/api/config/routes.rb`
- `apps/api/app/models/ability.rb` and shared authorization/context code
- `apps/web/src/App.tsx`
- `apps/web/src/api/contracts.ts`
- migrations, `apps/api/db/structure.sql`, shared seeds, and `josh_current_work/` planning records

No two agents modify the same file. An agent that needs a coordinator-owned file documents the exact proposed change instead of touching it. The coordinator batches compatible shared changes after the dependent agents hand off.

## Delivery sequence

### Phase 0 — Astra: establish the build queue

1. Inspect the current `APPly` branch, worktrees, dirty files, and the feature files named below.
2. Convert each phase below into one bounded task prompt with its allowlist and exclusions.
3. Allocate migrations before dispatch. If a capability needs a migration, dispatch that capability alone for its migration window.
4. Dispatch the first three independent tasks. Do not wait for tests or browser setup.

Output: an implementation queue and isolated worktrees. No product code is changed in this phase.

### Phase 1 — finish reachable product surfaces

Run these as the initial three Sol tasks:

| Agent | Outcome | Primary allowed files | Must not touch |
|---|---|---|---|
| A: inventory | Complete the Plan order/cart -> supplier split -> draft PO -> shipment/receipt -> reconciliation flow using the existing cart and inventory services. Implement only missing UI/API wiring within feature ownership and list required shared-route changes for Astra. | `apps/web/src/features/inventory/**`, `apps/api/app/controllers/clinic/inventory/**`, `apps/api/app/services/clinic/inventory/**`, inventory-specific serializers | routes, Ability, migrations, structure, contracts, tests, shared seeds |
| B: billing + portal | Complete cash-pay billing actions and the billing-only patient portal display/request flow against existing billing and portal services. Keep the portal patient-scoped. | `apps/web/src/features/clinic/Billing*`, `apps/web/src/features/clinic/billing.css`, `apps/web/src/features/patientPortal/**`, `apps/api/app/controllers/clinic/billing/**`, `apps/api/app/controllers/patient_portal/**`, matching services/serializers | routes, Ability, migrations, structure, contracts, tests |
| C: staff + reminders | Complete the staff messaging workspace and reminder-to-staff escalation path using existing models/services. Implement component-local flows; report route/contract changes to Astra. | `apps/web/src/features/staff-messaging/**`, `apps/web/src/features/clinic/Reminders.tsx`, `apps/web/src/features/clinic/staffWorkflow.css`, reminder/messaging controllers, services, and serializers | routes, Ability, migrations, structure, contracts, tests |

When an agent finishes, Astra reviews the bounded diff for scope only, integrates it, and immediately replaces the agent with the next queued task. Do not consume a second agent turn on test repair or UI polish.

### Phase 2 — coordinator shared integration, then scribe

1. Astra makes one serialized shared integration commit: routes, `App.tsx` navigation, shared contracts, capability visibility, and any previously documented authorization/context changes.
2. Dispatch Sol task D for AI scribe: complete the reviewer draft -> edit -> approval -> export flow, with provenance/retention states already supported by the existing services. Allowed files: `apps/web/src/features/scribe/**`, `apps/api/app/controllers/clinic/scribe/**`, `apps/api/app/services/clinic/scribe/**`, and matching serializers. Exclude routes, Ability, migrations, structure, contracts, and tests.
3. Astra integrates scribe route/navigation/contract changes in a second serialized shared commit.

### Phase 3 — implementation hardening backlog

Run one Sol task at a time because these changes affect transactional authority. Still do not add or run tests.

1. Inventory: make receipt/quantity/stock movement one deterministic-lock transaction; create transactional holds for quarantined receipts; ensure recalls lock the lot, include current and future linked batches, and bind disposition to `recall_lot`; compare transfer retry destination and reason.
2. Billing: add durable idempotency receipt handling across invoice draft, posting, and allocation; reconcile `billing.read` capability projection with `patients.read`.
3. Reminders: implement provider callback signature/replay boundary and durable delivery/retry states using the existing reminder outbox/delivery models. Do not connect a real provider.
4. Portal/staff: wire bounded request status and staff acknowledgement/escalation state transitions so the two visible workflows agree on the same server-owned state.

Any hardening task that requires a migration is isolated and allocated by Astra before work begins. The coordinator owns the migration, schema update, and merge order even if a Sol agent supplies the model/service change.

### Phase 4 — finish the product wiring

The coordinator makes the final implementation-only integration pass:

1. Ensure every in-scope workspace is reachable from its intended APPly navigation path.
2. Reconcile shared response contracts and loading/error boundaries so no feature relies on frontend-owned synthetic data.
3. Remove dead local feature wiring introduced by this pass only when it is clearly replaced by the completed route.
4. Integrate all clean agent commits, resolve conflicts surgically, preserve unrelated worktree changes, and commit each integration result.

Stop here. The product should have its requested surfaces and server-owned workflows implemented, but is intentionally unverified.

## Deferred stabilization and polish pass

Create a later, separate Astra-led task for these items after all implementation commits are integrated:

1. Focused tests first, then only necessary contract/integration tests.
2. Migration/schema and authorization regression review.
3. Browser journeys at desktop and narrow widths, including real authenticated bootstrap recovery.
4. Accessibility, error states, responsive polish, copy, and visual consistency.
5. Retry/idempotency, tenant isolation, audit, retention, provider callback, and security validation.
6. Resolve the current browser-session/bootstrap failure before using any live-browser result as evidence.

## Handoff format for every agent

```text
Outcome implemented:
Files changed:
Files intentionally not touched:
Required coordinator changes:
Known gaps or assumptions:
Checks: intentionally not run under build-first mode.
Status: implementation only; tests and live verification intentionally deferred.
Commit:
```

## Completion rule for this pass

This pass is complete when the six scoped product areas have their requested code paths implemented, routes/navigation are integrated, transactional backlog items above are addressed in source, every agent change is committed, and the `main` worktree contains no uncommitted changes created by this plan. It is not a release, pilot, clinical, financial, security, accessibility, or production-readiness decision.

## First bounded action

Have Astra inspect the current inventory cart/receiving/reconciliation path and dispatch the three Phase 1 Sol tasks with the exact file allowlists above. Do not create tests or begin a verification loop.

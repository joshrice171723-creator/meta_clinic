# APPly forgotten-work delivery plan

[Roadmap index](ROADMAP_INDEX.md) · [Planning story sc-340](https://app.shortcut.com/apply-1/story/340)

## Objective and authority

Finish the missing parts of the previously identified APPly work without rebuilding existing functionality. The founder authorized execution and autonomous scoped decisions after the planning handoff. The local build-first implementation is now integrated; its finish label is **implemented pending verification**, not production acceptance. Provider-authenticated reminder ingress remains an explicit blocked remainder.

Source reconciliation: 2026-09-06, canonical checkout `C:\Users\joshr\Desktop\Work\APPly`, `main` at `f26a627daa15`. Reconcile the base and current claims again before dispatch. The pre-existing change in `apps/api/db/structure.sql` belongs to other work and is excluded; tracked migrations and HEAD's schema, not that dirty file, support the findings below.

Shortcut owns task scope, acceptance, claims and mutable status. This file owns the technical file map and dependency order; it is not a second status register. Each independently finishable outcome has its own story. The dated execution handoff below records integrated source and deferrals; consult Shortcut for subsequent mutable status. Existing inventory, billing and portal review gates remain separate.

This revision replaces the earlier broad build queue in this file. The September 4 [execution matrix](EXECUTION_MATRIX.md) and capability handoffs retain historical evidence; their old route/branch/runtime claims are not current instructions. Do not execute their broader proposed feature lists blindly. Existing capability build plans remain design references; some contain proposed TypeScript backend paths that do not match this Rails checkout. Use the verified Rails map below.

## Execution handoff — 2026-09-06

Implementation started from planning commit `229f7b3`; founder approval reconciled sc-95's exact route/context/contract/navigation seams and sc-112's two planning files. Astra coordinated isolated, disjoint workers, starting staff composition with Terra medium and using Sol medium for transactional/workflow work. The first staff handoff had concrete source defects and was escalated to Sol. Workers were reused for adjacent bounded outcomes; no high-effort worker default or measured usage-savings claim was introduced.

| Outcome | Integrated source and entry | Evidence boundary |
| --- | --- | --- |
| sc-344 staff messaging | `5d671d1`, `7c2004c`, `c56a5aa`, `ddbeb07`; `/clinic/messages` now uses `apps/web/src/features/staff-messaging/LiveStaffMessagingWorkspace.tsx`. Loads real conversations/participants, pages messages, creates/sends/reads/acknowledges and transitions/escalates requests; resolution requires an entered code. | Source/diff review only. The reusable presentation fixture remains isolated from the live route. Existing attachment/storage gates remain closed. |
| sc-345 scribe | `a0a65a5`, `a6394af`, `ee75119`, `cf83dc9`, `8878431`, `4eaea67`; `/clinic/scribe`, `LiveScribeReviewWorkspace.tsx`, authorized encounter/patient pagination and existing Rails workflow. Consent, source import, local grounded generation, review, approval, export and deletion are connected. | Expected draft revision is checked under encounter/draft locks; consent is rechecked under lock; export retries resolve persisted results. Dirty edits survive revision refresh/failure with explicit discard/navigation guards. Local parent-record adapter only; no cloud/audio/official-record expansion. |
| sc-346 invoice replay | `1ce4d43`; existing draft/post services, invoice controller and billing controls reuse `Clinic::Idempotency`/operation receipts. | Same-key changed payload conflicts. Legacy callers without their own key cannot reconstruct a lost response's generated key; the live UI supplies stable keys. Allocation/payment processing was not rebuilt. |
| sc-347 financial reads | `280b834`, `38c92eb`; billing readers and context agree on `billing.read` or the existing `billing.write` operator grant. | Patient-read alone no longer grants financial reads. Financial mutations/provider gates remain unchanged. |
| sc-348 reminder recovery | `157cf90`, `1561a57`, `7ad529a`; `reminders/recover.rb`, `reminders/recover_job.rb`, `POST /api/clinic/reminders/recover` and the reminder worklist. | Expired uncertain leases are held, not resent. Known-failure retries are bounded; policy, authority, pause/cancellation and exact-attempt late results are guarded. Manual `perform_now` entry is connected; no durable scheduler activation is claimed. |
| sc-350 reminder staff handoff | `e6aa26e`, `3296c94`, `6faede2`, `d9d46a9`, `4c60c7c`, `1eecd5a`, `4eaea67`; `reminders/staff_handoff.rb`, `POST /api/clinic/reminders/:id/staff_handoff`, reminder worklist and linked staff request. | Explicit conversation, assignee and due time; server-owned receipt provenance and cross-actor event deduplication; changed routing conflicts. Actor-authorized batch summaries, redacted copy, persisted request state and a reauthorized source-reminder link. No appointment/clinical mutation or portal expansion. |
| sc-351 staff recovery | `c9842ad`, `9552dbf`, `38547af`, `52b1569`; `messaging/recover.rb`, `messaging/recover_job.rb`, `POST /api/clinic/staff-messaging/conversations/:id/recover` and its live dialog. | Bounded in-app notification reconciliation, capped retries, locked transition replay, target-aware overdue pagination and explicit eligible backup selection. No external notifications or invented scheduler. |
| sc-349 callback remainder | `bdbdec3` hardens **staff-recorded** results in `reminders/record_delivery.rb`: exact attempt correlation, durable staff-operation replay, non-regression and no automatic resend from a manual failure report. | **Not an authenticated provider callback.** Provider protocol, verified account-to-practice binding and secret custody remain prerequisites. The provider-dependent story remains open in Backlog; no generic signature scheme, credentials, ingress enablement or provider-wide event receipt was invented. |

Current implementation source is reachable from the clinic routes above; reminder source links use `/clinic/reminders?reminder_id=<id>` and re-enter the authorized API. Reminder and conversation worklists have bounded continuation. No new migrations, dependencies or infrastructure were required.

Checks actually performed: focused source/consumer/diff inspection, scoped preflight ownership checks and `git diff --check` on task changes/commits. Tests were not created, edited or run; no typechecks, builds, browser/runtime checks, readiness audits, database operations, provider activation, external sending, deployment or push occurred. Existing hooks were not bypassed. The deferred proof stories sc-352/sc-353/sc-354 and existing sc-96/sc-120/sc-334 acceptance gates remain open. Source-only completion cannot establish production readiness.

Cleanup/handoff: task code is committed on canonical `main`; isolated worker worktrees and branches are retained, not deleted. The pre-existing `apps/api/db/structure.sql` changes were never edited or staged. Concurrent employee-workforce planning edits appeared during execution and were preserved outside this task's commits. This file and the index remain living documents with Git history; no duplicate roadmap pack or Obsidian task mirror was created.

Next authorized pass: verify the changed end-to-end journeys and concurrency/authorization boundaries using the existing proof stories, then polish and resolve release gates. Separately select the real reminder provider/account verification and secret custody before completing sc-349. Do not rebuild the already implemented inventory, cash-pay billing or billing-only portal products.

## Baseline reconciliation: reuse, do not rebuild

| Area | Source observation before this implementation | Original remaining work / disposition |
| --- | --- | --- |
| Inventory procurement | `purchase_cart_checkout.rb` already scopes/locks checkout, snapshots offers and splits draft POs by supplier. `receiving.rb` already transacts receipts, lines, stock and received quantities. Commit `d4a8a6b` delivered packing-slip receiving and supplier reconciliation. | No replacement cart, receiving or reconciliation story. Reuse [sc-334](https://app.shortcut.com/apply-1/story/334) for its remaining operator/runtime acceptance. Supplier transmission was explicitly skipped and stays excluded. |
| Inventory transaction backlog | Recall-quarantined receiving creates its recalled hold within the receipt transaction. Recall lot/hold/containment triggers exist in tracked migration `20260905010400_add_recall_case_closures.rb` and HEAD schema. Disposition binds the same recall lot/batch; transfers compare retry source/destination/quantity/reason/actor. | These old implementation leads are already present in source. No duplicate hardening rewrite. Existing review/failed-race evidence still requires later reconciliation; source does not prove concurrency behavior. |
| Staff messaging | `/clinic/messages` is already routed; Rails endpoints, abilities and context exist. `StaffMessagingWorkspace.tsx` defaults to local fixture state and has optional action callbacks. | Connect the existing workspace to real data/actions. Do not rebuild the route or domain. Automatic outbox/overdue processing remains a separate outcome. |
| AI scribe | Existing Rails workflow includes consent, source provenance, revisions, approval/export gates and retention; reviewer component exists but is not routed from `App.tsx`. | Add reachable server-backed composition. Preserve the bounded source-import/provider/export behavior; no cloud model, audio capture or official-record expansion. |
| Reminders | Policy, outbox, attempts, dispatch and staff-recorded delivery outcomes exist. Dispatch directly uses the local gated provider and assigns a lease; authenticated callback/event receipt and durable expired-lease recovery are not evident. | Extend the existing state machine: recovery, callback boundary, and redacted staff handoff are separate outcomes. Do not recreate reminder tables or the scheduling feature. |
| Cash-pay billing | Invoice/ledger/receipt/cash/reconciliation UI and services exist. Allocation already has external-event identity and transaction/locking guards. Draft creates new invoices without a durable request key; posting lacks request-replay identity. Financial reads still mix dedicated billing grants and legacy patient-read grants. | Add draft/post replay protection and reconcile financial-read grants as two sequential stories. Reuse allocation deduplication; do not replace the billing product. |
| Patient portal | `/patient-portal` and its billing context already exist. Current handoff deliberately limits it to billing; dormant clinical/request/reminder actions deny access. | Reuse [sc-120](https://app.shortcut.com/apply-1/story/120) for remaining lifecycle/access evidence. Do not reopen booking, clinical content or patient messaging. Reconcile its older request-journey criterion with the later billing-only boundary before acceptance. |

Inventory source paths above are under `apps/api/app/services/clinic/inventory/`, except disposition at `apps/api/app/models/clinic/inventory/recall_disposition.rb` and migrations under `apps/api/db/migrate/`. Financial services are under `apps/api/app/services/clinic/billing/`.

The historical browser-bootstrap failure is an **unreverified observation**, not a current implementation diagnosis. Investigate it only if the later authorized browser pass reproduces it. Previously failed broad checks also remain evidence to reconcile, not permission to repeat entire suites now.

## Separate implementation stories and delivery order

Model assignments are starting recommendations, not fixed cost promises. Astra-high coordinates. Start workers at the cheapest capable tier; do not use high for routine work. Escalate one focused failure by effort or model when reasoning would help, not for missing credentials or provider choices.

| Story | Bounded outcome | Start | Dependency / ownership |
| --- | --- | --- | --- |
| [sc-344](https://app.shortcut.com/apply-1/story/344) | Live staff messaging adapter | Terra medium | Existing sc-99 frontend; coordinate sc-95 shared seams. |
| [sc-346](https://app.shortcut.com/apply-1/story/346) | Durable invoice draft/post replay | Sol medium | Own billing controller/services; coordinator allocates receipt/schema changes. |
| [sc-348](https://app.shortcut.com/apply-1/story/348) | Reminder lease/retry recovery | Sol medium | Existing dispatch/outbox; no live provider required for bounded local implementation. |
| [sc-345](https://app.shortcut.com/apply-1/story/345) | Reachable server-backed scribe review | Terra medium; Sol if workflow complexity warrants | Serialize App/navigation/contracts edits with sc-344, not all feature-local work. |
| [sc-347](https://app.shortcut.com/apply-1/story/347) | Consistent financial-read authority | Sol medium | After sc-346 for shared invoice-controller ownership; resolve deliberate legacy policy before changing grants. |
| [sc-350](https://app.shortcut.com/apply-1/story/350) | Redacted reminder-to-staff requests | Sol medium | sc-344 and sc-348 state/event contracts. Does not need a live callback provider to process local actionable failures. |
| [sc-351](https://app.shortcut.com/apply-1/story/351) | Staff overdue/outbox recovery | Sol medium | sc-344; agree messaging event contract with sc-350 and serialize overlapping service edits. |
| [sc-349](https://app.shortcut.com/apply-1/story/349) | Authenticated reminder callback/event replay boundary | Sol medium | sc-348 contract; provider-specific signature protocol and secret custody must be selected before ingress enablement. Continue independent work if blocked. |

First wave after implementation authorization: sc-344, sc-346 and sc-348, only if current claims and file ownership allow them. Up to three workers; use fewer if startup/review overhead or shared contracts dominate. Rotate into ready work, not a rigid three-agent assignment. Luna-low can perform a worthwhile independent link/path inventory; tiny mechanical edits stay local when delegation costs more.

No capability must wait for an unrelated financial/inventory task merely because both are transactional. Serialize conflicts, not entire domains. A provider-blocked callback must not prevent completion of local staff, billing, scribe or recovery work.

## Verified file map and acceptance contracts

Existing paths are listed below. Feature-local adapters and workers described as proposed do not exist merely because this plan names them. Choose final filenames after reading nearest instructions and the established pattern.

### sc-344 — live staff messaging

- Existing UI: `apps/web/src/features/staff-messaging/StaffMessagingWorkspace.tsx`.
- Existing authority: `apps/api/app/controllers/clinic/messaging/staff_controller.rb`, `apps/api/app/serializers/clinic/staff_messaging_serializer.rb`, `apps/api/app/services/clinic/messaging/`.
- Proposed addition: a feature-local API/container adapter; preserve the reusable presentation component and existing tests.
- Actor/entry/outcome: authorized staff opens `/clinic/messages`, loads scoped conversations, selects one, sends/reads/acknowledges and performs permitted request/manual-escalation transitions, with server results persisted.
- Failure boundary: no fixture fallback or optional-callback false success on the real route; preserve draft on failed send, stable retry identity, denied actions, empty/error/loading states and server-derived participants/capabilities. Attachments remain unavailable until their storage/scanning gate is satisfied.

### sc-346 / sc-347 — financial retry and read authority

- Existing services: `apps/api/app/services/clinic/billing/draft_invoice.rb`, `post_invoice.rb`, `allocate_payment.rb`.
- Existing controllers: `apps/api/app/controllers/clinic/billing/invoices_controller.rb`, `patient_ledgers_controller.rb`, `payment_events_controller.rb`; inspect dashboard/subscription readers as the dedicated-grant reference.
- Existing consumers: `apps/web/src/features/clinic/BillingDashboard.tsx`, matching billing controls and API contracts discovered through its imports.
- sc-346 outcome: a billing operator retries the same create/post operation after a lost response and receives the same authoritative result without duplicate financial effects. Same key with changed payload must fail. Reuse compatible existing operation-receipt infrastructure; allocate a forward migration only if needed.
- sc-347 outcome: financial endpoints and projected capabilities agree on intended billing access; a patient-read grant alone is not casually treated as financial authority. Establish legitimate role compatibility before changing grants; escalate a deliberate conflicting policy, not routine implementation decisions.
- Exclude processor/payment behavior changes, a new ledger, removal of allocation deduplication, broad role refactors and any direct overwrite of the dirty schema.

### sc-348 / sc-349 — reminder recovery and callbacks

- Existing services: `apps/api/app/services/clinic/reminders/dispatch.rb`, `record_delivery.rb`, `policy.rb`, `reconcile_appointment.rb`.
- Existing controller/UI: `apps/api/app/controllers/clinic/reminders_controller.rb`, `apps/web/src/features/clinic/Reminders.tsx`; reuse their outbox/attempt associations.
- Proposed additions: bounded recovery/job entry point using existing job infrastructure; authenticated callback adapter/durable event receipt only where absent.
- sc-348 outcome: interrupted eligible work can resume from persisted lease/attempt state without duplicate sends, consent/cancellation bypass, or unlimited retries. Re-evaluate policy and treat uncertain delivery distinctly from a known failure.
- sc-349 outcome: verified provider/account events update the exact authorized attempt with durable deduplication and defined out-of-order behavior. Staff-entered delivery outcomes are not authenticated provider callbacks.
- Do not invent a provider signature algorithm or recipient secret configuration. Preserve the closed provider gate and truthful consequential delivery status. Provider-specific enablement/proof remains blocked until its required protocol/custody decision exists.

### sc-350 / sc-351 — actionable staff handoff and recovery

- Existing integration services: `apps/api/app/services/clinic/messaging/create_staff_conversation.rb`, `send_staff_message.rb`, `acknowledge_staff_message.rb`, `transition_staff_request.rb`, `escalate_staff_request.rb`.
- sc-350 outcome: an actionable reminder failure/unresolved response creates one correlated server-owned request; authorized staff can acknowledge/escalate/resolve it without modifying appointment or clinical state.
- sc-351 outcome: due staff requests/outbox work receive bounded durable processing and recover after interruption. Reuse the existing models and job mechanism; do not add another task ledger or queue platform.
- Failure boundary: tenant/site-safe recipient lookup, event idempotency, no message-body leakage in notifications/logs, active-membership checks and approved escalation coverage. Missing coverage/provider choices remain named blockers, not invented emergency routing.
- Agree the event contract first; only one writer touches a shared messaging service at a time. Attachment storage/malware scanning and external notification enablement remain gated follow-ups, not hidden placeholders labeled complete.

### sc-345 — scribe composition

- Existing UI: `apps/web/src/features/scribe/ScribeReviewWorkspace.tsx`, `types.ts`.
- Existing authority: `apps/api/app/controllers/clinic/scribe/`, `apps/api/app/services/clinic/scribe/workflow.rb`, `draft_generator.rb`, `retention.rb`, `apps/api/app/serializers/clinic/scribe/serializer.rb`.
- Proposed addition: feature-local API/container adapter plus the minimum clinic route/navigation composition.
- Actor/entry/outcome: authorized reviewer reaches an existing persisted encounter/source/draft, submits permitted edits and explicitly approves/exports the authorized current revision.
- Failure boundary: stale/unavailable source, missing consent, unsaved edits, permission denial and export confirmation remain authoritative. Display actual server provenance/status and never invent generated clinical conclusions.
- Existing source import, local provider and bounded export adapter are the limit. No microphone/cloud provider, diagnosis/treatment automation or official-record writes.

## Shared integration and no-waste rules

- Current shared-contract Story [sc-95](https://app.shortcut.com/apply-1/story/95) still has historical active reservations. Reconcile exact implementation ownership before writing those seams; this planning task does not take them over.
- Coordinator controls `apps/api/config/routes.rb`, `apps/api/app/models/ability.rb`, clinic context, `apps/web/src/App.tsx`, `apps/web/src/features/clinic/Workspace.tsx`, `apps/web/src/api/contracts.ts`, migration allocation and generated schema. It may delegate one explicitly bounded shared-file edit exclusively; other agents must exclude that file.
- Use isolated worktrees or genuinely disjoint enforced file ownership. Different branches in one checkout are not isolation. Do not share mutable database/browser sessions.
- Every task capsule includes story, current base/checkout, exact allowlist/exclusions, actor/entry/persisted outcome, failure behavior and verification boundary. Search symbols/consumers once; reuse the source map until a concrete change invalidates it.
- One focused coordinator diff/consumer review per slice, then review integration deltas. Do not repeat whole-repository audits or dispatch an agent for every file.
- Commit each coherent slice and integration. Preserve unrelated work. No pushing, deployment, branch/worktree removal or external actions without separate authority.

## Product quality and deliberately deferred proof

Every visible business record, price, balance, status and permission must come from its real backend/database authority. No hardcoded sample objects, fabricated metrics, mock-success handlers or missing-integration fallbacks. Static copy/design tokens/genuine invariants may remain in code. Use ordinary product language on screens; avoid “dev”, “seed”, “synth” and similar placeholder labels, while preserving truthful consequential sandbox/payment/delivery disclosures.

Build-first is not a wireframe pass. Persist mutations, handle errors and retain authorization/data integrity now. Optional visual refinement may wait; disconnected controls and missing backend wiring may not.

During the future build-first pass do not create/edit/run tests, typechecks, builds, browser checks, screenshots, audits or visual polish. Keep existing tests/hooks intact and do not bypass required hooks. Still inspect source/diffs and run `git diff --check`. A required-check conflict is reported, not silently bypassed. The finish label is **implemented pending verification**.

Later, separately authorized proof is tracked by outcome:

| Capability | Existing or new evidence story | Audit/design reference |
| --- | --- | --- |
| Inventory | [sc-334](https://app.shortcut.com/apply-1/story/334), with the related preserved inventory review records | Existing inventory evidence under `records/audits/2026-09-06-all-work-sync.md`; reconcile later fixes before replaying earlier failures. |
| Cash-pay billing | [sc-96](https://app.shortcut.com/apply-1/story/96) | [Billing audit plan](cash%20pay%20billing/CASH_PAY_BILLING_AUDIT_PLAN.md) |
| Billing-only portal | [sc-120](https://app.shortcut.com/apply-1/story/120) | [Portal audit plan](patient%20portal/PATIENT_PORTAL_AUDIT_PLAN.md) and [later scope handoff](patient%20portal/AGENT_IMPLEMENTATION_HANDOFF.md) |
| Integrated staff messaging | [sc-352](https://app.shortcut.com/apply-1/story/352); prior component evidence sc-99 stays separate | [Staff audit plan](staff%20messaging/STAFF_MESSAGING_AUDIT_PLAN.md) |
| Integrated scribe | [sc-353](https://app.shortcut.com/apply-1/story/353); prior safety evidence sc-102 stays separate | [Scribe audit plan](ai%20scribe/AI_SCRIBE_AUDIT_PLAN.md) |
| Reminder delivery/recovery/handoff | [sc-354](https://app.shortcut.com/apply-1/story/354); prior security evidence sc-97 stays separate | [Reminder audit plan](patient%20reminders/PATIENT_REMINDERS_AUDIT_PLAN.md) |

Reuse earlier evidence only when revision/environment relevance is established. Focus later checks on the changed paths, retries, tenant isolation, authorization, persisted outcomes and real authenticated desktop/narrow journeys. Record any unresolved provider, retention, accessibility, operational or professional/release gates. No test plan or completed source slice proves application-wide production readiness.

## Living plan, completion and cleanup

Keep this file as the current scoped execution map and Git as its revision history; do not generate numbered plan copies or mirror the queue into Obsidian. Existing roadmap/build/audit packets stay linked from the index. Update paths/contracts and commits at meaningful integration checkpoints; preserve dated evidence and accepted decisions with corrections/superseding links rather than rewriting history.

Build-first finishes only when every authorized implementation outcome is integrated and committed or its exact blocker is reported; do not silently drop a provider-dependent slice. Keep later evidence stories open. Record delivered scope, commits, checks actually run/deferred and next action in the existing handoff. “All local implementation finished” is not “production ready.”

At final closeout, reconcile agent worktrees and task-owned changes once. Preserve useful roadmap/audit/decision/handoff history, remove only clearly disposable task-created scratch files within authority, and never delete branches/worktrees or unrelated data merely to obtain a clean status.

## Preserved planning handoff

This plan was source-reconciled with two read-only Terra-medium discovery agents; no application code, tests, runtime or provider state was changed. Structural link/path review, selected documentation checks and a scoped Git diff review are the planning acceptance, not application verification. The user reconciled sc-112's older reservation for this file and the index only; its other scope remains untouched.

Planning checks: all 25 local Markdown links across this file and the index resolve; scoped `bin/agent-check --run` passes. Whole-tree `git diff --check` reports a pre-existing blank line at EOF in the excluded `apps/api/db/structure.sql`; it was not corrected or staged. Application tests, builds, typechecks, runtime/browser checks and readiness audits were not run.

The original first action was to reconcile sc-95 shared ownership, take sc-344 and dispatch disjoint sc-346/sc-348 workers. That action has been carried out; the execution handoff above supersedes this starting instruction. Do not restart cart, inventory, portal or billing construction.

---
type: implementation-tracker
status: active
updated: 2026-09-17
lifecycle: active
canonical_for: meta-clinic-implementation-tracking
---
# Meta Clinic Implementation Tracker

Home: [[00 Home]] · Direction: [[Meta Clinic Product Strategy and Scope]] · Acceptance: [Engineering guide](../../docs/development/meta-clinic-build-and-acceptance.md) · Decisions: [[Decisions]] · Outcomes: [[Progress Log]] · [Remaining-work gap report](../../docs/product-review/meta-clinic-remaining-work.md)

## Authority and status

This is the single current Meta Clinic implementation tracker. Individual tasks execute bounded work and report outcomes here; do not maintain a competing mutable checklist. D-071 supersedes the former Shortcut-only tracking direction. Historical plans remain detailed inputs, not current completion authority.

Consolidated 2026-09-13 around the founder-approved strategy. Older records supply dated implementation evidence only: they do not add requirements, features, exclusions or approval steps. Historical row baselines remain dated; the current revision-4 assignment below links fresh local runtime/browser evidence. “Dated local evidence” means a linked record reports scoped passing checks; “reconcile” means inspect current source against current direction before deciding what remains. Owners and deadlines are unassigned unless explicitly agreed.

## Workflow inventory and next proof

### Full application review delivery — authorized 2026-09-15

The founder explicitly requested completion of the entire [reconciled application review](../../docs/product-review/meta-clinic-full-application-review.md), not only scheduling. This section is the canonical execution queue for that assignment; it supplements the MC workflow rows rather than replacing their contracts. Baseline `b53131f`. Current phase: development implementation delivered with focused integrated verification below; broader acceptance and conditional dependencies remain explicitly open. No live-provider, professional, deployment or real-data authority is implied.

| Review slice | MC mapping | Ownership / current state | Required proof or dependency |
| --- | --- | --- | --- |
| PR-01 Entry/session recovery | MC-13 | Implemented: accepted-session navigation deadline and navigation-only recovery; fresh local clinic entry now completed in the current browser walkthrough; existing request timeout and session protections retained | Fresh-entry error/timeout and no mutation auto-replay remain to be exercised |
| PR-02 Navigation, landing and canonical Schedule route | MC-03/04/13 | Implemented: capability-filtered groups, role-oriented landing, canonical Schedule and explicit URL-derived patient strip | Deep links, back/forward, draft blockers, distinct board/schedule |
| PR-03 Schedule and selected-patient context | MC-04 | Calendar and picker delivered in `13accea`/`b53131f`; current browser walkthrough populated Patient Flow → selected-patient month/day schedule → separate Tracking Board with synthetic records | A newly created booking/check-in transition still needs a fresh mutation walkthrough; live clinic resource approval separate |
| PR-04 Record lifecycle and field ownership | MC-03/05/08/09 | Implemented: Operations workflow guide maps existing independent records, authorized writers and correction actions | Persisted state, visible owner and next action; no universal invented field requirements |
| PR-05 Provider readiness and report discovery | MC-08/11/13/15 | Implemented: source-backed report catalog and telehealth health projection; absent cross-provider readiness explicitly unknown | Permissions, source/freshness, honest unavailable/simulated states |
| PR-06 Communication lifecycle and cancellation follow-up | MC-10 | Implemented: complete returned attempt history; cancellation-to-filtered-message-review handoff without automatic send | Consent, delivery-unknown/no automatic resend, no implied cancellation notification |
| PR-07 Correction/provenance visibility | MC-05/08/11/14 | Implemented: bounded patient activity from existing versions, permission/site-filtered registration, appointments, notes, invoices and reminders; denied mutations retain one audit event after rollback | Focused history isolation and denial/fail-closed tests passed; no protected-value snapshots or parallel ledger |
| PR-08 Scribe/clinical accountability | MC-05/12 | Existing exact-revision review, correction reasons and unsigned export retained; added recorded approving account reference/time. Clinical policy approval remains a human dependency | Reviewer/signature/provenance boundaries; no agent-issued clinical approval |
| PR-09 Cross-domain workflow and accessibility proof | All affected MC rows | Shared loading/empty/stale/error/success/blocked contract implemented; focused tests and desktop/tablet journey completed | Broader role, keyboard/screen-reader and device coverage remains unverified; no source-only completion claims |
| PR-10 Later conditional enhancements | MC-04/13/15 | Review retains later/conditional scope: external sync, advanced recurrence, personalized views, multi-clinic aggregates | Source-specific gap and product/configuration decisions first; no guessed partner, reporting authority or overbooking policy |

Do not mark this assignment complete after a single wave or because checks pass for only part of it. Each recommendation must be linked to an implemented result, verified existing behavior, or a concrete unresolved dependency. Detailed technical boundaries and evidence remain in the linked review and owning implementation briefs.

**Integrated evidence — 2026-09-15/17:** 35 related frontend files / 291 tests passed after narrow repairs; the full frontend suite now passes 51 files / 382 tests after the launch-checklist, workflow-link, tracking-context, duplicate-match and calendar-export additions. Current TypeScript, changed-file Prettier and Vite bundle passed. The repaired Rails regression subset (workforce scheduling, patient-portal visit instructions, and patient-journey continuity) passes 20 runs / 216 assertions with 0 failures and 0 errors. Focused Rails history/registration/clinical/scribe/authorization checks passed after repairing stale fixtures and denial-audit rollback; the final audit file passed 7 tests / 52 assertions. Rails eager loading and 15 changed Ruby files passed RuboCop. Vault verification passed 43 notes / 509 links; harness verification and 23 harness tests passed earlier in the unchanged harness. The full membership test file is not green: an unrelated pre-existing adult-account fixture errors in `publish_catalog`; it is not evidence of a passing whole-repository suite. New one-time payment tests separately cover paid fulfillment, idempotent retry, stale version, disabled simulation and eligibility denial.

**Closeout Steps 4–7 — 2026-09-17:** the broader continuity/checkout/workspace selector is now green at 50 runs / 525 assertions / 0 failures / 0 errors / 0 skips after repairing hard-coded past appointment fixtures and aligning the workspace test with practice-scoped multiple memberships. The paired negative/recovery selector covering appointment idempotency, stale writes, visit recovery, Tracking Board ownership, invoice/payment retry, administrative permissions and provider assignment passes 87 runs / 724 assertions / 0 failures / 0 errors / 0 skips. The retained-session browser smoke matrix passes on desktop, tablet and phone for the seven core clinic routes when pointed at the running stack's `localhost` loopback host; the initial `127.0.0.1` attempt did not enable the development selector and is retained as a harness-host assumption. The fresh synthetic paid-member mutation journey is browser-proven through payment simulation, Patient Flow, Schedule, front-desk check-in and post-arrival Tracking Board. Full assistive-technology, contrast/zoom, two-hour session, provider/live-delivery, clinical, tax, privacy, retention, release and pilot acceptance remain open and unassigned.

**Final handoff and closure record — 2026-09-17:** the bounded local clinic journey is source-complete, locally verified, and browser-verified for the recorded synthetic paths. This is not a human-approval, provider-acceptance, pilot-readiness, or release-readiness claim. The final change set excludes the unrelated `.codex` configuration and attachment files; no secrets, real patient/payment data, external messages, provider credentials, or production records were included. Remaining work is explicitly external or human-owned: complete role-level permitted/denied-action review, assistive-technology/contrast/zoom and two-hour session acceptance, and decisions for clinical governance, Stripe/provider custody, messaging/telehealth/pharmacy/laboratory providers, privacy, tax, retention, support, deployment, pilot and release. Assign those owners before any prelaunch acceptance pass; no further source change is required for this sandbox closeout.

**Browser evidence:** a fresh local login completed through the synthetic organization → clinic → location → team-account selector. Patient Flow loaded the ready-to-schedule synthetic items; opening the new synthetic paid patient preserved and displayed the selected patient, payment state and clinic reference. The month calendar showed capacity, the day view showed the clinician lane and appointment, and the separate Tracking Board remained absent until the appointment was checked in. The source repair prevents an older active encounter's initial-contact task from being projected as a duplicate Patient Flow scheduling card while retaining it in the general Work Inbox. No live money, outbound communication, clinical treatment or actual clinician credentialing was performed. The fixture configuration is synthetic, not an inferred real clinic schedule.

**2026-09-17 stale-projection repair:** the worklist projects `has_recorded_appointment` for manual front-desk initial-contact tasks from tenant-bound appointment state. Patient Flow suppresses only the duplicate task after a non-cancelled, non-no-show appointment exists; the underlying task remains actionable in the general inbox. Focused continuity verification passes 9 runs / 147 assertions; frontend TypeScript, Prettier, and the existing schedule/operations tests pass. Browser re-walk and external/provider/clinical acceptance remain separate.

**Remaining evidence/authority boundaries:** other roles' fresh-login and complete clinical/billing/inventory/workforce/video journeys, full keyboard/screen-reader/device coverage and elapsed two-hour session behavior are not browser-proved here. Live one-time staff MOTO, provider setup, tax applicability, jurisdictional professional policy and export/retention remain explicit dependencies, not silently simulated production capabilities. PR-10 retains its documented later conditions; no blanket application-wide launch acceptance is claimed.

**Two-slice implementation follow-through — 2026-09-16:** activation and recovery screens now expose invitation/recovery, identity verification, account/password completion and patient-link lifecycle steps when a valid token is present. The nurse encounter workspace now exposes encounter, intake, vitals, site and room state beside the patient context. These are source changes using existing server-recorded state; browser acceptance remains open and no new tests were run at the founder's request.

**Status-surface correction follow-through — 2026-09-16:** recall/refill queues expose actionable status summaries; telehealth labels paginated results; billing collections distinguish visible-page counts from total records; inventory readiness messaging matches persisted configuration; workforce and encounter summaries announce dynamic state accessibly; and activation labels describe next steps rather than completed lifecycle claims. These UI clarification changes reuse existing API data and preserve domain ownership; they do not close the broader workflow slices or claim browser, clinical, financial, or release acceptance.

**Top-five audit repair — 2026-09-16:** development clinic login now infers scope only for an unambiguous single-location account, while multi-location accounts remain explicitly scoped. The browser smoke harness now supports one retained-session clinic route matrix, and the matrix passes on desktop and phone across seven core clinic routes. Regression coverage was added for the single-location login contract. Rails impacted checks remain unresolved at 40 runs with three failures and two errors caused by existing fixture/contract assumptions; no full-suite pass is claimed.

**P0 verification follow-through — 2026-09-17:** the development Tracking Board
controller now passes the synthetic scenario projection into its serializer. The
impacted Tracking Board integration selector is green at 34 runs / 298
assertions / 0 failures / 0 errors; the broader continuity/checkout/workspace
selector is now green at 50 runs / 525 assertions after stale fixture repairs.
Fresh browser route entry and the retained-session seven-route matrix are green
through the visible organization → clinic → location → team-account selector on
desktop, tablet and phone. The mutation-based browser walkthrough now covers a
new membership/payment, Patient Flow projection, selected-patient appointment,
front-desk check-in and post-arrival Tracking Board row. Denied-action,
assistive-technology, elapsed-session and external/provider acceptance remain
open; no source-only result is labeled full P0 acceptance.

**P1 verification follow-through — 2026-09-17:** the source-owned registration,
recovery, billing, membership payment, communications, lab follow-up, scribe,
inventory, workforce and appointment-request selector completed 105 runs / 1,354
assertions. Three failures and two errors are isolated to the legacy
`PharmacyWorkspaceTest` fixture/route contract (required product unit metadata
and current receiving lookup); they remain open. The registration, payment,
clinical-record, workforce and scheduling paths otherwise produced no failures
in this selector. P1 browser mutation walkthroughs and the human/provider
governance, privacy, tax, retention and live-delivery gates remain separate and
are not claimed complete.

**Next top-five audit repair — 2026-09-16:** added a visible Patient Flow → Schedule → Tracking Board status map, persistent patient/encounter/site context with guarded clearing, field-level registration ownership/editability hints, shared integration-state badges for telehealth and payments, and savepoint-safe duplicate cash-drawer conflicts. Focused frontend tests (78), web typecheck/build/formatting, and targeted Rails administrative/role checks (16 runs / 166 assertions) pass. Broader clinical, provider, external, accessibility, and release acceptance remains open.

**Final one-time payment repair:** a separate synthetic one-time enrollment now reaches verified local payment and Proceed to onboarding in the browser. Exact configured platform sandbox reuse preserves the existing connection, emits no vendor request and remains development/test opt-in only. Its focused test passed 18 assertions; final two-file Ruby lint passed. Recurring/one-time previews reflect the selected enrollment terms rather than the published package's default renewal choice.

**Architecture decision — D-078:** use the [capability architecture](../../docs/architecture/clinic-capability-architecture.md): shared non-switchable core, setup-time composition and operation-specific clinic/team/FDE change tiers. Earlier development code/data do not constrain the target. Revision 4 of the [weight-loss brief](../../PATIENT_JOURNEY_PROOF_AND_REFINEMENT.md) requires proof of finalization, protected-change denial, an allowed setting change and prospective revision/history behavior within J0–J7. General reconfiguration and a support console are not added scope. The bounded weight-loss composition and local J0–J7 journey are implemented and browser-proved below; this does not establish other specialties or live-provider readiness.

CF-04 maps to MC-01/13/15: classify transition, protect team-managed changes and route unsupported work without inventing support privileges. CV-10 maps to MC-05/06/12: explicit content revision used, mismatched-use denial and independent work. Field/paired-check definitions stay in the engineering guide; these requirements are not passed tests.

**Cross-cutting acceptance — D-073:** every row must use the ownership, dependencies and attention matrix in the [engineering guide](../../docs/development/meta-clinic-build-and-acceptance.md). Identify the person/team responsible, action-specific prerequisites, parallel work, resolution, urgency source and coverage handoff. Prove unrelated actions remain available while an item waits. This applies to the overnight patient-flow assignment; separate AI brainstorming remains outside its scope. This is an accepted build requirement, not verified implementation.

**Composable delivery — D-076:** every configurable feature uses the strategy's shared-core/ten-clinic capability map and the engineering configuration contract; update Clinic Setup with the feature, preserve shared owners and make specialty/modality/payment independent. MC-01's weight-loss assignment establishes this pattern now. Future infusion/resource projections map to MC-04/06/11 (SC-04) and service-linked coverage/authorization review to MC-16 (OP-13); these are planned direction, not current assignment expansion or implemented evidence.

| ID | Workflow | Baseline and evidence | Remaining work / acceptance target |
| --- | --- | --- | --- |
| MC-01 | Clinic setup, specialties and payment model | D-064/D-065 dated baseline; D-075/078 require meaningful weight-loss configuration and tiered change authority. At `76c2b47`, inspected practice-feature types lack weight loss; current design/creation path must be inspected, not automatically preserved. | Revision 4: NEW synthetic clinic/location through Clinic Setup; specialty drives forms, explicit visits and shared components. Prove finalization, CF-01–04, allowed clinic setting, protected-change denial, honest team/FDE route, persistence/retry and another clinic's isolation. No migration of every old fixture. Implemented locally: practice 5/site 4, recipe v1, explicit visits 9/10, forms, finalization and allowed/protected/isolation pairs. See revision-4 evidence below. |
| MC-02 | Branded digital front door and Growth | D-069/D-070 and [account-first enrollment](../../records/progress/2026/09/2026-09-13-account-first-membership-growth.md) document public memberships, prospects and account/payment handoffs. | Inventory broader website/service branding and lead tools; prove clinic isolation, contact-first and self-service journeys. Do not rebuild existing membership entry. |
| MC-03 | Registration, walk-ins and hybrid patient identity | [Clinic-day closeout](../../records/implementation/2026-09-11-ten-audit-dod-closeout.md) reports bounded role-based journey evidence. | Prove walk-in registration and later online/telehealth return use the correct patient record without requiring membership purchase or duplicating identity. |
| MC-04 | Scheduling, capacity and waiting | Closeout item 10 reports capacity, waitlist and cancellation/no-show recovery. The 2026-09-15 [calendar implementation brief](../../docs/development/clinic-schedule-implementation.md) tracks the in-house month/day workspace and arrival-only Tracking Board boundary. | Revalidate current booking, walk-in handling, expiring offers and interrupted accept/decline; demonstrate staff recovery. Calendar verification and missing local clinician setup are distinguished in the brief; no live readiness claim. |
| MC-05 | Intake, rooms and clinician handoffs | Closeout items 2, 5 and 9 report reusable intake, explicit handoff and role-based local evidence. | Reconcile current room/queue path and demonstrate correction, reassignment and cross-role completion. |
| MC-06 | Encounters, orders, results and clinical work | Closeout items 1, 4, 6 and 8 report inbox, medication administration, immunization and linked order/result/referral work. | Revalidate source-owned completion and exceptions; separately identify external order/result integration gaps. |
| MC-07 | Telehealth | D-063 telehealth selection and [Twilio setup](../../docs/development/twilio.md) identify provider direction and setup. | Inspect current implementation; demonstrate patient/provider join, two-party media, disconnect recovery and encounter continuity. Current live-provider status is unresolved in this consolidation. |
| MC-08 | Cash billing, receipts and corrections | [Cash-Pay Billing Implementation Package](../../records/superseded-plans/Cash-Pay%20Billing%20Implementation%20Package.md), [Cash-Pay Billing Test Plan](../../records/superseded-plans/Cash-Pay%20Billing%20Test%20Plan.md) and closeout item 7 contain phased requirements and dated evidence. | Reconcile old gap claims against current code. Prove cash collection/refunds, card outcomes, allocations, receipts and reconciliation through checkout. |
| MC-09 | Memberships, subscriptions and packages | Account-first enrollment and [telephone recurring payment](../../records/progress/2026/09/2026-09-13-worker-assisted-recurring-phone-payment.md) record recent work. | Prove signed payment outcomes, renewal/failure/cancellation and package entitlements. Reader/provider transactions remain separate from local evidence. |
| MC-10 | Medication requests, refills and pharmacy fulfillment | Closeout item 3 reports refill review and medication-request linkage; [[Pharmacy Inventory Data Requirements]] describes broader scope. | Separate internal request/review from prescription transmission, dispensing and delivery. Inventory current adapters and demonstrate intended pharmacy workflow with explicit integration evidence. |
| MC-11 | Inventory and procurement | [[PostgreSQL and Inventory Foundation]] and [[Pharmacy Inventory Data Requirements]] distinguish implemented foundation and extensions. | Reconcile purchasing, receiving, units, lots, expiration, holds, counts, adjustments and encounter-linked stock use; prove retries and reversals. Supplier integration status remains separate. |
| MC-12 | Patient portal, messaging and follow-up | [Portal proposal](../../records/proposals/2026-09-03-patient-portal-implementation-roadmap.md), [workflow delivery](../../records/implementation/2026-09-11-workflow-loop-delivery.md) and closeout describe intake/refills/waitlist/education/recalls. | Reconcile the older proposal with later work; prove mobile patient access, correct visibility, failed-message recovery and return visits. |
| MC-13 | Employee privileges and locations | Existing configured-role direction; closeout reports bounded wrong-role/context checks. | Demonstrate administrator assignment, privilege changes/revocation, location isolation and staff recovery; no independent license check is implied. |
| MC-14 | Reporting and clinic ownership | Product strategy establishes connected reporting and clinic control as intended outcomes. | Inventory current reports/export capability; verify financial/stock/workflow totals against owning records and authorized access. Implementation status unresolved here. |
| MC-15 | Onboarding, integrations and operations | D-067 and [[CICD]] describe onboarding/migration and operating context. | Reconcile integration inventory, configuration, import/export, recovery and operational acceptance. Track external setup separately from application completeness. |

## Vendor-dependent work: build locally now

D-072 adds the following current direction; it does not revive archived proposals. Missing vendor accounts or budget do not block local workflow implementation. The [engineering guide](../../docs/development/meta-clinic-build-and-acceptance.md) owns data mapping, adapter, simulator and recovery expectations in its vendor-independent workflow preparation section.

| Owning row | Current preparation requirement | External dependency / separate proof |
| --- | --- | --- |
| MC-10 | Inspect and finish prescription preparation, destination, assigned review, durable request and response history through the backend | Prescribing-network access, actual mapping and transmission/response acceptance |
| MC-11 | Inspect and finish supplier product/unit mapping, quote requests and dated manual quotes, purchase orders, configured review and receiving | Supplier access for current prices and actual order submission/acknowledgment |
| MC-11 | Inspect and finish shipment records, carrier/tracking identifiers, manual events and order/receiving links | Carrier access and live tracking events |
| MC-16 | Insurance workflow preparation: coverage/policyholder/payer collection, eligibility requests, and local authorization/claim/response/reconciliation work appropriate to configured scope | Payer/clearinghouse access and provider-specific transaction acceptance; insurance remains optional per clinic |
| MC-15 | Apply the same preparation/connection separation to other selected integrations; reuse existing domain mechanisms and inspect what already exists | Record vendor availability and remaining mapping/onboarding work separately from local completion |

Initial status for these requirements: founder-approved direction; current implementation has not been audited in this documentation change. For each row separately record local behavior, synthetic adapter tests and live vendor evidence. A disconnected action must retain prepared work and must not claim a successful external result or send automatically on connection.

## Next bounded work

**2026-09-17 remaining source repairs:** Manual pharmacy catalog creation now
strips unverified NDC identifiers, pharmacy fixtures include the required
inventory bin and input unit, and time-dependent appointment fixtures use
clinic-local daytime slots. The consolidated source-owned selector passes 162
runs / 1,955 assertions with no failures or errors. Desktop and phone browser
route smoke passes; a fresh mutation walkthrough remains unverified because
the managed browser accessibility control was unavailable.

**2026-09-17 P2 boundary decision:** The already-approved P2 baseline is now
recorded as source-complete: Meta Clinic owns scheduling truth, calendar export
is read-only, recurrence/overbook remain explicitly not configured, and owner
views expose aggregate-only clinic/member counts. External calendar sync,
advanced recurrence/overbook, personalized dashboards, and broader
multi-clinic reporting remain conditional; no provider, second source of
truth, preference store, or cross-clinic metric ledger is enabled without an
owner, conflict/source-of-truth policy, role-preference contract, and
aggregate-metric definition.

**2026-09-16 remaining-twelve follow-through:** Schedule now preserves
month/day/site/view/group context in the URL, exports the server-loaded day or
month as read-only iCalendar, and surfaces recurrence/overbook/external-sync
policy state instead of implying unsupported behavior. Tracking Board filters
also survive navigation; cancellation requires acknowledgement that no
message is sent automatically; owner totals are explicitly aggregate-only; and
the smoke harness can exercise the visible development login selector with
`--ui-login`. These local changes close source-owned portions only. Fresh-login
and populated-resource browser proof, keyboard/zoom/assistive-technology
acceptance, clinical and communication governance, external calendar/provider
evidence, recurring/holiday/overbook policy, personalized dashboards, and the
aggregate metric contract remain open gates.

**2026-09-16 next-ten slice:** Patient activity now includes permission-aware
encounter, membership, and payment lineage; the patient UI explains coverage
and non-evidence-of-none semantics. Scribe review, reminders, reports, and the
shared resource-state component now make accountability, lifecycle, export
provenance, and empty-state boundaries visible. These are source-level and
local-synthetic changes; fresh-login, populated-resource, assistive-technology,
live-provider, clinical-governance, export/retention, and production evidence
remain separate gates.

**2026-09-16 slices 1–2:** the authorization foundation now has a forward
role-catalog version 9 migration with a version-derived advisory lock, and the
clinic UI shares one status map across membership, Patient Flow, appointments,
encounters, notes and billing. Schedule and Tracking Board filter changes now
use browser history and restore on Back/Forward; semantically invalid calendar
month/day query values fall back to a safe date. These are source-level
changes. Fresh-login and populated-resource browser proof remains open until
the local API/database stack is available.

**2026-09-16 slices 3–5:** the schedule calendar response now carries a
server-generated `as_of` timestamp. Its read-only iCalendar export is
patient-first, includes provenance/DTSTAMP/location and tentative-versus-
confirmed status, and omits cancelled/no-show visits. Every appointment model
transition persists a server-generated causal id with the immutable model
version; the staff cancellation endpoint is acknowledgement-gated with no
automatic patient message. A forward reconciliation migration carries active
and future role grants onto catalog version 9 under a version-derived advisory
lock. Reporting and integration surfaces retain source, freshness, permission
and configured/unavailable boundaries. These are source-level changes with
focused contract coverage; fresh-login, populated browser, keyboard/zoom/
assistive-technology, clinical/provider governance, export/retention and
production acceptance remain open evidence gates.

**2026-09-14 local implementation complete:** MC-02–MC-12/MC-15 patient-journey source is integrated under the founder's development-efficiency policy `cc56cc4`. All 45 selected Rails cases pass across the focused runs and bounded fixture repairs. TypeScript, bundle, changed-file Ruby lint and 14 related frontend tests passed; earlier 326-test frontend, migration and PostgreSQL evidence is reused where unchanged. Real Rails-backed patient intake/callback, contact-first enrollment, staff dependency/transfer, typed-result acknowledgment and repaired staff-intake walkthroughs passed. [Field ownership and evidence](../../docs/development/patient-journey-implementation-evidence.md) records exact limits. Full regression, connected handover/post-closure browser proof, selected clinical/vendor mappings and launch acceptance remain pending; they are not labeled passed. The plan's current checkpoint owns the next milestone action. Insurance/supplier expansion remains outside this cash-pay assignment.

**Assignment document:** [Tonight's patient-journey execution plan](../../PATIENT_JOURNEY_EXECUTION_PLAN.md) contains the detailed research-derived questions, controls, final founder clarifications, execution slices, acceptance and resume checkpoint. Use it as the starting document for this assignment, not the isolated skill-test draft. The engineering guide remains the canonical shared matrix; this tracker remains the work inventory. Saving the plan does not dispatch implementation.

**Current assignment — revision 4 implemented and locally proved:** [Weight-loss clinic setup and connected patient journey](../../PATIENT_JOURNEY_PROOF_AND_REFINEMENT.md) and the [existing evidence owner](../../docs/development/patient-journey-implementation-evidence.md) record the new clinic 5/location 4 and continuing patient 40 across J0–J7. Initial/return appointments 26/27, encounters 21/22 and intake notes 3/v2 and 5/v2 preserve context. Browser proof includes protected/allowed configuration, signed local membership events, distinct handoff, partial/reversed/post-closure stock, corrected result task reconciliation, exact signed-note versions, five-step included-visit checkout and disconnected video/manual fallback. Focused Rails (18 cases/324 assertions), TypeScript/build and scoped lint/format checks passed. Open source-owned clinical/billing tasks remain explicit; no live-provider or launch acceptance is claimed. The brief checkpoint owns delivery/resume status; the matrix remains canonical.

The original execution plan's revision 2 integrated selected skill-test research, field detail and paired cases. Its implementation run has finished with scoped evidence above; this is not an active-run status. Preserve that detail as input to the current revision 4 assignment; seven test artifacts are evidence, not required building instructions. Estimate/dispute/onsite-testing expansion remains unadopted.

First reconcile one complete membership-based cash-pay weight-loss reference journey: online membership enrollment (paid and unpaid branches), a separate staff/walk-in entry, intake, scheduling, in-person or telehealth encounter, existing scribe-assisted and manual documentation, clinician-reviewed prescription preparation, external-pharmacy or in-house fulfillment, labs, checkout, recurring membership and follow-up. This spans MC-02–MC-12 and MC-15; optional insurance preparation remains MC-16, not a prerequisite for the cash-pay journey. Use current implementation before scheduling additions. This is a build reference, not a new universal clinic protocol or authorization for live payments or clinic launch.

For every touched row, record applicable stable matrix IDs from the [engineering guide](../../docs/development/meta-clinic-build-and-acceptance.md), current owning records/screens, source-backed field/question/control mapping, exact action prerequisites, visible parallel actions, responsible queue, handoff/recovery behavior and missing proof. Cover D-074's membership-only age restriction and online booking rules. Missing clinical policy, consent-contract inspection or vendor mapping must be named explicitly; do not invent it or reopen deferred child workflows.

Acceptance must demonstrate both the blocked action and an independent successful action, multiple simultaneous outstanding tasks, ownership transfer/coverage, duplicate or uncertain events, and open work remaining visible after encounter closure. Prove labs pending while scheduling/visits remain available, prescription preparation while disconnected, and billing/follow-up exceptions without patient-wide locks. Follow the plan's entry-first execution order. Record test/browser evidence only after execution. The current checkpoint distinguishes planned matrix behavior, implemented source and executed acceptance.

## Update format

For each row keep: ID, intended outcome, current source/revision, implementation status, latest dated checks, remaining gap, next proof and assigned task/owner when known. Use planned, partially implemented, implemented pending verification, locally verified, or externally verified with a precise scope. Do not give platform-wide completion percentages from document coverage.

## Consolidated inputs

- [Archived task register](../../records/tasks/2026-09-03-vault-roadmap-and-task-register.md): historical scope; do not reactivate old tasks automatically.
- [Superseded plan archive](../../records/superseded-plans/README.md): preserves the old billing plans and encounter proposals outside the active vault. Do not import their ideas or continuation checklists into MC-08/09 or other rows.
- Portal proposal: historical only. MC-12 follows the approved current strategy and current source; old proposed features are not accepted requirements.
- Workflow delivery followed by ten-priority closeout: later dated evidence can supersede earlier “not tested” statements for the exact covered slice only.
- Decisions and recent progress records: retain original dates and limits; later explicit founder direction governs conflicts.

Older navigation may also route here from guidance-portal, mentoring or historical launch-planning notes. Those belong to the separate product and are not automatically adopted as Meta Clinic work. Preserve their evidence and require explicit scope before scheduling them.

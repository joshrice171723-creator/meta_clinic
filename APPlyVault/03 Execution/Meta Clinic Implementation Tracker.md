---
type: implementation-tracker
status: active
updated: 2026-09-14
lifecycle: active
canonical_for: meta-clinic-implementation-tracking
---
# Meta Clinic Implementation Tracker

Home: [[00 Home]] · Direction: [[Meta Clinic Product Strategy and Scope]] · Acceptance: [Engineering guide](../../docs/development/meta-clinic-build-and-acceptance.md) · Decisions: [[Decisions]] · Outcomes: [[Progress Log]]

## Authority and status

This is the single current Meta Clinic implementation tracker. Individual tasks execute bounded work and report outcomes here; do not maintain a competing mutable checklist. D-071 supersedes the former Shortcut-only tracking direction. Historical plans remain detailed inputs, not current completion authority.

Consolidated 2026-09-13 around the founder-approved strategy. Older records supply dated implementation evidence only: they do not add requirements, features, exclusions or approval steps. No row asserts fresh runtime verification. “Dated local evidence” means a linked record reports scoped passing checks; “reconcile” means inspect current source against current direction before deciding what remains. Owners and deadlines are unassigned unless explicitly agreed.

## Workflow inventory and next proof

**Architecture decision — D-078:** use the [capability architecture](../../docs/architecture/clinic-capability-architecture.md): shared non-switchable core, setup-time composition and operation-specific clinic/team/FDE change tiers. Earlier development code/data do not constrain the target. Revision 4 of the [weight-loss brief](../../PATIENT_JOURNEY_PROOF_AND_REFINEMENT.md) requires proof of finalization, protected-change denial, an allowed setting change and prospective revision/history behavior within J0–J7. General reconfiguration and a support console are not added scope. Research and direction are adopted; application implementation remains unverified.

CF-04 maps to MC-01/13/15: classify transition, protect team-managed changes and route unsupported work without inventing support privileges. CV-10 maps to MC-05/06/12: explicit content revision used, mismatched-use denial and independent work. Field/paired-check definitions stay in the engineering guide; these requirements are not passed tests.

**Cross-cutting acceptance — D-073:** every row must use the ownership, dependencies and attention matrix in the [engineering guide](../../docs/development/meta-clinic-build-and-acceptance.md). Identify the person/team responsible, action-specific prerequisites, parallel work, resolution, urgency source and coverage handoff. Prove unrelated actions remain available while an item waits. This applies to the overnight patient-flow assignment; separate AI brainstorming remains outside its scope. This is an accepted build requirement, not verified implementation.

**Composable delivery — D-076:** every configurable feature uses the strategy's shared-core/ten-clinic capability map and the engineering configuration contract; update Clinic Setup with the feature, preserve shared owners and make specialty/modality/payment independent. MC-01's weight-loss assignment establishes this pattern now. Future infusion/resource projections map to MC-04/06/11 (SC-04) and service-linked coverage/authorization review to MC-16 (OP-13); these are planned direction, not current assignment expansion or implemented evidence.

| ID | Workflow | Baseline and evidence | Remaining work / acceptance target |
| --- | --- | --- | --- |
| MC-01 | Clinic setup, specialties and payment model | D-064/D-065 dated baseline; D-075/078 require meaningful weight-loss configuration and tiered change authority. At `76c2b47`, inspected practice-feature types lack weight loss; current design/creation path must be inspected, not automatically preserved. | Revision 4: NEW synthetic clinic/location through Clinic Setup; specialty drives forms, explicit visits and shared components. Prove finalization, CF-01–04, allowed clinic setting, protected-change denial, honest team/FDE route, persistence/retry and another clinic's isolation. No migration of every old fixture. Planned, not implemented here. |
| MC-02 | Branded digital front door and Growth | D-069/D-070 and [account-first enrollment](../../records/progress/2026/09/2026-09-13-account-first-membership-growth.md) document public memberships, prospects and account/payment handoffs. | Inventory broader website/service branding and lead tools; prove clinic isolation, contact-first and self-service journeys. Do not rebuild existing membership entry. |
| MC-03 | Registration, walk-ins and hybrid patient identity | [Clinic-day closeout](../../records/implementation/2026-09-11-ten-audit-dod-closeout.md) reports bounded role-based journey evidence. | Prove walk-in registration and later online/telehealth return use the correct patient record without requiring membership purchase or duplicating identity. |
| MC-04 | Scheduling, capacity and waiting | Closeout item 10 reports capacity, waitlist and cancellation/no-show recovery. | Revalidate current booking, walk-in handling, expiring offers and interrupted accept/decline; demonstrate staff recovery. |
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

**2026-09-14 local implementation complete:** MC-02–MC-12/MC-15 patient-journey source is integrated under the founder's development-efficiency policy `cc56cc4`. All 45 selected Rails cases pass across the focused runs and bounded fixture repairs. TypeScript, bundle, changed-file Ruby lint and 14 related frontend tests passed; earlier 326-test frontend, migration and PostgreSQL evidence is reused where unchanged. Real Rails-backed patient intake/callback, contact-first enrollment, staff dependency/transfer, typed-result acknowledgment and repaired staff-intake walkthroughs passed. [Field ownership and evidence](../../docs/development/patient-journey-implementation-evidence.md) records exact limits. Full regression, connected handover/post-closure browser proof, selected clinical/vendor mappings and launch acceptance remain pending; they are not labeled passed. The plan's current checkpoint owns the next milestone action. Insurance/supplier expansion remains outside this cash-pay assignment.

**Assignment document:** [Tonight's patient-journey execution plan](../../PATIENT_JOURNEY_EXECUTION_PLAN.md) contains the detailed research-derived questions, controls, final founder clarifications, execution slices, acceptance and resume checkpoint. Use it as the starting document for this assignment, not the isolated skill-test draft. The engineering guide remains the canonical shared matrix; this tracker remains the work inventory. Saving the plan does not dispatch implementation.

**Current next assignment — planning only, revision 3:** [Weight-loss clinic setup and connected patient journey](../../PATIENT_JOURNEY_PROOF_AND_REFINEMENT.md) supersedes the narrow proof-only follow-on. MC-01 configuration plus MC-02–MC-12/MC-15 must demonstrate a NEW clinic through Setup and one continuing weight-loss patient across J0–J7. `af52f9a` supplies reusable supporting implementation/evidence, not completed specialty setup or the entire scenario. CF-01–03 and existing stage IDs govern paired prerequisites. Execution is not dispatched; development-efficiency policy governs focused verification.

The original execution plan's revision 2 integrated selected skill-test research, field detail and paired cases. Its implementation run has finished with scoped evidence above; this is not an active-run status. Preserve that detail as input to the current revision 3 assignment; seven test artifacts are evidence, not required building instructions. Estimate/dispute/onsite-testing expansion remains unadopted.

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

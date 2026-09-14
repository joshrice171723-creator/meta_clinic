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

| ID | Workflow | Baseline and evidence | Remaining work / acceptance target |
| --- | --- | --- | --- |
| MC-01 | Clinic setup, specialties and payment model | D-064/D-065 describe configurable ambulatory core, optional insurance and implementation-specialist scope. | Reconcile configuration UI/API; demonstrate a cash-based clinic with insurance off and different specialty settings without losing core functions. |
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

First reconcile one complete cash-based hybrid clinic journey across MC-02–MC-09: online membership enrollment and a separate walk-in entry, staff intake, encounter, checkout and later telehealth follow-up. Use the current implementation before scheduling additions. Record each missing handoff in its owning row; do not assume missing documentation means missing code. This is a recommended sequence, not authorization to perform live payments or launch a clinic.

## Update format

For each row keep: ID, intended outcome, current source/revision, implementation status, latest dated checks, remaining gap, next proof and assigned task/owner when known. Use planned, partially implemented, implemented pending verification, locally verified, or externally verified with a precise scope. Do not give platform-wide completion percentages from document coverage.

## Consolidated inputs

- [Archived task register](../../records/tasks/2026-09-03-vault-roadmap-and-task-register.md): historical scope; do not reactivate old tasks automatically.
- [Superseded plan archive](../../records/superseded-plans/README.md): preserves the old billing plans and encounter proposals outside the active vault. Do not import their ideas or continuation checklists into MC-08/09 or other rows.
- Portal proposal: historical only. MC-12 follows the approved current strategy and current source; old proposed features are not accepted requirements.
- Workflow delivery followed by ten-priority closeout: later dated evidence can supersede earlier “not tested” statements for the exact covered slice only.
- Decisions and recent progress records: retain original dates and limits; later explicit founder direction governs conflicts.

Older navigation may also route here from guidance-portal, mentoring or historical launch-planning notes. Those belong to the separate product and are not automatically adopted as Meta Clinic work. Preserve their evidence and require explicit scope before scheduling them.

# Non-vendor clinic hardening — agent handoff

**Revision:** 2 · **Date:** 2026-09-22 · **Planning status:** approved product direction; local implementation is in progress, not authorization for external or regulated operations.

**Owner:** Meta Clinic implementation agent, one slice at a time. The [implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) remains the current work inventory; this brief supplies the detailed sequence and handoff context for priorities 2–10.

## Read this before starting or resuming

1. Read this brief, [Decisions D-079](../../APPlyVault/03%20Execution/Decisions.md), the relevant tracker row, and the complete applicable matrix in [the engineering guide](meta-clinic-build-and-acceptance.md). Compare the recorded baseline with the current checkout and newer user direction before editing.
2. Follow the repository `AGENTS.md`, its start-read-only procedure, the applicable nested instructions, and the current source graph. Preserve unrelated work and use only independently created synthetic data.
3. Treat the listed current implementation as a source-inspected baseline, not fresh runtime or browser proof. Do not mark a slice complete until its stated checks have actually run.
4. Work one bounded vertical slice at a time. Update the tracker and this brief's checkpoint after a meaningful completed slice, a new blocker, or before handing work off. Do not silently expand scope, reactivate deferred features, or replace an owning record with a parallel store.

## Outcome, scope, and boundaries

Build the non-vendor foundations behind priorities 2–10:

1. cash-pay estimates and Good Faith Estimates (GFE);
2. internal availability, capacity, holds, booking, and recovery;
3. typed laboratory result semantics;
4. administration-grade immunization records;
5. synthetic browser proof for registration and clinical-record mutations;
6. synthetic browser proof for inventory and workforce mutations;
7. a Web Content Accessibility Guidelines (WCAG) 2.2-oriented acceptance pass;
8. a bounded reporting/export/audit/retention catalog; and
9. an internal service-offering catalog connected to setup and scheduling.

This implements D-079's reusable product direction. It does **not** select an actual clinic, state, service/test catalog, medication protocol, clinician privilege/delegation policy, price/tax/refund rule, retention period, privacy owner, pilot cohort, external connection, or release date. Those remain named human gates. No live payment, insurance, laboratory, immunization registry, supplier, payroll, or production operation is authorized.

### Baseline as of 2026-09-22

At `caeec3ca` on `main`, the source has appointment/calendar, billing ledger/invoice, lab report, immunization, inventory, workforce, and setup primitives. The [remaining-work audit](../product-review/meta-clinic-remaining-work.md) reports local API/selective browser evidence for some journeys, while the [healthcare gap audit](../../records/audits/2026-09-10-us-healthcare-standards-product-gap-audit.md) identifies the missing GFE, Schedule/Slot-like, typed-lab, administration-grade immunization, and internal service-offering slices. Do not rely on this statement without reconciling the current checkout.

### Current implementation checkpoint — 2026-09-22

Slice 1 is implemented locally and awaiting the scoped final gate: `Clinic::ServiceOffering` is a tenant-scoped operational configuration record with draft/published/retired state, visit-type and optional billable-price references, eligible-site links, duration/modality, room and booking prerequisites, optimistic locking, idempotency, and audit evidence. Clinic Setup now has a synthetic browser-facing configuration panel. The focused API contract passed 3 runs/25 assertions; TypeScript and the production bundle passed. The test and local development migrations applied cleanly with generated PostgreSQL structure. Browser mutation proof, appointment linkage/retirement preservation, eligible-team coverage, contact/referral requirements, and all later slices remain open; this is not a claim of scheduling, clinical, legal, or release readiness.

## Shared data, ownership, and failure contract

Every slice reuses the existing patient, practice, site, encounter, task, audit, billing, inventory, and authorization boundaries. New state must be backend-owned, tenant/site-scoped where applicable, versioned or append-only when it changes a clinical or financial record, and exposed through the normal API—not frontend fixtures.

Apply these existing matrix entries; do not create a competing dependency matrix:

| Slice | Applicable matrix entries | Required paired proof |
| --- | --- | --- |
| Service offerings and setup | CF-01–04, OP-10–12 | An unconfigured service cannot publish/book, while an unrelated configured service still works. |
| Availability and booking | SC-01–04, OP-10–11 | Conflicting capacity denies confirmation atomically; an alternative resource/time or non-booking work remains available. |
| GFE and cash-pay estimates | OP-01, OP-05, OP-10–12 | An incomplete/unapproved GFE cannot issue; a general estimate draft and unrelated care still save. |
| Laboratory semantics | LB-01–07, OP-05, OP-10, OP-12 | A corrected or unmapped result reopens only affected review; received results do not falsely mark patient contact complete. |
| Immunizations | CV-05, IN-01–03, OP-05, OP-10, OP-12 | Missing authorization/stock/VIS blocks the administration event, not history viewing or unrelated care. |
| Browser journeys | EN-04–06, CV-01–04, CV-09, LB-04–07, OP-01–05, OP-10–12 | Each workflow shows a permitted action and the relevant denied/recovery action in a real browser. |
| Accessibility | OP-10 and every changed action's entry | Keyboard/focus/error recovery is observable; a blocked action explains its reason without color alone. |
| Reporting, exports, retention | OP-01, OP-04–05, OP-10–12 | An unauthorized/undefined export is denied while authorized chart work and aggregate viewing remain available. |

Do not let assignment grant permission, encounter closure complete open work, a receipt prove payment, a result receipt prove review, a patient attestation prove clinician review, or a completed follow-up prove refill/dose authorization. Preserve draft, correction, stale-edit, duplicate/outcome-unknown, transfer/coverage, and encounter-closure behavior in every changed path.

## Standards and source-to-requirement map

These sources were reviewed on 2026-09-22. They are design inputs within the stated scope, not compliance claims or a mandate to implement FHIR-native records. Re-open the exact source/version before an implementation changes a mapped field.

| Source and applicability | Requirement interpretation | Mapped slice and implementation boundary |
| --- | --- | --- |
| [CMS: Good Faith Estimates for uninsured or self-pay people](https://www.cms.gov/initiatives/your-patient-rights/medical-bill-rights/know-your-medical-bill-rights/know-your-medical-bill-rights-when-not-using-insurance), U.S. federal consumer guidance, accessed 2026-09-22 | CMS describes a written estimate of expected charges for qualifying uninsured/self-pay circumstances and a comparison to final bills. Exact applicability, delivery timing, content, entity, and state rules need billing/legal review. | A versioned GFE is separate from a general estimate, invoice, receipt, payment, membership, and clinical plan. No automatic determination that every estimate is a legal GFE. |
| [FHIR R4 Schedule](https://hl7.org/fhir/R4/schedule.html), sections 12.12.1–3, global technical foundation used with U.S. workflow | Schedule/Slot concepts separate availability from appointments and can coordinate resources. | Model internal availability/holds/slots without claiming a FHIR interface or prescribing recurrence/overbooking policy. |
| [FHIR R4 Slot](https://hl7.org/fhir/R4/slot.html), section 12.13, global technical foundation used with U.S. workflow | A Slot is a bookable time on a Schedule. | Link holds and appointment requests to a durable slot/resource projection; the appointment remains the confirmed visit record. |
| [US Core Laboratory Result Observation 9.0.0](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-lab.html), U.S. Core STU 9 on FHIR R4 | When using the profile, laboratory category, code where available, result/absence reason, UCUM numeric units, interpretation, range, and specimen support matter. | Preserve source values and documents; map typed internal results without claiming profile conformance or inventing codes/conversions. Partner/profile selection remains unresolved. |
| [CDC VIS instructions](https://www.cdc.gov/vaccines/hcp/about-vis/instructions.html), U.S. federal requirements for covered administered vaccines | For applicable administered vaccines, VIS edition/provision date and administration identity/date/manufacturer/lot must be recorded; state requirements can add obligations. | Keep historical immunization reports distinct from administered-here events. Initial clinic scope keeps immunization administration disabled until human approval. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/), engineering target, accessed 2026-09-22 | Use AA-oriented checks for keyboard focus, labels/status, contrast, errors, modal focus, and 320 CSS-pixel reflow. This is not an ADA or legal conformance determination. | Build an evidence pass against selected staff and patient flows, including assistive-technology/browser choices actually used in testing. |
| [HHS HIPAA retention FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html), U.S. federal privacy guidance | HIPAA does not establish a universal medical-record retention period; state law generally governs. | Retention policy/version is a required human-configured input for export/deletion enforcement; do not invent a default period. |
| [FHIR R4 HealthcareService](https://hl7.org/fhir/R4/healthcareservice.html), global technical foundation used with U.S. workflow | Service identity, location, eligibility, referral, and availability are distinct concepts. | Build a local service-offering record, not a price list or a performed procedure; no FHIR claim or universal clinical activation. |

## Slice order and handoff packages

### 0. Establish the acceptance harness first

Before changing any domain slice, inspect its current route/API/model/test path with the source graph. Reuse `apps/web/scripts/browser-acceptance.mjs` and focused API/frontend test conventions rather than inventing a second browser harness. Add only the synthetic fixture setup necessary for the selected slice through real backend APIs.

Each implementation agent must record: current commit; source paths inspected; exact command output; browser route, role, viewport, and synthetic scenario; and what was not tested. A route load, a screenshot, or a passing typecheck is not mutation proof.

### 1. Internal service-offering catalog and clinic setup

**Why first:** downstream availability, estimate line items, reporting definitions, and booking must refer to one selected service instead of duplicated strings or billing prices.

**Reuse and inspect first:** `apps/web/src/features/clinic/BillingServiceCatalog.tsx`, `Facilities.tsx`, `PracticeFeatureSettings.tsx`, `VisitTypeSettings.tsx`, the corresponding `/api/clinic` controllers/models, and `docs/development/clinic-schedule-implementation.md`.

**Add a backend-owned service offering, separate from billing price and completed procedure:**

| Field/control | Rule |
| --- | --- |
| Stable offering ID, name, status, effective revision | Read-only identity/history; retirement preserves historical appointments, estimates, and completed work. |
| Clinic scope, eligible sites, modality, specialty/capability | Search/select existing scoped records. Missing configured dependencies deny publication/booking under CF-01; optional offerings do not become clinic-wide requirements. |
| Visit type, duration, required resources, booking/referral prerequisites | Backend validation; references only to selected configured records. Do not encode a clinical triage protocol or unavailable resource as free text. |
| Eligible team/role reference, contact route, and service requirements | Assignment is not license verification or a privilege grant. Missing eligible coverage is visible as OP-05. |
| Billing-price reference | Link to a separately versioned price record. A price change never rewrites the service definition or historic estimate/invoice. |
| Human approval/publish state | Drafts are saveable; publishing requires the existing authorized configuration action and all required scoped references. |

**Acceptance:** authorized configuration creates/revises/publishes one offering; unconfigured site/resource denies publish; a historical appointment remains readable after retirement; cross-practice/site access is denied; browser verifies draft, error/recovery, publish, and an independent existing service.

### 2. Availability, capacity, holds, booking, and recovery

**Reuse and inspect first:** `apps/api/app/queries/clinic/scheduling/calendar.rb`, scheduling controllers/models, `apps/web/src/features/clinic/ClinicSchedule.tsx`, `CareFlow.tsx`, and their focused tests. Preserve the existing calendar and appointment records.

**Add internal schedule/slot-like projections, not a universal recurrence engine:**

| Field/control | Rule |
| --- | --- |
| Availability rule/version, site timezone, effective interval, resource reference | Managed by authorized scheduling/configuration roles. Store actual instants and display the relevant site/patient timezone. |
| Required resources | Selected clinician/team, room/chair/equipment, and service offering references. Capacity is calculated from compatible current resources; no default overbooking. |
| Blocked time/closure/absence | Reason category, creator, affected resources, interval, and audit history. It does not erase booked appointments or automatically complete clinical tasks. |
| Slot/projection | Start/end, availability status, required resources, source rule/version, and generated-at/revision. Do not treat a displayed opening as reserved. |
| Hold | Request identity, slot/resource set, expiry, actor/patient context, and state: active, expired, released, converted, outcome-unknown. A hold is not an appointment. |
| Booking | Atomically re-check all resources on confirmation; consume capacity once; preserve request identity and known outcome. |

**Recovery and policy gates:** expired holds show released capacity and current alternatives; unknown outcomes reconcile before retry; cancellation/no-show releases only appropriate capacity and keeps labs/follow-up visible. Keep recurrence and overbooking unavailable unless a later policy identifies scope, approver, limits, and patient communication.

**Acceptance:** two competing holds/bookings prove only one confirmation succeeds; expiry releases capacity; closure/absence identifies affected bookings without deleting them; stale/duplicate requests do not double-book; a browser shows conflict reason, alternate availability, owner, and recovery.

### 3. Cash-pay estimates and GFE workflow

**Reuse and inspect first:** billing ledger, invoice, payment, receipt/refund, membership, and service-price owners; do not copy the old superseded billing-plan requirements into current scope.

**Build two explicitly labelled records:** a general internal/patient estimate and a GFE candidate/issued record. Neither is an invoice, receipt, payment authorization, clinical authorization, or promise of outcome.

| Field/control | Rule |
| --- | --- |
| Estimate identity/revision, patient/prospect, clinic/entity, service-offering/price references | Persist immutable issued snapshots; derive line items from selected service/price revisions rather than retyped fees. |
| Classification | `general_estimate`, `gfe_candidate`, or `issued_gfe`; only authorized billing workflow may issue a GFE after policy/applicability inputs are present. |
| Expected charge lines | Amount/currency, source price revision, quantity, inclusions/exclusions, date basis, and plain-language display. Preserve unknown/unconfigured charges explicitly. |
| Applicability/delivery evidence | Self-pay/uninsured context as applicable, request/scheduled context, delivery method/status/time, issuer, document revision, and required policy version. Do not infer federal or state applicability from a membership. |
| Invoice comparison | Link final invoice/posted charges to the issued snapshot; show differences without rewriting either record. Dispute handling is a reviewed policy/workflow, not an automatic legal conclusion. |
| Corrections | Supersede, do not edit, an issued record; explain reason and preserve delivery history. |

**Acceptance:** billing role can save a draft; undefined service price or missing GFE policy blocks only issuance; issued snapshot remains immutable after price change; invoice comparison works with synthetic data; unauthorized issue/export is denied; browser proves patient-safe presentation, retry, correction, and posted-invoice comparison.

### 4. Typed laboratory-result semantics

**Reuse and inspect first:** `PatientLabReports.tsx`, `LabReviewWorklist.tsx`, `LabFollowUpWorklist.tsx`, lab-report versions, result-review operations, and existing order/specimen/report tests.

**Add versioned result rows and source-faithful report metadata:**

| Field/control | Rule |
| --- | --- |
| Source report/version, patient/order/specimen links, status | Preserve original, preliminary/final/corrected status, received/result/collection times, performing/issuing organization, and human/source provenance. |
| Test coding | System URI, code, display, version if supplied, and source text. An unmapped test stays source text; no invented LOINC/SNOMED code. |
| Typed value | Exactly one supported value form: numeric, coded, text, boolean, range, or explicit data-absent reason. Validate shape; never turn missing value into normal/negative. |
| Quantity/unit | Store original display and UCUM code only when validated for compatible dimensions. Never calculate clinical conversions from a display label alone. |
| Interpretation/range/specimen | Preserve source flags, reference range, specimen type/source, and method when supplied. Do not derive normality or urgency from the value. |
| Review/follow-up | Received, reviewed, patient-contacted, and action-completed are separate attributed states. Corrections reopen affected review/work under LB-06/07. |

**Acceptance:** source report with numeric, coded, text, and absent result examples persists/reloads; invalid code/unit pair is rejected without losing the source document; corrected result creates renewed review without closing patient contact; wrong patient/source mismatch is denied; browser displays provenance and unchanged original text.

### 5. Administration-grade immunization records

**Dependency:** keep administration unavailable for the initial clinic until a founder/clinical reviewer chooses actual service scope, sites, personnel, and state review. Historical immunization recording must stay available and must not be reclassified as administered-here.

**Reuse and inspect first:** `ClinicalPlanWorkspace.tsx`, immunization revision/model/controller paths, inventory lot records, authorization and medication-administration verification.

**Design the disabled-but-complete data contract:**

| Field/control | Rule |
| --- | --- |
| Event distinction | `historical_reported` versus `administered_here`; only the latter can consume inventory or require current-order/authority checks. |
| Vaccine identity | CVX when source/selected catalog supports it; manufacturer/MVX where applicable; display/source terminology and version stay distinct. |
| Admin event | Date/time, dose/unit, route, site, performer name/title/facility address, order/reference, status given/partial/not-given and reason. |
| Inventory | Linked lot, expiry, product, and one idempotent stock movement. Expired/held/missing lot blocks the event under IN-01/02. |
| VIS | Edition date, provision date, delivery status, and source/reference for applicable covered vaccines. |
| Corrections | Append an attributed correction/reversal, preserve original, and reconcile inventory exactly once. |

**Acceptance:** feature gate denies creating administered-here events while allowing history; enabled synthetic fixture (only after authorized scoped test configuration) requires all current-event fields, rejects stale order/held lot, links one lot movement, and preserves a correction. Add role/site denial and browser proof before calling the slice locally complete.

### 6. Browser proof: registration and clinical-record journeys

**Purpose:** turn already-tested API contracts into reproducible visible synthetic workflows. This slice changes tests/harness or repairs found defects; it does not add new clinical policy.

**Scenarios:**

1. Search/register a synthetic patient; show duplicate warning and unknown/invalid DOB handling without an automatic merge.
2. Create/safely recover encounter intake; record vitals and a correction; show source, owner, and reopen behavior.
3. Create a note draft, sign one reviewed revision with authorized role, amend it, and verify original revision remains readable.
4. Receive/review/correct a lab report; prove received is not patient-contacted or closed.
5. Attempt encounter closure with open lab/follow-up work; prove the tasks remain visible and owned.

Each scenario must include permitted and denied roles, persistence after reload, stale/duplicate request recovery where available, selected patient/site context, and a screenshot or trace that does not expose real data.

### 7. Browser proof: inventory and workforce journeys

**Reuse and inspect first:** `InventoryApp.tsx`, inventory receiving/movement/approval routes and tests, workforce schedule/timecard/payroll screens, and `PayrollExportsController`.

**Scenarios:**

1. Receive synthetic inventory against a prepared purchase order; select lot/expiry/unit/location; create one movement; reject invalid unit/expired/held path without changing stock.
2. Execute an adjustment/count/approval or required two-person review through permitted and denied roles; show audit provenance and reload persistence.
3. Create/correct/approve a timecard; show the prior version and authorized reviewer; generate a synthetic payroll export preview/download only through the configured local path.

Prove cross-site/practice isolation and that inventory approval never grants payroll or clinical authority. Supplier/carrier/live payroll delivery remains out of scope.

### 8. Accessibility acceptance pass

Use current staff desktop/tablet and patient phone flows selected above. The acceptance target is WCAG 2.2 AA-oriented engineering evidence, not an accessibility or legal certification.

| Area | Required observed evidence |
| --- | --- |
| Keyboard and focus | Complete each selected journey without a mouse; visible focus; no focus trap; modal opens, labels, and restores focus; error summary/direct field focus is usable. |
| Semantics/status | Inputs, required/invalid state, buttons, dialogs, tables/calendar controls, loading, stale, success, and blocked messages have programmatic names/roles/status. |
| Visual/reflow | Contrast inspection with chosen tool; 200% text zoom and 400% browser zoom/reflow; 320 CSS-pixel-width reflow unless two-dimensional layout is necessary. |
| Failure/recovery | Save failure, retry, stale edit, denied action, empty state, loading, and network-unavailable state remain understandable without color alone. |
| Assistive technology | Record actual browser, operating system, screen reader if used, viewport, date/build, observed result, and known limitation. Do not claim unrun screen-reader coverage. |

Log issues with route, control, reproduction, severity, owner, and retest evidence. Fixes become their own bounded implementation slices.

### 9. Reporting, exports, audit, and retention catalog

**Reuse and inspect first:** current owner/aggregate reporting, read-only calendar export, billing/inventory/workforce reports, and audit recorder. Do not create a parallel spreadsheet or unrestricted full-chart export.

**Create a versioned report-definition catalog before adding reports:**

| Field/control | Rule |
| --- | --- |
| Report identity, purpose, source records, definition/revision | A report is a named derived view, not a second system of record. Keep source and calculation definitions explicit. |
| Population, filter/date/timezone/freshness | Define denominator, date basis, timezone, inclusion/exclusion, and data freshness. Show missing-data counts where relevant. |
| Columns and drill-down | Each field has a source/provenance; aggregate-only owner views remain aggregate-only. Drill-down follows existing record permission. |
| Permission/export policy | View and export are separately authorized. Exports require purpose, recipient/channel when applicable, source revision, generated time/actor, and audit event. |
| Reconciliation | Name a responsible team/role and comparison source. Wrong totals create an issue; source records are not rewritten to match a report. |
| Retention/legal hold | Record a policy version and state; do not enable a destructive retention job until the clinic's state/legal policy, owner, and hold behavior are accepted. |

Start with: open clinical work by owner (not aggregate owner detail), daily visits by state, billing/estimate exceptions, inventory expiry/hold, and workforce approval exceptions. Each report must prove permission filtering, known freshness, calculation fixture, and export denial/issuance behavior with synthetic data.

## Cross-slice acceptance and stop conditions

For every slice run focused backend tests, focused frontend tests/typecheck/bundle as changed paths require, and one real browser walkthrough with synthetic data. Exercise tenant/site/role denial, stale edits, duplicate/outcome-unknown requests, source correction, ownership transfer/coverage, and open work after encounter closure where the slice touches them. Record actual command output; do not reuse stale evidence after a relevant contract changes.

Stop only the dependent path and surface a named decision when any of these is required: state/jurisdiction rule, actual service catalog, clinician/delegation/coverage choice, legal entity/tax/receipt/retention choice, external vendor specification, production data, pilot, or release authorization. Continue independent local infrastructure work.

## Checkpoint

**Created 2026-09-22:** planning brief only. No implementation or verification was performed by creating this document. Current next action is Slice 1: reconcile the existing billing price catalog, visit type/settings, and scheduling owner records; then implement the smallest versioned internal service-offering vertical slice with CF-01/02/03/04 paired tests and one synthetic browser walkthrough.

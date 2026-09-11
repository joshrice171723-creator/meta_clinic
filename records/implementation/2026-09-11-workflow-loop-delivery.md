# Workflow loop implementation — 2026-09-11

Scope: Meta Clinic, local source on `main`. Baseline: [2026-09-10 ambulatory workflow gap review](../audits/2026-09-10-cash-based-ambulatory-user-workflow-gap-review.md). The user requested progress toward 90/100 within one hour and then explicitly excluded test work. This is implementation pending verification; no score or runtime acceptance is established.

## Delivery boundaries

- Coordinator: reusable patient intake using encrypted, versioned previsit notes; shared route/navigation integration.
- Work inbox: existing authorized tasks, intake, orders, results and referral work presented together with source action links.
- Checkout: guided persisted-state checklist and package invoice / next-charge visibility; remaining service entitlements are not inferred.
- Refills: patient request through staff review and patient-visible response, without issuing prescriptions or sending external messages.
- Capacity/waitlist: provider/site weekly hours, blocked time, FIFO queue, cancellation openings, expiring holds, portal accept/decline, staff-recorded acceptance and atomic booking. Booking/rescheduling share capacity guards.
- Recalls: existing clinician-entered follow-up due dates project a population worklist with outreach history, snooze/exclusion, completion evidence and patient drill-down. Events are append-only; stale changes conflict.
- Education: existing portal-designated material links appear for the patient with append-only acknowledgment and tenant/patient/identity provenance. Internal education notes are not released.
- Inbox exceptions: authorized latest unsigned SOAP revisions from open/completed encounters, and encounter-linked failed/payment-reconciliation items. Sources retain truncation and failure notices.
- Preserve pre-existing `apps/web/src/shared/forms.css` edits and `docs/manual-deployment-guide/`.

## Failure-first design

Principal failures are wrong patient/tenant disclosure, stale drafts overwriting a newer revision, ambiguous retries creating duplicates, and presenting operational acknowledgment as clinical or financial completion. Reuse authenticated/scoped APIs, append-only previsit revisions and request keys, retain drafts on failures, and derive completion from owning records. Inbox rows link to the authoritative action; they cannot close a clinical order. Refill decisions remain explicitly human-reviewed and patient-visible. Intake answers remain patient-reported until reviewed.

Deferred proof: synthetic cross-patient denial, stale/replayed intake submission, refill role/transition/replay behavior, partially failing inbox sources, unpaid/processing checkout and absent package data. No tests were added, edited or run. Build and browser verification were deferred. One education subagent ran Ruby syntax checks and a web typecheck contrary to the coordinator's build-only hold; that typecheck reported integration errors in concurrently written files. Those reported missing-icon, MUI prop, duplicate-default and nullable-state errors were repaired in source; the typecheck was not rerun, so no green compilation claim is made. Manual fallback remains each existing source workflow; do not claim success for failed or unavailable source data.

## Standards and design inputs

Accessed 2026-09-11. No exchange partner or mandated exchange version was specified; these are pinned design inputs, not a conformance claim.

| Source | Applicability and mapping | Implementation boundary |
| --- | --- | --- |
| [US Core QuestionnaireResponse 8.0.1, STU8, FHIR R4.0.1](https://hl7.org/fhir/us/core/STU8.0.1/StructureDefinition-us-core-questionnaireresponse.html) | U.S. questionnaire responses identify form, question, patient, status and authored date; provenance distinguishes reported answers from interpretations. | Versioned intake field identifiers and patient-submitted encrypted previsit revisions; no automatic diagnosis, scoring or chart assertion. |
| [US Core MedicationRequest 8.0.1, STU8, FHIR R4.0.1](https://hl7.org/fhir/us/core/STU8.0.1/StructureDefinition-us-core-medicationrequest.html) | U.S. medication request context distinguishes patient, status, intent and requester. | A refill support request and staff response are not an issued prescription. |
| [FHIR Task 4.0.1](https://hl7.org/fhir/R4/task.html) | Base R4 workflow concepts align with the selected U.S. Core R4 ecosystem; owner and task status do not replace clinical resource state. | Inbox aggregation and checkout orchestration are product choices; no new clinical rules or FHIR endpoint. |
| [Material UI Stepper](https://mui.com/material-ui/react-stepper/) | Existing installed MUI 9 component system; published composition documentation accessed through MUI MCP. | Existing MUI controls and status semantics; no dependency changes. |

No implementation guide prescribes a front-desk checkout checklist or inbox layout. Existing payment, authorization and encounter rules remain authoritative. Generic configurable form authoring, legal consent/signature workflows, automated screening-rule derivation, prescribing/transmission integrations, external notifications, site-less failed-payment aggregation and remaining package service entitlements remain gaps. These slices do not establish a verified 90/100 score.

## Persistence and handoff

Three migrations (`20260911001000`, `20260911002000`, `20260911003000`) installed successfully in the existing local `apply_development` database. No test database was touched. Generated schema changes retain only this task's four new tables and supporting indexes; unrelated local schema drift was excluded. Runtime privilege source includes append-only recall and education tables; hosted grants/deployment were not changed.

[Appointment R4.0.1](https://hl7.org/fhir/R4/appointment.html) and [Slot R4.0.1](https://hl7.org/fhir/R4/slot.html), reviewed 2026-09-11, inform the distinction between an offered interval, capacity hold and booked appointment in the U.S. Core R4 ecosystem. They do not prescribe FIFO ranking or a clinical scheduling policy. No FHIR endpoint or conformance certification is claimed.

Source integration includes `/clinic/work`, `/clinic/refills`, `/clinic/waitlist`, `/clinic/recalls`, guided encounter checkout, and patient portal intake/refill/waitlist/education panels. Existing encrypted clinical records and audit mechanisms remain the owners of durable state. Refill approval is a human review disposition, not a sent prescription. Staff-created refill requests currently require an active patient portal identity.

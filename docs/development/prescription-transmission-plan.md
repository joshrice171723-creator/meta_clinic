# Prescription transmission implementation brief

**Status:** local synthetic implementation delivered on 2026-09-20; live connection still requires separate authorization.

**Tracker:** [MC-10](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md)

**Scope:** a vendor-independent, outpatient, outside-pharmacy prescription workflow for the cash-pay core. The first implementation may submit only to a backend-owned simulated pharmacy network. It must never claim an external pharmacy received, filled, delivered, or administered a medication.

## Authority, baseline, and exclusions

This brief implements the planning direction in [D-072](../../APPlyVault/03%20Execution/Decisions.md#build-local-workflows-before-vendor-access), using the standards practice in [D-066](../../APPlyVault/03%20Execution/Decisions.md#standards-as-a-primary-healthcare-design-input). It maps to the existing dependency matrix entries RX-01 through RX-03 and OP-06 through OP-08, OP-10, and OP-12 in the [engineering guide](meta-clinic-build-and-acceptance.md). It does not create a second matrix.

Source inspection on 2026-09-20 found a reusable foundation:

- `MedicationRequestRevision` already preserves versioned medication, instruction, quantity/refill, pharmacy, fulfillment-route, and transmission-state fields.
- `PrescriptionWorkflow` already requires the current authorized revision, an exact clinician review, outside-pharmacy fulfillment, complete release data, idempotency, and reconciliation of unknown outcomes before another attempt.
- `PrescriptionEvent` keeps immutable manual or simulated evidence. `PrescriptionFulfillmentPanel` displays the history, while `RefillRequestQueue` and `RefillMedicationRequest` support patient/staff refill intake and a linked medication request.

The foundation is **not** a connected e-prescribing service. In particular, it has no pharmacy directory, partner-specific request/response mapping, transmission-attempt record, network credential, vendor correlation identifier, or external acceptance evidence.

### Explicit exclusions

- Real pharmacy or prescribing-network transmission, credentials, purchasing, contracts, onboarding, or automatic backlog submission.
- Controlled substances, Electronic Prescribing of Controlled Substances (EPCS), Prescription Drug Monitoring Program checks, and state-specific prescribing or dispensing rules.
- Automated clinical decisions, eligibility determinations, dose conversion, formulary claims, prior authorization, medication-history retrieval, or patient eligibility screening.
- Claiming that a role confirms licensure, that a simulated acknowledgment is a dispense, or that a refill request is an approved prescription.

## Terminology and source-to-requirement mapping

HL7 FHIR is the internal record-design reference. NCPDP SCRIPT is the actual U.S. e-prescribing exchange family; an eventual vendor contract selects its exact transaction version and required fields.

| Source reviewed 2026-09-20 | Applicability and interpretation | Planned data/UI/test mapping |
| --- | --- | --- |
| [HL7 FHIR R4 MedicationRequest](https://hl7.org/fhir/R4/medicationrequest.html), R4 4.0.1 | Global technical foundation used under D-066; not an adopted integration profile. It models status, intent, medication, patient, encounter, requester, dosage, dispense, intended dispenser, substitution, replacement, and lifecycle provenance. | Keep `MedicationRequestRevision` as the versioned order source; add destination snapshots, a prior-prescription link, version-bound review, and append-only attempt history. |
| [NLM RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/index.html) | U.S. terminology reference for normalized clinical-drug names and cross-vocabulary mapping. It does not determine the prescribed drug, dose, or a vendor's required code. | Store coding system, code, version, display, catalog source, and human verification separately from the order text. |
| [CMS e-prescribing standards](https://www.cms.gov/medicare/regulations-guidance/electronic-prescribing) | For covered Part D transactions, CMS identifies NCPDP SCRIPT 2023011 with the 2017071 transition ending January 1, 2028. This does not select a commercial network or establish an obligation for every Meta Clinic customer. | Make the future adapter version explicit; leave it unset while disconnected. Test that no simulated mapping is represented as partner conformance. |
| [42 CFR 423.160](https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-423/subpart-D/section-423.160) | The regulation enumerates prescription-related transactions including NewRx, RxChange, RxRenewal, CancelRx, RxFill, medication history, and electronic prior authorization. | Model transaction type and outcomes now; first slice exercises NewRx, reconciliation/cancel, refill response, and simulated RxFill only. |
| [NCPDP SCRIPT resources](https://ncpdp.org/Resources.aspx) | Partner-specific implementation details remain unavailable until a vendor is selected. NCPDP materials identify SCRIPT 2023011 lifecycle changes, including CancelRx, RxChange, RxRenewal, and RxFill. | Retain source/version/correlation fields; do not invent partner-required fields or exact payloads. |

## End-to-end workflow

| Stage | Actor and visible action | Owning record and action prerequisite | Completion evidence and recovery |
| --- | --- | --- | --- |
| Draft | Authorized clinician or delegated staff creates/edits a medication-request draft in the encounter Clinical Plan. | Current `MedicationRequestRevision`; patient, encounter, site, author, and version are server-owned. | Draft saves without a pharmacy destination. A stale write restores/reconciles the draft under OP-10. |
| Medication identity | User searches/selects a medication and sees code/source/version with human-readable name, strength, and form. | Coded identity is required to prepare an outside-pharmacy prescription; do not infer a code, strength, or dose conversion. | Unmapped medication remains a draft with the exact missing-data reason (RX-01). |
| Prescription details | User enters or confirms SIG/instructions, dose, route, frequency, quantity/unit, refills, start date, duration, substitution instruction, and optional indication link. | Saved on the versioned request; medication/quantity units use typed values where available. | The UI distinguishes draft fields from submit-required fields; unknown is not silently treated as negative. |
| Pharmacy destination | User selects a pharmacy, not a clinic. The picker shows name, address, contact details, identifier status, and last-confirmed provenance. | `PharmacyDestination` is selected and snapshot to the request version; manual destination is allowed only as an unresolved draft. | A missing or incomplete destination blocks only preparation/submission (RX-01); visits, labs, and other care stay available. |
| Review | Authorized clinician reviews the exact current prescription revision. | Review evidence links reviewer, timestamp, version, and decision. Editing submit-relevant fields invalidates the review. | A stale/missing review blocks submission (RX-02); correction and renewed review remain available. Role authorization does not establish licensure. |
| Prepare | User sees a read-only summary of patient, medication, pharmacy, intended transaction, and readiness. | `PrescriptionTransmissionAttempt` is prepared with a request key and canonical payload digest. It has no partner credential or send side effect. | Disconnected status is visible; prepared work remains saved and is never sent automatically. |
| Submit simulated | User selects **Submit to pharmacy (simulated)**, confirms the exact version, and selects a bounded test scenario. The page states **Simulated pharmacy network — no pharmacy connection. No prescription was transmitted externally.** | A backend simulator creates one idempotent attempt tied to the prescription revision and pharmacy snapshot. | The result is source-labeled `simulation`; it cannot be shown as vendor acceptance. |
| Reconcile | Staff views the patient-level prescription timeline and resolves acknowledgment, rejection, unavailable network, or outcome-unknown result. | Append-only attempt/event records preserve request key, correlation ID, outcome, response code/text, actor, time, and prior-attempt relation. | Unknown outcome blocks blind retry. Rejection or destination change requires correction and renewed review before replacement (RX-03, OP-07/08). |
| Fill / fulfillment | A simulated RxFill notice may be recorded; in-house administration and take-home dispensing stay on their current distinct workflows. | Fill notice links to the prescription attempt and is never a `MedicationDispensing` record. | Never label it as patient pickup, delivery, administration, or financial completion. |
| Refill | Patient or staff creates a refill request. The clinical team reviews it, links it to the prior prescription series, and creates a new revision when approved. | Existing portal request/delivery models plus the prior prescription series and intended destination snapshot. | A refill request is not authorization. Approved replacement follows the same exact review/prepare/submit lifecycle. |

## Field contract

| Field/control | Source and owner | Draft versus submit rule | UI and provenance |
| --- | --- | --- | --- |
| Patient, encounter, site, requester | Existing server-owned records | Inherited; required for any order | Read-only context, never retyped. |
| Medication identity | Medication catalog/RxNorm mapping or existing inventory product | Draft may retain an unmapped name; outside-pharmacy preparation requires code, system, source, and display | Searchable selection; preserve source/version and verification state. |
| Strength, form, SIG, dose, route, frequency | Authorized order writer | Required for submit when applicable to the selected medication/order | Typed/select controls where bounded; free text only for instructions or explanation. |
| Quantity, unit, days supply/duration, refills, start/validity period | Authorized order writer and clinic/prescriber policy | Quantity/unit/refills required for submit; do not invent a federal refill limit | Numeric/date controls; preserve whether entered or inherited. |
| Substitution instruction | Authorized order writer | Required selection for submit: allowed, not allowed, or unresolved draft | Bounded select with optional rationale; vendor mapping remains unresolved. |
| Pharmacy destination | Saved pharmacy directory record and immutable request snapshot | Required for outside-pharmacy submit | Searchable picker; manual text is visibly unresolved and cannot submit. |
| Clinical support/indication | Existing condition/observation/encounter link where used | Optional unless a future clinic policy or vendor contract requires it | Linked source reference, not a duplicate diagnosis form. |
| Reviewer and review time | Server-owned membership/clinician profile | Required for exact-version submit | Read-only review evidence; revision change invalidates it. |
| Attempt source, schema, request key, payload digest, correlation ID, response | Backend only | Created at prepare/submit; never user-editable | Timeline shows safe, source-labeled outcome details. Partner response storage/redaction is deferred to the selected contract. |

## Proposed model and API boundary

Retain current order and event models. Add only the narrow records needed to make preparation and simulation durable:

1. `Clinic::PharmacyDestination`: practice-scoped directory record with name, address, contact details, identifier scheme/value, active state, source, confirmation timestamp, and immutable request snapshot serializer.
2. `Clinic::PrescriptionTransmissionAttempt`: append-only attempt for one request revision, destination snapshot, transaction type, source, schema/version, idempotency key, payload digest, correlation ID, result state, response metadata, sent/received times, and prior-attempt relationship.
3. `Clinic::PrescriptionSimulation`: backend-only scenario executor. It accepts no credential and returns only bounded outcomes: acknowledged, rejected, unavailable-before-send, timeout/outcome-unknown, cancellation acknowledged, and RxFill notice.
4. A narrow `PrescriptionTransmissionAdapter` interface: `prepare`, `submit`, `reconcile`, and `cancel`. The simulator is the sole initial implementation. A future vendor adapter is separately authorized and uses the selected contract, onboarding, credentials, and acceptance tests.

`transmission_state` remains separate from clinical order status and from any dispense/administration record. The UI must distinguish `disconnected`, `prepared`, `submitted`, `acknowledged`, `rejected`, `failed`, and `outcome_unknown` without making a local state look externally confirmed.

## Refill, correction, cancellation, and handoff rules

- A portal/staff refill request creates owned review work; it does not update refills or send an order.
- Review may decline, request follow-up, or approve preparation of a replacement version. The original remains historically readable.
- If a submission is unknown, the next action is reconciliation against the same request/correlation identity, not a new prescription.
- If an acknowledged order must be changed, record the cancellation/replacement chain. Do not overwrite the original destination, payload, review, or attempt.
- A pharmacy transfer is not a prescriber-side replacement in the first slice. It remains an external/vendor capability until selected partner behavior and applicable law are mapped.
- Encounter closure does not complete open prescription/reconciliation/refill work (OP-12). The patient and work views must retain the responsible team, optional assignee, reason, and next action.

## Implementation sequence

1. **Destination and readiness:** add pharmacy directory/snapshot records, picker, validation, and patient-level destination display.
2. **Attempt ledger:** add append-only preparation/transmission attempt history, idempotency, current-version checks, and safe response serialization.
3. **Simulation:** implement the backend simulator and review/prepare/submit UI. No frontend-only mock outcome is permitted.
4. **Lifecycle recovery:** implement reconciliation, cancellation/replacement chain, response worklist, and patient timeline.
5. **Refill completion:** link refill review to the prior prescription series and force replacement versions through review and the same lifecycle.
6. **Vendor readiness:** after a named partner is authorized, map exact fields/transactions/version, complete security and onboarding work, add the adapter, and explicitly enable a clinic. Prepared records must not replay automatically.

## Implemented local slice — 2026-09-20

- Practice-scoped pharmacy destinations can be entered and selected in the clinical workspace. A submission records an immutable destination snapshot rather than trusting a later directory edit.
- `POST .../submit` is backend-owned and idempotent. It accepts only the bounded simulated outcomes (`failure_before_send`, `rejected`, `acknowledged`, and `unknown`), adds an immutable attempt and source-labeled prescription event, and never has a vendor credential or network side effect.
- The final UI action is **Submit to pharmacy (simulated)** and displays **Simulated pharmacy network — no pharmacy connection. No prescription was transmitted externally.** Unknown and acknowledged outcomes retain the existing reconciliation block; there is no automatic replay.
- Staff refill intake can select the patient’s prior prescription series. Approval creates a new linked replacement order that still needs the existing exact-version review before any simulated submission.

Focused Rails evidence covers idempotent attempt replay, destination snapshots, unknown-outcome retry blocking, prior-series lookup, and linked replacement orders. Frontend TypeScript and scoped formatting passed. This is local synthetic evidence only; it is not pharmacy connectivity, dispense/fill, clinical, legal, security, or release acceptance.

## Acceptance checklist

Implementation must distinguish planned behavior from evidence actually run.

- API: tenant/site/patient authorization; wrong-role denial; no cross-patient destination or attempt access.
- Data: draft save, revision history, destination snapshot, RxNorm/source preservation, and no duplicate attempt for the same request key.
- Release control: missing medication identity/destination/details/refills blocked; unrelated scheduling and care remain available.
- Review control: an edit after review blocks submit until renewed review; a reviewer cannot be simulated.
- Simulation: all bounded outcomes are backend-created and visibly source-labeled; a simulated acknowledgment is not dispensing.
- Recovery: unknown outcome blocks blind retry; reject/change/cancel retain the original and require reconciliation/correction/re-review.
- Refill: patient/staff request, review, linked replacement, denied request, response-delivery failure/retry, and no automatic refill authorization.
- Browser: keyboard-visible validation, explicit disconnected/simulated state, readable timeline/work owner/next action, and desktop/tablet walkthrough.
- Live provider: separate contract mapping, partner sandbox/production acceptance, credential custody, security/privacy/professional review, and clinic release approval. None are satisfied by local tests.

## Open decisions and stop conditions

The following block only the dependent later scope, not the local workflow:

- Selected pharmacy/prescribing-network vendor, contract, transaction version, field cardinality, supported transaction set, and sandbox access.
- Clinic-specific pharmacy directory source and verification policy.
- Applicable clinician/professional policy, controlled-substance scope, state-specific requirements, and any EPCS/PDMP approach.
- Selected terminology service/caching policy and how source/version verification is maintained.
- Privacy/security retention, partner-response redaction, incident ownership, support coverage, and release acceptance.

Stop the real-send path if credentials, a live endpoint, real patient data, a request to transmit externally, or controlled-substance scope appears. Preserve the local plan and request the specific authorization and partner information instead.

## Resume instructions

Before any implementation or handoff, read this brief, the [engineering guide](meta-clinic-build-and-acceptance.md), [MC-10](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md), D-066, and D-072. Compare this plan to the current checkout and any newer founder direction; do not silently expand scope or treat a plan as live-readiness proof. Freeze the current medication/refill owners before changing their contracts, then run focused API and browser evidence for only the completed slice.

# Optional insurance preparation contract

This contract supports the open MC-16 tracker row: local coverage/policyholder/payer capture and manual eligibility, authorization, claim and response preparation, while keeping insurance optional and cash-pay complete. It records a proposed local product contract; it does not assert that current source implements it, select a payer, enable transactions, or amend the canonical tracker or vault. See [Decisions](../../APPlyVault/03%20Execution/Decisions.md) for D-064, D-065 and D-072, [the MC-16 row and vendor-preparation boundary](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md), and the [single ownership and dependency matrix](meta-clinic-build-and-acceptance.md#vendor-independent-workflow-preparation).

## Current source boundary

Current code is a thin persistence foundation, not an insurance workflow:

- `Clinic::CoverageVersion` is tenant-scoped, append-only and patient-linked, with a version and required `encrypted_coverage_evidence` (`apps/api/app/models/clinic/coverage_version.rb`; table defined in `apps/api/db/migrate/20260831000200_implement_approved_clinic_erd_schema.rb`). The table has no typed member/payer/policyholder/period fields.
- `Clinic::InsuranceClaim` is tenant-scoped and append-only; it links one patient, invoice and coverage version and checks that linked records share practice and patient (`apps/api/app/models/clinic/insurance_claim.rb`). Its table has no claim payload, response, transaction status, authorization, or reconciliation history.
- This review found no insurance eligibility or authorization workflow/controller/UI, no payer connector, and no clinic setup feature visibly implementing D-064's insurance opt-in. Presence of seeded coverage/claim rows is not workflow evidence.

Do not make current UI or readiness claims from these records. The next implementation slice should first add a practice-scoped, default-off insurance capability and authorized, versioned coverage capture/read/correction with tenant-isolation and reload evidence. It should not transmit requests or claims. Eligibility preparation can follow once coverage ownership, permissions, and evidence handling pass that gate.

## U.S. standards reviewed for this proposal

Sources were checked 2026-09-22. The reviewed Da Vinci guides are U.S.-realm implementation guides on FHIR R4; their trial-use status, requirements, and applicability depend on the chosen exchange partner. They inform data boundaries, but do not select a FHIR-native database or make Meta Clinic conformant.

| Source / version | Applicable design signal | Limit |
| --- | --- | --- |
| [FHIR R4 Coverage 4.0.1](https://hl7.org/fhir/R4/coverage.html), base technical resource | Card-level coverage can identify status, type, policy holder, subscriber/member ID, beneficiary, dependent, relationship, period, payer and plan/group classes. Keep member identity distinct from payer and policyholder; associate the coverage with the actual patient beneficiary. | Global base resource used as a technical foundation for the U.S. guides below, not a chosen exchange contract. Its self-pay capability does not redefine Meta Clinic cash-pay billing as insurance. |
| [Da Vinci HRex Coverage 1.2.0](https://hl7.org/fhir/us/davinci-hrex/1.2.0/en/StructureDefinition-hrex-coverage.html), FHIR R4, U.S. realm, trial use | Defines coverage representation for payer member match; together with beneficiary identity, coverage identifies the member. | The cited profile is specifically for `$member-match`; do not treat it as a universal capture form or select member-match without a partner and authorized use. |
| [Da Vinci CRD 2.2.1](https://hl7.org/fhir/us/davinci-crd/2.2.1/en/usecases.html), FHIR R4, U.S. realm, trial use | Coverage requirements are payer-specific, service-contextual and point-in-time. Coverage/authorization guidance may need the proposed action and can be insufficient or change when coverage changes. | No payer endpoint, hook, transaction, decision, or blocking policy is selected here. A local manual note is not a CRD response. |
| [Da Vinci DTR 2.2.0](https://hl7.org/fhir/us/davinci-dtr/en/specification.html), FHIR R4, U.S. realm, trial use | If an eventual payer workflow requires additional documentation, preserve its request/response provenance and do not conflate form completion with authorization. | No DTR client/questionnaire or payer rule is selected or implemented by this contract. |
| [Da Vinci PAS 2.2.1](https://hl7.org/fhir/us/davinci-pas/2.2.1/en/), FHIR R4, U.S. realm, trial use | A future prior-authorization exchange needs a partner-mapped request and response, including outcome and where applicable authorization reference and validity period; preserve request/response versions. | No PAS bundle, X12 route, code mapping, payer conformance or live submission is specified here. |
| [CMS-0057-F final rule](https://www.cms.gov/newsroom/fact-sheets/cms-interoperability-prior-authorization-final-rule-cms-0057-f), U.S. federal rule | CMS describes API and operational requirements for specified impacted payers, with API compliance dates primarily beginning 2027. | Payer obligations vary by payer type and date. This source does not determine Meta Clinic's legal status, provider obligations, or applicability to an unknown clinic, service or state. Confirm applicability with qualified review before implementing regulatory claims. |

The current jurisdiction, clinic legal entity/type, payer category, exchange partner, transaction profile, clinic insurance authority and retention/privacy owner are **unknown**. Federal standards above do not resolve state-specific requirements. Continue standards review when a real U.S. clinic scope and accessible partner interface are selected; do not import another country's implementation guides or invent inaccessible partner fields.

## Proposed local field and provenance contract

Use only fields needed by the approved clinic scope and future selected exchange. Fields below are candidate semantics, not an exhaustive mandatory form. Preserve source identifiers and code-system/version when a selected profile requires them; do not substitute display text for a coded concept or infer missing values.

| Record | Candidate local information | Required provenance / validation |
| --- | --- | --- |
| Practice insurance setting | Explicit enabled/disabled value; effective configuration revision; authorized clinic actor; recorded/effective time; optional clinic-selected scope. | Default `disabled` for every new practice. Persist as a practice-owned revision. Enabling requires the clinic's authorized setup owner. Do not infer enablement from coverage records or seed fixtures. |
| Coverage version | Patient beneficiary; coverage type; payer/plan label and payer identity when known; policy holder; subscriber/member identifier; dependent identifier when applicable; beneficiary relationship; policy/group class values only when known; reported start/end period; priority/order only if the clinic's rules require it. | Link patient and practice; version each correction rather than overwrite. Record source (`patient`, `staff`, `document`, or later named vendor), actor, recorded time, effective-as-reported time, review/check time and protected evidence reference. Validate dates and same-tenant links. Mask identifiers in lists/logs; store sensitive values only through an approved protected-value mechanism. |
| Eligibility check/preparation | Patient, exact coverage version, payer identity if known, intended service/reference, intended service date, prepared request summary, action owner and request identity. | Manual preparation only in this slice. Save source and prepared time. A staff action outside Meta Clinic must be explicitly recorded as such; store channel, actor, time and external reference if available. No network send, automatic retry or implicit verification. |
| Eligibility response evidence | Exact checked coverage version and service context; source/payer, response reference, checked period, received time, actor, raw/attached evidence reference where permitted, and a normalized outcome only when supported by the source. | Distinguish member match, coverage active/inactive as of a stated time, service-specific benefit, authorization requirement and unable-to-determine. One does not imply another. Preserve original response and append corrections; old evidence becomes stale for a changed coverage/service context. |
| Authorization evidence | Service/provider/site scope, payer/source, authorization reference, source status, valid-from/until, approved quantity/unit if actually returned, used/reversed quantity if source exists, and response evidence. | Separate authorization from coverage and eligibility. Unknown, missing or stale limits stay unknown. Never derive approval from a saved reference, a local rule, a prepared request, or absence of a denial. |
| Claim preparation and response | Existing patient/invoice/coverage-version links; selected invoice/service lines and source versions; preparation owner/time; source/response reference and evidence; item-level outcomes/adjustments only when supplied by a mapped source. | Current claim row provides only linked identity. Keep source invoice immutable; corrections/replacements reference the prior claim attempt and preserve both. A locally prepared or staff-entered claim has not been transmitted or adjudicated. Payment/remittance allocation requires a separately accepted financial contract. |

Do not collect card images, full documents, diagnoses, procedure codes, subscriber identifiers, or other sensitive details speculatively. Determine necessary evidence, access, retention, encryption, export and redaction behavior for the selected data flow before real-data use. Development fixtures remain independently synthetic.

## State meanings and manual-only behavior

The application should represent state and evidence source independently. These terms are proposed meanings to guide the local contract; they are not current enums, regulatory statuses, or approved payer vocabulary. Freeze exact values only after product/policy review.

| State family | Minimum distinctions | User-facing meaning |
| --- | --- | --- |
| Module | `disabled` / `enabled` | Disabled means insurance actions and collection are unavailable. It never hides or disables cash prices, estimates, invoices, receipts, payments, refunds, packages or memberships. |
| Coverage evidence | `recorded_unverified`; a source-supported check at a named time; `needs_review` / `superseded` when corrected or contradicted | A coverage period or an insurance card does not prove that the payer currently recognizes eligibility. Show source and checked time; do not silently call date math “verified.” |
| Eligibility | `not_checked`; `prepared_manual`; `checked_manual`; `response_recorded`; `unable_to_determine`; `stale` | “Prepared” means staff has information to check outside the app. “Response recorded” means evidence was entered from a source, not that the app contacted a payer. Display exact as-of time and service context. |
| Authorization | `not_assessed`; `required` / `not_required` only with attributable evidence; `prepared_manual`; `pending`; `approved`; `denied`; `more_information_needed`; `expired` / `stale` | Show the exact affected service and source. Only source evidence establishes an outcome. Do not impose a patient-wide hold or block unrelated scheduling, visits, cash payment or follow-up. |
| Claim | `draft`; `prepared_manual`; `submitted_outside`; `response_recorded`; `needs_correction`; `closed` | `submitted_outside` requires a recorded staff attestation and time/channel; it is not a send initiated by Meta Clinic. `response_recorded` must identify source and preserve the original response. Do not equate a claim response with payment/remittance. |

The initial slice must have no payer API call, clearinghouse credential, automatic claim submission, automatic eligibility lookup, auto-resubmission or backlog replay. If an operation can have happened outside the app but the response is unknown, show an unresolved state and require staff reconciliation before repeating a consequential transaction.

## Permission and cash-pay contract

Use existing practice/site tenancy and authorization infrastructure; inspect the current role catalog before assigning any actual permission code. This document deliberately does not invent one. A later implementation must define distinct policy actions for enabling/configuring insurance, reading protected coverage evidence, recording/correcting coverage, preparing or recording an eligibility/authorization request, and preparing/reconciling a claim. Access to patient care does not automatically grant billing/insurance authority; the implementation-specialist/FDE role does not receive patient-data authority by D-067.

Enforce authorization on the server for every read and write. Scope patient, coverage, invoice, service, site, request and response references through the same practice and applicable site. Audit actor, action, outcome and resource/version on protected operations. Return masked identifiers by default; reveal protected values only under a separately reviewed permission and record access where required. Deny cross-practice and wrong-role reads and writes without confirming whether another tenant's record exists.

When disabled, reject insurance-specific routes/actions server-side and omit insurance data/actions from ordinary workflows. Keep cash-pay behavior and summaries available without insurance data. Unknown eligibility, payer response or authorization must not silently become insurance coverage, patient responsibility, a cash quote, a claimable service or a global care hold. Patient-facing payment expectations need clinic-selected policy and approved copy; none is prescribed here.

## Focused synthetic acceptance for the first implementation slice

1. A newly created practice has insurance disabled. It can still configure prices and complete the existing cash-pay estimate/invoice/payment journey. Insurance controls and API writes are unavailable while disabled.
2. An authorized setup owner enables insurance for one synthetic practice. The saved value, revision and actor persist after reload; a different practice remains disabled. A forbidden role cannot enable it.
3. An authorized billing/insurance role records a synthetic coverage version for the correct patient, including unknown or partial fields without fabricating them. Reopen/reload proves persistence. A correction appends a new version and preserves the prior values/source.
4. Wrong-practice patient/coverage/invoice combinations, wrong role and attempts to edit an append-only historical version are denied. A permitted user sees masked identifiers; unprivileged responses, logs and exports do not reveal them.
5. Staff prepares a synthetic manual eligibility check, records that it was performed outside the application, and records a source-dated response. UI/API make clear there was no electronic payer request. A stale response cannot be presented as current after the linked coverage version or service context changes.
6. A local claim preparation links only the same patient, practice, invoice and selected coverage version. It remains unsent until separately authorized external work exists; response and correction evidence preserve the original claim and clearly distinguish adjudication from payment.
7. Unknown/negative insurance evidence affects only the configured insurance task. Scheduling, encounter work, cash estimate/invoice/payment and unrelated follow-up remain available. No test infers patient-wide blocking.

Verify the first slice with focused API tests for disabled-by-default, correct/incorrect roles, tenant and patient linkage, append-only correction, identifier masking and reload persistence; then one browser save/reload and denial walkthrough. Do not claim payer eligibility, coverage, authorization, claim transmission/adjudication, legal compliance, real-data privacy approval or launch readiness from these checks.

## Decisions still required

- Clinic service, payer type, state/jurisdiction and applicable federal/state authorities.
- Whether/when a clinic elects insurance and who can configure, read, submit externally, reconcile and correct each evidence type.
- Which eligibility, authorization, claim, remittance and denial workflows are in scope; accepted vocabularies and patient communication/payment behavior.
- Selected payer/clearinghouse, contract, API or X12 route, profile and version; credential custody, sandbox access and vendor acceptance criteria.
- Sensitive evidence minimization, encryption/key handling, access audit, retention, export and deletion rules with qualified privacy/security/legal review.
- Clinic billing owner, source-of-truth rules, correction/rebill process, reconciliation cadence and release authority.

Until these are resolved, implement only the bounded default-off local capture and manual-preparation path. Do not fabricate payer behavior or label a local record as verification.

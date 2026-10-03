# MC local implementation closeout — 2026-10-03

Joshua requested completion of MC-01–MC-16, with one final verification pass and one final commit rather than repeated slice commits. This record covers the isolated `codex/mc-tracker-closeout-20261003` checkout based on `ec0e983eca90`. The dirty primary checkout is preserved. No delivery-orchestrator skill, delegated workers, test suite, external integration or deployment is part of this delivery.

The sixteen IDs identify milestones, not sixteen uniformly sized implementation slices. This delivery closes three concrete local source gaps and reconciles several stale missing-source claims. It does **not** establish acceptance of all sixteen milestones. The canonical tracker retains the outstanding requirements; its historical percentages are not recalculated from a count of added files or lines.

## Implemented behavior

### MC-01: configured referral receipt prerequisite

- Service offerings have a default-off `referral_required` setting in the existing versioned setup editor, serializer and configuration snapshot. Import review cannot silently apply this policy setting.
- A patient/location panel records supplied source, reference, receipt date, optional supplied expiry and a reasoned note. Corrections and withdrawals append records linked to the previous record. Details are encrypted; current permissions and patient/location context are checked on reads and writes.
- New booking, rescheduling and series previews use the latest same-patient, same-location, same-service receipt when the requirement is enabled. A withdrawn, missing, not-yet-received or expired receipt cannot satisfy it. The appointment saves the receipt ID and requirement state in its existing offering snapshot. Existing appointments are not rewritten when setup or receipt history changes; a later reschedule re-evaluates the configured requirement.
- Shared practice locking serializes configuration, receipt updates and booking mutations. Expected prior IDs reject stale correction. Existing operation receipts preserve exact retry identity. Receipt evidence does not establish clinical approval, referral authenticity or insurance authorization; no default expiry or clinical policy is selected.

Owners: `ServiceOfferingSettings`, `PatientReferralReceipts`, `Scheduling::ReferralReceipts`, `BookAppointment`, `BookSeries`, `ManageSeries`, `RescheduleAppointment` and the additive referral migration.

### MC-15: restore reviewed draft-offering import values

- The saved import review exposes each applied item's original before/after values and an explicit restore action.
- The operation reconciles the original committed receipt and requires the destination still to be a draft at exactly the receipt's saved revision, with the imported field values unchanged. Later edits, publication and ineligible references reject restoration.
- Restoration uses the normal authorized offering update, a deterministic request identity and a new revision. The review records restoration without deleting its original import history. Repeating an acknowledged restore is harmless; an unknown response can be reconciled by reopening the saved review.
- This is restoration of selected reviewed configuration fields, not database rollback, clinic cloning, patient import or an externally approved cutover.

Owners: `Configuration::OfferingTextBatches`, `ServiceOfferingBulkTextImport` and the existing batch persistence/model contracts.

### MC-16: optional insurance preparation

- Existing `CoverageVersion` gains encrypted structured payer, member, group, policyholder, relationship, period, status and evidence-source fields, with server-recorded actor/location. Older rows are retained without reconstructing their missing metadata.
- With insurance enabled in a finalized active location, billing-authorized staff can prepare eligibility, authorization, claim and reconciliation records. Claim/reconciliation preparation requires a same-patient posted invoice; authorization preparation requires supplied service identity. Claims reuse the existing claim owner and immutable coverage version.
- Manual and simulated responses append to request history with expected-prior-event protection. Approved/denied/cancelled records are terminal; later work needs a new request. Manual and simulation histories cannot be converted into one another. Disabling new insurance work preserves permitted history and response access.
- The patient panel includes paged coverage, request, invoice and response history, explicit stale-version review, draft navigation guards and exact-request retry after unknown outcomes. Staff may page through invoice choices without losing a selected coverage record.
- New records are protected by tenant/patient foreign keys, state constraints and immutable-history triggers. Reads and writes are audited without copying protected values to audit metadata; input envelopes are filtered from logs.
- No payer request is sent, no payment is posted and no coverage status is inferred from supplied policy data. Reconciliation records are staff evidence, not a computed settlement or a validated clearinghouse transaction.

Owners: `Billing::InsurancePreparation`, `Billing::InsurancePreparationsController`, `InsuranceWorkflowEvent`, `CoverageVersion`, `PatientInsurance` and the additive insurance migration.

## Sixteen-milestone disposition

This table records the reviewed distinction between source work and outstanding acceptance. It is not a second live task register; current status remains in the implementation tracker.

| Milestone | Source disposition in this delivery | Remaining acceptance or specification |
| --- | --- | --- |
| MC-01 Setup | Existing guidance/eligibility retained; structured receipt prerequisite added. | Connected receipt/book/reschedule/history and cross-clinic denial proof. |
| MC-02 Growth | Existing public branding, inquiries, account and payment handoffs retained. | Branding/inquiry/account reload and failure paths; external email/payment evidence. |
| MC-03 Identity | Existing registration, identity correction and portal linkage retained. | Duplicate/correction recovery and telehealth-return browser proof. |
| MC-04 Scheduling | Existing policy, holds, series, overbook, resource and closure owners retained; referral check integrated through each offering-snapshot caller. | Connected overbook, allocation race, hold/waitlist and resource/closure recovery proof. |
| MC-05 Intake | Document source/issue metadata already has `PatientDocumentProvenance` and backend owners; it is not absent source. | Original attachment/field coverage, deliberate-review task mapping and role/device journey acceptance remain unverified; instrument/policy choices remain unselected. |
| MC-06 Clinical work | Typed reports, review/follow-up, lab provenance and configured unit mapping owners already exist. | Connected corrected-result/review/reopen/source-completion proof and selected external laboratory mapping. |
| MC-07 Telehealth | Existing preparation/admission/media/reconnect/wrap-up retained. | Two-party device/media/recovery evidence and provider/clinical acceptance. |
| MC-08 Billing | Existing GFE print/attestation, cash/refund/allocation and card reconciliation retained. | Connected document delivery, changed-catalog retry, payment/refund/receipt/unknown-outcome proof; live provider/legal acceptance. |
| MC-09 Packages | `SubscriptionEntitlements` and `SubscriptionAllowances` already own entitlement and use/reversal records. | Connected package/renewal/failure/cancellation/unknown-outcome proof and actual signed provider outcomes. |
| MC-10 Medication | Existing prescription preparation, substitution guard, immutable attempts, responses and lifecycle requests retained. | Connected preparation/response/cancellation/fill/retry evidence; actual network mapping and transmission. |
| MC-11 Inventory | Existing catalog-linked offers, quotes, shipment/event and stock-ledger owners retained. | Connected receiving/use/reversal, unit mapping, exact quote retry and tenant denial; actual supplier/carrier outcomes. |
| MC-12 Portal | Existing patient requests and failed-response recovery retained. | Connected patient visibility, delivery failure/recovery and return-visit evidence. |
| MC-13 Workforce | Existing atomic reviewed access revision and coverage/offboarding owners retained; earlier evidence remains bounded to its recorded scope. | Full administrator/revocation/site/coverage browser acceptance. |
| MC-14 Reporting | `ReportExport`/`Reports::IssueExport` and `DayEndReconciliation`/`Reports::RecordDayEndReview` already supply durable exports and saved review evidence. | Populated download/reload/denial/source reconciliation; any additional report definition must be specified; retention/ownership policy remains human. |
| MC-15 Operations | Existing explicit catalog mapping and durable per-item apply retained; guarded restoration added. | Connected apply/reload/restore/later-edit rejection proof; external migration/cutover and retention policy. |
| MC-16 Insurance | Structured local coverage/request/response preparation added. | Connected permission/tenant/stale/retry history proof; payer contracts, enrollment, selected transaction mapping and acceptance. |

## Standards reviewed and applicability

- [US Da Vinci HRex Coverage 1.0.0, FHIR R4](https://hl7.org/fhir/us/davinci-hrex/STU1/StructureDefinition-hrex-coverage.html): informs separation of payer/member/policyholder/beneficiary and coverage period. The reviewed historical version is not a claim of current profile conformance; the UI stores supplied evidence rather than a FHIR wire payload.
- [FHIR R4 CoverageEligibilityRequest](https://hl7.org/fhir/R4/coverageeligibilityrequest.html) and [ClaimResponse](https://hl7.org/fhir/R4/claimresponse.html): technical context for keeping requests, coverage and responses distinct, used with the US HRex scope. Local state labels are not an implemented X12/FHIR adapter or payer authorization.
- [US BSeR 1.0.0, FHIR 4.0.1](https://hl7.org/fhir/us/bser/): distinguishes referral placement and service-delivery feedback. [R4 HealthcareService](https://hl7.org/fhir/R4/healthcareservice.html) distinguishes configured service eligibility from a patient-specific request. These inform the separation of service requirement, supplied receipt and clinical service outcome. No BSeR exchange or clinical policy is claimed.
- The repository `frontend-ui` skill and installed Material UI 9.4 documentation informed supported Accordion/TextField composition; no new component library or dependency was added.

## Verification and limits

Dependencies were prewarmed once with the existing locked caches: 241 frontend packages reused, zero downloads; API dependencies were already available. Both forward migrations applied to the new owned development database `apply_mc_closeout_20261003` in `apply-mc-closeout-20261003` on loopback port 54338. No existing/shared database was reset. The initial schema load also attempted Rails' implicit `apply_test` load and failed because that database did not exist; development migration then completed with implicit test-database handling disabled. No tests were run.

The generated schema's new/owned objects are retained. Unrelated PostgreSQL pretty-print changes in 163 existing object blocks were excluded; the complete generated dump is preserved locally in ignored `tmp/mc-closeout/generated-structure.sql`.

Frontend TypeScript and main/Office bundles passed in one combined build; the existing mixed static/dynamic marketing import warning remains. Scoped frontend formatting passed. Initial Windows command lookup failed before formatting and Ruby lint could run; the corrected executable form is recorded with the final check results. Ruby syntax passed for 21 changed/new files before the final model guard repair; final Ruby/lint/document results are recorded below when available.

No automated test suite, browser acceptance, provider call, professional review or deployment result is claimed by these checks. In-memory exact-request recovery ends on a full reload after the ordinary navigation warning; retained server history remains independently readable. The broader MC acceptance rows therefore stay open.

Final consolidated results: 21 changed/new Ruby files passed scoped RuboCop with zero offenses; Rails eager loading (`zeitwerk:check`) passed. Vault validation passed for 43 notes and 543 wiki links; harness validation passed for 28 documents, nine canonical skills, nine commands and 20 tracked clinic workflow plans. Vault audit exited successfully with existing size/metadata/procedure advisories; no broad document cleanup was attempted. Diff whitespace validation passed. No dependency or test files changed. The final pull of `origin/main` was already current; no remote `master` branch exists.

One attempt to prepare the existing synthetic sample population in the isolated database exceeded five minutes without completing. Its specifically identified, checkout-owned Ruby process tree was stopped; the browser walkthrough therefore remains unperformed. The existing seed workflow was not rewritten, retried or represented as a passing journey. This does not invalidate the completed schema, compile or load checks, and it earns no milestone validation credit.

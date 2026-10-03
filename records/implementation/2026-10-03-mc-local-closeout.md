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

## Continuation bounded local walkthrough and QA handoff

The preceding unperformed-walkthrough statement describes the first delivery only. On 2026-10-03, the continuation pulled `origin/main` to `507b269eaa66`, retaining the source delivery `dfd104e520342a544519c9ea4eda34fe04567812`. A small independently invented fixture replaced the attempted full sample population. The owned database was renamed to `apply_mc_closeout_20261003_development` to satisfy the existing development guard; it was not reset. Managed startup recovered the owned PostgreSQL instance and served web/API on loopback ports 3340/3341. The primary dirty checkout was not used.

The normal development login selected clinic 35, location 36 and actor/membership 61. The fixture patient was 64, offering 1 required a referral, offering 2 was a draft, and clinician 37 had a location assignment. These identifiers describe only this disposable local environment. No external records, payer, payment or provider was used.

| Bounded path | Observed result | Limits |
| --- | --- | --- |
| MC-16 coverage and eligibility history | Browser saved coverage version 1 with supplied payer/member/policyholder and an explicitly unknown coverage status. Missing observation date was rejected while draft values remained. Eligibility request event 1 and a separately labeled simulated approved response event 2 saved. Full reload retained the coverage, simulated state and both attributable history entries. | Claim/invoice linkage, reconciliation, module disable, stale/unknown retry and tenant/permission denial were not exercised. Simulated approval establishes no coverage or payer outcome. |
| MC-15 reviewed draft import and restoration | Browser explicitly selected only offering 2's description from an invented source file, previewed before/after values and saved review `5fb830d2-ee21-49e9-a857-6d9ca9e20cda`. Apply was confirmed by its original receipt. Full reload and Resume retained the applied review. Explicit restoration then showed one restored item and retained original before/after values and request history; Reload saved review retained that result. | The native confirmation temporarily blocked browser control; Return completed it. No source defect or bypass was established. Later-edit/publication rejection, role denial and lost-response branches were not exercised. This is a selected-field draft correction, not cutover or database restoration. |
| MC-01/04 referral and linked booking | Browser saved received receipt 1 and later reloaded its history. Booking first rejected an unconfigured resource requirement. Staff explicitly configured no chair/equipment requirement and Monday clinician availability. Reopening booking recovered the saved draft. Appointment creation succeeded for October 5, 10:00–10:20 UTC, and the scheduled appointment and detail survived full reload. | Receipt ID inside the saved appointment snapshot was not inspected. Rescheduling, expiry, cross-clinic denial and historical comparison remain unverified. |
| MC-01 withdrawal history | Browser saved withdrawn receipt 2 with a reason, showed it as latest and linked it to earlier received receipt 1. Both records remained visible. | Joshua stopped frontend checks at this point. No post-withdrawal booking/reschedule attempt or reload was performed or claimed. |

**QA ownership:** Joshua explicitly instructed this continuation to skip frontend checks because separate QA owns them. Further browser walkthroughs, frontend builds/typechecks and frontend test runs stopped. Existing evidence above is retained; unperformed branches remain open for QA. No automated tests, additional application builds, provider calls or deployment ran in this continuation. Local fixture scripts and uploaded invented JSON remain ignored and are not product source.

**MC-05 source correction:** Current `IntakeQuestionTasks` (`apps/api/app/services/clinic/care/intake_question_tasks.rb:6–135`) already binds a deliberately selected saved question/revision to a manual task, requires saved reason/next action, enforces existing-task version checks and retains an attributable task event. `NurseWorkflowController#link_question_task` owns the API consumer. The earlier missing-binding question is resolved for this bounded contract; no duplicate implementation or automatic task generation was added. The original attachment comparison, full connected assignment/acknowledgment proof and selected clinical policy remain separate.

This continuation adds evidence and corrects task routing; it does not mark all sixteen milestones accepted. The current dashboard separates delivered source, QA-owned frontend acceptance and inputs that cannot be invented (original attachment scope, selected external contracts and human policy). Historical percentages remain unchanged.

Continuation document checks: vault verification passed for 43 notes and 544 wiki links; vault audit completed with existing size/metadata/procedure advisories; scoped diff whitespace passed. The initial wrong-interpreter invocation did not run the Python validators. Two rejected section links were corrected to supported file links before the passing run. No application or frontend checks were repeated. Final remote reconciliation found no `master` branch and no divergence from `origin/main` before the documentation commit.

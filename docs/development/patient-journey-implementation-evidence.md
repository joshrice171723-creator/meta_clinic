# Patient journey implementation and acceptance

Date: 2026-09-14. Scope owner: [approved execution plan](../../PATIENT_JOURNEY_EXECUTION_PLAN.md). Matrix owner: [build and acceptance guide](meta-clinic-build-and-acceptance.md). This record adds evidence and exact local field owners; it does not add matrix rows, clinical policy or vendor requirements.

## Candidate and evidence boundary

Local implementation and scoped development verification are complete under the founder's updated policy `cc56cc4`. Earlier integrated source/tests are preserved at `9dc4bbb` on `codex/patient-journey-integrated-build`. The current integration base is `cc56cc41708c694e674bca9ad9c73cb451c2f458`; the tested application/schema/frontend diff fingerprint is `a01d2ebfed80fd874cb31ab51898af128a421a24`. The broad first Rails pass was stopped and is not accepted as a passing full suite.

Test database: `apply_patient_journey_20260914`. Browser database: `apply_patient_journey_20260914_development`. Both contain synthetic fixtures. The original development database is preserved. No live prescription, laboratory, payment, email or video transaction is acceptance evidence here. No deployment or service purchase is authorized by this record.

## Field ownership and action requirements

Unless a row says otherwise, clinical context and author are derived by Rails from the authenticated actor and scoped patient/encounter. Browser-supplied references are authorized in that context. Revision numbers and request identities protect concurrent edits and retries. Missing optional data does not block unrelated work. The plan's R identifiers name its dated source register; D-074 supplies product decisions. These mappings are local design mappings, not FHIR conformance.

### Entry and registration

| Fields / question and purpose | Backend and UI owner | Type, source and validation | Requirement / provenance / verification |
| --- | --- | --- | --- |
| Clinic, offer, terms, price, interval, included services | `MembershipStorefrontsController`; existing membership catalog, offer and acceptance records; `MembershipStorefront` | Scoped catalog references and immutable offer/version; backend price and verified event data | Existing applicable offer acceptance remains required before payment. Browser return cannot activate a patient. R15; membership growth and payment tests. |
| Name, email, telephone; enroll or request contact | `MembershipGrowth::PrepareAccount` / `CaptureProspect`, existing prospect/account owner; public storefront | Entered name and typed contact strings; contact-first needs name plus email or phone; account continuation needs email | Interrupted matching setup reuses the account/prospect. Contact-first and account creation remain distinct actions. Growth history retains unpaid work. T01/T02. |
| Birth date | Prospect `date_of_birth`; `Care::BirthDate`; verified conversion into existing `PatientDemographics`; storefront typed date | ISO date; server business date; no future or 150+ date; public account minimum 18, staff permits newborns and absent DOB where allowed | D-074 product rule, not R02 clinical eligibility. Leap-day anniversary follows February's last day. DOB corrections do not lock the patient. BirthDate, membership growth and patient API tests. |
| Preferred contact method/time | Existing prospect, `CaptureProspect`; storefront and Growth | Optional method selection with matching available contact; bounded entered timing text, encrypted at rest | Used for clinic contact, not a universal payment requirement. No contact timing policy is inferred. Contact-first browser proof. |
| Legal/preferred name, sex, primary language, interpreter needed | Existing `PatientDemographics` and patient API / identity UI | Encrypted names up to 160; existing sex vocabulary; language up to 80; interpreter `true`, `false` or unknown `null` | Existing authorized registration rules retained; unknown is not false. Auditable source changes; T02/T03 patient API tests. |
| Structured address, emergency contact/relationship/phone, patient identifiers | Existing patient/address/contact owners and patient API | Existing structured entered fields and authorized references; generated patient identity is not free-text linkage | Reused unchanged; collect under existing registration/communication workflows. No new universal checkout gate or automatic name-based merge. Existing patient identity/history tests. |

### Intake

Owner: `Care::PrevisitIntake` form `meta-clinic-previsit-v3`. Patient writes use `PatientPortal::PrevisitNotesController` and existing encrypted append-only `PrevisitNote`; staff writes use `Care::NurseWorkflowController`, `NurseWorkflow` and the existing intake revision's `encrypted_questionnaire`. UI owners are `PatientPrevisitNote`, the shared intake answer controls and the nurse workspace. R01/R03/R04/R12 inform meaning; no selected treatment prerequisites were supplied.

Every answer supports `answered`, `unanswered`, `unknown`, `declined`, `not_applicable` and `negative`. Non-answered states cannot carry hidden text. Text answers are bounded to 600 characters; the complete encrypted note retains its existing size bound. Unknown fields/details and invalid types are rejected. Draft saving is separate from submission. Patient submission records the current care-team-sharing attestation; staff submission records a distinct staff confirmation, never a fabricated patient attestation or clinical review. Existing v1/v2 payloads continue to render.

| Question IDs and displayed purpose | Control and source | Conditional requirement and provenance |
| --- | --- | --- |
| `visit_reason`, `symptoms`, `goals` | Entered short text: reason for visit, symptoms/onset, desired help | Optional draft answers; not automatically inherited as current visit facts. |
| `medications` | Repeatable medicine/supplement entries, existing local medication suggestions and unmatched manual text | Patient-reported, not an authorized prescription; retained within the bounded answer. Reusable answers retain prior note/version/time. |
| `allergies` | Repeatable substance/reaction detail with explicit answer state | Unanswered/unknown never become a negative allergy history; inherited information is not freshly confirmed. |
| `history`, `procedures`, `prior_approaches` | Entered/repeatable prior conditions, procedures and weight-management approaches | Reusable with original source; no universal treatment exclusion or mandatory panel is inferred. |
| `care_needs` | Communication/accessibility or other care needs text | Reusable with provenance; not a replacement for demographics. |
| `barriers` | Optional entered barriers to following the plan | No unnecessary mandatory sensitive question; not automatically inherited. |
| `height`, `weight` | Positive decimal text; height `cm` or `[in_i]`, weight `kg` or `[lb_av]`; date and `patient_reported` / `clinic_measured` source | Draft may retain a measurement awaiting unit/date/source. Submission of an answered measurement requires supported unit, actual non-future ISO date and source. No fabricated values or unsupported conversion. |
| Additional note, form/status, inherited source, attestation/confirmation | Bounded text and backend version metadata | Inheritance references only eligible prior fields with note/version/time. Saved draft, patient confirmation and clinical review remain separate. |

Verification owners: `patient_portal_previsit_notes_test.rb`, `nurse_workflow_test.rb`, `patient-previsit-note.test.tsx`; real patient browser draft/save/reopen across three sizes. Staff nested-parameter handling was repaired and passed focused API and real browser draft/reload/confirmation checks.

### Prescription and take-home fulfillment

Owner: append-only `Care::MedicationRequestRevision` through `ClinicalPlanWorkspaceController` / `ClinicalPlanWorkflow`; UI `ClinicalPlanWorkspace` and `PrescriptionFulfillmentPanel`. Authorized prescription writers retain `medication_requests.write`; patient and site scope are server-owned. R04/R06/R13 distinguish identity/instructions from an external network contract.

| Fields and purpose | Type, source and conditional behavior | Action requirement / evidence |
| --- | --- | --- |
| `inventory_product_id`, medication name, strength, form | Scoped active local catalog reference or entered unmapped draft; separate strength/form strings | Local release requires a resolved catalog item or code/system/catalog source and complete instructions. No inferred medication selection or dose. |
| `medication_code_system`, `medication_code`, `medication_code_version`, `catalog_source` | Entered terminology identifiers and provenance | Preserved for later mapping; no claimed RxNorm/network validation. Unmapped drafts remain saved. |
| Dose value/unit/text, route code/text, frequency, instructions | Existing supported unit/route options and entered directions; numeric dose rendered without assumed conversion | Current authorized version must have applicable instructions before review/release. Clinical consistency remains a reviewer decision. |
| `prescribed_quantity`, `quantity_unit`, `refills`, `starts_on`, `duration_text` | Positive decimal quantity, explicit unit, nonnegative refills, optional ISO start and duration text | Quantity/unit/refills required by local release; no universal duration/start requirement. Completion must use proposed quantity against net recorded handovers. |
| `fulfillment_route`, pharmacy name/location/identifier | Explicit outside-pharmacy or take-home choice; entered destination identity | Outside-pharmacy release needs name and specific location. Identifier is retained without claiming vendor verification. |
| Requester, patient/encounter/site, series/version, review | Trusted membership/context and immutable revisions/events | Review belongs to the exact current revision. Instruction or destination changes require new review. Unknown/acknowledged attempts require reconciliation before replacement. |
| Attempt kind/source/prior event/note/time | `PrescriptionEvent`; explicit manual review/reconciliation or labeled simulation | Simulator covers pre-send failure, rejection, acknowledgment, unknown, cancellation and confirmed-not-sent. Manual records cannot forge acceptance. Connection availability never drains a backlog. |
| Handover status/quantity/stock unit/batch/time/reason/original event | `MedicationDispense`, `MedicationDispensing`, existing inventory access/ledger; separate from `MedicationAdministration` | Authorized performer, suitable scoped lot and same unit; partial/not-done/reversal reason; net remaining balance. Atomic stock movement and exact retry, original-linked reversal. No shipping workflow added. |

Verification owners: `patient_journey_orders_test.rb`, existing clinical plan, medication administration and inventory transaction checks. Proposed-quantity completion, handover-only authority, exact create retry and same-task reversal recovery passed focused API tests. Browser proved incomplete current review rejection alongside independent lab draft preparation. Full handover and post-closure reconciliation browser proof remains deferred; the latter passed its scoped API test.

### Orders, specimens, reports and continuity

| Fields / action | Backend and UI owner | Type, requirement and provenance | Verification |
| --- | --- | --- | --- |
| Test/display/code/system, request kind, intent, priority, reason, destination, due time | Existing `ServiceRequestRevision`, clinical plan workspace | Scoped request; actual clinician entry and explicit timezone-aware timing. Draft is not a collected specimen or result. No universal panel, threshold or turnaround. | T06/T07 clinical plan and lab tests; independent draft browser proof. |
| Specimen identifier/type/condition and collection time; source/accession/title/report status/issue time | Existing `LabReport`, append-only `LabReportVersion`, `LabReports`, `PatientLabReports` | Actual source values and linked order; entered collection/issue times, no fictional order dates. R08/R09 local mapping. | Lab report contract tests. |
| Result `value_kind`, value, coding, unit, range, flag, absent reason | Existing report-version result payload | `numeric`, `text`, `coded`, `absent`; source-specific units/range/flag; explicit unavailable reason, no invented missing value | Typed-result tests and real absent-result form browser proof. |
| Acknowledgment, review, recollection, patient communication | `LabReportAction`; existing version review/follow-up owners | Separate actor/time/version evidence; acknowledgment does not review or inform the patient. Corrected result retains prior version and reopens affected responsibility. | Lab action/correction tests; acknowledgment browser proof. Post-closure completion reconciliation passed scoped API proof. |
| Owner/pool, pending assignee, version, prerequisite IDs and events | Existing `ClinicalTask`, new `ClinicalTaskDependency` / `ClinicalTaskEvent`, `TaskContinuity`; Work inbox | Site-authorized membership references, explicit same-patient dependencies, no cycles. Prior owner remains until eligible acceptance. Missing coverage remains visible. Source work completes in its source owner. | Continuity tests; two isolated staff browser sessions prove transfer coverage and acceptance. |
| Callback request/status/contact outcome; renewal attention | Existing portal `Request` and operational projections; patient appointments / Work inbox | Callback is an owned contact request, not a reservation. Actual outcome required to close. Membership attention does not complete clinical tasks. | Booking/callback/continuity tests; real callback rejection/completion and independent-task browser proof. |

## Verification ledger

The repaired candidate passed 45 distinct focused Rails cases: core 26 (24 passed initially; two fixture-scope repairs then passed), entry/intake 10, booking/scribe 6 and final DOB/capacity/model-boundary checks 3. Logs are `patient-journey-focused-core`, `patient-journey-core-repair`, `patient-journey-focused-entry-intake`, `patient-journey-focused-booking-scribe` and `patient-journey-final-boundaries` under `tmp/`. No unchanged passing case was repeated solely to make a combined green summary.

Frontend TypeScript, bundle and 14 related tests passed after repair. The earlier 43-file/326-test pass supplies unchanged-behavior evidence; it is not added to 14 as a unique-test total. Changed-file Ruby lint passed (68 files, then the last repaired fixture). Seven migrations, Rails eager loading and PostgreSQL legacy-data upgrade/concurrency/backup/restore passed before the source repair; unchanged schema/dependency evidence is reused. Graft was refreshed.

| Acceptance | Focused evidence and paired behavior |
| --- | --- |
| T01 | Membership growth adult boundaries/contact-first/interrupted identity and account-first verified-payment reuse; public contact-first browser proof. |
| T02 | Inactive membership denies new self-booking while callback and existing cancellation succeed; waitlist exact replay; plausible DOB, newborn and invalid-raw-date checks. |
| T03 | Patient draft/absence states, measurements, inherited source and legacy rendering; staff distinct confirmation and scoped authority. Patient and repaired staff browser save/reload proof. |
| T04 | Capacity conflict versus adjacent reservation and walk-in; pending transfer preserves coverage until current acceptance. Two isolated browser staff sessions. |
| T05 | Disconnected video intent remains saved in continuity tests; changed participants/consent fence capture; exact unsigned export and corrected-result stale-draft checks use existing scribe owners. No live media claim. |
| T06 | Incomplete/stale review denied alongside lab preparation; partial/reversed/not-done handover, held/expired/insufficient/wrong-unit stock, exact retry and proposed-quantity completion. |
| T07 | Typed/absent results; acknowledgment distinct from review; recollection and corrected report retain responsibility. Closed-encounter reconciliation requires current review and prerequisites, preserves the same task and exact retry, denies revoked actors. |
| T08 | Verified-payment account reuse and independent clinical work through closure/membership attention; actual callback outcome is required. Existing money/ledger owners reused; no live charge/refund or outbound delivery claim. |
| T09 | Labeled simulation exercises pre-send failure/rejection/acknowledged/unknown, duplicate and obsolete reconciliation; no manual forged acceptance; exact order-create retry preserves one series. |
| T10 | Scoped/revoked actors, stale transfer, missing coverage, dependency cycles and source completion guards; independent work stays actionable through closure and correction. |

Browser evidence uses real local Rails APIs without mocks. Local artifacts are in `outputs/patient-journey`; raw task-local logs are in `tmp/patient-journey-*`. JSON records: `browser-results`, `staff-browser-results`, `storefront-browser-results`, `clinical-browser-results`, `lab-browser-results`, `stable-browser-results`, `transfer-browser-results`, `staff-intake-browser-results`. These prove the specific actions stated in each record, not live integrations or overall clinical readiness. The staff-intake walkthrough's initial login attempt returned 422 during page initialization; one retry after initialization passed. The additional handover fixture hit inactive-site and invalid-receiving-key setup failures; it was not retried indefinitely or labeled a passing browser path.

Deferred broad findings are preserved in `tmp/patient-journey-final-check.log` and the original verifier logs: outdated scheduling/close payload fixtures, older role/search/registration assumptions, time-sensitive workforce/demo expectations, two unrelated RuboCop blank-line findings and the existing recall-query Brakeman warning. The backend invariant run stopped at its old clinician-less booking fixture after two earlier invariants passed; the HTTP boundary verifier stopped during startup before assertions. These findings are not repaired, waived as passing, or claimed as a full regression result. They are deferred under the current development policy.

Remaining external decisions: selected clinical protocols and exact treatment prerequisites; chosen laboratory/prescribing contracts and identifiers; state/policy-specific consent requirements; explicit coverage/contact timing where unconfigured. R02 Patient and R04 Body Weight profile retrieval remained unavailable on a bounded recheck; their exact profile bindings are not claimed. No missing decision is replaced by a global patient hold.

Next unfinished product action: at a separately authorized milestone, finish the connected handover/post-closure browser proof and selected clinic/vendor mappings, reusing valid evidence. Broad regression and launch verification remain pending. No follow-on audit is automatically dispatched.

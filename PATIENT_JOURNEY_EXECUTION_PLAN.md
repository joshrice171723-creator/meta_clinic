# Tonight's patient journey — execution plan

Created: 2026-09-14. Revision 2: combined founder plan and reviewed skill-test evidence. Assignment: membership-based cash-pay weight-loss clinic, in-person and telehealth. Status: plan saved; implementation not dispatched by this document.

This is the single starting document for the assignment: founder decisions and detailed questions, selected research and source findings, action contracts, acceptance cases and one resume checkpoint. It incorporates useful material from all seven skill-test artifacts without adopting their extra scope or duplicating their files. The test artifacts remain evaluation evidence only; no task depends on their local Desktop paths. Later explicit founder decisions govern conflicts. The [implementation tracker](APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) remains the work inventory; the engineering guide remains the shared matrix owner.

Navigation: [boundaries](#outcome-and-boundaries) · [research](#research-provenance-and-field-design-rules) · [source baseline](#source-baseline-and-reuse-map) · [journey](#1-membership-selection-account-and-payment) · [matrix integration](#10-visible-parallel-work-and-matrix-integration) · [acceptance](#11-execution-sequence-and-completion-evidence) · [open decisions](#open-items-to-resolve-without-reopening-settled-scope) · [resume](#resume-checkpoint).

## Read before starting or resuming

Read this file, [Decisions](APPlyVault/03%20Execution/Decisions.md) D-071 through D-074 and later relevant clarifications, the [engineering guide and dependency matrix](docs/development/meta-clinic-build-and-acceptance.md), and current repository instructions. Compare the current checkout and newest user direction with the checkpoint below. Do not infer missing authority from this plan, silently change scope, copy the skill-test draft over it, or revive archived proposals.

Consolidation baseline: `cdfa7875da6ee9e2d27d704d0e01711cbac22be4`. Imported agent source observations refer to `ffac62861865fad557213f996a39ddb3f657bdb3`; the intervening commit added the original plan and vault links, not application changes. They are bounded source inspection, not runtime proof or exhaustive absence findings. Refresh only affected source paths before implementation. Follow the [architecture](docs/architecture/software-architecture.md), [code-change workflow](agent-harness/workflows/code-change.md) and [healthcare standards procedure](docs/development/healthcare-standards.md).

## Outcome and boundaries

Connect the complete journey: public membership selection, account creation and paid/unpaid branches; staff-assisted and walk-in entry; intake; scheduling; visit and documentation; prescription preparation and outside-pharmacy or in-house fulfillment; labs; checkout; recurring membership and follow-up. Staff must see outstanding parallel work, who owns it, what is actually blocked and how to move it forward.

The reference clinic does not restrict Meta Clinic's broader multi-specialty scope. Reuse current owning records, queues, consent mechanisms, billing/stock ledgers and screens. Inspect first; connect and harden existing behavior instead of rebuilding it.

### Final founder decisions — earlier conflicting proposals do not apply

- Only public membership account creation requires age 18+, checked in UI and backend. Do not add age gates elsewhere in this assignment.
- Child/guardian online-account and minor-specific telehealth processes are deferred. Do not add guardian disclaimers or special access flows tonight.
- Reject invalid/future birth dates and ages 150 or older. Today's birth date is valid for a staff-created newborn record. Calculate age from DOB, not a stored age; define and test the date basis and boundary cases.
- Never-member unpaid prospects cannot self-schedule online. Former members without active membership may request a call, but cannot self-schedule. Staff scheduling remains a separate workflow. Membership is not a universal prerequisite for staff-created patients or walk-ins.
- Preserve account-first enrollment and server-verified payment conversion using the same account. A browser return is not payment evidence.
- The clinic selects offered medications, labs and in-house fulfillment. Do not invent a universal weight-loss drug list, lab panel, clinical threshold or eligibility algorithm.
- Inspect and reuse existing consent/recording processes. Address actual gaps; do not assume the current implementation is complete.
- Enforce clinic-assigned employee privileges. Do not introduce independent license validation or legal state-eligibility enforcement.
- Existing scribe integration is in scope. Separate AI brainstorming is not.
- Build local vendor-dependent workflows now, but do not buy services, submit real transactions, activate live connections, deploy, or automatically send a backlog.

## Research provenance and field-design rules

The original discussion used U.S. Core 8.0.1/FHIR R4 as a research reference. The skill-test agent subsequently opened the official sources below on 2026-09-14 and recorded STU 9 (`hl7.fhir.us.core#9.0.0`, FHIR R4 4.0.1, published trial-use/U.S. realm) as its planning basis. These are imported, dated research observations, not a fresh independent review during consolidation or a platform-wide exchange-version decision. Do not mix editions; select the actual applicable partner version before mapping. Source-specific clinical rules still need exact-section applicability review before implementation.

| Research family from the conversation | Intended application | Interpretation boundary |
| --- | --- | --- |
| U.S. Core Patient, QuestionnaireResponse, Vital Signs, AllergyIntolerance, MedicationRequest, ServiceRequest, Laboratory Results and Clinical Notes; FHIR R4 Appointment/MedicationDispense | Patient identity, answers, measurements, clinical records, orders/results and fulfillment meanings | Exchange requirements are not universally mandatory patient questions; Must Support does not mean required at signup |
| NIDDK weight discussion, medication considerations and treatment follow-up | Goals, history, prior approaches, medication use, barriers and follow-up questions | Guidance, not an automatic treatment protocol or BMI-only eligibility gate |
| Current labeling for an actually selected medication | Conditional medication-specific questions and clinician review | Earlier Wegovy example does not select that medication or create a generic thyroid-condition exclusion |
| RxNorm and applicable terminology/units | Medication identifiers, coding and interpretable measurements | A concept code is not a stock lot; unit support is not permission to infer a dose conversion |
| HHS telehealth emergency planning, consent and privacy guidance; relevant state sources where applicable | Current location, callback/reconnection planning, applicable consent and separate recording permission | No universal consent language or independent licensing service is inferred |
| CMS e-prescribing standards, applicable NCPDP SCRIPT/network contract | Future prescription exchange mapping | FHIR preparation alone is not prescribing-network readiness; inaccessible vendor fields remain unresolved |

### Source-to-workflow reference register

The agent reviewed the named narrative/profile sections, not every linked constraint or value set. Mutable guidance and vendor pages require rechecking when their behavior is implemented. This register preserves actionable links within this file; no separate test-source document is required.

| Ref | Official reference and reviewed scope | Mapping and limits |
| --- | --- | --- |
| R01 | [US Core STU 9](https://hl7.org/fhir/us/core/STU9/) introduction/actors; [Must Support and missing data](https://hl7.org/fhir/us/core/STU9/must-support.html) | All clinical field groups; exchange requirements are not blanket form gates. Registry dynamic listing was not fully retrievable, so no exhaustive guide search is claimed. |
| R02 | [Patient](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-patient.html), profile/data elements | Sections 1–2; identity and demographics, not the product's age/booking rules. |
| R03 | [QuestionnaireResponse](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-questionnaireresponse.html), profile guidance | Section 3; question IDs, source/version, author and response state. No new form database is required. |
| R04 | [Body Weight](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-body-weight.html); [UCUM](https://ucum.org/ucum), syntax/semantics (agent recorded 2.2) | Sections 3, 6–8; preserve source value/unit/time. UCUM has U.S. applicability through these profiles; unsupported dose conversions remain prohibited. |
| R05 | [Clinical Notes](https://hl7.org/fhir/us/core/STU9/clinical-notes.html), resource/support guidance | Section 5; exchange context only, not universal SOAP layout or auto-sign authority. |
| R06 | [MedicationRequest](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-medicationrequest.html), status/intent/coding and source guidance; [RxNorm overview](https://www.nlm.nih.gov/research/umls/rxnorm/overview.html), concepts/RXCUIs | Section 6; drug identity/instructions versus source statements. Terminology release and network mapping remain to select. |
| R07 | [MedicationDispense](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-medicationdispense.html), profile elements | Section 7; prescription linkage, quantity, performer and handover; not proof of dispensing authority or existing code. |
| R08 | [ServiceRequest](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-servicerequest.html); [lab DiagnosticReport](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-diagnosticreport-lab.html) | Section 8; distinguish order/report/result and status-conditional dates. Do not fabricate dates/results to represent a pending order. |
| R09 | [Specimen](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-specimen.html); [Lab Observation](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-observation-lab.html), scope/data elements | Section 8; detailed bindings and chosen test/vendor mapping remain incomplete. |
| R10 | [Appointment R4](https://hl7.org/fhir/R4/appointment.html), scope/boundaries | Section 4; global scheduling vocabulary alongside U.S. patient context, not membership entitlement or capacity policy. |
| R11 | [HHS consent](https://telehealth.hhs.gov/providers/preparing-patients-for-telehealth/obtaining-informed-consent); [emergency planning](https://telehealth.hhs.gov/providers/preparing-patients-for-telehealth/creating-an-emergency-plan) | Section 5; location/contact/consent context. Actual state and policy language remain unresolved; existing consent controls are inspected separately. |
| R12 | [NIDDK talking about weight](https://www.niddk.nih.gov/health-information/professionals/clinical-tools-patient-management/weight-management/talking-with-your-patients-about-weight); [weight-management medications](https://www.niddk.nih.gov/health-information/weight-management/prescription-medications-treat-overweight-obesity) | Sections 3/9; goals, history and follow-up recommendations. No drug/label or mandatory panel selected; do not hardcode eligibility. |
| R13 | [CMS e-prescribing standards](https://www.cms.gov/medicare/regulations-guidance/electronic-prescribing/adopted-standard-and-transactions), transition/coverage discussion | Section 6; contract-version and covered-exchange warning, not a universal cash-pay transport mandate. Full NCPDP standard and network contract were not reviewed. |
| R14 | [Twilio Video callbacks](https://www.twilio.com/docs/video/api/status-callbacks), events/parameters | Section 5 and T09; use event time and reconciliation rather than assuming callback sequence implies actual event order. No live account/media proof. |
| R15 | [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), event/status handling | Sections 1/9 and T09; current invoice/payment evidence and pinned actual API version, not provider-example grace rules. |
| R16 | [Stripe mail/telephone orders](https://docs.stripe.com/terminal/features/mail-telephone-orders/overview), reader/access/consent overview | Preserve existing staff-phone behavior if touched, not a new overnight workstream. Detailed server-driven save variant retrieval failed; no complete contract review claimed. |

Additional sources were investigated but do not add build obligations here: [CMS estimates](https://www.cms.gov/initiatives/your-patient-rights/medical-bill-rights/get-help/medical-bill-guides-resources/what-good-faith-health-insurance-estimate), [payment disputes](https://www.cms.gov/initiatives/no-surprise-billing/overview/policies-resources/providers-payment-resolution-patients) and [CLIA setup](https://www.cms.gov/medicare/health-safety-standards/clinical-laboratory-improvement-amendments-clia/getting-started-clia). Keep applicability/review as explicit follow-up; do not silently introduce an estimate/dispute engine or onsite testing activation. Exact drug labels, state-specific requirements, supplier/carrier contracts and selected lab/prescribing contracts remain unreviewed for this assignment.

Controls and exact screen layouts below are design choices from the planning conversation, not government-mandated forms. Classify every prerequisite as product decision, applicable source requirement, clinic policy, clinician decision or unresolved mapping. Recommendations remain recommendations.

For every implemented field, record its owning backend model/API, question/label and purpose, source (entered/inherited/calculated/vendor), type/control, allowed values and units, conditional visibility, draft versus action requirement, validation message, authorized writer, provenance and verification. The tables below provide the assignment's field detail; fill in exact existing code owners during reconciliation. Reuse data rather than asking twice. Save incomplete drafts where appropriate; distinguish unanswered, unknown, declined, not applicable and negative answers. Do not collect speculative sensitive fields just because a future vendor might request them.

Backend derives organization, actor and patient/encounter scope; never trust submitted foreign keys without scoped authorization. Drafts may omit action prerequisites but not identity, permission, type or length safeguards. Keep protected drafts in the owning backend mechanism, not browser localStorage; clear transient protected context on account/session changes. Reconcile uncertain saves using the existing request identity. Inherited answers retain author/date/source, not fresh confirmation. Freshness comes from source changes or a defined policy, not an invented universal expiry. Suggested validation copy below is proposed UX text, not a claim of current behavior.

## Source baseline and reuse map

The following findings were recorded by the test agent on 2026-09-14 at the source baseline above. Links identify actual candidate owners, not assertions that every path is fully audited. Recheck the affected method and its callers before editing. Tests cited were inspected, not executed. Do not repeat broad discovery merely because a session resumed.

| Ref / journey | Inspected owner and recorded span | Finding and bounded next action |
| --- | --- | --- |
| B01 — signup | [PrepareAccount](apps/api/app/services/clinic/membership_growth/prepare_account.rb), lines 9–57; [membership tests](apps/api/test/integration/membership_growth_test.rb), 285–331 and 465–528 | Existing inactive account/prospect, setup token and mail; no DOB input in this service. Extend actual account-creation boundary and direct API paths; preserve idempotent conversion tests. |
| B02 — DOB | [PatientDemographics](apps/api/app/models/clinic/care/patient_demographics.rb), 3–19 | Future-date validation exists; no 150-year limit in inspected model. Preserve nullable staff data where allowed and today's date; inspect parsing and all affected writes. |
| B03 — scheduling | [AppointmentRequestsController](apps/api/app/controllers/clinic/patient_portal/appointment_requests_controller.rb), 3–229 | Existing requests are preferred windows awaiting staff review, not proven direct self-booking; inspected paths lack commercial-membership prerequisite. Distinguish request versus reservation before changing behavior. Provider readiness currently affects video request availability. |
| B04 — intake | [PrevisitIntake](apps/api/app/services/clinic/care/previsit_intake.rb), 5–85 | Existing versioned text answers, encrypted append-only notes, 600-character limits and submission attestation. Extend this owner for typed states/draft semantics; preserve old versions. |
| B05 — task/coverage | [ClinicalTask](apps/api/app/models/clinic/clinical_task.rb), 2–60; [NurseWorkflow](apps/api/app/services/clinic/care/nurse_workflow.rb), 190–210, 298–345; [FollowUpWorklist](apps/api/app/services/clinic/operations/follow_up_worklist.rb), 178–227 | Existing pools/source/assignee/evidence; start/complete uses individual claim. Team ownership remains valid. Resolve action permissions, coverage and exceptions without inventing every matrix team as a new queue. |
| B06 — patient work view | [WorkInbox](apps/web/src/features/clinic/WorkInbox.tsx), 1561–1586, 1681–1746 | Existing Patient Flow rendering; another board also uses that label. Extend existing views, not a third board. Source markup is not browser proof. |
| B07 — telehealth | [Eligibility](apps/api/app/services/clinic/telehealth/eligibility.rb), 3–33; [RecordScribeConsent](apps/api/app/services/clinic/telehealth/scribe/record_scribe_consent.rb), 4–63; [SyncScribeConsent](apps/api/app/services/clinic/telehealth/scribe/sync_scribe_consent.rb), 4–47 | Existing provider/type/region/optional-age checks and purpose/participant-version consent. Reconcile specific gates; no blanket removal or new age restriction. Participant/consent changes invalidate capture state. |
| B08 — scribe | [Scribe Workflow](apps/api/app/services/clinic/scribe/workflow.rb), 99–153, 341–448 | Current review/freshness/export/correction mechanics and withdrawal retention calls. Reuse exact binding and explicit review; export is not signature. Do not promise retained audio after withdrawal. |
| B09 — prescriptions | [MedicationRequestRevision](apps/api/app/models/clinic/care/medication_request_revision.rb), 3–83 | Existing append-only order/status/transmission fields, structured in-house instructions. External destination, final payload and fulfillment completeness are not established by this model. |
| B10 — labs | [LabReportVersion](apps/api/app/models/clinic/care/lab_report_version.rb), 3–84; [LabReports](apps/api/app/services/clinic/care/lab_reports.rb), 93–191; [lab tests](apps/api/test/integration/clinic_lab_reports_test.rb), 412–474 | Existing report versions/review/follow-up; dates/results required, row values stored as strings. Distinguish pending orders from reports; consider compatible partial/typed/absent-value extension. Critical review currently requires due/escalation evidence: preserve safety while separating acknowledgment. |
| B11 — stock | [AdministerMedication](apps/api/app/services/clinic/care/administer_medication.rb), 11–65, 193–259 | Existing authorized-order, lot/site/unit/quantity/idempotency enforcement. Scoped discovery did not establish take-home dispensing. Confirm full model/route/ledger coverage before adding a distinct dispense event. |
| B12 — billing | [StripeRecurringPayments](apps/api/app/services/clinic/billing/stripe_recurring_payments.rb), 1–120; [StaffPhonePayment](apps/api/app/services/clinic/membership_growth/staff_phone_payment.rb), 10–52, 120–202 | Existing recurring reconciliation and staff remote payment. Inspected support is limited, not universal pricing policy. Do not rebuild phone collection, mislabel in-person payment as phone/MOTO, or treat uncertain provider outcomes as definitely failed. |

Uninspected or partially inspected paths include full routing/schema, capacity locking, generic consent, note signing, all financial/estimate/refund flows, reminder delivery and provider contracts. These are targeted follow-up checks, not evidence that functionality is absent.

## 1. Membership selection, account and payment

Owning work: MC-02/09; matrix EN-01–09, OP-01/03/07/10.

| Question/data | Control or origin | Needed for / behavior |
| --- | --- | --- |
| Which clinic and membership? | Clinic selection and membership cards | Identify the offer before purchasing; preserve offer version |
| Name | Text fields | Identifiable prospective-patient relationship |
| Email or phone | Typed email/telephone inputs | At least one reachable method for staff follow-up; account verification follows existing account contract |
| Birth date | Typed date with optional picker | Membership-signup age rule and valid-date checks; reuse later |
| Enroll or speak with clinic? | Two explicit actions | Purchase continuation or owned contact request |
| Preferred contact method/time | Radio buttons and optional time window | Contact request; not a blanket checkout gate |
| Price, interval, included services and terms | Offer summary and applicable deliberate acceptance | Payment authorization; do not invent contract or renewal terms |
| Account, payment attempt, selected offer/version, verified outcome | Backend-owned links and event history | Recoverable, idempotent purchase and conversion |

Preserve account-first enrollment: selected offer → account/Growth relationship → existing verification → payment or assistance. Only server-verified successful payment activates the purchased membership and patient onboarding using that account. Unpaid, canceled, failed and abandoned checkout retain saved information and Growth follow-up. Pending or uncertain payment is not definite failure or success; reconcile before another consequential charge. Packages requiring prior clinic review retain their existing applicable review path.

Completion evidence: the paid branch reaches onboarding without duplicate account/patient creation; the unpaid branch remains recoverable and visibly owned. Verify signup boundaries and wrong-organization denial server-side, not just disabled UI.

**Implementation contract — B01/B02/B12; R02/R15; T01/T02/T09:** account setup owns DOB and reuses it after verified patient linkage; contact-first requires name plus email OR phone, while account purchase retains its existing email contract. A review-required offer cannot collect payment before applicable acceptance. Changed offer/terms invalidates only affected acceptance. Preserve expired-token, existing-email, failed-delivery and double-submit recovery without another account. Suggested messages: “This offer changed. Review the current membership terms before continuing.” and “Payment is not yet confirmed. Check its status before collecting again.” Pending cancellation is not automatically inactive membership. Existing staff-phone collection remains a supported separate path if touched; no new card-entry UI or processor purchase.

## 2. Registration and patient information

Owning work: MC-03/05; matrix EN-02/04, CV-03, OP-10.

| Question/data | Control or origin | Needed for / behavior |
| --- | --- | --- |
| Name on records; preferred name | Text fields, reused from enrollment | Identification and correction |
| DOB | Typed date with optional picker | Identity and plausibility; no calendar-only input |
| Address | Structured address fields; optional lookup | Collect when needed for care, billing, delivery or exchange, not automatically all at checkout |
| Preferred language; interpreter needed | Searchable language; Yes/No/Unknown | Communication planning |
| Emergency contact, relationship, telephone | Text and relationship selection | Relevant intake/check-in context |
| Patient/organization identifiers and history | Existing/generated system records | Never ask patient to invent identifiers |

Support staff-assisted registration and walk-ins independently of online membership. Avoid duplicates when an existing patient returns by another modality. Do not automatically merge on name. An unresolved patient/encounter mismatch blocks writing clinical data to that context, while correction and safely retained draft recovery remain available.

**Implementation contract — B02/B03; R02; T02/T03:** registration staff select scoped patient references; demographic correction preserves author/date/history. Patient links are not editable free-text foreign keys. Retain every demographic question above, including preferred name, language/interpreter and emergency contact; the test's shortened identity contract does not remove them or make them universally required. Recheck context after navigation/stale responses. Suggested message: “Confirm the correct patient before attaching this information.” DOB correction must not create a retroactive patient-wide lock.

## 3. Weight-loss intake

Owning work: MC-05/06/12; matrix CV-01/02/03, LB-03.

| Question/data | Suggested control | Required behavior |
| --- | --- | --- |
| What would you like help with? | Short free text | Patient goal; preserve author/source |
| What have you tried for weight management? | Multiple selections plus details | Prior approaches without forcing an exhaustive narrative |
| Medications, supplements or weight-loss products taken | Repeatable medication search; manual unmatched entry | Patient-reported list, reconciled separately by staff/clinician |
| Medication allergies or previous reactions? | Yes / No known allergies / Unsure; conditional substance/reaction | Unknown and unanswered must not become no known allergies |
| Relevant conditions or procedures? | Clinic-selected choices, free text, Unsure | Conditional follow-up, no invented universal treatment exclusion |
| Current height and weight? | Numbers with explicit units | Store measurement time and source; no fabricated missing values |
| When and how measured? | Date and patient-reported/clinic-measured choice | Preserve provenance; derive BMI only from suitable values |
| Anything making the plan difficult to follow? | Optional free text or configured choices | Relevant barriers without unnecessary mandatory questions |
| Medication-specific concerns | Conditional questions for actual configured treatment | Source-reviewed clinician attention, not automatic rejection from clinic enrollment |
| Form/version, question IDs, answers, author/source, time, completion/review state | Backend records | Distinguish patient completion from clinical review |

Determine intake prerequisites per action from applicable guidance and current policy, not a generic all-fields-complete gate. Save drafts, show what is missing and why, allow staff assistance, and leave unrelated scheduling/visit work available. A concerning answer must route to the appropriate clinical review rather than silently diagnosing or excluding the patient.

**Implementation contract — B04; R01/R03/R04/R12; T03:** extend the existing questionnaire version and owning notes, not a second questionnaire store. Preserve old payload rendering/length rules when adding typed answers and repeatable references. Save draft separately from submission attestation; submitted/current remains explicit. Keep supplements, prior procedures, barriers and allergy reaction detail from the table above. Use supported height/weight units with observation time and reported/measured source. Corrected medicines/allergies/measurements invalidate affected review/calculation only. Suggested messages: “Saved as a draft. Confirm when you are ready to send it.” and “This answer is needed for [named decision]. You can save it and continue other work.” The named clinical decision must come from a sourced/configured rule, not placeholder behavior shipped as a universal gate.

## 4. Scheduling, arrival and handoff

Owning work: MC-04/05; matrix EN-07/08, SC-01–03, CV-04, OP-04/05.

| Question/data | Control or origin | Required behavior |
| --- | --- | --- |
| In-person or telehealth? | Radio buttons | Preserve modality with the appointment/encounter |
| Visit type and location | Clinic-configured selections | Relevant duration/resources, not fabricated defaults |
| Clinician or preference | Searchable selection where relevant | Respect configured availability |
| Date/time | Available slots | Recheck capacity on confirmation; handle conflicts |
| Walk-in arrival | Explicit staff action and timestamp | No fabricated previous appointment |
| Cancellation/reschedule/no-show reason | Short selection plus optional detail | Preserve actual disposition and owned next work |
| Queue, room and handoff | Source-owned staff actions | Arrival, room assignment and accepted responsibility are distinct |

Apply the agreed online membership rules; do not extend them into a blanket restriction on staff-assisted booking or clinical follow-up. Capacity blocks the conflicting reservation, not alternative slots or contact requests. Preserve coverage while a handoff awaits acceptance. Opening a chart does not prove a handoff was accepted.

**Implementation contract — B03/B05; R10; T02/T04:** preserve timezone and actual request-versus-reservation state. Existing preferred-window requests require staff approval; do not silently redefine them as immediate self-booking or reserve a slot behind a callback label. Recheck effective membership on the action D-074 restricts; resolving endpoint semantics is not reopening that decision. Keep prior coverage until a required transfer acceptance succeeds; record expected version and reject stale acceptance. Suggested messages: “Online scheduling requires an active membership. Request a call from the clinic.” and “This handoff is awaiting acceptance. Current coverage remains responsible.”

## 5. In-person/telehealth visit and existing scribe

Owning work: MC-06/07; matrix CV-03–09, OP-10/12.

| Question/data | Control or origin | Required behavior |
| --- | --- | --- |
| Correct patient and encounter | Persistent context with correction | Prevent wrong-context writes |
| Current telehealth physical location | Confirm address or enter today's different location | Actual visit context; not an independent license checker |
| Callback number | Prefilled telephone confirmation | Disconnection recovery |
| Applicable telehealth consent | Existing configured method/version/date/recorder | Inspect existing implementation before deciding gaps |
| Scribe permission/preferences | Separate explicit recording control under existing policy | Do not silently fold into membership acceptance |
| Scribe state | Ready / recording / processing / draft available / failed | Truthful progress and recoverable failure |
| Clinical documentation | Editable draft/review/sign workspace | Generated draft is not clinician-reviewed or signed text |

Connect scribe capture and resulting draft to the correct encounter for both modalities. Missing applicable recording permission blocks capture, not manual notes. Failed scribe processing does not stop the visit or unrelated care. Version review/signature appropriately; corrections preserve history. Telehealth connection failure supports rejoin/contact/rescheduling and does not falsely record attendance or completion.

**Implementation contract — B07/B08; R05/R11/R14; T05:** local video preference/readiness can be persisted separately from live room/token creation. Location and callback are visit-specific with confirmation time. Capture checks current purpose, policy, admitted participant set and consent version/epoch; changed permission prevents further unauthorized capture, including late callbacks. Follow existing withdrawal retention/scrub behavior. Draft sections retain generated provenance and accepted/edited/unresolved review; stale/unreviewed export is denied. Approved export uses exact encounter binding/idempotency and explicit correction of an existing SOAP note, never silent overwrite or automatic signature. Suggested message: “Recording is paused because Scribe permission changed. You can continue the visit and write notes.” Room-ended is not encounter completion.

## 6. Prescription preparation and outside pharmacy

Owning work: MC-10/15; matrix RX-01–03, OP-06–08/10.

| Question/data | Control or origin | Required behavior |
| --- | --- | --- |
| Medication, strength, form | Searchable medication selection | Preserve identifiers/coding and display meaning |
| Dose and units | Structured value/unit fields appropriate to instruction | No unsupported conversion or inferred dosage |
| Route and frequency | Supported selections with instruction entry | Map actual source meaning; don't guess vendor vocabulary |
| Patient directions | Editable text consistent with structured fields | Reconcile discrepancies before applicable finalization |
| Quantity, unit, refills | Numeric/unit fields | Complete the relevant prescription instruction |
| Duration/start date | Conditional fields | Require only when applicable |
| Pharmacy destination | Name/location search; manual record if unavailable | Specific location, not just Walmart; later verified vendor identifier |
| Prescriber, patient, encounter, version and review | Existing records and privileged action | Review current version; role assignment does not establish licensure |
| Prepared request and attempt/outcome history | Durable backend record | Preserve correlation/version and source-tagged responses |

Keep medication request, dispensing and administration separate. Incomplete applicable instructions block send-ready finalization; missing destination or connection blocks transmission. Drafts, labs, notes and scheduling continue. Local completeness is not network acceptance. Distinguish prepared, submitted, acknowledged/rejected and outcome unknown. Do not blindly retry a possibly accepted request or automatically transmit the saved backlog when connected.

**Implementation contract — B09; R04/R06/R13; T06/T09:** drafts can retain an unmapped catalog selection with provenance; release needs unambiguous medication and applicable reviewed instructions. Preserve strength/form, code system/version, quantity unit, refills and conditional start/duration rather than collapsing everything into directions text. Exact serializer/column mapping remains scoped work, not invented existing fields. In-house versus outside pharmacy is an explicit fulfillment choice. Changing destination after possible transmission requires original-status/cancellation reconciliation and applicable renewed review before replacement send. Suggested messages: “Prescription prepared. Transmission is unavailable.” and “Confirm the previous prescription outcome before sending to a different destination.” A transmitted/accepted prescription is not proof it was dispensed.

## 7. In-house medication

Owning work: MC-10/11; matrix IN-01–03, RX-02/03, OP-10.

Capture/link the prescription, selected stock item, quantity/unit, lot, expiration, location, responsible employee and actual handover or administration time. Use searchable stock/lot references and structured quantities. Preserve partial fulfillment and remaining quantity. Take-home dispensing and administration during the visit are different events.

Unavailable or unsuitable stock blocks the specific stock action, not the whole visit. Expose unresolved work and permitted alternate-fulfillment planning; do not automatically substitute medication. Use existing ledger/reservation mechanisms and guard against double-decrement on retries. Carrier delivery, clinic receipt and patient fulfillment are distinct where relevant.

**Implementation contract — B11; R07; T06:** authorized medication/inventory staff record actual event, performer, lot, stock-unit quantity and remaining balance. A draft/reservation is not consumption; post through atomic validated existing ledger operations. A take-home event must not masquerade as administered dose. If absence is confirmed, add a linked dispense/fulfillment event rather than replacing administration. Preserve partial/not-done reason and reversal reference to original event. Suggested message: “Only [available quantity] is available from this lot. Record a partial fulfillment or choose suitable stock.” Shipping is conditional on an actually selected workflow, not a new logistics project.

## 8. Labs, results, review and patient communication

Owning work: MC-06/12/15; matrix LB-01–07, OP-02–08/12.

| Question/data | Control or origin | Required behavior |
| --- | --- | --- |
| Requested test/panel | Searchable clinic-configured catalog | No universal weight-loss panel inferred |
| Ordering clinician, patient, encounter | Existing context | Retain linked order identity |
| Reason, intended timing and priority | Clinician entry/date/priority controls | Do not invent turnaround or urgency thresholds |
| Performing lab and specimen instructions | Conditional selection/details | Preserve manual/prepared state while disconnected |
| Collection details | Actual specimen/date/time/source | Do not equate ordered with collected |
| Received report | Import/attachment with source and received date | Preserve provenance; receipt is not review |
| Individual results | Numeric, coded or text per test; units and supplied range | Source-specific ranges and preliminary/corrected versions |
| Review, acknowledgment and communication | Separate responsible-role actions | Evidence for each transition; communication not implied by review |

Pending or partial results block only the particular identified result-dependent decision. Scheduling, visits, checkout and unrelated work remain available. Rejected specimens create owned recollection work; corrected results reopen affected review without deleting history. Critical-result attention follows explicit clinic policy; acknowledgment is not completed handling and is not an automatic patient-wide lock. Track patient communication and overdue receipt separately.

**Implementation contract — B10; R08/R09; T07:** order preparation uses its owning ServiceRequest/order mechanism, not a fake result form. Separate external lab, clinic collection and onsite testing configuration without activating a new testing service. Keep actual specimen/accession/source and timezone-aware times; no invented collection/issue date for an uncollected order. Extend typed numeric/text/coded values and absent-result reasons compatibly if needed. Preserve source ranges/flags and corrected report versions; available partial results may be reviewed while missing analytes remain open. Acknowledgment, version-bound review, escalation and patient communication need separate evidence. Suggested messages: “Lab order prepared; it has not been sent.” and “Some results are still pending. Review available results or follow up with the laboratory.” Do not remove existing critical-review safeguards without tracing their purpose and replacement evidence.

## 9. Checkout, recurring membership and follow-up

Owning work: MC-08/09/12; matrix EN-09, OP-01–05/07/10/12.

| Question/data | Control or origin | Required behavior |
| --- | --- | --- |
| Delivered services, invoice, payment, credits/refunds and receipt | Existing billing records and authorized actions | Preserve financial authority; no duplicate ledger or false paid receipt |
| Membership state, billing period, next charge and cancellation | Existing subscription/payment evidence | Pending cancellation differs from ended membership; don't invent grace periods |
| Follow-up reason, owner and linked appointment/order | References, responsible queue, optional assignee | Visible work even after encounter closure |
| Due date/timing | Defined plan/policy | No arbitrary universal due date |
| Outreach method, attempt, outcome and next action | Status selection, timestamp and short note | Queued/sent is not delivered or patient-confirmed |
| Progress, medication use, difficulties/adverse effects | Questions appropriate to clinician plan | Conditional follow-up; patient-reported source preserved |

Failed renewal creates owned financial follow-up; it does not silently cancel clinical tasks or hide results. Service restrictions require a defined policy. Close the encounter independently from unresolved prescriptions, labs, financial exceptions and follow-up tasks. Show completed, unverified and outstanding work truthfully.

**Implementation contract — B05/B12; R15; T08/T10:** inherit prices and inclusions from the accepted offer/service records; medication/lab inclusion must not be assumed. Use exact money/currency and source-owned balances, never an editable paid flag. Match renewal invoice/subscription/terms evidence and effective dates; provider status alone is not every invoice paid. Outreach attempts have source/time/outcome; source correction may reopen only affected follow-up. Staff/task assignments do not grant billing or clinical release permissions. Suggested messages: “Payment is not yet confirmed. Check its status before collecting again.” and “No eligible coverage is configured. Assign an authorized team to this work.” Actual coverage destination remains configuration, not an invented staff member.

## 10. Visible parallel work and matrix integration

Use the existing [six-column matrix](docs/development/meta-clinic-build-and-acceptance.md): **Condition | Action affected | What is blocked | What remains available | Responsible party | Attention**. The section references above select relevant stable IDs; do not duplicate or replace the 46-condition matrix in this file. Review missing conditions and outdated gates while building; change the canonical row with rationale and affected acceptance references.

Patient Flow, patient detail and authorized team work views must show membership, intake, appointment, note, prescriptions, labs and follow-up independently. Each applicable work item shows actual status, responsible team/person, waiting or blocking reason, attention/due status and a direct next action. Unfinished earlier work must not hide unrelated actions. Use text/icons, not color alone, and respect existing access rules.

Distinguish optional patient coordinator, encounter responsibility and each task's owner. Team ownership is valid without an individual claim. Keep transfer/acceptance/coverage history. Deactivation or privilege loss must expose eligible coverage or an assignment exception; do not invent an owner or grant privileges through assignment. Waiting, urgency, acknowledgment, completion and blocking are separate. Reject cycles rather than strand tasks behind hidden dependencies.

### Matrix refinements to apply through the existing owner during implementation

The following are scoped clarifications for existing rows, not a second matrix or a claim those rows were changed by this consolidation. Recheck the canonical row and update it only where needed; retain the six exact columns and stable IDs.

| Existing ID | Clarification carried into this assignment | Field contract / proof |
| --- | --- | --- |
| EN-03 | Interrupted setup, expired verification and changed terms retain saved interest while blocking invalid activation/checkout | Section 1; T01 |
| EN-09 | Effective membership versus pending cancellation; retain callback, staff booking and outstanding care | Sections 1/4/9; T02/T08 |
| CV-01 | Unconfirmed intake draft must not be labeled submitted; drafting and independent work continue | Section 3; T03 |
| CV-06 | Save local video intent while disconnected; block actual room/token and false attendance claims | Section 5; T05 |
| CV-07 | Consent/participant/policy changes invalidate capture while preserving permitted manual work | Section 5; T05 |
| RX-03 | Destination/route switch after possible send needs reconciliation, not duplicate fulfillment | Sections 6/7; T06/T09 |
| LB-01 | Pending order is not a report; no invented collection/results to satisfy report validators | Section 8; T07 |
| LB-05 | Separate acknowledgment, review, handling and communication; preserve actual clinical safeguards | Section 8; T07 |
| IN-03 | Partial handover, administration, shipment and receiving have distinct completion evidence | Section 7; T06 |
| OP-05 | Preserve team ownership/coverage and show configuration exception when no eligible destination exists | Sections 4/9/10; T10 |

The test's proposed EN-10 describes the already-existing review-required offer rule: implement/test that branch under section 1 and EN-03 before deciding whether a new canonical row is needed. Do not reserve a new ID without checking current use. Proposed OP-13 combined estimates and billing-dispute restrictions; it is not adopted into tonight's build. No matrix rows are retired here.

## 11. Execution sequence and completion evidence

The sequence organizes implementation, not a mandatory linear patient workflow. Within it, independent patient work remains concurrent.

| Slice | Work and entry requirement | Evidence required before calling it complete |
| --- | --- | --- |
| A — Reconcile | Inspect current source/tests/consent and relevant source sections; map actual owning paths and gaps for sections 1–10 | Recorded source revision, source-to-field mapping and exact changes needed; no documentation-only implementation claims |
| B — Entry through scheduling | Connect paid/unpaid and staff/walk-in branches to existing onboarding/intake/scheduling | Synthetic persistence and role/isolation checks; verified-payment conversion, age boundaries, booking denial and allowed staff/independent work |
| C — Encounter and documentation | Connect intake, room/handoff, in-person/telehealth and existing scribe/manual notes | Correct context, consent-specific capture block, scribe failure fallback, review/version history and coverage behavior |
| D — Orders, results and fulfillment | Complete prescription/lab preparation, review and local external/in-house alternatives | Disconnected preparation, partial/corrected results, exact lab hold with scheduling available, stock constraints, no duplicate consequential effects |
| E — Checkout and continuation | Connect billing/recurrence, communication and follow-up visibility | Payment/renewal exceptions remain owned; encounter closure preserves open child work; rebooking and outreach recovery |
| F — Integrated acceptance | Freeze scoped changes and run proportionate verification under current repository workflow | End-to-end browser journey plus API/persistence, negative, recovery and isolation evidence; separately record simulator and live-provider gaps |

For every changed dependency, verify BOTH the blocked action and an independent successful action. Required scenarios include simultaneous pending lab + prescription + billing work; transfer pending with coverage; owner unavailable; wrong role/organization; failed save; stale edit/review; duplicate/out-of-order events; uncertain submission; partial fulfillment; corrected results; and open follow-up after encounter closure. Only run applicable supported synthetic scenarios; do not use real patient data or real transactions.

Use backend-based synthetic simulation for disconnected adapters, not frontend-only dummy state. Keep manual, simulated and externally confirmed evidence distinct. External vendor access blocks actual execution/acceptance, not useful local completion. Insurance and supplier price/order/shipping preparation follow D-072 but are not extra work packages required to finish this cash-pay reference journey.

An implementation handoff reports exact changed paths/revision, checks actually run/results, browser evidence, unverified conditions, provider-dependent gaps and the next unfinished action. Passing local tests is not live integration or clinical/release acceptance. Do not launch or schedule work just because this file exists.

### Paired acceptance crosswalk — planned, not run

Each test group maps the journey's data/action contracts to existing matrix IDs. Use independently created synthetic records through the actual backend. The same patient/context must demonstrate the blocked transition AND an independent permitted action; separate unrelated test fixtures alone do not prove parallel progress.

| Test / matrix / source | Blocked assertion | Permitted assertion and recovery/edge evidence |
| --- | --- | --- |
| T01 — EN-01–06, EN-03 review-required branch; OP-01/07/10; B01/B02 | Under-18 signup via UI/direct API; invalid/future/150th-birthday DOB; expired token; premature/review-required payment and unverified conversion | 18th birthday succeeds when otherwise valid; staff newborn DOB accepted; contact-first persists; expired setup recovers same prospect. Matching verified payment converts once; duplicate/out-of-order/mismatched amount/account events cannot duplicate or cross-link. No new child access workflow. |
| T02 — EN-07–09, SC-01/02; B03/B12 | Inactive/former or never-member unpaid self-booking, including direct API; conflicting reservation | Callback and authorized staff booking continue. Active eligibility does not bypass capacity. Pending cancellation must not prematurely revoke still-active entitlement. Preserve existing appointment/clinical follow-up access; reconcile request-only semantics first. |
| T03 — CV-01–03/05; B02/B04 | Unattested draft labeled submitted; wrong-context attach; stale revision overwriting a newer answer | Draft save and eligible scheduling succeed. Round-trip unanswered/unknown/declined/not-applicable/negative distinctly. Restore preferred-name/language/interpreter/emergency-contact and medication/history/barrier fields where applicable; source correction invalidates only affected review. |
| T04 — SC-01–03, CV-04, OP-04/05; B03/B05 | Two conflicting confirmed reservations; false walk-in room/handoff/attendance; stale or ineligible transfer acceptance | One reservation wins and other selects an alternative; walk-in registration/intake need no invented appointment. Prior coverage remains during required acceptance; cancellation/no-show leaves other tasks open. |
| T05 — CV-05–09, OP-06/07/10/12; B07/B08 | Disconnected live room/token; capture after absent/withdrawn/stale participant permission; stale/unreviewed/wrong-context draft export | Local video preference, otherwise-permitted visit and manual notes continue. Rejoin same visit after drop; late callbacks cannot bypass consent changes. Current approved export is idempotent and not a signature; existing note requires explicit correction. Follow actual retention, not a promise of preserved audio. |
| T06 — RX-01–03, IN-01–03, OP-06–08; B09/B11 | Incomplete/unapproved/currently stale release; replacement send while original outcome unknown; expired/held/insufficient/wrong-unit lot use | Draft/review/lab scheduling remain available. Reconcile prior destination; valid partial fulfillment retains remainder. Concurrent retry posts stock once; reversal references original. Take-home dispense is not administration and accepted prescription is not dispensing. |
| T07 — LB-01–07, OP-06/10/12; B10 | Prepared order falsely collected/final; missing analyte satisfies a specifically dependent decision; receipt/acknowledgment falsely completes review/handling/contact | Schedule and start visit with pending labs; review available results, coordinate recollection, keep source priority/owner visible. Corrected result reopens affected work and preserves versions; duplicate event creates no duplicate task. Closed encounter retains outstanding review/contact. |
| T08 — EN-09, OP-01–03/07/12; B12 | Unconfirmed payment/refund produces paid/refunded receipt; duplicate renewal posting; failed outreach labeled informed | Invoice draft/reconciliation and care follow-up succeed. Test exact balances, reversals and effective dates without inventing grace/benefits. Failed/canceled membership never silently completes clinical work or revokes unrelated access. Estimate/dispute additions are excluded pending separate decision. |
| T09 — OP-06–08/10; R14/R15 | Disconnected send, stale-approved payload send, blind repeat after possible acceptance, wrong-account event | Persist/review/reconcile with original version and identifiers. Connection change sends ZERO backlog items. Simulator exercises failure-before-send, rejection, acknowledgment, unknown outcome, duplicates and out-of-order callbacks without regressing truth. Manual/simulated records never become vendor confirmation. |
| T10 — CV-04, OP-02–05/10–12; B05/B06 | Revoked actor action, stale claim/transfer, dependency cycle, false source completion | Simultaneous intake/lab/Rx/billing/callback items remain separately owned; resolving one leaves others actionable. Eligible coverage can claim without gaining permissions; no eligible team exposes an exception. Encounter closure preserves task identity/source/next action. |

Verification planes: source/body inspection; local API/database transaction and isolation tests; Rails-backed browser proof; backend simulator; separately authorized live-provider acceptance. None can substitute for another. Browser proof covers patient mobile, staff desktop/tablet, keyboard/focus and text-based owner/reason/attention/next-action visibility. Use two synthetic sessions for handoffs and appropriate video checks. Do not claim two-party live media from simulated room states. Keep insurance disabled for this reference journey and verify cash-pay work does not demand payer data.

Principal failure to disprove: encounter closure or a global sequential status hides unresolved lab/Rx/billing work or forces duplicate external actions. T07/T09/T10 must demonstrate independent progress and durable responsibility through closure, correction, unavailable ownership and repeated events. If work disappears, unauthorized action succeeds, money/stock posts twice or an unknown outcome becomes false success, reject the affected slice and repair it. Follow current phase-aware repository verification; do not copy unverified commands or run live services to satisfy a local check.

### Scope additions deliberately not adopted

The test identified potential estimate/dispute handling, detailed phone-reader work, onsite-test applicability and a lab-first implementation sequence. Preserve these as review findings, not new mandatory features or regulatory determinations. Existing payment/consent/clinical protections remain. This assignment keeps slices A–F and the entry-first sequence above; the lab-pending/scheduling case is a required proof, not a silent sequence replacement. Any materially expanded billing, clinical or vendor work needs a separate scope decision.

## Open items to resolve without reopening settled scope

- Recheck affected source methods and missing callers using the imported B01–B12 findings; do not redo the whole inventory. Full implementation completeness is not established here.
- R01–R16 supply dated official links and mapping scopes. Finish exact bindings and per-action clinical intake prerequisites for the selected clinic/treatment before making those actions depend on an answer; neither plan fully resolved them. Preserve source versus product/policy distinctions.
- Use configured services and synthetic examples; missing clinical protocol cannot be replaced by invented medication choices, lab thresholds or universal holds.
- Selected vendor contracts/identifiers, live access and acceptance remain unavailable. Anticipate published common fields, keep unresolved mappings explicit and retain prepared local work.
- Clinic-specific grace periods, attention/coverage destinations and contact timing remain explicit configuration/policy questions where the existing implementation does not answer them.

## Resume checkpoint

- Completed: revision 2 combines the original questions/final decisions with the test's dated sources, bounded code findings, action-contract detail, matrix refinements and T01–T10 acceptance cases. All task-critical detail is here; no test-output files are required reading. No application acceptance is claimed.
- In progress: none claimed by this file. Seven original test artifacts remain evaluation evidence outside the repository. Their duplicated checkpoints, now-obsolete tracker-link proposal and unapproved additions are not parallel instructions.
- Source baseline: observations at `ffac62861865fad557213f996a39ddb3f657bdb3`; consolidation at `cdfa7875da6ee9e2d27d704d0e01711cbac22be4`. Reconcile current HEAD and only affected source/decision changes before dependent edits.
- Verification: no application/browser/vendor checks are claimed for this plan-writing task. Document validation results are reported in its task handoff.
- Next unfinished action: after explicit implementation authorization, begin slice A with the reuse map, resolve affected endpoint/schema/clinical-rule gaps, then implement entry-first slices B–E. Use T01–T10 as planned proof, not pre-passed checks.
- Update this checkpoint after meaningful completed slices, new blockers, changed decisions and before pauses/handoffs. Record actual evidence and the next action, not a transcript. Keep the tracker updated with high-level status and links here. New scope questions stop only affected work; do not overwrite unrelated concurrent work.

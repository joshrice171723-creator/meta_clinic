# Tonight's patient journey — execution plan

Created: 2026-09-14. Assignment: membership-based cash-pay weight-loss clinic, in-person and telehealth. Status: plan saved; implementation not dispatched by this document.

This is the detailed assignment document requested by the founder, based on the research-and-clarification conversation supplied on 2026-09-14. It is not the isolated skill-test output and not a replacement for the platform strategy. Later explicit founder decisions govern any conflict. The [implementation tracker](APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) remains the current work inventory. This file owns the assignment detail and resume checkpoint.

## Read before starting or resuming

Read this file, [Decisions](APPlyVault/03%20Execution/Decisions.md) D-071 through D-074 and later relevant clarifications, the [engineering guide and dependency matrix](docs/development/meta-clinic-build-and-acceptance.md), and current repository instructions. Compare the current checkout and newest user direction with the checkpoint below. Do not infer missing authority from this plan, silently change scope, copy the skill-test draft over it, or revive archived proposals.

Baseline at document preparation: `ffac62861865fad557213f996a39ddb3f657bdb3`. This identifies the documentation baseline, not a fresh application audit. Existing code, tests, consent implementation and vendor mappings still require scoped inspection before implementation. Follow the [architecture](docs/architecture/software-architecture.md), [code-change workflow](agent-harness/workflows/code-change.md) and [healthcare standards procedure](docs/development/healthcare-standards.md).

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

The pasted conversation reports a U.S. source review and describes U.S. Core 8.0.1/FHIR R4 as its reference baseline. It is not a permanent exchange-version choice. The pasted text retains source titles but not their original hyperlinks or exact cited sections. This document preserves that research-derived design without falsely claiming those pages were freshly reopened during transcription. Before encoding a source-dependent rule, reopen the applicable official reference via the [U.S. reference map](docs/development/us-healthcare-reference-map.md), record the URL, section, version, access date and applicability, and map it to data, UI and verification. Do not use an unverified version claim as a product requirement.

| Research family from the conversation | Intended application | Interpretation boundary |
| --- | --- | --- |
| U.S. Core Patient, QuestionnaireResponse, Vital Signs, AllergyIntolerance, MedicationRequest, ServiceRequest, Laboratory Results and Clinical Notes; FHIR R4 Appointment/MedicationDispense | Patient identity, answers, measurements, clinical records, orders/results and fulfillment meanings | Exchange requirements are not universally mandatory patient questions; Must Support does not mean required at signup |
| NIDDK weight discussion, medication considerations and treatment follow-up | Goals, history, prior approaches, medication use, barriers and follow-up questions | Guidance, not an automatic treatment protocol or BMI-only eligibility gate |
| Current labeling for an actually selected medication | Conditional medication-specific questions and clinician review | Earlier Wegovy example does not select that medication or create a generic thyroid-condition exclusion |
| RxNorm and applicable terminology/units | Medication identifiers, coding and interpretable measurements | A concept code is not a stock lot; unit support is not permission to infer a dose conversion |
| HHS telehealth emergency planning, consent and privacy guidance; relevant state sources where applicable | Current location, callback/reconnection planning, applicable consent and separate recording permission | No universal consent language or independent licensing service is inferred |
| CMS e-prescribing standards, applicable NCPDP SCRIPT/network contract | Future prescription exchange mapping | FHIR preparation alone is not prescribing-network readiness; inaccessible vendor fields remain unresolved |

Controls and exact screen layouts below are design choices from the planning conversation, not government-mandated forms. Classify every prerequisite as product decision, applicable source requirement, clinic policy, clinician decision or unresolved mapping. Recommendations remain recommendations.

For every implemented field, record its owning backend model/API, question/label and purpose, source (entered/inherited/calculated/vendor), type/control, allowed values and units, conditional visibility, draft versus action requirement, validation message, authorized writer, provenance and verification. The tables below provide the assignment's field detail; fill in exact existing code owners during reconciliation. Reuse data rather than asking twice. Save incomplete drafts where appropriate; distinguish unanswered, unknown, declined, not applicable and negative answers. Do not collect speculative sensitive fields just because a future vendor might request them.

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

## 7. In-house medication

Owning work: MC-10/11; matrix IN-01–03, RX-02/03, OP-10.

Capture/link the prescription, selected stock item, quantity/unit, lot, expiration, location, responsible employee and actual handover or administration time. Use searchable stock/lot references and structured quantities. Preserve partial fulfillment and remaining quantity. Take-home dispensing and administration during the visit are different events.

Unavailable or unsuitable stock blocks the specific stock action, not the whole visit. Expose unresolved work and permitted alternate-fulfillment planning; do not automatically substitute medication. Use existing ledger/reservation mechanisms and guard against double-decrement on retries. Carrier delivery, clinic receipt and patient fulfillment are distinct where relevant.

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

## 10. Visible parallel work and matrix integration

Use the existing [six-column matrix](docs/development/meta-clinic-build-and-acceptance.md): **Condition | Action affected | What is blocked | What remains available | Responsible party | Attention**. The section references above select relevant stable IDs; do not duplicate or replace the 46-condition matrix in this file. Review missing conditions and outdated gates while building; change the canonical row with rationale and affected acceptance references.

Patient Flow, patient detail and authorized team work views must show membership, intake, appointment, note, prescriptions, labs and follow-up independently. Each applicable work item shows actual status, responsible team/person, waiting or blocking reason, attention/due status and a direct next action. Unfinished earlier work must not hide unrelated actions. Use text/icons, not color alone, and respect existing access rules.

Distinguish optional patient coordinator, encounter responsibility and each task's owner. Team ownership is valid without an individual claim. Keep transfer/acceptance/coverage history. Deactivation or privilege loss must expose eligible coverage or an assignment exception; do not invent an owner or grant privileges through assignment. Waiting, urgency, acknowledgment, completion and blocking are separate. Reject cycles rather than strand tasks behind hidden dependencies.

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

## Open items to resolve without reopening settled scope

- Inspect actual account verification, consent/recording, scribe, clinical and billing owners before changing them; existing implementation completeness is not established here.
- Finish exact official URLs/versions/sections and per-action intake prerequisites from the retained research, preserving source versus product/policy distinctions.
- Use configured services and synthetic examples; missing clinical protocol cannot be replaced by invented medication choices, lab thresholds or universal holds.
- Selected vendor contracts/identifiers, live access and acceptance remain unavailable. Anticipate published common fields, keep unresolved mappings explicit and retain prepared local work.
- Clinic-specific grace periods, attention/coverage destinations and contact timing remain explicit configuration/policy questions where the existing implementation does not answer them.

## Resume checkpoint

- Completed: the detailed conversation plan has been materialized into this assignment file, with final founder corrections and links to canonical rules and matrix. This is documentation, not implementation evidence.
- In progress: none claimed by this file. The separate skill evaluation is not this assignment and must not replace it.
- Source baseline: `ffac62861865fad557213f996a39ddb3f657bdb3`; refresh against current HEAD before dependent edits.
- Verification: no application/browser/vendor checks are claimed for this plan-writing task. Document validation results are reported in its task handoff.
- Next unfinished action: after explicit implementation authorization, begin slice A; record exact current owners and source-to-field mappings, then implement the missing connections in slices B–E.
- Update this checkpoint after meaningful completed slices, new blockers, changed decisions and before pauses/handoffs. Record actual evidence and the next action, not a transcript. Keep the tracker updated with high-level status and links here. New scope questions stop only affected work; do not overwrite unrelated concurrent work.

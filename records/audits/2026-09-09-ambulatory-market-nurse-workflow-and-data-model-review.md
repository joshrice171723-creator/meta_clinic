# Ambulatory clinic market, nurse workflow, and meta-clinic data-model review

**Date:** 2026-09-09

**Scope:** U.S. ambulatory/private-practice software, especially primary care, cash-pay, membership/DPC, and nurse-supported clinic workflows

**Compared product:** meta-clinic (MC) at Git commit `4c87cf70d00f8c314eb0955e77201ee5ae1352f5`

**Evidence boundary:** Competitor feature claims come from vendor documentation. A competitor's internal database schema is private unless its public API documents an object. “Likely objects” below are standards-based architectural inferences, not claims about proprietary table names. MC objects come from source, migrations, serializers, and browser contracts in this repository. No clinical workflow or field set is approved by this report.

## Executive conclusion

The nurse concern is credible, and it is mostly a workflow problem—not proof that MC needs more fields everywhere.

MC has broad operational software: appointments, encounters, patient history, vitals, lab-result review, medication administrations tied to inventory, reminders, staff messaging, telehealth, billing, subscriptions, purchasing, recalls, workforce scheduling, timecards, and detailed audit/recovery mechanics. That is more operational breadth than many early clinic products.

The weak point is the nurse's continuous work loop. The repository itself still classifies the target sequence—identity confirmation, arrival, intake, triage, handoff, clinician acceptance, exam, diagnosis boundary, discharge—as proposed rather than implemented. Today, a nurse can find a patient, see a schedule/board, enter vitals, review histories, record an administration, and work lab follow-up. But MC lacks first-class, connected objects for several actions that make those data meaningful: durable check-in/arrival, a versioned intake, a triage assessment, provider orders, nurse acknowledgement of orders, procedure completion, immunization administration, a care-team task pool, an explicit nurse-to-clinician handoff, encounter diagnosis, patient education/understanding, and discharge.

The best interpretation is:

- **Are you collecting the right data?** Often yes at the individual-field level. Demographics, communication consent, allergies, medication statements, conditions, vitals, labs, follow-up, scheduling, inventory, billing, and membership fields are directionally sound.
- **Are you collecting it on the right screen and in the right workflow?** Not consistently. Some data is collected in a large patient-registration form or folded into SOAP text, while nurses generally need small, role-specific steps attached to the selected visit and an owned work queue.
- **Are you missing an industry convention?** Yes: mature ambulatory systems connect clinical information to orders, tasks, results, and team ownership. The record is not just a chart; it is a work-routing system.
- **Would adding every industry field fix nurse adoption?** No. Nursing research repeatedly identifies redundant entry, irrelevant mandatory content, scattered information, excessive clicks, weak customizability, and unclear workflow as causes of burden.[1][2][3][32] Adding fields without role-specific workflow would likely make MC worse.

### Conservative scores

| Dimension | Current assessment | Why |
| --- | ---: | --- |
| Overall ambulatory feature breadth | **7/10** | Strong operations, inventory, billing, membership, telehealth, messaging, workforce, and a real clinical-history foundation. |
| Core chart data coverage | **6/10** | Patients, allergies, medication statements, conditions, vitals, notes, labs, and administrations exist; orders, prescriptions, immunizations, procedures, care plans/goals, referrals, encounter diagnoses, and a complete document exchange flow are missing or partial. |
| Nurse daily-workflow fit | **4/10** | The intended intake/triage/handoff sequence is not yet a durable workflow; nurse work is spread across board, chart, labs, reminders, messages, and inventory. |
| Data integrity/recovery design | **8/10** | Strong tenant scoping, immutable revisions, explicit unknown outcomes, idempotency, audit events, and inventory controls. This is code-level evidence, not production or compliance acceptance. |
| “Correct data on each screen” | **5/10** | Many right fields, but several are on the wrong layer (registration vs visit), stored as note text rather than reusable observations, or lack the object that gives the field an owner and lifecycle. |

## 1. What this market generally contains

Across athenaOne, eClinicalWorks, Tebra, DrChrono, Elation, CharmHealth, Practice Fusion, and Hint, the recurring product pattern is a connected suite rather than a single charting screen. Official product pages consistently group features into clinical documentation, scheduling/practice management, e-prescribing, orders/results, patient communication/portal, billing, and telehealth.[4][5][6][7][8][9][10]

### Representative competitor matrix

| Product / market position | General feature pattern | Objects publicly proven or reasonably required to power it |
| --- | --- | --- |
| **athenaOne** — full ambulatory suite | EHR, curated longitudinal chart, documentation, orders/results, care-gap support, scheduling, eligibility, claims/denials, portal, messaging, self-scheduling/check-in, telehealth, reminders | Patient, practitioner, appointment, schedule/slot, encounter, condition, allergy, medication/order, service order, diagnostic result/observation, document, task/case, coverage/eligibility, claim, payment, communication. Proprietary names not public.[4][11] |
| **eClinicalWorks** — full ambulatory suite | Intake/check-in, questionnaires, EHR, medication management, referrals, care planning, portal, reminders, telehealth, billing/RCM | Patient, questionnaire/response, encounter, problem/diagnosis, medication request, referral/service request, care plan/goal, appointment, message, claim/payment. Proprietary names not public.[5] |
| **Tebra** — independent-practice EHR + PM | Charting/templates/flowsheets, eRx/EPCS/PDMP, eLabs/imaging orders, scheduling, digital intake, portal/messaging, telehealth, claims/eligibility/ERA/denials/payments | Patient, encounter, clinical note, flowsheet/observation, medication request, service request, diagnostic report, appointment, questionnaire response, communication, coverage/eligibility, claim/remittance/payment.[6] |
| **DrChrono** — mobile-first ambulatory EHR | Scheduling, check-in, charting/templates, tasks/flags, eRx, labs/imaging, portal, reminders, telehealth, claims/payments | Public lab API proves `lab_order`, `lab_test`, `lab_document`, and structured `lab_result`, linked to patient, doctor, diagnosis codes, accession/requisition, specimen, status, and timestamps.[7][12] Other object names are not asserted here. |
| **Elation** — primary-care, clinical-first | One-screen charting, dynamic problem list, orders/eRx, labs/imaging, intake, calendar, patient/staff messages, faxes/documents, “Requiring Action” queues, billing, memberships | Official workflow proves calendar/appointment, patient chart, office message/task, handout, fax/document, bill/payment, membership, and actionable-queue concepts. Its exact storage schema is not public.[8][13] |
| **CharmHealth** — modular SMB EHR | SOAP templates, eRx, lab integrations, decision trees, longitudinal flowsheets, referrals, immunization registry, portal, appointment requests, questionnaires, documents, billing/claims | Patient, encounter/note, medication request, observation/flowsheet, lab order/result, referral, immunization, questionnaire response, document, appointment request, invoice/claim/payment.[9][14] |
| **Practice Fusion** — small-practice EHR | Charting, eRx/EPCS, lab/imaging orders and results, portal forms/messages/scheduling, billing | Patient, encounter/note, medication request, service request, diagnostic report/observation, questionnaire response, appointment, communication, claim/payment. Proprietary schema not public.[10] |
| **Hint** — DPC/membership platform plus EMR | Membership plans, enrollment, recurring invoices/payments, charting, eRx, lab ordering/results, tasks, messaging, scheduling, portal, AI documentation, employer eligibility | Public API documentation confirms patient enrollment, membership billing, practice configuration, and clinical-data workflows. Product documentation also requires membership plan/version, enrollment, sponsor/employer eligibility, invoice, payment, task, message, appointment, encounter/note, medication request, and lab order/result objects.[15][16] |

### The common feature types

1. **Identity and registration** — patient identity, demographics, contacts, related people, address history, insurance/membership identity, preferences, consent.
2. **Scheduling and access** — provider schedules, slots, appointment types/reasons, waitlist, appointment requests, reminders, check-in.
3. **Encounter flow** — arrival, location/room, responsible care team, intake/rooming, handoff, visit state, checkout/disposition.
4. **Longitudinal chart** — problems/conditions, allergies, medication list, histories, documents, prior notes, care summaries.
5. **Nursing assessment** — chief complaint, vitals, structured screenings, symptoms, functional/cognitive status, source, observed time, author, missing/unknown state.
6. **Orders and execution** — medication orders, lab/imaging/procedure orders, nurse acknowledgement, administration/procedure result, specimen, exceptions, completion.
7. **Results management** — diagnostic report, component observations, abnormal/critical flags, reviewer, acknowledgement, follow-up task, patient notification.
8. **Plans and continuity** — care plan, goals, patient instructions, education, understanding, follow-up, referral, recall/reminder.
9. **Team work routing** — inbox pools, tasks, owners, due dates, escalation, coverage, resolution, links to patient/encounter/order/result.
10. **Patient engagement** — portal, questionnaires, secure messages, scheduling, refills, results, documents, payments, telehealth.
11. **Revenue cycle** — coverage, eligibility, authorizations, charges, coding, claim, remittance, denial, invoice, payment/refund.
12. **Operations** — facility, staff roles, workforce, supply/medication inventory, purchasing, receiving, lot/expiry/recall, audit.

## 2. The backend objects that matter

HL7 FHIR is useful here as an object vocabulary even when a product does not implement FHIR internally. Its resource list separates `Appointment` from `Encounter`; conditions from observations; medication requests from medication administrations/statements; service requests from procedures/results; and clinical requests from the `Task` that tracks work.[17] That separation explains several MC gaps.

| Workflow question | Typical durable object | Critical relationships/state |
| --- | --- | --- |
| Who is this? | Patient, Person/RelatedPerson, Identifier, Address, ContactPoint | Name components, DOB, identifiers, contacts, related person, effective periods |
| Where and by whom is care delivered? | Organization, Location, Practitioner, PractitionerRole, CareTeam | Tenant, site, credential/role, assignment, effective dates |
| What is planned? | Schedule, Slot, Appointment, AppointmentResponse | Patient, visit type/reason, provider, site/room, start/end, booking status |
| What actually happened? | Encounter, EpisodeOfCare, EncounterParticipant | Arrival/start/end, class/type, location, participants, disposition |
| What did the patient report or staff observe? | QuestionnaireResponse, Observation, ClinicalImpression/assessment | Patient, encounter, code, value/unit, source, author, observed/recorded time, interpretation |
| What is known longitudinally? | Condition, AllergyIntolerance, MedicationStatement, FamilyMemberHistory | Clinical/verification status, onset/end, recorder, review state |
| What was requested? | MedicationRequest, ServiceRequest, CommunicationRequest, SupplyRequest | Requester, subject, encounter, intent, priority, reason, status |
| What was carried out? | MedicationAdministration, Procedure, Immunization, DiagnosticReport | Based-on order, performer, time, dose/site/specimen/result, not-done reason |
| What work remains? | Task, Communication, Flag | Owner/pool, linked clinical object, status, priority, due date, escalation, resolution |
| What is the plan? | CarePlan, Goal | Problems addressed, activities, owners, targets, review state |
| What is owed/covered? | Coverage, EligibilityRequest/Response, Account, ChargeItem, Claim/Response, Invoice, Payment | Patient/subscriber/payer, encounter/line items, statuses, adjustments, allocations |
| What proves the action? | Provenance, AuditEvent, immutable revision/event/receipt | Actor, tenant, correlation, time, before/after or version, outcome |

USCDI v7 is the current July 2026 U.S. interoperability baseline, though certification adoption can lag the newest published version.[18] It does not dictate screen design, but it is a useful check that MC's data model should distinguish patient names, race/ethnicity, birth sex, gender identity, preferred language, interpreter need, current/previous address, phone, email, encounters, orders, procedures, assessments, and provenance rather than treating all of them as generic text.[19][20][21][22]

## 3. Why a nurse may dislike MC

### 3.1 The chart does not yet model the nurse's work as one owned sequence

The current MC workflow contract explicitly says durable check-in/arrival, intake, triage aggregate, handoff, clinician acceptance, encounter diagnosis, and discharge objects are not implemented. The tracking board deliberately avoids inventing them from appointment or encounter timestamps. That caution is correct, but it leaves the nurse without a durable “my next patient / my current step / who owns the next step” loop.

This matters because workflow spans people and settings, not just screens. AHRQ warns that when clinical and administrative workflow is overlooked or oversimplified, delays in care, billing, and communication are likely.[23] AHRQ specifically recommends mapping workflows early, testing with providers and staff, and reassessing after implementation.[24]

### 3.2 There is no general clinical task/inbox pool

MC has staff conversations, messages, action requests, reminders, lab follow-ups, encounter follow-ups, billing support requests, and inventory exception reviews. Those are useful but separate queues. There is no shared clinical `Task` abstraction that can say: “refill request for this patient,” “review this result,” “complete this ordered procedure,” “call patient,” “obtain outside record,” or “handoff this intake,” with a pool/owner, due time, scope, linked record, escalation, and resolution.

Elation's official workflow places a calendar beside “Requiring Action” queues containing failed e-prescriptions, unread letters, sign-off work, failed faxes, and unfinished notes.[13] Team-based inbox guidance similarly recommends routing messages into task-focused pools so nurses and medical assistants can complete in-scope work and elevate the minority needing a prescriber.[25]

MC Messages can link a message to an object and request an action, but conversation is not the same thing as a complete task lifecycle. A nurse may experience MC as “everything has a page, but I still have to remember the work.”

### 3.3 Orders are the largest clinical-model gap

MC can record medication statements (what the patient is taking), medication administrations (what staff gave), and lab reports/results (what came back). It does not have first-class medication requests/prescriptions, lab/imaging/procedure orders, or an order-to-execution chain.

That breaks a central nursing workflow: receive an order, verify the signed/active order, confirm patient identifiers and allergies, perform the ordered action, document it as carried out, reassess if required, and provide education/instructions. The federal clinic nursing workflow example explicitly shows that chain for medication administration and in-clinic procedures, as well as nurse-only visits.[26] FHIR likewise distinguishes a `ServiceRequest` from the `Task` tracking fulfillment and the later `Procedure`, `DiagnosticReport`, or `Observation` result.[27]

MC's medication administration is admirably tied to inventory and captures dose, route, time, site, performer, product, and quantity. But without `based_on_order`, ordered dose/route/frequency, ordering provider, order status, acknowledgement, five-rights/verification evidence where policy requires it, refusal/not-given reason, and post-administration assessment, it is an isolated event rather than a complete medication-administration workflow.

### 3.4 Too much general documentation can still feel like missing workflow

MC's SOAP composer includes seven HPI fields and a broad review-of-systems checklist, but these are serialized into the subjective note body rather than stored as reusable, coded assessment observations. A nurse asked to room a patient may not need to complete a provider-style full ROS. Conversely, if the clinic needs a structured screening, storing it only as generated note text makes longitudinal review and task routing harder.

Recent nursing research describes exactly this trap: nurses consider irrelevant and redundant mandatory documentation a misuse of time, and rigid checkboxes can fragment care plans into compliance artifacts rather than useful clinical communication.[2] A mixed-method study found repetitive flowsheet entry, inability to move between screens, poor unit customization, difficult medication search, missing barcode support, duplicate care plans, and non-applicable fields among burden drivers.[3]

The right move is not “delete structure” or “add everything.” It is to collect the minimum data needed for the current job, reuse what is already known, show the source and freshness, and defer other sections unless the visit type or protocol calls for them.

### 3.5 Important data is fragmented across modules

A nurse's day may require the Tracking Board, Patients, the Encounter page, Lab Reports, Follow-up, Reminders, Messages, Inventory, and Telehealth. MC preserves patient/encounter context well inside the chart and Scribe areas, but it lacks one task-oriented worklist that couples the new fact with the prior context needed to act.

Research notes that scattered EHR information slows cognitive processing and makes handoffs harder; multiple clicks and additional documentation are recurring frustrations.[28] In a controlled EHR usability study, better longitudinal tracking reduced cognitive workload and increased appropriate management of abnormal results.[29]

### 3.6 MC has not yet been validated with the actual nurse role

The repository says staff primarily perform intake/triage and use desktop and tablet, but exact staff roles and clinical field/permission rules remain unspecified. “Nurse,” “medical assistant,” “front desk,” “NP,” and “physician” cannot safely be treated as interchangeable. A nurse could dislike the software because the product has not yet encoded which work belongs to that nurse, what can be delegated, and what needs escalation under the clinic's actual policies.

The AHRQ ambulatory workflow assessment instrument explicitly includes nurses, office staff, physicians, and administrators.[30] One 45–60 minute synthetic walkthrough with the intended RN/LVN/MA users will be more valuable than another large batch of fields.

## 4. MC backend coverage: what exists and what is absent

### Strong or substantial current object families

- **Tenant/identity:** practice, site, room, department, user membership, grants, clinician profiles/credentials/assignments, staff member/employment.
- **Patient identity/context:** patient, demographics, contacts, emergency contacts, communication preferences, address versions, social history, care needs.
- **Access/visit:** appointment, visit type, encounter, participant, provider queue assignment, telehealth visit/check-in/consent/participants.
- **Clinical history:** allergy, condition, medication statement, encounter precaution, history review.
- **Clinical events/content:** observation with explicit value kind/unit/missingness, vital-sign groups, medication administration, lab report/version/result follow-up, encounter note/revision/signature, previsit note, encounter follow-up.
- **Communication:** patient reminders/outbox/delivery attempts, staff conversations/messages/receipts/escalations/requests, communication endpoints/preferences.
- **Financial:** coverage versions, billing services, invoice/lines, payment events/allocations, refunds/credits, insurance claim, cash drawer, Stripe collection objects, membership subscription catalog/agreements/events.
- **Inventory:** catalog products, lots/batches/locations, stock ledger, holds/releases, purchases/orders/shipments/receipts/reconciliation, counts, transfers, returns, recalls, exception review.
- **Workforce:** employment/site links, badges/kiosks/punches, time segments/timecards/adjustments, availability/time-off/swaps, schedule drafts/publications/shifts, payroll exports.
- **Reliability:** request keys/digests, operation receipts, audit events, model versions, append-only event families, working drafts.

### Material missing or partial object families

| Missing/partial family | Why it matters to nurses | Priority |
| --- | --- | ---: |
| Check-in/arrival + encounter workflow events | Distinguishes scheduled, arrived, rooming, intake, waiting, with clinician, checkout; creates a truthful queue | **P0** |
| Versioned intake/triage assessment | Gives rooming data a defined source, author, completeness state, and handoff version | **P0** |
| Handoff/request/accept/correction workflow | Makes responsibility visible and prevents work from falling between staff and clinician | **P0** |
| General clinical Task / team inbox pool | Routes results, calls, refills, records, orders, forms, and follow-ups to owners with due/escalation states | **P0** |
| MedicationRequest/prescription + refill request | Separates active medication list from prescribing intent and supports nurse refill protocols | **P0/P1** |
| ServiceRequest/order + acknowledgement | Connects lab, imaging, procedures, referrals, and nursing care to the authorized request | **P0/P1** |
| Procedure and Immunization event | Records ordered nursing care, vaccines, wound care, tests, not-done reasons, and provenance | **P1** |
| CarePlan + Goal | Supports longitudinal chronic-care work and links problems, tasks, education, and follow-up | **P1** |
| Encounter diagnosis/problem-of-visit | Connects the assessment to this visit without misusing patient-level condition history | **P1** |
| Education/handout + understanding/teach-back | Makes patient education an actionable, attributable care event | **P1** |
| Referral lifecycle | Tracks request, destination, documents, status, result, and closure | **P1** |
| Structured specimen and lab order | Prevents results from appearing as reports detached from the originating order/specimen | **P1** |
| Complete patient identity/demographic model | Legal/preferred name components, race/ethnicity, gender identity, address in ordinary UI, related-person/guardian details support matching and interoperability | **P1**, subject to minimum-necessary review |

## 5. Screen-by-screen data review

Assessment terms: **Keep** = correct core data for that screen. **Move/derive** = should usually come from another object or be shown rather than re-entered. **Add** = missing object/field family, subject to workflow and clinical review. **Do not add by default** = likely burden or unsafe inference.

| MC screen | What it currently handles | Assessment of data collection | Recommended boundary |
| --- | --- | --- | --- |
| **Front desk** `/clinic/front-desk` | Appointment date/site/search; patient, location, status, actions; reschedule start/end/site/clinician/visit type | **Keep** appointment identity, site, times, clinician, type, and reason. **Add** explicit identity-confirmed, arrived/check-in event, appointment-request disposition, and previsit-form completeness. Coverage/eligibility and patient balance can be displayed if the clinic uses insurance, not silently required. | Front desk should create/modify access and arrival facts, not clinical triage. Never infer arrival from encounter start or a scheduled status. |
| **Tracking Board** `/clinic` | Patient/reference, schedule timing/operational state, location/room, provider assignment, limited vitals, care indicators, chart status, next action | The columns are largely right, but the underlying workflow is incomplete. **Add** persisted arrival, intake status, task/owner, handoff state, and explicit exception. **Derive** summaries from linked records. | Do not add a hard-coded acuity score or “normal/abnormal” logic without a clinically approved protocol. Keep missing data visibly unknown. |
| **Patients directory** `/clinic/patients` | Search by display name/reference and create/select patient | **Keep** deliberate search and disambiguation. **Add** configurable matching keys such as DOB and phone, and separate deliberate creation. | Do not automatically create on no result; do not expose a global cross-practice search. |
| **Patient registration/detail** `/clinic/patients/:id` | Display name/reference; DOB, sex, language/interpreter; contact/preferences/communication consent; emergency contact; tobacco, alcohol, exercise, diet, occupation, living situation, social factors; portal lifecycle; clinical history; labs | Directionally good, but the registration edit is too broad for every encounter. **Add/reconcile** legal and preferred name components, current address UI, race/ethnicity, gender identity/pronouns if relevant and approved, related-person/guardian/consent authority, preferred pharmacy, and insurance/member identifiers when in scope. | Split stable registration from visit intake. Do not force every social-history field on each visit. Record source/effective dates/review status. |
| **Schedule** `/clinic` schedule view | Patient, start/end, modality, site/room, clinician, visit type, reason; scheduled visits | **Keep** all. **Add** schedule/slot templates, resource conflicts, cancellation/no-show reason, waitlist, appointment request linkage, and truthful check-in transition as needed. | Appointment is planning; Encounter is care delivered. Maintain that distinction.[17] |
| **Encounter/chart** `/clinic/patients/:patientId/encounters/:encounterId` | Persistent patient/visit context, HPI, ROS, SOAP, vitals, history, labs, medication administration, follow-up, signatures/corrections | Strong foundation but not yet a nurse intake workflow. **Add** role-specific rooming/intake revision, structured screening/assessment only when required, handoff, order acknowledgement/execution, education, and discharge. **Move/derive** HPI/ROS elements into reusable observations/questionnaire responses only when the clinic needs longitudinal structure. | Default nurse view should show today’s job and previous context, not a provider-sized SOAP form. Preserve unsaved/conflict/outcome-unknown states. |
| **Telehealth queue/visit** `/clinic/telehealth` | Date/site/clinician/status filters; patient, readiness, waiting, connection, participant/consent/check-in; visit, Scribe, patient context | Correct virtual-waiting-room data. **Add** telehealth-specific intake completeness, visit owner, escalation/task, failed-connect reason, and disposition if the real workflow requires them. | Avoid duplicating clinical intake in telehealth-specific tables; link the same encounter intake/task objects. |
| **Operations** `/clinic/operations` | Module shortcuts and counts | This should remain a navigation/operational summary, not another data-entry form. | Show actionable exceptions and ownership, not decorative totals. Do not make nurses hunt here for clinical work. |
| **Facilities and visit types** `/clinic/facilities` | Facility identity/code/status/timezone/address/contact; operating hours/exceptions; rooms; visit types | Correct admin configuration. | Keep away from ordinary nurse flow except read-only location context. Visit types should determine optional workflow templates, not authorize clinical actions. |
| **Inventory** `/clinic/inventory/*` | Product/SKU/NDC/UDI, package and stock units, reorder, supplier/pricing, PO, receiving, lot/expiry/temp/location, transfer, counts, holds, recalls, reconciliation, exceptions | Very strong operational object model. **Add** only the clinical bridge: order/administration/procedure link, dispense/return/waste where applicable, and device assignment if required. | Do not make nurses re-enter lot/quantity already selected during a verified scan. Do not auto-decrement stock from a prescription; post from the actual administration/dispense event. |
| **Workforce** `/clinic/workforce/*` | My hours/schedule/requests; employment, badges/kiosk, timecards, team schedule, request review, payroll exports, location rules | Appropriate workforce data, but not clinical staffing/assignment. | Keep employment/timekeeping distinct from care-team role, clinical credential, provider assignment, and inbox coverage. A shift does not grant chart authority. |
| **Billing** `/clinic/billing` | Revenue summary, invoices, payments/receipts, collections, income outlook, subscriptions, cash drawer, checkout | Strong cash-pay/invoice workflow. Insurance claim exists but eligibility/authorization/ERA/denial depth is not comparable to a mature insurance-focused suite. | Nurses should see only clinically relevant financial flags if policy permits. Do not make them resolve billing data during clinical intake by default. |
| **Subscriptions** `/clinic/subscriptions` | Programs/tiers/services, price, duration, renewal/cancellation/refund terms, limits, eligibility review, publication/versioning | Strong DPC/membership catalog. | At the point of care, display verified membership/coverage status and included services; do not ask nurses to interpret commercial terms. |
| **Reminders** `/clinic/reminders` | Appointment-linked reminder scheduling, channel/content/status/history, attention state, staff assignment/conversation, due time | Good reminder lifecycle. **Add/bridge** the resulting patient response into the shared task/inbox when clinical or scheduling action is required. | A delivery receipt is not patient understanding, appointment completion, or clinical follow-up. |
| **Messages** `/clinic/messages` | Conversations, members, linked object, requested action, due date, acknowledgement, urgency, escalation, attachments | Strong communication primitives. **Add** a first-class task projection with owner/pool, status taxonomy, due/escalation, and resolution, so messages do not become the only task system. | Keep clinical urgency separate from sender-selected “urgent” unless the clinic defines and reviews the semantics. |
| **Scribe** `/clinic/scribe` | Patient/encounter selection, consent/capture, transcript/source, template, draft sections, review, export, correction | Correct as a clinician documentation aid with human review and provenance. | Scribe should draft, never silently create orders, diagnoses, administrations, tasks, or completion. A nurse should not have to use Scribe to create a structured intake. |
| **Settings** `/clinic/settings` | Personal appearance; telehealth configuration on a separate route | Appropriate personal/configuration data. | Add role-specific worklist preferences only if server-owned permissions and safe defaults remain authoritative. Do not hide missing workflow behind customization. |

## 6. Data-quality findings by clinical domain

### Patient identity and demographics

**Correct now:** practice-local patient ID/reference, encrypted display name, DOB, sex, language/interpreter, typed contacts, emergency contacts, communication preferences/consent, effective periods.

**Gap:** `display_name` is not a durable substitute for legal first/middle/last/suffix/previous/preferred name. The ordinary patient browser contract exposes only `primary_address_version_id`, not the actual current address. Race/ethnicity and gender identity are absent. USCDI v7 treats these as distinct patient-demographic data elements.[19]

**Recommendation:** add only after identity-matching, display, source, correction, and minimum-necessary rules are reviewed. Registration should not become a mandatory demographic census at every visit.

### Allergies, medications, and conditions

**Correct now:** active/history state, verification/review status, author/reviewer, onset/effective periods, allergy reaction/category/criticality/severity, medication dose/route/frequency/purpose/source, condition status/instruction.

**Gap:** medication names and many fields are free text rather than coded concepts; there is no medication order/prescription; patient condition is not an encounter diagnosis. Allergy structure is close to industry expectations, but terminology binding and reconciliation semantics remain unapproved. USCDI v7 separately identifies medication, drug-class, and non-medication allergies, reaction, and criticality.[31]

### Vitals and assessments

**Correct now:** systolic/diastolic BP, heart rate, respiratory rate, oxygen saturation, temperature, weight, UCUM-like units, observed/recorded time, author, encounter, explicit missingness, encrypted value payload.

**Gaps:** height and derived BMI are absent; pain is absent; visit-specific structured screening/functional/cognitive assessments are absent. USCDI recognizes functional, disability, and mental/cognitive assessments, but that is not a mandate to collect all of them at every visit.[20]

**Recommendation:** configure the smallest vital/assessment set by visit type and protocol. Do not hard-code clinical thresholds in the board. Add structured questionnaire/response objects when longitudinal comparison or task routing is required.

### Labs and results

**Correct now:** report identity/source/external ID, version, title/status, collection/report time, structured test/value/unit/reference range/flag, review, and follow-up state/outcome.

**Gaps:** no originating lab order/service request, ordered tests/indication/priority, specimen object/condition, performing lab/provider, critical-result acknowledgement/escalation, or general owner/pool task. DrChrono's published API demonstrates the typical chain: patient and ordering doctor → lab order with status/diagnosis/priority/requisition → test/panel and specimen → document → structured result.[12] The federal SAFER guidance treats test-result reporting/follow-up and clinician communication as dedicated EHR safety processes, not incidental note fields.[33]

### Medication administration and in-clinic procedures

**Correct now:** patient, encounter, site, performer, product, dose, route, administration site, quantity/unit, time, request key, inventory movement.

**Gaps:** no verified active order, ordering provider, scheduled/due administration, indication, pre-checks, refusal/not-administered reason, second verification, response/reassessment, education, or linked procedure. The federal nursing workflow includes these concepts and explicitly links nursing care back to the original order.[26]

### Notes, HPI, and ROS

**Correct now:** immutable note revisions, patient/encounter binding, author, version, template, signature, correction reason, and structured SOAP sections.

**Gap:** the HPI/ROS “structure” is embedded in subjective text. That supports readable notes but not reliable longitudinal data reuse. Also, a broad ROS may be provider documentation rather than a default nurse rooming requirement.

**Recommendation:** retain narrative flexibility. Promote only clinically reviewed, repeatedly actionable elements into typed observations/questionnaire responses. Do not turn the entire note into mandatory discrete fields.

### Follow-up, reminders, and communication

**Correct now:** encounter follow-up has plan/state/due/assignee/appointment/outcome; lab follow-up has decision/instructions/outcome/reviewer/completer; reminders and staff messages have delivery/action metadata.

**Gap:** these remain separate domain queues without a single worklist and coverage model. The nurse needs one place to see all owned work with the relevant patient context.

## 7. What to build first—and what not to build

### Recommended first slice: nurse work loop

Build one cohesive, clinically reviewed, synthetic-only slice:

1. **Arrival/check-in event** tied to the scheduled appointment and patient identity confirmation.
2. **Versioned intake/triage record** with a small configurable field set, author/source/time, explicit incomplete/unknown/unable states, and linked observations.
3. **Handoff aggregate and events**: requested, accepted, rejected, correction requested, completed/cancelled; exact intake version; one visible owner.
4. **Shared clinical Task projection** for today’s work, lab follow-up, calls/messages, order execution, and record requests; pool/owner/due/escalation/resolution/linkage.
5. **Role-specific nurse screen** that keeps patient, visit, prior care summary, today's inputs, save state, and next action together.

This slice should be designed from a real workflow walkthrough before the field dictionary is finalized. It should not include new clinical scoring or release authority.

### Second slice: order-to-action chain

Add `MedicationRequest`/prescription and `ServiceRequest`-like orders, then link them to medication administration, procedures/immunizations, lab/specimen/results, tasks, and follow-up. The model must represent ordered, acknowledged, in progress, completed, not done, cancelled, and outcome-unconfirmed without inferring one from another.

### Do not do these first

- Do not add more dashboard cards or top-level modules.
- Do not make every HPI/ROS/social-history item mandatory.
- Do not add an unreviewed triage score or universal “normal/abnormal” thresholds.
- Do not make Messages the only task system.
- Do not use appointment status, encounter start, provider booking, or a note signature as a substitute for arrival, handoff acceptance, order authorization, discharge, or checkout.
- Do not ask nurses to manage workforce, billing, subscription, or inventory details during clinical intake unless the actual clinic workflow assigns that responsibility.

## 8. The validation that is still required

This report can identify the architecture gap, but it cannot determine the final nurse fields. That needs a role/workflow study using only synthetic cases.

Run a structured session with at least one intended RN/LVN/MA user and one prescribing clinician:

1. Walk through a routine scheduled visit, nurse-only visit, vaccination/procedure visit, abnormal-result callback, refill request, and telehealth visit.
2. For every step, capture actor, trigger, information needed, input produced, source, destination, time sensitivity, exception, and handoff.
3. Mark which fields are always required, conditionally required by visit type/protocol, optional narrative, derived, or display-only.
4. Count patient/context switches, duplicate entries, backtracking, and clicks; record where paper, verbal communication, or memory is still needed.
5. Test wrong patient, missing order, missing consent, incomplete intake, stale edit, two users claiming work, absent clinician, dropped response, and expired session.
6. Observe desktop and tablet. Do not accept a screenshot as evidence that the workflow works.

The go/no-go question for each field should be: **What action, safety check, communication, billing event, or longitudinal decision becomes better because this exact user records this field at this exact step?** If nobody can answer, do not require it.

### MC evidence map

| Finding | Current source |
| --- | --- |
| Clinic's 14 top-level navigation areas and capability gates | [`apps/web/src/features/clinic/Workspace.tsx`](../../apps/web/src/features/clinic/Workspace.tsx), beginning at line 70 |
| Route-to-screen mapping, including patient/encounter routes | [`apps/web/src/App.tsx`](../../apps/web/src/App.tsx), beginning at line 434 |
| Patient registration/browser contract | [`apps/web/src/api/contracts.ts`](../../apps/web/src/api/contracts.ts), beginning at line 217 |
| Care-summary state, allergies, medications, care needs, conditions, and precautions | [`apps/web/src/api/contracts.ts`](../../apps/web/src/api/contracts.ts), beginning at line 279 |
| Appointment and encounter contracts | [`apps/web/src/api/contracts.ts`](../../apps/web/src/api/contracts.ts), beginning at lines 779 and 822 |
| Typed observation contract | [`apps/web/src/api/contracts.ts`](../../apps/web/src/api/contracts.ts), beginning at line 1018 |
| HPI fields are composed into subjective note text | [`apps/web/src/features/clinic/HistoryOfPresentIllness.tsx`](../../apps/web/src/features/clinic/HistoryOfPresentIllness.tsx), lines 9–82 |
| Current vital-sign dictionary | [`apps/api/app/services/clinic/care/vital_signs.rb`](../../apps/api/app/services/clinic/care/vital_signs.rb), lines 3–29 |
| Current database objects | [`apps/api/db/structure.sql`](../../apps/api/db/structure.sql), beginning at line 1715 for clinic tables; later migrations were also inspected because the dump is behind current migration files |
| Explicitly proposed/unimplemented arrival, intake, triage, handoff, diagnosis, and discharge contracts | [`APPlyVault/03 Execution/Clinic Encounter Workflow Contract.md`](../superseded-plans/Clinic%20Encounter%20Workflow%20Contract.md), lines 20–33 and 132 onward |
| Product statement that exact nurse/staff roles remain unspecified and intake/triage is the intended staff focus | [`APPlyVault/03 Execution/Clinic Workspace Design.md`](../../APPlyVault/03%20Execution/Clinic%20Workspace%20Design.md), lines 14–30 |

## 9. Verification record and limitations

### Verified in this review

- Repository was clean and synchronized with `origin/main` at `4c87cf70d00f8c314eb0955e77201ee5ae1352f5` before the report was written.
- Current clinic routes and navigation were traced from `apps/web/src/App.tsx` and `apps/web/src/features/clinic/Workspace.tsx`.
- Patient, appointment, encounter, note, observation, care-summary, tracking-board, billing, inventory, subscription, reminder, messaging, telehealth, Scribe, and workforce contracts were inspected from source and database definitions.
- The absence of first-class care plan, goal, service request/order, medication request/prescription, procedure, immunization, intake, triage, handoff, general clinical task, and discharge tables was checked against the current schema/model inventory.
- The current vault explicitly labels the full encounter workflow and clinical field/role rules as proposed/unapproved.
- Competitor features were checked against official vendor documentation; standards were checked against ASTP/ONC/HL7 sources; nurse burden findings were checked against peer-reviewed or government-hosted research.

### Not verified / not claimed

- No proprietary competitor database schema was reverse-engineered.
- No paid competitor account was used for an end-to-end nurse workflow.
- No MC nurse usability study or qualified clinical review was performed.
- No production, real-patient, security, HIPAA, clinical-safety, billing, or release readiness is claimed.
- This was a source-and-research audit. It did not re-run the MC application test suite or perform a new browser walkthrough because no product code changed.
- The repository's `apps/api/db/structure.sql` currently stops its recorded migration list at `20260902002000`, while later migration files exist. For this report, model/controller/migration evidence was used where the dump lagged. The schema dump should be regenerated and verified separately; this does not change the nurse-workflow conclusion.

## 10. Safest next action

Do **not** start by adding all missing objects. First complete the T-13.2/T-13.3-style workflow discovery with the actual intended nurse/MA role and produce a one-page field/state/permission matrix for six common synthetic scenarios. Then build the P0 nurse work loop as one integrated slice. That will tell you whether the complaint is about missing workflow, excessive documentation, role mismatch, or all three—and it avoids spending months on objects the clinic will not use.

## 11. Implementation progress — 2026-09-10, batch 1

This section is a dated implementation addendum. It does not rewrite the original market findings or convert local software evidence into clinical, hosted-pilot, security, HIPAA, or release acceptance.

### Five completed high-value slices

1. **Durable encounter intake evidence.** MC now stores immutable, versioned encounter-intake revisions with explicit identity, visit-reason, history, and vitals states. Each revision links to the exact typed observations and allergy, medication, and care-needs history reviews used to establish readiness. Optimistic concurrency, idempotency, tenant/patient/encounter foreign keys, digests, and explicit unable-to-complete outcomes preserve recovery and provenance.
2. **Two-owner handoff lifecycle.** A nurse/staff member can request clinician review from an intake revision; a different clinician must accept, reject, request correction, complete, or cancel it. Events are append-only, version checked, and audited. The requester cannot self-accept or self-complete the handoff.
3. **General clinical-task lifecycle.** Encounter-linked clinical tasks now support pools or individual assignments, due times, claim/start/complete/cancel/reopen transitions, resolution codes, optimistic concurrency, idempotency, audit history, and projection into the operations follow-up worklist.
4. **One nurse encounter workspace.** Care Flow now presents intake evidence, readiness gaps, handoff state, task work, and recovery controls together. The tracking board projects waiting/intake/ready/clinician state and open-task count, with a direct route into the claimed encounter workspace.
5. **Provider and workflow hardening.** Focused verification covered the new nurse workflow plus existing Twilio Video, Twilio SMS/reminder/recovery, Stripe, membership billing, and OpenRouter integration paths. A stale telehealth test was corrected to supply the clinician now required by the application. A separately reviewed worker-readiness change verifies the background service lifecycle, but remains a distinct integration item until merged to `main`.

### Provisional score movement

These scores describe the source implementation and local evidence after batch 1. They are not the hosted-pilot score.

| Dimension | Original | Batch 1 | Movement | Why it moved |
| --- | ---: | ---: | ---: | --- |
| Overall ambulatory feature breadth | 7.0/10 | **7.3/10** | +0.3 | Added reusable intake, handoff, and task capabilities across the encounter and worklist. |
| Core chart data coverage | 6.0/10 | **6.6/10** | +0.6 | Added first-class encounter-intake evidence and lifecycle ownership; major chart objects are still absent. |
| Nurse daily-workflow fit | 4.0/10 | **6.8/10** | +2.8 | Replaced a scattered implied flow with one durable intake-to-handoff workspace and shared task states. |
| Data integrity/recovery design | 8.0/10 | **8.4/10** | +0.4 | Added immutable revisions/events, database constraints, stale-write rejection, idempotency, and explicit exception outcomes. |
| Correct data on each screen | 5.0/10 | **6.7/10** | +1.7 | Intake fields now reference reusable clinical observations/history reviews and display their owner and lifecycle in the encounter. |

### Verification evidence

- Nurse workflow integration: **58 assertions passed**.
- Twilio Video telehealth workflow: **30 tests / 408 assertions passed**.
- Twilio SMS, reminders, and recovery: **24 tests / 183 assertions passed**.
- Stripe Connect, invoice, membership, and OpenRouter paths: **26 tests / 129 assertions passed** using isolated test providers/mocks where applicable.
- Web tests: **41 files / 294 tests passed**; production frontend build passed; npm audit reported zero vulnerabilities.
- Rails autoloading and focused RuboCop for the changed implementation passed. The separately reviewed worker-readiness test passed **5 tests**.

### Remaining evidence and defects

- No realistic browser walkthrough of the new nurse workspace has been completed yet.
- No intended RN/LVN/MA or prescribing clinician has validated the field requirements, transitions, role boundaries, or tablet workflow.
- The full Rails suite exposed failures outside this batch, including an overlapping inventory-reservation race and several stale or concurrently changed test expectations. Those failures prevent a clean repository-wide verification claim even though the focused nurse/provider suites passed.
- The root web-verification harness did not complete its managed-process startup; the direct frontend test suite and production build passed.
- Live OpenRouter credentials are not configured in the inspected local environment. OpenRouter behavior is test-verified only. Twilio Video, Twilio SMS, and Stripe local configuration were detected without exposing secret values.
- Hosted deployment, background-worker operation on the hosted target, synthetic end-to-end pilot execution, recovery drills, and human clinical/release approvals remain unverified.

### Next five high-value chart slices

The next batch should deepen the clinical model without expanding into lower-value polish:

1. Medication requests and prescription lifecycle.
2. Service requests and referral/order lifecycle.
3. Encounter diagnoses with provenance and correction history.
4. Procedure outcomes linked to encounter, order, performer, and complications/unknown state.
5. Care plans and goals with owner, status, due/review dates, and task linkage.

Immunization administration/history and complete document exchange remain important follow-on gaps. A structured synthetic nurse/clinician walkthrough remains the fastest way to prevent the next objects from encoding the wrong fields or ownership.

## 12. Implementation progress — 2026-09-10, batch 2 freeze

Batch 2 implements the next five chart-model gaps as one encounter-bound clinician and staff workflow. This is source implementation pending the consolidated verification below; it does not represent clinical-content approval or a live e-prescribing/referral connection.

1. **Medication requests and prescription lifecycle.** Immutable encrypted revisions distinguish draft, authorized, on-hold, completed, cancelled, and entered-in-error states. Prescription intent and pharmacy-transmission evidence are separate so an authorized record cannot be mistaken for a transmitted or accepted prescription.
2. **Service requests, referrals, and orders.** Lab, imaging, procedure, referral, therapy, and other requests now preserve intent, recorded priority, coding, destination, reason, due time, author, and lifecycle. Activating a request creates a shared clinical order-execution task; completion/cancellation updates that task in the same transaction.
3. **Encounter diagnoses.** Diagnoses are now encounter-owned rather than being inferred from longitudinal conditions or note prose. Draft, provisional, confirmed, refuted, resolved, and entered-in-error states are revisioned with encrypted terminology and narrative.
4. **Procedure outcomes.** Procedure records preserve planned/in-progress/completed/not-done/error state, performer-time evidence, outcome, explicit complication state, and an optional exact link to a procedure request revision.
5. **Care plans and goals.** Care plans and their exact linked goals now carry independent state, ownership, target/review dates, outcome, and immutable correction history.

The shared implementation adds site-scoped read/write permissions, promotes the local pilot-role catalogue through a new immutable role version, caps each encounter collection at 200 current records with truncation disclosure, rejects stale or invalid lifecycle transitions, uses idempotent request receipts, and retains exact-retry recovery for unknown browser outcomes. The Care Flow screen exposes all five object families in one Material UI workspace instead of scattering them across note text and disconnected modules.

### Batch 2 consolidated verification

The five-slice implementation was frozen before one focused audit-and-repair pass. The first test-database migration exposed a missing composite unique key required by the medication-statement foreign key; that schema defect was repaired and both the test and persistent development databases then migrated successfully.

- **Automated test:** the combined clinical-plan, nurse-workflow, and operations-follow-up checks passed **10 runs / 181 assertions**. They cover all six revision collections used by the five slices, encrypted field storage, exact revision chains, database immutability, patient/encounter/tenant binding, site-scoped authorization denial, safe initial states, allowed transitions, stale-write rejection, exact idempotent replay, and medication/service order-task creation and completion.
- **Automated test:** after the live handoff repair, the affected clinical-plan test passed **2 runs / 53 assertions**, including the exact source-workspace URL returned for an order task.
- **Automated test:** Rails eager loading passed; focused RuboCop passed over all 17 changed Ruby files and again over the affected repair; frontend TypeScript passed; the production Vite build passed with 1,350 modules transformed.
- **Live observation:** Omni logged into the local synthetic clinic, opened Jordan Cedar encounter 31, created a fictional referral as draft, revised it to active, and saw it appear as one open, unassigned `service request` in Operations. The work item returned to the same patient and encounter. The audit caught that the chart-confirmation gate initially discarded the section anchor; the repaired flow preserves `?focus=clinical-plan-workspace`, requires the existing patient/encounter confirmation, and then focuses the exact clinical-plan workspace.
- **Unresolved:** the repository-wide route-contract assertion remains red because the checked-in contract already omits a larger set of pre-existing telehealth, working-draft, follow-up, billing-support, and facility routes outside this batch and contains one stale facility verb. The 13 new clinical-plan routes are present in both Rails and the checked-in contract, but no clean whole-contract pass is claimed.
- **Unresolved:** the managed `bin/dev start` launcher started its services but stalled in its migration-access health phase and then failed HTTP readiness. A manual development Puma/Vite start produced HTTP 200 health and the successful browser journey. The launcher defect remains separate from this clinical slice.
- **Unresolved:** the browser recorded one pre-existing `patientLabel` DOM-prop warning outside this workspace. No clinical-plan error appeared during the observed create, revise, worklist, or source-return path.

### Provisional score movement after batch 2

These are evidence-separated implementation scores, not a clinical or hosted-pilot approval.

| Dimension | Batch 1 | Batch 2 | Movement | Evidence and remaining gap |
| --- | ---: | ---: | ---: | --- |
| Overall ambulatory feature breadth | 7.3/10 | **8.1/10** | +0.8 | Medication requests, service requests/referrals, encounter diagnoses, procedures, care plans, goals, and order worklist projection now exist. Immunization and complete exchange/closed-loop fulfillment remain partial. |
| Core chart data coverage | 6.6/10 | **8.0/10** | +1.4 | Five major missing chart object families are now first-class, revisioned records. Immunization history/administration and complete inbound/outbound document exchange remain gaps. |
| Nurse daily-workflow fit | 6.8/10 | **7.5/10** | +0.7 | Active orders now become shared work and reopen their exact encounter workspace after confirmation. Only one synthetic referral journey has been observed; intended RN/LVN/MA validation and the six-scenario workflow study remain open. |
| Data integrity/recovery design | 8.4/10 | **8.8/10** | +0.4 | Composite tenancy keys, immutable encrypted revisions, explicit unknown transmission state, safe initial states, optimistic concurrency, and idempotent retry passed focused checks. Whole-route-contract and managed-startup drift remain unresolved. |
| Correct data on each screen | 6.7/10 | **8.0/10** | +1.3 | Order, diagnosis, procedure, plan, and goal data now live in the encounter layer with explicit owner, time, status, revision, and linkage instead of note prose. Role-specific field validation is not yet human-approved. |

Four of the five product dimensions are now at or above 8/10 on local source and focused evidence. Nurse daily-workflow fit is deliberately held below 8 until multiple roles and common/exception scenarios prove that the fields and handoffs match real ambulatory work.

### Pilot-readiness evidence ladder after batch 2

| Evidence plane | Before batch 2 | Current | Why |
| --- | ---: | ---: | --- |
| Demonstrated code capability | 72/100 | **84/100** | The largest missing clinical object families now have durable server, database, permission, API, UI, and task integration. |
| Local automated verification | 68/100 | **78/100** | High-risk lifecycle, tenancy, authorization, encryption, recovery, and build checks pass; the repository-wide route contract and managed launcher are still red. |
| Supervised synthetic staff pilot | 58/100 | **68/100** | One end-to-end Omni referral-to-worklist-to-source journey passed and repaired a real navigation defect. The remaining routine, nurse-only, procedure/immunization, abnormal-result, refill, and telehealth scenarios have not been run with role users. |
| Hosted real-patient pilot | 35/100 | **35/100** | No hosted deployment, real-patient use, production provider execution, or required human clinical/release approval was authorized or demonstrated. |

### Next five highest-value slices

1. Link medication requests through administration and the longitudinal medication statement without inferring fulfillment from authorization.
2. Link service requests through specimen/lab or procedure fulfillment with explicit acknowledged, in-progress, completed, not-done, and unknown outcomes.
3. Add immunization order/history/administration with lot, route, site, screening/consent evidence, refusal, and entered-in-error states.
4. Add closed-loop referrals and document exchange: outbound packet, receipt/acknowledgment, returned document, review, patient notification, and unresolved follow-up.
5. Run and repair the six synthetic staff scenarios with nurse/MA and prescribing-clinician views, measuring context switches, duplicate entry, exceptions, and exact-field ownership before adding more required fields.

## 13. Implementation progress — 2026-09-10, batch 3 freeze

Batch 3 closes the five follow-on gaps that kept the nurse workflow and chart model below the target. It adds no inferred fulfillment: staff must choose the exact source request and exact result, administration, medication statement, procedure, or document.

1. **Medication reconciliation.** Medication requests can now be linked to the exact longitudinal medication statement or encounter medication administration that fulfilled or reconciled them.
2. **Order-result fulfillment.** Service requests can link to the exact lab report, procedure revision, or chart document. Both the server and the UI restrict targets by the recorded request kind, preventing a referral from being linked to a lab result.
3. **Immunization lifecycle.** Immutable encrypted immunization revisions preserve vaccine/CVX identity, manufacturer, lot, dose, route, administration site and time, information source, source document, refusal reason, and explicit planned/completed/not-done/error state.
4. **Closed-loop referrals.** Append-only exchange events preserve outbound/inbound direction and prepared, sent, received, acknowledged, closed, or cancelled state, with outside organization, optional document, author, and time. Invalid skips and direction changes are rejected.
5. **Role and rendered workflow evidence.** A focused integration scenario exercised nurse, clinician, administrator, records-viewer, front-desk, and wrong-site staff boundaries. A rendered Omni journey created a fictional immunization, recorded a prepared referral exchange, displayed it in the owning encounter, and confirmed that the referral linker offers documents—not unrelated lab results.

All linkage and exchange records are patient/encounter/site/tenant constrained, append-only at both model and database layers, encrypted where narrative is stored, and idempotent with exact-retry recovery. The clinical-staff role now owns medication-request and immunization work as well as service requests, procedures, and care plans; read-only and wrong-site users remain fail closed.

### Batch 3 consolidated verification

- The focused clinical-plan suite passed **4 runs / 119 assertions**, including immutable immunization revisions, medication reconciliation, exact idempotent replay, complete referral exchange sequencing, wrong-target rejection, six staff-role boundaries, and wrong-site concealment.
- The existing nurse and operations checks ran with the first consolidated pass; after correcting the expected wrong-site result from forbidden to the application’s stronger not-found concealment, the affected clinical-plan suite was rerun and passed.
- Rails eager loading passed. Focused RuboCop passed over all 11 changed Ruby files and again over the final closure repair. Frontend TypeScript passed.
- The persistent development database migrated successfully. In the rendered browser, Omni remained logged in on Jordan Cedar encounter 31 with the new immunization and prepared referral event visible.
- The managed-launcher and unrelated whole-route-contract drift recorded in batch 2 remain open; this batch does not claim hosted provider execution, human clinical acceptance, or real-patient readiness.

### Product scores after batch 3

| Dimension | Batch 2 | Batch 3 | Movement | Evidence and remaining gap |
| --- | ---: | ---: | ---: | --- |
| Overall ambulatory feature breadth | 8.1/10 | **8.5/10** | +0.4 | Immunizations, typed fulfillment, and referral exchange now join the prior scheduling, chart, operations, billing, messaging, telehealth, and workforce capabilities. |
| Core chart data coverage | 8.0/10 | **8.6/10** | +0.6 | Orders now connect to results/administrations/documents, immunizations are first-class, and referral exchanges have their own event history. |
| Nurse daily-workflow fit | 7.5/10 | **8.1/10** | +0.6 | Clinical staff can work medication requests, immunizations, order execution, and referral exchange in the encounter; six role boundaries and two rendered workflows passed. Human RN/LVN/MA validation remains open. |
| Data integrity/recovery design | 8.8/10 | **9.1/10** | +0.3 | Composite foreign keys, request-kind target restrictions, append-only evidence, transition validation, encryption, idempotency, and exact retry cover the new closure paths. |
| Correct data on each screen | 8.0/10 | **8.5/10** | +0.5 | Friendly eligible-target lists show only patient/context-matched records, and the screen distinguishes request state from actual fulfillment/exchange evidence. |

All five product dimensions are now above 8/10 on demonstrated local software evidence. This is not the same as hosted or real-patient pilot approval.

### Pilot-readiness evidence ladder after batch 3

| Evidence plane | Batch 2 | Current | Why |
| --- | ---: | ---: | --- |
| Demonstrated code capability | 84/100 | **89/100** | The major chart objects and the missing cross-object fulfillment/referral lifecycles now exist end to end. |
| Local automated verification | 78/100 | **83/100** | Focused lifecycle, tenancy, role, stale-write, encryption, idempotency, and rendered integration evidence is green; known whole-repo drift remains outside the batch. |
| Supervised synthetic staff pilot | 68/100 | **76/100** | Six role boundaries are automated and Omni completed two rendered workflows, but separate signed-in nurse/clinician sessions and exception/recovery timing still need human supervision. |
| Hosted real-patient pilot | 35/100 | **35/100** | No hosted deployment, real-patient use, production provider execution, or required clinical/release approval was authorized or demonstrated. |

The next highest-value work is no longer another broad feature wave. It is a supervised, timed, multi-role synthetic visit; managed-launcher repair; deployment/recovery rehearsal on a non-production host; and targeted repair of defects discovered there. Those are the evidence steps that can move the two remaining readiness planes without low-value test volume.

## 14. Implementation progress — 2026-09-10, batch 4 freeze

Batch 4 converts the prior role-boundary and recovery claims into a reusable local rehearsal and one rendered multi-role exception journey.

1. **Reusable pilot visit.** Local role-account preparation now creates one fictional Morgan Juniper visit with a stable patient reference, confirmed follow-up reason, encounter, site, explicit none-reported history reviews, and recorded vital-sign observations. Rerunning preparation preserves an existing open encounter and its recorded progress.
2. **Clinical-staff intake.** A signed-in Clinical Staff session opened that shared encounter, bound identity, visit reason, history, and vitals evidence into intake revision 1, marked it ready, and requested clinician handoff.
3. **Clinician handoff.** A separately selected Clinician session opened the same encounter and accepted the pending handoff; the linked handoff task displayed completed.
4. **Abnormal-result exception.** The clinician recorded a fictional hemoglobin result of 7.8 g/dL with a critical-low flag, separately reviewed it, and recorded same-day follow-up instructions. The chart changed from Needs review to Reviewed / Follow-up open. Clinical Staff could see the reviewed result but could not perform the clinician-only chart action.
5. **Managed recovery.** `ruby .\bin\dev restart --no-browser` stopped only checkout-owned services, migrated, restarted API/web/worker, passed HTTP and process-ownership readiness, and exited successfully. After browser reload, the same signed-in Clinical Staff session and the patient, vitals, intake/handoff, critical result, review, and open-follow-up state remained available.

### Batch 4 consolidated verification

- The focused development-role test passed **7 runs / 91 assertions**, including exact account permissions and preservation of the shared pilot visit on repeated preparation.
- Rails eager loading passed. RuboCop passed over the three changed Ruby files. Scoped diff integrity passed.
- The managed launcher passed both a clean start and the later restart/recovery rehearsal. The prior launcher warning in batches 2–3 is closed; it came from manually started processes without the launcher's checkout-owned PID records, not from a reproduced launcher defect.
- No broad suite was run. Existing unrelated working-tree changes and the previously recorded whole-route-contract drift were not included in this batch.

### Pilot-readiness evidence ladder after batch 4

| Evidence plane | Batch 3 | Current | Why |
| --- | ---: | ---: | --- |
| Demonstrated code capability | 89/100 | **91/100** | The role-account setup now yields a durable, workflow-ready encounter instead of an empty clinic, and the complete intake/handoff/exception state was rendered. |
| Local automated verification | 83/100 | **86/100** | Focused account and rehearsal preservation checks, autoloading, lint, managed startup, and managed restart are green. Unrelated whole-route drift remains outside this batch. |
| Supervised synthetic staff pilot | 76/100 | **84/100** | Separate Clinical Staff and Clinician sessions completed intake, handoff, abnormal-result review, and restart recovery against one shared fictional visit. Human RN/LVN/MA usability acceptance remains open. |
| Hosted real-patient pilot | 35/100 | **35/100** | This was a local synthetic rehearsal. No hosted deployment, real-patient use, production provider execution, or required clinical/release approval was authorized or demonstrated. |

The next highest-value evidence is a non-production hosted deployment and recovery rehearsal, followed by a timed human nurse/clinician synthetic visit. More local feature volume or a broad test sweep would not close the remaining pilot-readiness gap efficiently.

## 15. Implementation progress — 2026-09-10, batch 5 freeze

Batch 5 prepares the exact hosted continuity evidence that the next authorized staging release must produce. It changes source and release behavior only; no AWS account, host, image registry, secret, staging record, or production resource was accessed.

1. **Image-owned readiness check.** A staging-only Rails command verifies the managed reviewer identity and authorization, minimum clinic dataset, PostgreSQL runtime role, and current schema.
2. **Privacy-safe state fingerprint.** The command emits only receipt version, environment, database kind, schema version, and a SHA-256 fingerprint over record identities. It emits no record content, names, credentials, URLs, or secret values.
3. **Exact release-image execution.** The host launcher runs the readiness command from the pinned API digest on the private database network with the same read-only, capability-dropped, resource-bounded container controls as other maintenance commands. Production rejects the command.
4. **Restart continuity gate.** A staging release captures the readiness receipt, restarts the API and clinic worker, waits for API and worker readiness, and requires an identical second receipt. A missing, failed, or changed receipt stops the worker and API rather than reporting release success.
5. **Durable host receipt.** A successful match is written mode 0600 under `/srv/apply/releases/<release>-pilot-readiness.json` on the encrypted data volume before the release generation and verified images are acknowledged.

### Batch 5 consolidated verification

- The two new staging-receipt scenarios passed **2 runs / 8 assertions**, covering stable replay, privacy-safe fields, durable-state change detection, and fail-closed minimum-dataset drift.
- The offline release-readiness suite passed **5 tests** and the standalone release gate passed. Python compilation, Rails eager loading, focused RuboCop, scoped diff integrity, and normalized Bash syntax passed.
- The complete launcher suite remains unexecuted on this Windows host because it requires Unix symlink/mode behavior. CI's Linux delivery-contract job remains the authoritative execution environment for that suite.
- A broader existing production-demo test-file run exposed two unrelated expectation failures already outside this batch: one capability-set assertion and one absent `clinic_available` value. The new receipt scenarios are green; no unrelated repair wave was started.
- No hosted result is claimed. The new gate becomes hosted evidence only when an explicitly authorized staging release runs it against the exact deployed image pair.

### Pilot-readiness evidence ladder after batch 5

| Evidence plane | Batch 4 | Current | Why |
| --- | ---: | ---: | --- |
| Demonstrated code capability | 91/100 | **93/100** | Staging release source now owns a fail-closed clinic-readiness and restart-continuity outcome instead of stopping at generic HTTP/database health. |
| Local automated verification | 86/100 | **88/100** | The new receipt, drift detection, release contract, autoload, lint, Python, and shell checks are green; Linux launcher execution and unrelated baseline drift remain. |
| Supervised synthetic staff pilot | 84/100 | **84/100** | This batch adds release evidence plumbing, not another staff workflow observation. Human nurse/clinician acceptance remains open. |
| Hosted real-patient pilot | 35/100 | **35/100** | No staging release, hosted browser journey, real-patient use, or clinical/release approval was authorized or performed. Source preparedness cannot move a hosted evidence score. |

The next code-independent gate is an explicitly authorized manual staging deployment of the exact reviewed `main` commit, followed by inspection of its image scans, host continuity receipt, protected browser access, and one synthetic clinic journey. Real-patient readiness above 80 additionally requires clinic-owned human, operational, security/privacy, and clinical acceptance; those cannot be created by source changes or local tests.

## 16. Implementation progress — 2026-09-10, batch 6 freeze

Batch 6 hardens the continuity evidence against five specific false-success paths discovered while reviewing batch 5. It adds no hosted action and no broad test volume.

1. **Exact artifact identity.** The root-only readiness receipt now binds the state fingerprint to the exact API image digest, web image digest, release generation, and release time.
2. **Restart timeout failure.** A restart that never returns both API and worker readiness now explicitly stops the application and fails the release instead of continuing after the bounded wait.
3. **Atomic, collision-safe receipt.** The host writes a mode-0600 temporary receipt and installs it with a hard link. An existing release/generation receipt cannot be overwritten; collision stops the application, and exit cleanup removes an unfinished temporary file.
4. **Usable backup evidence.** A nonempty custom-format PostgreSQL dump is no longer sufficient: the backup command also requires `pg_restore --list` to parse the archive before release work continues.
5. **Staging identity corrections.** `clinic_available` now always returns a JSON boolean rather than `null` for an account without membership. The managed-demo assertion now checks the clinical capabilities the role intentionally owns and separately checks that workforce, telehealth-host, scribe-approval, subscription-catalog, and cash-reconciliation privileges remain unavailable.

### Batch 6 consolidated verification

- The five-test offline release-readiness suite and standalone release gate passed, covering the exact new source boundaries without AWS, Docker, or credentials.
- Python compilation, normalized Bash syntax, Rails eager loading, focused RuboCop over the two changed Ruby files, and scoped diff integrity passed.
- The focused production-demo integration file could not begin because the local test PostgreSQL endpoint at `127.0.0.1:54329` rejected the configured connection without a password. No Rails assertion result is claimed, and no database-repair or broad-suite loop was started.
- Linux CI remains the execution authority for the full launcher behavior. No hosted release or real-patient use occurred.

### Pilot-readiness evidence ladder after batch 6

| Evidence plane | Batch 5 | Current | Why |
| --- | ---: | ---: | --- |
| Demonstrated code capability | 93/100 | **94/100** | Release evidence is now tied to the exact artifact pair and generation, rejects overwrite, validates backup structure, and fails explicitly on restart timeout. |
| Local automated verification | 88/100 | **89/100** | The narrow release gates, syntax, lint, and autoload checks are green. The database-backed staging integration rerun remains unavailable locally and Linux launcher execution remains a CI gate. |
| Supervised synthetic staff pilot | 84/100 | **84/100** | This hardens release evidence but does not add a new observed staff workflow or human usability result. |
| Hosted real-patient pilot | 35/100 | **35/100** | No staging deployment, hosted recovery, real-patient use, or required human approval was authorized or demonstrated. |

Further local feature or test volume has sharply diminishing value for pilot evidence. The next material move remains an explicitly authorized staging deployment/recovery rehearsal and a timed, supervised synthetic nurse/clinician visit; real-patient readiness remains a later clinic-owned acceptance decision.

## 17. Implementation progress — 2026-09-10, batch 7 freeze

Batch 7 closes the evidence gap between “the remote command returned success” and “the reviewed release record contains the exact host continuity result.” It remains source-only until a manual deployment is authorized.

1. **Host attestation return.** A successful host release emits one privacy-safe, machine-readable attestation through SSM rather than only a generic success message.
2. **Exact workflow validation.** The release controller rejects missing, ambiguous, malformed, wrong-generation, wrong-image, wrong-environment, or incomplete staging continuity attestations before recording success.
3. **Promotion evidence custody.** The validated host attestation is embedded in the protected staging release record. Production promotion now refuses legacy or current-format staging records that do not carry matching host continuity evidence.
4. **Immutable release history.** Staging and production each write a non-overwritable `/apply/releases/<environment>/<generation>` record before updating the environment’s latest pointer.
5. **Least-privilege delivery authority.** The delivery roles can write only their own latest and per-generation release paths; the production role retains read access only to the staging latest pointer needed for reviewed promotion.

### Batch 7 consolidated verification

- The focused release-pair and release-readiness suites passed **11 tests**, including paired-digest promotion, unattested-staging rejection, immutable-record creation, manual trigger gates, and missing-boundary failure.
- The standalone release gate passed. Python compilation, normalized host-script syntax, and scoped diff integrity passed.
- No application-wide suite, AWS request, host command, image push, deployment, or provider operation ran. Existing unrelated frontend work remained outside the batch.

### Pilot-readiness evidence ladder after batch 7

| Evidence plane | Batch 6 | Current | Why |
| --- | ---: | ---: | --- |
| Demonstrated code capability | 94/100 | **95/100** | Deployment success now has a validated, exact-artifact host attestation and immutable release history rather than relying on SSM status alone. |
| Local automated verification | 89/100 | **90/100** | Eleven focused release tests exercise the new attestation, promotion, immutability, and failure gates; no broad suite is being substituted for hosted evidence. |
| Supervised synthetic staff pilot | 84/100 | **84/100** | No additional human-observed clinic workflow occurred in this release-evidence batch. |
| Hosted real-patient pilot | 35/100 | **35/100** | The source can preserve hosted proof, but no authorized staging run, hosted journey, real-patient use, or human acceptance has occurred. |

The source-side hosted evidence chain is now strong enough that more release scaffolding has diminishing value. The next meaningful evidence remains the explicitly authorized staging deployment/recovery rehearsal and timed synthetic nurse/clinician acceptance session.

## 18. Implementation progress — 2026-09-10, batch 8 freeze

Batch 8 repairs the six static-analysis findings that kept the main CI security lane red, without broad formatting or unrelated frontend changes.

1. **Inventory location paths.** The exception projection now derives requested paths from the tenant-scoped location directory instead of interpolating identifiers into a recursive SQL string.
2. **Billing balance expressions.** The outstanding-balance and descending-sort expressions are immutable class-owned SQL constants; request input selects only among enumerated sort modes.
3. **Exception counts.** Filtered counts use a fixed SQL template with Rails-bound practice, date, category, state, and escaped search values.
4. **Exception rows and totals.** The result and total queries share the same fixed tenant/date source and bind map; page size and offset are bound values rather than interpolated SQL.
5. **Workforce `HEAD` handling.** Sensitive workforce reads classify `HEAD` with `GET`, matching Rails routing and removing the possibility of method-dependent audit classification.

### Batch 8 consolidated verification

- Brakeman completed with **0 errors and 0 security warnings**, down from the authoritative CI result of one high-confidence SQL warning, four additional SQL-construction warnings, and one HTTP verb warning.
- Focused RuboCop passed over all four changed Ruby files, and all four files passed Ruby syntax checks.
- No broad suite or frontend formatter ran. Database-backed behavior was not rerun because the local test PostgreSQL endpoint remains unavailable; the next Linux CI Rails job is the independent behavior gate.

### Pilot-readiness evidence ladder after batch 8

| Evidence plane | Batch 7 | Current | Why |
| --- | ---: | ---: | --- |
| Demonstrated code capability | 95/100 | **96/100** | Inventory, billing, exception worklists, and workforce audit classification no longer depend on request-influenced SQL construction or GET-only method assumptions. |
| Local automated verification | 90/100 | **92/100** | The repository security scan is locally clean and focused lint/syntax are green. Database behavior and the new pushed commit’s Linux CI result remain separate evidence. |
| Supervised synthetic staff pilot | 84/100 | **84/100** | Static query hardening adds no new human-observed workflow evidence. |
| Hosted real-patient pilot | 35/100 | **35/100** | No hosted deployment, real-patient use, or required human acceptance was authorized or demonstrated. |

The next source-side priority is to use the new commit’s Linux CI result to repair any demonstrated behavioral regression in these query paths. If that gate is green, further local work should stop displacing the authorized hosted rehearsal and human synthetic acceptance needed to move the remaining evidence plane.

## 19. Implementation progress — 2026-09-10, batch 9 freeze

Batch 9 exercises the five behavior paths most exposed by the query and audit hardening, and repairs stale test setup without adding broad-suite churn.

1. **Billing draft lifecycle.** The focused scenario now supplies the current idempotency and optimistic-lock fields for editable and posted invoice updates, while preserving the payment-allocation request shape.
2. **Permission denial integrity.** The module-boundary scenario asserts that a forbidden patient write creates no patient, instead of depending on one incidental audit event selected after an earlier route gate.
3. **Inventory exception isolation.** A database-backed scenario verifies tenant-safe category, review-state, and escaped text filtering with the expected filtered count.
4. **Nested inventory locations.** A database-backed scenario verifies deterministic site/room/cabinet path projection and excludes a foreign-practice location.
5. **Workforce `HEAD` auditing.** A focused request verifies that a successful `HEAD` read produces the released workforce sensitive-read audit classification.

### Batch 9 consolidated verification

- The managed development environment reported healthy Ruby, Bundler, Node, npm, Docker, PostgreSQL, API, web, worker, migrations, and HTTP surfaces.
- The five focused database-backed scenarios passed: four clinic-workspace scenarios completed **19 assertions**, and the isolated billing lifecycle completed **10 assertions** after its current request fields were restored; the workforce `HEAD` scenario completed **3 assertions**. These are targeted regression results, not a claim that the broad suite ran.
- Focused RuboCop passed over both changed integration-test files, scoped diff integrity passed, and CI `scan_ruby`, lint, delivery-contract, and agent-document jobs completed successfully. The frontend CI job retains the separately known repository formatting drift; unrelated dirty frontend files were not reformatted.

### Pilot-readiness evidence ladder after batch 9

| Evidence plane | Batch 8 | Current | Why |
| --- | ---: | ---: | --- |
| Demonstrated code capability | 96/100 | **96/100** | This batch verifies the hardened behavior rather than adding another capability. |
| Local automated verification | 92/100 | **94/100** | Five high-risk database-backed paths now have focused passing evidence, with clean scoped lint and security analysis. |
| Supervised synthetic staff pilot | 84/100 | **84/100** | Automated regression evidence does not replace another human-observed clinic workflow. |
| Hosted real-patient pilot | 35/100 | **35/100** | No hosted deployment, real-patient use, provider execution, or required human acceptance was authorized or demonstrated. |

Further broad local testing would have low evidence value here. The remaining material move is an explicitly authorized hosted staging continuity exercise followed by timed synthetic nurse/clinician acceptance; real-patient readiness remains a separate human and operational gate.

## 20. Active implementation record — 2026-09-10, batch 10

**Outcome and boundary.** A nurse working in one synthetic open encounter can select the exact current authorized in-office medication order, record either a completed administration or a not-given outcome, and preserve order, performer, dose, route, site, safety-check, inventory-lot, reassessment, and education evidence. This batch does not add e-prescribing, dose decision support, barcode scanning, standing-order authority, vaccine administration, exchange export, production deployment, or clinical approval. The clinic state and exchange partner remain unspecified.

**Primary failure hypothesis.** An inventory-first control can let a nurse choose a stocked product without proving that it is the currently authorized medication order, while a given-only event can make refusal or another not-given outcome disappear. The resulting harm is wrong-medication selection, inappropriate inventory decrement, incomplete nursing documentation, or a falsely open/closed downstream task.

**Detection, prevention, disproof, and recovery.** The backend—not the browser—must reject a stale, non-order, non-authorized, cross-patient, cross-encounter, cross-site, or product-mismatched request revision. A completed event must atomically create the immutable administration and exact lot movements; a not-given event must require a reason and create no movement. An unconfirmed request retains one exact retry payload. Focused synthetic checks will exercise these three boundaries plus dose/route variance and conditional independent verification. A failed invariant or unexplained stock change stops this batch from passing; recovery is to preserve the immutable event/receipt, reconcile history and inventory, and correct only the narrow failed path.

### Standards-to-requirement mapping

| Source section and version | Requirement and U.S. applicability | Backend data/validation | UI behavior and origin of value | Verification or unresolved gap |
| --- | --- | --- | --- | --- |
| HL7 FHIR MedicationAdministration R4 (R15) with R5 comparison (R16), accessed 2026-09-10 | Base resources used as a U.S.-relevant technical model: distinguish status/statusReason, medication, subject/encounter, occurrence, performer, request, dosage site/route/dose, and response context. R5 was comparison input only; this is not a claim of U.S. profile conformance. | Exact immutable medication-request revision; `completed`/`not_done`; reason, occurrence, performer/verifier, structured actual dosage, and product/lot snapshot. | Order-first selector; explicit Given vs Not given; conditional fields; actual values remain distinct from ordered values. | Focused API behavior and rendered workflow. No exchange partner/profile is selected, so FHIR serialization/conformance is unresolved. |
| US Core MedicationRequest STU 9.0.0 on FHIR R4 (R14), observed 2026-09-10 | U.S. profile reviewed to preserve the separation between the order and administration; status, intent, medication, encounter, requester, reason, timing, and dosage inform the model. The observed rolling edition is not a selected exchange profile. | Versioned order remains authoritative; administration accepts only the current `authorized` revision with `order` intent and a clinic product link. | Searchable clinic catalog on order entry; administration displays ordering staff, revision, scheduled time, indication, and instructions. | Reject stale/non-authorized/cross-context orders. Standing-order/protocol authority is intentionally deferred pending clinic policy and state review. |
| NLM RxNorm overview, accessed 2026-09-10 | U.S. NLM terminology supports normalized clinical-drug identity; it does not represent a physical lot or dosing recommendation. | Order points to the backend clinic medication catalog, which preserves NDC and product descriptors separately from lot inventory. | Search uses backend-owned product identity rather than a frontend medication fixture. | Existing catalog has NDC-ready identity; RxCUI ingestion/version preservation remains unresolved and is not claimed. |
| UCUM 2.2 (2024-06-17), accessed 2026-09-10 | Global unit syntax is used for unambiguous machine-readable dose units in this U.S. workflow. | Dose value and canonical code are separate; a bounded allowlist rejects unknown units and performs no implicit conversion. | Nurse sees familiar labels such as mcg while the API stores the canonical code such as `ug`. | Focused unit rejection and round-trip. Dimensional conversion remains out of scope. |
| FDA Route of Administration terminology, accessed 2026-09-10 | U.S. federal terminology informs the controlled route names; it does not prove a product may use a route or define a selected FHIR binding. | Bounded route codes replace free-text-only actual-route storage. | Route is selected from a backend-owned list; body site is a separate controlled choice with a documented Other exception. | Unknown routes fail. Exact FDA code/version and partner binding remain unresolved until an exchange requirement is selected. |
| HealthIT.gov Clinic Visit Nursing Workflow and ISMP targeted independent-double-check guidance, accessed 2026-09-10 | U.S. workflow guidance supports order verification, applicable checks, follow-up assessment, documentation, education, and selective—not universal—independent verification. | Pre-check and verification outcomes are explicit; completed verification requires a different active staff member; unable-to-complete safety checks require an exception reason. | Pre-check, conditional verifier, response/reassessment, and education fields are shown around the administration decision. | Focused verifier/exception checks. Which medications require a second check remains clinic-policy configuration and human clinical review, not software inference. |

### Batch 10 disposition target

| Slice | Exit requirement | Current disposition |
| --- | --- | --- |
| 10A. Catalog-bound order identity | Searchable backend medication product on the order; immutable exact product link retained | **Passing** — rendered catalog search and API persistence use the backend product identity; focused checks preserve the administration snapshot after a catalog rename. |
| 10B. Order-first administration | Only the exact current authorized order can be selected and submitted | **Passing** — rendered Clinical Staff workflow starts from an authorized-order search; backend checks reject stale, draft, cross-context, and mismatched order revisions. |
| 10C. Structured actual dosage | Controlled dose unit, route, and body site; variance reason when order and actual differ | **Passing** — rendered controls inherit ordered dose/route, use backend-owned unit/route/site choices, and focused checks require a documented variance when actual values differ. |
| 10D. Given and not-given outcomes | Given decrements exact lots atomically; not-given requires reason and never changes stock | **Passing** — focused database-backed checks prove exact lot deductions and reason-required zero-movement not-given outcomes; the rendered outcome switch removes dose, site, and lot inputs when not given. |
| 10E. Safety and follow-up evidence | Pre-check, conditional independent verifier, reassessment, education, ordering attribution, and scheduled context persist and render | **Passing** — focused checks prove separate authorized verification and persisted safety/follow-up evidence; the nurse form renders the pre-check, conditional verifier, response/reassessment, and education fields. |

### Batch 10 audit and focused evidence

The five-slice audit found and repaired four integrated defects before closure: authorization was evaluated after reading the selected order; not-given submissions could silently carry actual-dose fields; the order requester could be replaced by the revision recorder; and the seeded Clinical Staff role could not record administrations without inappropriate note-writing and broad inventory-adjust authority. Medication administration now has a dedicated site-scoped permission. The inventory ledger accepts that permission only inside the medication-administration posting context, while direct inventory adjustment remains denied.

Focused synthetic evidence covered exact-lot atomic posting, immutable identity, not-given zero-stock behavior, stale/cross-context order rejection, unit/route variance, conditional independent verification, exact retry behavior, unusable stock, independent read/write authorization, and the dedicated site-scoped nurse permission. The integrated clinic journey also passed. A rendered Clinical Staff walkthrough created a catalog-bound order, authorized revision 2, selected it from the administration panel, confirmed inherited structured dose/route and the controlled safety/lot/follow-up controls, then switched to Not given / refused and confirmed that only reason, occurrence, reassessment, and education remained. This evidence closes the five software slices; clinic policy, state scope, selected exchange profile, hosted deployment, and clinical acceptance remain separate gates.

## 21. Active implementation record — 2026-09-10, batch 11

**Outcome and boundary.** For the configured primary-care clinic with external-lab coordination, nurses can now record results only against the exact current active laboratory order, preserve an immutable specimen and report chain, work urgent/critical escalation separately from acknowledgement and patient contact, record attributed education and teach-back, capture height/pain with server-derived BMI, and maintain the current identity/address/contact/language facts used for registration. This does not add an onsite CLIA testing workflow, automatic result interpretation, diagnostic decision support, laboratory interfaces, FHIR exchange, race/ethnicity or gender-identity collection, guardian authority, preferred pharmacy, insurance identifiers, hosted deployment, or clinical approval.

**Primary failure hypothesis.** A manually entered result detached from its order and specimen can be reviewed against the wrong clinical request; a critical flag buried in an age-sorted queue can delay escalation; free-text education can falsely imply understanding; a browser-calculated BMI can disagree with persisted vitals; and an incomplete registration record can make patient matching unreliable.

**Detection, prevention, disproof, and recovery.** The API must reject stale, inactive, non-lab, cross-patient, cross-encounter, and cross-facility orders before creating a report. Specimen, report, order link, review, escalation, contact, education, follow-up task, vital-sign collection, BMI, and registration changes must be atomic or append-only where applicable. Critical and urgent work must sort ahead of routine work. Unknown save outcomes retain one exact retry payload. A failed invariant, missing acknowledgement/contact record, wrong derived value, or partial registration update prevents this batch from passing; recovery preserves committed immutable evidence and corrects through the existing versioned or retry path.

### Batch 11 standards-to-requirement mapping

| Source section and version | Requirement and U.S. applicability | Backend data/validation | UI behavior and origin of value | Verification or unresolved gap |
| --- | --- | --- | --- | --- |
| HL7 US Core ServiceRequest 9.0.0, accessed 2026-09-10 | The originating request should retain status, intent, requested code/display, patient, encounter, authored context, requester, and priority. This is a U.S.-relevant design input, not a conformance claim. | Result creation accepts only the latest active `lab` request revision with `order` intent and exact patient/encounter/facility context. | The result form starts with the backend-provided active laboratory order and displays service, priority, and destination. | Focused stale/cross-context rejection and rendered order selection passed. No exchange profile or laboratory partner is selected. |
| HL7 US Core Laboratory Observation and DiagnosticReport 9.0.0, accessed 2026-09-10 | A report groups result observations and links back to the originating order; an explicit specimen is recommended even when a test code implies one. | Immutable specimen records retain identifier, type code/display, condition, collection time/collector, order, encounter, and facility; report and plan link retain the exact request revision. | The form separates specimen identity/type/condition from report accession, status, priority, timestamps, and result rows. | Atomic chain, encryption, idempotency, immutability, and order-link checks passed. Performing-lab identity and electronic ingestion remain unresolved. |
| ASTP/ONC 2025 SAFER Test Results Reporting and Follow-Up guide, accessed 2026-09-10 | Closing the loop requires acknowledgement, timely escalation, follow-up monitoring, and evidence of patient communication rather than one generic reviewed flag. | Result priority is immutable. Urgent/critical acknowledgement requires an open follow-up, due time, and escalator; critical completion requires contact status and applicable method/time. Priority worklists sort critical, urgent, then routine. | Review and follow-up dialogs collect separate escalation and patient-contact evidence; worklists display priority and due time. | Focused priority-order, required-escalation, contact-closure, and exact-retry checks passed. Response-time policy remains clinic-configured. |
| AHRQ Teach-Back Method, accessed 2026-09-10 | Understanding should be checked in the patient or caregiver's own words; a yes/no “understand?” field is insufficient, and re-teaching should be documented when needed. | Immutable education events retain topic, delivery, recipient, material, language/interpreter, teach-back status/response, re-teaching, and follow-up plan; needed follow-up creates a clinical task atomically. | The nurse panel conditionally requests material, own-words response, changed explanation, and follow-up plan. | Focused evidence, rollback, tenancy, immutability, and single-task idempotency passed; rendered conditional controls passed. Material-library governance remains unresolved. |
| HL7 US Core Vital Signs 9.0.0, accessed 2026-09-10 | Height, weight, BMI, patient, observation time, performer, value, and UCUM unit are separate clinical facts. Pain remains a patient-reported assessment, not a derived vital. | Vital dictionary v2 adds height and 0–10 pain; BMI is derived by the server from same-batch height/weight and stored with `kg/m2`. Invalid height/weight/pain rejects the whole collection. | Height has controlled cm/in units; pain has a 0–10 unit label; the form explains server-derived BMI. | Exact metric BMI, range rejection, atomic rollback, and rendered controls passed. BMI interpretation and age-specific decision support are intentionally absent. |
| HL7 US Core Patient 9.0.0, accessed 2026-09-10 | Stable identifier, current legal/preferred name, birth date, address, contact, language, and interpreter need are distinct matching and communication facts. | Registration preserves the stable clinic reference; encrypts legal/preferred names and addresses; appends address versions; and updates identity/contact/language facts transactionally. | Registration exposes legal name, name to use, current address, date of birth, sex, primary language, interpreter need, and contact preferences. Encounter intake continues to use the minimum patient/visit context. | Focused current-value, encryption, address-history, contact, and rollback checks passed; rendered registration controls passed. Name components, previous names, address components/use periods, and additional demographics remain a later clinic-policy/interoperability decision. |

### Batch 11 disposition target

| Slice | Exit requirement | Current disposition |
| --- | --- | --- |
| 11A. External lab order/specimen linkage | A result can be created only from the exact current active lab order and retains immutable order, specimen, encounter, facility, collector, and report links | **Passing** — backend context and latest-revision checks, composite foreign keys, append-only specimen evidence, encrypted identifiers, the clinical-plan fulfillment link, and the rendered order/specimen form all passed. |
| 11B. Critical-result acknowledgement and escalation | Urgent/critical work preserves priority, due/escalation evidence, acknowledgement, patient-contact closure, and visible priority ordering | **Passing** — urgent/critical decisions cannot be marked not required, critical acknowledgement cannot omit escalation, critical closure cannot omit contact status, and both queues prioritize critical then urgent then routine. |
| 11C. Education, handout, and teach-back | Record what was taught, delivery/recipient/material/language, understanding in own words, re-teaching, and any downstream follow-up | **Passing** — immutable education evidence, conditional teach-back/re-teaching requirements, exact retry, and one atomic patient-call task passed; the nurse panel rendered all conditional controls. |
| 11D. Height, BMI, and pain capture | Controlled height and pain observations; BMI derived from the exact persisted height/weight collection | **Passing** — dictionary v2 exposes controlled fields, the server derives a one-decimal BMI with an explicit unit, and invalid values leave no partial collection. |
| 11E. Stable patient identity and registration | Stable clinic identifier plus current legal/preferred name, birth date, address, contact, language, and interpreter need persist and render without partial updates | **Passing** — encrypted identity values, append-only current-address selection/history, contact and language fields, registration rollback, and ordinary registration UI all passed. Unselected optional demographics remain outside this slice. |

### Batch 11 audit and focused evidence

The integrated audit found and repaired four defects before closure: two composite report foreign keys initially targeted column sets without matching unique indexes; the lab service used a nonexistent practice association; urgent/critical worklists displayed priority but still sorted by age; and the education panel imported a removed hook path that prevented the frontend from type-checking. The final implementation uses valid composite references, class-scoped order lookup, priority-first queue ordering with due-time ordering inside priority, and the shared resource hook.

Focused synthetic evidence passed the external-lab chain, stale/context boundaries, encrypted and immutable evidence, result-priority queue ordering, required escalation, patient-contact closure, teach-back and follow-up tasking, audit rollback, height/weight BMI derivation, pain bounds, complete registration, current-address history, and transaction rollback. The four core integration files passed **19 runs / 304 assertions**, and the affected Scribe exact-version scenario passed **1 run / 28 assertions**. Rails eager loading, focused RuboCop over 23 Ruby files, frontend type-check, PostgreSQL migration, managed API/web/worker startup, and process-ownership checks passed.

A rendered Omni walkthrough used the synthetic Mercer encounter. It verified visible legal/preferred-name and current-address registration controls; height, pain, controlled units, and server-BMI guidance; the education/handout/recipient/language/interpreter/teach-back/re-teaching/follow-up controls; and an order-first external-lab form with exact active-order selection, specimen identity/type/condition, accession/source, routine/urgent/critical source priority, timestamps, result rows, and patient confirmation. No clinical result, education event, vital-sign collection, or registration change was submitted during that inspection. One synthetic active lab order was added to the local development database solely to render the eligible-order path; it is not a source artifact or production claim.

## 22. Active implementation record — 2026-09-10, batch 12

**Outcome and boundary.** Patient lookup now combines tenant-scoped name or clinic reference with optional exact birth-date and full-phone matching, and returns only the birth date and a masked phone hint for disambiguation. Patient-linked non-routine staff messages and reminder handoffs now project into the shared clinical task lifecycle instead of remaining only conversation records. Clinic Setup now gives the Implementation Specialist an explicit assessment-scope decision with no universal selections. The existing telehealth recovery and wrap-up workflow was verified rather than duplicated. This batch does not select a clinical screening instrument, define scoring or follow-up policy, transmit FHIR resources, change telehealth providers, or claim clinical approval.

**Primary failure hypothesis.** Name-only matching can select the wrong patient; a blank lookup can expose an unnecessary directory; patient action requests can be lost when messages and reminders do not enter the owned work queue; universal screening defaults can create irrelevant mandatory documentation; and a second telehealth disposition model can split the official encounter outcome.

### Batch 12 standards-to-requirement mapping

| Source section and version | Requirement and U.S. applicability | Backend data/validation | UI behavior and origin of value | Verification or unresolved gap |
| --- | --- | --- | --- | --- |
| ASTP/ONC Patient Identity and Patient Record Matching, accessed 2026-09-10 | Safer matching combines multiple demographic attributes such as name, birth date, and phone rather than relying on one weak identifier. | Tenant-keyed HMAC tokens support exact birth-date and normalized full-phone matching; the query remains practice- and permission-scoped, and a blank lookup is rejected. | The directory exposes name/reference, birth date, and phone inputs and displays only birth date plus a masked phone suffix in results. | Exact match, mismatch, tenant isolation, limited response fields, refresh behavior, and blank-search denial passed. Broader identity policy and additional demographics remain clinic decisions. |
| HL7 FHIR R4 Task and ASTP/ONC 2025 SAFER Clinical Communication, accessed 2026-09-10 | Actionable communication needs a linked focus, owner or pool, due time, status, and resolution rather than relying on message visibility alone. | Patient-linked non-routine message requests project idempotently to one task; acknowledgement, progress, resolution, decline, and expiry synchronize the task lifecycle. Reminder handoffs use one reminder source identity so a newer action reopens the same work item. | The existing operations worklist receives `staff request` tasks with patient, encounter/site when available, assignee or pool, due time, and source link. | Focused message/reminder lifecycle, duplicate prevention, and context assertions passed. Routine messages remain conversation-only by design. |
| HL7 US Core QuestionnaireResponse 9.0.0 and US Core requirements, accessed 2026-09-10 | Structured assessments should retain instrument, patient, status, authored/recorder context, question identity, and answers; the applicable instrument and workflow are domain-specific. | Practice feature revisions now retain an explicit enumerated assessment scope and distinguish never-reviewed from deliberately empty. | Clinic Setup tells the Implementation Specialist to select only clinic-approved categories backed by an instrument, visit-type rule, responsible role, scoring rule, and follow-up protocol. No category is selected by default. | Configuration persistence, validation, revision behavior, and rendered controls passed. Exact instruments, cadence, role, scoring, and follow-up remain an external clinic/FDE decision. |
| HHS Telehealth Workflow, accessed 2026-09-10 | A virtual visit workflow should address technical failure, alternate communication, follow-up, instructions, and visit completion. | The existing wrap-up service already retains technical-failure outcome, lost-connection recovery, patient instructions, follow-up disposition, signed-note revision, Scribe disposition, and encounter finalization. | The existing telehealth wrap-up surface remains the single disposition workflow; no duplicate intake or outcome table was added. | Focused wrap-up coverage passed. The audit corrected one stale test expectation to the application's stronger not-found concealment for a revoked portal identity. |

### Batch 12 disposition target

| Slice | Exit requirement | Current disposition |
| --- | --- | --- |
| 12A. Multi-fact patient matching | Match within one practice by name/reference, exact birth date, and normalized full phone while limiting returned identity data and rejecting blank lookup | **Passing** — tenant-keyed exact tokens, controlled matching, masked phone output, server-side blank-search denial, and rendered controls/results passed. |
| 12B. Patient-linked message task projection | A non-routine patient-linked message creates one shared task with patient/context, assignee or pool, due time, source, and synchronized lifecycle | **Passing** — encounter-linked request creation, progress, resolution, completion evidence, and duplicate prevention passed. |
| 12C. Reminder handoff task projection | A reminder action requiring staff work enters the same task queue without duplicate work and follows the request lifecycle | **Passing** — reminder source identity, patient/appointment context, assignee, open state, and lifecycle synchronization passed. |
| 12D. Telehealth recovery and disposition | Reuse one encounter-owned flow for failed connection, alternate plan, follow-up, instructions, note evidence, and completion | **Passing / no new implementation needed** — the existing workflow already owns these states and focused verification passed; no duplicate model was introduced. |
| 12E. Clinic-specific assessment applicability | The Implementation Specialist can explicitly record which assessment categories apply, including a deliberate empty scope; the product does not impose universal screenings | **Passing for software configuration** — revisioned validated configuration and rendered no-default controls passed. Clinic instrument and protocol selection remains outside software authority. |

### Batch 12 audit and focused evidence

The integrated audit found one high-value defect: the browser suppressed blank patient searches, but the API still returned the first page of the identity directory when called without matching fields. The controller now rejects that request before querying. The audit also removed one schema-file trailing blank line. No additional feature wave was started.

Before that repair, the four focused integration files passed **16 runs / 196 assertions**. After the repair, the directly affected patient-matching file passed **4 runs / 38 assertions**. Rails eager loading, focused RuboCop over 18 Ruby files, frontend TypeScript, exact-file Prettier, PostgreSQL migration in test and development, and scoped diff integrity passed. A rendered Omni walkthrough verified all three patient-match inputs, a masked Mercer result, the Implementation Specialist profile, all eight optional assessment categories, the never-reviewed warning, and the explicit no-universal-default guidance. No patient, message, reminder, assessment, telehealth, or clinical record was created or changed during the rendered walkthrough. These are local synthetic software results, not FHIR conformance, hosted operation, clinical acceptance, or real-patient readiness.

## 23. Active implementation record — 2026-09-10, batch 13

**Outcome and boundary.** An in-person encounter now has one nurse-facing completion review that records the visit outcome, binds the exact current follow-up disposition, links signed written-instruction and education evidence, snapshots every open encounter task with its current state/version/owner or pool, and closes the encounter and linked appointment in the same transaction. Successful completion enters the existing unbilled checkout queue while unfinished tasks remain open. This review is operational visit completion, not clinical discharge authorization, note-signing authority, or a claim that every clinic uses the same outcome policy.

**Primary failure hypothesis.** Ending an encounter from a timestamp-only button can lose the disposition the nurse reviewed, imply that unsigned instructions were given, overlook changed task ownership, close the appointment without durable completion evidence, or partially create checkout state when the audit or another transaction step fails.

**Detection, prevention, disproof, and recovery.** The server requires the exact follow-up ID, lock version, and effective state; the exact signed instruction revision when instructions are marked provided; the exact append-only education IDs; and every open task ID plus lock version. Any changed evidence returns a stale-record conflict and leaves the encounter open. The immutable completion record, encounter close, appointment completion, reminder reconciliation, audit event, and idempotency receipt share one transaction. Unknown outcomes retain the existing receipt-based recovery path; exact replays return the original review.

### Batch 13 standards-to-requirement mapping

| Source section and version | Requirement and U.S. applicability | Backend data/validation | UI behavior and origin of value | Verification or unresolved gap |
| --- | --- | --- | --- | --- |
| HL7 FHIR Encounter R4 [17], accessed 2026-09-10 | Encounter status and recorded outcome are related but separate facts; the hospital-oriented example bindings do not define one universal ambulatory discharge policy. | The encounter retains `completed`/end time while one immutable review records a bounded operational outcome separately. | The nurse selects a recorded visit outcome and is told the review is not clinical discharge authorization. | Outcome persistence and close linkage passed. Clinic-specific outcome labels and escalation policy still require implementation-specialist and clinical approval. |
| HealthIT.gov Clinic Visit Nursing Workflow [26], accessed 2026-09-10 | Visit completion should follow documentation, education, follow-up, and handoff of unfinished work rather than a timestamp-only close. | Completion requires a follow-up record, evidence statuses, and explicit review of open-work ownership. | One checklist places follow-up, instructions, education/teach-back, unfinished work, and completion together without duplicating their source workflows. | Required-field and stale-evidence checks passed; rendered browser acceptance was not repeated at this stopping point. |
| ASTP/ONC 2025 SAFER Clinical Communication [49] and HL7 FHIR Task R4 [48], accessed 2026-09-10 | Unfinished work should retain explicit status and responsible owner or pool through transitions. | Open task snapshots preserve ID, state, lock version, pool, assignee, and due time; closing the encounter does not complete those tasks. | The checklist lists each open item and requires the nurse to attest that current ownership was reviewed. | Focused checks prove changed task versions block completion and committed tasks remain open. Escalation timing remains clinic-configured. |
| AHRQ Teach-Back [44] and Taking Care of Myself [52], accessed 2026-09-10 | Written instructions, education/understanding, follow-up, warning signs, and contact planning are distinct completion evidence. | The review links the exact signed instruction revision and exact immutable education-event IDs; exception statuses require an explanation. | Separate controlled selectors prevent one checkbox from implying that instructions and teach-back both occurred. | Signed-revision and education linkage passed. Patient-facing handout content and clinic-specific warning-sign protocols remain separately governed. |

### Batch 13 disposition target

| Slice | Exit requirement | Current disposition |
| --- | --- | --- |
| 13A. Recorded visit outcome | Preserve an explicit operational outcome separately from encounter status | **Passing** — bounded outcome, optional exception note, immutable review, and separate completed encounter state passed. |
| 13B. Follow-up disposition | Require and bind the exact current encounter follow-up without duplicating its workflow | **Passing** — ID, lock version, effective state, and source record are checked at commit; missing or changed evidence prevents closure. |
| 13C. Instructions and education evidence | Link the exact signed patient-instruction revision and immutable education/teach-back events | **Passing** — the API and UI distinguish provided, not required, and unable-to-complete states and reject unsupported evidence claims. |
| 13D. Unfinished-work ownership | Snapshot current task status/version/owner or pool and leave the task lifecycle open | **Passing** — changed task versions force refresh; committed review retains the exact snapshot while the claimed task remains claimed. |
| 13E. Atomic completion and checkout | Commit review, encounter close, appointment/reminder reconciliation, audit, receipt, and checkout eligibility atomically | **Passing** — injected audit failure rolled back the review, encounter, appointment, and receipt; success entered the existing unbilled queue and exact retry produced one review. |

### Batch 13 audit and focused evidence

The integrated source audit found and repaired two concurrency defects before execution: task comparison originally checked IDs without versions, which could accept changed ownership or state, and follow-up comparison checked its row version without the effective disposition derived from the linked appointment. The final workflow checks task versions and the effective follow-up state, and locks the linked follow-up appointment while taking the commit snapshot. The execution pass then corrected one obsolete MUI prop and three mechanical test-fixture issues: nonexistent convenience associations, an old booking test without its now-required clinician/visit type, and stale route/model-root architecture snapshots.

The dedicated completion test passed **3 runs / 37 assertions**. The combined close, checkout, idempotency, domain, and architecture regression set passed **51 runs / 965 assertions**. The existing provider workflow passed **19 tests**, frontend TypeScript passed, focused RuboCop passed over the changed Ruby files, and the PostgreSQL test migration succeeded. No rendered browser walkthrough was repeated before this requested stopping point. These are local synthetic software results; clinic policy, clinical acceptance, hosted deployment, interoperability conformance, and real-patient readiness remain separate gates.

## Sources

1. Moy AJ et al. “Measurement of clinical documentation burden among physicians and nurses using electronic health records: a scoping review.” *JAMIA* (2021). [PubMed](https://pubmed.ncbi.nlm.nih.gov/33434273/).
2. Mugoya R et al. “Exploring nurses’ documentation prioritization strategies to alleviate EHR documentation burden: a phenomenological study.” *JAMIA Open* (2026). [Oxford Academic](https://doi.org/10.1093/jamiaopen/ooag056).
3. Cho I et al. “Electronic health record system use and documentation burden of acute and critical care nurse clinicians: a mixed-methods study.” (2024). [PubMed Central](https://pmc.ncbi.nlm.nih.gov/articles/PMC11491602/).
4. athenahealth. [athenaOne](https://www.athenahealth.com/solutions/athenaone) and [Electronic Health Records](https://www.athenahealth.com/solutions/athenaone/electronic-health-records).
5. eClinicalWorks. [EHR and practice-management workflow example](https://www.eclinicalworks.com/products-services/ehr/behavioral-health-ehr/) and [Patient Engagement](https://www.eclinicalworks.com/products-services/patient-engagement/).
6. Tebra. [EHR Software](https://www.tebra.com/ehr-software) and [Platform FAQ](https://www.tebra.com/faq).
7. DrChrono. [EHR Platform](https://www.drchrono.com/ehr/) and [2026 plans/features](https://www.drchrono.com/wp-content/uploads/2026/03/drchrono-pricing-and-plans.pdf).
8. Elation Health. [EHR](https://www.elationhealth.com/solutions/ehr/) and [Practice Home workflow](https://help.elationhealth.com/articles/practice-home-introduction).
9. CharmHealth. [EHR features](https://www.charmhealth.com/ehr/) and [Patient Portal](https://www.charmhealth.com/ehr/phr-patient-health-record.html).
10. Practice Fusion. [EHR overview](https://signup.practicefusion.com/).
11. athenahealth. [athenaOne service description](https://www.athenahealth.com/sites/default/files/media_docs/athenaOne-Service-Description.pdf).
12. DrChrono. [Lab API and webhook documentation](https://support.drchrono.com/home/drchrono-lab-api-and-webhook).
13. Elation Health. [Practice Home: calendar, requiring-action queues, patient search, messages, documents, billing, and memberships](https://help.elationhealth.com/articles/practice-home-introduction).
14. CharmHealth. [Medical billing and claims](https://www.charmhealth.com/ehr/medical-billing-claims.html).
15. Hint. [DPC platform](https://www.hint.com/direct-primary-care) and [Membership billing](https://www.hint.com/platform/billing).
16. Hint. [Developer API overview](https://developers.hint.com/docs/overview).
17. HL7. [FHIR R4 resource list](https://hl7.org/fhir/R4/resourcelist.html) and [Encounter scope](https://hl7.org/fhir/R4/encounter.html).
18. ASTP/ONC. [ONC Standards Bulletin 2026-2: USCDI v7](https://healthit.gov/standards-and-technology/onc-standards-bulletin/onc-standards-bulletin-2026-2/) and [All USCDI versions](https://isp.healthit.gov/all-uscdi-versions).
19. ASTP/ONC. [USCDI Patient Demographics/Information](https://isp.healthit.gov/uscdi-data-class/patient-demographicsinformation?page=1).
20. ASTP/ONC. [USCDI Health Status Assessments](https://isp.healthit.gov/uscdi-data-class/health-status-assessments?page=1).
21. ASTP/ONC. [USCDI Encounter Information](https://isp.healthit.gov/uscdi-data-class/encounter-information).
22. ASTP/ONC. [USCDI Procedures](https://isp.healthit.gov/uscdi-data-class/procedures) and [Procedure Order](https://isp.healthit.gov/uscdi-data/procedure-order).
23. AHRQ. [What is workflow?](https://digital.ahrq.gov/health-it-tools-and-resources/evaluation-resources/workflow-assessment-health-it-toolkit/workflow).
24. AHRQ. [Workflow Tool Examples](https://digital.ahrq.gov/health-it-tools-and-resources/evaluation-resources/workflow-assessment-health-it-toolkit/examples).
25. American Medical Association. [A Systematic Approach to Reducing EHR Inbox Burden](https://edhub.ama-assn.org/steps-forward/module/2821565).
26. HealthIT.gov. [Clinic Visit—Nursing Workflow](https://www.healthit.gov/sites/default/files/nursing_workflow.pdf).
27. HL7. [FHIR R4 ServiceRequest](https://hl7.org/fhir/R4/servicerequest.html).
28. Badgeley MA et al. “A Time and Motion Analysis of Nursing Workload and Electronic Health Record Use in the Emergency Department.” [PubMed Central](https://pmc.ncbi.nlm.nih.gov/articles/PMC11216543/).
29. Mazur LM et al. “Association of the Usability of Electronic Health Records With Cognitive Workload and Performance Levels Among Physicians.” *JAMA Network Open* (2019). [PubMed Central](https://pmc.ncbi.nlm.nih.gov/articles/PMC6450327/).
30. AHRQ. [Document Workflow Assessment Guide: Clinic](https://digital.ahrq.gov/health-it-tools-and-resources/evaluation-resources/health-it-survey-compendium/document-workflow-assessment-guide-clinic).
31. ASTP/ONC. [USCDI v7 allergies and intolerances](https://isp.healthit.gov/sites/default/files/2026-01/Draft-USCDI-Version-7-January-2026.pdf) (draft source used for element detail; current-version status separately verified in Sources 18–19).
32. Park S et al. “A Systematic Review of Nurses' Perceptions of Electronic Health Record Usability Based on the Human Factor Goals of Satisfaction, Performance, and Safety.” (2024). [PubMed](https://pubmed.ncbi.nlm.nih.gov/38191474/).
33. ASTP/ONC. [2025 SAFER Guides](https://healthit.gov/clinical-quality-and-safety/safer-guides/).
34. HL7. [US Core MedicationRequest Profile 9.0.0, STU 9, FHIR R4](https://hl7.org/fhir/us/core/StructureDefinition-us-core-medicationrequest.html).
35. HL7. [FHIR R4 MedicationAdministration](https://hl7.org/fhir/R4/medicationadministration.html) and [FHIR R5 MedicationAdministration](https://hl7.org/fhir/R5/medicationadministration.html).
36. U.S. National Library of Medicine. [RxNorm overview](https://www.nlm.nih.gov/research/umls/rxnorm/index.html) and [technical documentation](https://www.nlm.nih.gov/research/umls/rxnorm/docs/techdoc.html).
37. UCUM Organization. [Unified Code for Units of Measure specification](https://ucum.org/ucum).
38. U.S. Food and Drug Administration. [Route of Administration terminology](https://www.fda.gov/drugs/data-standards-manual-monographs/route-administration).
39. Institute for Safe Medication Practices. [Targeted Medication Safety Best Practices for Hospitals](https://www.ismp.org/system/files/resources/2024-02/ISMP_TargetedMedicationSafetyBestPractices_Hospitals_021524_MS5818%20%281%29.pdf).
40. HL7. [US Core ServiceRequest Profile 9.0.0](https://hl7.org/fhir/us/core/StructureDefinition-us-core-servicerequest.html).
41. HL7. [US Core Laboratory Result Observation Profile 9.0.0](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-lab.html).
42. HL7. [US Core DiagnosticReport Profile for Laboratory Results Reporting 9.0.0](https://hl7.org/fhir/us/core/StructureDefinition-us-core-diagnosticreport-lab.html).
43. ASTP/ONC. [2025 SAFER Guide: Test Results Reporting and Follow-Up](https://healthit.gov/wp-content/uploads/2025/06/SAFER-Guide-8.-Test-Results-Reporting-Final.pdf).
44. AHRQ. [Use the Teach-Back Method](https://www.ahrq.gov/health-literacy/improve/precautions/tool5.html).
45. HL7. [US Core Vital Signs Profile 9.0.0](https://hl7.org/fhir/us/core/StructureDefinition-us-core-vital-signs.html).
46. HL7. [US Core Patient Profile 9.0.0](https://hl7.org/fhir/us/core/StructureDefinition-us-core-patient.html).
47. ASTP/ONC. [Patient Identity and Patient Record Matching](https://healthit.gov/standards-and-technology/patient-identity-and-patient-record-matching/).
48. HL7. [FHIR R4 Task definitions](https://hl7.org/fhir/R4/task-definitions.html).
49. ASTP/ONC. [2025 SAFER Guide: Clinical Communication](https://healthit.gov/resources/2025-safer-guide-clinical-communication/).
50. HL7. [US Core QuestionnaireResponse Profile 9.0.0](https://hl7.org/fhir/us/core/StructureDefinition-us-core-questionnaireresponse.html) and [US Core Requirements 9.0.0](https://www.hl7.org/fhir/us/core/STU9/requirements.html).
51. U.S. Department of Health and Human Services. [Plan Your Telehealth Workflow](https://telehealth.hhs.gov/documents/Plan_Your_Telehealth_Workflow_05-17-2023.pdf).
52. AHRQ. [Taking Care of Myself: A Guide for When I Leave the Hospital](https://www.ahrq.gov/questions/resources/going-home/index.html).

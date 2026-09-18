# Medical Weight-Management Intake Tracking

Status: M1–M5 implemented and verified; remaining milestones are planning work

Revision: 3 · 2026-09-18

Milestone count: 12 implementation milestones

Approval gate: one separate clinical approval gate, not counted as a milestone

## Purpose and scope

Build a shared patient intake with a configurable adult medical-weight-management module. The reference pathway is U.S. adult, nonsurgical outpatient care, including medication-supported care such as glucagon-like peptide-1 (GLP-1) therapies. Pediatric care, bariatric-surgery evaluation, and specialty-specific protocols remain separate pathways.

The outcome is a traceable, clinician-reviewable assessment that can be completed in guided chunks. It must preserve the distinction between:

- patient-reported information;
- staff-entered or staff-measured information;
- imported records and their source/date;
- calculated values such as body mass index (BMI);
- unresolved questions and clarification work; and
- clinician decisions, which must never be inferred from form completion.

This document does not authorize prescribing rules, medication eligibility, diagnosis, clinical escalation thresholds, live integrations, or production release. The medical director must approve the final questions, requiredness, medication branches, scoring instruments, and escalation pathways before clinical use.

## Product decisions captured from the supplied brief

1. Reuse the existing patient profile, medication, allergy, encounter, document, laboratory, consent, and task records. Do not create competing copies inside a weight-loss questionnaire.
2. Use a branching structured intake rather than one giant form. Initial assessment and recurring follow-up are separate workflows.
3. Use bounded choices for safety questions; searchable repeating records for medications, supplements, allergies, procedures, and treatment attempts; numeric values with unit/date/source metadata for measurements; and short narrative only where explanation is needed.
4. Preserve `no`, `unknown`, `not asked`, `not applicable`, and `declined` as different states where the question is applicable.
5. Make unresolved safety facts visible to clinician review. For example, an unknown thyroid-cancer subtype creates a clarification task; it does not become a negative answer or confirmed medullary thyroid carcinoma.
6. Treat food access, transportation, cost, caregiving, portal access, and support as support needs, not a commitment score or an automatic denial of care.
7. Do not make every possible question mandatory. Core fields support the initial assessment; conditional and extended fields open only when relevant.
8. Keep follow-up focused on progress, actual treatment use, tolerability, health changes, nutrition/activity, access, and patient questions. A completed follow-up does not approve a refill or dose change.

## Clinical approval gate before Milestone 1

The clinic’s medical director or designated clinical authority must review and approve the final clinical content. Record the decision, reviewer, jurisdiction, effective date, form/version, and superseded version.

Approval must explicitly cover:

- initial versus follow-up questions and requiredness;
- accepted answer states and skip/decline behavior;
- current symptom and safety-question escalation paths;
- medication-specific branches and the products in scope;
- reproductive-health questions and counseling workflow;
- selected standardized instruments, exact versions, scoring, and interpretation owner;
- clinical review ownership and clarification-task behavior; and
- which fields may be patient-reported, staff-recorded, imported, calculated, or clinician-verified.

Until this gate is recorded, implementation can build neutral form infrastructure and synthetic fixtures, but must not present medication rules as approved clinical policy.

## Milestone tracker

| ID | Milestone | Primary outcome | Depends on | Status | Acceptance evidence |
| --- | --- | --- | --- | --- | --- |
| M1 | Shared intake shell and source-aware answer model | A resumable intake can render versioned sections and preserve source/state metadata | Approval gate; existing patient/encounter records | Complete | Five guided chunks save progressively; explicit answer states, staff confirmation, provenance, and Version 5 survive reload |
| M2 | Patient profile and care coordination | The intake reuses identity/contact data and captures encounter-specific coordination facts | M1 | Complete | Existing profile values are reused read-only; synthetic room 19 is recorded and remains present after reload |
| M3 | Goals, measurements, and weight history | Staff and patient can record goals, dated measurements, BMI, and longitudinal weight context | M1, M2 | Complete | Synthetic 200 lb / 70 in measurement records with date and units; server-calculated BMI displays as 28.7 kg/m² and is not editable |
| M4 | Previous treatment and procedure history | Treatment attempts, medication history, procedures, outcomes, and reasons for stopping are repeatable records | M1, M3 | Complete | Structured treatment/procedure entries persist independently; approximate and unknown dates survive reload; API and browser evidence pass |
| M5 | Medical, family, and current-symptom history | Structured conditions and symptoms open relevant follow-ups without collapsing history into one text box | M1, M2 | Complete | Condition status/date/review route, family-history uncertainty, and current-symptom review route persist and remain visible |
| M6 | Medication, supplement, allergy, and actual-use reconciliation | Medication records distinguish prescribed from actually taken products and distinguish allergy from intolerance | M1, M4, M5 | Not started | Search/catalog selection, “Other,” dose/unit uncertainty, reactions, and source/date are preserved |
| M7 | Reproductive and medication-specific safety branches | Treatment selection opens the approved product-specific questions and clarification paths | M5, M6; clinical approval gate | Not started | GLP-1 and non-GLP-1 branches are distinct; unknown answers create review work rather than rejection |
| M8 | Nutrition, eating behavior, and mental-health support | Structured food patterns and sensitive behavioral questions can be completed privately and conditionally | M1, M5; approved instruments if selected | Not started | Repeating food records, explicit sensitive-question states, instrument version, and support routing persist |
| M9 | Activity, function, sleep, and social barriers | The assessment captures function and support needs without a punitive readiness score | M1, M5, M8 | Not started | Activity/sleep/support fields use bounded choices plus optional explanation; barriers produce actionable support work |
| M10 | Records, labs, consent, and administrative context | Imported evidence and consent records are linked without demanding universal testing | M2, M3, M5, M7 | Not started | Source/date/version are visible; self-pay/insurance, treatment consent, telehealth consent, privacy, and AI disclosures remain separate |
| M11 | Patient confirmation and clinician review | The patient/staff can confirm what was recorded while the clinician sees unresolved risks first | M1–M10 | Not started | Confirmation is not clinical approval; review queue prioritizes unresolved safety facts, symptoms, actual medication use, and missing evidence |
| M12 | Follow-up and longitudinal change | A shorter follow-up updates treatment response and access without repeating the full initial intake | M3, M6, M7, M9, M11 | Not started | Follow-up version is separate; refill/dose decisions remain distinct clinician actions; changed facts reopen affected review |

## M1–M5 implementation checkpoint

- **Implemented:** persisted confirmed chunk progress and questionnaire version/provenance metadata; explicit answer-state controls; patient-profile reuse; encounter-scoped video-location question; existing observation-based vital-sign entry with server-calculated BMI; and structured condition, family-history, and current-symptom records with bounded review routing.
- **Changed paths:** `apps/api/app/controllers/clinic/scheduling/encounters_controller.rb`, `apps/api/app/services/clinic/care/previsit_intake.rb`, `apps/api/app/services/clinic/care/nurse_workflow.rb`, `apps/api/test/integration/nurse_workflow_test.rb`, `apps/web/src/api/contracts.ts`, `apps/web/src/features/patientPortal/IntakeQuestions.tsx`, `apps/web/src/features/clinic/NurseEncounterWorkspace.tsx`, and `apps/web/test/patient-previsit-note.test.tsx`.
- **Verified:** Ruby syntax; focused API integration suite (9 runs / 213 assertions / 0 failures); frontend TypeScript; focused web interaction and structured-history tests (12 tests / 0 failures); the final staged component checks; production frontend build; and targeted Prettier checks for changed UI files.
- **Browser proof:** On the synthetic encounter page, room assignment records room 19 (`M1-M3-EXAM-1`), all five guided groups can be answered and confirmed in sequence, explicit `Unknown` states remain visible, the intake reloads at Version 5, and recorded 200 lb / 70 in measurements display server-calculated BMI 28.7 kg/m². The room and confirmations persist after reload.
- **M4 proof:** The same synthetic encounter records a prior medicine through the searchable/“Other” path with an approximate year and a prior procedure with an unknown date; the saved revision advances to Version 9, the next group unlocks, and both structured entries remain visible after reload. The API integration test also persists two independent treatment records and one procedure record.
- **M5 proof:** The same synthetic encounter records a dizziness/fainting symptom routed to clinical review, a current metabolic condition with an approximate 2022 date and clinical-review route, and an uncertain parent cardiovascular family-history item. The saved revision advances through Versions 10–11; the editor and reloaded summary retain the structured values, routing, and uncertainty. These are recorded review facts, not triage decisions or clinical approval.
- **Fixes verified:** The room assignment request now uses the API’s nested room payload; the controller validates the required idempotency request key; and the nurse integration fixture assigns a synthetic room through the real scheduling service before exercising the workflow.
- **Remaining gates:** Clinical approval, jurisdictional review, production/live-integration checks, tablet-width proof, and the later M6–M12 milestones remain separate from this implementation completion.

## Milestone parts at a glance

| ID | Parts included | Practical result |
| --- | --- | --- |
| M1 | Intake shell; section/chunk navigation; answer states; provenance; draft recovery | A resumable, versioned intake that does not confuse blank with No |
| M2 | Patient profile; contact and accessibility; care coordination; telehealth location; provider/pharmacy search | The intake reuses chart data and records encounter-specific coordination facts |
| M3 | Goals; measurements; units and dates; source/verification; BMI; weight history | Goals and measurements are structured, dated, and calculated where appropriate |
| M4 | Diet/program attempts; prior medicines; procedures/surgeries; outcomes; stop reasons | Treatment history is repeatable and separate from current medications and diagnoses |
| M5 | Conditions; family history; current symptoms; approved follow-up details; review routing | Structured history opens only the relevant detail and review work |
| M6 | Medication search; supplements; actual use; dose uncertainty; allergies; intolerance/adverse effects | Medication reconciliation is searchable, source-aware, and clinically reviewable |
| M7 | Pregnancy/reproductive questions; product-specific branches; GLP-1 questions; non-GLP-1 questions; clarification paths | Safety questions follow the selected product and preserve uncertainty for review |
| M8 | Nutrition; eating behavior; mental health; substance use; sensitive-question privacy; instruments | Sensitive information is structured, optional where appropriate, and routed to support |
| M9 | Activity; strength; function; sleep; transportation/cost/food access; caregiving; support tasks | Barriers create actionable support work without becoming a punitive readiness score |
| M10 | Records; labs; consent; telehealth/privacy; insurance or self-pay; prior authorization; disclosures | Evidence and administrative context are linked without requiring a universal lab panel |
| M11 | Patient/staff confirmation; clinician review queue; unresolved-item ownership; corrections; changed-fact review | Confirmation is distinct from diagnosis or prescribing approval |
| M12 | Progress; treatment use; tolerability; changes; access; support; patient questions; longitudinal comparison | Follow-up is shorter and change-focused, while refill and dose actions remain separate |

Each milestone below is broken into four parts:

- **Build:** the product capability to create.
- **Capture:** the questions or records it must support.
- **Rules:** the behavior, ownership, and safety boundaries.
- **Done when:** the evidence needed before marking it complete.

## Milestone detail

### M1 — Shared intake shell and source-aware answer model

- **Build:** Reusable section/chunk framework on the existing intake revision architecture.
- **Capture:** Stable question ID, form/version, label, purpose, answer type, allowed values, conditional rule, required-for status, writer, source, recorded time, and confirmation state.
- **Rules:** Use existing draft/revision and optimistic-concurrency behavior. A failed or uncertain save preserves the recoverable draft and shows one explicit retry/reconcile action. Do not auto-submit or silently overwrite a newer revision.
- **Answer states:** Support `answered`, `no`, `unknown`, `not asked`, `not applicable`, and `declined` where clinically meaningful. A blank answer is not a confirmed negative.
- **Done when:** A synthetic draft survives reload and a stale or uncertain save has a visible recovery path.

### M2 — Patient profile and care coordination

- **Build:** Profile and care-coordination section using existing patient, encounter, provider, and pharmacy records.
- **Capture:** Legal/preferred name, date of birth, phone, email, address, language, accessibility needs, emergency contact, primary-care/specialist references, and pharmacy records.
- **Rules:** Reuse owning-domain values. Do not ask for an editable age when date of birth exists. Provider and pharmacy selection are searchable with explicit “none” and “unknown” states.
- **Telehealth branch:** Capture the patient’s current physical location for the encounter separately from the home address.
- **Done when:** Existing chart values are inherited appropriately, while encounter-specific location and coordination facts remain correctly scoped.

### M3 — Goals, measurements, and weight history

- **Build:** Goals, measurements, and longitudinal weight-history sections.
- **Capture:** Health/function goals, patient-defined priorities, desired weight, timeline, historical associations, height, weight, blood pressure, pulse, waist circumference, and optional body-composition records.
- **Rules:** Store goals and desired weight as patient-reported expectations, not promises or diagnoses. Measurements require numeric value, unit, date, source, and verification state.
- **Calculation:** Calculate BMI read-only from the appropriate measurements and preserve the underlying values.
- **Missing data:** Do not force invented measurements. Allow “not measured,” “unknown,” or “declined” when appropriate.
- **Done when:** Units, dates, sources, and verification state persist, and BMI cannot be typed over.

### M4 — Previous treatment and procedure history

- **Build:** Repeatable treatment-history and procedure-history records.
- **Capture:** Diet/program attempts, previous weight-management medicines, procedures, surgeries, and hospitalizations.
- **Record details:** Approximate dates, duration, response, maintenance, adverse effects, complications, and reason ended.
- **Rules:** Keep treatment history separate from current medications and current diagnoses. Do not reduce the domain to a yes/no dieting question.
- **Done when:** Multiple records persist independently, including approximate or unknown dates and different outcomes.

### M5 — Medical, family, and current-symptom history

- **Build:** Structured condition, family-history, and current-symptom sections.
- **Capture:** Metabolic, cardiovascular, endocrine/reproductive, gastrointestinal/liver, kidney, respiratory/sleep, neurological/eye, pain/mobility, and other approved condition domains.
- **Condition details:** A selected condition opens diagnosis date/approximation, current versus past status, treatment, managing clinician, and complications where approved.
- **Symptom branch:** Keep symptoms separate from diagnoses. Current abdominal symptoms, vomiting, bowel changes, dizziness, fainting, palpitations, breathing difficulty, and vision changes route to the clinic-approved triage/review workflow.
- **Family history:** Repeat condition, affected relative, age if known, details, and uncertainty. Unknown subtype or age remains unknown.
- **Boundary:** The intake must not invent urgency thresholds.
- **Done when:** Selected conditions and symptoms produce visible, owned review work without collapsing history into one text box.

### M6 — Medication, supplement, allergy, and actual-use reconciliation

- **Build:** Searchable repeating medication, supplement, allergy, intolerance, and adverse-effect records.
- **Capture:** Prescriptions, over-the-counter products, vitamins, herbs, supplements, and products obtained elsewhere; name/ingredient, strength/concentration, route, prescribed dose, actual dose, frequency, reason, status, last dose, prescriber, pharmacy, source, and uncertainty as applicable.
- **Search behavior:** Prefer the clinic catalog or verified reference search. Provide “Other — enter manually” only when no match exists.
- **Safety rule:** Do not infer a dose from syringe units, milliliters, milligrams, or concentration. Unresolved dosing becomes clinician/pharmacist clarification work.
- **Classification:** Allergy, intolerance, and adverse effect remain separate. Support explicit no-known-allergies and unknown-history states; an empty list is not a confirmed negative.
- **Done when:** Actual use can differ from prescribed use and every uncertain medication fact remains visible to review.

### M7 — Reproductive and medication-specific safety branches

- **Build:** Reproductive-health and product-specific safety branches.
- **Capture:** Current pregnancy, pregnancy plans, breastfeeding, contraception, and menstrual/reproductive history as separate questions.
- **Approval dependency:** Requiredness and counseling language must be approved for the clinic’s jurisdiction and treatment scope.
- **Product branch:** Select questions from the proposed/actual product, not from a generic GLP-1 checkbox.
- **GLP-1 branch:** Separately address personal/family medullary thyroid carcinoma, multiple endocrine neoplasia type 2, serious product reaction, gastrointestinal disease, pancreatitis/gallbladder history, diabetes treatment and complications, kidney/dehydration concerns, overlapping products, and upcoming anesthesia when applicable to the approved workflow.
- **Other products:** Examples such as phentermine/topiramate, naltrexone/bupropion, and orlistat require their own approved branches. These examples are not a complete prescribing checklist.
- **Done when:** Unknown answers create clarification work rather than automatic rejection or an inferred negative.

### M8 — Nutrition, eating behavior, and mental-health support

- **Build:** Nutrition, eating-behavior, mental-health, substance-use, and support sections with private presentation where appropriate.
- **Capture:** Typical meals/snacks, approximate portions, food/drink recall, meal frequency, beverages, dietary patterns, restrictions, dining out, hunger/fullness, cravings, food preparation, and calorie/macronutrient tracking.
- **Rules:** Do not force estimates the patient does not know. Preserve actual foods and portions and label later calculations as estimates.
- **Sensitive domains:** Support loss-of-control eating, night eating, compensatory behavior, eating-disorder history, mental-health history, substance use, stress, and support with decline/unknown states and a clear clinician-review route.
- **Instruments:** Preserve original item responses, instrument version, scoring method, and score separately. Do not reword a validated instrument through AI and present it as equivalent.
- **Done when:** Sensitive information is not hidden in a generic note and support routing persists with the response.

### M9 — Activity, function, sleep, and social barriers

- **Build:** Activity, function, sleep, and social-needs sections.
- **Capture:** Physical activity and strength training as repeating records with days/week and minutes/session; workday activity; functional limitations; sleep duration/timing/quality; snoring or observed pauses; sleep-apnea diagnosis; and actual positive-airway-pressure use.
- **Support needs:** Food access, cooking facilities, work/caregiving/transportation barriers, household support, affordability, portal/telehealth assistance, medication-administration concerns, and preferred support.
- **Rules:** Use bounded choices plus optional explanation where possible. Barriers create support needs or tasks; they do not decide whether a patient deserves care.
- **Done when:** A barrier can become an actionable support task without creating a punitive readiness score.

### M10 — Records, labs, consent, and administrative context

- **Build:** Records, laboratory, consent, and administrative-context sections that reuse existing domains.
- **Evidence capture:** Source, collection/issue date, test name, value, unit, reference range, laboratory, and version.
- **Clinical scope:** Add structured glucose, glycated hemoglobin (HbA1c), lipid, kidney, liver, thyroid, or pregnancy results only when clinically relevant or requested by the approved workflow. Do not hardcode a universal laboratory or hormone panel.
- **Administrative records:** Keep self-pay versus insurance, insurance details, prior-authorization evidence, and program/membership selection separate.
- **Consent/disclosures:** Keep general treatment consent, telehealth consent, privacy acknowledgment, medication counseling, artificial-intelligence participation/recording disclosure, and optional marketing/photo consent separate.
- **Done when:** Evidence source/date/version is visible and imported records are not silently treated as current or verified.

### M11 — Patient confirmation and clinician review

- **Confirmation:** Patient or staff confirmation states what was recorded and the source. It is not a diagnosis, prescription approval, or clinician review.
- **Review order:**
  1. Unresolved safety and reproductive questions.
  2. Current symptoms requiring the clinic’s review path.
  3. Actual medication use and dose/concentration uncertainty.
  4. Missing or stale evidence and imported-record source/date.
  5. Changed information since the prior version.
  6. General narrative and goals.
- **Ownership:** Every unresolved item needs an owner/team, reason, next action, and recovery path.
- **Corrections:** Preserve the prior answer and source when a correction is made.
- **Done when:** A clinician can see what still needs review without mistaking confirmation for clinical approval.

### M12 — Follow-up and longitudinal change

- **Build:** A separate, shorter follow-up form/version rather than a repeated initial intake.
- **Capture:** Dated progress/measurements, patient-defined goal progress, actual product/dose/last dose/time on dose, missed doses or gaps, tolerability, health/medication/allergy/pregnancy/procedure changes, nutrition/hydration, activity/strength/function, access barriers, support needs, and patient questions.
- **Rules:** Compare changes longitudinally and reopen affected review when a safety-relevant fact changes.
- **Separate action:** Completing follow-up does not approve a refill, dose increase, or treatment continuation. Those actions require their own authorized clinician workflow and exact current medication/review context.
- **Done when:** Follow-up is change-focused and the medication decision remains an independently authorized action.

## Field/control rules

| Situation | Control | Required distinction |
| --- | --- | --- |
| Safety question | Explicit Yes / No / Unsure / Declined / Not applicable | Unknown is not No; unresolved critical answers create review work |
| Broad condition list | Multi-select with mutually exclusive None known and Unsure | Selected condition opens approved detail fields |
| Medication, procedure, or treatment history | Searchable repeating records | One record per item; preserve source and actual use |
| Measurement | Numeric value + unit + date + source | Self-reported, imported, staff-measured, and calculated remain distinct |
| Historical date | Date, approximate month/year, or Unknown | Do not force false precision |
| Sensitive question | Private/sectioned presentation with decline path | Do not hide unanswered sensitive work in a generic note |
| Scored instrument | Versioned item responses and separate score | Preserve original scale and approved scorer |
| Narrative explanation | Short text adjacent to its structured answer | Do not replace structured data with a paragraph |
| Imported answer | Read-only source/date plus confirmation action | Imported does not mean current or verified |
| Clinical decision | Clinician-owned field/action | Never infer from completion, score, or patient preference |

## Dependencies and failure-first checks

Use the existing matrix conditions rather than adding a competing set of gates:

- **SC-03 / SC-04:** rooming and physical-resource availability affect rooming/handoff, not unrelated registration or draft intake work. Telehealth remains exempt from a physical-room requirement.
- **CV-02:** conflicting or corrected intake facts preserve versions and reopen only the affected review.
- **CV-04:** a handoff remains pending until accepted; current coverage is not silently dropped.
- **OP-10:** save failures, stale edits, duplicate requests, and out-of-order events show a known outcome and recovery action.
- **OP-12:** closing an encounter does not auto-complete outstanding clinical, billing, or follow-up work.

Each milestone must prove the dependent action is blocked for the exact missing prerequisite and that an unrelated action remains available. Include interrupted saves, stale revisions, duplicate requests, patient/staff source differences, corrections, declined/unknown answers, missing owners, and persistence after encounter closure.

## Source-to-requirement mapping

| Source | Requirement/use | Product mapping | Boundary |
| --- | --- | --- | --- |
| [NIDDK, Treatment for Overweight & Obesity](https://www.niddk.nih.gov/health-information/weight-management/adult-overweight-obesity/treatment), accessed 2026-09-18 | Treatment combines individualized lifestyle support with possible medicine or surgery; goals and time frames are clinician/patient decisions | M3 goals; M8 nutrition; M9 activity; M12 follow-up | General U.S. education, not a clinic prescribing protocol |
| [NIDDK, Prescription Medications to Treat Overweight & Obesity](https://www.niddk.nih.gov/health-information/weight-management/prescription-medications-treat-overweight-obesity), accessed 2026-09-18 | Medication choice depends on health issues, other medicines, family history, cost, risks, and response | M4–M7 medication history, reconciliation, product-specific branches, clinician review | Does not authorize a product, dose, eligibility rule, or universal required field |
| [FDA Wegovy prescribing information, current retrieved label](https://www.accessdata.fda.gov/drugsatfda_docs/label/2026/215256s033lbl.pdf), accessed 2026-09-18 | Product-specific contraindications, warnings, reproductive information, and overlapping-product considerations must come from the selected label | M6–M7 product-specific safety branch and clarification work | Recheck label/version before implementation; do not generalize to every medication |
| [FDA Zepbound prescribing information](https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/217806Orig1s020lbl.pdf), accessed 2026-09-18 | A different product can have different counseling and interaction details | M7 product-specific branch | Label evidence is not a complete intake or clinic policy |
| [Telehealth.HHS.gov, Obtaining informed consent](https://telehealth.hhs.gov/providers/preparing-patients-for-telehealth/obtaining-informed-consent), accessed 2026-09-18 | Telehealth consent requirements vary by state; consent and privacy documentation need their own workflow | M2 location; M10 telehealth consent; M11 review | State-specific legal/clinical review remains unresolved |
| User-supplied weight-management intake brief, received 2026-09-18 | Broad domain inventory, control recommendations, follow-up split, and clinical-boundary cautions | M1–M12 scope and field/control rules | Public forms and examples in the brief are design references, not current prescribing authority |

## Verification plan and handoff

For each completed milestone, record:

- changed records, API routes, UI components, and form/version IDs;
- automated API/UI checks and their actual outcomes;
- synthetic browser proof at the primary desktop and tablet widths;
- authorization and tenant-isolation evidence;
- draft recovery, stale-edit, duplicate-request, and correction evidence;
- unresolved clinical, jurisdictional, vendor, or source-version questions; and
- the next milestone and the exact dependency needed to begin it.

Do not mark a milestone complete from a written plan, source change, passing typecheck, or attempted browser action alone. Clinical readiness, legal review, prescribing approval, live integrations, and production acceptance remain separate gates.

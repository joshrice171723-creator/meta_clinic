# Medical Weight-Management Intake Tracking

Status: proposed implementation plan; planning document only  
Revision: 1 · 2026-09-18  
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
| M1 | Shared intake shell and source-aware answer model | A resumable intake can render versioned sections and preserve source/state metadata | Approval gate; existing patient/encounter records | Not started | Synthetic draft survives reload; answer states and provenance remain distinct |
| M2 | Patient profile and care coordination | The intake reuses identity/contact data and captures encounter-specific coordination facts | M1 | Not started | Existing chart values are inherited read-only where appropriate; telehealth location is encounter-scoped |
| M3 | Goals, measurements, and weight history | Staff and patient can record goals, dated measurements, BMI, and longitudinal weight context | M1, M2 | Not started | Units/date/source are required for recorded measurements; BMI is calculated and never typed |
| M4 | Previous treatment and procedure history | Treatment attempts, medication history, procedures, outcomes, and reasons for stopping are repeatable records | M1, M3 | Not started | Multiple records persist independently; approximate/unknown dates are supported |
| M5 | Medical, family, and current-symptom history | Structured conditions and symptoms open relevant follow-ups without collapsing history into one text box | M1, M2 | Not started | Selected condition details, family-history uncertainty, and current symptom routing are visible |
| M6 | Medication, supplement, allergy, and actual-use reconciliation | Medication records distinguish prescribed from actually taken products and distinguish allergy from intolerance | M1, M4, M5 | Not started | Search/catalog selection, “Other,” dose/unit uncertainty, reactions, and source/date are preserved |
| M7 | Reproductive and medication-specific safety branches | Treatment selection opens the approved product-specific questions and clarification paths | M5, M6; clinical approval gate | Not started | GLP-1 and non-GLP-1 branches are distinct; unknown answers create review work rather than rejection |
| M8 | Nutrition, eating behavior, and mental-health support | Structured food patterns and sensitive behavioral questions can be completed privately and conditionally | M1, M5; approved instruments if selected | Not started | Repeating food records, explicit sensitive-question states, instrument version, and support routing persist |
| M9 | Activity, function, sleep, and social barriers | The assessment captures function and support needs without a punitive readiness score | M1, M5, M8 | Not started | Activity/sleep/support fields use bounded choices plus optional explanation; barriers produce actionable support work |
| M10 | Records, labs, consent, and administrative context | Imported evidence and consent records are linked without demanding universal testing | M2, M3, M5, M7 | Not started | Source/date/version are visible; self-pay/insurance, treatment consent, telehealth consent, privacy, and AI disclosures remain separate |
| M11 | Patient confirmation and clinician review | The patient/staff can confirm what was recorded while the clinician sees unresolved risks first | M1–M10 | Not started | Confirmation is not clinical approval; review queue prioritizes unresolved safety facts, symptoms, actual medication use, and missing evidence |
| M12 | Follow-up and longitudinal change | A shorter follow-up updates treatment response and access without repeating the full initial intake | M3, M6, M7, M9, M11 | Not started | Follow-up version is separate; refill/dose decisions remain distinct clinician actions; changed facts reopen affected review |

## Milestone detail

### M1 — Shared intake shell and source-aware answer model

Build a reusable section/chunk framework on the existing intake revision architecture. Each question needs a stable ID, form/version, label, purpose, answer type, allowed values, conditional rule, required-for status, writer, source, recorded time, and confirmation state.

Use the existing draft/revision and optimistic-concurrency behavior. A failed or uncertain save must preserve the recoverable draft and show one explicit retry/reconcile action. Do not auto-submit or silently overwrite a newer revision.

The answer model must support `answered`, `no`, `unknown`, `not asked`, `not applicable`, and `declined` where clinically meaningful. A blank answer is not a confirmed negative.

### M2 — Patient profile and care coordination

Reuse legal/preferred name, date of birth, phone, email, address, language, accessibility needs, emergency contact, primary-care/specialist references, and pharmacy records from their owning domains. Do not ask for an editable age when date of birth exists.

For telehealth, capture current physical location for the encounter separately from the home address. Keep provider and pharmacy selection searchable, with explicit “none” and “unknown” states.

### M3 — Goals, measurements, and weight history

Support health/function goals and patient-defined priorities without requiring a target weight. Store desired weight, timeline, and historical associations as patient-reported expectations, not promises or diagnoses.

Measurements must be numeric and typed with unit, date, source, and verification state. Support height, weight, blood pressure, pulse, waist circumference, and optional body-composition records. Calculate BMI read-only from the appropriate measurements and preserve the underlying values.

Do not force a patient to invent blood pressure or other measurements. Allow “not measured,” “unknown,” or “declined” when appropriate.

### M4 — Previous treatment and procedure history

Use repeating records for diet/program attempts, previous weight-management medicines, procedures, surgeries, and hospitalizations. Each record should support approximate dates, duration, response, maintenance, adverse effects, complications, and reason ended.

Keep treatment history separate from current medications and current diagnoses. Do not reduce the domain to a yes/no dieting question.

### M5 — Medical, family, and current-symptom history

Use domain-specific condition selections for metabolic, cardiovascular, endocrine/reproductive, gastrointestinal/liver, kidney, respiratory/sleep, neurological/eye, pain/mobility, and other clinically relevant history. A selected condition opens diagnosis date/approximation, current versus past status, treatment, managing clinician, and complications where approved.

Keep symptoms separate from diagnoses. Current abdominal symptoms, vomiting, bowel changes, dizziness, fainting, palpitations, breathing difficulty, and vision changes should route to a clinic-approved triage/review workflow. The intake should not invent urgency thresholds.

Family history is a repeating record: condition, affected relative, age if known, details, and uncertainty. Unknown subtype or age remains unknown.

### M6 — Medication, supplement, allergy, and actual-use reconciliation

Use searchable repeating medication records for prescriptions, over-the-counter products, vitamins, herbs, supplements, and products obtained elsewhere. Capture name/ingredient, strength/concentration, route, prescribed dose, actual dose, frequency, reason, status, last dose, prescriber, pharmacy, source, and uncertainty as applicable.

The UI should prefer the clinic catalog or a verified reference search and provide “Other — enter manually” only when no match exists. Do not infer a dose from syringe units, milliliters, milligrams, or concentration. Unresolved dosing becomes clinician/pharmacist clarification work.

Allergy, intolerance, and adverse effect are separate classifications. Support no-known-allergies and unknown-history states explicitly; an empty list is not a confirmed negative.

### M7 — Reproductive and medication-specific safety branches

Keep current pregnancy, pregnancy plans, breastfeeding, contraception, and menstrual/reproductive history as separate questions. The actual requiredness and counseling language must be approved for the clinic’s jurisdiction and treatment scope.

Medication branches must be selected from the proposed/actual product, not from a generic GLP-1 checkbox. GLP-1 safety questions should separately address personal/family medullary thyroid carcinoma, multiple endocrine neoplasia type 2, serious product reaction, gastrointestinal disease, pancreatitis/gallbladder history, diabetes treatment and complications, kidney/dehydration concerns, overlapping products, and upcoming anesthesia when applicable to the approved product workflow.

Non-GLP-1 examples such as phentermine/topiramate, naltrexone/bupropion, and orlistat require their own approved branches. These are examples for design, not a complete prescribing checklist.

### M8 — Nutrition, eating behavior, and mental-health support

Capture typical meals/snacks, approximate portions, food/drink recall, meal frequency, beverages, dietary patterns, restrictions, dining out, hunger/fullness, cravings, food preparation, and whether calories/macronutrients are tracked. Do not force estimates the patient does not know; preserve actual foods and portions and label later calculations as estimates.

Sensitive questions must support private presentation, decline/unknown, and a clear route to clinician review. Potential domains include loss-of-control eating, night eating, compensatory behavior, eating-disorder history, mental-health history, substance use, stress, and support.

If a standardized instrument is used, preserve the original item responses, instrument version, scoring method, and score separately. Do not reword a validated instrument through AI and present it as equivalent.

### M9 — Activity, function, sleep, and social barriers

Capture physical activity and strength training as repeating records with days/week and minutes/session; workday activity; functional limitations; sleep duration/timing/quality; snoring or observed pauses; sleep-apnea diagnosis; and actual positive-airway-pressure use.

Capture food access, cooking facilities, work/caregiving/transportation barriers, household support, affordability, portal/telehealth assistance, medication-administration concerns, and preferred support. These records create support needs or tasks; they do not decide whether a patient deserves care.

### M10 — Records, labs, consent, and administrative context

Reuse existing document and laboratory records where possible. Support source, collection/issue date, test name, value, unit, reference range, laboratory, and version. Add structured glucose, glycated hemoglobin (HbA1c), lipid, kidney, liver, thyroid, or pregnancy results only when clinically relevant or requested by the approved workflow. Do not hardcode a universal laboratory or hormone panel.

Keep self-pay versus insurance, insurance details, prior-authorization evidence, program/membership selection, general treatment consent, telehealth consent, privacy acknowledgment, medication counseling, artificial-intelligence participation/recording disclosure, and optional marketing/photo consent as separate records.

### M11 — Patient confirmation and clinician review

Patient or staff confirmation must state what was recorded and the source. It must not be presented as a diagnosis, prescription approval, or clinician review.

The clinician review screen should surface, in order:

1. unresolved safety and reproductive questions;
2. current symptoms requiring the clinic’s review path;
3. actual medication use and dose/concentration uncertainty;
4. missing or stale evidence and imported-record source/date;
5. changed information since the prior version; and
6. general narrative and goals.

Every unresolved item needs an owner/team, reason, next action, and recovery path. Preserve the prior answer and source when a correction is made.

### M12 — Follow-up and longitudinal change

Do not repeat the complete initial intake monthly. The follow-up form should update dated progress/measurements, patient-defined goal progress, actual product/dose/last dose/time on dose, missed doses or gaps, tolerability, health/medication/allergy/pregnancy/procedure changes, nutrition/hydration, activity/strength/function, access barriers, support needs, and patient questions.

Completing follow-up does not approve a refill, dose increase, or treatment continuation. Those actions require their own authorized clinician workflow and exact current medication/review context.

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


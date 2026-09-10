# U.S. healthcare standards product gap audit

Date: 2026-09-10

Repository: `C:\Users\joshr\Desktop\meta_clinic`

Branch and reviewed commit: `main` at `7fe16f76da14ad46121bbbbefd13e0f403960574`

Scope: Meta Clinic software behavior, data structures, tests, and rendered local workflows compared with the U.S.-only sources in [the U.S. healthcare reference map](../../docs/development/us-healthcare-reference-map.md).

Mode: read-only product audit. No feature implementation, deployment, real-data use, clinical approval, or compliance determination was performed.

## Bottom line

Meta Clinic has credible workflow foundations, especially patient matching, append-only clinical history, signed-note correction, medication-to-inventory traceability, external-lab follow-up, and lot/recall inventory controls. The main weakness is not basic CRUD. It is the gap between those workflows and the structured identifiers, conditional documentation, and distinct resource concepts expected by the reviewed U.S. sources.

The highest-value next work is:

1. repair the currently failing medication-administration verification;
2. make immunization records administration-grade;
3. make lab results computable with explicit code systems and UCUM units;
4. implement a real cash-pay estimate / good-faith-estimate workflow; and
5. separate resource availability from appointments through Schedule/Slot-like internal concepts.

The app should not claim FHIR, US Core, RxNorm, UCUM, CDC IIS, CLIA, or CMS compliance from the existing implementation. These sources are design inputs and future exchange targets; they do not require a FHIR-native database or every source field on every screen.

## Evidence and source check

### Official-link validation

- The map contains 60 numbered references and 64 unique external URLs. Every URL was requested on 2026-09-10.
- Fifty-seven URLs returned HTTP 200 through direct HTTPS checking. This included all reviewed HL7/FHIR, NLM, UCUM, FDA, and CMS URLs.
- Seven CDC pages returned HTTP 403 to the command-line client. None returned 404 or 5xx. Their content was separately opened and read through the browser/web retrieval path, so the 403 responses are an automated-client restriction rather than evidence that the links are dead.

The seven CDC URLs with direct-client restrictions were:

- [Outpatient infection-prevention expectations](https://www.cdc.gov/healthcare-associated-infections/hcp/prevention-healthcare/outpatient-expectations.html)
- [Vaccine 2D barcode implementation toolkit](https://www.cdc.gov/iis/2d-barcodes/implementation-toolkit.html)
- [IIS immunization data elements](https://www.cdc.gov/iis/core-data-elements/immunizations.html)
- [IIS HL7 technical guidance](https://www.cdc.gov/iis/technical-guidance/hl7.html)
- [Standard precautions](https://www.cdc.gov/infection-control/hcp/basics/standard-precautions.html)
- [After giving vaccine](https://www.cdc.gov/vaccines/hcp/administration/after.html)
- [Vaccine storage and handling resources](https://www.cdc.gov/vaccines/hcp/storage-handling/resources.html)

### Repository and runtime evidence

- `[Code-confirmed]` Source, migrations, serializers, API contracts, tests, repository decisions, and current U.S. reference guidance were inspected.
- `[Runtime-observed]` `ruby .\bin\dev status` passed: Ruby, Node, dependencies, PostgreSQL, migrations, database query, Rails on port 3001, Vite on port 3000, and the clinic worker were healthy.
- `[Browser-observed]` The local authenticated synthetic workspace rendered Clinic setup, Patient directory, a patient chart, a signed encounter, labs, medication administration, clinical plan tabs, and the patient billing ledger.
- `[Test-observed]` Five focused frontend files passed: 15 tests, 0 failures. Frontend TypeScript typecheck passed.
- `[Test-observed]` Six focused backend integration files ran 37 tests and 535 assertions with 2 failures. Both failures are in `clinic_medication_administrations_test.rb` and return 403 where success is expected.
- `[Not assessed]` No full test suite, production deployment, real-patient workflow, external registry, payer, pharmacy, lab, or state-system integration was exercised.
- `[Not assessed]` No clinician, pharmacist, laboratory director, billing specialist, privacy/security professional, attorney, state registry, or state regulator approved this audit.

## Capability matrix

| Product area | Current status | What is demonstrated | Material gap | Main references |
| --- | --- | --- | --- | --- |
| Patient identity and registration | Strong internal workflow; partial exchange semantics | Multi-fact lookup, required clinic reference, legal/display name, DOB, sex, language/interpreter, contact preferences, conflict-aware revisions | No explicit external identifier system/use/period model; no demonstrated US Core export/profile validation | R08, R09, R30 |
| Clinic services and sites | Partial | Versioned clinic type/service scope; sites, address/contact, status, operating hours; UI states that service selection is not clinical activation | Flat service flags are not a service catalog and do not connect offering, organization, site, specialty, eligibility, referral, appointment requirement, or service availability | R04, R06 |
| Scheduling | Partial | Appointment patient, interval, status, modality, site, room, clinician, visit type, reason, request linkage, confirmation and lifecycle controls | No separate Schedule or Slot records; site hours explicitly do not control appointment availability; no demonstrated capacity template, blocked-time, overbooking, or waitlist allocation model | R05-R07 |
| Encounter and signed notes | Strong internal workflow | Appointment/Encounter separation, encounter context, SOAP revisions, immutable signed revision, correction flow, authorship and history | No demonstrated FHIR document/note export or profile validation; this is an interoperability gap, not a reason to weaken the current note controls | R10, R31-R33 |
| Vital signs | Strong bounded workflow; partial terminology conformance | Structured values, observed time, performer/recording evidence, bounded units, atomic BMI derivation | Uses an internal observation code system and selected UCUM-like units; no demonstrated US Core profile validation or complete UCUM parser | R13, R20, R46-R47 |
| Medication ordering and administration | Strong design, failing current verification | Versioned orders; structured positive dose; bounded units/routes; not-given reason; precheck, variance, verification, response/education; exact inventory lot movements and immutable snapshots | Two happy-path integration tests fail authorization; no RxCUI/concept-version identity; route codes are local strings rather than demonstrated FDA terminology identifiers | R15-R22, R44-R45 |
| Immunizations | Partial record; not administration-grade | Versioned status, vaccine name, optional CVX, manufacturer, lot, dose, route, site, occurrence time/source, refusal reason, source document | Completed records require only time. Missing structured manufacturer/MVX, lot expiry, vaccinator, administering facility/address, VIS edition/date given, structured dose/route/site, and inventory linkage | R23-R27, R51-R54 |
| Laboratory orders, specimens, reports, and follow-up | Strong workflow; weak result semantics | Active order linkage, site, specimen, collection/issue times, immutable versions, priority, review, escalation, patient-contact follow-up | Result rows use free-text value/unit/reference range/flag and optional code without code system/version; specimen type code has no stored system; no typed quantitative result contract | R11, R13-R14, R20-R21, R46-R48 |
| Care plans, goals, procedures, referrals | Partial | Versioned records, state transitions, request/fulfillment links, referral exchange events | Clinical codes and systems are mostly user-entered strings; no terminology binding or exchange validation | R34-R35, R39 |
| Standardized assessments | Missing as a reusable instrument workflow | Clinic configuration can select assessment areas; the chart has HPI/ROS fields | No Questionnaire/QuestionnaireResponse-equivalent model, instrument/version identity, item identity, answer provenance, scoring provenance, or structured result link | R36-R39, R41-R43 |
| Cash prices, invoices, and receipts | Strong transaction history | Backend-owned service catalog, invoice ledger, allocations, receipt/refund history, checkout linkage | `estimates` is advertised as a core feature, but no patient estimate model/workflow was found. An invoice or price list is not a good faith estimate | R55-R56 |
| Provider, organization, and location identifiers | Partial | Staff, memberships, clinician profiles, practice/site identity and contact/address data | No NPI field or identifier-system model was found; taxonomy, licensure, privileges, employment, and app authorization are not represented by one identifier | R28-R29, R57-R58 |
| Inventory, lots, recalls, and scanning | Strong internal operations; partial external semantics | NDC/GUDID lookup, product/package/lot separation, expiry, receiving, locations, quarantine/holds, recall and disposition, exact ledger | No demonstrated FDA recall-feed reconciliation or vaccine GS1 unit-of-sale/unit-of-use barcode semantics; those are optional integrations, not reasons to weaken manual controls | R22, R48-R49, R52 |
| Point-of-care testing and infection prevention | Conditional readiness only | Service scope can declare point-of-care testing; clinic setup correctly avoids treating selection as activation | No demonstrated CLIA certificate/test-complexity/site eligibility model or outpatient infection-prevention checklist workflow. Exact software needs depend on clinic services, state law, and operating policy | R21, R48, R59-R60 |

## Confirmed corrections

### P1 — Restore medication-administration test authority

`[Test-observed]` Two current happy paths fail with `403 Forbidden`:

- `test_explicit_same-site_lots_create_one_immutable_clinical_record_and_exact_stock_deductions`
- `test_eligible_choices_expose_exact_precision_and_only_usable_encounter-site_medication_batches`

`[Code-confirmed]` The controller now requires `medication_administrations.write`. The test setup grants only `medication_requests.write` before exercising those happy paths. This fixture/authorization mismatch prevents the suite from proving the new workflow. Fix the test authority deliberately, confirm normal role assignments still receive the intended permission, and rerun the medication test plus the integrated clinic journey. Do not loosen the controller authorization to make the test green.

### P2 — Stop leaking `patientLabel` to the DOM

`[Browser-observed]` The signed encounter page emitted a React console error saying `patientLabel` is not a recognized DOM property.

`[Code-confirmed]` `CareSummaryTrigger` removes `href`, `actionLabel`, `children`, and `className`, then spreads the remaining props onto an `<a>`. Its declared props also include `state`, `patientLabel`, and `timezone`, so those component-only values can reach the DOM. Destructure the component-only props before the spread and add a focused render assertion that the anchor does not contain them.

## Priority product gaps

### P1 — Immunization documentation and lot traceability

The current model is a useful vaccination-history record but not a safe administration workflow. For `completed` records, require or explicitly classify the U.S.-relevant evidence: vaccine concept/CVX, manufacturer with MVX where applicable, lot, administration date/time, dose value and unit, route/site, administering person, administering facility, and VIS edition/date provided when applicable. Preserve historical and patient-reported records with different evidence requirements. Link administered-here vaccine events to the exact inventory lot and movement without making a scan silently post either event.

State IIS interfaces remain state-specific. CDC's current consolidated HL7 v2.5.1 immunization guide can inform a future adapter, but it does not prove that a state accepts FHIR or that Meta Clinic is connected.

### P1 — Computable laboratory result rows

Preserve the strong order → specimen → report version → review/follow-up chain. Add semantics alongside, not instead of, human-readable text:

- result code plus code-system URI and version;
- typed value kind, numeric value where appropriate, UCUM unit code and display;
- interpretation code/display rather than an unconstrained flag alone;
- reference-range structure and source;
- specimen type code system; and
- performer/issuing organization identity where the external report supports it.

Do not perform clinical unit conversion merely because two units are valid UCUM. Conversion requires dimensional compatibility, precision policy, and, for medication mass/volume, verified concentration.

### P1 — Patient estimate / good-faith-estimate workflow

Implement estimates as their own versioned object, not a draft invoice label. A useful first slice should bind patient, scheduled/requested service, facility/provider context, expected line items, totals, assumptions, creation/version time, delivery method/time, patient acknowledgment when captured, expiration/supersession, and the eventual invoice/variance. CMS applicability and timing rules require current detailed review and legal/operational confirmation before hard-coded enforcement.

### P1 — Availability and slot integrity

Add internal Schedule/Slot-like concepts so the app can answer whose availability a time window represents and whether it is free, held, booked, blocked, overbooked, or expired. The model should cover clinician, site/room, service/visit type, planning horizon, timezone, exceptions, and reservation recovery. Appointment requests, offered slots, booked appointments, check-in, and encounters must remain separate states.

### P1 conditional — Point-of-care testing gate

Before `point_of_care_testing` becomes more than an implementation-scope flag, represent the site's applicable CLIA certificate status/type, test catalog and complexity, effective dates, and any state-specific restriction needed by the operator. The software should fail closed when a configured test is outside the recorded site authority. A certificate field is supporting evidence, not proof that the clinic is legally ready.

## Important P2 improvements

1. **Structured service catalog:** introduce an internal service-offering entity linking organization, locations, type/specialty, availability, eligibility, referral/appointment requirements, and contact channels. Keep billing price and performed Procedure separate.
2. **Medication identity:** preserve optional RxCUI, concept type, vocabulary version/status, package NDC, local catalog identity, and lot identity as different facts. RxNorm does not supply dosing advice, package stock, price, or interaction severity.
3. **Provider identifiers:** support typed identifiers such as NPI for the provider/organization workflows that need them. Keep taxonomy, state license, privileges, employment, and application permissions separate; NPI is not proof of any of them.
4. **Versioned assessments:** add instrument/version, stable item IDs, answer provenance, authored time, status, scorer/version, and resulting observation/link for selected screening workflows. Do not convert every chart form into a generic questionnaire.
5. **Recall and vaccine barcode adapters:** evaluate server-side FDA recall matching and CDC vaccine unit-of-sale/unit-of-use barcode parsing. Require user review before posting a hold, receipt, or administration.
6. **FHIR boundary decision:** choose and record a single implementation target before export work. US Core 9.0.0 is based on FHIR R4; the supplied unversioned HealthcareService and MedicationAdministration pages currently describe R5. Use R5 pages for concept research only unless an explicit R5 interface is chosen.

## What should be preserved

- Patient matching requires multiple identity facts and warns against duplicate registration.
- Empty clinical-history lists do not imply “none”; explicit review/absence states are retained.
- Appointment, encounter, note signing, discharge, checkout, and handoff remain distinct.
- Signed note revisions are immutable and corrected through a separate revision.
- Medication administration records exact clinical outcome separately from exact inventory movements.
- External lab results require an active order and collected specimen; acknowledgment and follow-up are separate.
- Inventory keeps product/package, lot, expiry, location, hold, recall, count, and movement history distinct.
- Clinic service selection and site operating hours do not claim clinical activation or appointment availability.
- Backend/API ownership of patient-facing catalog and pricing data should remain.

## Recommended delivery sequence

1. **Verification repair:** correct the medication-administration test fixture/role evidence and the `patientLabel` DOM leak; rerun focused tests and one live administered/not-given journey.
2. **Vaccination vertical slice:** structured vaccine identity + administration evidence + exact lot movement + not-given/history variants + UI + focused tests.
3. **Lab semantics vertical slice:** coded/typed result rows, UCUM code/display, migration/serializer/UI, immutable revision behavior, focused result/follow-up tests.
4. **Cash-pay estimate vertical slice:** versioned estimate, delivery evidence, patient view, invoice comparison, and bounded CMS applicability review.
5. **Scheduling integrity slice:** resource schedules, slots/holds, conflict checks, appointment request linkage, expiry/recovery, and browser journey.
6. **Conditional integrations:** NPI, RxNorm, IIS, FDA recall, barcode, and standardized-assessment work only when the corresponding product workflow is selected.

For every slice, update the [standards applicability matrix](../../docs/development/healthcare-standards.md) with source edition/access date, U.S. applicability, backend mapping, UI behavior, validation, and focused verification. Keep state-specific rules explicitly state-scoped and unknown until checked.

## Verification still required after implementation

- focused backend and frontend tests green at the implementation commit;
- local browser journey showing the new fields and failure/recovery states;
- migration and rollback/recovery evidence for changed clinical records;
- terminology version, licensing, update, and retired-code policy;
- accessibility and tablet-layout review for new forms;
- clinician/pharmacist/lab/billing review appropriate to the changed workflow;
- state-specific IIS, laboratory, professional, and facility requirements where applicable; and
- security/privacy/production review before any real or confidential data.

This audit is product guidance and engineering evidence. It is not legal advice, clinical validation, certification, interoperability conformance, or authorization to operate.

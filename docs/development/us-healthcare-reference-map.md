# U.S. healthcare reference map for Meta Clinic

Reviewed: **2026-09-10**. Purpose: help developers and future agents select a small set of authoritative sources for the feature they are changing. This is a reference map, not a completed feature audit, adopted exchange specification or backlog.

Use with [Standards-guided healthcare development](healthcare-standards.md) and decision D-066. Entries below distinguish what the source describes from our suggested application to Meta Clinic. Source summaries are paraphrases; the linked specification owns exact requirements.

The supplied URLs were starting points for exploration of each organization's wider website, not the boundary of this document. The curated result contains **60 reference entries**. Selection favors concrete relevance to the ambulatory, cash-pay, medication/inventory and patient-workflow product. This is a targeted cross-site survey, not a crawl of every page or a guarantee that no relevant source remains.

## Website exploration coverage

| Website family | Areas explored beyond the supplied page | Where to start in this map |
| --- | --- | --- |
| FHIR Foundation / HL7 | Registry, U.S. Core profiles, clinical notes, screening, provider/site identity, base scheduling and medication resources | R01–R16, R23, R28–R30, R33–R40, R58–R60 |
| NLM and its services | RxNorm technical/API material, RxTerms, DailyMed, Clinical Tables, MedlinePlus Connect, VSAC | R17–R19, R41–R45 |
| UCUM | Unit syntax/semantics, common-unit mappings, release artifacts and functional tests | R20, R46–R47 |
| FDA | Route terms, NDC catalog, CLIA test classification, recalls/openFDA and clinical decision-support guidance | R21–R22, R48–R50 |
| CDC | Vaccination documentation, CVX/IIS, storage, registry messaging, barcodes and outpatient infection prevention | R24–R27, R51–R54 |
| CMS | CLIA, self-pay estimates/disputes, place-of-service codes and provider identifiers | R31–R32, R55–R57 |

**Reading priority:** use entries mapped to the feature being changed now. Registry integration, automated recalls, barcode scanning, external terminology adapters and decision-support functions are **conditional future references**, not requested implementations. Do not read all 60 sources for every task.

## Start with the app area

Routes and file locations were checked against the working checkout on the review date. Concurrent medication implementation was in progress; these are navigation pointers, not claims of tested capability. Parameters such as `:patientId` are placeholders, not literal URLs. Reconfirm paths before editing.

| App area and route | Source entries to read first | Current code entry points |
| --- | --- | --- |
| Clinic setup, sites, hours, intended services: `/clinic/setup` (`/clinic/facilities` alias) | R04; R31–R32 for planned onsite testing | [Facilities](../../apps/web/src/features/clinic/Facilities.tsx), [practice feature settings](../../apps/web/src/features/clinic/PracticeFeatureSettings.tsx), [visit types](../../apps/web/src/features/clinic/VisitTypeSettings.tsx) |
| Schedule/tracking board: `/clinic`, `/clinic/schedule` alias; `/clinic/front-desk` | R05–R07, R09 | [CareFlow](../../apps/web/src/features/clinic/CareFlow.tsx), [tracking board](../../apps/web/src/features/clinic/TrackingBoardPage.tsx), [front desk](../../apps/web/src/features/clinic/FrontDesk.tsx) |
| Patient registration and history: `/clinic/patients`, `/clinic/patients/:patientId` | R08, R10–R12 | [Patients](../../apps/web/src/features/clinic/Patients.tsx), [clinical history](../../apps/web/src/features/clinic/PatientClinicalHistory.tsx), [care models](../../apps/api/app/models/clinic/care/) |
| Encounter, nursing intake, vitals: `/clinic/patients/:patientId/encounters/:encounterId` | R09, R10, R13, R20 | [nurse workspace](../../apps/web/src/features/clinic/NurseEncounterWorkspace.tsx), [vital signs](../../apps/web/src/features/clinic/VitalSignsEntry.tsx) |
| Medication orders and administration inside the encounter | R14–R22; R10 for allergy context | [clinical plan](../../apps/web/src/features/clinic/ClinicalPlanWorkspace.tsx), [administrations](../../apps/web/src/features/clinic/MedicationAdministrations.tsx), [order revision](../../apps/api/app/models/clinic/care/medication_request_revision.rb), [administration operation](../../apps/api/app/services/clinic/care/administer_medication.rb) |
| Vaccination records inside the clinical plan; inventory connection | R23–R27, R20–R22 | [clinical plan](../../apps/web/src/features/clinic/ClinicalPlanWorkspace.tsx), [immunization revision](../../apps/api/app/models/clinic/care/immunization_revision.rb), [inventory](../../apps/web/src/features/inventory/InventoryApp.tsx) |
| Lab orders, patient reports and follow-up; patient/encounter workspace and `/clinic/operations` | R28–R32, R20 | [patient reports](../../apps/web/src/features/clinic/PatientLabReports.tsx), [review worklist](../../apps/web/src/features/clinic/LabReviewWorklist.tsx), [follow-up worklist](../../apps/web/src/features/clinic/LabFollowUpWorklist.tsx), [report versions](../../apps/api/app/models/clinic/care/lab_report_version.rb) |
| Notes, signed/corrected records, Scribe output: encounter and `/clinic/scribe` | R33–R35 | [CareFlow](../../apps/web/src/features/clinic/CareFlow.tsx), [note signing](../../apps/web/src/features/clinic/EncounterNoteSigning.tsx), [Scribe feature](../../apps/web/src/features/scribe/) |
| Diagnoses, procedures, care plans, goals, referral closure | R12, R28, R36–R38 | [clinical plan](../../apps/web/src/features/clinic/ClinicalPlanWorkspace.tsx), [closure panel](../../apps/web/src/features/clinic/ClinicalPlanClosurePanel.tsx), [clinical-plan operation](../../apps/api/app/services/clinic/care/clinical_plan_workflow.rb) |
| Medication catalog, receiving, lots and stock: `/clinic/inventory/*` | R17–R22; R27 for vaccine storage work | [InventoryApp](../../apps/web/src/features/inventory/InventoryApp.tsx), [inventory models](../../apps/api/app/models/clinic/inventory/) |
| Patient previsit information, future structured forms, patient telehealth check-in | R08, R39; R09/R33 for encounter output | [patient portal](../../apps/web/src/features/patientPortal/), [telehealth](../../apps/web/src/features/telehealth/) |
| Optional insurance versus cash billing: `/clinic/billing`, `/clinic/billing/patients`, `/clinic/billing/services`, `/clinic/subscriptions` | R40 only for payer-coverage work | [Billing](../../apps/web/src/features/clinic/Billing.tsx), [service catalog](../../apps/web/src/features/clinic/BillingServiceCatalog.tsx), [subscriptions](../../apps/web/src/features/clinic/subscriptions/) |

Additional routing from the wider website search:

| App question | Read next | Feature boundary |
| --- | --- | --- |
| How should drug search, labels and diagnosis pickers work? | R41–R43, R45 | Medication/history/catalog and diagnosis panels; external lookup adapters are candidates, not verified integrations. |
| Where could discharge instructions link to patient education? | R44 | Clinical plans, follow-up and patient portal; display reviewed links without submitting identifiable clinical records. |
| How do we implement reliable unit selection/validation? | R46–R47 | Vitals, medication dose units and lab results; test only the supported quantities/conversions. |
| How can onsite test scope and product recalls be checked? | R48–R49 | Clinic setup, lab-test catalog and inventory recall/lot workflows. |
| What should be reviewed before Scribe suggests diagnosis/treatment? | R50 | Conditional expansion into decision support; source and intended-use assessment before implementation. |
| What will vaccination registry exchange or scanning require? | R51–R52 | Immunization records, receiving and administration; partner/hardware behavior remains unverified. |
| What might inform encounter precautions and room workflow? | R53–R54 | Nursing workspace, tracking board, room readiness and staff training. Clinical workflow design needs the relevant detailed guidance. |
| What guidance applies to self-pay estimates? | R55 | Front desk, billing estimate snapshots, patient-facing documents and billing support; separate from the optional insurance module. |
| How should site, clinician and organization identities map? | R56–R59 | Setup, clinician attribution, workforce directory and external referrals; directory roles do not grant app permissions. |
| How should screenings connect to responses and observations? | R60 | Structured intake, vitals/observations, care plans and patient portal. |

The route evidence is [App.tsx](../../apps/web/src/App.tsx) (`ClinicPage`) and [clinicNavigation.tsx](../../apps/web/src/features/clinic/clinicNavigation.tsx) (`clinicRoute`). Embedded panels do not necessarily have their own URL. Workforce payroll, cash-drawer arithmetic, subscription prices and UI layout do not acquire requirements merely because a related FHIR resource exists.

## Scope and version key

- **US**: explicitly U.S. guide or U.S. authority. Apply federal/state scope to the actual clinic; a national page does not settle state-specific requirements.
- **US Core**: the linked rolling pages displayed **9.0.0, STU 9, based on FHIR R4** on review. This is an observed edition, not our selected product/integration version. Use its version history to select and record the partner-required published package before implementing an exchange.
- **Base R4 / Base R5**: global technical definitions, respectively **4.0.1 / 5.0.0**. Included only as foundations for the mapped U.S. workflows. They are not U.S. implementation guides. R5 administration is retained because it was supplied as a design reference; it must not silently enter an R4 mapping.
- **Terminology / agency web**: mutable online references; record the actual terminology release or page revision used during implementation. An access date does not identify a terminology release. CDC documentation R24 displayed June 23, 2025; R26 displayed March 11, 2026. Other agency-page revision dates were not consistently captured in this survey.
- **Additional observed editions**: UCUM specification displayed 2.2 (2024-06-17); its common-unit table has a separate version. R42/R43 are Clinical Tables API v3. FDA's R50 landing page displayed final guidance, January 2026. CDC's R51 page displayed March 31, 2026 and pointed to the consolidated HL7 v2.5.1 immunization guide, release 1.5 plus addendum. These do not pin future implementation choices automatically.
- **Review depth**: linked HTML pages were opened for scope, relevant narrative/fields and source routing. This was not exhaustive review of every constraint, download, linked PDF or code-set row. No partner conformance testing or clinical validation occurred.

Only U.S.-applicable information belongs in requirements. Some otherwise relevant pages include international examples or historical/non-U.S. terminology: do not turn those into selectable offerings or workflow rules. Missing U.S. guidance is an explicit gap, not a reason to adopt a foreign guide.

## 1. Finding and interpreting the correct guide

| ID and direct source | Read these parts | Use and limit |
| --- | --- | --- |
| R01 — [FHIR Implementation Guide Registry](https://fhir.org/guides/registry/) — discovery | Registry purpose; follow the relevant published U.S. guide | Find a workflow-specific guide. The registry is international and its dynamic listing did not render in the text retrieval used for this survey; no exhaustive U.S. registry search is claimed. Verify jurisdiction on the actual guide. |
| R02 — [US Core home](https://hl7.org/fhir/us/core/) — US Core | Introduction, How To Read This Guide, profile list and version history | Start here for U.S. clinical-data exchange. Select only the profiles needed for the feature. Newest published does not mean required by our exchange partner. |
| R03 — [US Core Must Support](https://hl7.org/fhir/us/core/must-support.html) — US Core | Mandatory versus Must Support, missing data, actor-specific expectations | Interpret field requirements before deciding what must be stored or entered. Must Support is not a universal instruction to require a field on every form. |

## 2. Service configuration and scheduling

| ID and direct source | Read these parts | Potential product application |
| --- | --- | --- |
| R04 — [HealthcareService R4](https://hl7.org/fhir/R4/healthcareservice.html) — Base R4 | Scope, relationships, `providedBy`, `location`, `type`, `specialty`, availability, referral and appointment fields | Separate an offered service from its site, organization and operating hours in clinic setup. A service offering is not an appointment, performed procedure or price. Use the selected exchange version; the originally supplied [unversioned HealthcareService page](https://hl7.org/fhir/healthcareservice.html) displayed R5. |
| R05 — [Appointment R4](https://hl7.org/fhir/R4/appointment.html) — Base R4 | Scope, status, participants, timing and cancellation fields | Map booking, confirmation, cancellation and no-show concepts. Preserve the distinction between a scheduled visit and an actual encounter; local collision and retry controls remain our implementation responsibility. |
| R06 — [Schedule R4](https://hl7.org/fhir/R4/schedule.html) — Base R4 | Actor, service context, planning horizon and relationship to Slot | Model whose availability is being described: clinician, location or service. Useful when designing schedule exchange; not a mandate to replace the internal scheduling schema. |
| R07 — [Slot R4](https://hl7.org/fhir/R4/slot.html) — Base R4 | Schedule reference, status, start/end and overbooking | Map offered time windows separately from booked appointments. Review before adding external slot search; do not infer that a displayed slot is reserved. |

## 3. Patient identity, chart history and encounter observations

| ID and direct source | Read these parts | Potential product application |
| --- | --- | --- |
| R08 — [US Core Patient](https://hl7.org/fhir/us/core/StructureDefinition-us-core-patient.html) — US Core | Identifiers, names, demographics, address/language guidance and terminology | Registration, patient matching and exchange mapping. Keep identifier system with value; do not infer identity from name alone. Review additional certification-specific elements separately from basic product requirements. |
| R09 — [US Core Encounter](https://hl7.org/fhir/us/core/StructureDefinition-us-core-encounter.html) — US Core | Status, class, type, patient, participants, period and location | Chart context, site/clinician attribution and visit timeline. Map internal tracking-board states explicitly instead of assuming they equal FHIR encounter statuses. |
| R10 — [US Core AllergyIntolerance](https://hl7.org/fhir/us/core/StructureDefinition-us-core-allergyintolerance.html) — US Core | Clinical/verification status, substance, reaction and no-known-allergy guidance | History entry and medication prechecks. Distinguish not asked/unknown from confirmed no known allergies. The representation does not supply a complete drug-interaction or allergy-alert engine. |
| R11 — [US Core problems and health concerns](https://hl7.org/fhir/us/core/StructureDefinition-us-core-condition-problems-health-concerns.html) — US Core | Condition categories, clinical/verification status, code, onset and patient | Longitudinal problem lists and active/resolved history. Do not silently convert every visit diagnosis into a permanent problem. |
| R12 — [US Core encounter diagnosis](https://hl7.org/fhir/us/core/StructureDefinition-us-core-condition-encounter-diagnosis.html) — US Core | Diagnosis category, encounter association, code and status | Encounter diagnosis revisions and links to clinical plans. Pair with R11 when designing movement between visit diagnoses and longitudinal problems. |
| R13 — [US Core Vital Signs](https://hl7.org/fhir/us/core/StructureDefinition-us-core-vital-signs.html) — US Core | Observation codes, timing, values/components, units and specific vital-sign profiles | Nursing measurements, trends and missing-value handling. Pair with R20 for units; profile structure does not provide patient-specific normal ranges or clinical alert thresholds. |

## 4. Medication ordering, administration and inventory terminology

| ID and direct source | Read these parts | Potential product application |
| --- | --- | --- |
| R14 — [US Core MedicationRequest](https://hl7.org/fhir/us/core/StructureDefinition-us-core-medicationrequest.html) — US Core | Status, intent, medication, patient, requester, timing and dosage guidance | Medication order revisions and medication-list exchange. An order is separate from dispensing, reported use and administration; do not infer a performed dose from an active order. |
| R15 — [MedicationAdministration R4](https://hl7.org/fhir/R4/medicationadministration.html) — Base R4 | Status/reason, subject/context, effective time, performer, request and dosage | Actual administration and not-done outcomes; relationship to the order and encounter. Inventory allocation and wastage require explicit local mapping rather than treating administered dose and stock depletion as identical. |
| R16 — [MedicationAdministration R5](https://hl7.org/fhir/R5/medicationadministration.html) — Base R5 | Scope, resource structure and R4 comparison; occurrence/recording and dosage fields | Design comparison for the supplied R5 reference. Read only when comparing versions or implementing an explicitly selected R5 exchange; it is not a US Core R4 profile. |
| R17 — [NLM RxNorm overview](https://www.nlm.nih.gov/research/umls/rxnorm/index.html) — US terminology | Normalized drug concepts, documentation and access links | Medication search, identity and vocabulary mapping. RxNorm is not the authority for stock lots, pricing, dosing recommendations or interaction severity. |
| R18 — [RxNorm technical documentation](https://www.nlm.nih.gov/research/umls/rxnorm/docs/techdoc.html) — US terminology | Concept identifiers, term types, drug names, relationships and release files | Preserve RXCUI and concept meaning; distinguish ingredient, strength, dose form and branded/generic concepts. Review release/version and licensing details before choosing a catalog import. |
| R19 — [RxNorm API documentation](https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html) — US technical service | Lookup/search functions, identifier mapping, concept status and version functions | Future server-side search or normalization adapter. Read the exact operation before integration; this reference does not establish that Meta Clinic has an RxNorm integration. |
| R20 — [UCUM specification](https://ucum.org/ucum) — global terminology for U.S. quantitative data | Syntax, case-sensitive codes, prefixes, semantics and unit tables | Medication dose units, vital signs and lab results. Store value, machine code and display label distinctly. Validate dimension/precision; mass-to-volume dosing also needs verified concentration and cannot be derived from unit codes alone. |
| R21 — [FDA Route of Administration](https://www.fda.gov/drugs/data-standards-manual-monographs/route-administration) — US terminology | Definitions and Data Values: term, short name, FDA code, NCI concept ID | Route picker/mapping for orders and administrations. The page includes older revision history; verify the target profile's binding and current terminology source. A route vocabulary does not authorize a route for a particular drug. |
| R22 — [FDA National Drug Code Directory](https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory) — US catalog | About the directory, limitations, product/package definitions and format-change references | Existing NDC search/import, medication packages and catalog identifiers. Directory inclusion is not FDA approval, reimbursement eligibility or proof of available stock. Do not hard-code a future NDC format from an undated assumption. |

## 5. Vaccination documentation and inventory

| ID and direct source | Read these parts | Potential product application |
| --- | --- | --- |
| R23 — [US Core Immunization](https://hl7.org/fhir/us/core/StructureDefinition-us-core-immunization.html) — US Core | Status, vaccine code, patient, occurrence, primary source and guidance | Vaccination records distinct from generic medication administration, including historical versus administered-here context. Check the profile and CDC requirements together. |
| R24 — [CDC: After Giving Vaccine](https://www.cdc.gov/vaccines/hcp/administration/after.html) — US agency | Documentation; adverse-event documentation and patient record guidance | Candidate data: administration date, manufacturer, lot, vaccinator, record-facility address, VIS edition date and date provided. Read the covered-vaccine applicability in the source; do not label every recommendation as a universal legal requirement. |
| R25 — [CDC CVX code set](https://www2.cdc.gov/vaccines/iis/iisstandards/vaccines.asp?rpt=cvx) — US terminology | Vaccine concept, status and code-set notes; relationship to manufacturer codes | Vaccine identity and import mapping. Do not populate a selectable U.S. administration catalog from every row: code sets can include historical/non-U.S. concepts needed to interpret prior records. Historical recording and currently offered U.S. products need separate policies. |
| R26 — [CDC IIS immunization data elements](https://www.cdc.gov/iis/core-data-elements/immunizations.html) — US exchange guidance | Lot/expiration, manufacturer, record type, refusals, VIS and funding sections | Determine what vaccination history and future registry adapters need. Funding/program fields apply only to relevant programs; verify the actual state registry's interface. Its HL7 v2 mappings do not imply a FHIR endpoint. |
| R27 — [CDC storage and handling resources](https://www.cdc.gov/vaccines/hcp/storage-handling/resources.html) — US agency, resource index | Toolkit resources, SOP worksheet and temperature resources | Starting point for vaccine inventory locations, excursion handling and storage evidence. Linked PDFs were not reviewed in this survey; read the current toolkit and product instructions before deriving temperature limits or stock-release behavior. |

## 6. Orders, laboratory reports and onsite testing

| ID and direct source | Read these parts | Potential product application |
| --- | --- | --- |
| R28 — [US Core ServiceRequest](https://hl7.org/fhir/us/core/StructureDefinition-us-core-servicerequest.html) — US Core | Request status/intent, code, patient, encounter, requester and timing | Lab/referral/procedure orders and clinical-plan links. A request is not evidence of performance, a received report or completed follow-up. |
| R29 — [US Core Laboratory Result Observation](https://hl7.org/fhir/us/core/StructureDefinition-us-core-observation-lab.html) — US Core | Test code, status, effective time, value, units and result guidance | Individual result rows and value types. Read terminology bindings and R20; keep source-provided units, flags and reference ranges rather than inventing normal ranges. |
| R30 — [US Core laboratory DiagnosticReport](https://hl7.org/fhir/us/core/StructureDefinition-us-core-diagnosticreport-lab.html) — US Core | Report code/status, patient, effective/issued times, result links and presented report | Report grouping, attachments and preliminary/final/amended/corrected history. Internal review and patient-contact follow-up remain distinct from the external report status. |
| R31 — [CMS: Getting Started with CLIA](https://www.cms.gov/medicare/health-safety-standards/clinical-laboratory-improvement-amendments-clia/getting-started-clia) — US agency | Testing applicability, certification and linked complexity guidance | Clinic setup when considering onsite testing. Determine actual testing activity; coordinating an external lab and performing testing onsite are different requirements questions. This is not a lab-result schema. |
| R32 — [CMS: Apply for a CLIA Certificate](https://www.cms.gov/medicare/health-safety-standards/clinical-laboratory-improvement-amendments-clia/getting-started-clia/apply-clia-certificate) — US agency | U.S. facility application, certificate type, test complexity, director and state-agency sections | Candidate setup evidence: site, certificate type/identifier, scope and verification state. Software selection is not a certificate. Exclude the page's international-laboratory sections; confirm state-specific requirements for the actual clinic. |

## 7. Notes, care plans, procedures and structured intake

| ID and direct source | Read these parts | Potential product application |
| --- | --- | --- |
| R33 — [US Core Clinical Notes guidance](https://hl7.org/fhir/us/core/clinical-notes.html) — US Core | Clinical-note exchange, document/report selection and note types | Map clinician notes and reviewed Scribe output to exchange artifacts. It does not prescribe a SOAP page layout or authorize automatic signing of generated text. |
| R34 — [US Core DocumentReference](https://hl7.org/fhir/us/core/StructureDefinition-us-core-documentreference.html) — US Core | Document status, type/category, patient, author, date, context and content | Chart documents and note metadata. Keep attachment content/format and document identity distinct from internal signing and revision controls. |
| R35 — [US Core Provenance](https://hl7.org/fhir/us/core/StructureDefinition-us-core-provenance.html) — US Core | Target, recorded time and agents/author organization | Authorship and source attribution for imported or revised chart data. Clinical data provenance does not replace access auditing or the application's authorization checks. |
| R36 — [US Core CarePlan](https://hl7.org/fhir/us/core/StructureDefinition-us-core-careplan.html) — US Core | Status, intent, category, patient and narrative | Care-plan revisions and patient instructions. Assess which structured activities the selected workflow needs rather than interpreting a narrative baseline as complete workflow coverage. |
| R37 — [US Core Goal](https://hl7.org/fhir/us/core/StructureDefinition-us-core-goal.html) — US Core | Lifecycle, description, patient, start/target dates and author | Goal revisions and follow-up planning. A recorded target is not a measured outcome or automatically completed care. |
| R38 — [US Core Procedure](https://hl7.org/fhir/us/core/StructureDefinition-us-core-procedure.html) — US Core | Status, code, patient, performed timing and performer guidance | Office-procedure documentation; distinguish planned work, a service request and a performed event. Professional authorization and detailed clinical protocols require their own sources. |
| R39 — [US Core QuestionnaireResponse](https://hl7.org/fhir/us/core/StructureDefinition-us-core-questionnaireresponse.html) — US Core | Questionnaire identity, response status, subject, authored time and answer items | Future structured intake/questionnaires and mapping from patient responses. Current previsit notes should not be assumed to implement this profile. A recorded answer is not automatically a clinician-verified finding. |

## 8. Optional insurance boundary

| ID and direct source | Read these parts | Potential product application |
| --- | --- | --- |
| R40 — [US Core Coverage](https://hl7.org/fhir/us/core/StructureDefinition-us-core-coverage.html) — US Core | Coverage status, beneficiary, subscriber/member identifiers and payor | Read when working on the optional insurance module. It does not determine cash-pay prices, membership terms, ledger balances, eligibility responses, prior authorizations or claims processing. Those need separately selected requirements and exchange guides. |

## 9. NLM resources beyond RxNorm

| ID and direct source | Read these parts | Potential product application and limit |
| --- | --- | --- |
| R41 — [DailyMed](https://dailymed.nlm.nih.gov/dailymed/index.cfm) — US labeling | Human-drug search, About DailyMed, label archives and application-development links | Connect medication/catalog entries to the exact product's submitted labeling, including strength/form and relevant handling information. Filter to human products. Landing-page review only: no individual label or dose recommendation was validated; record label identity/version when using one. |
| R42 — [NLM Clinical Tables RxTerms API v3](https://clinicaltables.nlm.nih.gov/apidoc/rxterms/v3/doc.html) — US terminology/service | Drug-name/route display pairs, strengths/forms, query parameters and returned fields | Candidate medication autocomplete for orders/history, with backend-owned code/label mapping. It is search terminology, not an electronic prescription network or dosing engine. API pagination and unknown results need explicit handling. |
| R43 — [NLM Clinical Tables ICD-10-CM API v3](https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html) — US diagnosis terminology/service | Dataset edition, searchable fields and response format | Candidate diagnosis search in clinical-plan/history panels. Keep code-system version and applicable service date; a found code does not determine whether it is clinically correct or payable. Do not substitute another country's ICD modification. |
| R44 — [MedlinePlus Connect](https://medlineplus.gov/medlineplus-connect/) — NLM patient education | How coded clinical concepts connect to consumer health information; implementation and usage-policy links | Patient education links for diagnoses, medicines and lab tests in follow-up/portal views. This is a potential integration, not evidence that patient education is implemented. Verify returned content, language and permitted use; never send patient identity or free-text chart data during source research. |
| R45 — [NLM Value Set Authority Center](https://vsac.nlm.nih.gov/) — US value-set service | Search/retrieve value sets, versions, expansion and account/access documentation | Resolve specific terminology bindings referenced by U.S. profiles. Preserve value-set identity, version and code-system versions. Public landing material was reviewed; protected downloads and licensed contents were not accessed. |

## 10. Implementing UCUM correctly

| ID and direct source | Read these parts | Potential product application and limit |
| --- | --- | --- |
| R46 — [Common units](https://ucum.org/docs/common-units) and [release artifacts](https://ucum.org/docs/artifacts) — global technical foundations for the U.S. quantitative workflows above | Common-unit mapping scope/version/license; `ucum-essence.xml` versus specification/source files | Inform curated unit pickers and machine-readable validation for vitals/labs/doses. Common units are not the entire standard; do not turn an unrestricted technical list into a clinical picker. Downloads were not imported or tested. |
| R47 — [UCUM functional tests](https://ucum.org/docs/functional-tests) — global technical validation reference | Validation, display and conversion tests; version/history and conformance limits | Evaluate a unit parser/converter if one is adopted. Passing a selected test set is not proof of all UCUM behavior or safe clinical calculations. Test artifacts were not executed in this documentation task. |

## 11. FDA product, laboratory and software references

| ID and direct source | Read these parts | Potential product application and limit |
| --- | --- | --- |
| R48 — [FDA IVD public databases](https://www.fda.gov/medical-devices/ivd-regulatory-assistance/public-databases) — US test categorization | CLIA database, currently waived tests and search dimensions | Identify the exact test system's classification before designing onsite-test configuration. Pair with CMS R31/R32; never infer waived status from a generic analyte name or grant a clinic certificate from a test lookup. No particular device/test was checked. |
| R49 — [FDA Enforcement Reports](https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts/enforcement-reports) and [openFDA drug-enforcement API](https://open.fda.gov/apis/drug/enforcement/) — US recalls | Classification/timing, report history and API dataset scope | Candidate inventory recall matching against product/lot information, preserving the external notice and review status. Reports may follow earlier firm notifications; absence of a match does not prove stock is safe. API recall monitoring is not implemented by this map. |
| R50 — [FDA Clinical Decision Support Software guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software) — US software guidance | Intended-function scope, current final guidance and examples in the linked document | Consult if Scribe/clinical-plan work expands into patient-specific diagnosis, treatment or risk recommendations. Landing-page scope reviewed only; the full guidance and function-specific assessment remain to read. No device/non-device determination is made here. |

## 12. CDC workflow and exchange references

| ID and direct source | Read these parts | Potential product application and limit |
| --- | --- | --- |
| R51 — [CDC IIS HL7 implementation-guide hub](https://www.cdc.gov/iis/technical-guidance/hl7.html) — US immunization messaging | Consolidated guide/version, addendum and change/issue information | Starting point for vaccination-registry messages and responses. The hub identifies HL7 v2.5.1, so do not assume FHIR-only exchange. Full linked guide and actual state interface were not reviewed; read both before implementing. |
| R52 — [CDC vaccine 2D barcode toolkit](https://www.cdc.gov/iis/2d-barcodes/implementation-toolkit.html) — US workflow guidance | Technical guides for administration/inventory; unit-of-sale versus unit-of-use NDC/lot brief | Candidate scanning in receiving and administration. The hub identifies packaging/lot distinctions worth investigating; full technical PDFs and scanner compatibility were not reviewed. A scan should not itself post an administration or stock movement. |
| R53 — [CDC Standard Precautions](https://www.cdc.gov/infection-control/hcp/basics/standard-precautions.html) — US clinical operations | Recommendation categories, including PPE, respiratory hygiene, equipment and environmental handling | Inform clinician-reviewed precaution labels, nursing handoff and room-readiness requirements. A tracking-board indicator cannot establish that a physical safety action occurred. Do not derive a complete isolation protocol from this overview. |
| R54 — [CDC outpatient infection-prevention guide](https://www.cdc.gov/healthcare-associated-infections/hcp/prevention-healthcare/outpatient-expectations.html) — US ambulatory operations | Scope and linked guide/checklist | Relevant when designing operational checklists, room turnover or staff training evidence. Landing page reviewed; the detailed guide/checklist PDFs were not reviewed. This entry identifies the next source to inspect, not completed clinical requirements. |

## 13. CMS cash-pay and provider/site identity references

| ID and direct source | Read these parts | Potential product application and limit |
| --- | --- | --- |
| R55 — [CMS provider payment resolution with patients](https://www.cms.gov/initiatives/no-surprise-billing/overview/policies-resources/providers-payment-resolution-patients) — US self-pay guidance | Good faith estimates for uninsured/self-pay people; provider guidance, model notices and dispute process links | High relevance to cash-pay estimates, scheduled services, versioned estimate documents, delivery evidence and billing-support history. Determine current applicability and timing from the detailed guidance before implementing rules. An invoice or price list is not automatically a compliant good faith estimate. Linked PDFs were not reviewed. |
| R56 — [CMS Place of Service codes](https://www.cms.gov/medicare/coding-billing/place-of-service-codes/code-sets) — US billing terminology | Office/clinic and telehealth setting definitions; code effective dates | Map place of service when optional payer billing requires it. Keep physical location, visit modality and billing code distinct. Codes do not select a clinic's business model, payer rate or eligibility. |
| R57 — [CMS National Provider Identifier standard](https://www.cms.gov/regulations-and-guidance/administrative-simplification/nationalprovidentstand) — US provider identifiers | NPI meaning, identifier format and related resources | Provider/organization identifiers for referrals and future billing/exchange. NPI numbers do not encode specialty or state; an identifier is not proof of licensure, employment, privileges or app authorization. |

## 14. More HL7 U.S. profiles for directory and intake work

| ID and direct source | Read these parts | Potential product application and limit |
| --- | --- | --- |
| R58 — [US Core PractitionerRole](https://hl7.org/fhir/us/core/StructureDefinition-us-core-practitionerrole.html) — US Core | Practitioner/organization/location associations, role, specialty and contact | Clinician attribution, referral directory and site assignment. A clinical directory role describes work context; it is not Meta Clinic's permission role or payroll classification. |
| R59 — [US Core Organization](https://hl7.org/fhir/us/core/StructureDefinition-us-core-organization.html) and [Location](https://hl7.org/fhir/us/core/StructureDefinition-us-core-location.html) — US Core | Organization identifiers/contact; location identity, address and organization relationship | Clinic setup, external-lab/referral identity and multi-site data exchange. Preserve organization versus physical site versus tenant membership as distinct concepts. |
| R60 — [US Core Screening and Assessments](https://hl7.org/fhir/us/core/screening-and-assessments.html) — US Core | QuestionnaireResponse/Observation relationships and screening/assessment guidance | Structured previsit questionnaires, screening results and links to goals/plans. Distinguish answers from interpreted results and clinician conclusions. Do not invent scoring or treatment thresholds from an exchange model. |

## Suggested reading bundles

These are product-design inferences from the sources, not claims that the app already satisfies them.

- **Improve medication administration:** R14 + R15 + R18 + R20 + R21, then R22 for the stock link. Map the order, actual outcome/time, dose/unit, route/site, performer, reason and lot allocation to owning backend fields and visible controls. Check whether a value is inherited or entered before adding a field. Keep dose quantity separate from inventory quantity.
- **Design vaccination entry:** R23 + R24 + R25 + R26. Map vaccine concept, historical/administered-here source, event status, manufacturer/lot, vaccinator and VIS evidence. Use R27 only if storage/excursion behavior is in scope; review its underlying documents first.
- **Improve lab-result handling:** R28 + R29 + R30 + R20. Trace order to report to individual result to review/follow-up; preserve corrected report history. Add R31/R32 only for onsite testing configuration, not as substitute result definitions.
- **Improve clinic setup:** R04 + R06, then the sources specific to selected services. Separate intended offering, actual site availability and documented operational readiness. Service selection should not imply a clinical workflow is approved.
- **Improve cash-pay estimates:** R55, then the applicable linked CMS guidance/model notices. Map estimate identity/version, scheduled service, expected charge detail, delivery and later bill comparison; classify product choices separately from sourced requirements.
- **Add a terminology picker:** R18/R42 for drugs or R43/R45 for diagnoses/value sets. Preserve machine identifiers behind readable labels and explicit unknown/unavailable states. Source lookup is not clinical selection or authorization to add a live provider dependency.

## Using and maintaining this map

Choose the app row, open two to five relevant entries, and follow the requirement-mapping procedure in [healthcare-standards.md](healthcare-standards.md). Record exact published versions, source sections, U.S./state applicability, field origins and focused verification. Reopen mutable pages before relying on them; do not treat this review date as permanent validation.

When the needed topic is absent, search the relevant organization's broader website and its official services using generic feature terms. Treat the supplied page as an entry point, follow topic navigation, and inspect the actual relevant page. Continue applying U.S. scope to each result and linked document; a foreign-country page on an official international website is not eligible merely because the domain is authoritative.

For each change, report: sources actually read; requirements versus recommendations versus product choices; affected model/API/page; deliberate deviations; and unresolved gaps. Reconfirm local file paths when components move. Extend this map only with a concrete app use and reviewed official source, maintaining stable R-identifiers.

No state-specific legal review, payer integration guide selection, electronic-prescribing protocol review, vaccine forecasting protocol, comprehensive clinical decision support, or retrospective product conformance audit was performed here. Look up the applicable U.S. source when one of those becomes the authorized task; this map does not fill that gap by analogy.

# Weight-loss clinic setup and connected patient journey

Revision 4 · 2026-09-14 · D-078 architecture and clinic/team/FDE change tiers adopted; this follow-on assignment remains planning-only, not dispatched.

## Current assignment — supersedes the earlier gap-only priority

Create a NEW independently synthetic weight-loss clinic through **Clinic Setup**, and demonstrate one continuing patient's membership-to-follow-up journey in it. Selecting **Weight loss** must persist configuration that changes intake, available visit types, relevant encounter components and follow-up behavior. A renamed PILOT clinic, decorative specialty label, or isolated passing workflow tests do not satisfy this assignment.

This is a bounded implementation-and-proof plan for a future explicitly authorized run. Preserve the original plan's detailed questions, controls and T01–T10 cases. This revision's setup-first and entry-to-return acceptance supersedes any narrower handover-only priority below. Do not build another app, duplicate shared records/boards or introduce a general-purpose workflow designer.

D-076 adds a current architecture constraint: use the strategy's [shared-core/clinic capability map](APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md#shared-core-and-composable-capabilities--d-076) and the [configurable capability contract](docs/development/meta-clinic-build-and-acceptance.md#configurable-capability-contract). Weight loss is the first working composition, not hardcoded specialty branches throughout the app. Separate specialty, modality, payment and operational capabilities; update Clinic Setup with every configurable addition. Verify telehealth-only configuration does not require physical room/chair/arrival. Infusion forecasting, chair scheduling, other specialty builds and insurance authorization prediction remain future examples, not added implementation scope for this assignment.

### Current source baseline and reuse

D-078 and the [capability architecture](docs/architecture/clinic-capability-architecture.md) supersede the prior broad switching proof. Use one non-switchable core, setup-time composition and operation-specific clinic-managed, Meta Clinic-managed or FDE-assisted changes. Finalize the new clinic's setup, reject a protected edit by clinic staff, and prove a permitted setting change while its fresh synthetic history/open work remain valid. Show the team/FDE request or documented handoff for unsupported changes without building a general reconfiguration platform. For the touched form/plan/note, retain exact revision-used evidence; no full infusion/treatment-plan expansion.

There are no real users. The source notes below describe candidates, not target constraints. Reuse, refactor or replace after bounded inspection; do not preserve weak structures or migrate old synthetic fixtures merely because they exist. Historical integrity is prospective product behavior tested with records created for this journey. A reset needs explicit environment/target authority and reconstruction scope; this brief does not grant blanket deletion permission. Avoid parallel authoritative stores during a replacement.

Inspected planning baseline: main `76c2b47e720e`; prior implementation `af52f9a`. No application tests or browser walkthrough were run for this revision.

- `apps/api/app/services/clinic/configuration/practice_features.rb`: practice-scoped, versioned settings with stale-revision and request-id checks; clinic types do not include weight loss at the inspected baseline. Assess reuse/refactor/replacement; retain one authoritative settings owner, not necessarily the current implementation.
- `apps/web/src/features/clinic/PracticeFeatureSettings.tsx`: reads/writes `/api/clinic/practice_features`; currently selects clinic type, services and assessments. A meaningful preset requires downstream behavior, not just another select option.
- `apps/api/app/services/clinic/care/previsit_intake.rb`: the shared `meta-clinic-previsit-v3` contains weight-management prior approaches plus goals/measurements. Resolve new forms from effective clinic configuration; reuse the existing renderer and save/review flow, preserving historical forms and answers.
- Reuse existing storefront/Growth, Patient Flow/WorkInbox, patient/encounter, clinical-plan, ServiceRequest/report, stock/handover, billing and follow-up owners. The evidence table below remains reusable within its stated boundaries.

New-clinic provisioning was not established by this bounded inspection. First identify the existing authorized creation path and practice-versus-location ownership. The intended result is a distinct clinic/practice configuration with its own usable location, not an inventory storage destination or a silent change to another clinic. If Clinic Setup cannot create it, implement the smallest setup entry using existing tenant/provisioning mechanisms. Do not expose unrestricted tenant creation or invent cross-tenant permissions. Stop only that branch if new authority or a wider provisioning redesign is required.

### Meaningful specialty configuration

The following is the implementation design for the requested behavior, not a clinical protocol. Preview changes before applying. Persist preset/version, owning clinic, created-record links and request identity; apply transactionally or with explicit recoverable progress. Reapplying must not duplicate records or overwrite administrator customizations. Capture exact owning models/endpoints in the initial execution checkpoint.

| Clinic Setup choice | Persisted effect using existing owners | Observable workflow change |
| --- | --- | --- |
| New clinic, location and Weight loss | Authorized new clinic/location and effective specialty/preset revision | Correct clinic context and branded membership entry survive reload/sign-in. |
| Apply starter preset | Versioned specialty intake plus clinic-owned initial/follow-up visit-type configuration | Scheduling offers explicit weight-loss initial/follow-up visits; intake differs by visit purpose, not the first generic configured visit type. |
| Membership offering | Draft offer/template linked to services; admin supplies amount, currency, interval and terms through existing catalog | Clinic's own reviewed offer appears in its storefront. Specialty selection alone neither publishes an offer nor activates membership. |
| In-person and/or telehealth | Existing service, modality, site/provider and availability settings | Appropriate booking/room/join actions with one shared history; enabling telehealth does not provision a vendor or prove media works. |
| Weight-management context | Existing answers/measurement records and source-linked read model | Goals, prior approaches and barriers in intake; dated, unit-aware weight history and goal context inside existing encounter/follow-up views. No duplicate measurement ledger. |
| Clinic-selected labs, medication and fulfillment services | Existing catalogs, permitted services and inventory configuration | Relevant order/pharmacy or in-house handover components appear when configured. No automatically chosen drug, dose, panel or clinical eligibility rule. |
| Follow-up | Clinic-defined timing when supplied; eligible team mapping and source-linked existing tasks | Return intake emphasizes changes/progress. Unspecified timing stays unspecified; open tasks remain visible after encounter closure. |

Do not activate all services silently. Review suggested settings before applying. Disabling an optional service affects new actions but must not hide history or unfinished work. Enforce availability on the backend as well as the UI. Preserve other clinics unless intentionally reconfigured. Use stable versioned templates and existing configuration, not a new rule language/form-builder project.

### Supplemental U.S. research and exact field requirements

Opened 2026-09-14:

- **WL-R1:** [NIDDK, Choosing a Safe & Successful Weight-loss Program](https://www.niddk.nih.gov/health-information/weight-management/choosing-a-safe-successful-weight-loss-program), current public U.S. patient guidance, no numbered technical version established; sections “Talk with your health care professional about your weight,” “Guidance and support for adopting healthy habits,” and “A plan for keeping the weight off.” Recommendations support relevant history, medicines, goals/barriers and ongoing progress. Numerical targets and example monitoring cadence are not adopted as software gates.
- **WL-R2:** [US Core QuestionnaireResponse 9.0.0 / STU 9](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-questionnaireresponse.html), published trial-use, FHIR R4, U.S.; “Mandatory and Must Support Data Elements” and “Profile Specific Implementation Guidance.” Map form/question identity, status, patient, gathered date and author/source to existing versioned responses. Exchange requirements are not universally required signup answers or a claim of conformance.

The attempted body-weight profile lookup was unavailable. Units below retain the original plan's dated design; reopen its applicable U.S. vital-sign/UCUM references before substantive measurement-model changes. Other original R01–R16 references remain dated context, not freshly reviewed here. No reviewed healthcare guide specifies our preset, UI layout or commercial prices: those are product design choices. Clinic clinical policies and actual partner mappings remain unresolved rather than invented.

Common contract: inherit authorized clinic/patient/encounter context; record actor, source, time and form/config version. Patient answers do not become clinician findings automatically. Incomplete drafts save. Preserve unknown/declined/not-applicable/negative where relevant. Corrections retain history and invalidate only affected review. Show recorded dates; no invented expiry or clinical threshold.

| ID / question or label | Owner, origin, control, visibility and writer | Action prerequisite and recovery |
| --- | --- | --- |
| WL-F1: Clinic name, location, specialty, services, visit type, membership terms, responsible team | Existing clinic/location/config/catalog records; admin-entered text, bounded specialty/service/modality selects, searchable scoped team/site references; positive integer visit-duration minutes, typed amount/currency and existing interval controls. Preset identity inherited. | Incomplete setup can be retained; publishing offer/opening slots requires only its actual prerequisites. “Choose a location for this visit type.” Stale save: “Settings changed. Review the latest version before applying.” Preserve draft and retry identity. CF-01/02, OP-05. |
| WL-F2: “What would you like help with?”; “What have you tried for weight management?”; “What made it difficult to continue?” | Existing versioned intake; patient or authorized staff on behalf with source distinction. Narrative plus explicit absence state. Weight-loss questions only in applicable new form definition. WL-R1/2. | Draft answers optional; existing submission attestation remains. “Saved as a draft. You can finish later.” Earlier forms retain IDs/meaning: “This response uses an earlier form version.” No universal visit hold. CV-01/02, CF-03. |
| WL-F3: “Have your medicines, supplements, allergies or health history changed?”; “Is there anything about eating, activity or sleep you want to discuss?” | Existing history/medication/allergy owners and intake links; yes/no/unknown/declined selection with conditional explanation, existing catalog/narrative controls. Patient reports; staff reviews separately. WL-R1/2. | Do not recollect unchanged histories or add a daily diary. “Describe the change, or save it for discussion at your visit.” No-change answer is not clinical reconciliation; missing data blocks only a defined dependent action. CV-01/02, RX-01/02. |
| WL-F4: Weight, height when needed, measurement time/source | Existing measurements; decimal plus kg/[lb_av] or cm/[in_i] unit select, date/time, self-reported/measured source. Patient or authorized staff; preserve original units and provenance. | Reject nonnumeric/nonpositive or unsupported-unit values: “Enter a value greater than zero and choose a supported unit.” Missing is not zero. Trend only comparable valid observations; no automatic BMI treatment gate. CV-01/02. |
| WL-F5: “What has changed since your last visit?”; progress/barriers; agreed next step; follow-up timing | Existing return intake, clinical-plan and task records. Narrative changes, inherited baseline, date/existing interval input and eligible-team reference. Patient describes; clinician records plan; authorized staff schedules. WL-R1/2. | Preserve baseline; create new response/version on return. Timing may remain undefined with visible owned outreach. “Choose a responsible team, or resolve the assignment exception.” No inferred due date/urgency. OP-02–05/12. |

Retain original sections 1–10 for every unchanged stage. Before changing a field, record its exact owning model/API, source interpretation, stale handling and paired test. Rx/lab/stock/payment fields reuse established owners and catalogs; missing vendor contracts block external sending, not local preparation.

### Execution sequence and required connected proof

1. Reconcile current provisioning, configuration, forms and visit-type owners plus reusable evidence; record the actual baseline. Do not re-audit the whole app.
2. Implement setup-to-workflow behavior, finalization/change-tier enforcement and missing specialty components through shared owners. Select a clean scoped design; prove prospective behavior, not compatibility with every legacy fixture.
3. Through Clinic Setup create the NEW synthetic clinic/location; configure explicit initial/follow-up visits, staff/availability, membership offer and selected services. Record actual IDs/version. Synthetic example amounts/services are fixture choices, not clinical/commercial recommendations.
4. Complete the connected path below and repair actual scoped gaps. One runtime/database/browser writer; separate safe source work only when ownership is clear.
5. Run one consolidated focused verification pass and hand off evidence. Avoid duplicate audits and broad regression.

| Case / owning tracker and matrix | Required observation |
| --- | --- |
| J0 — MC-01/13/15; CF-01–04 | Browser creates clinic/location via Setup, applies Weight loss, finalizes and reloads resulting visit types/forms/components. Protected clinic edit is denied; permitted setting change succeeds. Show honest team/FDE routing. Retry does not duplicate; wrong-role/other-clinic writes fail. A separate supported configuration has no cross-clinic effects; no legacy-fixture migration required. |
| J1 — MC-02/09; EN-01–09, OP-01 | NEW clinic's public offer → same adult account → payment handoff → server-evidenced local test/simulator activation. Redirect or direct status edit is not proof. Separate unpaid never-member and former-member fixtures prove booking/callback branches. |
| J2 — MC-04/05/12; CV-01/02, SC-01 | Same patient saves/reopens weight-loss intake, supplies synthetic goals/measurements/history and books the explicit initial visit. Staff sees correct context and outstanding work. |
| J3 — MC-05/06/07; CV-03–10 | Same patient's initial visit and return cover in-person and telehealth variants; handoff, goal/weight context, manual and existing scribe paths retain encounter links. Touched content has an exact revision-use link; newer content does not rewrite prior use. Unavailable media/scribe gets local intent/manual fallback evidence, never a live-media claim. |
| J4 — MC-06/10/11/15; RX-01–03, LB-01–03, IN-01–03, OP-06–08 | Clinic-selected synthetic prescription reviewed with outside-pharmacy destination, such as a synthetic Walmart destination, and honest disconnected state. Alternate in-house route demonstrates stock/lot, partial handover/remainder/reversal without double fulfillment. Explicit synthetic lab selection, no imposed clinical panel. |
| J5 — MC-06/12; LB-03–07, OP-02–05 | Pending labs do not block otherwise permitted scheduling/visit. Source-labeled local result, review and contact remain separate. Rx/lab/billing/follow-up open together with visible owners, exact blockers and allowed next actions. |
| J6 — MC-08/09/11/12; IN-03, OP-01/10/12 | Checkout and recurring state follow owning money evidence. Closure/reload preserves outstanding work; partial fulfillment and corrected post-closure report reconcile on existing source-linked tasks. |
| J7 — MC-04/05/12; CV-01/02, OP-02–05/12 | SAME patient returns for explicit weight-loss follow-up with baseline, changed answers, order history, progress and next steps. Separate staff/walk-in branch proves no forced membership or invented appointment. |

Do not create a new patient at every stage. Separate fixtures only for incompatible branches. Reuse valid API recovery proof rather than exercising every permutation in the browser. J0–J7 must have a source/configuration/evidence crosswalk with clinic and continuing-patient IDs. A generic PILOT demonstration is insufficient.

Complete only when the new clinic, meaningful setting-driven behavior, change-tier boundaries and all required LOCAL connected transitions are evidenced, with historical meaning preserved for records used in the proof. Preserving every earlier development fixture is not required. Required blocked local steps stay incomplete. Missing live vendor/media acceptance stays separately labeled and does not authorize purchases, fake confirmations or sending backlog. Patient Flow must expose ownership, exact blocked action, independent work and resolution throughout and after closure. The 10-minute cumulative verification reassessment below remains in force; it is not permission to omit this requested journey.

CF-01–03 map to MC-01 and affected MC-04/05/12; CF-04 to MC-01/13/15; CV-10 to MC-05/06/12. The engineering guide's D-078 field contract defines configuration revision/finalization/change authority and exact content-use fields, controls, provenance and paired checks. Remaining J cases map above. Original T01–T10 and W01–W09 remain supporting detail, not substitutes for J0–J7. Record results in the existing evidence owner, not seven new reports. Human usability feedback and launch acceptance remain separate.

## Purpose and authority

Close the configuration and connected-journey gaps defined in revision 4 above. The [earlier execution plan](PATIENT_JOURNEY_EXECUTION_PLAN.md) and retained walkthrough below supply compatible detail, not authority to restore superseded architecture or start this follow-on assignment. Preserve unresolved defects honestly; missing browser proof is not necessarily missing implementation, and supporting implementation is not full-scenario proof.

The user authorized preparing this document. Running the follow-on review or implementing its refinements requires explicit execution authorization. Existing authorization for tonight's repairs remains separate. A second specialty is a possible later experiment, not part of this assignment.

One file contains the walkthrough, evidence capture contract, refinement method and resume checkpoint. Do not create another mutable backlog or copy the shared dependency matrix.

Canonical references:

- [Execution plan](PATIENT_JOURNEY_EXECUTION_PLAN.md): sections 1–10 own questions, controls and action contracts; section 11 owns T01–T10 acceptance.
- [Engineering guide](docs/development/meta-clinic-build-and-acceptance.md): the sole ownership/dependency matrix and field-contract rules.
- [Implementation tracker](APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md): MC-02–MC-12 and MC-15 own work status.
- [Decisions](APPlyVault/03%20Execution/Decisions.md): D-071–D-074 and later explicit user direction.
- [Healthcare standards procedure](docs/development/healthcare-standards.md) and [U.S. reference map](docs/development/us-healthcare-reference-map.md).

Preserve public-signup-only age limits, unpaid/former-member booking rules, clinic-assigned permissions, configurable clinical services and existing consent. No additional child/guardian flow, licensing engine, clinical thresholds, drug selection, unrelated AI, insurance/supplier expansion, new board or generic task system. No production deployment, real patient data, purchases or live transactions.

## Baseline and entry gate

Rechecked after the implementation task completed: implementation commit `af52f9a`, original brief commit `a949c034fc58e4de0a253aac98049a09ccabb6dc`, on main. The task reported a matching remote and tracked files are clean at this revision's initial inspection; unrelated attachments remain outside Git. The [implementation evidence record](docs/development/patient-journey-implementation-evidence.md#verification-ledger) is the canonical T01–T10 result crosswalk. This document revision reviewed that record and task outputs; it did not rerun application tests or independently operate the browser.

### Evidence to reuse, not repeat automatically

| Area | Completed evidence at implementation handoff | Remaining boundary |
| --- | --- | --- |
| T01–T10 focused correctness | 45 distinct Rails cases: 26 core, 10 entry/intake, 6 booking/scribe, 3 final boundaries. Two core failures passed after fixture-scope repair; do not count reruns as extra cases. | Focused cases do not prove every branch of the full acceptance matrix. |
| Entry, callback, booking and intake (W01–W03) | Contact-first, denied new booking with allowed callback; patient draft save/reload and repaired staff draft/confirmation browser proof. | Not a connected live payment or complete enrollment browser proof. |
| Visit, orders and labs (W04–W06) | Manual chart, incomplete prescription review rejection with independent lab draft; absent-result reason and acknowledgment separate from review in browser. | No live video, prescribing or lab-provider acceptance. |
| Continuity and recovery (W08–W09) | Browser dependency/independent-work checks and two-session transfer preserving coverage; API proof of handover authority, retry, reversal and post-closure same-task reconciliation. | Connected handover/post-closure browser proof remains missing. |
| UI and field contracts | Desktop/tablet/phone intake and queue captures, bounded keyboard/overflow checks; field ownership/provenance recorded in the implementation evidence. | Not a complete accessibility audit or human usability study. |
| Build and regression | Repaired TypeScript, bundle, 14 related frontend tests and changed-file Ruby lint passed. Earlier 326 frontend tests and schema/restore checks are reusable only where unchanged. | Full Rails regression, HTTP boundary proof and recorded historical failures remain deferred, not passed. |

Raw local evidence is under `tmp/patient-journey-*` and `outputs/patient-journey`; these ignored artifacts may not exist on another machine. Use the committed ledger for discovery, then validate the relevant artifact and source/configuration/dependency match. If required evidence is unavailable, label it unavailable and repeat only the smallest missing proof. Do not add the earlier 326 frontend tests to the later 14 as a unique-test total.

### Execution mode and remaining priority

An explicit request to execute this brief authorizes the scoped missing journey proofs, not a general launch audit. The 10-minute rule is a cumulative verification reassessment checkpoint, not an automatic stop or permission to call missing proof complete. At that point report progress, the exact remaining gap and a bounded next step; extend for necessary scoped proof with a reason. Do not reset the budget by starting repeated fresh runs. Diagnose one failed browser attempt and allow at most one justified retry before an alternative or an explicit blocker.

1. Follow revision 4's setup-first sequence and J0–J7 continuing-patient demonstration. Include W05/W06/W08/W09 handover/post-closure proof within that journey: partial handover/remainder, reversal/recovery, corrected lab result after closure, prerequisite denial, independent work, reconciliation and preserved history after reload. Reuse valid API evidence; prior fixture setup failed on inactive-site and receiving-key assumptions.
2. Inspect Patient Flow ownership, next actions and recovery copy on those same screens. Add a narrow-width check only for an affected or previously unverified surface, not another complete device matrix.
3. Reconcile W01–W09/T01–T10 coverage using existing evidence. Record any remaining disconnected journey segment precisely; do not silently promote partial proofs to a complete clinic-day run. Founder observation is optional pending availability and must remain separately labeled.

Broad regression, restore rehearsals, unrelated historical CI cleanup, comprehensive device/accessibility coverage, clinical policy selection and live vendor acceptance remain separate milestone/prelaunch work. Missing external access must not trigger purchases, invented configuration or repeated retries.

Before execution:

1. Read this brief, the current execution checkpoint, final delivery evidence, relevant decisions and complete applicable matrix. Confirm no competing source, database or browser writer.
2. Record the actual candidate commit, any relevant dirty diff, runtime build, configuration, fixture version and evidence date. Never test one revision and claim another passed.
3. Inventory T01–T10 evidence already delivered. Reuse passing evidence only when the relevant source, configuration, dependencies and environment still match. Do not rerun a whole suite simply because this is a new task.
4. Identify what is genuinely missing: implementation defect, absent evidence, usability friction, external-only limitation or proposed expansion. Do not accept an agent's completion summary as a substitute for evidence.
5. Acquire the runtime/database/browser ownership documented by the repository. Use independently created synthetic records through actual APIs; do not modify active test fixtures or reset another task's database.

Existing owners to reconcile, not replace: public membership storefront/Growth; Patient Flow in WorkInbox; patient and encounter workspaces; previsit intake; appointment requests and staff scheduling; existing telehealth/scribe consent; clinical-plan prescription workflow; ServiceRequest/lab report records; stock ledger and take-home handover; billing and follow-up worklists. Source paths and exact spans are mapped in tonight's B01–B12 baseline. Use graft to reconcile affected current definitions before changes. No new source completeness audit was performed to write this brief.

## Research and interpretation

Targeted official sources reopened on 2026-09-14; both are published HL7 US Core 9.0.0, STU 9 trial-use, based on FHIR R4, explicitly U.S. These inform focused proof, not new product requirements or a claim of exchange conformance.

| Reference and sections reviewed | Application to this assignment | Boundary |
| --- | --- | --- |
| [US Core QuestionnaireResponse](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-questionnaireresponse.html), Mandatory and Must Support Data Elements; Profile Specific Implementation Guidance | Check form/question identity, answer type, patient, gathered time and author/source when following intake into the visit. Map to W03/T03 and existing intake provenance. | Exchange support requirements do not mandate every answer at signup. Draft gates, absence choices and controls are existing product decisions. |
| [US Core laboratory DiagnosticReport](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-diagnosticreport-lab.html), Mandatory and Must Support Data Elements; Profile Specific Implementation Guidance | Check report status, patient, relevant/release times, result/order linkage and correction history. Map to W06/T07 and existing lab owners. | A report and its individual results are distinct. Internal acknowledgment, review and contact remain product workflow evidence, not automatic consequences of a report status. |

The execution plan's R01–R16 register remains the broader dated research baseline; its other sources were not freshly reviewed for this brief. Reopen the applicable exact source before proposing changed clinical data or gates. Actual vendor contracts, clinic-specific policies and jurisdiction-dependent consent remain unresolved where tonight's plan says so. Do not infer them. No healthcare guide defines our chosen board layout, usability timing or issue priority; those are product-review choices.

## Clinic-day walkthrough

W01–W09 below is the coverage reference, not a mandatory fresh nine-part run. Start with the remaining priority above and reuse valid completed evidence. Where a connection itself lacks proof, use one continuing adult synthetic record across the affected stages, including return and unfinished work. Use separate synthetic fixtures for mutually exclusive branches, but demonstrate each new blocked/allowed pair on the same patient/context. Record fixture identities in local synthetic evidence, not real-derived examples. Front desk, nursing, clinician, billing and fulfillment actors use existing configured roles; labels here do not grant privileges.

| Walkthrough / canonical proof | Patient and staff actions | Expected observation and recovery |
| --- | --- | --- |
| W01 — entry; T01; MC-02/03/09 | Patient selects an actual configured membership, creates account and proceeds to payment. Repeat abandoned/failed/unknown payment and interrupted setup. | Server evidence determines activation; retry preserves identity and cannot charge/convert twice. Unpaid interest remains discoverable to staff. Do not invent offers or prices. |
| W02 — alternative entry; T02/T04; MC-03/04/12 | Staff registers a walk-in; former member requests a callback; inactive member attempts online booking. Staff handles an eligible booking separately. | Denied self-service has a clear explanation and allowed next action. A callback is not a reservation. Walk-in needs no invented appointment. Pending labs do not block otherwise eligible scheduling. |
| W03 — intake; T03; MC-05/12 | Patient saves incomplete answers, leaves and returns; staff reviews and corrects applicable information in the encounter. | Answers, units, source and draft state survive reload. Unknown/declined/negative are not conflated. Only a defined dependent action is held. No repeated collection of unchanged data. |
| W04 — visit; T04/T05; MC-05/07 | Room/handoff for in-person care; separate telehealth variant; scribe permission present, withdrawn and service unavailable; manual notes continue. | Correct patient/encounter and accepted responsibility remain explicit. Scribe failure does not stop permitted care. Disconnected video cannot be presented as attended; simulated room state is not live media proof. |
| W05 — prescription/fulfillment; T06/T09; MC-10/11/15 | Clinician prepares and reviews a configured medication for outside pharmacy; exercise disconnected and unknown-send outcomes. In a separate valid route, record partial in-house handover and remainder. | Preparation is not transmission or dispensing. Changed data requires affected renewed review. Unknown outcome requires reconciliation, not blind resend. Stock quantities, lots and reversal links remain exact. |
| W06 — labs; T07; MC-06 | Prepare order, leave results pending, schedule/start an otherwise permitted visit, receive partial and corrected results, review and contact separately. | Missing results block only an explicitly dependent action. Receipt, acknowledgment, review and contact do not collapse into one status. Corrected work reopens visibly with source history. |
| W07 — money and continuation; T08; MC-08/09/12 | Checkout, renewal failure/pending cancellation, billing recovery and failed outreach. | Receipt/balance reflect evidence; effective membership policy is respected. Unpaid billing does not silently finish clinical work or erase access to unrelated follow-up. |
| W08 — simultaneous work; T07/T09/T10; MC-05/06/10/12 | Keep lab review/contact, Rx preparation, billing exception and callback open together. Transfer one task, remove one actor's privilege, and close the encounter where permitted. | Each item retains its own owner, reason and action; old coverage persists during required acceptance. Resolving one does not hide or finish others. No eligible owner becomes a visible exception. |
| W09 — return and recovery; T01–T10 as affected | Reload, sign out/in, return from another permitted role, retry an uncertain save and revisit the closed encounter's open tasks. | Durable IDs/history remain correct; no duplicate money/stock/order effect or wrong-context attachment. Existing tasks link back to their source; next visit does not require reconstructing history manually. |

For all walkthroughs record both the exact forbidden transition and an independent successful action, not merely a disabled button. Exercise direct API denial where it is the enforcement boundary. The full T01–T10 crosswalk still governs coverage, including isolation, stale data, duplicate events and dependency cycles; this table is an operator script, not a replacement test matrix.

## Field and question review

Reuse the execution plan's stage-level questions and controls and the implementation evidence's completed field-ownership tables. Inspect only fields implicated in the missing walkthrough, changed behavior or observed discrepancy; do not rebuild the inventory or invent a new form during review.

Ask: Why is this asked now? Is it already known? Who supplied it? Who can change it? Can an incomplete draft save? Which exact action requires it? Does correction invalidate only affected work? What survives failure/reload?

| Field family / canonical stage | Control and origin to verify | Review focus |
| --- | --- | --- |
| Identity, DOB, contact / sections 1–2 | Typed dates/contact inputs; existing identity inherited; bounded contact preference; free-text timing only when needed | Server validation matches the stage-specific rules; DOB is not a universal online-access gate; wrong-context edits are denied. |
| Goals, history, medications, answers, measurements / section 3 | Narrative for explanations, explicit bounded answer states, catalog references where available, typed number plus unit, questionnaire version | Preserve unanswered/unknown/declined/not-applicable/negative; provenance and patient answers remain distinct from clinician findings. |
| Slot, modality, location and handoff / sections 4–5 | Existing availability/reference selections; context inherited; explicit receiving team/acceptance where required | Request versus confirmed booking versus arrival is legible; no inferred handoff from opening a chart. |
| Prescription, destination and fulfillment / sections 6–7 | Searchable configured catalog/destination, quantities with units, version-bound review; stock lot reference and recorded event time | No free-text status can impersonate a vendor acknowledgment; take-home, administration and external delivery stay distinct. |
| Order/report/results/review / section 8 | Existing order reference; typed or absent result; source status/times; separate review/contact controls | Missing results are not zero; display source units/flags, not invented ranges; correction does not erase prior review history. |
| Payment, recurring state and outreach / section 9 | Amount/currency and effective dates from owning records; bounded attempt outcome and explanation; provider evidence read-only | No browser return, queued message or operator wish becomes confirmed external success. |

For a proposed field change, add a finding with: exact label/question, purpose, record/API owner, entered/inherited/calculated/vendor origin, control/type/values/units, conditional visibility, authorized writer, provenance/version, draft-versus-action requirement, stale rule, exact validation/recovery copy, source classification, matrix ID and paired test. Resolve these before implementing the change. Missing clinical policy remains unknown, not a default hard stop.

## Patient Flow and staff usability proof

Inspect the existing Patient Flow, patient detail and employee/team views together. Do not assume one linear lane describes the whole patient. Do not add another board just to solve an unclear label.

At W02, W06, W08 and W09 ask the operator to identify, without coaching:

1. Which patient and encounter am I viewing?
2. What needs attention now, and what is the source of that urgency?
3. Who owns each open item, and who covers it?
4. What exactly is blocked, why, and how can it be resolved?
5. What can proceed now, and where is that action?

Capture the actual answer, navigation path, hesitation, mistaken action and observed time/click count. These measurements establish a baseline; no arbitrary speed target or small sample proves universal usability. Founder feedback is a walkthrough observation, not a clinic pilot study. An agent-only pass cannot be labeled a human usability test.

For newly affected or unverified surfaces, inspect keyboard/focus, readable errors, non-color-only status, narrow-width content, preserved navigation context and visible outstanding tasks proportionately. Reuse the completed desktop/tablet/phone evidence for unchanged controls; do not repeat the entire device matrix. Capture before/after screenshots only with independently synthetic data.

An undiscoverable next action, hidden outstanding task, unclear owner or apparently global hold is a finding even when the API works. Distinguish confusing terminology/navigation from missing persistence or authorization. No screen is accepted solely because it renders.

## Evidence record and refinement loop

Keep durable work status in the existing tracker. When execution starts, record detailed dated evidence in one repository-convention progress record and link it here; do not pre-create empty reports or duplicate backlogs. Use one finding ID per reproducible issue and reference its owning tracker row.

Evidence entry contract:

| Capture | Required content |
| --- | --- |
| Identity | Finding/case ID, W/T/matrix IDs, tracker owner, timestamp, actual source revision and environment |
| Setup | Synthetic fixture references, actor permissions, modality, connection state, relevant configuration and prerequisites |
| Action | Exact reproduction steps, submitted data category, expected blocked transition and independent allowed action |
| Observation | Actual result, persisted state/history, screenshot/log/test links without sensitive data; pass/fail/not run/blocked/not applicable with reason |
| Impact | Wrong data/effect, lost work, inability to finish, misleading status, friction or external-only gap; recurrence and safe workaround |
| Resolution | Existing owning mechanism, proposed smallest fix, source/rule basis, assignee when actually assigned, retest evidence and remaining uncertainty |

Prioritize observed failures in this order: incorrect consequential effects or access/context violations; lost/unowned work or inability to complete a required journey; misleading status/recovery; repeated unnecessary entry/navigation; cosmetic polish. This is engineering triage, not clinical urgency and not a new production policy.

After execution authorization, repair bounded defects against accepted requirements first. For an actual new feature or changed product rule, propose it separately instead of silently adopting it. Before each substantive change, follow the applicable healthcare-source and failure-first procedures and inspect current owning code. Retest the failed case and affected paired/adjacent paths; reuse still-valid evidence. Batch repairs coherently under repository rules, with one writer per area and one stateful runtime owner.

## Matrix maintenance

The complete applicable matrix was reviewed. Revision 3 introduced CF-01–03; revision 4 adds CF-04 change-tier authority and CV-10 exact revision use in the same engineering-guide matrix. Existing IDs remain. Applicable groups include EN-01–09, SC-01–03, CV-01–10, RX-01–03, LB-01–07, IN-01–03, OP-01–08 and OP-10–12. OP-09 and future SC-04/OP-13 are outside this cash-pay weight-loss increment; insurance stays off without breaking the core. These rows are product requirements, not new clinical rules or verified implementation.

If observation reveals a missing condition, first check existing rows and references. Propose the precise change to the single engineering guide using exactly:

`Condition | Action affected | What is blocked | What remains available | Responsible party | Attention`

Preserve stable IDs; identify source/product/policy authority, resolver, permitted parallel actions, coverage and affected fields/tests/tracker rows. Do not conflate operation with blocked transition. Record why a gate is added, narrowed or removed; preserve supersession history. Unknown urgency, deadlines or destinations cannot be invented to complete the row. Coordinate shared-file changes with their owner.

## Completion and handoff

Report requirement coverage as evidence-bound counts and explicit exceptions, not an impressionistic product percentage. A passed backend test, browser walkthrough and simulator result are separate evidence classes. Live vendor gaps do not count as failed local behavior, but must never be called verified external operation.

Completion of this follow-up requires the connected missing proof above, disposition of observed field/control and Patient Flow issues, and a coverage reconciliation across W01–W09/T01–T10 labeled reused, newly proved, blocked, deferred or not applicable with reasons. It does not require rerunning every case. A blocked required connected proof means this follow-up remains incomplete; deferred broader checks must not be represented as full journey or launch acceptance. No observed unresolved violation of an approved acceptance requirement may be hidden by a score or described as polish. Record optional refinements for user choice rather than endlessly perfecting the interface.

Deliver: what now works with evidence; what was refined and why; unresolved defects and missing proof; separate unavailable external checks; founder feedback if actually obtained; exact revision and next action. If founder review is unavailable, finish independent authorized checks and label human feedback pending. Do not claim second-specialty fit, clinical acceptance or release readiness.

## Resume checkpoint — planning only

- Completed planning: revision 4 incorporates D-078, change tiers, CF-04/CV-10 field/paired-check mapping and the unchanged J0–J7 outcome. Prior `af52f9a` results remain dated scoped evidence, not full-scenario completion. WL-R1/2 and the linked architecture sources were reviewed; the earlier measurement lookup gap remains for substantive measurement changes.
- Current baseline: main `fee9cab9818b` before these documentation-only changes. Older source observations remain dated; no new application tests, browser proof or human walkthrough were run to revise this brief.
- Ownership: architecture/research, canonical product/vault records, brief and guide only; no application, fixture or runtime changes. Recheck source and concurrent ownership before execution.
- Authorization: document reconciliation authorized; this follow-on implementation and task dispatch remain unstarted.
- Next unfinished action: after execution authorization, inspect provisioning/configuration and relevant revision-use owners; choose scoped reuse/refactor/replacement under D-078, then implement setup-to-workflow behavior and demonstrate J0–J7. Do not build a universal support/reconfiguration platform or skip enrollment/return in favor of isolated checks.
- Open dependencies: usable isolated runtime/fixtures; local raw evidence availability; founder availability for human feedback. Clinical/vendor mappings and live acceptance remain separate unresolved work, not prerequisites to claim local-only proof.

On every start, context reset or handoff, reread this brief and the relevant canonical records, compare the recorded baseline with the current checkout and newer user direction, and reconcile changed assumptions before acting. Update this compact checkpoint after meaningful completed work, new blockers, consequential decisions and before pausing. Keep one current checkpoint, evidence-backed next action and links to results; do not append contradictory active next steps. Saving or reading this file never dispatches work automatically.

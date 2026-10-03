# QA defects 236–253: repair reconciliation

Date: 2026-10-03. User-authorized expanded repair batch. Reported build: 0.2.6 at `aab93057`; integration base: `f08ac823`. This record supplements [the first repair batch](2026-10-03-qa-236-246-repairs.md), preserving that batch's original findings and verification limits. Work uses an isolated checkout; unrelated primary-checkout edits remain untouched. No deployment or shared sandbox reset is authorized or performed.

## Defect-by-defect acceptance

Each ID retains its original claim. Source repair does not establish exact deployed acceptance. The table is updated with observed local outcomes after the implementation freeze.

| Defect | Workflow / claim | Resulting implementation | Local evidence |
| --- | --- | --- | --- |
| #236 | WF-089 statement action silent | Authenticated same-origin document preview, explicit loading/error and browser print request. | Current local browser loaded the authenticated Alex Morgan statement with invoice/payment amounts and enabled Print / save PDF. Native dialog completion remains unverified. |
| #237 | Reported spacing, prices, technical/truncated copy | First batch copy fixes plus schedule publication/policy wording in this batch. | Source diff; local walkthrough pending. |
| #238 | WF-010/012 role selection/bulk assignment blocked | Shared exact catalog role assignment and initial workforce role scope; generic grant/self-grant guards preserved. | First batch source/type checks; local persistence walkthrough pending. |
| #239 | WF-019 unexplained disabled profile Save | Scope-consequence review explanation, reachable supported editor and retained save feedback. | Local supported editor accepted a Tobacco use category change and reloaded backend profile revision 2 with the category retained; unchanged forms explain why Save is disabled. Transient save feedback can disappear during the workspace refresh. |
| #240 | WF-014/015/016 visit types/offering editors unreachable | Existing editors restored in sandbox; newly saved visit types refresh offering options. | First batch controls visible; create/disable/publish walkthrough pending. |
| #241 | WF-063/064 procedures/immunizations disabled | Fresh sandbox supported service scope includes both; correct-location setup links retained. | Local chart opened both Add procedure outcome and Add immunization dialogs. Separate clinic-administered immunization configuration guards remain; no procedure or vaccine administration was recorded. |
| #242 | WF-069 stale follow-up retry loop | Explicit latest-state reconciliation updates expected version while preserving local edits and generating a fresh next attempt. | Source review; stale/reconcile/save walkthrough pending. |
| #243 | WF-067 empty SOAP prompts falsely claim insertion | Empty prompt templates cannot apply or claim inserted content; selection without prompts remains available. | Local reviewed Scribe template shows no prompt text and disables Apply template prompts; Use template without prompts remains available. |
| #244 | WF-058 education cannot save | Forward ciphertext-aware title constraint and encounter-bound unknown receipt resolution. | First batch local save/reload/same-request replay passed with 240-character title. |
| #245 | WF-061 ROS missing in sign review | Template application preserves parsed structured HPI/ROS selections rather than overwriting their subjective body; sign review retains authoritative saved body. | Local chart: marked cough negative, applied Primary care follow-up prompts, replaced remaining narrative prompts with synthetic review text, saved unsigned revision 1, and opened signing review. Saved Subjective explicitly contains Respiratory: Absent — cough. Note left unsigned. |
| #246 | WF-065 no configured assessment categories | Correct-location assessment setup anchor opens supported changes. Fresh sandbox config includes tobacco-use category only; instruments/scoring/approval are not prefilled. | Local same-page Assessment scope link opens the supported editor after correcting hash handling. Tobacco use saved and retained at backend revision 2; protocol and approval guards remain. Local chart then enabled Add structured assessment and opened its blank, unscored form with Tobacco use selected; no instrument, approval or completed assessment was manufactured. |
| #247 | WF-021 draft publication/errors/datetime/recovery | Week and duration validation, in-dialog publish errors, draft recovery, ordinary date/time entry and corrected copy. | Local UI rejected October 5 against the September 28 draft with inline start/end week errors, retained entered values, saved an October 2 09:00–10:00 shift, and reopened its exact times through Edit. The valid draft published and the server-backed open-draft list removed it. Follow-up source repair retains the success message after bootstrap reload; complete publication/error branches remain part of deployed acceptance. |
| #248 | WF-031 canonical ID silently coerced | Exact entered text retained; invalid numeric ID blocks submission with format guidance. | Local merge dialog retains SBX-1-092 and 001092 exactly as typed and keeps Merge disabled with a reason entered. No merge was performed. |
| #249 | WF-038 reported allergy/medication missing | Backend-owned intake evidence shown with patient-reported provenance in chart and matching review dialog; no automatic clinical record promotion. | Source review; chart/review walkthrough pending. |
| #250 | WF-040 invalid reschedule range/missing detail action | Start changes preserve duration, invalid end is immediately visible and blocked; appointment detail links to authorized reschedule editor; cancellation description corrected. | Source review; local walkthrough pending. |
| #251 | WF-047 lateness indistinguishable from wait | Backend projects delay from recorded check-in and scheduled start; confirmation/board display it separately from actual post-check-in wait. | Local board shows the backend-recorded seeded late arrival as Arrived 15 min after the scheduled start separately from 16h 5m post-arrival wait. Fresh check-in confirmation was source-reviewed, not exercised. |
| #252 | WF-090 receipt action silent | Ledger, guided checkout, drawer and payment/receipt lists use shared authenticated preview; receipt response permits same-origin framing only. | Local Payments & receipts button loaded receipt #1 for payment/invoice #1 at USD 79.00. The observed authenticated receipt converted to a 38,003-byte %PDF-1.4 document using browser developer printing; native dialog completion remains unverified. |
| #253 | WF-102 sandbox session creation returns Not found | Sandbox uses normal authorized session creation; only guided Scribe lesson uses its sample-only endpoint. Pending/failure feedback retained. | Local browser started a new Alex Morgan session, exited the new-session form, and received the new saved session in the reloaded server-backed rail at 3:07 AM. No Not found error. Recording/consent boundaries retained. |

## Other reported blocked workflows

- WF-002: owner restriction on shared reset remains. No reset is performed.
- WF-020: disabled insurance switch renders the backend value; protected configuration remains enforced. Enabling insurance is outside this repair.
- WF-028: browser kiosk exists at `/workforce/kiosk`; enrollment guidance links to it. Local flow still requires a valid enrollment code and encrypted enrolled-device session. The existing production kiosk guard remains a distinct release boundary.
- WF-050: scheduling policy status links to the correct location's existing authorized editor; overbook defaults and backend validation remain.

## Verification and limits

All worker handoffs are integrated. Scoped source/diff review covered every listed ID. TypeScript and main/Office production bundles pass; changed Ruby syntax passes (11 files). Scoped RuboCop passes after correcting one class-body blank line. Browser follow-up corrected duplicate embedded print controls and same-page assessment-anchor handling; the corrected final frontend source subsequently passed TypeScript and both main/Office production bundles. No tests added/run. No claims about all 116 workflows, exact hosted acceptance, clinical readiness or external integrations are made.

## Standards mapping for the reported intake projection

Reviewed 2026-10-03: HL7 US Core 9.0.0 STU9 on FHIR R4 4.0.1, for U.S. outpatient history representation. No exchange partner or US Core conformance acceptance is claimed.

| Primary reference | Requirement carried into this repair | Backend / UI / verification mapping |
| --- | --- | --- |
| [US Core AllergyIntolerance](https://hl7.org/fhir/us/core/StructureDefinition-us-core-allergyintolerance.html) | Patient-reported allergy evidence remains distinguishable from a reconciled clinical record and its verification state. | Authorized intake revision projects allergy answers and provenance; chart/review dialog show them separately; ordinary allergy writes remain explicit. |
| [US Core medication list](https://hl7.org/fhir/us/core/medication-list.html), [MedicationRequest](https://hl7.org/fhir/us/core/StructureDefinition-us-core-medicationrequest.html) | Reported medication use is distinct from a medication order; missing evidence does not imply no medications. | Medication intake values are a whitelisted projection, not orders or automatically verified medication statements; UI preserves missing/unreviewed states. |
| [US Core problems and health concerns](https://hl7.org/fhir/us/core/StructureDefinition-us-core-condition-problems-health-concerns.html) | Reported conditions and chart diagnoses retain separate provenance and authority. | Existing condition projection remains compatible; additive history projection and authorized review dialog do not create diagnoses. |

Other changes repair existing navigation, configuration, mutation recovery, document presentation and scheduling validation. No new clinical protocol, instrument, score, threshold, treatment selection or approval is introduced.

## Source closeout and remaining acceptance

All 18 reported IDs have an implemented source repair across this batch and the preserved earlier batch. Local proof is deliberately per row: this is not a claim that every branch has received a browser retest. Untouched first-batch fixes retain their dated evidence. No original QA totals or hosted workflow statuses were automatically closed.

Remaining acceptance includes invitation/bulk-role persistence (#238), visit-type create/disable and offering publication (#240), forced stale-follow-up conflict/reconcile/save (#242), reported-intake values in a populated source revision and review persistence (#249), reschedule mutation and invalid-range walkthrough (#250), fresh late-check-in confirmation (#251), browser-native print dialogs (#236/#252), and any unexercised schedule validation/retry branches (#247). Existing owner-reset, approved-instrument, clinic-administered immunization, kiosk enrollment/production and live integration guards remain.

The runtime/database was preserved without reset. Ignored local evidence: `tmp/qa-236-253-assessment-entry.png`, `tmp/qa-236-253-ros-sign-review.png`, `tmp/qa-236-253-receipt-preview.png`, and `tmp/qa-236-253-receipt.pdf`. These contain independently synthetic local examples and are not release evidence.

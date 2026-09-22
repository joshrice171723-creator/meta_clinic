# Behavioral-health journey evaluation

Revision 2 — 2026-09-22. User-authorized local synthetic execution and gap evaluation; baseline `0a9c218afc93`. Bounded two-visit walkthrough completed; remaining capability gaps are listed below.

## Scope and continuity

Exercise Cedar Behavioral Health with one independently invented adult male patient, an in-person initial visit and return visit. Use existing registration, scheduling, intake, notes, clinical plans and follow-up records. No real care, prescribing, external transmission, insurance claim, payment, deployment or clinical approval is implied. Cash-based/no insurance is a bounded walkthrough assumption, not product policy. No screening protocol or threshold is invented.

Read this brief and the linked canonical references before starting, resuming after a context reset or accepting a handoff. Compare the baseline with current source and newer user direction; reconcile stale assumptions before dependent changes. Do not repeat completed creation steps or broaden scope silently.

Canonical owners: [implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md), [build and acceptance guide](meta-clinic-build-and-acceptance.md), [strategy](../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md), [decisions](../../APPlyVault/03%20Execution/Decisions.md). Reuse CF-01–04, SC-04, CV-01–05/09–10 and OP-02/04–05/10/12; no competing dependency matrix.

## Data coverage to evaluate

| Data / purpose | Existing owner and control | Provenance and acceptance |
| --- | --- | --- |
| Identity, age, contact and communication choices | Patient registration; typed date, bounded sex/interpreter/consent selections | Registration writer and revision; preserve unknown or declined, do not invent contact permission |
| Visit context, location, clinician and time | Appointment and encounter references; selected records and timestamps | Confirm booking persistence, duplicate retry behavior and clinician/location compatibility |
| Concern, symptom course, history and patient goal | Versioned previsit intake and encounter note | Patient versus staff source, answer state, author/date and original response; draft is not confirmation |
| Functioning, mental-status observations, intervention and response | Assess current note sections and clinical-plan records | Explicitly separate patient report, clinician observations and unknowns; free text is not structured outcome tracking |
| Assessment | Assessment revision currently supports category, instrument/version, score, interpretation, response summary, follow-up and date | Check item-level typed answers, respondent, scoring provenance and corrections; do not infer instrument support from category selection |
| Plan and measurable goal | Care-plan and goal revisions; status, dates, description and outcome | Preserve original plan, author/revision, current status and return-visit linkage |
| Safety-related follow-up, when applicable | Existing clinical work ownership and follow-up mechanisms | Record findings, reviewer/action/owner and resolution evidence under selected clinic policy; no automatic risk threshold |
| Notes and closure | Note revisions/signatures, encounter and outstanding work | Exact-revision signing, correction history, no silent completion of open work; separately maintained psychotherapy notes are not ordinary progress notes |

Draft versus completion and recovery follow the canonical matrix. Unknown findings are not negative findings. Reusing old answers must not represent them as newly confirmed. Failed/stale saves must preserve recoverable work and retry identity.

## Source interpretation

Reviewed 2026-09-22: [US Core QuestionnaireResponse 9.0.0/STU9](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-questionnaireresponse.html) and [Screening Assessment Observation 9.0.0/STU9](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-observation-screening-assessment.html), published U.S. trial-use profiles on FHIR R4. Questionnaire identity, response status, subject, authored time, answer identity/type and provenance inform the assessment coverage questions. Exchange Must Support is not a universal required intake question or a mandate for FHIR-native storage.

[HHS mental-health information FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/does-hipaa-provide-extra-protections-mental-health-information-compared-other-health.html) informs the distinction between ordinary clinical records and separately maintained psychotherapy notes. Dedicated access/export behavior remains to verify; this walkthrough is not a legal/compliance assessment.

## Checkpoint

### Completed slice: specialty intake

Added a backend-owned behavioral-health starter with initial/return visit mappings and a four-group, unscored questionnaire. Existing medicines/allergies/care-needs controls are reused. New narrative fields cover symptom course, functioning, relevant history/prior care, sleep, support/barriers, optional sensitive substance context and next-step questions. All are entered patient-reported context with existing answer-state, recorder, time, form/revision and correction provenance; none represents clinician assessment. Return intake additionally captures existing bounded response/support values. Clinical observations, diagnosis, interventions, session timing and patient response belong in notes and clinical-plan records, not patient questionnaires.

[CMS A56937 version 43, revision effective 2026-04-01](https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleId=56937&ver=43), Documentation Requirements, reviewed 2026-09-22, informed coverage of functioning, symptoms, goals and clinical progress. It is a U.S. Medicare contractor article for its listed jurisdictions, not a universal mandate or an assertion that this cash-based scenario meets payer rules. The questionnaire is a product-selected information-gathering subset, not a validated instrument or a complete clinical evaluation.

Focused tests: 32 runs / 535 assertions passed (previsit contract, practice features and nurse workflow). Initial run found an incorrect active-column query; corrected to the existing active scope and reran successfully. Browser verified four groups and persisted initial answers, including unknown medication/allergy information and declined substance-use detail. Existing historic forms remain registered; this change does not rewrite saved responses.

Runtime: patient 300 registered in browser, appointment 97 booked for 2026-09-22 10:00–11:00 America/Chicago, browser check-in created encounter 71. Clinician 156, Tuesday capacity 1012, room 166. Profile revision 2 finalized using existing configuration service and reused visit types 303/304. Four groups saved in browser; history review and accepted cross-account handoff exercised through domain services (intake revision 31). These service calls are not browser mutation proof.

- Clinic 64, Cedar Behavioral Health, organization 5, site 160 existed from the authorized UI creation; do not recreate it.
- Owner invitation activated through the existing onboarding service, user 197. Browser verified clinic is selectable and accessible. Invitation tokens/passwords are not recorded here.
- Distinct synthetic clinician Avery Morgan: user 198, membership 109, scheduling profile 156, authorized via workforce invitation/activation.
- Initial encounter 71 completed with signed note 40, active care-plan revision 2 and goal 1. Tasks 127 (clinical, assigned membership 109) and 128 (records pool) remained open after closure. Browser confirmed Signed, Completed and Follow-up work (2).
- Return appointment 98 / encounter 72 exercised with a process-scoped business date of 2026-09-29. Four intake groups, cross-account handoff, signed note 41 and completion persisted through domain services. Browser patient history confirmed both completed encounters. Goal revision 2 records partial progress while preserving the original goal. These are future-dated synthetic scenarios, not elapsed real visits.
- Next appointment 99 is scheduled for 2026-10-06 10:00–10:30 America/Chicago with Avery Morgan in Consultation 1; linked to encounter 72 follow-up. Initial unfinished tasks remain open, not silently completed.
- Runtime booking replay returned appointment 98 without duplication; overlapping booking was rejected; two appointments existed before booking the next visit.
- Follow-up validation: 7 previsit tests / 74 assertions passed after adding historical-form preservation checks; changed-file RuboCop passed on six Ruby files. Vault verification passed (43 notes/508 links); vault audit reported existing size/metadata advisories. Agent-harness validation is blocked by pre-existing non-UTF-8 `docs/development/guided-demo.md`; no unrelated encoding change was made.

## Remaining gaps and precise next scope

1. **Scored assessments are not complete instruments.** Current assessment revisions contain instrument/version, score and narrative summary, but no first-class item-response/score derivation contract. No instrument was configured or falsely recorded as administered. Select an approved instrument and its version/scorer/reviewer/follow-up contract before implementation.
2. **Longitudinal plan visibility:** return encounter 72's clinical-plan workspace returned zero plans/goals while the patient had an active prior plan. Existing records and revisions remain available in encounter 71; goal outcome was updated through its owning series. Add a permission-filtered prior-plan projection with explicit origin, current revision and a supported update path; do not clone plans silently.
3. **Clinical evaluation and safety:** symptom/function context is now captured, but focused mental-status findings, intervention/response, session timing and safety assessment still rely on general clinical notes. This walkthrough deliberately leaves safety findings unknown. A clinic-selected safety protocol, owned review/actions and appropriate structured evidence remain to design; no clinical readiness claim.
4. **Psychotherapy-note privacy:** ordinary signed SOAP notes were tested. Dedicated separately maintained psychotherapy-note access, portal/export separation and consent handling were not verified. Do not represent ordinary notes as that protected-note feature.
5. **Booking presentation:** the booking selector displayed `Clinician profile #156` while the calendar showed Avery Morgan. The clinician serializer omits display_name and booking/reschedule views use reference fallback. The patient-context schedule also said “first appointment” despite two completed visits and a next booking. Fix the serializer/type/consumer and context-copy contracts with scoped tests as a separate narrow follow-up.
6. **Proof boundaries:** manual draft-interruption recovery, denied-role/cross-clinic browser attempts, note corrections, consent evidence, billing and portal patient instruction delivery were not exercised in this scenario. Existing focused test success does not establish all of these paths. No external services or deployment were used.

No shared-matrix rules were changed. The specialty fix reuses CF-01–03 and CV-01/10; the journey exercised SC-04 and OP-02/04/12. Resume with the longitudinal plan projection and assessment contract decisions, not another clinic/patient creation. No outstanding clinical work should be marked resolved merely to make the demonstration look complete.

Final browser check: October 6 day schedule shows Ethan Brooks, 10:00–10:30 AM, Scheduled, Behavioral health follow-up, Avery Morgan, Consultation 1. Tab left on that appointment.

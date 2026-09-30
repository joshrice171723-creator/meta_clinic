# MC06 / MC10 original-requirement source coverage

Date: 2026-09-30. Immutable inspected baseline: `c16468388eeaed39acbbb2184049fd4c72ff2462`. Pending MC10 source: `60158efd5f934c3f62d0e2af9873c6cc13579dc0` is not integrated into that baseline.

Accepted original briefs and applicable dependency/acceptance cases mapped to source. Archived patient-journey cases used only through their explicit adoption by current PATIENT_JOURNEY_PLAN. No score arithmetic or canonical edits. Missing code, present source, Validation, external/human, and undefined scope are separate; one row can have multiple kinds. Grouped rows are coverage units, not equal-weight scoring units.

This is dated evidence, not a second task/score register. The [implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) remains the current owner. [Machine-readable matrix](2026-09-30-mc06-mc10-source-coverage.json).

## Accepted requirement sources

- [Engineering guide and dependency matrix](../../docs/development/meta-clinic-build-and-acceptance.md).
- [Ten-priority Definitions of Done](2026-09-11-ten-audit-dod-closeout.md), especially items 1, 3, 4, 6, 7 and 8.
- [Current patient journey](../../PATIENT_JOURNEY_PLAN.md) and its explicitly adopted [original T05–T10 crosswalk](../superseded-plans/PATIENT_JOURNEY_EXECUTION_PLAN.md). Other archived proposals are not promoted into requirements.
- [Approved non-vendor hardening brief](../../docs/development/non-vendor-clinic-hardening-plan.md), especially typed labs and administration-grade immunizations.
- [Prescription transmission brief](../../docs/development/prescription-transmission-plan.md) and [read-only reconciliation worklist brief](../../docs/development/clinic-workflow-plans/prescription-reconciliation-worklist.md).

## Method and limits

- No Ruby/PostgreSQL test runtime available; registry access blocked in earlier capability task.
- No graft executable or index present; source read directly from immutable git archive.
- Historical passing evidence and authored tests inspected as scope clues only, not a fresh pass.
- Source-level guard gaps are inferred from executable paths; no failing runtime reproduction claimed.
- Matrix reflects read-only baseline review; any later authored tests, static checks or guard repair are reported separately, not credited retroactively.

No percentages changed or proposed. Integrated worklist, typed-lab kinds, correction/recollection/contact chains, source-owned completion, refill delivery retry and original history are present source. Do not list them wholesale as missing. Do not erase Validation or external/human gaps. Pending 60158 is not integrated at baseline. Complete denominator/acceptance weighting and human approval would be needed for any accounting correction.

Nova already owns MC10paging and MC14; existing MC12 owner handles labqueuepaging. No new agent spawned or owner invented. Unowned findings require parent assignment; no source repair was made.

## Coverage matrix

There are 22 MC06 and 20 MC10 requirement groups. These groups are not an equal-weight completion denominator. Every present-source group retains unexecuted current validation; no historical test result is recast as a fresh pass. References below resolve to repository files. Their listed line numbers refer to the immutable baseline.

### 06-01 — Unified work inbox with source, patient, due/urgency, team/assignee and exact recovery destinations

Original contract: DoD 1; OP-02–05/12. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [inbox][source-inbox] |
| API | [tasks][source-tasks]; [continuity][source-continuity] |
| PERSISTENCE | ClinicalTask, dependencies and task events; source-owned orders/results/referrals |
| PERMISSIONS | encounters.write and source-specific capability; active membership/site rechecked |
| RECOVERY | Partial-source warnings; source links; claim/transfer/start; no generic completion of source-managed work |
| FINDING | WorkInbox renders partial-source warning and retains independent work. Source-managed task completion is rejected in NurseWorkflow. |
| OWNER | Existing workflow owners; no new dispatch |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-02 — Current context, draft/revision history and stale/replay-safe clinical record writes

Original contract: DoD 8; CV-03; OP-10. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui] |
| API | [planapi][source-planapi]; [planservice][source-planservice] |
| PERSISTENCE | ClinicalRevision families: medication/service request, diagnosis, procedure, care plan/goal, immunization, assessment |
| PERMISSIONS | patients.read/clinical_records.read on reads; each definition's write permission at encounter site |
| RECOVERY | Version compare, series advisory lock, Idempotency receipt; corrections append revision |
| FINDING | Existing families and revision references are source-present; draft creation and later revision are distinct. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-03 — Active orders create owned execution work; on-hold/cancelled/completed state follows source

Original contract: DoD 8; OP-02/11. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui]; [inbox][source-inbox] |
| API | [planservice][source-planservice]; [tasks][source-tasks] |
| PERSISTENCE | Root-series ClinicalTask and current request revision |
| PERMISSIONS | medication_requests.write/service_requests.write; task actions do not confer either |
| RECOVERY | Resume retains root task; dependencies block dependent actions; source-managed generic completion denied |
| FINDING | sync_order_task! preserves task identity and due state rather than building a second ledger. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-04 — Exact source/target fulfillment links reject wrong patient, encounter, kind and incomplete target

Original contract: DoD 8. Classification: **Partial source; Missing source/guard**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [closureui][source-closureui] |
| API | [closure][source-closure] |
| PERSISTENCE | ClinicalPlanLink; composite tenant/patient/encounter foreign keys in plansch |
| PERMISSIONS | Source write permission; documents.read for document linking |
| RECOVERY | Current-source revision checked; same-key replay retained |
| FINDING | G06-A: procedure target accepts planned/in_progress/not_done/entered_in_error; validate_target_evidence! handles medication administration only. Any link can subsequently satisfy completion. Available targets also include noncompleted procedures. |
| OWNER | Unowned in supplied assignment; parent should assign bounded MC06 guard repair |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-05 — Lab fulfillment must retain the selected order/report identity

Original contract: DoD 8; LB-01; T07. Classification: **Partial source; Missing source/guard**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [closureui][source-closureui] |
| API | [closure][source-closure]; [completion][source-completion] |
| PERSISTENCE | LabReport's original service_request_revision; generic link uses only practice/patient lookup for reports |
| PERMISSIONS | Source writer/site permission exists; it does not repair wrong-source linkage |
| RECOVERY | Current order check exists, but no selected-order/report-series compatibility check in generic link path |
| FINDING | G06-B: same patient's report from another lab order/encounter can be linked. For selected order with no own reports, any such link can satisfy completion. Normal LabReports.create correctly creates an owning-order link; the generic path remains weaker. |
| OWNER | Unowned in supplied assignment; parent should assign bounded MC06 identity repair |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-06 — Source-backed order completion, explicit exception and no false child completion

Original contract: DoD 8; OP-11/12. Classification: **Present source with gaps G06-A/B; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui]; [closureui][source-closureui] |
| API | [completion][source-completion]; [planservice][source-planservice] |
| PERSISTENCE | Completed revision plus fulfillment link or completion_exception; root task state |
| PERMISSIONS | Owning order write permission and dependency guards |
| RECOVERY | Lab received/unreviewed/absent check; take-home remainder prevents completion; explicit exception retained |
| FINDING | require_completion_evidence! is source-present but the link loopholes in 06-04/05 prevent full guard coverage. Do not count exceptions as independently verified clinical approval. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-07 — Ordered referral exchange history and exact reopening destination

Original contract: DoD 8. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [closureui][source-closureui]; [inbox][source-inbox] |
| API | [closure][source-closure] |
| PERSISTENCE | Append-only ReferralExchangeEvent; direction/stage/source revision and actor/time |
| PERMISSIONS | service_requests.write at actual encounter site |
| RECOVERY | Advisory series lock, bounded transition table, idempotency; preserves original source |
| FINDING | Prepared/sent/received/acknowledged/closed/cancelled evidence is local recorded history. External exchange is separate. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-08 — Manual note draft, exact revision signature, explicit signed-note correction

Original contract: CV-08/09; T05. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [noteui][source-noteui] |
| API | [noteapi][source-noteapi]; [notesign][source-notesign]; [notecorrect][source-notecorrect] |
| PERSISTENCE | EncounterNoteRevision/Signature, content digest and correction source/reason |
| PERMISSIONS | notes.read/write/sign on actual encounter site |
| RECOVERY | Current revision+digest required; correction references signed version and retains prior history |
| FINDING | Does not prove clinical review, real signer eligibility or Scribe provider acceptance. Scribe/telehealth remain their owning milestones. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-09 — Exact reviewed/used plan/form/note references when a selected action requires them

Original contract: CV-10. Classification: **Scoped source present; Undefined broader applicability**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui]; [noteui][source-noteui] |
| API | [planservice][source-planservice]; [notesign][source-notesign]; [notecorrect][source-notecorrect] |
| PERSISTENCE | Immutable clinical revision chains, signatures and explicit correction references |
| PERMISSIONS | Owning action capability |
| RECOVERY | Version/digest comparisons prevent silently using a different signed note/current order |
| FINDING | No universal structured-plan requirement is authorized. A generalized revision-use policy/ledger cannot be declared missing without an action-specific accepted dependency; retain CV-10 as a validation/applicability gate. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-10 — Encounter completion keeps instructions, education, follow-up, open clinical work and money separate

Original contract: DoD 7; OP-12; J6. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui]; [inbox][source-inbox] |
| API | [encountercompletion][source-encountercompletion] |
| PERSISTENCE | EncounterCompletionReview snapshots follow-up version/state, education IDs, signed instruction revision and open-task ownership |
| PERMISSIONS | encounters.write plus actual source read permissions |
| RECOVERY | Changed follow-up/education/work causes stale error; encounter closure does not auto-complete child tasks |
| FINDING | Source review supports separation; current connected closure/reload acceptance is unexecuted. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-11 — Medication administration authority, stock linkage and not-given separation

Original contract: DoD 4; IN-01/02. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [adminui][source-adminui] |
| API | [admin][source-admin] |
| PERSISTENCE | MedicationAdministration and movement links, exact current order, lot/unit/quantity |
| PERMISSIONS | medication_administrations.write; active site/encounter and inventory guards |
| RECOVERY | Idempotency and locked stock allocation; rejected unavailable/expired/held/incompatible lots; no invented dose conversion |
| FINDING | Ordinary role privilege is not licensing proof. External administration/clinical acceptance is not credited. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-12 — Administration-grade immunization fields and distinct historical/not-done/error states

Original contract: DoD 6; hardening Slice 5. Classification: **Present source; Validation; Human gate**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui] |
| API | [planservice][source-planservice] |
| PERSISTENCE | ImmunizationRevision; exact completed stock-linked administration, CVX/MVX, lot/expiry, dose/route/site, actor/facility, paired applicable VIS dates |
| PERMISSIONS | immunizations.write; configured administration scope decision; source administration permission |
| RECOVERY | Historical entry remains separate; completion requires appropriate evidence; entered-in-error retains history |
| FINDING | Explicit actual service/site/personnel/state scope remains human-owned; syntax-format CVX/MVX checks are not terminology validation. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-13 — Lab order, specimen, report and received/manual provenance remain separate

Original contract: LB-01/02; T07; hardening Slice 4. Classification: **Present source with metadata gap; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [labui][source-labui] |
| API | [labapi][source-labapi]; [labservice][source-labservice] |
| PERSISTENCE | Active exact ServiceRequest revision, LabSpecimen, LabReport and immutable LabReportVersion |
| PERMISSIONS | patients.read; observations.write at actual report site |
| RECOVERY | Patient confirmation, current active order validation, idempotency, collected/issued times and specimen condition |
| FINDING | Order/report/specimen linkage is source-present in the normal report-create path. Additional metadata loss is tracked in 06-16. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-14 — Numeric/coded/text/boolean/range/absent values have distinct shape and source text

Original contract: hardening Slice 4; T07. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [labui][source-labui] |
| API | [labtypes][source-labtypes] |
| PERSISTENCE | Encrypted version result JSON with value_kind, code/system, absent_reason and raw text |
| PERMISSIONS | observations.write; patients.read and site scope |
| RECOVERY | Exact numeric/boolean/range shape validation, coded value identity required, absent cannot carry value |
| FINDING | All six kinds exist. Do not incorrectly assign missing typed-lab primitives; exact current API/browser roundtrip remains unproved. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-15 — UCUM/code compatibility validation rejects invalid unit/code pairs without loss of source

Original contract: hardening Slice 4 acceptance. Classification: **Missing source/guard**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [labui][source-labui] |
| API | [labtypes][source-labtypes]; [labhistory][source-labhistory] |
| PERSISTENCE | unit and unit_code stored as bounded strings; code/system/version preserved |
| PERMISSIONS | Existing report write permission applies; no terminology validator found on normalizing path |
| RECOVERY | Raw source is preserved; invalid dimension/unit pair is not rejected by length-only optional_text validation |
| FINDING | G06-C: storing/comparing UCUM strings is present; compatibility validation required by approved hardening brief is absent. Do not infer conversion or clinical normality. |
| OWNER | Unowned in supplied assignment; labqueuepaging owner is not presumed to own this guard |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-16 — Preserve supplied performing/issuing organization, received/result times and method

Original contract: hardening Slice 4 field contract. Classification: **Partial source; Missing source fields**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [labui][source-labui] |
| API | [labapi][source-labapi]; [labtypes][source-labtypes] |
| PERSISTENCE | source_name, collected_at, issued_at, recorded_at exist; no separate received/result timestamp or performing/issuing organization/method fields |
| PERMISSIONS | Normal report permissions |
| RECOVERY | Correction versions preserve supported fields, but cannot roundtrip supplied omitted metadata |
| FINDING | G06-D: source name and entry timestamp do not preserve distinct supplied organization/method/received metadata. Parent should bound exact optional fields; no live-lab connector is required to preserve them. |
| OWNER | Unowned in supplied assignment; parent should bound optional local provenance extension |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-17 — Received/acknowledged is distinct from reviewed, handling and patient contact

Original contract: LB-04/05/07; T07. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [labui][source-labui]; [labactionsui][source-labactionsui] |
| API | [labservice][source-labservice]; [labactions][source-labactions]; [labfollow][source-labfollow] |
| PERSISTENCE | Version-bound LabReportAction, reviewed actor/time, follow-up decision and contact state |
| PERMISSIONS | Acknowledgment/review notes.write; report entry observations.write; exact report scope |
| RECOVERY | Current-version guard; idempotent acknowledgment; critical review requires escalation instructions and due time |
| FINDING | Critical acknowledged receipt does not review or complete contact. Human clinical escalation policy and acceptance remain separate. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-18 — Corrected/partial results reopen affected work and retain earlier unresolved contact

Original contract: LB-03/06/07; T07/T10. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [labui][source-labui]; [inbox][source-inbox] |
| API | [labservice][source-labservice]; [labfollow][source-labfollow]; [planservice][source-planservice] |
| PERSISTENCE | New immutable LabReportVersion; original order task reopened; earlier LabResultFollowUp remains |
| PERMISSIONS | Current report/site read/write; source-owned order completion |
| RECOVERY | Expected-current-version check; absent results retain pending work; prior-version contact can complete separately |
| FINDING | Source and authored T07/T10 cases exist. API is paged; any pending UI queue paging belongs to the existing MC12 owner, not a new parallel task. |
| OWNER | Existing MC12 labqueuepaging owner for queue paging only |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-19 — Rejected/compromised specimen produces recollection work and later same-order evidence

Original contract: LB-02; T07. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [labactionsui][source-labactionsui] |
| API | [labactions][source-labactions] |
| PERSISTENCE | Recollection request/completion actions, ClinicalTask and later satisfactory replacement report |
| PERMISSIONS | notes.write and patients.read at actual report site |
| RECOVERY | Same-order series, later collected_at, satisfactory specimen required; dependency checked before task completion |
| FINDING | Closure does not erase recollection work. Exact role/reload/retry proof remains unexecuted. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-20 — Longitudinal results preserve source, test systems and units without unsafe comparison

Original contract: hardening Slice 4; LB-06. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [labui][source-labui] |
| API | [labhistory][source-labhistory]; [labapi][source-labapi] |
| PERSISTENCE | Current noncancelled report versions; name/code/system/unit code/source matching |
| PERMISSIONS | notes.read plus patient and report site permissions |
| RECOVERY | Stale selected report rejected; scan coverage explicitly bounded; no automatic clinical conversion |
| FINDING | Source-faithful comparison is present; it does not satisfy G06-C terminology validation. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-21 — Patient contact attempts, failed outreach, next due action and owned completion

Original contract: LB-07; OP-02–05; T10. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [labui][source-labui]; [inbox][source-inbox] |
| API | [labfollow][source-labfollow]; [continuity][source-continuity]; [tasks][source-tasks] |
| PERSISTENCE | LabResultFollowUpContactAttempt, follow-up and source-linked ClinicalTask |
| PERMISSIONS | notes.write; contact-attempt path also checks encounters.write; transfer rechecks eligibility |
| RECOVERY | Failure retains next due task; corrected old-version follow-up remains actionable; current owner/coverage exceptions exposed |
| FINDING | No automatic external sending or invented contact cadence; comprehensive revoke/stale/coverage/browser proof remains. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 06-22 — Actual lab/referral/IIS connection, clinical governance and accessibility acceptance

Original contract: OP-06–08; DoD external boundaries; hardening Slices 5/6/8. Classification: **External/human; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [Existing local forms][source-Existing local forms] |
| API | [Local services only][source-Local services only] |
| PERSISTENCE | Local evidence cannot create partner receipt or approved clinical policy |
| PERMISSIONS | Actual provider and professional authority not granted |
| RECOVERY | Disconnected/manual preparation and unrelated work remain available |
| FINDING | Partner mappings, selected terminology policy, clinical thresholds/coverage, privacy/retention and human desktop/tablet/keyboard/AT acceptance remain outside source completion. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-01 — Versioned medication draft with inherited patient/encounter/site and coded identity

Original contract: Prescription brief fields; RX-01. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui] |
| API | [planapi][source-planapi]; [planservice][source-planservice]; [rxrelease][source-rxrelease] |
| PERSISTENCE | MedicationRequestRevision with prior revision, medication code/system/version/source or inventory product |
| PERMISSIONS | patients.read/clinical_records.read; medication_requests.write at site |
| RECOVERY | Unmapped draft remains saved; release requires identity plus required details |
| FINDING | Code/source fields and structured stock identity exist; terminology verification/service policy remains unresolved rather than inferred. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-02 — Strength/form/SIG/dose/route/frequency/quantity/refills/start/duration details

Original contract: Prescription brief field contract. Classification: **Present source; Validation; Undefined policy-dependent validity**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui] |
| API | [planservice][source-planservice]; [rxrelease][source-rxrelease] |
| PERSISTENCE | Typed dose/quantity/refills/start date plus preserved instruction/duration text |
| PERMISSIONS | medication_requests.write |
| RECOVERY | Missing submit fields identified; draft retained; no universal clinical protocol |
| FINDING | Duration/start are source-present. Exact days-supply/validity-period policy is not selected; do not invent mandatory federal limits. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-03 — Required substitution choice: allowed, not allowed, unresolved draft, optional rationale

Original contract: Prescription brief field contract and connected journey. Classification: **Missing source fields/control**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui] |
| API | [planservice][source-planservice]; [rxrelease][source-rxrelease] |
| PERSISTENCE | No substitution choice/rationale in revision fields, model or schema |
| PERMISSIONS | Would use existing medication_requests.write |
| RECOVERY | No current submit readiness guard can reject unresolved substitution |
| FINDING | G10-A: accepted brief explicitly requires this selection for submit; source lacks UI/API/persistence/guard. Vendor mapping is separate and does not explain missing local choice. |
| OWNER | Unowned in supplied assignment; Nova MC10paging does not imply ownership |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-04 — Practice pharmacy directory entry/selection and immutable destination snapshot

Original contract: Prescription brief sequence 1; RX-01. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui] |
| API | [rxsubmit][source-rxsubmit] |
| PERSISTENCE | PharmacyDestination and destination_snapshot on immutable attempt |
| PERMISSIONS | Practice-scoped active destination; prescription site authority |
| RECOVERY | Retained exact pharmacy-create key/form on uncertain save; inactive/foreign destination rejected |
| FINDING | Saved selection/snapshot is present. Directory source/verification policy remains a named human gate; broad directory lookup is unselected. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-05 — Exact clinician review applies to current authorized prescription; edit invalidates review

Original contract: RX-02; brief acceptance. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui]; [planui][source-planui] |
| API | [rxworkflow][source-rxworkflow]; [rxsubmit][source-rxsubmit]; [planservice][source-planservice] |
| PERSISTENCE | Manual review PrescriptionEvent points to exact revision; revision chain preserves old reviews |
| PERMISSIONS | medication_requests.write; active membership, actual patient/site authorization |
| RECOVERY | Current version checked; review cannot be simulated; changing revision requires renewed review |
| FINDING | Role capability is not a professional/license check. Current wrong-role/stale/reload acceptance remains unexecuted. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-06 — Durable prepare/readiness stage without external send or backlog replay

Original contract: Prescription brief connected journey/sequence 2–3. Classification: **Partial source; Missing local prepare stage**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [planui][source-planui]; [rxui][source-rxui] |
| API | [rxrelease][source-rxrelease]; [rxsubmit][source-rxsubmit] |
| PERSISTENCE | Draft/current reviewed order exists; attempts are created only in submit |
| PERMISSIONS | Existing prescription write permission |
| RECOVERY | No vendor credential/send path; draft retained, submit transaction guarded |
| FINDING | G10-B: there is no separate durable prepared attempt/canonical payload snapshot/digest stage as described in the accepted brief. Do not require a new architectural class solely by name; preserve equivalent behavior if a bounded design is chosen. |
| OWNER | Unowned in supplied assignment; parent should confirm bounded local prepare acceptance |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-07 — Immutable attempt source/schema/transaction/digest/correlation/response/prior-attempt evidence

Original contract: Prescription brief ledger and fields. Classification: **Partial source; Missing planned provenance**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui] |
| API | [rxsubmit][source-rxsubmit] |
| PERSISTENCE | rxattempt/rxschema preserve revision/event/destination/key/actor/adapter/outcome/submitted_at; generic OperationReceipt has request digest |
| PERMISSIONS | Backend owns attempt; current order/site/destination rechecked |
| RECOVERY | Same-key idempotency exists; event links and notes preserve current local reconciliation |
| FINDING | G10-C: ledger has no explicit transaction/schema/correlation ID, canonical prepared payload digest, response metadata/received time or prior-attempt link. Generic operation digest is not a full transmission payload/response ledger. Real partner fields/redaction remain undefined. |
| OWNER | Unowned in supplied assignment; confirm synthetic fields separately from future provider contract |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-08 — Backend-only bounded simulation and visibly separate request/transmission/fulfillment

Original contract: Brief sequence 3; OP-06; T09. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui] |
| API | [rxworkflow][source-rxworkflow]; [rxsubmit][source-rxsubmit] |
| PERSISTENCE | Immutable source=simulation event/attempt; standard and configured controlled_test modes |
| PERMISSIONS | Server medication_requests.write; controlled mode requires configured service |
| RECOVERY | Direct manual vendor acceptance and direct simulated-outcome creation rejected; no network side effect/backlog replay |
| FINDING | Nine bounded outcomes exist; fake controlled signer/reviewer snapshots are explicitly synthetic, not real EPCS acceptance. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-09 — Unknown/rejected/accepted outcome blocks blind retry/change until source-linked reconciliation

Original contract: RX-03; OP-07/08; T06/T09. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui]; [planui][source-planui] |
| API | [rxworkflow][source-rxworkflow]; [planservice][source-planservice] |
| PERSISTENCE | Series-level nonreview event order; prior_event_id, note, source and immutable old attempt |
| PERMISSIONS | Existing active prescription writer/site/patient capability |
| RECOVERY | Latest unresolved source/event required; notes and same source retained; accepted requires cancellation rather than confirmed-not-sent |
| FINDING | Original versions remain historically readable, including after encounter closure. No external cancellation receipt is implied. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-10 — Known rejection/destination change leads to correction and renewed review; cancellation/replacement chain retained

Original contract: RX-03; brief recovery. Classification: **Present local chain; Missing cancellation extension; External boundary**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui]; [planui][source-planui] |
| API | [rxworkflow][source-rxworkflow]; [planservice][source-planservice]; [rxsubmit][source-rxsubmit] |
| PERSISTENCE | Append-only confirmed cancellation/not-sent prior_event chain plus corrected order revisions |
| PERMISSIONS | medication_requests.write |
| RECOVERY | Reconcile original first; editing creates new revision; exact review required |
| FINDING | Local recorded cancellation is present. There is no distinct simulated CancelRx request/response transaction lifecycle; actual CancelRx/transfer version/legal mapping is undefined/external. |
| OWNER | Unowned local extension if selected; Nova owns paging, not assumed cancellation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-11 — Simulated RxFill notice links to prescription attempt without masquerading as dispensing

Original contract: Prescription brief connected journey/sequence 4. Classification: **Missing source; later extension scope requires confirmation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui] |
| API | [rxapi][source-rxapi]; [rxsubmit][source-rxsubmit] |
| PERSISTENCE | rxevent kinds and attempt outcomes have no RxFill/fill-notice type |
| PERMISSIONS | No current local action for RxFill |
| RECOVERY | Current take-home handover ledger must not substitute for pharmacy fill notice |
| FINDING | G10-D: no simulated fill-notice lifecycle is implemented. Brief names it; tracker keeps RxFill extensions open. Exact selected transaction/fields remain to be bounded before assigning work. |
| OWNER | No owner identified; parent should scope local extension |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-12 — All original prescription events/attempts visible with actor/time/source and exact revision history

Original contract: Brief sequence 4; OP-10/12. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui] |
| API | [rxapi][source-rxapi]; [rxworkflow][source-rxworkflow]; [rxsubmit][source-rxsubmit] |
| PERSISTENCE | Full ordered series event/attempt history plus old revision/event links |
| PERMISSIONS | clinical_records.read at order site and accessible patient |
| RECOVERY | Refresh preserves pending request; retry exact request on uncertain result; reconciliation history not overwritten |
| FINDING | Patient-specific full returned history is source-present. It is distinct from the capped cross-patient worklist. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-13 — Cross-patient unresolved response/reconciliation worklist with scoped counts and exact recovery

Original contract: RX-03; worklist assignment. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxqueueui][source-rxqueueui]; [inbox][source-inbox] |
| API | [rxqueue][source-rxqueue] |
| PERSISTENCE | Projection from persisted simulation attempts, latest nonreview series event; original order/encounter retained |
| PERMISSIONS | patients.read and clinical_records.read; accessible patients/sites filtered before count; sensitive-read audit |
| RECOVERY | Failed refresh clears unconfirmed rows; stale scope/revoked capability response suppressed; explicit owner/next action/history href |
| FINDING | Baseline worklist is integrated-source present. Existing literal owner 'Prescriber/support queue' is the accepted team label, not evidence of individual assignment. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-14 — Discover unresolved attempts beyond first 50

Original contract: Tracker current local backlog; OP-12. Classification: **Missing at baseline; Pending source 60158**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxqueueui][source-rxqueueui] |
| API | [rxqueue][source-rxqueue] |
| PERSISTENCE | Baseline count/limit/truncated exists; no offset/page contract |
| PERMISSIONS | Same permission-before-count boundary |
| RECOVERY | Baseline displays truncation but cannot reach later unresolved rows |
| FINDING | 60158 adds bounded page input, permission-filtered count/offset and page UI/recovery, with authored API/browser cases. It is not an ancestor of c164683 and receives no integrated or validation credit. |
| OWNER | Nova MC10paging; do not duplicate |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-15 — Patient/staff refill intake, explicit reconcile/review/approve/change/decline and no automatic send

Original contract: DoD 3; brief sequence 5. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [portalrefill][source-portalrefill]; [refillui][source-refillui] |
| API | [refillapi][source-refillapi]; [refillorder][source-refillorder] |
| PERSISTENCE | PatientPortalRequest plus review/decision/reconciliation and authoritative medication revision |
| PERMISSIONS | Portal identity/ownership or staff prescription capability; selected encounter/patient checked |
| RECOVERY | Decision creates linked replacement, declined/follow-up preserved; exact review still required before simulated submit |
| FINDING | Refill request/approval is not pharmacy transmission, fill, entitlement or clinical acceptance. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-16 — Prior prescription series and replacement remain linked; original history retained

Original contract: Brief refill rules/sequence 5. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [refillui][source-refillui] |
| API | [refillorder][source-refillorder] |
| PERSISTENCE | refill_of_series_id; copied supported medication/destination fields in a new series |
| PERMISSIONS | Same patient/practice and authorized order workflow |
| RECOVERY | Replacement creates draft then authorized revision; prior review is not copied as approval |
| FINDING | Preserves supported data; missing substitution fields would also need propagation if G10-A is repaired. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-17 — Refill patient response delivery state, failed-delivery queue and explicit exact retry

Original contract: DoD 3; brief acceptance; OP-03/10. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [refillui][source-refillui]; [portalrefill][source-portalrefill] |
| API | [refillapi][source-refillapi]; [refilldelivery][source-refilldelivery] |
| PERSISTENCE | RefillResponseDelivery attempt/state/failure/time and terminal refill response |
| PERMISSIONS | medication_requests.write and patient visibility; available portal identity required |
| RECOVERY | Paged staff queue plus failed delivery filter; portal_identity_unavailable remains failed; exact delivery request replay |
| FINDING | Portal delivery means durable response available to identity, not actual human reading, email/SMS receipt or external delivery acceptance. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-18 — In-house take-home dispensing stays separate, stock-safe, partial/reversible and quantity-backed

Original contract: IN-01–03; T06/J4. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui]; [adminui][source-adminui] |
| API | [rxapi][source-rxapi]; [dispense][source-dispense]; [admin][source-admin] |
| PERSISTENCE | MedicationDispense and original reversal link; inventory ledger; separate administration movement records |
| PERMISSIONS | Prescription/stock dispensing authorities; current order, compatible unit/lot/site |
| RECOVERY | Remaining balance checked; partial handover retains remainder; reversal targets original; no expired/held/insufficient lot use |
| FINDING | A simulated accepted prescription or fill notice cannot be credited as take-home handover/administration. Fresh concurrency/reload proof not run. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-19 — Permission revocation, wrong clinic/site/patient, duplicate/stale/uncertain recovery and closure retention

Original contract: Brief API/data/browser acceptance; OP-05/10/12; T09/T10. Classification: **Present source; Validation**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [rxui][source-rxui]; [rxqueueui][source-rxqueueui]; [refillui][source-refillui] |
| API | [rxworkflow][source-rxworkflow]; [rxsubmit][source-rxsubmit]; [rxqueue][source-rxqueue]; [refillapi][source-refillapi]; [continuity][source-continuity] |
| PERSISTENCE | Immutable revisions/events/attempts, Idempotency receipts and source-linked ClinicalTask |
| PERMISSIONS | Server active-membership/site/patient checks remain authority; UI capabilities are only display controls |
| RECOVERY | Replay keys retained in uncertain UI requests; stale version/site rejected; closed encounter remains source-history target |
| FINDING | Authored test evidence includes rxqueuetests, plantests and rxtests. No current execution occurred; device/keyboard/connected Work inbox acceptance remains a real validation gap. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

### 10-20 — Actual prescribing-network mapping/credentials, pharmacy response/dispense/delivery and legal/clinical release

Original contract: Brief sequence 6 and exclusions; OP-06–08. Classification: **External/human; Undefined selected provider scope**.

| Dimension | Evidence / behavior |
| --- | --- |
| UI | [Local simulator disclosure][source-Local simulator disclosure] |
| API | [No live adapter inspected or invoked][source-No live adapter inspected or invoked] |
| PERSISTENCE | No external receipt exists |
| PERMISSIONS | Vendor/onboarding/security/professional/clinic authority not granted |
| RECOVERY | Prepared backlog must never auto-send; external transfer/EPCS/PDMP, controlled-substance rules remain separate |
| FINDING | Vendor/version/cardinality, directory verification, terminology caching, retention/redaction, licensure and support/release policy remain named decisions. Existing controlled_test does not satisfy any of them. |
| OWNER | No owner identified in this delegation |
| VALIDATION | Source inspection only at the immutable baseline. No fresh API, browser, lint or runtime checks executed; authored tests and dated evidence are not credited as a current pass. |

## Unowned versus existing-owner findings

- G06-A/B: local fulfillment evidence guards are the current bounded implementation request.
- G06-C/D: lab unit/dimension validation and optional supplied provenance remain separately documented for another owner; queue paging ownership does not imply ownership of these changes.
- G10-A/B/C: substitution readiness, durable preparation and fuller attempt provenance remain separately documented for another owner.
- G10-D: simulated RxFill and richer cancellation require bounded scope before assignment; actual provider transaction mapping remains undefined/external.
- Nova owns pending `60158` prescription paging; MC12 owns labqueuepaging. Neither is duplicated here.

## Publication checkpoint

The matrix is published on `codex/mc06-fulfillment-source-coverage`, based on combined candidate `5470609423ed67b99453c3b779f584e0c86f2fd8`. The two guard services and owning test file are unchanged from the matrix baseline. No score, canonical tracker, WorkInbox, paging, clinical result rules, infrastructure, PR, merge or deployment change is part of this publication.

## Source reference key

- `guide`: [docs/development/meta-clinic-build-and-acceptance.md](../../docs/development/meta-clinic-build-and-acceptance.md) at baseline line 131.
[source-guide]: ../../docs/development/meta-clinic-build-and-acceptance.md

- `dod`: [records/implementation/2026-09-11-ten-audit-dod-closeout.md](../../records/implementation/2026-09-11-ten-audit-dod-closeout.md) at baseline line 7.
[source-dod]: ../../records/implementation/2026-09-11-ten-audit-dod-closeout.md

- `labplan`: [docs/development/non-vendor-clinic-hardening-plan.md](../../docs/development/non-vendor-clinic-hardening-plan.md) at baseline line 137.
[source-labplan]: ../../docs/development/non-vendor-clinic-hardening-plan.md

- `rxplan`: [docs/development/prescription-transmission-plan.md](../../docs/development/prescription-transmission-plan.md) at baseline line 41.
[source-rxplan]: ../../docs/development/prescription-transmission-plan.md

- `journey`: [PATIENT_JOURNEY_PLAN.md](../../PATIENT_JOURNEY_PLAN.md) at baseline line 43.
[source-journey]: ../../PATIENT_JOURNEY_PLAN.md

- `cases`: [records/superseded-plans/PATIENT_JOURNEY_EXECUTION_PLAN.md](../../records/superseded-plans/PATIENT_JOURNEY_EXECUTION_PLAN.md) at baseline line 316.
[source-cases]: ../../records/superseded-plans/PATIENT_JOURNEY_EXECUTION_PLAN.md

- `inbox`: [apps/web/src/features/clinic/WorkInbox.tsx](../../apps/web/src/features/clinic/WorkInbox.tsx) at baseline line 2157.
[source-inbox]: ../../apps/web/src/features/clinic/WorkInbox.tsx

- `tasks`: [apps/api/app/services/clinic/care/nurse_workflow.rb](../../apps/api/app/services/clinic/care/nurse_workflow.rb) at baseline line 577.
[source-tasks]: ../../apps/api/app/services/clinic/care/nurse_workflow.rb

- `continuity`: [apps/api/app/services/clinic/care/task_continuity.rb](../../apps/api/app/services/clinic/care/task_continuity.rb) at baseline line 35.
[source-continuity]: ../../apps/api/app/services/clinic/care/task_continuity.rb

- `planui`: [apps/web/src/features/clinic/ClinicalPlanWorkspace.tsx](../../apps/web/src/features/clinic/ClinicalPlanWorkspace.tsx) at baseline line 112.
[source-planui]: ../../apps/web/src/features/clinic/ClinicalPlanWorkspace.tsx

- `planapi`: [apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb](../../apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb) at baseline line 1.
[source-planapi]: ../../apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb

- `planservice`: [apps/api/app/services/clinic/care/clinical_plan_workflow.rb](../../apps/api/app/services/clinic/care/clinical_plan_workflow.rb) at baseline line 196.
[source-planservice]: ../../apps/api/app/services/clinic/care/clinical_plan_workflow.rb

- `closureui`: [apps/web/src/features/clinic/ClinicalPlanClosurePanel.tsx](../../apps/web/src/features/clinic/ClinicalPlanClosurePanel.tsx) at baseline line 167.
[source-closureui]: ../../apps/web/src/features/clinic/ClinicalPlanClosurePanel.tsx

- `closure`: [apps/api/app/services/clinic/care/clinical_plan_closure_workflow.rb](../../apps/api/app/services/clinic/care/clinical_plan_closure_workflow.rb) at baseline line 31.
[source-closure]: ../../apps/api/app/services/clinic/care/clinical_plan_closure_workflow.rb

- `completion`: [apps/api/app/services/clinic/care/clinical_plan_workflow.rb](../../apps/api/app/services/clinic/care/clinical_plan_workflow.rb) at baseline line 563.
[source-completion]: ../../apps/api/app/services/clinic/care/clinical_plan_workflow.rb

- `plansch`: [apps/api/db/migrate/20260910001200_create_clinical_plan_closure_records.rb](../../apps/api/db/migrate/20260910001200_create_clinical_plan_closure_records.rb) at baseline line 29.
[source-plansch]: ../../apps/api/db/migrate/20260910001200_create_clinical_plan_closure_records.rb

- `labui`: [apps/web/src/features/clinic/PatientLabReports.tsx](../../apps/web/src/features/clinic/PatientLabReports.tsx) at baseline line 1.
[source-labui]: ../../apps/web/src/features/clinic/PatientLabReports.tsx

- `labapi`: [apps/api/app/controllers/clinic/care/lab_reports_controller.rb](../../apps/api/app/controllers/clinic/care/lab_reports_controller.rb) at baseline line 1.
[source-labapi]: ../../apps/api/app/controllers/clinic/care/lab_reports_controller.rb

- `labservice`: [apps/api/app/services/clinic/care/lab_reports.rb](../../apps/api/app/services/clinic/care/lab_reports.rb) at baseline line 9.
[source-labservice]: ../../apps/api/app/services/clinic/care/lab_reports.rb

- `labtypes`: [apps/api/app/services/clinic/care/lab_reports.rb](../../apps/api/app/services/clinic/care/lab_reports.rb) at baseline line 179.
[source-labtypes]: ../../apps/api/app/services/clinic/care/lab_reports.rb

- `labactionsui`: [apps/web/src/features/clinic/LabReportActionsPanel.tsx](../../apps/web/src/features/clinic/LabReportActionsPanel.tsx) at baseline line 47.
[source-labactionsui]: ../../apps/web/src/features/clinic/LabReportActionsPanel.tsx

- `labactions`: [apps/api/app/services/clinic/care/lab_report_actions.rb](../../apps/api/app/services/clinic/care/lab_report_actions.rb) at baseline line 19.
[source-labactions]: ../../apps/api/app/services/clinic/care/lab_report_actions.rb

- `labfollow`: [apps/api/app/services/clinic/care/lab_result_follow_ups.rb](../../apps/api/app/services/clinic/care/lab_result_follow_ups.rb) at baseline line 50.
[source-labfollow]: ../../apps/api/app/services/clinic/care/lab_result_follow_ups.rb

- `labmodel`: [apps/api/app/models/clinic/care/lab_report_version.rb](../../apps/api/app/models/clinic/care/lab_report_version.rb) at baseline line 7.
[source-labmodel]: ../../apps/api/app/models/clinic/care/lab_report_version.rb

- `labhistory`: [apps/api/app/services/clinic/care/lab_result_history.rb](../../apps/api/app/services/clinic/care/lab_result_history.rb) at baseline line 1.
[source-labhistory]: ../../apps/api/app/services/clinic/care/lab_result_history.rb

- `labtests`: [apps/api/test/integration/clinic_lab_reports_test.rb](../../apps/api/test/integration/clinic_lab_reports_test.rb) at baseline line 492.
[source-labtests]: ../../apps/api/test/integration/clinic_lab_reports_test.rb

- `noteui`: [apps/web/src/features/clinic/EncounterNoteSigning.tsx](../../apps/web/src/features/clinic/EncounterNoteSigning.tsx) at baseline line 1.
[source-noteui]: ../../apps/web/src/features/clinic/EncounterNoteSigning.tsx

- `noteapi`: [apps/api/app/controllers/clinic/care/encounter_notes_controller.rb](../../apps/api/app/controllers/clinic/care/encounter_notes_controller.rb) at baseline line 99.
[source-noteapi]: ../../apps/api/app/controllers/clinic/care/encounter_notes_controller.rb

- `notesign`: [apps/api/app/services/clinic/care/sign_encounter_note.rb](../../apps/api/app/services/clinic/care/sign_encounter_note.rb) at baseline line 6.
[source-notesign]: ../../apps/api/app/services/clinic/care/sign_encounter_note.rb

- `notecorrect`: [apps/api/app/services/clinic/care/correct_encounter_note.rb](../../apps/api/app/services/clinic/care/correct_encounter_note.rb) at baseline line 6.
[source-notecorrect]: ../../apps/api/app/services/clinic/care/correct_encounter_note.rb

- `encountercompletion`: [apps/api/app/services/clinic/scheduling/encounter_completion.rb](../../apps/api/app/services/clinic/scheduling/encounter_completion.rb) at baseline line 28.
[source-encountercompletion]: ../../apps/api/app/services/clinic/scheduling/encounter_completion.rb

- `adminui`: [apps/web/src/features/clinic/MedicationAdministrations.tsx](../../apps/web/src/features/clinic/MedicationAdministrations.tsx) at baseline line 1.
[source-adminui]: ../../apps/web/src/features/clinic/MedicationAdministrations.tsx

- `admin`: [apps/api/app/services/clinic/care/administer_medication.rb](../../apps/api/app/services/clinic/care/administer_medication.rb) at baseline line 1.
[source-admin]: ../../apps/api/app/services/clinic/care/administer_medication.rb

- `immun`: [apps/api/app/models/clinic/care/immunization_revision.rb](../../apps/api/app/models/clinic/care/immunization_revision.rb) at baseline line 40.
[source-immun]: ../../apps/api/app/models/clinic/care/immunization_revision.rb

- `rxui`: [apps/web/src/features/clinic/PrescriptionFulfillmentPanel.tsx](../../apps/web/src/features/clinic/PrescriptionFulfillmentPanel.tsx) at baseline line 205.
[source-rxui]: ../../apps/web/src/features/clinic/PrescriptionFulfillmentPanel.tsx

- `rxapi`: [apps/api/app/controllers/clinic/care/prescription_events_controller.rb](../../apps/api/app/controllers/clinic/care/prescription_events_controller.rb) at baseline line 4.
[source-rxapi]: ../../apps/api/app/controllers/clinic/care/prescription_events_controller.rb

- `rxworkflow`: [apps/api/app/services/clinic/care/prescription_workflow.rb](../../apps/api/app/services/clinic/care/prescription_workflow.rb) at baseline line 14.
[source-rxworkflow]: ../../apps/api/app/services/clinic/care/prescription_workflow.rb

- `rxrelease`: [apps/api/app/services/clinic/care/prescription_workflow.rb](../../apps/api/app/services/clinic/care/prescription_workflow.rb) at baseline line 61.
[source-rxrelease]: ../../apps/api/app/services/clinic/care/prescription_workflow.rb

- `rxsubmit`: [apps/api/app/services/clinic/care/prescription_transmission_workflow.rb](../../apps/api/app/services/clinic/care/prescription_transmission_workflow.rb) at baseline line 12.
[source-rxsubmit]: ../../apps/api/app/services/clinic/care/prescription_transmission_workflow.rb

- `rxmodel`: [apps/api/app/models/clinic/care/medication_request_revision.rb](../../apps/api/app/models/clinic/care/medication_request_revision.rb) at baseline line 41.
[source-rxmodel]: ../../apps/api/app/models/clinic/care/medication_request_revision.rb

- `rxattempt`: [apps/api/app/models/clinic/care/prescription_transmission_attempt.rb](../../apps/api/app/models/clinic/care/prescription_transmission_attempt.rb) at baseline line 6.
[source-rxattempt]: ../../apps/api/app/models/clinic/care/prescription_transmission_attempt.rb

- `rxschema`: [apps/api/db/structure.sql](../../apps/api/db/structure.sql) at baseline line 8576.
[source-rxschema]: ../../apps/api/db/structure.sql

- `rxevent`: [apps/api/app/models/clinic/care/prescription_event.rb](../../apps/api/app/models/clinic/care/prescription_event.rb) at baseline line 11.
[source-rxevent]: ../../apps/api/app/models/clinic/care/prescription_event.rb

- `rxqueue`: [apps/api/app/queries/clinic/care/prescription_reconciliation_worklist.rb](../../apps/api/app/queries/clinic/care/prescription_reconciliation_worklist.rb) at baseline line 4.
[source-rxqueue]: ../../apps/api/app/queries/clinic/care/prescription_reconciliation_worklist.rb

- `rxqueueui`: [apps/web/src/features/clinic/PrescriptionReconciliationWorklist.tsx](../../apps/web/src/features/clinic/PrescriptionReconciliationWorklist.tsx) at baseline line 1.
[source-rxqueueui]: ../../apps/web/src/features/clinic/PrescriptionReconciliationWorklist.tsx

- `rxqueuetests`: [apps/api/test/integration/prescription_reconciliation_worklist_test.rb](../../apps/api/test/integration/prescription_reconciliation_worklist_test.rb) at baseline line 22.
[source-rxqueuetests]: ../../apps/api/test/integration/prescription_reconciliation_worklist_test.rb

- `refillui`: [apps/web/src/features/clinic/RefillRequestQueue.tsx](../../apps/web/src/features/clinic/RefillRequestQueue.tsx) at baseline line 1.
[source-refillui]: ../../apps/web/src/features/clinic/RefillRequestQueue.tsx

- `portalrefill`: [apps/web/src/features/patientPortal/PatientRefillRequests.tsx](../../apps/web/src/features/patientPortal/PatientRefillRequests.tsx) at baseline line 1.
[source-portalrefill]: ../../apps/web/src/features/patientPortal/PatientRefillRequests.tsx

- `refillapi`: [apps/api/app/controllers/clinic/care/refill_requests_controller.rb](../../apps/api/app/controllers/clinic/care/refill_requests_controller.rb) at baseline line 4.
[source-refillapi]: ../../apps/api/app/controllers/clinic/care/refill_requests_controller.rb

- `refillorder`: [apps/api/app/services/clinic/patient_portal/refill_medication_request.rb](../../apps/api/app/services/clinic/patient_portal/refill_medication_request.rb) at baseline line 6.
[source-refillorder]: ../../apps/api/app/services/clinic/patient_portal/refill_medication_request.rb

- `refilldelivery`: [apps/api/app/services/clinic/patient_portal/deliver_refill_response.rb](../../apps/api/app/services/clinic/patient_portal/deliver_refill_response.rb) at baseline line 4.
[source-refilldelivery]: ../../apps/api/app/services/clinic/patient_portal/deliver_refill_response.rb

- `dispense`: [apps/api/app/services/clinic/care/medication_dispensing.rb](../../apps/api/app/services/clinic/care/medication_dispensing.rb) at baseline line 18.
[source-dispense]: ../../apps/api/app/services/clinic/care/medication_dispensing.rb

- `plantests`: [apps/api/test/integration/clinical_plan_workflow_test.rb](../../apps/api/test/integration/clinical_plan_workflow_test.rb) at baseline line 258.
[source-plantests]: ../../apps/api/test/integration/clinical_plan_workflow_test.rb

- `rxtests`: [apps/api/test/integration/refill_workflow_test.rb](../../apps/api/test/integration/refill_workflow_test.rb) at baseline line 26.
[source-rxtests]: ../../apps/api/test/integration/refill_workflow_test.rb


## Fulfillment-guard implementation checkpoint — 2026-09-30

The separately published baseline matrix commit is `4732505e5d115e51f850976560f8184ebf52ba94` on `codex/mc06-fulfillment-source-coverage`. Its 42 groups remain historical baseline evidence; the findings are not silently changed to match this repair.

**Approved bounded repair:** G06-A and G06-B only, against combined source `5470609423ed67b99453c3b779f584e0c86f2fd8`. Blob comparison confirmed that the two services and owning test file were identical at this implementation base and the immutable matrix baseline.

- [ClinicalPlanClosureWorkflow](../../apps/api/app/services/clinic/care/clinical_plan_closure_workflow.rb) rejects noncompleted procedure fulfillment, offers only completed current procedure revisions as link targets, and requires a lab report's original order to match the selected order's practice, patient, encounter and series. A report attached to an earlier revision of that same order series remains eligible.
- [ClinicalPlanWorkflow](../../apps/api/app/services/clinic/care/clinical_plan_workflow.rb) rechecks those source/target predicates before accepting stored service-request fulfillment links as completion evidence. Existing invalid links remain historical records and cannot satisfy the completion gate by themselves. Document alternatives, referral closure evidence, explicit completion exceptions, existing lab review/absent-result checks, authorizations, idempotency, current-source checks and task dependency semantics retain their owning behavior. No new clinical result rule, migration or data cleanup is introduced.
- [ClinicalPlanWorkflowTest](../../apps/api/test/integration/clinical_plan_workflow_test.rb) adds two synthetic regression cases: incomplete procedure rejection, previously recorded invalid-link completion denial, completed procedure recovery/replay, wrong-order report rejection and previously recorded wrong-link denial, earlier same-series report acceptance, stale-source denial, exact link replay, source-owned completion and unrelated order-task preservation. The cases are authored but **not executed here**.

**Ownership correction:** Nova now owns G06-C/D, the lab unit/dimension and organization/method/time provenance gaps. This branch owns only the two fulfillment services, `clinical_plan_workflow_test.rb`, and this dated matrix/checkpoint. It does not edit lab normalization/model/controller/serializer/UI, WorkInbox or paging paths. Nova retains MC10 paging and MC14; the existing MC12 owner retains labqueuepaging. G10-A/B/C and bounded RxFill/cancellation decisions remain separately documented for parent assignment.

**Checks actually performed:** `git diff --check` passed. Scoped JSON/link validation confirmed all 42 unique groups and every relative document/source path resolves. `python3 bin/agent-check --phase final --staged --path apps/api --level component --json` listed impacted checks; it did not execute Rails or RuboCop. `python3 bin/verify-agent-harness` ran and failed on the pre-existing missing tracker link to `docs/development/clinic-workflow-plans/patient-membership-history.md`; the implementation-base tracker also lacks that link. No historical harness/tracker repair is included. Ruby syntax, RuboCop, Rails/eager loading and connected browser acceptance are unexecuted because the cloud has no Ruby/gems/PostgreSQL runtime and official registries remain blocked. No frontend source changed, so no frontend build or tests were run.

**Sage backend handoff:** use this branch's final exact source head in Sage's existing isolated synthetic test runtime with the pinned locked Ruby/Bundler dependencies. Reuse only the runtime Sage owns, keep `RAILS_ENV=test`, and do not point these commands at development/hosted/live databases. From repository root:

```sh
cd apps/api
python3 ../../bin/agent-resources run -- ruby bin/postgres exec env RAILS_ENV=test bin/rails db:prepare
python3 ../../bin/agent-resources run -- ruby bin/postgres exec env RAILS_ENV=test bin/rails test test/integration/clinical_plan_workflow_test.rb test/integration/clinic_lab_reports_test.rb
python3 ../../bin/agent-resources run -- ruby bin/rubocop app/services/clinic/care/clinical_plan_closure_workflow.rb app/services/clinic/care/clinical_plan_workflow.rb test/integration/clinical_plan_workflow_test.rb
python3 ../../bin/agent-resources run -- ruby bin/postgres exec env RAILS_ENV=test bin/rails zeitwerk:check
```

These commands are a handoff, not a claimed Sage execution or passing result. The parent routes the immutable final head to Sage. No new PR, score edit, canonical tracker change, main merge, deployment, provider action, secrets or infrastructure change occurred.

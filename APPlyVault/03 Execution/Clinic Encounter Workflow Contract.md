---
type: workflow-contract
status: proposed
updated: 2026-09-02
---
# Clinic Encounter Workflow Contract — Proposed Synthetic Boundary

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Parent task: [T-13](https://app.shortcut.com/apply-1/roadmap) · Visual system: [[Design]] · Design history and workflow boundaries: [[Clinic Workspace Design]] · Existing walkthrough: [[Clinic Intake Handoff Walkthrough]] · Frontend map: [[Clinic Frontend Backend Mapping]] · Failure method: [[Working Agreement#Failure-first planning and review]]

## Purpose, authority and limits

This note translates the requested synthetic route into a proposed backend/UI contract for **identity confirmation → intake → triage → explicit clinician acceptance → provider exam draft → diagnosis draft/assertion boundary → discharge**. It is a planning and engineering handoff, not an observed clinic workflow, clinical policy, API acceptance, HIPAA assessment, legal opinion, security certification, or release decision.

T-13.2 still needs an authorized role/workflow walkthrough. T-13.3 still needs a reviewed field/state/permission/API contract with named product, clinical, engineering and security/privacy reviewers. Nothing in this note supplies those approvals. All examples and tests must use independently created synthetic records.

Medications, treatments, prescribing, dispensing, results, billing, messaging, documents, checkout, departure, follow-up, external integrations and production/real-data use are excluded. “Discharge” is kept separate from administrative encounter closure; a saved note, diagnosis assertion, signature or `ended_at` timestamp must not silently imply discharge.

## Routes and proposed user flow

The current browser routes and API observations below are source observations. New commands are names for review, not implemented routes.

| Route / actor | Proposed experience | Safe state/exit | Current support or gap |
| --- | --- | --- | --- |
| `/clinic` — staff | View a bounded board, choose one candidate visit, and deliberately start work. | Candidate selected; no arrival, triage priority or ownership inferred. | `GET /api/clinic/tracking_board` is a capped partial projection. It does not establish live stages, arrival, wait, handoff or patient membership. |
| `/clinic/schedule` — staff | Review scheduled visits separately from waiting work; deliberately check in after identity/visit confirmation. | Check-in committed or outcome unconfirmed; scheduled time remains distinct from arrival. | Appointment reads exist. Check-in/arrival command and append-only flow history do not. |
| `/clinic/chart-selection` — staff/clinician | Select a patient and visit, then confirm both together before protected chart detail. | Confirmed patient/encounter pair, or stop on mismatch. | Selection UI exists; server binding must be enforced for every subsequent read/write. |
| `/clinic/patients` — staff | Search/list minimum necessary patient references and disambiguate deliberately. | A selected patient reference, or “not found” without automatic registration. | Patient index exists; search exposure, paging and identity model remain incomplete. |
| `/clinic/patients/:patientId` — staff/clinician | Review only authorized summary/history sections on demand. | Read-only context with unknown, restricted and unreviewed states visible. | Patient, observations and care-summary reads exist; field visibility, access audit and site scope need review. |
| `/clinic/patients/:patientId/encounters/:encounterId` — staff | Confirm identity/visit, create a new intake revision, record approved triage observations, and request handoff. | Intake saved/requested, pending, rejected, correction-requested or outcome-unconfirmed. | Patient/encounter/observation reads and observation create exist; intake, triage aggregate, handoff and workflow event commands do not. |
| Same encounter route — clinician | Confirm the same pair, inspect the exact intake/triage versions, and explicitly accept or reject/request correction. | Accepted responsibility recorded against an exact intake/triage revision, or visible conflict/denial. | Note reads/drafts exist; explicit handoff and responsible-participant transition do not. |
| Same encounter route — clinician | Draft provider exam in the existing encrypted unsigned SOAP workspace. | Durable unsigned revision with author, template, revision and conflict state. | `clinic_encounter_notes` and immutable encrypted SOAP revisions exist. This is the only durable clinical-writing slice currently present; it is not a signed or approved exam. |
| Same encounter route — clinician | Record an assessment/diagnosis only after its terminology, authority and correction semantics are reviewed. | Draft/assertion remains explicitly unsigned/unreviewed unless a later contract permits attestation. | Patient-level conditions exist but are not encounter diagnoses. A new encounter-linked model or an explicitly bounded note-only draft is required. |
| Same encounter route — authorized discharge actor | Deliberately record discharge against exact reviewed workflow/note/diagnosis versions, if discharge semantics are approved. | Discharge recorded, pending, denied or outcome-unconfirmed; encounter close remains a separate command. | `encounters.close` only records `open → completed`; no discharge record exists. |

Proposed state sequence (not an approved clinical state machine):

```text
unrecorded
  → awaiting_intake
  → intake_in_progress
  → triage_in_progress
  → handoff_pending
  → clinician_accepted
  → provider_exam_draft
  → diagnosis_draft_or_assertion
  → discharge_pending
  → discharged (only after reviewed discharge contract)
  → encounter_closed (separate administrative/encounter command)
```

Existing `open` encounters must remain `unrecorded` for the new workflow until a deliberate event occurs. `started_at` is not arrival. Existing participant rows are historical participation, not acceptance. Any state that cannot be supported by a committed server event is shown as unknown/unrecorded, never guessed from fixture labels, appointment status, note timestamps or `updated_at`.

## Proposed role and action matrix

The following is intentionally **proposed/unconfirmed**. Job titles, booked clinicians, account administrator flags, browser capability flags and the Omni local-development override do not confer authority.

| Placeholder role | Proposed actions | Explicitly not implied |
| --- | --- | --- |
| Staff operator | `encounters.check_in`, `intake.read`, `intake.write`, `triage.read`, possibly `triage.write`, `handoffs.request`, `handoffs.read` | Diagnosis, clinical interpretation, clinician assignment, acceptance, signing, treatment, prescribing, discharge clearance or history rewrite. |
| Clinician with reviewed active assignment | `intake.read`, `triage.read`, `handoffs.read`, `handoffs.accept`, `handoffs.reject`, `handoffs.correction_request`, `exam.read`, `exam.write`, possibly `diagnosis.write` | Authority inferred from booking/profile/issuer text; treatment, prescribing or discharge unless separately approved. |
| Discharge operator (role unresolved) | `discharge.read`, `discharge.write` only after a reviewed checklist and responsible-owner decision | That a clinician, staff member or signer automatically owns discharge. |
| Read-only reviewer | Approved read-only projections and audit evidence within site/practice scope | Any mutation, acceptance, diagnosis assertion or discharge. |
| Product/security/privacy reviewer | Contract and failure-case review | Clinical, legal, professional or release approval. |
| Qualified clinical/professional reviewer | Define/accept clinical fields, terminology, responsibility and exceptions | Approval inferred from attendance, source code, a screenshot or passing tests. |

Each permission must be represented by an immutable versioned grant and rechecked server-side at execution time. Candidate action codes are not implementation authority. Site-scoped grants must evaluate the actual encounter site; an unspecified site must not broaden access. Patient, encounter, membership and practice IDs submitted by a browser are selectors/mismatch guards only, never actor or tenant authority.

## Proposed field, classification and minimum-necessary matrix

This is a handling proposal, not a final data dictionary. A field cannot be implemented as a clinical field until T-13.3 defines its permitted values, source, author, correction and visibility rules.

| Data family | Classification | Staff minimum | Clinician minimum | Storage/transport boundary |
| --- | --- | --- | --- | --- |
| Practice/site/room and internal record IDs | Restricted operational metadata | Only the selected context and labels needed to work | Same selected context | Composite practice-qualified FKs; never accept submitted tenant/actor authority; no foreign-record existence disclosure. |
| Patient identity/reference and visit identity | Protected identity/PHI | Minimum disambiguating label/reference after deliberate selection | Same, kept visible while charting | Existing patient display name is encrypted in the current model; references/labels, URLs and logs need disclosure review. No names in analytics/query strings. |
| Intake values and source/state | Protected clinical/administrative data | Only approved fields needed for intake | Exact source revision and unresolved states | Typed items or an explicitly reviewed encrypted payload; no browser persistence, free-form clinical blob or silent clinician import. |
| Triage observations and history review | Protected clinical data | Only approved observation/review fields for the role | Exact values, units, author/time/source and review status | Observation values and care-summary fields require actual encryption/field visibility policy; missing is not normal/negative. |
| Exam draft/revisions | Highly restricted clinical data | No body access unless separately approved | Exact unsigned revision and author/template provenance | Existing SOAP revisions use Active Record encryption and immutable rows; no note body in versions, logs, URLs or generic DTOs. |
| Diagnosis draft/assertion | Highly restricted clinical data | No diagnosis body by default | Exact encounter-bound draft/assertion and provenance | Do not reuse patient-level condition history as an encounter diagnosis. Terminology, code system, visibility and correction are unconfirmed. |
| Handoff/discharge states and actors | Protected workflow metadata | Only permitted next action and owner disclosure | Exact requested/accepted/rejected/discharged event and actor | Append-only event rows; server timestamps; no clinical narrative in queue/audit metadata. |
| Request keys, digests, revisions and policy versions | Security/audit metadata | User-facing receipt/status only | User-facing receipt/status only | Server-derived, allowlisted, non-secret; never raw session/cookie/token or protected values. |

Every response uses explicit states such as `known`, `not_recorded`, `incomplete`, `restricted`, `not_applicable`, `outcome_unconfirmed`, `conflict` and `denied` where applicable. It must not disclose a restricted resource merely to explain that it exists. Collection responses are bounded/paginated and role/site scoped.

## Existing models and candidate forward migrations

### Reuse only after contract acceptance

Current source contains these relevant models and migrations. The working tree is concurrently modified; the list is an observed implementation baseline, not proof of acceptance.

| Existing model/table | Current useful boundary | Required caution |
| --- | --- | --- |
| `Clinic::Care::Patient` / `clinic_patients` | Practice-owned patient and encrypted display name | No demographic matching/merge or automatic registration. Patient access currently needs minimum-necessary/site review. |
| `Clinic::Appointment` / `clinic_appointments` | Scheduled visit, site/room/provider catalog references | Booking is not arrival, ownership or triage priority. Preserve one-encounter-per-appointment constraint. |
| `Clinic::Encounter` / `clinic_encounters` | Patient-bound open/completed encounter | Additive workflow projection only; do not infer new stages from `status`, `started_at` or `ended_at`. |
| `Clinic::EncounterParticipant` | Historical participant relationship | Not a handoff aggregate; no pending/accepted/rejected/correction states. |
| `Clinic::Care::Observation` / `clinic_observations` | Typed numeric/text/coded/missing/group observation; value-bearing fields are packed into an Active Record–encrypted, practice/patient/encounter/value-identity-bound payload | No approved triage dictionary or source/derived workflow; field visibility and encryption-key/recovery policy still need review. |
| `Clinic::Care::PatientHistoryReview` | Append-only allergy/medication/care-needs review attestations | Medication review is out of this request; review outcomes are not clinical readiness. |
| `Clinic::Care::Allergy`, `Condition`, `PatientCareNeed` | Structured patient history/context in current dirty source | Writes need separate action policy, encryption/read review and correction semantics. Patient-level `Condition` is not an encounter diagnosis. |
| `Clinic::EncounterNote` and `EncounterNoteRevision` | Existing unsigned structured SOAP draft and immutable encrypted revisions | It is a durable unsigned draft, not clinical acceptance, signature, diagnosis or discharge. Keep legacy `clinic_notes` separate. |
| `Clinic::AuditEvent`, `Clinic::ModelVersion` | Partial mutation/read evidence and tenant-bound PaperTrail model history; required clinic audit recording fails closed for protected operations | Access/denial/rollback durability remains incomplete. Platform-audit failure handling is still warning-only; do not use this partial integration as a release gate until the full audit boundary is reviewed and tested. |

Relevant migrations already present are `20260831000200_implement_approved_clinic_erd_schema`, `20260831000300_create_tenant_bound_paper_trail_storage`, `20260831001100_prepare_soap_note_drafts`, `20260901000100_add_patient_care_summary_records` and `20260902000100_index_patient_care_summary_records`. Do not edit or reorder them. Existing applied installations require new forward migrations and preserved ciphertext/keys.

### Candidate new migrations (names for review; do not create from this note)

After T-13.2/T-13.3 and the security/protected-value contract, the smallest additive sequence is:

1. `add_encounter_workflow_projection` — nullable/explicit `workflow_stage` and monotonic `workflow_version`; initialize existing rows to `unrecorded`, not arrival.
2. `create_encounter_workflow_events` — append-only practice/patient/encounter event rows with fixed event code, actor membership, server time, expected version, request key/digest and safe resource reference.
3. `create_encounter_intake_revisions` — immutable intake header/revisions and typed revision items (or a reviewed encrypted structured representation); composite patient/encounter/practice ownership and source/version provenance.
4. `create_encounter_triage_assessments` — only if the reviewed dictionary needs an aggregate/review record; link exact observations/history-review versions without introducing thresholds or scores.
5. `create_encounter_handoffs` — request aggregate plus append-only transition events, exact intake/triage revision references, explicit accepted-owner uniqueness and idempotency identity.
6. `create_encounter_diagnoses` — only after terminology/authority review; encounter-bound draft/assertion with immutable correction chain and encrypted narrative if allowed.
7. `create_encounter_discharges` — append-only discharge record/event, responsible actor and exact reviewed input versions; no automatic encounter close or treatment side effect.

All new protected value-bearing models must declare actual Active Record encryption, use allowlisted serializers and prove raw database ciphertext in a disposable synthetic database. Candidate new fields must not be named `encrypted_*` as a substitute for encryption evidence. Existing `clinic_observations` value fields and any new diagnosis/intake/discharge text require a deliberate encryption migration/identity plan; no real-data conversion is authorized here.

Candidate model-to-migration ownership, pending the two workflow gates:

| Candidate model(s) | Candidate migration | Protected-value expectation |
| --- | --- | --- |
| `Clinic::EncounterWorkflowEvent` | `create_encounter_workflow_events` | No clinical payload; allowlisted actor/event/version metadata only. |
| `Clinic::EncounterIntake`, `Clinic::EncounterIntakeRevision`, `Clinic::EncounterIntakeItem` | `create_encounter_intake_revisions` | Typed items by default; any narrative/source detail must use actual Active Record encryption and a reviewed field policy. |
| `Clinic::EncounterTriageAssessment` | `create_encounter_triage_assessments` | Link approved observation/review versions; no unreviewed score, threshold or narrative. |
| `Clinic::EncounterHandoff`, `Clinic::EncounterHandoffEvent` | `create_encounter_handoffs` | State/actor/version metadata only; no copied intake or clinical narrative in queue/event rows. |
| `Clinic::EncounterDiagnosis` | `create_encounter_diagnoses` | Terminology and narrative remain unconfirmed; any permitted narrative must be encrypted and omitted from minimum DTOs. |
| `Clinic::EncounterDischarge` | `create_encounter_discharges` | Only approved discharge fields may be stored; any instructions/reason text must be encrypted, with close kept separate. |

These names are proposed ownership boundaries, not authorization to generate tables or models. A migration must be forward-only, additive, reversible through a reviewed recovery plan, and compatible with the currently applied schema and encryption-key identity.

## API command contract (proposed, not implemented)

Existing read routes remain bounded and must be reauthorized for both nested resources. Candidate commands are deliberately separate from broad patient/encounter writes:

```text
GET  /api/clinic/tracking_board
POST /api/clinic/encounters/:id/check_in
GET  /api/clinic/patients/:patient_id/encounters/:encounter_id/intake
POST /api/clinic/patients/:patient_id/encounters/:encounter_id/intake_revisions
GET  /api/clinic/patients/:patient_id/encounters/:encounter_id/triage
POST /api/clinic/patients/:patient_id/encounters/:encounter_id/triage
POST /api/clinic/patients/:patient_id/encounters/:encounter_id/handoffs
POST /api/clinic/handoffs/:id/accept
POST /api/clinic/handoffs/:id/reject
POST /api/clinic/handoffs/:id/request_correction
GET  /api/clinic/patients/:patient_id/encounters/:encounter_id/exam
POST /api/clinic/encounters/:encounter_id/diagnoses
POST /api/clinic/encounters/:encounter_id/discharge
```

The existing SOAP routes remain the exam-draft implementation boundary:

```text
GET  /api/clinic/encounters/:encounter_id/notes
POST /api/clinic/encounters/:encounter_id/notes
GET  /api/clinic/notes/:id
POST /api/clinic/notes/:id/revisions
```

Every protected command must require the current session, CSRF and Origin checks; derive actor/practice/correlation server-side; validate the nested patient/encounter/site binding; check active membership and exact action; lock the aggregate; compare expected version; and return a committed receipt. A timeout returns `outcome_unconfirmed` and a protected status/receipt lookup, never an automatic replay. Same request key with a different digest is a conflict.

## Versioning, audit, retention and recovery contract

- Workflow events, intake revisions, handoff transitions, diagnosis assertions and discharge records are append-only. Corrections append a new revision/event and preserve predecessor, actor, time and reason category where approved. No in-place rewrite, deletion, reparenting or backdated timestamp repairs a mistake.
- Mutable projection rows use CAS/row locking and a monotonic version. At most one accepted handoff and one committed transition for a request identity may exist. Concurrent writers yield a conflict and reload/review path.
- PaperTrail is explicit per model and metadata-only for protected domains. No note body, intake text, diagnosis narrative, names, raw session, credentials or secrets appear in versions, audit metadata, errors or logs. Callback, service, job and direct-SQL/bulk-write paths need a tested disposition.
- Successful mutations, reads, denied attempts, failed attempts, rolled-back attempts, exports/downloads and privileged operations need separately defined audit evidence. The current same-transaction audit rows cannot prove a rolled-back attempt; an independent durable sink and outage behavior remain unselected.
- Required audit capture failure blocks the affected protected operation or reports an explicit recoverable failure. It must never be logged as a warning and acknowledged as success. Audit evidence itself is not a generic reification/restore API.
- Retention duration, legal hold, export scope, offboarding and key rotation are unresolved. Until approved, preserve append-only history, do not prune automatically, and do not delete evidence as a logout/reset convenience. Recovery must preserve database image, encryption-key version, schema and receipt/event references together.
- Restore/reconciliation must use named disposable synthetic databases, prove row/relationship/version/actor preservation and decrypt with the matching approved key. No production or real-data migration, reset or deployment is authorized by this note.

## Failure-first negative tests and stop conditions

Each implementation slice must add synthetic tests for the applicable cases below and record actual evidence. A happy path, screenshot or build is not acceptance.

| Failure | Expected detection/prevention and recovery |
| --- | --- |
| Wrong patient, encounter, appointment, site or practice | Composite scoped lookup and FK denial with no foreign-record disclosure; return to selection. |
| Staff/clinician/reviewer or revoked membership uses another action | Server action matrix denies; UI capability flags cannot override; retain denial evidence. |
| Incomplete, unknown, declined or unable-to-obtain value is treated as normal/complete | Typed state remains visible; no score/threshold/reassurance; block or route to explicit human exception. |
| Stale intake/triage/note revision is accepted | Expected version and exact revision lock produce conflict; reload/review; no stale clinician authorship. |
| Two clinicians accept, two check-ins occur, or two discharge commands race | One committed result under lock/unique constraint; other receives conflict or exact idempotent receipt. |
| Same request key is repeated or payload changes | Identical digest returns the original receipt; changed digest is rejected; no duplicate event. |
| Response is dropped after commit | UI shows outcome unconfirmed; protected receipt lookup reconciles; no automatic mutation replay. |
| Session expires or grant is revoked between read and write | Mutation is denied with no state change; reauthenticate and review. |
| Audit, encryption or key configuration fails | Protected write/read fails closed with recoverable evidence; no plaintext fallback, warning-only success or secret logging. |
| Callback/bulk/direct SQL bypasses model audit or identity checks | Route through an audited operation or reject/explicitly classify; test final state and evidence count. |
| Correction or reset rewrites history | Immutable predecessor/event chain rejects destructive update/delete; recover by appending a correction. |
| Narrow viewport, reload or patient switch has unsaved intake/exam text | Warn before navigation; keep only approved in-memory state; never use local/session storage, offline cache or silent autosave. |
| Discharge is confused with close, signing or treatment | Separate state/events and response copy; stop on any implicit side effect. |

Stop the affected path for unauthorized access, cross-tenant disclosure, plaintext protected values, missing required audit evidence, duplicate acceptance, silent alteration/loss, false completion, unbounded collection disclosure or an unresolved clinical/professional decision. Do not disable CSRF, encryption, authorization, version checks, audit or production denial to make a test pass.

## Per-slice entry and exit evidence

| Slice | Entry gate | Exit evidence required |
| --- | --- | --- |
| Security/transport | Current source audit and approved failure-first record | Actual encryption tests, minimum-necessary DTO tests, denial/read/rollback audit behavior, no plaintext logs, and migration/restore evidence. |
| Check-in/workflow ledger | T-13.2/T-13.3 role/state contract | Additive migration, existing rows remain unrecorded, duplicate/concurrent check-in tests, site/tenant denial, receipts and append-only event proof. |
| Intake | Approved typed field dictionary and correction policy | Staff-only writes, immutable revisions, explicit unknown/incomplete states, source/version provenance, stale/retry/recovery tests and bounded DTOs. |
| Triage/history | Qualified review of fields, units, terminology and escalation boundary | Typed observation/review linkage, no thresholds or inferred readiness, author/time/source proof, missing/unknown/denial/concurrency tests. |
| Handoff | Named owner/eligibility and action matrix | Exact intake/triage binding, one accepted owner, rejected/correction/pending/unavailable states, CAS/idempotency/audit tests and clinician context read. |
| Provider exam | Existing encrypted unsigned SOAP draft plus accepted handoff | Durable draft/revision conflict and provenance tests; no signing, diagnosis side effect, treatment or closure implied. |
| Diagnosis | Approved terminology, visibility, author and correction semantics | Encounter-bound immutable draft/assertion, protected payload/read policy, stale/retry/correction/audit tests; no clinical decision support or billing coupling. |
| Discharge | Explicit distinction from close and qualified responsible actor | Append-only discharge evidence, exact reviewed-version references, denial/conflict/outcome-unconfirmed tests; close remains a separate deliberate action. |
| Integration and recovery | All affected slices accepted locally | Fresh/upgrade/restore synthetic rehearsal, route/serializer/type updates, full API/web checks, accessibility review, security/privacy review and recorded unresolved gates. |

The maximum safe implementation boundary before those gates is the technical scaffolding and fixture-only walkthrough with explicit `unrecorded`, `incomplete`, `pending`, `unknown`, `conflict` and `outcome_unconfirmed` states. It is not a released EHR, a clinical workflow approval, HIPAA compliance evidence or legal acceptance.

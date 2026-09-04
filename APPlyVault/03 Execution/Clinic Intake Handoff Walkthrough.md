---
type: workflow
status: draft
updated: 2026-09-02
---
# Clinic Intake → Clinician Handoff — Synthetic Walkthrough and Scope Map

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Task: [T-13](https://app.shortcut.com/apply-1/roadmap) · Visual system: [[Design]] · Design history and workflow boundaries: [[Clinic Workspace Design]] · Mapping: [[Clinic Frontend Backend Mapping]] · Failure method: [[Working Agreement#Failure-first planning and review]]

## Purpose, evidence and boundary

This is the T-13.1 synthetic walkthrough and scope-map artifact. It is a proposal for a review conversation, not an observed clinic workflow, clinical policy, API contract, security assessment or release decision. It uses no original records, patient information, credentials, screenshots or real-derived examples. All examples below are fictional placeholders and must not be copied into a patient system.

The proposed path is:

```text
candidate scheduled visit or deliberate walk-in entry
  → patient and visit confirmation
  → approved recorded-context review
  → staff intake (only reviewed fields)
  → explicit handoff request
  → clinician accept / reject / request correction
  → clinician context and existing unsigned SOAP workspace
```

The safe exit for this slice is **a simulated handoff result and a clearly identified entry into the existing unsigned SOAP workspace**. It does not mean that a clinician accepted responsibility, a note was signed, a visit was completed, a patient departed, checkout occurred, a prescription was authorized/transmitted, or a clinical decision was made.

Arrival, walk-in handling, stage names, intake completeness, responsible-person semantics, clinician eligibility, corrections, retention and the meaning of acceptance all require point-of-use review. Do not infer them from the current board, booked clinician, encounter `open/completed` status, participant rows, job titles or the existing SOAP draft.

## Evidence map: what is known and what is not

| Evidence type | Current boundary for this walkthrough |
| --- | --- |
| **Observed in source** | The authenticated clinic shell has a permission-scoped partial tracking-board projection, patient/encounter-bound reads, an explicit identity/visit checkpoint, recorded-context/care-summary reads with missing or review-needed states, and an unsigned SOAP draft with revision-conflict handling. These are source observations, not clinical acceptance. |
| **Proposed for review** | Staff-first intake; either scheduled or deliberate walk-in entry; a separate handoff request; explicit clinician accept/reject/correction response; version-bound transition history; and a handoff result that opens the existing SOAP workspace. |
| **Manual / human-controlled** | Confirming the person's identity and visit; deciding whether an intake item is complete; contacting an unavailable clinician; resolving a rejected or contested handoff; correcting an entry; and deciding whether to proceed under a reviewed exception. Software must not silently make these decisions. |
| **Unknown / blocked** | Actual staff and clinician roles; approved intake dictionary; emergency/escalation process; consent or identity-proofing requirements; whether scheduled and walk-in encounters share a workflow; who owns each transition; clinician assignment/coverage rules; exact permissions; retention/legal-hold rules; and approved clinical/security reviewers. |
| **Explicitly excluded** | Real records; clinical thresholds, triage scores or reassurance; automatic patient matching or registration; prescribing, results, signing, addenda, checkout, departure, billing, messaging, external integrations, background routing, browser chart persistence and production use. |

## Roles and authority questions

The labels below are placeholders for T-13.2. They do not confer authority.

| Placeholder role | Proposed responsibility to validate | Must not be assumed |
| --- | --- | --- |
| Staff operator | Select a patient/visit, review approved context, record approved intake fields, save a version and request handoff. | Clinical triage, diagnosis, treatment, signing, prescribing, clinician assignment, or overriding an exception. |
| Clinician | Review the exact staff intake version and accept, reject, or request correction; then review the existing unsigned SOAP workspace. | A booked clinician is the actual owner; acceptance is a signature, order, clearance, checkout or visit completion. |
| Patient / representative | May be the source of information in a future approved workflow. | Direct portal access, identity proof, consent, or a particular information source without review. |
| Product/workflow reviewer | Confirm the product interpretation and usability boundary. | Clinical or legal approval. |
| Qualified clinical/professional reviewer | Define and accept clinical fields, terminology, responsibility, exceptions and safety implications. | Approval is inferred from attendance, a job title, a screenshot or a passing test. |
| Security/privacy/legal reviewer | Review minimum necessary access, audit, retention, encryption and handling obligations. | HIPAA, legal, contractual or release acceptance is inferred from source code or synthetic tests. |

T-13.2 must replace these placeholders with actual role descriptions and named accountable owners only after authorized participation. It must record disagreement and absence handling without patient information.

## Synthetic walkthrough script

Each step is a tabletop/prototype prompt. “Simulated” means no durable clinical behavior is authorized by this note.

### 1. Enter from a candidate visit

1. **Scheduled candidate (proposed):** staff opens an authorized schedule/board row. The UI labels scheduled time separately from arrival and does not count a scheduled person as waiting. Staff deliberately chooses “Begin intake” only after confirming the patient and visit.
2. **Walk-in candidate (proposed, not selected):** staff deliberately searches/selects an existing patient and states that there is no appointment. The flow must not auto-register a patient, fabricate an appointment, infer arrival, or create an encounter until that behavior is approved.
3. **Current implementation boundary:** the board and encounter reads are partial source contracts. No live stage, arrival or walk-in API is implied by this script.

### 2. Confirm identity and visit before chart work

Show a single, prominent confirmation containing the minimum authorized patient identity and the separate visit/encounter context. Require an intentional confirmation before intake or chart detail. On mismatch, stop and return to selection without disclosing the other candidate's clinical content.

The confirmation must bind patient and encounter together server-side. A patient ID, encounter ID, clinic reference or booked clinician is not by itself identity proof. The URL, analytics, diagnostics and audit metadata must not contain names, reasons, intake text or other unnecessary protected values.

### 3. Review approved recorded context

After confirmation, show only the role-authorized, read-only context already available from approved records. Keep “not recorded,” “unable to obtain,” “needs review,” “restricted,” and “not applicable” distinct from “none” or “normal.” Display author/source and recorded/reviewed times where the accepted contract permits them. Do not calculate risk, urgency, severity, eligibility or readiness.

The staff member may identify an unresolved item for later review, but may not silently copy it into clinician-authored text. The current care-summary endpoint is a bounded read boundary; it is not an intake-completeness decision or a substitute for a reviewed field dictionary.

### 4. Record the staff intake

The form is intentionally unspecified until T-13.3. It may contain only fields accepted by the clinical/product reviewers, with a typed value shape, units where applicable, source/provenance, author and recorded time. Every item needs an explicit state appropriate to the approved dictionary, such as recorded, not recorded, declined, not asked, not applicable or unable to obtain.

The staff member can save a version and see whether it is saved, unsaved, saving, failed, stale or outcome-unconfirmed. Do not use a free-form clinical JSON blob, hidden fields, browser record storage, fake autosave, automatic retry or default “normal.” Changing patient/visit with unsaved content requires a clear warning and a safe recovery path.

The intake version is staff-authored. It must remain distinct from clinician-authored SOAP sections even if the clinician later chooses to review or explicitly import an approved value. Import, if ever accepted, must preserve the source author and version rather than becoming an unattributed clinician assertion.

### 5. Request an explicit handoff (simulated)

The staff member chooses **Request clinician handoff** after reviewing the displayed completeness state. The request is bound to the confirmed practice, patient, encounter and exact intake revision. It does not change encounter `open/completed`, assign a clinician, sign a note or assert that the patient is clinically ready.

The simulated result shows either:

- **Requested / pending:** no eligible clinician has accepted. The staff sees who owns the pending work only if that disclosure is authorized; unavailable staff do not trigger silent reassignment.
- **Rejected / correction requested:** the reason category and required next action are shown only if an approved fixed vocabulary permits them. The earlier intake and handoff attempt remain attributable and unchanged.
- **Accepted:** the accepting clinician, exact intake revision and handoff time are shown. The next action is to open the existing patient/encounter context and unsigned SOAP workspace for review. Acceptance is not signing, prescribing, checkout or completion.

The client must receive a committed server result or an explicit **Outcome not confirmed** state with a protected status/receipt lookup. It must not replay the mutation automatically after a timeout.

### 6. Clinician review and correction (simulated)

The clinician confirms the same patient, visit and intake revision before reviewing. A clinician may accept, reject, or request correction only if that action is approved for the role, practice and site. A stale revision, revoked membership or changed patient/encounter context causes a visible conflict and requires reload/review.

For correction, staff edits a new intake revision under the approved correction policy. Prior values, authors, timestamps and handoff outcomes remain history; no in-place rewrite, deletion or reparenting repairs a mistake. A new handoff request references the new revision and does not make the prior acceptance disappear.

### 7. Exit into the existing SOAP workspace

After a simulated accepted handoff, open the existing patient-bound encounter workspace with identity, encounter, intake provenance, recorded context and SOAP revision state visible. The workspace remains an unsigned draft. It must not silently paste staff text into a clinician section, claim a clinical review, enable signing/prescribing, close the encounter or complete checkout.

## Candidate backend boundary — design only

No backend schema, route, permission or model is authorized by this T-13.1 note. T-13.3 must accept the contract first. The current participant rows may record actual participation after an accepted transition, but cannot by themselves express pending, rejected, corrected, expired or contested handoffs.

If T-13.3 approves durable behavior, the smallest candidate is a patient/encounter-bound handoff aggregate with append-only transition evidence and a required reference to an immutable intake revision. It would need practice-qualified foreign keys, server-derived actor membership, fixed states, expected workflow/intake version, idempotency key/digest, and a uniqueness rule preventing two accepted handoffs. No narrative clinical reason or copied intake content belongs in the queue DTO or audit metadata.

Candidate operations are deliberately names-to-review, not selected API names:

```text
GET  /api/clinic/encounters/:id/handoff   (patient binding required)
POST /api/clinic/encounters/:id/handoffs  (patient, intake revision, expected version, request key)
```

Any implementation must inherit session, CSRF, Origin, production clinic denial, active-membership and current-practice checks. It must reauthorize the patient, encounter, site and clinician at write time. Handoff-specific permissions should be separate from broad `patients.write` or `encounters.write`; exact action names and role grants require T-13.3 review.

## Failure-first record

### Outcome and boundary

| Field | T-13.1 value |
| --- | --- |
| Observable outcome | Reviewable synthetic script that separates scheduled/walk-in proposals, identity/visit confirmation, recorded-context review, staff-authored intake, simulated handoff outcomes and entry to the unsigned SOAP workspace. |
| Entry context and continuation gates | Current partial board, patient, encounter, care-summary and SOAP boundaries support this T-13.1 design exercise. T-13.2 authorized workflow observation is required before treating the proposal as an actual workflow; T-13.3 contract acceptance is required before durable implementation. |
| Permitted environment/data | Local tabletop or synthetic fixtures only; no patient, applicant, production, hosted, external or confidential records. |
| Exclusions | Clinical decision support, triage, thresholds, registration, arrival semantics, signing, prescribing, checkout, departure, billing, messaging, integrations, deployment and release acceptance. |
| Safe exit | Simulated result plus explicit source/version context into an unsigned SOAP workspace; no claim of ownership, completion or clinical readiness. |

### Failure hypotheses, detection, prevention and recovery

| Failure hypothesis / harm | Detection and prevention | Synthetic disproof and recovery |
| --- | --- | --- |
| Wrong patient or visit is selected, exposing or attaching protected content | Separate patient/visit confirmation; server checks practice, patient, encounter and appointment binding; minimal DTO; no silent fallback | Pair two fictional patients and encounters; submit each other's IDs; expect denial/404 with no foreign content. Stop the path and return to selection. |
| Staff or clinician label is mistaken for authority | Server-derived membership and explicit action matrix; UI flags are advisory; no actor/tenant IDs accepted as authority | Use staff, clinician, reader and revoked synthetic memberships; expect only reviewed actions and no self-elevation. Stop any unauthorized success. |
| Cross-practice or cross-site access leaks data | Practice-qualified keys/queries, active membership, site scope and per-request reauthorization | Attempt foreign-practice patient/encounter and site-restricted clinician; expect denial or indistinguishable not-found. Preserve the failure evidence. |
| Missing/unknown intake is presented as complete or safe | Explicit field states; no defaults, scores, thresholds or “normal”; handoff requires an exact reviewed revision | Omit each approved field state in a synthetic fixture; expect “not recorded/unknown” and blocked or exception-routed handoff according to T-13.3 policy. |
| Stale intake becomes clinician-authored work | Immutable intake revisions, source/author/version in handoff, expected-version check and explicit import only | Save v1, change to v2, then accept v1; expect conflict and no acceptance of stale content. Reload/re-review. |
| Two clinicians accept concurrently or an unavailable clinician is silently replaced | Transaction lock/version check; one accepted result; explicit pending/unavailable state; no implicit reassignment | Race two synthetic accepts; expect one commit and one conflict. Remove clinician availability; expect pending/manual recovery. |
| Duplicate or changed retry causes duplicate handoff | Server idempotency key plus request digest and unique active/accepted constraint | Repeat identical key/payload and then alter payload under same key; expect one result, then conflict. Reconcile before retry. |
| Lost response is falsely reported as failure or success | Committed receipt/status lookup; no automatic mutation replay; visible outcome-unconfirmed state | Simulate dropped response after commit; lookup exact receipt and verify one transition. Never report a toast-only success. |
| Expired session or revoked grant finishes a handoff | CSRF/session/origin and active membership checked on mutation, not only page load | Expire session/revoke grant between read and write; expect denial with no state change. Reauthenticate/review. |
| Correction rewrites history or reassigns an encounter | Append-only transitions/revisions, immutable patient/encounter links and explicit correction policy | Correct a rejected/accepted synthetic intake; expect prior evidence retained and new version linked. Stop on destructive overwrite. |
| Audit or encryption failure is hidden | Audit outcome is attributable and required; protected values encrypted at rest/in transit; failure cannot acknowledge success; no secret values in logs | Inject synthetic audit failure or unavailable encryption configuration in an isolated test; expect rollback/denial and preserved failure evidence. Stop until recovery is defined. |
| Retention, export or offboarding deletes evidence or leaks another clinic | No automatic pruning; legal hold/retention class and export scope reviewed before implementation; access reauthorized | Exercise two fictional clinics and a restore/export tabletop; expect scoped history and no cross-clinic data. Stop without an approved retention/recovery decision. |
| Interrupted or narrow-screen work causes unsafe accidental submission | Full task page, clear saved/unsaved/failed states, keyboard order, focus management and responsive reflow | Test 320px/200% zoom, keyboard-only dialogs, Escape/focus return, reload and patient switch with unsaved input. Stop on hidden controls, focus loss or ambiguous state. |

An unresolved unauthorized access, silent data loss/alteration, duplicate accepted transition, false completion, missing required audit evidence or unbounded protected disclosure stops the affected path. Do not disable CSRF, audit, permission checks, encryption, version checks or production denial to make the walkthrough pass.

## Ease of use and accessibility targets

These are acceptance targets for a future runtime prototype. The isolated static design artifact exercises only a subset and is not a conformance claim.

- Keep one patient-and-visit checkpoint before intake or chart detail; use plain labels and a concise next action.
- Use a full task page for intake and handoff. On tablet portrait/phone, stack sections; do not shrink text or hide the identity/visit heading behind a keyboard.
- Preserve logical keyboard order, visible labels, meaningful headings/landmarks, visible focus, Escape behavior and focus return from dialogs. Prefer approximately 44px touch targets while meeting the WCAG 2.2 AA target-size requirement applicable to the rendered control.
- Reflow at 320 CSS pixels and test 200% text zoom and 400% browser zoom. Keep ordinary forms readable and avoid a second encounter-specific shell.
- Make saved, unsaved, saving, failed, stale, rejected, pending, accepted and outcome-unconfirmed states distinct in text and color. Unknown must never look like normal or complete.
- Announce a concise status update without exposing clinical values or reading timer changes on every refresh. Errors belong beside fields and in a linked summary.
- Keep the patient/encounter identity and intake author/version visible while reviewing. Never rely on hover-only disclosure or color alone.
- Do not store intake or chart content in browser persistence. On expiry/logout/account change, discard protected state and offer only an approved recovery path.

## Exact blockers and next gates

### T-13.2 — authorized role/workflow walkthrough

T-13.2 is blocked until the founder identifies and authorizes the relevant participants. It must establish, without patient information:

- actual role descriptions and permitted actions;
- whether scheduled and walk-in entry both exist and how they differ;
- identity confirmation and encounter creation responsibilities;
- who owns intake, handoff, correction and clinician absence/reassignment;
- what “accepted” means operationally and what it does not mean;
- escalation, interruption and manual fallback behavior; and
- unresolved disagreements, missing source material and needed reviewers.

Attendance is not a clinical, legal, HIPAA, security or release approval.

### T-13.3 — reviewed field/state/permission/API contract

T-13.3 is blocked until named product, clinical/professional, engineering and security/privacy reviewers accept or explicitly exclude:

- exact typed intake fields, units, source/provenance and missing/declined/unknown states;
- patient/visit binding, identity confirmation and whether arrival/encounter creation is in scope;
- role/site/practice permissions and clinician eligibility;
- immutable revision and authorship semantics, corrections and imports;
- handoff states, ownership transfer, rejection, expiry, revocation and reassignment;
- optimistic concurrency, idempotency, lost-response reconciliation and session expiry;
- minimum necessary DTOs, encrypted protected values, TLS/key requirements and redacted diagnostics;
- change/read/denial/failure audit, audit-failure behavior, retention/legal hold, export and recovery; and
- compatibility with D-044’s pending ERD amendments and the existing unsigned SOAP contract.

No new clinical field, workflow state, professional authority, retention period, encryption system, external service or release gate is selected by this note.

## Exit evidence for T-13.1

T-13.1 can be considered drafted when this note is linked from the TOC and T-13, contains the evidence distinctions and failure matrix above, and is ready for an authorized T-13.2 walkthrough. It must not be marked as observed, approved, implemented, secure, HIPAA-compliant, clinically accepted or production-ready. After T-13.2, revise this note or its successor from actual evidence; after T-13.3, create the durable backend contract and implementation handoff as a separate reviewed artifact.

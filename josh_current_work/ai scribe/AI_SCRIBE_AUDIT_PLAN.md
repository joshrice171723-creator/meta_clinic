# AI Scribe Audit Plan

## Reference-led workspace acceptance — 2026-09-06

Future checks for the [workspace build sequence](AI_SCRIBE_BUILD_PLAN.md#reference-led-workspace-redesign--2026-09-06), not test results. The plan was source-reconciled at `9355021`; no app tests or live browser checks ran in this planning task. Existing dated evidence remains historical.

| Journey | Required observable proof |
| --- | --- |
| New/reopen session | Create a session for an authorized backend patient, add context, reload and reopen it from date-grouped history. Search across more than one page; confirm practice/site isolation and the displayed timezone/date grouping. Empty/loading/failure states cannot display success or invented records. |
| Search/create patient in Scribe | Search authorized patients beyond the first page and distinguish duplicate names; select by stable ID. Open Create new patient in a modal using the existing form, save and verify it closes with the saved patient immediately selected in Scribe. Cancel/validation/save failure must preserve Scribe and form state appropriately. Test repeat clicks, uncertain response, stale search results, late creation after practice/site/session switch, unauthorized creation, keyboard focus return and existing-encounter identity protection. Patient creation alone does not create a session or record consent. |
| Document editing | Import source, generate SOAP, edit multiple sections, save and reload. Switch tabs/sessions during pending saves; induce stale revisions and network failure. No lost text, silent overwrite, incorrect Saved state or accepted stale response. Undo and revision restore have distinct behavior. |
| Capture/transcription | Exercise permission denied, absent microphone, start/pause/resume/stop, actual timer/meter, interrupted upload, duplicate chunk/finalize retry, refresh, worker/provider failure and durable recovery. Browser must not restart the microphone after reload without explicit action. Confirm transcript/source linkage and no recording UI before provider capability is available. |
| Consent/deletion race | Decline or withdraw consent before/during capture, upload and processing. Stop microphone tracks and cancel work; late jobs cannot restore deleted/withdrawn text. Verify existing server scope, audit, protected storage and retention behavior remains intact. |
| Templates and revisions | Create SOAP and an independently versioned SOAP-with-labs document only with authorized source results. Missing labs stay missing. A second document cannot supersede the first; a new revision does supersede its own parent. Wrong/stale template or document IDs are rejected server-side. |
| Instruction bar | Submit a source-grounded rewrite, inspect changes, discard then retry/apply. Manual edits made during generation survive. Reject unsupported facts and source/prompt instructions that request permission changes or automatic export. Provider timeout preserves current content; retries do not duplicate revisions. |
| Review and export | Drawer evidence links select the correct source; unresolved warnings remain discoverable and block approval. Every edit/restore/applied proposal invalidates approval. Approve/export bind exact document/revision/version, remain separate, enforce capabilities and retain idempotency. Copy must be permission-aware and clearly identify draft status; it cannot imply chart export. |
| Visual/accessibility | Capture 1440px desktop and 1024px tablet with local backend records; verify session rail, compact header, tabs, spacious note and bottom bar against the supplied composition. Also check narrow reflow, long patient names/notes, many sessions/tabs, keyboard traversal, drawer focus return, accessible recording announcements, zoom and supported appearances. No hidden final paragraph or page-wide horizontal overflow. |

Use focused Rails/API tests for changed persistence, tenancy, consent, concurrency and job recovery; React integration tests for state transitions and unsaved work; then live browser journeys with the actual API. Use independently authored test data only. Record commands, revision, environment, screenshots, failures and unperformed checks. Passing structural document checks or old review tests cannot substitute for these journeys. Provider-dependent checks remain explicitly unverified until the selected integration is available; visual S1 acceptance does not close S2/S3.

## Related planning documents

- [Capability roadmap](ROADMAP.md)
- [AI scribe build plan](AI_SCRIBE_BUILD_PLAN.md)
- [Shared roadmap index](../ROADMAP_INDEX.md)
- Integration audit dependency: [Staff Messaging audit plan](../staff%20messaging/STAFF_MESSAGING_AUDIT_PLAN.md) must verify that any follow-up task from an approved draft is human-authorized, scoped, idempotent, and provenance-linked.

## 1. Audit purpose and boundaries

Verify that the AI scribe produces useful, reviewable drafts while preserving consent, privacy, provenance, human control, clinical safety boundaries, accessibility, reliability, and operational accountability. Audit the complete journey from consent and capture through transcription, drafting, review, correction, approval, export, retention, deletion, and incident response.

This audit does not certify a medical device, clinical safety, HIPAA compliance, or model fitness for every use case. Regulatory classification, organizational risk acceptance, clinical validation, legal review, vendor agreements, and workforce training remain separate gates.

## 2. Required evidence package

Collect the model/provider inventory and versions, prompts/templates, repository commit, architecture and data-flow diagrams, schema, API and worker inventory, consent UX and policy, role matrix, evaluation dataset provenance, quality thresholds, red-team results, audit-event catalog, retention/deletion map, incident runbook, accessibility report, and synthetic/de-identified test accounts.

For every quality or safety claim, identify whether evidence comes from benchmark evaluation, source inspection, automated test, live observation, clinician review, or an assumption.

## 3. Audit workstreams

### A. Consent and capture workflow

Exercise these flows with synthetic or de-identified encounters:

1. Authorized professional starts a session and sees the recording/transcription state.
2. Required consent is explained, captured, timestamped, and associated with the correct encounter and participants.
3. Participant declines, revokes, or pauses consent; capture stops or data is suppressed as policy requires.
4. Audio/transcript is uploaded or streamed with progress, interruption, retry, and cancellation states.
5. Draft generation begins only for an authorized session with an allowed template and model.
6. Professional reviews source and draft, edits sections, records uncertainty, rejects or regenerates content.
7. Explicit approval is required before export or official-record persistence.
8. User can inspect provenance, model/template version, edits, approval, export, retention, and deletion history.

Capture screenshots, network/API evidence, state transitions, audit events, timing, and failure behavior for every path.

### B. Identity, authorization, and data isolation

- Test role and scope enforcement for professional, supervisor, auditor, administrator, support, and unauthenticated users.
- Test tenant, practice, location, patient, encounter, session, transcript, draft, export, and attachment isolation.
- Test direct ID substitution, stale sessions, revoked access, session sharing, expired links, and cross-tenant search/export.
- Confirm the client cannot select actor, patient, tenant, encounter, approval state, provenance, or audit metadata outside server authorization.
- Verify provider requests, logs, analytics, traces, caches, backups, and support tools minimize or redact sensitive content.
- Confirm encryption, key ownership/rotation, access auditing, retention, deletion, and vendor data-use restrictions are evidenced rather than assumed.

### C. Transcription and draft quality audit

Build a representative, de-identified evaluation set covering accents, overlapping speakers, noise, code-switching, specialty vocabulary, negation, numbers, dates, medication names, uncertain statements, corrections, and incomplete encounters.

Measure separately:

- Word and speaker attribution accuracy.
- Omission, insertion, and hallucination rates.
- Negation and uncertainty preservation.
- Structured-section completeness and factual consistency.
- Critical entity accuracy for names, dates, medications, allergies, diagnoses, and follow-up instructions.
- Time to first draft, regeneration latency, failure rate, and cost per encounter.
- Human reviewer correction burden, approval rate, and disagreement rate.

Set go/no-go thresholds per use case, document confidence intervals and subgroup results, and require clinical/professional review for safety-critical fields. Never convert an aggregate score into a claim that every note is safe.

### D. Human review and clinical-safety boundary

- Confirm every generated section is visibly marked as draft until approved.
- Show source transcript/audio context, uncertainty, missing information, and provenance for generated claims.
- Test that approval, signing, export, and official-record writes are separate explicit actions.
- Verify no autonomous diagnosis, treatment, prescription, consent, legal, or final clinical decision is performed.
- Test dangerous but plausible errors: negation flips, wrong patient, wrong medication/dose, fabricated symptoms, invented follow-up, speaker confusion, and omission of refusal or allergy.
- Verify the interface makes correction easy, preserves edit history, and warns when source evidence is absent or low confidence.

### E. Reliability, model governance, and change control

- Test provider timeout, rate limit, outage, partial transcript, malformed output, model refusal, prompt failure, cancellation race, and retry behavior.
- Verify idempotency and no duplicate official-record writes or exports.
- Pin and record model, prompt, retrieval/context, template, and preprocessing versions for each draft.
- Require evaluation and approval before changing models, prompts, templates, transcription vendors, or data-processing locations.
- Test rollback to a known-good model/template and safe degradation to manual transcription or transcript-only mode.
- Monitor quality drift, subgroup disparities, hallucination reports, latency, cost, rejection rate, and incident frequency.

### F. UX and accessibility audit

- Inspect consent clarity, recording indicator, waiting states, progress, errors, review hierarchy, source/draft comparison, and approval language.
- Test keyboard navigation, focus restoration, screen-reader labels, live progress/status announcements, contrast, zoom, reduced motion, touch targets, and responsive layouts.
- Test long transcripts, dense notes, missing audio, multiple speakers, low confidence, localization, slow networks, and expired sessions.
- Confirm users can distinguish source text, generated text, user edits, unresolved items, and approved content.

## 4. Test matrix

Cover roles, scopes, model/template versions, encounter types, input quality levels, browser/device sizes, and outcomes (draft, retry, partial, rejected, approved, exported, deleted).

Minimum negative cases:

- Consent absent, ambiguous, revoked, or associated with the wrong encounter.
- Cross-patient or cross-tenant transcript/draft access.
- Client attempts to mark a draft approved or change provenance.
- Prompt injection or malicious text in the transcript.
- Wrong speaker, wrong negation, hallucinated medication, fabricated instruction, and omitted critical detail.
- Provider outage, malformed structured output, duplicate callback, and export retry.
- Model version change without evaluation record or rollback path.
- Sensitive content exposed in logs, telemetry, previews, URLs, or downloaded files.

## 5. Severity and release gates

- P0: consent bypass, cross-patient/tenant disclosure, autonomous official-record write, dangerous unreviewed output, falsified provenance, or inability to stop/delete processing. Block all use.
- P1: clinically material hallucination/omission above threshold, broken human approval boundary, missing audit trail, unreliable export, unsafe model change, or inaccessible critical review action. Block pilot.
- P2: non-critical formatting, recoverable latency, weak explanation, or reviewer workflow friction. Track and assign.
- P3: polish or future enhancement.

Pilot approval requires zero open P0/P1 findings, consent and isolation evidence, human approval enforcement, documented evaluation thresholds with representative subgroup results, provenance/version tracking, rollback and incident readiness, accessibility evidence, and explicit clinical/privacy/regulatory review for the intended scope.

## 6. Audit outputs

- Safety and production-readiness summary.
- Data-flow, consent, provenance, and approval-boundary diagrams.
- Role × action × scope authorization matrix.
- Evaluation report with dataset description, metrics, subgroup results, thresholds, and reviewer findings.
- Red-team and failure-mode register.
- UX/accessibility report with screenshots and critical-path evidence.
- Model/prompt/template change-control and rollback checklist.
- Findings register with severity, evidence, owner, remediation, and retest criteria.
- Pilot go/no-go decision and post-launch monitoring plan.

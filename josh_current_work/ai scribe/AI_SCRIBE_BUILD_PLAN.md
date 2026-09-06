# AI Scribe Build Plan

## Reference-led workspace redesign — 2026-09-06

Planning deliverable [sc-396](https://app.shortcut.com/apply-1/story/396). Source inspected at `9355021` in `C:\Users\joshr\Desktop\Work\APPly`; this section is the current bounded build sequence. The broader original proposal below remains background, not evidence that its proposed paths exist. Dated implementation/audit files retain their historical meaning; the September 6 source already has the live route they previously described as missing. No application code or runtime tests were changed or run for this plan.

### Outcome and visual authority

An authorized clinic reviewer opens Scribe, selects or starts a patient session, adds context or records an encounter, creates a source-grounded note, edits it, and deliberately reviews/approves it. The user's attached interface is the composition reference: a narrow session rail, compact patient header, horizontal document tabs, generous white note canvas and a bottom instruction bar. Visible control behavior beyond what the screenshot proves is proposed below. Do not copy screenshot identities, records, redactions, branding or the unexplained “Goldilocks” label.

Operate mode, desktop and tablet first. Preserve APPly's clinic shell and existing MUI/components/tokens; change only Scribe's internal composition. Use quiet off-white canvas, white editor, fine dividers, restrained selected-row tint, readable system type, small consistent corner radii and a single prominent transcription action. Avoid oversized headings, stacked setup cards, duplicated generated/edited paragraphs and a permanent split-screen evidence dashboard. This is a local Scribe direction, not a global clinic theme replacement.

### First viewport and interaction contract

| Region | Proposed appearance and behavior |
| --- | --- |
| Session rail | About 248px on desktop, independently scrollable. New session, search, date-grouped recent sessions, patient name, time and plain status. Server-filtered/paginated results; never search only the loaded page. Collapse to a drawer on tablet when needed. A session selection must not discard an unsaved note or interrupt capture silently. |
| Patient header | Searchable patient field and session date/time on the left; Create note and Transcribe on the right. The picker includes a prominent Create new patient action that opens APPly's existing create-patient form in a modal. Successful server save closes the modal and immediately selects/displays that returned patient in the Scribe search field. Require a linked patient before creating the persisted encounter under the current model. Reuse an existing patient/appointment entry context only when verified and authorized. |
| Capture strip | Actual elapsed recording time, input activity, microphone selector and explicit recording/paused/stopped states. Start, pause, resume and stop have distinct accessible labels. Input activity reflects the microphone signal, not a decorative animation. |
| Tabs | Context, Transcript and note documents. SOAP first; SOAP with labs only after its template and authorized lab-source contract exist. The plus control creates a document from the server template catalog. Switching documents does not generate a new revision. Revision history is separate from document tabs. |
| Note canvas | One large editable document with Subjective, Objective, Assessment and Plan headings; readable line length, about 24–32px internal padding, no card around every paragraph. Empty state: “Ready when you are” with Add context / Transcribe actions. Compact toolbar: template, revision history, source/review drawer, save state and permitted copy/export actions. |
| Instruction bar | Bottom bar within the workspace: “Ask a question or edit your note…” Submit produces a proposed revision or source-cited documentation answer. Preview changed passages; Apply or Discard explicitly. It never silently overwrites manual edits or approves/exports a result. Initially omit voice dictation here until supported by the capture service. |
| Supporting details | Source citations, consent history, unresolved warnings, review checklist and provenance live in a drawer reached from the note. A concise visible unresolved count remains beside review; hiding detail must not hide a blocker. Review/approval/export become prominent when the relevant state permits them. |

The header stays visible while the note scrolls. At roughly 1024px prioritize the note and move the rail into a drawer; at narrow widths stack controls and make tabs horizontally scrollable without page overflow. The instruction bar must not obscure the last paragraph, zoomed text or the on-screen keyboard. Use existing token values before adding local measurements; verify final dimensions against screenshots, not these indicative numbers alone.

### Source-reconciled foundation

| Existing source | Observed behavior | Planned change |
| --- | --- | --- |
| `apps/web/src/App.tsx`, `/clinic/scribe` | Routes to `ScribeReviewPage`, alias of the live wrapper. | Keep the route; avoid shared navigation edits unless an entry-context gap is demonstrated. |
| `apps/web/src/features/scribe/LiveScribeReviewWorkspace.tsx` | Server encounter/patient selection, consent, transcript import, draft generation, review/approval/export/delete, stale-response and unsaved-edit guards. | Replace select-and-form setup with the session rail/header/tabs; retain mutation guards and server authority. |
| `apps/web/src/features/scribe/ScribeReviewWorkspace.tsx` | SOAP section editors, evidence references, warning/review states and guarded approval/export. | Compose a single note surface with contextual review/source drawers; preserve effective-content and revision semantics. |
| `apps/web/src/features/scribe/types.ts` | Fixed SOAP sections plus encounters, sources, drafts and events. | Add only accepted session summary/context/capture/document contracts. |
| `apps/api/app/controllers/clinic/scribe/encounters_controller.rb`, `drafts_controller.rb`; `apps/api/config/routes.rb` | Encounter index/show/create/delete; consent, sources, generate; draft review/approve/export. | Extend these existing boundaries for missing capabilities; routes remain a serialized coordinator edit. |
| `apps/api/app/services/clinic/scribe/workflow.rb`, `draft_generator.rb`, `retention.rb`; `apps/api/app/serializers/clinic/scribe/serializer.rb` | Version-checked review, consent and source gates, revisions, separate approval/export, protected content and retention. Generator copies grounded source into sections and abstains on unsupported assessment/plan. | Preserve safeguards; add actual transcription/generation adapters and document grouping only in their owned slices. |
| `apps/web/test/scribe-review-workspace.test.tsx` | Existing review-state coverage; not proof of a microphone or complete live flow. | Extend meaningful workflow tests and add live-composition/API coverage after implementation. |

Existing API family: `GET/POST /api/clinic/scribe/encounters`, `GET/DELETE /encounters/:id`, `POST /encounters/:id/consent`, `/sources`, `/generate`, and `POST /drafts/:id/review`, `/approve`, `/export`. Confirm exact payloads from controllers before editing consumers. The current generator is a local grounded implementation; the current parent-record adapter is not an official chart destination. Neither is proof of cloud AI or recording support.

### Build sequence, contracts and ownership

| Slice | Outcome / acceptance | Dependencies and suggested owner |
| --- | --- | --- |
| S1 — [sc-398](https://app.shortcut.com/apply-1/story/398) | Session rail, patient header, context/transcript tabs and editable SOAP document, persisted context and revision-safe manual edits. Reload restores saved content; errors and pending/unsaved states are truthful. | First. Terra medium for contained end-to-end wiring; root owns shared contracts and migration allocation. |
| S2 — [sc-399](https://app.shortcut.com/apply-1/story/399) | Working microphone capture, pause/resume/stop, protected upload, durable transcription/retry and transcript evidence, integrated into S1. | S1 contract plus provider/storage decisions. Sol medium owns capture-to-transcript slice; coordinator integrates shared files serially. |
| S3 — [sc-400](https://app.shortcut.com/apply-1/story/400) | Versioned template catalog, distinct note documents, source-grounded generation and instruction-bar edit proposals with accept/discard/restore. | S1 context/document contract; generation provider decision. Text-source work can proceed independently of S2 after shared ownership is separated. Sol medium. |
| S4 — verification | Verify new workspace journeys against this packet, and existing review/export boundaries under [sc-353](https://app.shortcut.com/apply-1/story/353). Create a separate bounded verification Story if the new capture/model scope exceeds that existing Story. | Each delivered slice gets focused checks; final integrated desktop/tablet proof follows S1–S3. Coordinator accepts only observed results. |

These are future build outcomes, not authority to start implementation in this planning run. Shortcut owns mutable claims/status. Use one coordinator plus only useful independent workers; isolated worktrees and disjoint owned files for writers. Do not run separate frontend/backend agents against the same workflow files. Luna low handled read-only frontend discovery and Terra low backend discovery for this plan; no fixed token-savings claim is made.

**S1 contract details.** Extend the index with server search and authoritative timestamps/labels needed for grouping; preserve patient/site scope, pagination and explicit empty/loading/error states. Add version-checked encounter context persistence, distinguishing reviewer-authored context from imported transcript evidence. Reuse encounter/source storage where its provenance fits; do not silently pretend freeform context was spoken. Proposed route: `PATCH /encounters/:id/context`. Keep edits in memory until a server save succeeds, show Saving/Saved/Unsaved/Save failed, and retain them on errors. Debounced saves serialize revisions; flush or explicitly resolve pending changes before changing sessions. Do not store clinical content in browser local storage. Undo/redo covers pending edits; restoring a saved revision creates a new review-required revision.

**Patient search and creation — explicit user requirement.** Search must query authorized backend patients as the user types, with bounded debounce, pagination, keyboard selection, loading/error/no-match states and stale-request protection. Show enough existing identifiers to distinguish matching names; do not infer identity from a name alone. Keep Create new patient available beside/in the picker, including no-result state. Render the existing full create-patient form/page content inside an accessible modal; preserve its fields, validation, duplicate handling and permission checks rather than inventing a separate Scribe patient form. If that page is route-bound, make only the smallest extraction needed to reuse its form in both contexts.

Verified reuse points: `apps/web/src/features/clinic/Patients.tsx` contains the existing creation fields and private `PatientFields`; `apps/web/src/shared/ui.tsx` exports `Form` with an `onSuccess(result)` callback. Reuse those fields via a focused registration component; retain the directory's redirect behavior while Scribe supplies an inline success callback. `POST /api/clinic/patients` in `apps/api/app/controllers/clinic/care/patients_controller.rb` returns `{ id, patient }`, so no guessed identity or second creation is needed. Gate creation on `patients.write` / projected `patients_write`, independently from Scribe permissions. Verify identity-read capability before searching.

The existing `/api/clinic/patients/lookup?q=...` pattern is used in Billing and FrontDesk, but currently matches reference only: `display_name` is nondeterministically encrypted, and the controller explicitly reserves name search for an approved blind-index design. S1 must account for name and reference search rather than present reference-only matching as completed patient search. Recommend a tenant-scoped protected name-search index within the existing database, with explicit normalization/match semantics, secure key handling, update/backfill and leakage review before implementation. Preserve encrypted names and identity-read authorization; do not use SQL matching on ciphertext, add a plaintext name column, download all patients to the browser or weaken encryption. Exact index/key design is an implementation prerequisite, not approved by this planning document. Modal creation/selection and reference search can be built while this contract is resolved, but name-search acceptance remains open.

On confirmed server creation, consume the returned patient ID and display identity, merge/refetch the authorized option as needed, select it immediately in the Scribe field, clear any stale search query/results, then close the modal and return focus to the patient control. Do not require retyping or searching for the newly saved patient. The selection can be preloaded before an encounter exists; patient creation alone must not create a Scribe session or imply consent. Preserve current Scribe context/note edits while the modal is open. Cancel makes no patient/selection change; validation or save failure keeps the modal and entered values open. Disable repeat submission and handle an uncertain save outcome without blindly creating a duplicate. Capture practice/site and request identity at opening; a late save after scope/session change must not select a patient into the wrong Scribe workspace. Existing persisted encounters must not silently change patient when another option is picked: use an explicit new-session flow unless a separately verified reassignment contract exists.

**S2 contract details.** Proposed feature-local `recordings_controller.rb`, recording model, transcription job and provider adapter under the existing Scribe namespaces; allocate migration IDs only during implementation after checking current schema. Proposed start/chunk/finalize/status/cancel operations must bind encounter, consent version, expected version and idempotency key. Server controls upload constraints, durable chunk acknowledgements, processing state and transcript artifact creation. Model capture and processing separately: capture idle/recording/paused/stopped; upload pending/uploading/uploaded/failed; transcription queued/processing/ready/failed/cancelled. A browser refresh cannot resume a microphone automatically: show interrupted capture and recover acknowledged chunks, then require an explicit resume/new recording. Consent withdrawal stops capture and cancels queued work; late results must not repopulate withdrawn/deleted content. Reuse existing source hashing, encryption and retention. No browser speech-to-text shortcut with an undisclosed provider.

**S3 contract details.** Proposed template list and document-generation/revision endpoints, with server-owned template ID/version, note-document ID, parent revision, selected source IDs and input digest. Existing generation supersession is encounter-wide; change it deliberately to document-scoped revisions before enabling multiple note tabs. Approval/export must bind the exact document and revision. Keep the existing fixed SOAP review behavior while adding only the required templates. SOAP with labs consumes explicitly selected, authorized results with provenance; without a verified lab API/import contract show missing source and do not invent values. “Shorten”, “organize” and “correct wording” create previews; unsupported information remains unresolved. Freeform questions are restricted to documentation and selected sources, with references or an explicit unavailable answer. Prompts/source text are untrusted data and cannot change authority. Persist request/result provenance, provider/template versions, failure and retry identity; a failed request preserves the current note. Applying any proposal invalidates approval and requires review again.

**Host versus Scribe ownership.** APPly owns authentication, practices/sites, patients, appointments, capabilities and official records. Scribe owns linked encounters, consent evidence, context/source provenance, recordings, drafts/documents/revisions and review history. Use opaque record IDs; never trust client actor/tenant/permission values. Existing encrypted content, consent checks under locks, expected versions, audit events and idempotent export are invariants. No automatic chart writes, outgoing messages, treatment advice, unrelated clinic redesign or new application framework.

### Decisions and finish line

The screenshot supplies appearance, not a transcription vendor, storage policy or proven interaction contract. Before S2/S3 provider implementation, resolve authorized provider/account, credential custody, storage/retention, accepted audio limits and model behavior through the existing project workflow. No new service or dependency is selected by this plan. Upcoming appointments require a verified scheduling read contract; use Recent sessions until that link exists rather than displaying a nonfunctional Upcoming tab. Exact style presets beyond the two requested note formats are deferred until they have a defined purpose.

Completion means the reference composition is recognizable and every displayed control is connected to a supported, persisted operation. A successful transcript-import redesign completes S1 only; it does not complete recording or AI revision functionality. Run the [reference-led acceptance checks](AI_SCRIBE_AUDIT_PLAN.md#reference-led-workspace-acceptance--2026-09-06) on real backend-served local test records. No copied screenshot records or fabricated frontend successes. First bounded implementation action: claim S1, lock its summary/context/editor contract, then replace the current wrapper layout while retaining its mutation guards.

## Related planning documents

- [Capability roadmap](ROADMAP.md)
- [AI scribe audit plan](AI_SCRIBE_AUDIT_PLAN.md)
- [Shared roadmap index](../ROADMAP_INDEX.md)
- Cross-capability dependency: approved drafts may create authorized follow-up work in [Staff Messaging](../staff%20messaging/ROADMAP.md), but AI scribe must never autonomously send messages, reminders, or official-record updates.

Status: planning artifact only. All paths below are proposed paths for the larger application; this document does not claim that these files or production services exist.

## 1. Intended product and non-goals

The product receives an authorized encounter transcript or recording, creates a structured documentation draft, and gives an authorized professional evidence-linked controls to review, edit, approve, and optionally export it. The source of truth is the human-approved artifact, not the model output.

Initial supported use cases:

- encounter note drafting from a consented transcript;
- importing an existing transcript with explicit source metadata;
- section-level review, correction, regeneration, and approval;
- export to the parent application’s record system only after approval.

Initial non-goals:

- autonomous diagnosis, triage, treatment, prescribing, coding, medical-necessity determination, or patient-facing advice;
- automatic recording when consent is absent or unclear;
- autonomous EHR submission or silent background operation;
- guessing demographics, medications, measurements, dates, speaker identity, or negation;
- training a general model on customer/participant data without a separately approved purpose and contract.

Product, clinical-safety, privacy, and legal owners must approve any change to this intended use. A later decision-support feature is a new product scope, not a small extension.

## 2. Proposed application layout

Assume the scribe is a bounded module inside a larger authenticated app. Keep the module behind application interfaces so storage, identity, model provider, and export destination can be replaced without changing review semantics.

```text
apps/web/src/features/ai-scribe/
  components/ScribeWorkspace.tsx
  components/ConsentPanel.tsx
  components/RecordingControls.tsx
  components/SourceTimeline.tsx
  components/DraftSectionCard.tsx
  components/ReviewToolbar.tsx
  components/ApprovalDialog.tsx
  components/ExportDialog.tsx
  hooks/useScribeEncounter.ts
  hooks/useDraftReview.ts
  lib/scribe-api.ts
  lib/accessibility.ts
  types.ts
apps/api/src/modules/ai-scribe/
  domain/encounter.ts
  domain/draft.ts
  domain/consent.ts
  domain/policy.ts
  application/create-encounter.ts
  application/ingest-source.ts
  application/generate-draft.ts
  application/review-draft.ts
  application/approve-draft.ts
  application/export-approved-draft.ts
  application/delete-encounter.ts
  http/scribe-routes.ts
  http/scribe-schemas.ts
  services/consent-service.ts
  services/transcription-service.ts
  services/draft-generation-service.ts
  services/provenance-service.ts
  services/redaction-service.ts
  services/retention-service.ts
  services/export-service.ts
  services/audit-service.ts
  policies/authorization.ts
  policies/safety-boundary.ts
  repositories/encounter-repository.ts
  repositories/artifact-repository.ts
  repositories/audit-repository.ts
  workers/generate-draft-worker.ts
  workers/retention-worker.ts
packages/contracts/src/ai-scribe.ts
packages/evaluation/ai-scribe/
  fixtures/README.md
  schemas.ts
  rubric.ts
  run-evaluation.ts
infra/observability/ai-scribe-dashboards/
  generation.json
  safety.json
docs/ai-scribe/
  INTENDED_USE.md
  CONSENT_AND_PRIVACY.md
  THREAT_MODEL.md
  MODEL_CARD.md
  EVALUATION_PROTOCOL.md
  INCIDENT_RUNBOOK.md
```

The parent app owns authentication, tenant membership, navigation, user provisioning, global audit retention policy, and the final record destination. The scribe module owns encounter state, consent evidence, source/draft lifecycle, model calls, review state, and scribe-specific audit events.

## 3. Responsibilities and boundaries

### Web UI

`ScribeWorkspace` orchestrates state but does not make policy decisions. It must render the current encounter status, source evidence, draft status, blocking issues, and last saved revision. UI actions call typed API clients; they do not write directly to storage or invoke a model.

`ConsentPanel` presents who is recording, why, what is captured, retention, sharing/export implications, how to decline, and how to withdraw. It records a versioned consent decision, not just a boolean. `RecordingControls` always shows idle/arming/recording/paused/stopping/uploading/error states, an elapsed timer, microphone indicator, and a visible stop action.

`SourceTimeline` shows transcript segments, speaker label (or unknown), timestamp, confidence/quality flags, and links from draft assertions back to source spans. `DraftSectionCard` distinguishes generated text, human edits, unsupported/unknown content, and approved content. It must never hide a warning behind color alone.

`ApprovalDialog` states that approval makes the draft eligible for export/save, identifies unresolved warnings, and requires an explicit affirmative action. `ExportDialog` is separate from approval and names the destination, record type, user, and exact version being exported.

### API/application services

Routes perform authentication, tenant scope checks, input validation, idempotency, rate limiting, and authorization before invoking application services. Application services enforce state transitions and optimistic concurrency. Repositories never decide whether an action is clinically or legally allowed.

`consent-service` validates current consent policy, participant/encounter binding, withdrawal, and expiry. `transcription-service` accepts approved providers or a local implementation, returns timestamped segments and quality flags, and never silently substitutes an unapproved provider. `draft-generation-service` retrieves only authorized source artifacts, applies an approved template, calls the selected provider, validates structured output, runs safety/grounding checks, and persists a generation record.

`provenance-service` creates immutable links among source artifact, segment, draft version, model/provider, prompt/template, human edit, approval, and export. `export-service` refuses anything except the currently approved revision and writes the destination response into the audit trail. `retention-service` performs policy-driven deletion and verifies object-store, database, queue, cache, search-index, backup, and provider-side deletion obligations.

### Model/provider gateway

`draft-generation-service` must call a provider-neutral gateway with an allowlisted model configuration. The gateway owns timeout, retry, circuit-breaker, payload limits, structured-output validation, provider request IDs, and “do not train/retain” contract checks. Prompt and template versions are immutable records. Do not log prompts or PHI by default; use redacted hashes and request IDs.

## 4. Data model and lifecycle

Proposed tables/collections in `apps/api/src/modules/ai-scribe`:

| Entity | Required fields and purpose |
|---|---|
| `scribe_encounters` | `id`, `tenantId`, `subjectRef`, `authorId`, `status`, `templateId`, `createdAt`, `updatedAt`, `retentionClass`, `version`; never expose cross-tenant IDs. |
| `consent_records` | encounter/participant binding, policy version, locale, method, scope, recordedAt, withdrawnAt, actor/device metadata, evidence hash; immutable decisions plus a current derived status. |
| `source_artifacts` | type, encrypted object reference, size/duration, SHA-256, MIME, capture/import metadata, transcript status, retention/deletion status; raw recording and transcript are separate artifacts. |
| `transcript_segments` | artifact ID, sequence, start/end time, speaker ID or `unknown`, text, quality/confidence flags, redaction status; preserve original text and derived redacted views separately. |
| `draft_versions` | encounter ID, parent version, template version, generation ID, status (`draft`, `in_review`, `approved`, `superseded`, `exported`), createdBy, checksum, createdAt. |
| `draft_sections` | version, stable section key, generated content, human content, status, warning codes, evidence span IDs, edit revision; do not overwrite generated content with edits. |
| `generation_runs` | provider/model/version, prompt/template hashes, input artifact hashes, policy decision, token/cost counters where safe, latency, retry count, output validation, safety result, provider request ID. |
| `provenance_links` | source/draft/edit/approval/export entities, relationship, actor, timestamp, integrity hash; model the chain as append-only. |
| `review_actions` | reviewer, action, target/version, before/after hashes, reason, timestamp, client revision; store human edits as events plus materialized current content. |
| `approval_records` | approver, role snapshot, approved version checksum, warnings acknowledged, approvedAt, revokedAt, revocation reason. |
| `export_records` | approved version checksum, destination, payload hash, response/reference, actor, idempotency key, status, exportedAt. |
| `audit_events` | tenant/actor, event type, resource, outcome, correlation ID, timestamp, metadata allowlist; no transcript/draft text or secrets. |

Use envelope encryption with tenant-scoped data keys for PHI-bearing objects, application-level access checks, database row/tenant isolation, and separate restricted storage for raw audio. Define backup and deletion semantics before claiming deletion completion.

## 5. API contract (proposed)

All endpoints require authenticated tenant context and return a correlation ID. Mutating requests support an idempotency key and expected `version`/ETag.

```text
POST   /v1/tenants/{tenantId}/scribe/encounters
GET    /v1/tenants/{tenantId}/scribe/encounters/{encounterId}
POST   .../consent/decisions
POST   .../source-uploads            -> presigned upload intent, never public
POST   .../source-artifacts/{id}/complete
GET    .../source-artifacts/{id}/segments
POST   .../draft-generations         -> queued job, requires valid consent
GET    .../draft-versions/{versionId}
POST   .../draft-versions/{versionId}/review-actions
POST   .../draft-versions/{versionId}/approve
POST   .../draft-versions/{versionId}/approval/revoke
POST   .../draft-versions/{versionId}/export
DELETE .../encounters/{encounterId} -> asynchronous verified deletion job
GET    .../encounters/{encounterId}/audit
GET    .../jobs/{jobId}
```

Responses expose status, warnings, evidence references, and safe error codes—not provider prompts, secrets, or raw PHI in error messages. Export returns `409` for stale/unapproved revisions, `403` for authorization failure, `422` for invalid consent/state/schema, and `503` for unavailable dependencies with a resumable job state.

## 6. End-to-end flows

### Consent and capture

1. Professional creates an encounter and selects a purpose/template.
2. UI displays the consent explanation and a non-recording alternative.
3. Consent decision is saved with policy version and evidence; server rechecks it on every recording, upload, transcription, generation, and export operation.
4. Recording starts only after the server confirms authorization and current consent. UI shows active capture and a persistent stop control.
5. Chunks are encrypted, ordered, checksummed, resumable, and closed with an explicit stop. An interrupted session becomes `incomplete`, never silently complete.
6. Consent withdrawal stops processing, marks downstream jobs cancellable, prevents generation/export, and queues deletion or policy-specific quarantine.

### Draft generation

1. User chooses a complete source and approved template; server creates an idempotent generation job.
2. Worker obtains only the minimum authorized source, validates media/transcript quality, and records the input hashes.
3. Transcription, if needed, produces timestamped segments with unknown speakers and quality flags.
4. Model gateway receives a bounded, policy-approved payload and returns schema-validated sections with evidence span IDs or an abstention.
5. Grounding/safety validation flags unsupported claims, missing sections, contradictions, PHI leakage, prohibited advice, and malformed output.
6. System saves a new immutable draft version and provenance record, then notifies the reviewer. A failed job leaves the source intact and exposes retry/fallback state.

### Review and export

1. Reviewer opens source and draft in one workspace; evidence links scroll both panes to the relevant segment.
2. Reviewer edits or rejects content, records reasons when required, and can regenerate one section with the same guardrails.
3. Any edit or regeneration creates a new revision and invalidates approval of its parent.
4. Approval is allowed only for an authorized role on the current revision; unresolved high-severity safety flags block approval.
5. Export is a second confirmation that sends the exact approved checksum to the parent app adapter.
6. Any destination response, retry, reversal, or failure is recorded. The user can return to the approved artifact and see what was exported.

## 7. Edge cases and required behavior

| Scenario | Required behavior |
|---|---|
| Consent declined, expires, or is withdrawn | Do not record/process/export; show alternative; preserve only policy-allowed evidence; queue deletion. |
| Multiple participants or minor/vulnerable person | Require configured policy path and explicit authority; support participant-level status; default to no capture when uncertain. |
| Speaker diarization uncertain | Label `unknown`, show low-quality warning, and require reviewer correction; never infer identity from voice alone. |
| Negation, sarcasm, code-switching, accent, overlap, or inaudible audio | Preserve segment quality flags; abstain or mark `[unclear]`; do not normalize away uncertainty. |
| Duplicate/reordered upload or worker retry | Verify checksum and idempotency key; deduplicate without double billing or duplicate audit events. |
| Model timeout/provider outage/rate limit | Exponential backoff within a bounded budget, then durable failure and manual retry/fallback; no partial export. |
| Partial transcript or recording stops unexpectedly | Mark incomplete, show missing interval, permit repair/import, block approval when required sections lack evidence. |
| Conflicting source statements | Preserve both with timestamps and flag for review; never resolve conflict by model confidence alone. |
| User loses connection or two reviewers edit | Autosave drafts as revisions; use optimistic concurrency and explicit merge/restore; never last-write-wins over human content. |
| Template/model version changes mid-encounter | Pin the generation to the recorded versions; new versions require explicit regeneration and new review. |
| Export destination unavailable or returns ambiguous success | Keep `export_pending`, use destination idempotency key, reconcile before retrying, and never claim success from a timeout. |
| Delete request during generation/export | Cancel where possible, deny new processing, mark all artifacts pending deletion, and verify downstream completion. |

## 8. Security, privacy, and safety controls

- Perform and document a data-flow inventory and threat model covering browser/mobile capture, object storage, queues, databases, logs, analytics, support access, backups, model provider, transcription provider, and export destination.
- Establish whether the deploying organization is a covered entity/business associate and obtain required BAAs and subprocessor commitments before PHI reaches a cloud service. Confirm provider training/retention, region, subprocessors, breach notice, return/destruction, SLA, and audit rights contractually.
- Enforce SSO/MFA where available, short-lived sessions, least-privilege RBAC/ABAC, tenant isolation, subject/encounter authorization, break-glass with reason and alert, and periodic access review.
- Encrypt in transit and at rest; isolate raw audio; use key rotation, secret manager, signed upload URLs, content-type/size/duration limits, malware scanning, and no PHI in URLs or client telemetry.
- Minimize data sent to models, redact only with reversible/traceable policy where necessary, disable provider training, and keep a provider/model inventory with approved regions and versions.
- Make recording indicator, consent status, retention, withdrawal, deletion, and export destination visible. Provide access/correction/deletion workflows subject to applicable law and organizational policy.
- Keep immutable audit events for access, capture, consent, generation, review, approval, export, policy denial, support access, and deletion. Separate operational metrics from content.
- Add a safety policy that blocks diagnosis/treatment/prognosis/prescription advice and unsupported factual completion. Treat safety flags as workflow gates, not cosmetic warnings.
- Define incident response for wrong-patient association, accidental capture, unauthorized access, provider breach, prompt injection in imported text, harmful draft, and failed deletion. Preserve evidence without expanding access.

These controls operationalize HHS Security Rule risk analysis and safeguards; HIPAA applicability and state recording/privacy laws still require deployment-specific counsel.

## 9. Observability and operations

Use structured, redacted logs with correlation ID, tenant pseudonym, encounter pseudonym, job ID, event/outcome, policy decision, provider request ID, duration, retry count, and error class. Never put source text, draft text, tokens containing PHI, access tokens, or consent contents in logs.

Metrics:

- reliability: capture completion, upload resume success, queue age, generation success, timeout/rate-limit/error rate, export reconciliation, deletion completion age;
- quality/safety: evidence-link coverage, unsupported-claim rate, abstention rate, reviewer edit distance, omission rate, severe-flag rate, approval reversal, complaint/incident rate;
- product: time to first draft, review time, section rejection/regeneration rate, accessibility errors, opt-out rate;
- cost/governance: provider cost, token/audio duration, model/template distribution, data-region distribution, and policy-denial count.

Alert on consent bypass attempts, cross-tenant authorization failures, PHI log-detection, unusual export volume, deletion SLA breach, severe safety flags, queue/SLO breach, provider contract/config drift, and model output-quality regression. Provide dashboards at tenant-aggregated level and restrict encounter drill-down to authorized operators.

## 10. Testing and evaluation

Test layers:

- unit/property tests for state machines, consent expiry, authorization predicates, evidence spans, checksums, idempotency, redaction, deletion transitions, and approval invalidation;
- API/contract tests for tenant isolation, role matrix, error codes, retries, optimistic concurrency, export adapter, and provider gateway;
- integration tests with fake transcription/model/export providers, encrypted object storage, queue redelivery, clock control, and failure injection;
- security tests for IDOR, session fixation, CSRF, SSRF, upload abuse, prompt injection, log leakage, secrets, dependency/container scanning, and backup access;
- UI accessibility tests for keyboard-only operation, focus order, screen-reader labels/live status, contrast, zoom/reflow, captions/transcript alternatives, target sizes, and reduced motion, followed by assistive-technology review;
- resilience tests for browser refresh, offline/reconnect, worker crash, duplicate events, provider outage, partial uploads, backup restore, and deletion verification.

Create `packages/evaluation/ai-scribe/fixtures/` from de-identified and synthetic examples covering accents, overlapping speakers, negation, medication names, numbers/units, sensitive topics, missing context, contradictory statements, and prompt injection. Keep fixtures access-controlled and versioned; do not place live PHI in the repository.

Evaluation rubric, reviewed by qualified professionals, should measure factual support, clinically material omissions, unsupported additions, negation errors, speaker attribution, temporal accuracy, readability, edit burden, abstention appropriateness, and subgroup performance. Report confidence intervals and stratify by language/accent/audio quality and template. Use fixed holdout sets plus shadow-mode monitoring; human review is the release gate. A good average score cannot waive a severe safety failure.

## 11. Accessibility and human factors

Target WCAG 2.2 AA for the web workflow. Every state must be perceivable without color or audio alone; recording status must be announced accessibly and visually; keyboard users need equivalent start/stop/review/export paths; focus must remain predictable across live transcript updates; captions/transcript and text alternatives are required for audio; provide pause/stop for non-essential motion and support zoom/reflow. Test with screen readers, keyboard-only users, low vision/zoom, speech input, and users who cannot or do not want to speak during consent.

Design review for cognitive load: concise plain-language consent, one primary action per state, explicit “unknown/needs review,” visible provenance, non-alarming but unambiguous errors, and no dark patterns around recording or export.

## 12. Model governance and change control

Maintain `docs/ai-scribe/MODEL_CARD.md` and a model registry containing intended use, owner, provider, version, region, data-use terms, prompt/template versions, input limits, known failure modes, evaluation results, approval date, and rollback target. Pin versions in production; do not silently float to a new model.

Every model/template/provider change requires a change record, impact assessment, regression evaluation, security/privacy review, updated user-facing disclosure if behavior changes, staged rollout, rollback plan, and post-release monitoring. Record enough metadata to reproduce a draft without retaining unnecessary PHI.

## 13. Rollout plan and exit gates

1. **Internal synthetic mode:** no real recordings; exercise state machine, provider contracts, accessibility, audit, deletion, and outage paths.
2. **Shadow mode:** opt-in de-identified or approved test data; generate but do not expose/export automatically; compare against reviewer-created notes.
3. **Small supervised pilot:** limited tenants/templates, recording opt-in, named reviewers, support coverage, daily safety review, and hard stop criteria.
4. **Expanded pilot:** add only evidence-backed templates and integrations; weekly governance review and documented incident/quality trend.
5. **General availability decision:** security/privacy sign-off, BAA/subprocessor review, clinical-safety sign-off, accessibility evidence, model evaluation, restore/deletion drill, SLOs, runbooks, and no open critical findings.

Stop or roll back on any consent bypass, wrong-patient export, material unsupported clinical assertion reaching an official record, cross-tenant exposure, unverified deletion failure, severe subgroup regression, or unexplained quality regression. Keep a kill switch for capture, generation, and export independently.

## 14. Fit with the larger app

The parent application should link to a scribe encounter from its existing patient/subject and appointment context, but the scribe must re-authorize every access server-side. Parent navigation may show status (`not started`, `recording`, `draft ready`, `needs review`, `approved`, `exported`) without exposing transcript content to users who lack encounter access.

The parent app owns identity, tenant membership, patient/subject master data, appointment association, notification preferences, and final record destination. Scribe owns the consent evidence, raw source, transcript, draft versions, review/approval state, model provenance, and scribe audit. Integration uses stable opaque IDs and typed adapters; no UI component reaches directly into another module’s database.

For interoperability, map only approved content and provenance to the destination contract. If the host uses FHIR, evaluate `DocumentReference`, `Composition`, and `Provenance` mappings with the host’s implementation guide and legal record policy. Never imply that a FHIR mapping alone makes the content clinically valid or legally authenticated.

## 15. Source and research notes

Primary sources consulted:

- [HHS Summary of the HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) and [HHS Guidance on Risk Analysis](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-risk-analysis/index.html): confidentiality, integrity, availability, periodic risk analysis, access review, and safeguards.
- [HHS Guidance on HIPAA and Cloud Computing](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html): cloud providers that create/receive/maintain/transmit ePHI, BAAs, deletion/return, subcontractors, and SLA considerations.
- [NIST AI RMF 1.0](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10), [AI RMF Playbook](https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-rmf-playbook), and [Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf): Govern, Map, Measure, Manage; lifecycle risk and generative-AI-specific failure modes.
- [FDA Clinical Decision Support Software Guidance](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software): intended use, input/data-quality disclosure, knowns/unknowns, validation, and independent professional review. The initial scribe scope intentionally stays documentation-only.
- [ONC HTI-1 Final Rule](https://healthit.gov/regulations/hti-rules/hti-1-final-rule/) and [Decision Support Interventions source attributes](https://healthit.gov/test-method/decision-support-interventions/): plain-language transparency and source-attribute/change-record concepts.
- [HL7 FHIR Provenance](https://hl7.org/fhir/provenance.html): tracking agents, entities, activities, revisions, authenticity, reproducibility, and lifecycle status.
- [W3C WCAG 2.2](https://www.w3.org/TR/wcag/) and [What’s New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/): accessibility target and relevant focus, target-size, authentication, and input-assistance criteria.

Consent-to-recording and health-privacy requirements vary by jurisdiction, relationship, patient population, and deployment role. Treat the sources above as engineering and governance inputs; obtain current jurisdiction-specific legal, privacy, security, and clinical review before production use.

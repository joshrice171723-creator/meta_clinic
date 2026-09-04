# AI Scribe Build Plan

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

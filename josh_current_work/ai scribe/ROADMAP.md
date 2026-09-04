# AI Scribe Roadmap

## Objective

Build a consent-based, human-reviewed documentation assistant that turns an authorized encounter recording or transcript into a traceable draft. The product assists documentation; it does not independently diagnose, triage, prescribe, recommend treatment, or finalize a clinical record.

The implementation detail, proposed repository layout, contracts, flows, controls, and acceptance evidence are in [AI_SCRIBE_BUILD_PLAN.md](AI_SCRIBE_BUILD_PLAN.md).

## Product guardrails

- Recording is opt-in, visibly active, stoppable, and jurisdiction/configuration aware. The encounter can continue without recording.
- The source transcript, speaker/timestamp evidence, generated draft, edits, approvals, exports, and deletions remain distinguishable and traceable.
- Every generated section is a draft until an authorized professional reviews and explicitly approves it. Export is a separate, deliberate action.
- Unknown, inaudible, contradictory, or unsupported information is surfaced as unknown or needing review; the system never fills gaps with plausible clinical facts.
- The initial release is documentation-only. Any later clinical decision-support capability requires a separate intended-use, regulatory, safety, and evaluation review.

## Delivery roadmap

### Phase 0 — Product, legal, and safety contract

Write the intended-use statement, prohibited uses, user roles, supported jurisdictions, consent policy, data classification, retention/deletion policy, vendor/BAA requirements, accessibility target, threat model, and clinical safety review checklist. Create a de-identified evaluation set and an approved template registry before production data is used.

Exit evidence: signed product/safety decision record; data-flow and threat-model review; consent and retention decisions; approved evaluation protocol; named owners for privacy, security, clinical safety, and model governance.

### Phase 1 — Secure encounter and source ingestion

Implement authorized encounter creation, transcript import first, then recording behind a feature flag. Show recording status and consent state, support stop/pause/retry, validate file type/size/duration, virus-scan uploads, encrypt transport/storage, and make the raw source separately deletable. Do not send data to a model until consent and authorization checks pass.

Exit evidence: guarded end-to-end test for consent denied/revoked, upload failure, interruption, duplicate delivery, unauthorized access, and deletion; no PHI in ordinary logs.

### Phase 2 — Draft generation with provenance

Generate only from the selected encounter source and approved template. Persist model/provider/version, prompt/template version, input artifact IDs and hashes, timestamps, latency, safety policy result, structured output validation, and section-level evidence links. Prefer deterministic structured output and abstention over speculative completion.

Exit evidence: replayable generation record; schema/property tests; groundedness and omission evaluation against the de-identified set; safe fallback when transcription or model services fail.

### Phase 3 — Review, correction, and approval

Provide a keyboard-accessible review workspace with draft sections beside transcript evidence. Mark unsupported, low-confidence, incomplete, and changed content. Support edit, accept, reject, regenerate-one-section, add-note, undo, and compare-version actions. Require explicit approval of the complete draft and a separate export confirmation; never auto-submit to an EHR.

Exit evidence: reviewer can locate evidence for every material assertion, see all edits and model versions, save/resume safely, and cannot export an unapproved or stale draft.

### Phase 4 — Controlled integration and operational readiness

Add an adapter boundary for the larger app and, only after approval, a standards-based export path such as FHIR DocumentReference/Composition as appropriate to the host system. Add tenant/role policy, retention jobs, incident response, vendor controls, dashboards, alerts, runbooks, backup/restore, and kill switches.

Exit evidence: integration contract test; authorization matrix; restore/deletion drill; SLO and cost dashboard; incident tabletop; accessibility review; pilot sign-off.

### Phase 5 — Pilot, evaluation, and governed expansion

Run a small opt-in pilot with pre-registered success and stop criteria. Monitor factual support, omissions, edits, abstentions, complaints, consent failures, disparities, latency, failures, cost, and export reversals. Review sampled encounters with qualified professionals. Expand templates, languages, modalities, or decision-support features only through change control and a new risk assessment.

## Completion criteria

- Consent, authorization, retention, deletion, and tenant isolation are enforced end to end.
- The raw source and every draft assertion are inspectable, attributable, versioned, and distinguishable from human-authored content.
- A qualified authorized professional can correct every section; no draft is finalized or transmitted without explicit approval.
- Safety boundaries prevent autonomous clinical recommendations and unsupported clinical facts.
- Security, privacy, accessibility, reliability, evaluation, model inventory, and incident evidence are available for the pilot decision.

## Research basis

The detailed plan operationalizes HHS HIPAA Security Rule/risk-analysis and cloud/BAA guidance, NIST AI RMF and Generative AI Profile, FDA clinical decision-support guidance on intended use and independent review, ONC HTI-1 source-attribute transparency concepts, HL7 FHIR Provenance, and W3C WCAG 2.2. These are implementation inputs, not a legal or regulatory determination; counsel and the applicable clinical/privacy owners must confirm the deployment context.

## Audit plan

See [AI_SCRIBE_AUDIT_PLAN.md](AI_SCRIBE_AUDIT_PLAN.md) for consent and capture review, authorization and isolation tests, model/draft quality evaluation, human-approval and clinical-safety checks, model governance, accessibility, severity model, release gates, and required audit outputs.

# Patient Reminders Roadmap

## Objective

Create a reliable, privacy-preserving reminder workflow that helps patients remember appointments, preparation steps, medications, and follow-up actions while giving patients control over channels, timing, content, and opt-out choices.

The implementation-ready specification is [PATIENT_REMINDERS_BUILD_PLAN.md](PATIENT_REMINDERS_BUILD_PLAN.md). It is the source of truth for proposed files, contracts, data ownership, flows, controls, and acceptance evidence. The paths in that document are proposed paths in the larger application; this roadmap folder intentionally contains planning artifacts only.

## Product boundaries and decisions

- Start with operational reminders: appointment, preparation, medication, and follow-up. Do not treat reminders as clinical decision support, emergency messaging, or proof of medication adherence.
- A reminder is a request to communicate, with a patient, source event, recipient endpoint, authorized channel, safe content policy, schedule, cancellation condition, and auditable outcome.
- A privacy-minimizing message is the default. SMS, email previews, lock-screen notifications, and voicemail are not assumed private; sensitive detail belongs behind an authenticated portal link.
- Consent and communication preferences are first-class, versioned records. Transactional treatment reminders and optional promotional messages are separate categories.
- Delivery is asynchronous and at-least-once at the provider boundary; idempotency, deduplication, cancellation checks, provider callbacks, and reconciliation are required before launch.

## Delivery sequence

### Phase 0 — Product, safety, and integration contract

Define reminder taxonomy, source-of-truth events, patient identity and contact verification, consent/preference semantics, time zones, quiet hours, escalation boundaries, data retention, vendor/Business Associate review, and clinical/legal/privacy approval. Produce the contract and decision log in the build plan before implementation.

Exit: owners approve the data classification, safe-content policy, opt-out behavior, failure policy, and launch metrics; no unresolved ambiguity remains around who may create or cancel a reminder.

### Phase 1 — Durable foundation and policy engine

Implement the proposed reminder, endpoint, preference, consent, template, delivery-attempt, idempotency, and audit structures. Build policy evaluation before sending: authorization, recipient verification, channel eligibility, quiet hours, deduplication, cancellation, rate limits, and content redaction. Add an outbox/queue boundary and an explicit state machine.

Exit: unit, contract, security, and failure-injection checks prove that a message cannot be queued without an eligible endpoint and policy decision, and retries cannot create duplicate sends.

### Phase 2 — Staff operations and patient controls

Add staff list/detail/create/edit/pause/cancel/retry views with role-based access and reason capture. Add patient reminder history, confirm/reschedule/request-help actions, and communication preferences with accessible feedback. Keep patient-specific content private; staff views use least privilege and masking.

Exit: an authorized staff member can manage the full lifecycle without direct data edits, and a patient can see and change permitted preferences without exposing another patient’s data.

### Phase 3 — Channel adapters and end-to-end workflows

Launch one channel first, preferably portal/in-app or a contracted provider with required safeguards, then add SMS/email only after content, consent, provider, and callback controls pass review. Implement appointment changes, cancellation, reschedule, opt-out, invalid endpoint, provider outage, and late-event flows end to end.

For the appointment-reminder pilot, use the following cadence as a configurable starting point rather than a universal policy: T-72 hours for confirmation or early cancellation requests; T-24 hours for logistics, preparation, and portal routing; T-2 hours for a short arrival reminder; and T+30 minutes after a source appointment is marked `no_show` for a rescheduling task. Each step requires an eligible endpoint, an approved channel/content decision, quiet-hours and time-zone checks, and a stable deduplication key. Confirmation, cancellation, and rescheduling remain explicit patient/staff actions routed through the authoritative appointment service; a reply or link must not silently mutate the source record.

Exit: staging evidence covers create → schedule → send → provider result → patient action → source-event change → cancellation, including delayed, duplicated, and out-of-order events.

### Phase 4 — Pilot, measurement, and controlled expansion

Pilot with a small cohort and staff group. Monitor delivery and safety signals daily, pause on privacy, duplicate, wrong-recipient, consent, or unexplained-volume incidents, and compare outcomes with a defined baseline. Expand by channel and reminder type only when the relevant gate is met.

Exit: pilot review signs off reliability, accessibility, privacy/security, support readiness, and patient/staff feedback; rollback and vendor failover procedures are rehearsed.

## Cross-cutting completion criteria

- Every reminder has a clear owner, source event, patient/endpoint, category, channel authorization, scheduled time, cancellation path, and current state.
- Consent/preference history, policy decisions, delivery outcomes, patient actions, staff actions, and source-event changes are auditable without logging message bodies or unnecessary PHI.
- Scheduling uses an explicit IANA time zone and DST-safe calculation; retries are bounded and idempotent.
- Staff cannot bypass policy by editing data directly; patients can opt out of eligible message categories and the system honors revocation promptly.
- Patient copy is plain-language, localized where required, keyboard/screen-reader compatible, and tested against WCAG 2.2 AA criteria relevant to the flow.
- Production readiness includes alerting, runbooks, access review, retention/deletion behavior, vendor safeguards, support scripts, and measured pilot gates.

## Detailed plan

See [PATIENT_REMINDERS_BUILD_PLAN.md](PATIENT_REMINDERS_BUILD_PLAN.md) for the complete build map, proposed file paths, APIs, UI/service responsibilities, flows, edge cases, security/privacy controls, observability, testing, rollout, and integration boundaries.

## Audit plan

See [PATIENT_REMINDERS_AUDIT_PLAN.md](PATIENT_REMINDERS_AUDIT_PLAN.md) for the evidence requirements, workflow and data-flow audit, authorization matrix, delivery reliability tests, accessibility review, severity model, release gates, and required audit outputs.

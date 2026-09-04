# Patient Reminders Audit Plan

## Related planning documents

- [Capability roadmap](ROADMAP.md)
- [Patient reminders build plan](PATIENT_REMINDERS_BUILD_PLAN.md)
- [Shared roadmap index](../ROADMAP_INDEX.md)
- Integration audit dependency: [Staff Messaging audit plan](../staff%20messaging/STAFF_MESSAGING_AUDIT_PLAN.md) must cover reminder-failure tasks, correlation IDs, scope enforcement, and acknowledgement/escalation handoff.

## 1. Audit purpose and boundaries

Verify that the patient-reminder capability is safe, understandable, reliable, accessible, privacy-preserving, and ready for a controlled production pilot. Audit the complete journey from reminder configuration through scheduling, delivery, patient response, cancellation, retry, escalation, reporting, and deletion.

This is a product and implementation-readiness audit. Passing tests or using HIPAA-aware design patterns does not by itself establish legal compliance. Compliance, contracts, policies, risk analysis, vendor review, and organizational controls require separate qualified review.

### In scope

- Patient and staff reminder screens and responsive behavior.
- Reminder templates, triggers, scheduling, time zones, quiet hours, preferences, consent, opt-out, and cancellation.
- APIs, queues, workers, delivery providers, retries, idempotency, and webhook handling.
- Authorization, tenant/site/patient isolation, audit events, logs, metrics, and retention.
- Accessibility, content clarity, localization, failure states, and operational workflows.

### Out of scope unless explicitly added

- Clinical decision-making or medication dosing.
- Unreviewed legal/compliance certification claims.
- Sending real messages to real patients during testing.
- Replacing the organization’s system of record.

## 2. Required audit evidence

Collect and version the following before scoring findings:

- Repository commit, runtime version, dependency lockfile, environment description, and database schema.
- Architecture/data-flow diagram showing patient data, provider APIs, queues, logs, and storage.
- Route, API, job, worker, webhook, template, and permission inventory.
- Test results, fixtures, synthetic accounts, seed instructions, and screenshots or recordings of critical flows.
- Delivery-provider configuration, webhook signing/verification behavior, retry policy, and outage runbook.
- Data-retention/deletion policy, consent model, privacy review, threat model, and incident response procedure.
- Accessibility test output, supported browsers/devices, localization assumptions, and content review sign-off.

Every claim must be labeled as verified by test, verified by live observation, inspected in source, documented assumption, or unresolved.

## 3. Audit workstreams

### A. Product and workflow audit

Trace these journeys with synthetic data:

1. Staff creates a reminder from an eligible appointment.
2. System selects the correct patient, destination, channel, language, time zone, and template.
3. Reminder is scheduled and appears in staff operations.
4. Provider accepts, delays, rejects, or fails delivery.
5. Patient confirms, reschedules, replies, opts out, or takes no action.
6. Appointment is canceled or changed before each reminder is sent.
7. Staff pauses, edits, retries, or cancels a reminder.
8. An urgent or repeated failure reaches the correct operational owner.

For each journey record actor, preconditions, visible state, API/job transitions, audit events, expected result, actual result, and evidence link.

### B. Privacy, authorization, and data-flow audit

- Confirm server-side authorization for every read, create, update, cancel, export, retry, and preference action.
- Test cross-tenant, cross-practice, cross-location, cross-patient, and unauthorized-staff access using isolated actors.
- Confirm the browser cannot choose recipient identity, tenant, actor, consent state, audit metadata, or delivery status.
- Verify minimum-necessary message content and that sensitive details are not exposed in previews, notifications, URLs, analytics, queue payloads, or logs.
- Verify opt-out scope, emergency/transactional distinctions, channel consent, consent timestamps, source, revocation, and suppression behavior.
- Verify deletion and retention behavior across primary records, backups, queues, provider systems, exports, logs, and analytics.
- Confirm audit records capture actor, subject, tenant/site, action, timestamp, outcome, reason, correlation ID, and before/after state where appropriate.

### C. Scheduling and delivery reliability audit

- Test daylight-saving transitions, UTC/local conversion, patient and clinic time zones, quiet hours, invalid times, and clock skew.
- Test duplicate event ingestion, repeated webhooks, retries, worker restarts, queue redelivery, provider timeouts, and partial failures.
- Confirm idempotency keys prevent duplicate messages and that a canceled reminder cannot be sent by a stale worker.
- Verify delivery states are distinct: scheduled, queued, accepted, sent, delivered, failed, expired, canceled, suppressed, and unknown.
- Test provider rate limits, outage mode, backoff, dead-letter handling, manual replay, and replay authorization.
- Confirm message ordering and deduplication for reminders triggered by appointment changes.
- Verify the pilot cadence defaults at T-72 hours, T-24 hours, T-2 hours, and T+30 minutes after `no_show`, including time-zone/DST calculation, quiet-hour suppression, channel fallback authorization, source-event changes, and duplicate prevention.
- Verify that SMS replies or portal actions create only authorized confirmation, cancellation, rescheduling, or help requests and cannot bypass the authoritative appointment service.
- Verify any risk-based escalation rule is approved, explainable, assigned to the correct staff owner, and limited to an operational task rather than an automatic appointment mutation.

### D. UX, content, and accessibility audit

- Inspect hierarchy, status language, action labels, confirmation feedback, cancellation visibility, and error recovery.
- Test keyboard-only navigation, focus order, focus restoration after dialogs, screen-reader names, live status announcements, contrast, zoom, reduced motion, and touch targets.
- Verify content is concise, plain-language, translated safely, and does not imply clinical advice or guaranteed delivery.
- Test narrow layouts, long names, long translations, missing contact details, multiple appointments, and high-volume staff views.
- Confirm patients can understand what will happen, when, through which channel, and how to stop future messages.

### E. Operations and observability audit

- Verify dashboards distinguish scheduled volume, provider acceptance, delivery, failures, suppression, opt-outs, and patient confirmations.
- Confirm alerts are actionable, deduplicated, tenant-safe, and linked to a runbook.
- Test correlation IDs from user action through API, queue, provider webhook, audit event, and notification.
- Verify logs redact message bodies, phone numbers, email addresses, tokens, and unnecessary patient identifiers.
- Confirm staff can investigate a failure without gaining broader patient access.

## 4. Test matrix

Create a matrix across roles (patient, care staff, scheduler, supervisor, auditor, administrator, unauthenticated), scopes (tenant, practice, site, patient), channels (SMS/email/portal), states (scheduled/sent/failed/canceled/opted-out), and viewport sizes (desktop, tablet, narrow mobile).

Minimum negative cases:

- Wrong patient or wrong destination supplied by the client.
- Expired or revoked consent.
- Appointment moved across quiet hours or time zones.
- Cancellation racing with queue execution.
- Duplicate create request and duplicate provider webhook.
- Provider outage, malformed webhook, invalid template, missing contact method, and unsupported locale.
- Unauthorized direct API mutation despite hidden or disabled UI controls.
- Cross-tenant ID substitution and guessed reminder IDs.

## 5. Severity and release gates

- P0: wrong-recipient send, cross-tenant exposure, bypassed opt-out, unauthorized mutation, unbounded sensitive logging, or inability to stop sends. Block all release.
- P1: duplicate sends, broken cancellation race, incorrect time zone, missing audit trail, inaccessible critical action, or silent delivery failure. Block pilot until fixed or formally accepted.
- P2: confusing copy, incomplete filtering, weak diagnostics, or non-critical layout issue. Track with owner and deadline.
- P3: polish or future enhancement. Does not block pilot unless it affects comprehension or accessibility.

Pilot approval requires zero open P0/P1 findings, passing role and isolation tests, evidence for cancellation and opt-out, provider failure recovery, accessibility review of critical paths, redacted logs, rollback/runbook readiness, and explicit compliance/privacy sign-off.

## 6. Audit outputs

- Executive readiness summary.
- Findings register with severity, evidence, affected path, root cause, owner, remediation, and retest criteria.
- Role/scope denial matrix.
- Reminder state-transition and delivery sequence diagrams.
- Data inventory and retention/deletion map.
- Accessibility and responsive-UX report with screenshots.
- Test evidence index and unresolved-assumptions register.
- Pilot go/no-go decision and post-pilot monitoring plan.

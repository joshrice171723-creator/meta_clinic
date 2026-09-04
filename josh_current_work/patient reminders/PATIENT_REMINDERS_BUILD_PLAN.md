# Patient Reminders Build Plan

## Related planning documents

- [Capability roadmap](ROADMAP.md)
- [Patient reminders audit plan](PATIENT_REMINDERS_AUDIT_PLAN.md)
- [Shared roadmap index](../ROADMAP_INDEX.md)
- Cross-capability dependency: [Staff Messaging](../staff%20messaging/ROADMAP.md) receives authorized operational tasks for delivery failures and unresolved responses; use opaque IDs and typed events rather than direct table access.

Status: planning artifact only. No production code is added by this plan.

## 1. Scope, assumptions, and non-goals

### Goal

Deliver a durable reminder capability for an existing healthcare application. A reminder may tell a patient that an appointment is coming up, what preparation is required, that a follow-up action is due, or that a medication-related task is due. It must improve recall without becoming a clinical recommendation engine or an emergency channel.

### Assumptions to validate in Phase 0

- The larger app has authenticated Patient, Staff, and organization/tenant identities, an appointment or care-event source, and an existing audit/security event mechanism.
- A provider adapter or communication vendor will be selected and reviewed for data processing, security safeguards, availability, delivery receipts, and contractual requirements.
- Reminder content may be PHI. The organization’s privacy officer and counsel will determine applicable HIPAA, state, TCPA, accessibility, language, retention, and consent obligations.
- The initial deployment is one organization/tenant with one primary locale and IANA time-zone support; multi-region and multi-tenant isolation must still be designed rather than assumed.

### Non-goals

- Emergency, crisis, urgent clinical escalation, or guaranteed real-time contact.
- Medication prescribing, dose changes, adherence diagnosis, or clinical decision support.
- Marketing and promotional messaging in the same preference bucket as treatment/operational reminders.
- Automatically contacting an unverified caregiver, family member, or alternate number.
- Automatic final appointment cancellation or rescheduling without an explicit patient/staff action and the source system’s authorization.

## 2. Proposed integration shape and file map

These are proposed paths in the larger application, not files to create in this roadmap folder.

    apps/web/src/features/patient-reminders/
      components/ReminderList.tsx
      components/ReminderDetail.tsx
      components/ReminderPreferenceForm.tsx
      components/ReminderActionPanel.tsx
      components/StaffReminderEditor.tsx
      components/DeliveryTimeline.tsx
      hooks/useReminders.ts
      hooks/useReminderPreferences.ts
      lib/reminder-copy.ts
      lib/reminder-validation.ts
      routes/patient-reminders.tsx
      routes/staff-reminders.tsx

    services/reminders/src/
      domain/reminder.ts
      domain/reminder-state-machine.ts
      domain/policy-decision.ts
      domain/content-safety.ts
      domain/schedule-calculator.ts
      application/create-reminder.ts
      application/reconcile-source-event.ts
      application/process-reminder.ts
      application/record-patient-action.ts
      application/process-opt-out.ts
      workers/reminder-dispatch-worker.ts
      workers/provider-callback-worker.ts
      adapters/notification-provider.ts
      adapters/portal-adapter.ts
      adapters/sms-adapter.ts
      adapters/email-adapter.ts
      repositories/reminder-repository.ts
      repositories/preference-repository.ts
      repositories/audit-repository.ts
      api/reminder-routes.ts
      api/provider-callback-routes.ts
      api/preference-routes.ts
      observability/reminder-metrics.ts
      config/reminder-policy.ts

    packages/contracts/src/reminders/
      reminder.schema.ts
      reminder-events.schema.ts
      provider-callback.schema.ts
      preferences.schema.ts

    db/migrations/
      YYYYMMDDHHMM_create_patient_reminders.sql
      YYYYMMDDHHMM_create_reminder_delivery_attempts.sql
      YYYYMMDDHHMM_create_reminder_preferences.sql
      YYYYMMDDHHMM_create_reminder_audit_events.sql

    docs/operations/
      patient-reminders-runbook.md
      patient-reminders-privacy-review.md
      patient-reminders-vendor-review.md

The reminder service owns scheduling, policy evaluation, dispatch, provider callbacks, and lifecycle state. The source appointment/care-event service owns the clinical/operational event and publishes changes. The patient/staff web app owns presentation and authorized actions, never direct reminder-state mutation. A queue/outbox is the reliability boundary between transaction commit and provider delivery.

## 3. Domain model and invariants

### Core records

patient_reminders: id, tenant_id, patient_id, source_type, source_id, category, purpose, template_id, safe_content_version, recipient_endpoint_id, channel, scheduled_at_utc, iana_timezone, local_schedule_label, status, priority, dedupe_key, expires_at, cancelled_at, cancel_reason_code, created_by, updated_by, timestamps, and optimistic version.

communication_endpoints: patient-scoped endpoint with type (phone, email, portal), normalized value or encrypted value reference, verification status/time, preferred display label, invalidated time/reason, and last-reviewed time. Store a keyed hash for lookup/deduplication where possible; restrict raw contact values.

communication_preferences: patient/tenant scope, category, channel, allowed|blocked|not_set, quiet-hours window, time zone, locale, effective time, source, and version. A more restrictive patient preference must win over a default. Operational treatment reminders and marketing must never share a boolean.

communication_consents: category, channel, legal/policy basis, consent status, captured-at, captured-by/source, disclosure/version shown, evidence reference, revoked-at, and reason. Do not infer consent from a phone number alone. STOP/equivalent channel revocation creates an immutable revocation event and updates the effective block.

reminder_templates: purpose, locale, channel, version, approved status, safe-content classification, body/subject stored in controlled template storage, variables allowlist, max length, accessibility/copy review metadata, and retired-at. Templates are immutable once used; edits create a version.

reminder_delivery_attempts: reminder ID, attempt number, provider, provider message ID, idempotency key, queued/sent/accepted/delivered timestamps, normalized failure class, retryable flag, callback evidence reference, and masked destination. Provider status is not equated with patient open/read.

reminder_audit_events: actor type/id, tenant, action, object ID, reason code, policy decision summary, correlation ID, timestamp, and before/after field allowlist. Never store raw message body, access tokens, full phone/email, or unbounded free text.

### State machine

draft → scheduled → queued → sending → provider_accepted → delivered|delivery_unknown|failed; any pre-send state may become paused or cancelled; a delivered reminder may become actioned or expired. Provider callback updates must be monotonic by provider event timestamp/sequence when available. delivery_unknown is distinct from failed and must not trigger unlimited retry.

Invariants: one active reminder per dedupe key and intended occurrence; no send after cancellation, opt-out, endpoint invalidation, or expiry; only an authorized transition may change state; every retry has a bounded attempt count and backoff; a callback is idempotent.

## 4. API and service responsibilities

### Internal/source APIs

- POST /internal/reminders: create from a validated source event; require tenant, patient, purpose, occurrence, recipient endpoint, and dedupe key.
- POST /internal/reminders/reconcile-source-event: upsert/cancel/reschedule reminders when an appointment or care event changes. Use event ID/version for idempotency.
- POST /internal/reminders/{id}/cancel and /pause: require actor, reason code, and expected version.
- POST /internal/reminders/{id}/retry: staff-only, only for retryable failure or unknown outcome, with rate limit and reason.

### Patient APIs

- GET /me/reminders?status=active|history returns only the authenticated patient’s redacted reminder view.
- POST /me/reminders/{id}/actions accepts confirm, request_reschedule, request_help, or dismiss; server rechecks ownership, current state, and expiry.
- GET/PATCH /me/communication-preferences returns and updates permitted category/channel preferences, quiet hours, time zone, locale, and endpoint verification state.
- POST /public/communications/{opaque-token}/opt-out supports a short-lived, single-purpose link without exposing patient identity; rate limit and avoid account enumeration.

### Provider APIs

- POST /webhooks/notifications/{provider} verifies signature, provider account, timestamp/replay window, and event schema before enqueueing a callback job.
- Provider adapters expose send(message, idempotencyKey), cancel where supported, and normalized status/failure categories. No adapter may receive a payload unless policy evaluation has approved its channel and content.

All mutating APIs use authorization, tenant scoping, CSRF protection where applicable, request validation, idempotency keys, optimistic concurrency, structured errors, and correlation IDs. Return generic responses for unauthorized/not-found cases where enumeration is a risk.

## 5. End-to-end flows

### Appointment reminder

1. Appointment service commits a versioned event with patient, appointment, location, scheduled instant, and time zone.
2. Outbox publisher emits appointment.created, appointment.changed, or appointment.cancelled.
3. Reminder service validates patient/endpoint linkage, calculates local send times with DST rules, derives a stable dedupe key, and evaluates policy.
4. Approved reminder is committed with an outbox record in the same transaction; a worker claims it with a lease.
5. Worker rechecks cancellation, preference, endpoint verification, quiet hours, expiry, and current source version immediately before provider call.
6. Adapter sends the minimum safe content, records provider acceptance, and never treats acceptance as delivery or read.
7. Verified callback updates delivery status. A patient action is authorized and recorded, then routed to the source appointment service for confirmation or reschedule request.
8. Appointment cancellation or reschedule reconciles all future reminders, with audit events and no stale send.

#### Pilot cadence and escalation defaults

The first appointment-reminder pilot may use this configurable default sequence after Phase 0 approval:

| Timing | Preferred channel | Objective | Programmatic action |
| --- | --- | --- | --- |
| T-72 hours | SMS or portal | Confirmation or early cancellation request | Send one approved, minimum-content reminder with patient action options. |
| T-24 hours | Portal, email, or SMS | Logistics and preparation | Provide approved preparation and check-in details, with a portal link when more detail is required; use an authorized fallback only when policy permits. |
| T-2 hours | SMS or portal | Short arrival nudge | Send the approved time/location reminder. Include directions only if explicitly enabled, safe for the channel, and useful to the patient. |
| T+30 minutes after `no_show` | Staff task, optionally SMS or portal | Recovery and rescheduling | Create an authorized rescheduling task or request. Do not automatically cancel, reschedule, or imply clinical urgency. |

These are operational defaults, not hard-coded timing or channel requirements. The scheduler must apply IANA time-zone/DST rules, quiet hours, consent and preference precedence, endpoint verification, expiry, source-event version checks, and deduplication at every step. A reply such as `1` or `2` may create an authenticated action request, but cannot directly change appointment status unless the authoritative appointment service accepts that transition. A high-risk missed-appointment pattern may create a staff work-queue task only when the organization has approved the rule, owner, reason, and patient-impact review.

### Preparation/follow-up reminder

Use a source task with explicit due time, owner, and completion semantics. The message says what action is due and where to complete it; it does not include more clinical detail than necessary. Completion or source-task cancellation atomically prevents future reminders. Escalation, if approved, goes to an authorized staff work queue, not an unapproved family member.

### Opt-out

1. Inbound STOP, QUIT, END, REVOKE, CANCEL, UNSUBSCRIBE, or a reasonable equivalent is normalized and authenticated to the provider endpoint.
2. The system records the inbound request as evidence, creates a revocation event, and blocks future eligible sends immediately.
3. Send one minimal confirmation if permitted by policy; never send another reminder in the blocked category. Provide a safe re-enable path through authenticated preferences or an approved keyword flow.
4. Staff sees the effective blocked state and reason, but cannot silently override patient revocation.

### Failure and recovery

Transient provider/network failures retry with exponential backoff and jitter under a deadline. Permanent failures invalidate the endpoint only after a defined provider code or repeated verified bounce; staff receives a task to verify contact details. Provider outage trips a circuit breaker, preserves queued work, and exposes a support status. A reconciliation job finds stuck leases, missing callbacks, duplicate provider IDs, and source-event drift.

## 6. Patient and staff UI responsibilities

Patient screens: active reminders, date/time with time zone, purpose, safe preview, status, action affordances, preference controls, endpoint verification, and accessible help. Do not show staff-only delivery diagnostics or another recipient’s endpoint. Confirm is reversible where possible; reschedule is a request unless the source system authorizes direct change.

Staff screens: filters by status/purpose/date/failure class, masked recipient, source reference, policy decision summary, delivery timeline, edit/pause/cancel/retry actions, and reason capture. Separate operational reminder management from marketing campaigns. Show a clear “not an emergency channel” label and escalation instructions.

Accessibility requirements: keyboard-complete flows, visible focus, labels and instructions, text error identification and suggestions, announced status changes, adequate target size, no color-only status, no forced short timeout, accessible authentication, responsive narrow layout, localization-ready dates/numbers, and screen-reader-friendly timelines. Test against WCAG 2.2 AA criteria relevant to the implemented surface.

Copy rules: plain language, one action per message, sender identity and callback/help route, no diagnosis or medication detail in lock-screen/SMS/voicemail by default, no surprise links, short link domains under organizational control, and explicit opt-out instructions where required. Templates require clinical/privacy/copy approval and variable allowlisting.

## 7. Security, privacy, and compliance controls

- Perform a documented risk assessment and threat model for wrong-recipient disclosure, account takeover, endpoint reuse, webhook spoofing/replay, template injection, insider misuse, queue poisoning, provider compromise, and denial of service.
- Enforce tenant isolation, object-level authorization, least privilege, staff role separation, MFA for privileged access, service identity rotation, secrets manager storage, TLS in transit, encrypted restricted storage, and key rotation.
- Verify phone/email ownership before enabling a channel. Re-verify after endpoint change, long inactivity, or detected reassignment risk. Do not send to a newly entered endpoint until policy allows it.
- Minimize PHI in channel payloads, provider logs, analytics, URLs, and notifications. Use opaque, short-lived, single-purpose links; require authentication or step-up verification before sensitive detail.
- Capture consent and preference provenance, versioned disclosure text, effective timestamps, and revocations. Do not use treatment-reminder permission for marketing. Honor reasonable confidential-communication requests and alternative channels.
- Apply retention schedules to reminders, delivery metadata, inbound opt-out evidence, audit events, provider logs, and exports. Define deletion/legal-hold behavior and vendor deletion/return obligations.
- Review vendor security posture and contracts, including required safeguards/BAA where applicable, data residency, subprocessor list, breach notification, incident support, retention, callback authenticity, and service availability.
- Security tests cover IDOR/tenant escape, authz bypass, replayed callbacks, forged opt-outs, SSRF/link abuse, injection through template variables, rate-limit bypass, secret leakage, log redaction, and backup/restore access.

This plan is not legal advice. HHS states appointment reminders are treatment communications that do not require authorization, while also requiring reasonable safeguards and limiting disclosed information; the organization must still validate its specific legal and contractual context.

## 8. Observability and operations

Emit structured metrics by tenant, purpose, channel, provider, locale, and failure class without raw PHI: eligible/blocked counts, queue age, schedule lag, send acceptance, delivery, unknown, permanent/transient failure, retry count, duplicate suppression, cancellation race, opt-out latency, endpoint verification, patient action, and staff override attempts.

Trace each reminder with a correlation ID from source event through outbox, worker, provider message ID, callback, and patient action. Store an immutable, access-controlled audit trail. Redact message bodies, tokens, full endpoints, and clinical details from application and error logs.

Alert on queue age/SLO breach, sudden volume or failure-rate change, callback verification failures, duplicate sends, wrong-recipient indicators, opt-out processing latency, stuck leases, provider circuit open, and audit/log pipeline failure. Build dashboards for operations, privacy/security, and product outcomes with different access levels.

Runbooks must cover provider outage, compromised credential, suspected wrong recipient, mass opt-out, duplicate send, stale appointment event, callback replay, endpoint reassignment, data subject request, and rollback. Include who can pause a tenant/channel and how to preserve evidence.

## 9. Testing and acceptance evidence

Use one focused test layer per boundary plus a runtime smoke check; expand only for release-critical or high-risk paths.

- Domain tests: state transitions, policy precedence, dedupe, content classification, time zones, DST gaps/overlaps, quiet hours, expiry, retry schedule, and cancellation.
- API/contract tests: authz, tenant scoping, schemas, idempotency, optimistic concurrency, provider callback signatures/replay, and source-event version reconciliation.
- Security/privacy tests: wrong patient/endpoint, unverified endpoint, forged opt-out, sensitive-content leakage, log redaction, rate limits, link expiry, and staff role matrix.
- Accessibility tests: keyboard and screen reader smoke paths, focus/status announcements, validation, contrast/target size, responsive layout, localization, and no-color-only status.
- Reliability tests: provider timeout, 429/5xx, duplicate worker claim, delayed/out-of-order callbacks, queue restart, database failover, poison message quarantine, and reconciliation repair.
- End-to-end staging evidence: patient/staff path capture, provider callback fixture, redacted event/audit samples, metrics/alert firing, and rollback rehearsal.

Acceptance requires zero known wrong-recipient or unauthorized-send paths, dedupe proof under repeated events, immediate policy blocking before provider call, verified callback handling, documented unresolved delivery uncertainty, accessibility sign-off, and privacy/security/vendor approval.

## 10. Rollout, migration, and fit with the larger app

Introduce schema and code behind feature flags: reminders.read, reminders.staff-management, reminders.portal, then each external channel. Backfill only verified endpoints and active future source events; do not manufacture historical consent. Run shadow policy evaluation without sending to compare eligibility and dedupe outcomes.

Pilot one tenant/purpose/channel with a hard volume cap, kill switch, on-call owner, support macros, and daily review. Expand only after the pilot meets agreed SLOs and safety thresholds. Roll back by disabling dispatch while retaining audit and source-event reconciliation; queued records remain inspectable and can be cancelled safely. Keep schema backward-compatible until all workers and adapters are upgraded.

Integration ownership:

- Appointment/care-event module: authoritative source event and version; receives patient confirmation/reschedule requests.
- Identity/patient module: patient access, tenant scope, endpoint verification, and account recovery.
- Staff/admin module: roles, authorization, support workflow, and audit access.
- Notification infrastructure: queue, provider adapters, callbacks, secrets, delivery SLOs, and circuit breaker.
- Compliance/security: risk assessment, privacy review, vendor/BAA review, retention, incident response, and access review.
- Analytics: aggregate outcomes only, with no message-body or unnecessary PHI export.

## 11. Research basis and decisions informed by it

- [HHS appointment-reminder FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/286/are-appointment-reminders-allowed-under-hipaa-without-authorization/index.html) says appointment reminders are part of treatment and may be made without authorization; [HHS reasonable-safeguard guidance](https://www.hhs.gov/hipaa/for-professionals/faq/198/may-health-care-providers-leave-messages/index.html) recommends limiting voicemail/answering-machine detail and accommodating reasonable confidential-communication requests. This drives minimum-content templates, endpoint controls, and alternative-channel preferences.
- [NIST SP 800-66 Rev. 2](https://csrc.nist.gov/pubs/sp/800/66/r2/final) provides current practical guidance for implementing HIPAA Security Rule administrative, physical, and technical safeguards. This drives risk assessment, access control, audit controls, contingency/recovery, and transmission-security work.
- [HL7 FHIR CommunicationRequest](https://fhir.hl7.org/fhir/communicationrequest.html) models a communication request with subject/patient, recipient, medium, occurrence, priority, reason, and requester. This drives the separation of source request, recipient, channel, timing, and delivery outcome.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) covers keyboard operation, timing, input assistance, focus, target size, accessible authentication, and status messages. This drives the patient/staff UI acceptance criteria.
- [FCC TCPA materials](https://docs.fcc.gov/public/attachments/DA-24-1142A1.pdf) emphasize reasonable consent revocation mechanisms and prompt honoring of opt-out requests; the implementation must be reviewed against the exact applicable healthcare-message rules before launch. This drives keyword and non-keyword revocation handling, immediate blocking, evidence, and separate marketing controls.
- [GOV.UK Notify message-status guidance](https://www.notifications.service.gov.uk/using-notify/message-status/sms) distinguishes accepted/sent, delivering, delivered, not delivered, and technical failure, and warns that delivery does not mean opened/read. [Its terms](https://www.notifications.service.gov.uk/terms-of-use) also require appropriate consent, accurate data, secure API keys, and message-content standards. This drives normalized delivery states, provider evidence, retry classification, key handling, and truthful UI labels.
- [OWASP Logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) recommends masking sensitive data, protecting logs from unauthorized access/modification, sanitizing untrusted input, and retaining only what is needed. This drives the audit/log field allowlist and PHI redaction policy.

## 12. Open decisions before implementation

1. Which source system and event version are authoritative for appointments and care tasks?
2. Which channels and provider are in the first pilot, and what contractual safeguards/BAA apply?
3. What reminder categories are treatment/operational versus optional marketing, and what exact consent basis applies to each?
4. What are the organization’s time-zone, quiet-hour, language, retention, SLO, and escalation defaults?
5. Which patient actions are requests versus immediately authoritative updates to the source system?
6. Which clinical/privacy reviewers approve templates and exceptions, and who has the tenant/channel kill switch?

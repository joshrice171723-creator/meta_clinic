# Staff Messaging Build Plan

## Related planning documents

- [Capability roadmap](ROADMAP.md)
- [Staff messaging audit plan](STAFF_MESSAGING_AUDIT_PLAN.md)
- [Shared roadmap index](../ROADMAP_INDEX.md)
- Cross-capability dependencies: [Patient Reminders](../patient%20reminders/ROADMAP.md) may create authorized operational tasks for failed delivery or unresolved response; [AI Scribe](../ai%20scribe/ROADMAP.md) may create approved follow-up work, but neither capability may bypass staff-messaging authorization or state transitions.

Status: planning artifact only. No production code is included in this document.

This plan turns `ROADMAP.md` into an implementation-ready, bounded product slice for authenticated staff messaging in a multi-tenant healthcare application. It assumes the host application already owns identity, tenant/practice scope, CSRF/session security, persistence, and audit infrastructure. Proposed paths below are a concrete target layout, not a claim that those files already exist.

## 1. Product boundary and decisions

### In scope

- Secure one-to-one, team, and role-based conversations for staff operational coordination.
- Conversation membership, scoped discovery, replies, mentions, attachments, search, mute, read state, acknowledgement, assignment, handoff, escalation, and linked operational objects.
- A visible inbox organized by unread, urgent, assigned, and unresolved work.
- Durable audit events and operational telemetry.

### Explicitly out of scope for v1

- Patient-facing messaging, SMS, email, or consumer chat.
- Medication orders, clinical decision support, diagnosis, or replacing the EHR/clinical record.
- Automatic emergency response, 911 dispatch, or a promise that staff messaging is monitored continuously.
- Unrestricted exports, public links, message editing without history, disappearing messages, or client-selected tenant/actor/audit metadata.
- Generic push/email/SMS content containing patient identifiers or message bodies.

The composer must state: “For urgent clinical or safety emergencies, use the organization’s emergency procedure. Staff Messaging is not a substitute for emergency services.” Messages that belong in the official record must be copied or linked through the approved record workflow; linking does not silently write to the clinical record.

### Recommended message classes

1. **Routine** — normal coordination; no acknowledgement deadline.
2. **Time-sensitive** — response requested by a stated due time; escalation if unresolved.
3. **Urgent operational** — requires explicit acknowledgement; short response target configured by the organization.
4. **Safety-critical** — only available to approved roles and workflows; requires an explicit recipient, acknowledgement deadline, backup/escalation path, and visible instruction to use the emergency procedure when applicable.

The sender must choose a recipient or accountable team, a response target for non-routine classes, and (where applicable) a structured request. “Urgent” is never inferred from punctuation, keywords, or a read event.

## 2. Proposed product architecture and file map

Use the host application’s established framework and naming conventions if they differ. The following is the proposed ownership map.

### Backend/domain

- `apps/api/db/migrations/*_create_staff_messaging_tables.sql` — conversations, memberships, messages, message receipts, requests, escalations, attachments, notification preferences, and indexes.
- `apps/api/src/modules/staff-messaging/domain/staff-message.ts` — message value objects, class/state enums, immutable body/version rules.
- `apps/api/src/modules/staff-messaging/domain/conversation.ts` — membership and conversation invariants.
- `apps/api/src/modules/staff-messaging/repositories/staff-messaging-repository.ts` — tenant-scoped reads/writes; no browser actor or tenant input accepted as authority.
- `apps/api/src/modules/staff-messaging/services/send-staff-message.ts` — authorization, validation, idempotency, message creation, outbox event.
- `apps/api/src/modules/staff-messaging/services/acknowledge-message.ts` — explicit acknowledgement and response state transition.
- `apps/api/src/modules/staff-messaging/services/escalate-message.ts` — deadline evaluation, deduplication, backup recipient selection, and audit event.
- `apps/api/src/modules/staff-messaging/services/search-staff-messages.ts` — scoped search with redaction and pagination.
- `apps/api/src/modules/staff-messaging/services/attachment-service.ts` — type/size validation, malware scanning, private object storage, authorization on download.
- `apps/api/src/modules/staff-messaging/workers/staff-messaging-outbox-worker.ts` — durable notification delivery and retry.
- `apps/api/src/modules/staff-messaging/workers/staff-messaging-escalation-worker.ts` — due-time processing with a durable lock.
- `apps/api/src/modules/staff-messaging/policies/staff-messaging-policy.ts` — action-specific permissions and conversation/object scope.
- `apps/api/src/modules/staff-messaging/audit/staff-messaging-audit-events.ts` — canonical event names and safe metadata schema.
- `apps/api/src/routes/staff-messaging.ts` — HTTP handlers only; delegates to services and derives actor from the authenticated session.
- `apps/api/src/routes/notification-preferences.ts` — in-app/browser preference management, subject to urgent-channel policy.

### Frontend

- `apps/web/src/features/staff-messaging/StaffMessagingPage.tsx` — page shell and route boundary.
- `apps/web/src/features/staff-messaging/ConversationList.tsx` — inbox filters, unread counts, urgent/unresolved indicators.
- `apps/web/src/features/staff-messaging/ConversationView.tsx` — message timeline, date grouping, loading/error/empty states.
- `apps/web/src/features/staff-messaging/MessageComposer.tsx` — class, recipient, due time, structured request, attachment, and confirmation UX.
- `apps/web/src/features/staff-messaging/MessageCard.tsx` — author, timestamp, status, acknowledgement, edit/history indicator, and safe linked-object summary.
- `apps/web/src/features/staff-messaging/UrgencyAndEscalationDialog.tsx` — explicit warning, response target, backup path, and confirmation.
- `apps/web/src/features/staff-messaging/InboxFilters.tsx` — accessible filter controls and saved preference.
- `apps/web/src/features/staff-messaging/NotificationCenter.tsx` — in-product notification list and read/unread state.
- `apps/web/src/features/staff-messaging/staffMessagingApi.ts` — typed API client; never constructs authority fields.
- `apps/web/src/features/staff-messaging/staffMessaging.types.ts` — API/UI types and state machines.
- `apps/web/src/features/staff-messaging/staffMessaging.accessibility.test.tsx` — keyboard, focus, live-region, contrast, and reduced-motion checks.
- `apps/web/src/routes/staff-messaging.tsx` — authenticated route and capability gate.

### Shared operations and documentation

- `apps/api/src/platform/outbox/outbox-repository.ts` — reuse the host outbox if present; do not create a second delivery ledger.
- `apps/api/src/platform/audit/audit-writer.ts` — append-only audit writer with protected access.
- `apps/api/src/platform/authorization/authorize.ts` — reuse the application authorization authority.
- `docs/staff-messaging/COMMUNICATION_POLICY.md` — approved use, prohibited content, response targets, emergency procedure, retention owner.
- `docs/staff-messaging/ADMIN_RUNBOOK.md` — membership changes, escalation coverage, failed delivery, legal hold, export, incident response.
- `docs/staff-messaging/DATA_RETENTION_DECISION.md` — approved schedule by message class and organization/record obligations.
- `tests/contract/staff-messaging.openapi.test.ts` — schema and error contract.
- `tests/integration/staff-messaging-isolation.test.ts` — tenant/site/role isolation and direct-request denial.
- `tests/e2e/staff-messaging-critical-flows.spec.ts` — browser journeys with synthetic staff and synthetic records.

## 3. Data model

Every row is tenant-scoped, has server-generated identifiers and timestamps, and has an explicit deletion/retention policy. Foreign keys and uniqueness constraints are required.

### `staff_conversations`

`id`, `tenant_id`, `site_id` nullable, `kind` (`direct|team|role`), `title` nullable, `status` (`active|archived|locked`), `created_by`, `created_at`, `archived_at`, `retention_class`, `last_message_at`.

### `staff_conversation_members`

`conversation_id`, `user_id` or `role_group_id`, `membership_state`, `joined_at`, `removed_at`, `removed_by`, `notification_policy`, `last_read_message_id`, `last_read_at`. Membership removal revokes future reads while preserving required audit/retention records.

### `staff_messages`

`id`, `tenant_id`, `conversation_id`, `sender_id`, `body_ciphertext` (or host-approved protected field), `body_version`, `message_class`, `status` (`active|retracted|expired`), `created_at`, `updated_at`, `retracted_at`, `retracted_by`, `client_idempotency_key`, `reply_to_message_id`, `linked_object_type`, `linked_object_id`, `requested_action`, `response_due_at`, `acknowledgement_required`, `acknowledged_at`, `acknowledged_by`.

Do not store raw message bodies in logs, analytics, notification payloads, URLs, or search indexes unless the approved threat model explicitly permits it. If full-text search is required, use a protected tenant-partitioned index with authorization filtering and documented deletion propagation.

### `staff_message_receipts`

`message_id`, `recipient_id`, `delivered_at`, `presented_at`, `read_at`, `acknowledged_at`, `acknowledgement_note` nullable. A read receipt is evidence of presentation, not acknowledgement or understanding.

### `staff_message_requests`

`id`, `message_id`, `assignee_id` or `assignee_group_id`, `state` (`open|acknowledged|in_progress|resolved|declined|expired`), `due_at`, `resolved_at`, `resolution_code`, `resolution_note`, `created_at`, `updated_at`. Preserve all state transitions as audit events.

### `staff_message_escalations`

`id`, `message_id` or `request_id`, `level`, `trigger`, `triggered_at`, `target_id`, `delivery_attempt_id`, `state`, `resolved_at`, `dedupe_key`. Escalation is idempotent and must not fan out indefinitely.

### `staff_message_attachments`

`id`, `message_id`, private storage key, content type, byte size, checksum, scan state, created_by, expires_at, deletion state. Never serve by guessable storage URL.

### `staff_notification_preferences`

Per user/tenant/channel/category preferences for in-app, browser push, and approved email/SMS channels. The organization can prohibit disabling required urgent delivery; the UI must explain that policy.

### `staff_messaging_audit_events`

Prefer the host’s audit store. Required fields: event type, occurred time, tenant, actor, target/object IDs, source/request ID, outcome, permission/capability evaluated, reason where applicable, and before/after state summary. Keep message content out of the audit record unless a separately approved, protected requirement exists.

## 4. API contract and service responsibilities

All routes require an authenticated session, CSRF protection for cookie-authenticated mutations, tenant/site scope derived server-side, authorization before object disclosure, bounded pagination, and an idempotency key for create/send/escalate mutations.

### Routes

- `GET /api/staff-messaging/conversations?filter=&cursor=` — list only conversations visible to the actor; return counts and safe previews.
- `POST /api/staff-messaging/conversations` — create direct/team/role conversation; validate all members against current scope.
- `GET /api/staff-messaging/conversations/:id` — return metadata and membership-safe message page.
- `POST /api/staff-messaging/conversations/:id/messages` — send; server validates class, recipient, attachment, linked object, due time, and policy.
- `POST /api/staff-messaging/messages/:id/acknowledge` — explicit acknowledge; optional structured response.
- `POST /api/staff-messaging/messages/:id/requests` — assign/request work; only permitted roles.
- `POST /api/staff-messaging/requests/:id/transition` — transition with allowed state machine and reason.
- `POST /api/staff-messaging/messages/:id/retract` — retract only under policy; never erase required records.
- `GET /api/staff-messaging/search?q=&cursor=` — tenant-scoped, permission-filtered, rate-limited search.
- `POST /api/staff-messaging/attachments/presign` and `POST /api/staff-messaging/attachments/:id/complete` — private upload with scan gate.
- `GET /api/staff-messaging/notifications?cursor=` and `POST /api/staff-messaging/notifications/:id/read` — in-app notification state.
- `GET/PATCH /api/notification-preferences` — preference changes with policy validation.

Use consistent errors: `401` unauthenticated, `403` unauthorized or out of scope, `404` for non-disclosive not-found behavior where appropriate, `409` stale state/idempotency conflict, `422` validation, `429` rate limit, and `503` delivery dependency unavailable. Avoid confirming whether an out-of-scope conversation exists.

## 5. End-to-end flows

### Routine message

1. Staff opens the authenticated messaging route; capability and tenant/site scope are projected by the server.
2. User selects an allowed person/team/role group; the UI shows membership and privacy boundary before sending.
3. User enters body or structured request, optionally links an authorized operational object, and sends.
4. Server validates authorization and policy, writes the message and audit event transactionally, then writes an outbox event.
5. Worker delivers an in-app notification; retries are bounded and visible as delivery state, not silently dropped.
6. Recipient opens the conversation; `presented_at`/`read_at` update. If a request exists, recipient chooses acknowledge, in progress, resolve, or decline.

### Urgent message

1. User selects Urgent or Safety-critical and must choose accountable recipient/team, response target, backup path, and requested action.
2. UI presents the emergency-procedure warning and asks for final confirmation.
3. Server rejects missing accountable recipient, expired/invalid due time, unsupported role, or absent escalation policy.
4. Message is delivered through approved in-app and configured urgent channels. Payloads contain “New urgent staff message” plus a safe deep link, never patient/message content.
5. Read does not close the loop. Recipient explicitly acknowledges; sender sees actor/time and may request clarification.
6. At due time, the escalation worker obtains a distributed lock, creates one escalation per level, notifies the configured backup, and audits the transition.
7. Escalation stops only on acknowledgement/resolution or an administrator-approved closure. If delivery fails, notify the operational owner and show the failure in the inbox.

### Handoff

Use a structured handoff form with Situation, Background, Assessment/known facts, Safety concern, Action requested, Timing, Ownership, and Next check-in. Require recipient acceptance and allow questions/clarification. Keep the handoff in Staff Messaging until an authorized workflow records it in the official system of record.

### Membership removal and access change

On role/site/tenant change, invalidate cached authorization, stop future notification delivery, revoke attachment access, and preserve prior audit history according to retention. A removed user must not regain access through a stale conversation URL or search index.

## 6. Security and privacy controls

- Derive actor, tenant, site, role, and capability from the authenticated server context. Ignore browser-supplied equivalents.
- Use least-privilege, action-specific permissions such as `staff_messaging.read`, `.send`, `.create_conversation`, `.acknowledge`, `.assign`, `.escalate`, `.retract`, `.attach`, `.search`, `.audit_read`, and `.admin`.
- Enforce both role and relationship scope: tenant, site/team, conversation membership, linked-object authorization, and active employment/membership status.
- Require MFA/session policy from the host application for privileged/admin actions; apply re-authentication where the host policy requires it.
- Encrypt in transit and at rest using host-approved key management; document key rotation, backup, deletion, and recovery. Do not claim HIPAA compliance from these plans or tests alone.
- Prevent content leakage through logs, traces, analytics, browser titles, notification previews, referrer URLs, exports, backups, search suggestions, and error messages.
- Apply attachment allowlists, size limits, malware scanning, content-disposition download, checksum validation, quarantine, and authorization at every download.
- Rate-limit sends, searches, attachment presigns, and failed acknowledgements; detect abusive broadcast behavior.
- Protect audit data from ordinary messaging admins; separate audit administration from the users being audited where feasible.
- Support organization-defined emergency access (“break glass”) only if the host has an approved policy: reason required, time limited, heightened audit, notification to privacy/security owner, and no silent bypass.
- Validate redaction in generic external notifications and support remote session/device termination via the host identity system.

## 7. Notification and accessibility UX

- In-app inbox is the source of truth for message state. Browser/email/SMS are delivery channels, not records.
- Separate “new,” “read,” “acknowledged,” “in progress,” “resolved,” and “escalated” labels; do not use a single checkmark for all states.
- Default routine notifications to batched or quiet-hours-aware delivery. Urgent policy may override quiet hours only when the organization has explicitly configured it.
- Let users mute routine conversations, but show when policy prevents muting urgent/safety-critical messages.
- Use clear timestamps and timezone, response target, accountable owner, escalation level, and delivery failure state.
- Keep notification copy short and content-free outside the app; deep links must require authentication and land on the authorized message.
- Meet WCAG 2.2 AA intent: semantic controls, visible focus, keyboard-only operation, sufficient contrast, no color-only urgency, labels for icons, predictable focus in dialogs, and accessible error recovery.
- Announce new messages and send/delivery results through non-focus-stealing `status`/live-region patterns; do not move focus unexpectedly. Provide a user-controlled reduced-motion and notification preference.
- Provide an accessible alternative to visual urgency: text labels, icon plus text, screen-reader announcement, and persistent unresolved state. Do not rely on sound, flashing, or vibration alone.
- On narrow screens, keep composer actions reachable, allow zoom/reflow, make attachment/error states operable, and preserve draft recovery without persisting sensitive drafts longer than policy permits.

## 8. Retention, governance, and observability

### Retention

Do not invent one universal retention period. The organization/privacy owner must approve retention by message class, legal/clinical-record relationship, contract, litigation hold, and jurisdiction. Implement policy-versioned retention jobs, legal hold suppression, deletion receipts, and documented backup expiry. Keep audit retention separate from message-body retention. HHS guidance requires appropriate safeguards and audit controls; it does not by itself define the application’s operational message-retention schedule.

### Audit events

At minimum: conversation created/archived/locked; membership added/removed; message send/edit/retract; attachment upload/download/quarantine; delivery/read/acknowledge; request assignment/state changes; escalation created/delivered/failed/resolved; search/export; preference/policy changes; authorization denials; break-glass use; retention deletion/hold changes; worker and audit-pipeline failures.

### Metrics and alerts

Track counts and latency, never message content: send success/failure, queue age, delivery attempts, notification channel success, read-to-acknowledge latency by class, overdue/open escalations, assignment resolution time, authorization denials, attachment scan failures, search latency, audit write failures, retention job lag, and outbox depth. Alert on audit pipeline failure, repeated urgent delivery failure, escalation worker stall, cross-tenant authorization-test failure, and retention backlog.

Use correlation/request IDs and synthetic tenant/user IDs in logs. Redact query strings, bodies, tokens, attachment names if sensitive, and notification content. Document who reviews alerts and how incidents are preserved without exposing message content broadly.

## 9. Testing and acceptance gates

### Focused automated checks

- Authorization matrix across tenant, site, role, direct member, team member, removed member, admin, and break-glass states; assert direct API denial, not only hidden UI controls.
- Object and search isolation; no existence leakage through status codes, counts, previews, autocomplete, attachment URLs, or notifications.
- Message/request/escalation state machines, due-time boundaries, timezone/DST, retries, duplicate delivery, idempotency, concurrent acknowledgement, and worker lock behavior.
- Audit assertions for every mutation, denial, privileged read/export, escalation, deletion, and failure; verify actor/source/outcome fields and no body leakage.
- Attachment file type/size/scan/quarantine/download authorization and retention deletion.
- Notification redaction, preference enforcement, urgent override policy, failure/retry behavior, and deep-link authorization.
- Accessibility tests: keyboard path, focus trap/recovery, screen-reader status announcements, semantic labels, contrast, zoom/reflow, reduced motion, and error messages.

### Live/smoke verification

Use synthetic staff, tenants, teams, and operational objects only. Exercise: send routine → read; send urgent → acknowledge; let a test deadline escalate → resolve; remove member → confirm denial; fail a channel → confirm visible retry/owner alert; upload quarantined fixture → confirm no download. Test desktop and a narrow viewport. Keep live proof separate from unit/contract results.

### Release gates

1. Privacy/security owner approves communication policy, threat model, retention, escalation roster, notification channels, and incident runbook.
2. Backend tests prove server-side isolation and audit completeness.
3. Accessibility review passes keyboard and assistive-technology smoke paths.
4. Operational review proves outbox recovery, escalation recovery, backup recipient coverage, and audit-log failure handling.
5. Pilot users confirm terminology, response targets, handoff format, and “official record” boundary.

## 10. Rollout and fit in the larger app

### Dependencies and integration points

Identity/session and tenant authorization are prerequisites. The messaging feature may link to appointments, tasks, cases, or other operational objects only through typed, server-checked references. Each source feature remains authoritative for its own state. The clinical-record module remains authoritative for clinical documentation. The notification center consumes messaging events; it does not own message state. The shared outbox and audit writer remain the only delivery/audit authorities.

### Incremental rollout

1. **Policy and schema checkpoint:** approve boundary, roles, retention, escalation coverage, and threat model before code.
2. **Internal shadow/pilot:** routine in-app messages only, synthetic data, feature flag by tenant/site, no external channels.
3. **Limited operational pilot:** direct/team conversations, receipts, requests, and attachments after scan/authorization gates pass.
4. **Urgency pilot:** one trained team, explicit roster, test escalation schedule, daily review of delivery/acknowledgement evidence.
5. **Broader enablement:** tenant-by-tenant, with rollback flag, migration/backfill plan, support training, and policy acceptance captured.

### Rollback and migration

Feature-disable must stop new sends and escalation creation while preserving authorized read/admin recovery. Do not delete data as rollback. Outbox events need a safe drain/pause mode. Any migration must be additive, resumable, idempotent, monitored, and backed up; test restore and legal-hold behavior before production enablement.

### Pilot success measures

Measure response-time improvement only for messages with an explicit due time; also monitor unresolved urgent messages, escalation delivery success, false urgency rate, missed/duplicate notifications, authorization denials, accessibility defects, and support incidents. Do not use read rate as a proxy for safe communication or acknowledgement.

## Research basis

- [HHS Summary of the HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) — access control, audit controls, authentication, integrity, availability, and transmission security; useful safeguards, not a product certification.
- [HHS Security Rule overview](https://www.hhs.gov/hipaa/for-professionals/security/index.html) — current-rule framing and risk-assessment context.
- [NIST SP 800-171 Rev. 3, Audit and Accountability / Least Privilege](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/800-171r3/NIST.SP.800-171r3.html) — event content, failure handling, review/protection of audit data, least privilege, and separation of duties.
- [NIST RBAC FAQ](https://csrc.nist.gov/Projects/role-based-access-control/faqs) — role-based access as an organizational access-control model.
- [AHRQ TeamSTEPPS Check-Back](https://www.ahrq.gov/teamstepps-program/curriculum/communication/tools/checkback.html) — closed-loop communication, explicit acknowledgement, and the risks of assuming that a message was read.
- [AHRQ TeamSTEPPS tools](https://www.ahrq.gov/teamstepps-program/resources/modules/index.html) — SBAR, check-back, call-out, and structured handoff patterns.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [Understanding Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages) — non-focus-stealing announcements and programmatically determinable status.
- [Joint Commission Quick Safety: Advancing Safety with Closed-loop Communication of Test Results](https://digitalassets.jointcommission.org/api/public/content/77c6421712dc463eae4b2398f9bf01a5?v=e9bc1e0f) — backup procedures, correct recipient, timely response, and closed-loop safety considerations.

These sources inform design choices; they do not establish that an eventual implementation is HIPAA compliant, clinically safe, or suitable for a particular organization without risk assessment, policy approval, testing, training, contracts, and operational evidence.

# Staff Messaging Audit Plan

## Related planning documents

- [Capability roadmap](ROADMAP.md)
- [Staff messaging build plan](STAFF_MESSAGING_BUILD_PLAN.md)
- [Shared roadmap index](../ROADMAP_INDEX.md)
- Integration audit dependencies: [Patient Reminders audit plan](../patient%20reminders/PATIENT_REMINDERS_AUDIT_PLAN.md) and [AI Scribe audit plan](../ai%20scribe/AI_SCRIBE_AUDIT_PLAN.md) must prove that cross-capability events are authorized, idempotent, correlated, and do not expose content outside scope.

## 1. Audit purpose and boundaries

Determine whether staff messaging can operate as a secure, dependable, accessible operational communication layer without becoming an uncontrolled clinical record or bypassing the organization’s system of record. Audit the journey from conversation creation through delivery, acknowledgement, escalation, handoff, retention, export, and deletion.

Passing an application test suite does not prove HIPAA or other regulatory compliance. Legal, policy, training, risk-analysis, vendor, incident-response, and contractual controls require separate review.

## 2. Evidence package

Collect the commit and environment manifest, route/API/component inventory, schema and indexes, authorization policy, tenant model, threat model, retention policy, notification configuration, audit-event catalog, logging configuration, deployment topology, incident runbook, accessibility report, synthetic users, and live screenshots of critical flows.

Require a capability matrix mapping each operation to role, tenant/site scope, resource relationship, UI control, server enforcement, audit event, and test.

## 3. Audit workstreams

### A. Conversation and handoff workflow

Exercise these flows with synthetic staff accounts:

1. Authorized user starts a direct or team conversation.
2. User adds only eligible recipients and sends a message or attachment.
3. Recipient receives an in-app and optional external notification.
4. Recipient acknowledges, replies, assigns, escalates, or hands off.
5. Supervisor reviews unresolved and urgent work.
6. Conversation is linked to an authorized task or case without exposing unrelated data.
7. Message is edited, redacted, reported, retained, exported, or deleted according to policy.

Capture visible states, backend transitions, notification events, audit entries, latency, and failure behavior for every step.

### B. Authorization and tenant isolation

- Test every read and mutation server-side; do not rely on hidden controls or browser role values.
- Build a role-by-action matrix for staff, supervisor, administrator, auditor, read-only user, suspended user, and unauthenticated user.
- Test tenant, practice, site, team, conversation, message, attachment, task, and patient-reference boundaries.
- Test direct object-reference substitution, stale session, revoked role, expired grant, removed team membership, and cross-tenant search.
- Confirm least-privilege access to urgent conversations, attachments, exports, audit history, and administrative tools.
- Verify actor, tenant, role, scope, reason, and audit metadata are server-derived and tamper-resistant.

### C. Privacy, record boundaries, and auditability

- Inspect message previews, push notifications, email subjects, browser storage, analytics, logs, search indexes, exports, backups, and provider payloads for unnecessary sensitive content.
- Verify warnings and UI guidance identify what belongs in the official record and what messaging is not intended to replace.
- Confirm immutable or append-only audit history for send, read, edit, delete, attachment access, assignment, escalation, export, permission change, and administrative review.
- Verify retention holds, legal/organizational retention rules, deletion requests, and backup expiry behavior.
- Test access auditing separately from content/version history; both must be searchable by authorized auditors.

### D. Urgency, acknowledgement, and reliability

- Verify urgent messages require explicit acknowledgement and have a defined escalation timer, owner, fallback, and stop condition.
- Test notification delivery, retries, quiet hours, mute behavior, duplicate suppression, provider outages, worker restarts, and dead-letter recovery.
- Test race conditions between acknowledgement, reassignment, escalation, deletion, and conversation closure.
- Confirm the UI never represents a notification as read, delivered, or acknowledged without authoritative state.
- Verify idempotency for sends, assignments, escalations, and webhook processing.

### E. UX and accessibility

- Inspect inbox hierarchy, unread/urgent/assigned filters, response expectations, escalation affordances, attachment safety, and error recovery.
- Test keyboard navigation, focus management, screen-reader semantics, live updates, contrast, zoom, reduced motion, touch targets, and status announcements.
- Test long messages, dense threads, quoted content, attachments, empty states, disconnected state, slow loading, expired sessions, and narrow screens.
- Confirm notification copy is discreet, actionable, and does not disclose more than necessary.

### F. Operations and abuse resistance

- Test rate limiting, spam/harassment reporting, blocked recipients, attachment validation, malware scanning, content-size limits, and suspicious activity alerts.
- Verify administrators can investigate delivery and access incidents without unrestricted message browsing.
- Confirm metrics separate volume, latency, notification success, acknowledgement, escalation, unresolved age, and failure classes.
- Verify dashboards and logs are tenant-safe and redact message bodies, tokens, attachment contents, and unnecessary identifiers.

## 4. Test matrix

Cover each role against each operation: discover/search, create conversation, add participant, send, edit, delete, attach, read, acknowledge, assign, escalate, close, link to task, export, report, administer, and audit.

Minimum negative cases:

- Cross-tenant conversation or attachment access.
- Direct API send by suspended or read-only user.
- Recipient added after losing team membership.
- Urgent message silently muted or escalation bypassed.
- Duplicate send or duplicate escalation after retry.
- Push/email preview exposing sensitive content.
- Attachment type spoofing, oversized file, malware scan failure, and expired download URL.
- Concurrent edit/delete/acknowledge/assign operations.
- Search returning messages from unauthorized scopes.

## 5. Severity and release gates

- P0: cross-tenant disclosure, unauthorized message/attachment access, missing opt-out/security control, silent urgent-message loss, or audit bypass. Block release.
- P1: broken acknowledgement/escalation, duplicate urgent notifications, incorrect role enforcement, sensitive preview leakage, missing retention behavior, or inaccessible critical workflow. Block pilot.
- P2: confusing inbox state, weak diagnostics, non-critical filter defect, or recoverable layout issue. Track with owner and due date.
- P3: polish and future enhancement.

Pilot approval requires zero open P0/P1 findings, executable role/scope denial coverage, proven urgent-message acknowledgement and escalation, attachment and notification controls, redacted observability, accessibility evidence, incident/runbook readiness, and explicit record-boundary approval.

## 6. Audit outputs

- Readiness summary and go/no-go recommendation.
- Role × action × scope authorization matrix.
- Conversation state and escalation diagrams.
- Data-flow, notification, retention, and record-boundary maps.
- Findings register with evidence, owner, severity, remediation, and retest.
- Accessibility/responsive report with screenshots.
- Abuse, incident, and operational-runbook review.
- Post-pilot monitoring and review cadence.

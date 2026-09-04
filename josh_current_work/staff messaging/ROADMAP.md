# Staff Messaging Roadmap

> Detailed implementation companion: [STAFF_MESSAGING_BUILD_PLAN.md](STAFF_MESSAGING_BUILD_PLAN.md). It defines the proposed data model, API/service/UI file map, end-to-end workflows, security/privacy controls, accessibility and notification behavior, retention, observability, tests, rollout gates, and integration boundaries. This roadmap is the phase-level index; the companion plan is the implementation contract.

## Objective
Provide a secure, organized way for authorized staff to communicate with one another about patient-care operations and team workflows.

## Phase 1: Define communication rules
- Identify roles, teams, message types, urgency levels, and response expectations.
- Define access boundaries, retention, escalation, and prohibited content.
- Separate operational messaging from any clinical-record system of record.
- Approve the product boundary, action-specific permissions, emergency-procedure disclaimer, retention owner/schedule, escalation roster, notification channels, and threat model before schema work.
- Treat routine, time-sensitive, urgent operational, and safety-critical messages as distinct policy classes; a read receipt is not an acknowledgement.

## Phase 2: Build core messaging
- Add authenticated one-to-one and team conversations.
- Support message status, timestamps, attachments where appropriate, and search.
- Add notifications, mute controls, read receipts, and message history.
- Use server-derived actor/tenant/site scope, protected bodies/attachments, typed links to authorized operational objects, idempotent sends, an outbox, and append-only audit events.
- Build the inbox, conversation view, composer, notification center, and accessible status announcements as a complete vertical slice.

## Phase 3: Add workflow support
- Allow messages to link to authorized tasks, appointments, or cases.
- Add assignment, handoff, escalation, and acknowledgement actions.
- Provide an inbox for unread, urgent, assigned, and unresolved conversations.
- Use structured SBAR/handoff fields where appropriate, explicit accountable recipients and due times, bounded escalation with backup recipients, and clear state transitions: read, acknowledged, in progress, resolved, and escalated.

## Phase 4: Validate and govern
- Test authorization, tenant separation, audit logging, retention, and notification failures.
- Add moderation/reporting controls and administrative visibility.
- Pilot with representative staff roles and refine based on response-time data.
- Add direct-API denial tests, audit completeness assertions, attachment scan/access tests, notification redaction tests, keyboard/screen-reader/narrow-layout checks, worker recovery tests, and synthetic live smoke proof.
- Gate rollout on privacy/security approval, retention/legal-hold policy, escalation coverage, accessibility review, incident runbook, and tested rollback.

## Completion criteria
- Only authorized staff can access each conversation.
- Urgent messages have explicit acknowledgement and escalation behavior.
- Every message action is auditable.
- The system clearly communicates what belongs in the official record.
- The detailed build plan’s security, accessibility, observability, testing, and rollout gates are evidenced; passing tests alone is not a compliance or clinical-safety claim.

## Audit plan

See [STAFF_MESSAGING_AUDIT_PLAN.md](STAFF_MESSAGING_AUDIT_PLAN.md) for the evidence package, workflow and handoff audit, role/scope authorization matrix, privacy and record-boundary review, escalation and reliability tests, accessibility review, severity model, release gates, and required audit outputs.

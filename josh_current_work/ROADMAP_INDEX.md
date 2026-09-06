# Healthcare Capability Roadmap Index

This index connects the capability roadmaps. Each capability has a roadmap, an implementation build plan, and an audit plan. The plans are complementary: build plans define what to build; audit plans define how to prove it is safe and ready; the roadmaps define sequencing and release gates.

## Capability map

| Capability | Roadmap | Build plan | Audit plan | Primary relationship |
|---|---|---|---|---|
| Patient reminders | [ROADMAP.md](patient%20reminders/ROADMAP.md) | [PATIENT_REMINDERS_BUILD_PLAN.md](patient%20reminders/PATIENT_REMINDERS_BUILD_PLAN.md) | [PATIENT_REMINDERS_AUDIT_PLAN.md](patient%20reminders/PATIENT_REMINDERS_AUDIT_PLAN.md) | Sends patient-facing appointment and follow-up communications; can create staff work when delivery or response needs attention. |
| Staff messaging | [ROADMAP.md](staff%20messaging/ROADMAP.md) | [STAFF_MESSAGING_BUILD_PLAN.md](staff%20messaging/STAFF_MESSAGING_BUILD_PLAN.md) | [STAFF_MESSAGING_AUDIT_PLAN.md](staff%20messaging/STAFF_MESSAGING_AUDIT_PLAN.md) | Provides authenticated operational communication, acknowledgement, handoff, and escalation for staff. |
| Patient portal | [ROADMAP.md](patient%20portal/ROADMAP.md) | [PATIENT_PORTAL_BUILD_PLAN.md](patient%20portal/PATIENT_PORTAL_BUILD_PLAN.md) | [PATIENT_PORTAL_AUDIT_PLAN.md](patient%20portal/PATIENT_PORTAL_AUDIT_PLAN.md) | Provides patient-scoped access to approved care, scheduling, billing, documents, results, and bounded requests. |
| AI scribe | [ROADMAP.md](ai%20scribe/ROADMAP.md) | [AI_SCRIBE_BUILD_PLAN.md](ai%20scribe/AI_SCRIBE_BUILD_PLAN.md) | [AI_SCRIBE_AUDIT_PLAN.md](ai%20scribe/AI_SCRIBE_AUDIT_PLAN.md) | Produces reviewable encounter drafts; approved outputs may link to the official record and create follow-up work. |
| Cash-pay billing | [ROADMAP.md](cash%20pay%20billing/ROADMAP.md) | [CASH_PAY_BILLING_BUILD_PLAN.md](cash%20pay%20billing/CASH_PAY_BILLING_BUILD_PLAN.md) | [CASH_PAY_BILLING_AUDIT_PLAN.md](cash%20pay%20billing/CASH_PAY_BILLING_AUDIT_PLAN.md) | Provides staff receivables, cash drawer control, manager reconciliation, receipts, and gated check/card integrations while Rails remains the financial authority. |

## Coordinated execution

Use [EXECUTION_MATRIX.md](EXECUTION_MATRIX.md) for the current three-lane work-in-progress limit, shared-file ownership, capability dependencies, execution waves, and the exact next bounded actions. Shortcut remains authoritative for active task claims and status; the matrix is the repository-side sequencing and handoff contract.

For the deliberate implementation-only pass requested on 2026-09-06, use [AGENT_BUILD_FIRST_PLAN.md](AGENT_BUILD_FIRST_PLAN.md). It supersedes the matrix's test-and-evidence cadence only for that pass: the goal is complete feature implementation with bounded agent ownership, then a separate stabilization and evidence pass.

## Shared integration rules

- The host application remains authoritative for identity, tenant/practice/site scope, patient and appointment master data, permissions, CSRF/session security, official-record persistence, and organization-wide audit infrastructure.
- Capabilities integrate through stable opaque IDs and typed service/API contracts. No capability reads another capability’s tables directly or trusts browser-supplied actor, tenant, role, consent, approval, or audit metadata.
- Patient reminders may create or update an operational task in staff messaging for failed delivery, unresolved patient response, or escalation. Staff messaging must not expose reminder message bodies unless separately authorized.
- AI scribe may link an approved draft or follow-up task to an encounter; it must not autonomously send patient reminders, staff messages, or official-record updates.
- Staff messaging may receive operational events from reminders or scribe, but acknowledgement and escalation status must remain authoritative in staff messaging.
- Each capability keeps its own state machine, provenance, audit details, retention behavior, and release gate. Cross-capability events must be idempotent, traceable with a correlation ID, and safe to replay.
- Shared platform concerns—authorization, notification providers, audit logging, feature flags, observability, retention, incident response, and accessibility standards—must be reviewed against every capability’s audit plan.

## Recommended delivery order

1. Establish shared identity, authorization, tenant isolation, audit, event, observability, and retention contracts.
2. Build and audit staff messaging foundations because it supplies operational acknowledgement and escalation.
3. Build and audit the patient portal foundation and lifecycle before exposing any patient-facing clinical or financial content.
4. Build and audit patient reminders, integrating reminder failures and unresolved responses with staff messaging and the portal.
5. Build and audit AI scribe with strict consent, provenance, human approval, and official-record boundaries.
6. Run an integrated pilot proving cross-capability isolation, event idempotency, audit correlation, failure recovery, and safe rollback.

## How to use the documents

- Start with the capability `ROADMAP.md` for phases and completion criteria.
- Use the capability `*_BUILD_PLAN.md` to implement the proposed files, services, screens, APIs, and workflows.
- Use the capability `*_AUDIT_PLAN.md` before each gate to collect evidence, run negative tests, record findings, and decide go/no-go.
- Treat links, proposed paths, and sources as planning inputs until verified against the actual host application and current deployment context.

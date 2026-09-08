# Healthcare Capability Roadmap Index

This index connects the capability roadmaps. Each capability has a roadmap, an implementation build plan, and an audit plan. The plans are complementary: build plans define what to build; audit plans define how to prove it is safe and ready; the roadmaps define sequencing and release gates.

## Capability map

| Capability | Roadmap | Build plan | Audit plan | Primary relationship |
|---|---|---|---|---|
| Telehealth with in-call Scribe | [ROADMAP.md](telehealth/ROADMAP.md) | [TELEHEALTH_BUILD_PLAN.md](telehealth/TELEHEALTH_BUILD_PLAN.md) | [TELEHEALTH_AUDIT_PLAN.md](telehealth/TELEHEALTH_AUDIT_PLAN.md) | Scheduled video visits, patient preparation and admission, media recovery and encounter-bound Scribe; [implementation context](telehealth/AGENT_IMPLEMENTATION_HANDOFF.md). |
| Patient reminders | [ROADMAP.md](patient%20reminders/ROADMAP.md) | [PATIENT_REMINDERS_BUILD_PLAN.md](patient%20reminders/PATIENT_REMINDERS_BUILD_PLAN.md) | [PATIENT_REMINDERS_AUDIT_PLAN.md](patient%20reminders/PATIENT_REMINDERS_AUDIT_PLAN.md) | Sends patient-facing appointment and follow-up communications; can create staff work when delivery or response needs attention. |
| Staff messaging | [ROADMAP.md](staff%20messaging/ROADMAP.md) | [STAFF_MESSAGING_BUILD_PLAN.md](staff%20messaging/STAFF_MESSAGING_BUILD_PLAN.md) | [STAFF_MESSAGING_AUDIT_PLAN.md](staff%20messaging/STAFF_MESSAGING_AUDIT_PLAN.md) | Provides authenticated operational communication, acknowledgement, handoff, and escalation for staff. |
| Patient portal | [ROADMAP.md](patient%20portal/ROADMAP.md) | [PATIENT_PORTAL_BUILD_PLAN.md](patient%20portal/PATIENT_PORTAL_BUILD_PLAN.md) | [PATIENT_PORTAL_AUDIT_PLAN.md](patient%20portal/PATIENT_PORTAL_AUDIT_PLAN.md) | Provides patient-scoped access to approved care, scheduling, billing, documents, results, and bounded requests. |
| AI scribe | [ROADMAP.md](ai%20scribe/ROADMAP.md) | [AI_SCRIBE_BUILD_PLAN.md](ai%20scribe/AI_SCRIBE_BUILD_PLAN.md) | [AI_SCRIBE_AUDIT_PLAN.md](ai%20scribe/AI_SCRIBE_AUDIT_PLAN.md) | Produces reviewable encounter drafts; approved outputs may link to the official record and create follow-up work. |
| Cash-pay billing | [ROADMAP.md](cash%20pay%20billing/ROADMAP.md) | [CASH_PAY_BILLING_BUILD_PLAN.md](cash%20pay%20billing/CASH_PAY_BILLING_BUILD_PLAN.md) | [CASH_PAY_BILLING_AUDIT_PLAN.md](cash%20pay%20billing/CASH_PAY_BILLING_AUDIT_PLAN.md) | Provides staff receivables, cash drawer control, manager reconciliation, receipts, and gated check/card integrations while Rails remains the financial authority. |
| Employee workforce | [ROADMAP.md](employee%20workforce/ROADMAP.md) | [EMPLOYEE_WORKFORCE_BUILD_PLAN.md](employee%20workforce/EMPLOYEE_WORKFORCE_BUILD_PLAN.md) | [EMPLOYEE_WORKFORCE_AUDIT_PLAN.md](employee%20workforce/EMPLOYEE_WORKFORCE_AUDIT_PLAN.md) | Plans employee account linking, location-configurable badge clocking, hours, employee schedules, optional self-service and payroll exports. Reuses host identity and sites; employee shifts are separate from patient appointments. |

## Coordinated execution

Use [AGENT_BUILD_FIRST_PLAN.md](AGENT_BUILD_FIRST_PLAN.md) for the source-reconciled forgotten-work sequence, exact current Rails/frontend paths, separate Shortcut outcomes, and usage-aware agent ownership. The [September 4 execution matrix](EXECUTION_MATRIX.md) retains historical checkpoints; its branch/runtime and missing-route claims are not current instructions. Shortcut remains authoritative for active claims and status.

The 2026-09-06 forgotten-work implementation is integrated locally; see the dated execution handoff in the build-first plan for exact source commits and remaining gates. It reused existing inventory/billing functionality and preserved the billing-only portal boundary. Server-backed staff, scribe, financial replay and recovery/handoff work is implemented pending verification; authenticated reminder-provider ingress remains blocked on its protocol/account/secret-custody prerequisites. Tests, runtime proof and polish are separately deferred. Existing capability packets remain design/audit references, not authority to reopen superseded scope or rebuild their old proposed paths unchanged.

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
6. Run an integrated pilot proving cross-capability isolation, event idempotency, audit correlation, failure recovery, truthful status, and safe rollback.

## How to use the documents

- Start with the capability `ROADMAP.md` for phases and completion criteria.
- Use the capability `*_BUILD_PLAN.md` to implement the proposed files, services, screens, APIs, and workflows.
- Use the capability `*_AUDIT_PLAN.md` before each gate to collect evidence, run negative tests, record findings, and decide go/no-go.
- Treat links, proposed paths, and sources as planning inputs until verified against the actual host application and current deployment context.

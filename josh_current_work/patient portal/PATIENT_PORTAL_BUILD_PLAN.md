# Patient Portal Build Plan

## Related planning documents

- [Capability roadmap](ROADMAP.md)
- [Patient portal audit plan](PATIENT_PORTAL_AUDIT_PLAN.md)
- [Shared roadmap index](../ROADMAP_INDEX.md)
- Host implementation roadmap: `APPlyVault/03 Execution/Patient Portal Implementation Roadmap.md`

Status: implementation planning artifact. The current repository contains a billing-only local development slice; this plan describes the remaining implementation and does not authorize production operation.

## 1. Product boundary and assumptions

Rails in `apps/api/` owns authentication, sessions/CSRF, practice and patient tenancy, permissions, clinical records, scheduling, inventory, billing, audit, document access, and state transitions. React in `apps/web/` owns presentation and transient interaction state. The browser uses same-origin `/api/*` requests and never supplies actor, practice, patient, role, capability, audit, or clinical authority.

Use only synthetic records until the Phase 0 owners, contracts, and release gates are accepted. A local development shortcut may create fixtures only when the explicit development flag and loopback boundary are present; it must be unavailable in production.

The first release is billing-only. The ordinary patient path is bound to its assigned active portal identity. Omni's local preview is an additional read-only development path; Rails derives its practice from the Omni membership, accepts only `SYN-OMNI-*` patients, and stores the selected patient only in the current server session.

### In scope for the first release

- Patient identity lifecycle and a narrow authenticated billing portal shell.
- Read-only projections for invoices, invoice lines, balances, credits, payments, allocations, refunds, and receipt-availability state.
- Omni's local development preview with a session-scoped synthetic-patient selector.
- Explicit server-side denial of dormant nonbilling portal routes.
- Later gated appointment, intake, clinical-release, request, notification, document, payment, and prescribing integrations.

### Explicitly out of scope until separately approved

Public signup; shared accounts; unreviewed proxy/minor access; emergency care; appointment/intake/clinical/request/reminder portal actions; payment collection; direct card-number handling; automatic booking; prescription issuance; raw scribe/audio display; unreviewed lab interpretation; unrestricted exports; production data; production impersonation; and claims that tests equal HIPAA, clinical, legal, or reimbursement approval.

## 2. Current implementation map

The current synthetic slice is implemented in these existing boundaries:

- `apps/api/app/models/clinic/patient_portal/identity.rb` and additive identity migration.
- `apps/api/app/controllers/clinic/patient_portal/base_controller.rb`, `context_controller.rb`, `development_patient_controller.rb`, `appointment_requests_controller.rb`, and `requests_controller.rb`.
- `apps/api/app/models/clinic/patient_portal/request.rb` and `create_request.rb` for encrypted/idempotent question and refill requests.
- `apps/api/app/queries/clinic/billing/patient_ledger.rb` for exact-decimal patient ledger projection.
- `apps/api/config/routes.rb` for `/api/patient_portal/context`, `/appointment_requests`, and `/requests`.
- `apps/web/src/features/patientPortal/PatientPortal.tsx`, `src/api/contracts.ts`, `src/api/client.ts`, and the shared `Form` helper.

The current context contract contains only patient/practice metadata, read-only billing data, billing capability flags, and notices. Omni additionally receives an in-memory UI selector backed by `PATCH /api/patient_portal/development_patient`; the selected patient is never persisted to a patient identity or browser storage.

The existing request queue intentionally records status and audit metadata but does not deliver messages, prescribe, or resolve a request. Keep that boundary until staff triage and clinical ownership are connected.

## 3. Proposed file and contract map

Use the established Rails/React structure rather than creating a second service or authorization system.

### Backend additions

    apps/api/db/migrate/*_extend_patient_portal_identity_lifecycle.rb
    apps/api/db/migrate/*_create_clinic_patient_portal_intake_submissions.rb
    apps/api/db/migrate/*_create_clinic_billing_unapplied_credits.rb
    apps/api/db/migrate/*_create_clinic_patient_portal_documents.rb
    apps/api/app/models/clinic/patient_portal/invitation.rb
    apps/api/app/models/clinic/patient_portal/session_device.rb
    apps/api/app/models/clinic/patient_portal/intake_submission.rb
    apps/api/app/models/clinic/patient_portal/document_release.rb
    apps/api/app/models/clinic/unapplied_credit.rb
    apps/api/app/services/clinic/patient_portal/invite_patient.rb
    apps/api/app/services/clinic/patient_portal/activate_identity.rb
    apps/api/app/services/clinic/patient_portal/recover_identity.rb
    apps/api/app/services/clinic/patient_portal/revoke_identity.rb
    apps/api/app/services/clinic/patient_portal/release_summary.rb
    apps/api/app/services/clinic/billing/record_unapplied_credit.rb
    apps/api/app/services/clinic/billing/allocate_unapplied_credit.rb
    apps/api/app/services/clinic/payments/create_payment_intent.rb
    apps/api/app/services/clinic/payments/process_webhook.rb
    apps/api/app/controllers/clinic/patient_portal/lifecycle_controller.rb
    apps/api/app/controllers/clinic/patient_portal/intake_submissions_controller.rb
    apps/api/app/controllers/clinic/patient_portal/documents_controller.rb
    apps/api/app/controllers/clinic/patient_portal/payment_intents_controller.rb
    apps/api/app/controllers/clinic/payments/webhooks_controller.rb

Prefer existing `Clinic::AuditRecorder`, `Clinic::Authorization`, `Clinic::OperationReceipt`, document access, outbox, and exact-decimal money services. Do not add parallel audit, notification, or session stores.

### Frontend additions

    apps/web/src/features/patientPortal/PatientPortal.tsx
    apps/web/src/features/patientPortal/PatientPortalRequests.tsx
    apps/web/src/features/patientPortal/PatientPortalIntake.tsx
    apps/web/src/features/patientPortal/PatientPortalBilling.tsx
    apps/web/src/features/patientPortal/PatientPortalDocuments.tsx
    apps/web/src/features/patientPortal/PatientPortalLifecycle.tsx
    apps/web/src/features/patientPortal/patientPortalContracts.ts
    apps/web/src/features/patientPortal/patientPortalCopy.ts
    apps/web/src/features/patientPortal/patientPortal.accessibility.test.tsx

Use Material UI primitives and the existing same-origin API client. Patient content must not be persisted in local/session storage. Every mutation needs an explicit retry/idempotency behavior and a visible outcome-unknown state.

## 4. Data model and invariants

### Identity lifecycle

Extend the existing practice/patient/user identity with one-time invitation digest, expiry, accepted-terms version/time, activation time, revocation reason/time, last step-up time, and a lifecycle audit reference. Store only digests for invitation/recovery tokens. Tokens are single-purpose, short-lived, rate-limited, never logged, and invalid after activation, use, expiry, or revocation. A revoked identity cannot read the portal even with a previously issued session.

Support proxy/guardian access only after a separately approved relationship and consent model. Never infer it from a shared phone or email. Support impersonation is prohibited by default; if approved, it is time-limited, read-only where possible, reason-required, and heightened-audit.

### Intake submissions

Use versioned modules and immutable submissions: module/version, patient, answers stored in host-approved protected fields, completion state, signature/attestation evidence, authored time, correction/addendum link, and source/provenance. Mapping into demographics, contacts, emergency contacts, or communication preferences is a server-side reviewed operation, not a browser field merge.

### Unapplied credits

Represent a prepayment/payment remainder as an append-only practice/patient/currency record with source payment, amount, available amount, state, and reconciliation reference. Allocation rows reference a posted invoice and exact amount; partial allocation is allowed, over-allocation is rejected under a patient lock, and reversal creates a compensating record. Never rewrite a payment or posted invoice.

### Patient documents and release

A patient-facing document is an immutable versioned snapshot with source type/id/version, release actor/time, patient/practice scope, document category, object storage version/checksum, scan state, access/reissue events, and correction/addendum relationship. Draft encounters, unsigned notes, quarantined documents, internal comments, and processor references are not eligible for patient release.

### Request state machines

The existing patient request types are `message` and `refill`; statuses are `pending`, `in_review`, `resolved`, and `declined`. Staff transitions require action-specific authorization, reason or resolution where applicable, optimistic locking, and audit events. A refill request can be linked to a medication statement only through a server-checked patient relationship; it never mutates medication or prescription state directly.

Appointment requests remain `pending`, `approved`, `declined`, or `cancelled`. Approval must be a server-side scheduling transaction that rechecks availability, timezone, resource/site, inventory hold policy, and staff override rules.

## 5. API contracts and service responsibilities

All routes require the host session, CSRF protection for cookie-authenticated mutations, no-store responses, bounded inputs, server-derived scope, structured errors, and audit events. Unauthorized object references must not leak existence.

### Identity and lifecycle

- `POST /api/clinic/patient_portal/invitations` — staff-only, creates a one-time invitation for an existing patient after proofing and policy checks.
- `POST /api/patient_portal/invitation/activate` — consumes a short-lived token, records terms/version evidence, and establishes the selected authentication/session path.
- `POST /api/patient_portal/step_up` — performs the approved second factor and rotates the session/device assurance.
- `POST /api/patient_portal/recovery` — starts recovery without account enumeration; support escalation is explicit and audited.
- `POST /api/clinic/patient_portal/identities/:id/revoke` — staff/admin action with reason and session/device invalidation.

The current development login remains a fixture-only path and must not be reused as a production lifecycle implementation.

### Patient projection and requests

- `GET /api/patient_portal/context` — narrow projection only; include schema version, freshness, capability flags, and unavailable states.
- `GET/POST /api/patient_portal/appointment_requests` — preferred-window request and history; no booking claim.
- `GET/POST /api/patient_portal/requests` — encrypted/idempotent general question or refill request and safe status history; do not return request body in context.
- `GET /api/patient_portal/intake` and `POST /api/patient_portal/intake/submissions` — only after module/version/signature policy is accepted.
- `GET /api/patient_portal/documents/:id` and `/download` — released documents only; authorize at download time and audit access.

### Billing and payments

- `GET /api/patient_portal/ledger` — exact-decimal invoices, lines, payments, allocations, credits, refunds, and document state.
- `POST /api/patient_portal/payment_intents` — creates a processor intent for an eligible posted invoice; client receives only processor-safe identifiers.
- `POST /api/payments/webhooks/:provider` — verifies signature, account, timestamp/replay window, schema, and deduplication before queuing reconciliation.
- `POST /api/clinic/invoices/:id/allocate_unapplied_credit` — staff/finance-only, patient/currency checked, locked, idempotent allocation.

### Clinical release and requests

- `POST /api/clinic/encounters/:id/patient_release` — clinician-only release snapshot with expected version and explicit review/attestation.
- `POST /api/clinic/patient_portal/requests/:id/transition` — staff/clinical workflow transition; request body is never copied into audit metadata or external notifications.
- `GET /api/patient_portal/results` — released authoritative result versions only; corrections supersede without erasing history.

## 6. End-to-end workflows and failure handling

### Invitation to authenticated portal

1. Staff selects an existing patient after server-side practice lookup and proofing.
2. Server creates a digest-backed, expiring invitation and sends only through an approved channel; logs contain no token or patient content.
3. Patient activates once, reviews terms/disclosures, completes the selected authentication/step-up path, and receives a bounded session.
4. Revocation, expiry, recovery, device loss, or support intervention invalidates the relevant session/device assurance and records an audit event.

Failures: generic responses for unknown accounts, rate limits, no token replay, no account merge, no shared-account fallback, and manual support escalation with identity proofing.

### Patient request

The current request service hashes content for retry compatibility and encrypts the stored body. On submit, the server binds patient and identity, validates request type/length, creates one pending request and a triage event, and returns only type/status/timestamps. A repeated key with identical content returns the original result; a changed payload conflicts. Staff triage is a separate transition; a request is never shown as resolved because it was delivered.

### Appointment request to booking

The patient submits an offset-bearing preferred window. The server checks future bounds, interval length, patient ownership, existing overlap, and idempotency. Staff approval rechecks source schedule and inventory authority inside one transaction; a conflict returns a safe review state and never silently moves the window.

### Invoice to payment and credit allocation

Staff posts an invoice. The patient sees immutable lines and exact balances. If payment is enabled, the server creates a processor intent and records only token/reference metadata. Signed webhooks create or reconcile payment events idempotently. Finance can allocate an unapplied remainder to a posted invoice under a patient lock; refund/void/reversal creates new history. Unknown processor outcomes remain visibly unresolved and go to a reconciliation queue.

### Clinical release and correction

The clinician reviews the source encounter, selects the patient-facing fields, attests to release, and creates a versioned snapshot. Corrections create addenda or a new version with the original retained. If a release is withdrawn, the portal hides it for future reads while preserving the audit and support trail; already downloaded artifacts follow the approved document policy.

### Result and refill handling

Only a source-authoritative result with an explicit release event is projected. Reference ranges, units, source date, version, and correction state are retained. Out-of-range styling is neutral and text-labeled; it must not imply diagnosis. Refill requests route to a prescriber workflow and can be denied, clarified, or completed there; portal status reflects the request workflow, not a prescription outcome.

## 7. UX, accessibility, and copy

Use one calm portal shell with clear patient/clinic context, a short freshness label, and grouped sections for appointments, intake, requests, care summaries/results/medications, and billing. Preserve explicit empty, unavailable, stale, error, saving, saved, and outcome-unknown states. Keep primary actions labeled; icon-only controls require accessible names.

Required copy includes: “Messages are reviewed within 1 business day. For medical emergencies, call 911 or visit the ER.” Also state that appointment requests require confirmation, refill requests are reviewed by the care team, payment may remain staff-operated, and results are informational until discussed with a clinician.

Test keyboard-only navigation, visible focus, screen-reader labels/status announcements, 200%/400% zoom, forced colors, reduced motion, touch targets, long content, narrow reflow, expired sessions, and safe error recovery. Do not persist forms or clinical content in browser storage.

## 8. Security, privacy, and operations

- Enforce identity, practice, patient, capability, relationship, and current session state on every read/write; hidden UI is not authorization.
- Use Rails encryption for protected fields, managed secrets for production keys, TLS, rotation/recovery evidence, and no raw PAN/CVC in APPly.
- Redact request bodies, diagnoses, results, note text, tokens, full contact values, processor metadata, and document content from logs, telemetry, URLs, titles, notifications, and error messages.
- Apply rate limits to login, invitation/recovery, step-up, request submission, payment intent, downloads, and webhook endpoints. Use generic enumeration-safe responses.
- Keep audit data append-only and separately access-controlled. Record invite, activate, step-up, recovery, revoke, read, download, submit, transition, release, payment, webhook, allocation, refund, denial, and failure outcomes.
- Define retention, legal hold, correction, deletion, backup expiry, support access, incident response, downtime/manual continuity, and rollback before production.
- Monitor queue age, unresolved requests, payment reconciliation, document failures, release failures, unauthorized denials, session anomalies, audit pipeline health, webhook verification failures, and notification failures without content.

## 9. Verification plan

Use focused checks per boundary and separate live browser evidence from automated results.

- Rails: model/service/controller tests, authorization matrix, tenant/patient isolation, idempotency, race/concurrency, exact-decimal money, lifecycle/session invalidation, document access, webhook verification, and audit assertions.
- Web: portal contract fixtures, request retry/error states, capability rendering, keyboard/status semantics, responsive reflow, no sensitive persistence, typecheck, build, and focused/full test suites.
- Runtime: migration/fresh database, eager loading, no-store/CSRF/origin behavior, session expiry/revocation, synthetic end-to-end request and staff triage, payment webhook fixture, document download authorization, and recovery/manual fallback.
- Release: staging matched API/web pair, backup/restore, monitoring/alerts, feature flags, rollback, support runbook, and limited-pilot walkthrough.

No command or test result is a substitute for privacy/security, clinical, finance, vendor, accessibility, or production operations approval.

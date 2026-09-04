# Patient Portal Roadmap

## Objective

Deliver a secure, patient-scoped portal for a cash-pay clinic. The owner-approved first release is billing-only: patients authenticate and review their own invoices, credits, balances, and payment history. Later releases may add appointments, intake, clinical releases, requests, and notifications. The portal must remain a presentation and request surface: Rails remains authoritative for identity, tenant scope, clinical records, scheduling, inventory, billing, audit, and every state transition.

The implementation companion is [PATIENT_PORTAL_BUILD_PLAN.md](PATIENT_PORTAL_BUILD_PLAN.md). The evidence and go/no-go companion is [PATIENT_PORTAL_AUDIT_PLAN.md](PATIENT_PORTAL_AUDIT_PLAN.md). These are planning artifacts; they do not authorize production patient data, charges, clinical release, prescribing, or HIPAA compliance.

## Current state

The APPly repository contains a local development billing-only slice: a patient-to-portal identity binding, a dedicated development patient login, a no-store patient context projection, and read-only cash ledger data. Omni can enter the same portal through the local development login and switch among `SYN-OMNI-*` patients in the current server session. Dormant appointment, intake, clinical, reminder, and request actions are blocked at the API boundary.

The slice is not production-ready. The remaining work below is ordered by safety and dependency, not by the original calendar estimate.

## Product boundaries and non-goals

- Cash-pay removes claims processing from the first release; it does not remove privacy, identity, audit, accessibility, tax, document, clinical-review, prescribing, or incident-response obligations.
- The portal may display only server-released projections. It must never expose raw ambient audio, draft SOAP content, internal staff notes, processor/card data, message bodies in telemetry, or another patient’s record.
- Appointment requests are not bookings until the authoritative scheduling service confirms them. Refill requests are not prescriptions or approvals. Results are not diagnoses.
- No public signup, shared account, unreviewed proxy/minor access, emergency channel, direct browser database access, browser-held tokens, or production shortcut login.
- The first release is billing-only. Payment collection remains disabled; appointments, intake, clinical summaries/results/medications, reminders, messages/refills, and booking remain unavailable until separately authorized.
- Omni preview is local-development-only, read-only, server-gated, session-scoped, and limited to synthetic patients in Omni's assigned development practice. It is not production impersonation.

## Current owner-approved slice — 2026-09-04

D-062 authorizes the billing-only patient portal first release and an Omni local development preview. The normal patient path uses the assigned active portal identity. The Omni path uses the existing local development login, derives the practice from Omni's membership, and stores only the selected synthetic patient ID in the current server session. No portal business mutation is available from either path.

The current implementation is local development evidence, not release acceptance. Provider/Stripe, finance, privacy/security, accessibility, operations, document/PDF/email, real-data, and deployment gates remain open.

## Delivery sequence

### Phase 0 — Authority, identity, and release policy

Name the clinic privacy/security owner, clinical reviewer, finance owner, scheduling/inventory owner, support owner, and vendor owners. Approve patient proofing, invitation, step-up, recovery, revocation, proxy/guardian, retention, break-glass, support, emergency copy, clinical-release, payment, document, and incident policies. Select the authoritative systems and contracts for scheduling, inventory, scribe, lab, e-prescribing, payment, document storage, and notifications.

Exit: signed decision record, data-flow/threat model, role and capability matrix, vendor/contract review, support/runbook owner, and an explicit synthetic-only development flag.

### Phase 1 — Portal foundation and lifecycle

Complete the existing identity model with one-time expiring invitations, accepted-terms evidence, step-up authentication, recovery escalation, session/device controls, revocation, support-access rules, and audit events. Keep the patient projection narrow, practice-scoped, no-store, and cache-safe. Add loading, unavailable, stale, empty, and recovery states and verify keyboard, reload, zoom, and narrow layouts.

Exit: wrong-patient/tenant, invitation replay, account enumeration, reset bypass, stale-session-after-revocation, proxy, and support-access tests pass; synthetic browser evidence and lifecycle/runbook approval are recorded.

### Phase 2 — Ledger, unapplied credit, and payment boundary

Freeze invoice/payment/refund/void/credit/adjustment semantics. Add an append-only prepayment/unapplied-credit record and exact-decimal allocation/reversal service. Expand the patient ledger to show current balance, available credit, invoice lines, allocations, refunds, and document state without staff-only metadata. Add Stripe-hosted Elements, server-created payment intents, signed/deduplicated webhooks, reconciliation, refund/dispute handling, receipt numbering, and failure recovery only after merchant and finance approval.

Fallback: keep balances read-only and staff-operated payment collection until account ownership, credentials, webhook secrets, tax/receipt policy, Apple Pay domain verification, and reconciliation ownership are accepted.

Exit: duplicate/out-of-order/replayed payment events, partial allocation, stale invoice, refund, void, unknown webhook, and cross-tenant tests pass; synthetic checkout/reconciliation evidence and finance acceptance exist.

### Phase 3 — Intake, appointment booking, and inventory holds

Convert intake into versioned modules with authorship, consent/signature semantics, correction/addendum behavior, provenance, and clinician-approved field mapping. Define schedule authority, provider/site/service/resource calendars, timezone/DST, buffers, eligibility, cancellation/reschedule, horizon, waitlist, and staff override rules. Add a server-side conflict-safe booking transaction. Add clinician-approved, time-bounded inventory holds that release on cancellation/expiry and never decrement stock at request time.

Fallback: retain preferred-window appointment requests and staff confirmation; do not claim real-time availability or stock.

Exit: concurrent final-slot, timezone/DST, stale availability, duplicate submit, expired hold, cancellation/release, staff override, wrong-patient, and outage tests pass; staff walkthrough and mapped-intake approval exist.

### Phase 4 — Clinician-released summaries and financial documents

Build a provider release action that snapshots an approved patient summary, source encounter/version, release time, correction/addendum state, and access audit. Keep raw notes and drafts unavailable. Render versioned, access-controlled invoices, receipts, and downloads with no-store responses, reissue/reprint rules, accessibility checks, and delivery policy. Treat superbills as a separate product requiring qualified review of CPT/ICD-10 authority, provider identity, wording, signatures, corrections, and reimbursement disclaimers.

Fallback: show no summary and use the existing staff-provided document workflow until clinical/legal/document owners approve.

Exit: release/no-release, addendum, wrong-patient, unauthorized download, adjustment, version, retry, and missing-code tests pass; clinician/finance/PDF accessibility review is recorded.

### Phase 5 — Requests, results, refills, and notifications

Connect the existing encrypted request queue to staff triage/outbox state without exposing request bodies to unauthorized users. Add response-time ownership, non-delivery/outage handling, attachment policy, and emergency copy. Route refill requests to the approved prescriber/e-prescribing workflow; never state approved or renew controlled substances from the portal. Display only authoritative clinician-released results with source/version/reference-range provenance and neutral out-of-range indicators. Add in-app notifications first; add email/SMS only after vendor, consent, redaction, and opt-out review.

Exit: request routing, duplicate/outage, refill-denial, unreleased/amended-result, critical-result tabletop, notification-redaction, keyboard/screen-reader, and narrow-layout evidence pass.

### Phase 6 — Limited pilot and controlled expansion

Pilot one clinic and bounded synthetic/approved cohort behind feature flags. Require monitoring, backup/recovery, support coverage, training, rollback/manual continuity, privacy/security and clinical sign-off, accessibility evidence, and measured operational success criteria before widening access.

## Completion criteria

- Every patient read and write is authenticated, practice/patient scoped, capability-checked server-side, audited, and covered by a safe error state.
- No patient-facing surface claims a booking, payment, prescription, result interpretation, clinical approval, delivery, or reimbursement outcome without authoritative evidence.
- Financial history is exact-decimal, append-only, reconcilable, and does not rewrite posted history.
- Clinical content is provider-released, versioned, correctable, access-audited, and never sourced directly from drafts or raw scribe output.
- Browser storage, telemetry, logs, URLs, notifications, and support tooling exclude unnecessary PHI and secrets.
- WCAG-oriented keyboard, focus, contrast, zoom/reflow, status-message, reduced-motion, and error-recovery checks are evidenced for the implemented flows.
- Production release has named owners, accepted vendors/contracts, tested recovery, runbooks, incident handling, retention, support, rollback, and a documented go/no-go decision.

## Detailed and audit plans

See [PATIENT_PORTAL_BUILD_PLAN.md](PATIENT_PORTAL_BUILD_PLAN.md) for the proposed files, contracts, services, workflows, controls, and test cases. See [PATIENT_PORTAL_AUDIT_PLAN.md](PATIENT_PORTAL_AUDIT_PLAN.md) for evidence collection, negative testing, severity, and release gates.

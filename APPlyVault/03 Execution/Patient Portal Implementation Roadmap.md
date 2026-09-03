---
type: implementation-roadmap
status: in-progress
updated: 2026-09-03
---
# Patient Portal Implementation Roadmap

Home: [[00 Home]] · Execution: [[Roadmap and Tasks]] · [[Cash-Pay Billing Implementation Package]] · [[Clinic Encounter Workflow Contract]] · [[Risks and Assumptions]]

## Purpose, scope, and limits

This is a proposed implementation sequence for a patient-facing APPly portal for a cash-pay clinic. It converts the requested dashboard, booking, payment, intake, visit-summary, refill, result, and messaging capabilities into independently reviewable slices. The canonical status record is [[Roadmap and Tasks]]; this note does not create a second task register or authorize production use.

The existing APPly clinic implementation is a synthetic staff-side foundation: schedule-aware board, encounter-draft probe, inventory, and cash-pay ledger. It is not an approved patient-record system, clinical workflow, payment processor integration, patient portal, or HIPAA/release acceptance. The roadmap must use synthetic data until the separately accepted privacy, security, professional, operations, and release gates exist.

Cash-pay eliminates claim submission from the first scope. It does **not** eliminate protected-health-information, identity, audit, accessibility, record-delivery, taxation, merchant-dispute, prescribing, or clinical-review obligations. A magic link is passwordless authentication; it is not automatically multi-factor authentication. Do not call it MFA until the selected mechanism and recovery path are reviewed and tested.

## Program gate — settle the blockers before product work

Do this in parallel with local synthetic design/prototyping; do not wait until the final polish milestone.

| Required input / decision | Failure if absent | Safe resolution and exit evidence |
| --- | --- | --- |
| Named clinic legal/privacy/security owner; data-flow and vendor inventory | A portal is treated as safe because it is cash-pay or because a vendor offers a healthcare feature | Map browser, APPly API/database/backups/logs, messaging, scribe, lab, payment, PDF, support, and analytics flows; obtain the applicable contractual/security review and record the residual-risk owner. Do not place diagnosis, lab, note, or message content in payment metadata or telemetry. |
| Patient identity, proxy/guardian, invitation, recovery, support, retention, and break-glass policy | An invitation, reset, shared phone, proxy, or support action exposes the wrong record | Approved lifecycle contract with proofing threshold, one-time expiring invitation, step-up, recovery escalation, disable/revoke, impersonation prohibition or tightly audited support access, proxy/minor rules, and synthetic adversarial tests. |
| Clinical ownership and patient-content policy | Draft AI content, incomplete results, or non-clinical staff text is published as care advice | Provider/clinical reviewer accepts what can appear, who approves it, turnaround expectations, escalation path, correction/addendum behavior, and what remains unavailable. The portal never substitutes for emergency or urgent care. |
| Payment, financial-document, tax, and processor operating model | A card integration cannot reconcile payments/refunds, or records misstate a charge | Select account owner, merchant/dispute/refund owner, supported payment methods, reconciliation cadence, tax treatment, receipt/invoice numbering, refund/credit policy, and Stripe test/live-account authority. Keep card fields in processor-hosted components and token-only APPly contracts. |
| Scheduling, inventory, lab, scribe, and prescribing integration owners/contracts | UI promises real-time booking, stock, results, AI summaries, or refills without a source of truth | Name the authoritative system, API/event contract, service-level expectations, downtime/manual fallback, idempotency key, retention, and accountable operator for each integration. Unselected integrations remain visibly unavailable, not simulated. |
| Production operations and accessibility acceptance | A successful local demo becomes a patient release | Complete T-20/T-22 operations and browser acceptance plus a scoped accessibility review, monitoring/alerting, tested recovery, incident path, capacity assumptions, support coverage, and an explicitly authorized target/audience. |

## Delivery principles

- Rails remains authoritative for tenant, patient, actor, role, capability, ledger, inventory, audit, and state transitions. The browser receives a narrow patient-scoped projection and never supplies identity, clinic, financial, or clinical authority.
- Use additive migrations, immutable financial and document snapshots, exact-decimal money, idempotency for every external or retryable write, optimistic concurrency for editable drafts, and server-side authorization on every read and mutation.
- Separate source record, patient-facing projection, and delivery event. A patient-visible summary is not the raw scribe transcript or an editable clinical note.
- Each slice needs normal-path, wrong-patient/tenant, expired-session, retry/concurrency, outage, and recovery evidence using synthetic data. A passing build is not release acceptance.

## Milestone 0 — Portal foundation and patient identity

**Outcome:** an invited synthetic patient can sign in to one clinic, see only a minimal dashboard shell, and safely lose or regain access without exposing another person’s data.

**Build:** patient-portal role/capability model; patient-to-portal-identity binding; invitation and accepted-terms records; selected passwordless plus step-up authentication; recovery/revocation; session/device controls; patient dashboard shell with unavailable/empty states; audit events; support runbook; no-store/cache headers and telemetry redaction.

**Explicit exclusions:** public signup, shared accounts, unreviewed proxy/minor access, real communications, clinical data display, and production delivery.

**Principal failures to prove against:** replayed or forwarded invitation; account enumeration; reset bypass; session continuing after revocation; staff selecting the wrong patient; a portal user changing a role; and portal/API cache retention.

**Exit evidence:** approved lifecycle and support policy; server integration tests for tenant/patient/role/session/recovery denials; synthetic desktop/mobile/keyboard/reload checks; audit trail for invite, activation, reset, revoke, and failed access; explicit acceptance that this is still synthetic-only.

## Milestone 1 — Cash-pay ledger, Stripe, and unapplied credit

**Outcome:** a portal patient can see an accurate, plain-language balance and pay an approved posted invoice through a processor-hosted payment element; staff can reconcile the payment without exposing processor/card data.

**Build in order:**

1. Freeze the financial state model: posted invoice, allocation, payment, refund, void, credit, unapplied/prepaid balance, and adjustment. Define which state changes are permitted and who may perform them.
2. Add an append-only `unapplied_credit`/prepayment record and allocation service. The allocation references a posted invoice, is exact-decimal and idempotent, supports partial allocation, and creates an offsetting reversal rather than rewriting history.
3. Implement a narrow patient ledger projection: current balance, available credit, invoice/receipt links, allocation/refund history, and clear empty/error states. Do not expose staff-only notes, processor references, or other patients’ data.
4. After merchant/processor approval, add a Stripe server boundary: payment intent creation/update, idempotency, verified webhook intake, event deduplication, reconciliation/unknown-event queue, and refund/dispute handling. The client uses Stripe-hosted Elements/Apple Pay only; APPly never accepts raw PAN/CVC.
5. Release a payment screen only after the webhook/reconciliation path, failed/abandoned/duplicate-payment handling, receipt policy, and support escalation work end to end in synthetic processor mode.

**Likely blockers and fallback:** Stripe account ownership, test/live credentials, webhook secret custody, tax/receipt numbering, refund/dispute owner, Apple Pay domain verification, and payment-data/telemetry policy. Until resolved, keep payment collection staff-operated and label portal balances read-only.

**Exit evidence:** payment replay, webhook signature, duplicate/out-of-order event, partial allocation, stale invoice, refund, void, and cross-tenant tests; a reconciliation report with unresolved-event state; a synthetic browser checkout; and finance-owner acceptance of the ledger/document policy. This does not approve a live charge.

## Milestone 2 — Intake, booking, and inventory-aware appointment requests

**Outcome:** an authenticated patient can complete approved intake modules and request/book an available appointment without consuming inventory incorrectly or silently overwriting staff changes.

**Build in order:**

1. Convert the intake work into versioned modules with explicit authorship, completion, signature/attestation semantics, correction flow, and patient-visible status. Map only clinician-approved fields into the patient/profile record; retain source/version/provenance.
2. Define schedule authority before UI: provider/site/service/resource calendars, appointment duration, buffers, capacity, cancellation/reschedule policy, timezone, eligibility, booking horizon, waitlist, and staff override. Add conflict-safe availability and a server-side booking transaction.
3. Model inventory impact correctly. Booking a procedure creates a time-bounded reservation/hold only for clinician-approved bill-of-materials items, never a final decrement. Check availability again at confirmation and at consumption; release holds on cancellation/expiry and preserve an audit trail.
4. Provide an appointment dashboard with confirm, cancel, reschedule, and intake status only where the accepted policy permits. During inventory or scheduling outage, fail closed to an explicit staff-contact/manual path rather than creating an unverified booking.

**Likely blockers and fallback:** intake owner’s data contract and consent language; whether the current schedule is authoritative; provider calendars; service catalog/BOM; inventory lot/expiry and multi-site rules; cancellation and deposit policy. Start with appointment requests requiring staff confirmation if real-time authority is not accepted.

**Exit evidence:** synthetic wrong-patient, duplicate submit, concurrent final-slot, timezone/DST, stale availability, expired hold, two-reservation, cancellation/release, and staff-override tests; clinician acceptance of mapped fields; and a complete patient-to-staff booking walkthrough with a documented outage fallback.

## Milestone 3 — Visit summaries, invoices, adjustments, and superbills

**Outcome:** after clinician-approved release, a patient can retrieve a clear visit plan and accurate financial documents without seeing unfinished notes or having historical billing rewritten.

**Build in order:**

1. Create a patient-summary projection pipeline from encounter data. It must require an explicit provider release action, identify the source encounter/version/release time, preserve a snapshot, support a clinically governed correction/addendum, and never auto-publish raw ambient-audio or draft SOAP content.
2. Expand the patient invoice projection using existing ledger/inventory authority: service, retail item, tax/fee, payment, credit, balance, and document state. Staff corrections use a typed adjustment/reversal that references the original line and reason; original posted amounts remain visible in the immutable ledger.
3. Implement receipt/invoice rendering as versioned, access-controlled documents with no-store responses, download/audit events, reprint/reissue rules, and delivery rules approved before email/SMS delivery is added.
4. Treat a superbill as a separately gated product. Build only after a qualified reviewer accepts provider identity, service date, CPT/ICD-10 source/authority, rendering rules, signature/attestation, correction/versioning, disclosure, and HSA/FSA/out-of-network wording. A downloadable PDF is not proof of reimbursement eligibility.

**Likely blockers and fallback:** scribe vendor/data contract, patient-notification policy, provider review capacity, code ownership, document templates, PDF accessibility, and clinical/legal approval. Until approved, expose no visit summary; use staff-provided documents through the accepted existing process.

**Exit evidence:** release/no-release, addendum, wrong-patient, concurrent correction, missing-code, adjustment, document-version, unauthorized download, and retry tests; clinician/finance review of synthetic documents; PDF visual and accessibility checks; and a documented correction/support workflow.

## Milestone 4 — Messages, refills, and results

**Outcome:** patients can submit bounded requests and view only clinician-released results, with clear response-time and emergency expectations; the portal never represents a request as completed care.

**Build in order:**

1. Add message intents, not an unbounded chat first: administrative, appointment, billing, refill request, and clinical question categories; triage queue, ownership/backup, SLA clock, attachments policy, retention, close/reopen state, and non-delivery/outage handling. Prominently state: “Messages are reviewed within 1 business day. For medical emergencies, call 911 or visit the ER.” The clinic must approve the exact response commitment.
2. Add refill requests as request records routed to the appropriate clinical workflow. Do not prescribe, renew, route controlled substances, or state “approved” from the portal without the selected prescriber/e-prescribing workflow and clinical authorization.
3. Add results only from an authoritative lab/result source and only after clinician release. Store result version, reference range/unit/source date, release event, and correction state; use accessible out-of-range indicators that never imply diagnosis. Critical-result escalation remains an externally accepted clinical workflow, not a portal notification.

**Likely blockers and fallback:** messaging support coverage, after-hours escalation, attachment/ePHI policy, lab interface and reference-range provenance, result release protocol, e-prescribing/vendor scope, and controlled-substance rules. Until each is accepted, show contact instructions or a read-only “not available” state rather than a request control.

**Exit evidence:** message routing/assignment/escalation/duplicate/outage tests; refill authorization denials; unreleased/amended/corrected-result tests; WCAG-oriented keyboard/screen-reader/color checks; and clinician/operator tabletop of missed-SLA, critical-result, and provider-unavailable scenarios.

## Launch gate — limited pilot before broad availability

Do not set a calendar release merely because the milestones are coded. A limited pilot needs a named clinic, a bounded audience, accepted support coverage, approved vendors/contracts, production recovery and monitoring evidence, privacy/security and professional-review outcomes, accessibility evidence, onboarding/training, and a rollback/manual-continuity plan.

Pilot measures should be operational, not invented clinical claims: activation completion, booking/payment reconciliation exceptions, message SLA adherence, document delivery failures, support escalations, downtime/recovery behavior, and confirmed patient-facing defects. Review the evidence before widening access.

## Recommended immediate next slice

The first synthetic Milestone 0 slice is implemented locally: a patient-to-portal identity binding, dev-only patient login, no-store patient-scoped context endpoint, audit read event, and responsive dashboard shell. The context projection now includes synthetic appointments, ledger invoices/payments, intake status, released-note summaries, results, active medications, message metadata, and retry-safe patient request status. The portal can accept encrypted general-question and refill-request submissions, but payment collection, outbound message delivery, clinical refill approval, real-time booking, and document delivery remain visibly unavailable until their source systems and owners are accepted.

Next, add the lifecycle contract (invitation/step-up/recovery/revocation), staff triage/outbox integration for patient requests, and server-side intake request records. Keep the synthetic profile and all fixtures isolated to local/test environments; do not infer that this implementation authorizes production patient data or charges.

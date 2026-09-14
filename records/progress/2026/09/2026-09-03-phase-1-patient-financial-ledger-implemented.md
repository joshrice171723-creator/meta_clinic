---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Phase 1 patient financial ledger implemented

**Implementation:** delivered the first bounded cash-pay billing slice from [Cash-Pay Billing Implementation Package](../../../superseded-plans/Cash-Pay%20Billing%20Implementation%20Package.md). Rails now exposes `GET /api/clinic/patients/:id/billing_ledger`, a `clinic-patient-ledger-v1` projection scoped through the current practice and existing `billing.read`/legacy `patients.read` capability boundary. It reads the current invoice, invoice-line, allocation, credit-note, payment-event, and refund-event records with exact-decimal strings; derives a posted invoice balance from posted lines minus allocations and credits; and does not expose the stored processor reference. The React Patient balances surface now uses that projection for identity-only lookup, selected-patient balance summaries, an invoice ledger/detail, payment allocation history, payment-level refund history, and explicit empty/loading/error states. No financial write path was added.

**Evidence and limits:** TypeScript typecheck and production Vite build pass; changed frontend files pass Prettier; Impeccable mechanical detection returned no findings; local synthetic desktop and 768 px narrow browser checks confirmed selection, loading, empty-ledger, and bounded layout behavior. A focused Rails integration regression was added for permission-scoped projection, exact totals, credits/refunds, and omission of `external_event_reference`; final focused Rails execution/commit/push evidence is pending at the time of this entry. The project-wide Prettier command still reports pre-existing formatting drift outside the changed files. No migration, cash drawer, tender/payment collection, receipt/superbill, Stripe/processor integration, real payment, real/confidential data, deployment, or release approval occurred.

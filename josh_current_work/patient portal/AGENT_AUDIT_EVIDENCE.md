# Patient Portal implementation evidence

Date: 2026-09-04

## Scope

This checkpoint implements the owner-approved local billing-only patient portal first release and Omni's local development preview. It is not the formal evidence-first audit.

## Expected evidence

- Normal patient sessions resolve one active portal identity and its assigned patient only.
- The context projection contains billing data only: invoices, lines, balances, credits, payment history, allocations, refunds, and receipt-availability state.
- Appointment, intake, clinical, reminder, messaging, refill, and request data are absent from the projection and their dormant endpoints return `patient_portal_billing_only` before any action executes.
- Omni can enter through the local development login, see a session-scoped patient selector, and switch among any patients in Omni's assigned practice.
- Invalid IDs, another-practice IDs, ordinary patient sessions, nonlocal requests, and production requests do not gain preview access.

## Verification status

The focused Rails integration test and web checks are run after implementation and recorded in the final handoff. No browser acceptance or formal audit is claimed by this document.

## Remaining blocked gates

Provider/Stripe account and webhook custody, finance/tax/receipt policy, PDF and email delivery, checks/OCR, card-present equipment, Superbills, real data, security/privacy review, accessibility evidence, operations/recovery, deployment, and go/no-go approval remain blocked. Omni preview is not production impersonation and cannot be used with real patient data.

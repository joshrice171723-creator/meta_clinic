---
type: verification
status: synthetic-boundary-only
updated: 2026-09-03
---
# Stripe card boundary — synthetic verification

This record covers the additive provider-neutral card collection seam in `apps/api`. It does not authorize a Stripe account, credentials, live mode, hosted deployment, card collection, or payment application.

Implemented in this slice:

- A practice-scoped `Clinic::PaymentCollectionIntent` owns the posted invoice, patient, exact amount/currency, opaque correlation reference, request key, processor, test mode, and explicit state transitions.
- `Clinic::Billing::CreateCollectionIntent` requires the existing billing payment permission, locks the invoice, rejects live mode, enforces the authoritative posted-invoice balance, and reuses or conflicts on a practice-scoped request key.
- `Clinic::PaymentProcessorEvent` stores only verified, normalized, redacted evidence. It never stores the raw webhook body or card data.
- `Clinic::Billing::ProcessorWebhookVerifier::Stripe` is a dependency-free test seam for raw-body HMAC verification with timestamp tolerance. `IngestProcessorEvent` deduplicates by practice/processor/event reference and rejects the same reference with a different payload digest.
- Events linked by an opaque intent metadata reference are `normalized`; unmatched verified events are `needs_reconciliation`. No event creates an APPly payment event or allocation.

Synthetic focused tests: `test/services/clinic/billing/payment_collection_boundary_test.rb` covers test-only intent creation, idempotent replay/conflict, live-mode denial, exact raw-body verification, redaction, duplicate/out-of-order-safe ingestion, unmatched reconciliation state, and stale/tampered signature rejection.

Authority blockers before any real connection remain: processor account ownership and agreement, country/currency/card-present scope, privacy/security and PCI/BAA review, secret-manager and rotation/alerting design, retention/logging policy, dispute/refund handling, disaster recovery, live/test key separation, and an accepted operator workflow for applying a verified terminal outcome to the Rails ledger. These are not established by this source or its tests.

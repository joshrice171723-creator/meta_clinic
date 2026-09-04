# Cash-Pay Billing Build Plan

## Source, scope, and rules

This plan turns the [cash-pay billing roadmap](ROADMAP.md) into implementation work. The live APPly package and test plan remain authoritative for actual route names, current status, and evidence:

- [Implementation package](../../APPlyVault/03%20Execution/Cash-Pay%20Billing%20Implementation%20Package.md)
- [Test plan](../../APPlyVault/03%20Execution/Cash-Pay%20Billing%20Test%20Plan.md)
- [Progress log](../../APPlyVault/03%20Execution/Progress%20Log.md)

Use Rails for authority and persistence, PostgreSQL for constraints and locking, and MUI for new staff UI. Use exact-decimal strings across JSON. Every change is additive and forward-only. Keep unrelated dirty work outside the billing commit.

## Build status

| Workstream | Current build state | Next build gate |
|---|---|---|
| Ledger/receivables | Implemented locally | Re-run Rails proof after the shared test database migration conflict is cleared; capture browser evidence. |
| Cash drawers | Implemented locally | Hosted accounting/reconciliation policy and browser proof. |
| Manager reconciliation | Implemented locally | Re-run Rails integration evidence; approve reopen/correction policy. |
| Check intake | Metadata-only, fail-closed boundary | Choose provider and approve image custody/retention/access before adding a scan path. |
| Receipts | Basic cash HTML only | Approve numbering, service date, template, PDF, reissue, delivery, and retention contract. |
| Stripe | Synthetic boundary only | Approve account owner, contracts, test credentials, supported scope, and security review. |
| Release | Offline source gates in CI | Provide authorized hosted environment, secrets/recovery ownership, and release sign-off. |

## Immediate APPly completion handoff

The implementation package's remaining unblocked Phase 1.5 work is shipped in APPly. Do not reimplement it or broaden the scope while the shared test database is blocked by concurrent patient-portal migrations.

| Step | Action | Exit evidence |
|---|---|---|
| 1 | Re-run the focused Rails workspace and administrative-permission tests after the pending portal migrations are applied in the task-owned test database. | Tests complete without migration or lock errors; billing assertions and authorization denials pass. |
| 2 | Exercise `POST /api/clinic/payment_events/:id/allocations` with same-patient/same-currency posted invoices, then verify cross-practice, cross-patient, currency mismatch, draft, over-allocation, read-only, and identical/conflicting replay behavior. | Exact-decimal response and unchanged ledger on every rejected request. |
| 3 | Run bounded web verification: full Vitest, typecheck, production build, targeted formatting, `bin/verify-vault`, and `git diff --check`. | Named command, result, commit, and warning/limit recorded. |
| 4 | Capture synthetic browser proof for draft edit → post → partial/unapplied payment → later remainder allocation → invoice audit history at desktop/tablet/narrow widths. | Screenshots or equivalent evidence with API availability and viewport recorded. |
| 5 | Update the audit plan and APPly progress log, then reassess the blocked production gates below. | No unverified claim is marked production-ready. |

The APPly branch is currently clean relative to `origin/main` for the billing commits, but unrelated patient-portal files remain dirty and must stay outside billing commits. The last Rails rerun was blocked before assertions by pending concurrent migrations; the last full Vitest run was stopped after no bounded completion output. Typecheck, Vite production build, Ruby syntax, targeted Prettier, and vault verification passed.

## Existing APPly implementation map

### Rails authority and data

Preserve `Clinic::Invoice`, `Clinic::InvoiceLine`, `Clinic::PaymentEvent`, `Clinic::PaymentAllocation`, `Clinic::CreditNote`, and `Clinic::RefundEvent` as the financial ledger. Existing imported payment events remain source-unknown unless reconciled with verified evidence.

Implemented local cash records:

- `Clinic::CashDrawerSession`: practice/site-scoped open or closed session, opening float, count, discrepancy, close evidence, and manager reconciliation evidence.
- `Clinic::CashTender`: immutable tendered amount and change linked to one payment event and drawer session; practice-scoped replay key.
- `Clinic::BillingReceipt`: immutable payment/refund receipt metadata and payload.

Implemented future-facing processor records:

- `Clinic::PaymentCollectionIntent`: server-owned expected amount/currency/correlation and state.
- `Clinic::PaymentProcessorEvent`: deduplicated provider identity, event type/version, normalized status, and redacted evidence.

Never accept patient/practice/actor/amount/balance/status/audit fields from the browser as authority.

### Current route seams

- `GET /api/clinic/patients/:id/billing_ledger`
- `POST /api/clinic/invoices/:id/cash_payments`
- `GET/POST /api/clinic/cash_drawers`
- `POST /api/clinic/cash_drawers/:id/close`
- `POST /api/clinic/cash_drawers/:id/reconcile`
- `POST /api/clinic/payment_events/:id/cash_refunds`
- `POST /api/clinic/payment_events/:id/allocations`
- `GET /api/clinic/payment_events/:id/receipt`

Future routes must be introduced only after contract approval: generalized payment tenders, check provider callbacks, Stripe webhooks, superbill requests, and versioned document delivery.

### Current staff UI

`Billing.tsx`, `BillingDashboard.tsx`, and `CashDrawerOperations.tsx` consume server contracts for ledger lookup, draft editing, unapplied allocation, cash collection, receipt access, close, and manager reconciliation. UI must display server-derived values and preserve explicit drawer selection when more than one physical site is available.

## Work packages

### WP-01 — Stabilize ledger and receivables evidence

1. Clear or isolate the unrelated patient-portal migration conflict in the task-owned test database.
2. Re-run draft edit, unapplied allocation, tenant denial, posted-line immutability, and audit-history Rails tests.
3. Capture synthetic desktop, tablet, and narrow browser evidence once the API context is available.
4. Keep derived aging and unapplied totals server-owned.

Acceptance: no financial assertion failures, no cross-scope leakage, and the UI never recalculates authoritative totals.

### WP-02 — Harden cash and manager reconciliation

1. Keep opening float, tender, change, refund, expected cash, count, and discrepancy immutable after close.
2. Require manager capability, closed state, tenant scope, reviewer identity, nonblank note, and practice-scoped request key for reconciliation.
3. Preserve safe identical replay and reject conflicting replay.
4. Decide whether a later correction is a new adjustment/review record or an approved reopen transition; never silently edit the original close.

Acceptance: transaction, concurrency, authorization, replay, and discrepancy-preservation tests pass.

### WP-03 — Check provider integration (gated)

1. Record provider owner, environment, required fields, and contract/BAA decision.
2. Extend the current fail-closed adapter behind an explicit provider configuration and feature flag.
3. Define image transport and custody; default to no raw image persistence.
4. Add redacted OCR result normalization, operator review, unknown/error handling, dedupe, and audit evidence.
5. Hand verified amount/reference into the existing locked payment-event/allocation operation.

Acceptance: provider test mode only, no raw image in logs/fixtures, authorization and deletion tests, and explicit go/no-go.

### WP-04 — Production receipt documents (gated)

1. Approve invoice numbering lifecycle, uniqueness, void behavior, and service-date semantics.
2. Add forward-only fields and constraints with a backfill plan that does not invent historical values.
3. Define a versioned receipt snapshot containing approved clinic identity, invoice/service date, line snapshots, payment/refund totals, balance, receipt ID, and version.
4. Add rendered PDF/digest storage, scoped download, reprint lineage, reissue correction, delivery audit, retention, and no-store behavior.
5. Review synthetic render output at supported sizes and with long values.

Acceptance: professional/privacy review, immutability/reissue tests, authorization tests, and synthetic PDF evidence.

### WP-05 — Stripe card source (gated)

1. Approve account owner, countries/currencies, card-present scope, refund/dispute policy, contracts, and test/live key separation.
2. Keep secrets in the approved server secret manager; never store PAN/CVC or sensitive data in APPly.
3. Create/reuse one processor intent per collection intent with a server-owned idempotency key.
4. Verify raw-body webhook signatures and timestamp/replay window; dedupe provider event IDs.
5. Keep unmatched/out-of-order events in reconciliation states; apply to the APPly ledger only after verified terminal outcomes.
6. Add redaction, duplicate, invalid-signature, out-of-order, timeout, and unknown-outcome tests.

Acceptance: provider test-mode evidence and security/privacy review. Live credentials and live transactions require separate authorization.

### WP-06 — Release and operations

1. Keep offline release-readiness checks in CI.
2. Name hosted environment, deployment owner, on-call owner, secrets/recovery owner, and rollback authority.
3. Verify backup/restore rehearsal, health/readiness, migration compatibility, digest pairing, alerting, and incident runbooks.
4. Perform access review, log redaction review, dependency review, accessibility review, and privacy/professional sign-off.
5. Pilot one synthetic tenant with a kill switch and bounded volume before any real data.

Acceptance: no open P0/P1 findings, reproducible evidence, and written go/no-go approval.

## Testing contract

- Focused Rails tests for each mutation, negative authorization path, exact-decimal boundary, idempotent retry, and concurrency lock.
- Web contract tests, typecheck, build, changed-file formatting, and responsive browser smoke when API context is available.
- Release/readiness, secret/log redaction, vault verification, and `git diff --check` on every scoped package update.
- Synthetic fixtures only. Never use real card, check, patient, or processor data.

## Change and handoff protocol

1. Pull and inspect status before editing; preserve unrelated dirty files.
2. Work one cohesive work package at a time and name its acceptance evidence.
3. Have Luna implement and audit; do not use Terra.
4. Update the roadmap, build plan, audit plan, and APPly progress evidence after each gate.
5. Commit scoped changes, pull/merge safely, push, and verify `main...origin/main`.
6. Report shipped, blocked, inconclusive, and unverified claims separately.

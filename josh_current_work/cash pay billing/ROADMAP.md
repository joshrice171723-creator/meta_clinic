# Cash-Pay Billing Roadmap

## Objective

Deliver a professional, auditable cash-pay billing capability for APPly clinics. Staff must be able to create and manage receivables, collect cash safely, track drawer cash, reconcile discrepancies, and issue truthful receipts without making the browser or a payment provider the financial authority.

The implementation source of truth is the APPly package: [Cash-Pay Billing Implementation Package](../../APPlyVault/03%20Execution/Cash-Pay%20Billing%20Implementation%20Package.md). This folder is the cross-project roadmap handoff: it defines sequencing, ownership, production gates, and the build/audit artifacts.

## Current position

Completed in APPly's local synthetic scope, with this pass completing the approved billing-only portal and Omni preview wiring:

- Practice- and patient-scoped ledger with exact-decimal balances, credits, refunds, aging, and audit history.
- Draft invoice create/edit/post workflow and intentional allocation of retained unapplied payment amounts.
- Cash drawer open/close, cash tender/change, cash-only refunds, immutable printable HTML receipts, replay protection, and manager discrepancy reconciliation.
- Fail-closed metadata-only check/OCR boundary; no image, bank data, provider credential, or external scan is accepted.
- Synthetic Stripe collection-intent/provider-event boundary with HMAC verification, deduplication, redaction, and reconciliation states; no account, SDK, live key, or card data. Online card payments are the approved first-release direction, but provider implementation remains blocked pending the provider/security/operations approvals below.
- Offline release-readiness gates for source, digest, health, backup/restore, container, and secret/log contracts.

The remaining implementation pass is limited to the approved local synthetic workflow: billing-only patient portal projection, read-only Omni patient switching, and current receipt/ledger presentation. Browser acceptance is intentionally deferred until the single final audit. Unrelated clinical portal actions, check/OCR intake, Superbills, card-present payments, real provider calls, document delivery, and deployment remain outside the enabled scope.

Owner scope decisions and working defaults are recorded in [OWNER_DECISIONS.md](OWNER_DECISIONS.md). Superbills are explicitly out of scope; all other listed capabilities are approved for the roadmap subject to their implementation, review, and release gates.

## APPly handoff — 2026-09-03

The unblocked receivables work from the APPly implementation package is now shipped upstream. The handoff includes guarded draft create/edit/post, server-owned ledger search/filter/sort/pagination and aging, invoice audit history, intentional unapplied payment totals, and a locked route for allocating an unapplied remainder to another posted invoice for the same patient and currency. The patient-ledger UI exposes the remainder and an explicit eligible-invoice allocation control.

Relevant upstream commits: `e9149b7` (draft edit authority), `ea2ddfc` (receivables integration coverage), `45846ab` (existing-remainder allocation API), `8855fa8` (staff allocation UI), and `51e9ac2` (APPly package/test-plan/progress update).

### Definition of done for this handoff

1. Keep invoice/service-date/receipt policy decisions explicit and implement only the approved local defaults.
2. Finish the billing-only patient portal projection and the server-gated, read-only Omni preview with synthetic patient switching.
3. Run the focused Rails and web checks after implementation, then run one final end-to-end audit across source, tests, runtime, browser behavior, and approvals.
4. Update this roadmap, the APPly package/test plan/progress log, and the audit finding register with command output, commit, viewport, and remaining limitations.

This handoff is complete when the local synthetic implementation and one final audit pass. It does not authorize real payments, processor credentials, patient data, document delivery, or deployment.

## Product boundaries

- Rails/PostgreSQL remains authoritative for identity, practice/site scope, permissions, invoice totals, allocations, refunds, drawer state, receipts, and audit history.
- All tests use synthetic data. No real patient, card, check, processor, or delivery data is permitted in development evidence.
- Cash pay does not remove privacy, accounting, professional, tax, or records obligations.
- A receipt is not a superbill. Superbills are explicitly out of scope for this roadmap.
- Stripe, check scanning, patient portal, and hosted release are gated integrations, not implied by local adapter seams.

## Delivery sequence

### Phase 0 — Acceptance and policy contract

Approve the invoice-numbering rule, service-date meaning, receipt fields/template/delivery/reissue policy, check provider and image custody, Stripe ownership and supported scope, reconciliation correction policy, retention, support, and release responsibilities.

Exit: decisions have owners, versioned policy text, and no unresolved production-authority ambiguity.

### Phase 1 — Ledger and receivables operations

Maintain the existing ledger as the source of truth. Support guarded draft authoring, immutable posted lines, exact-decimal allocation, unapplied remainder handling, derived aging, audit history, and scoped staff views.

Exit: API authorization, tenant isolation, negative tests, focused web contract checks, and synthetic desktop/narrow evidence pass.

### Phase 2 — Cash terminal and drawer control

Support cash tender/change, cash-only refunds, one open drawer per site, non-blocking staff close, immutable discrepancy, manager reconciliation, replay safety, and printable cash-event receipts.

Exit: Rails transaction/concurrency/authorization tests pass; UI consumes server-derived totals; browser evidence is captured when the local API context is available.

### Phase 3 — Check intake (deferred)

Checks/OCR are deferred from the first release. Keep the existing metadata-only, fail-closed boundary until a later provider, image custody, retention, deletion, access, bank-data, and operator-review decision exists.

Exit: provider test-mode evidence, redaction/access tests, duplicate/unknown outcomes, and an explicit operator review path pass.

### Phase 4 — Receipt/document contract (locally bounded; production gated)

Use the approved local defaults for invoice numbering, service date, immutable receipt snapshots, reprint/reissue lineage, and verified-address email intent. PDF rendering, delivery, retention, and production document acceptance remain gated until the detailed policy and environment approvals exist.

Exit: synthetic rendered-document review, authorization/immutability tests, delivery/reissue evidence, and professional/privacy sign-off pass.

### Phase 5 — Online card processor integration (provider-gated)

After processor ownership and contracts are approved, extend the existing server-owned collection intent and verified webhook boundary with a hosted/Payment Element flow, monotonic event handling, reconciliation queue, redacted logs, and test/live key separation. Card-present remains deferred until equipment is available.

Exit: processor test-mode duplicate/out-of-order/invalid-signature/unknown-outcome evidence and security review pass. Live keys remain a separate authorization.

### Phase 6 — Release and controlled pilot

Complete hosted environment, secrets manager, backup/restore, health/readiness, alerting, runbooks, access review, incident response, accessibility, privacy/security/professional review, support scripts, and pilot rollback.

Exit: zero open P0/P1 findings, reproducible release evidence, named on-call owner, rollback rehearsal, and written go/no-go approval.

## Cross-cutting completion criteria

- No browser-supplied actor, practice, balance, status, allocation, processor outcome, or audit field can determine a financial write.
- Every money event is exact-decimal, tenant-scoped, idempotent where retried, auditable, and safe under concurrency.
- Corrections add immutable history; they never overwrite posted financial facts.
- UI status distinguishes pending, success, failure, unknown, blocked, and reconciled states.
- Logs and provider payloads exclude raw card/check/image data and unnecessary patient detail.
- Every production claim is labeled as source-inspected, automated-test verified, live-observed, policy-approved, or blocked.

## Related artifacts

- [Build plan](CASH_PAY_BILLING_BUILD_PLAN.md)
- [Audit plan](CASH_PAY_BILLING_AUDIT_PLAN.md)
- [APPly implementation package](../../APPlyVault/03%20Execution/Cash-Pay%20Billing%20Implementation%20Package.md)
- [APPly test plan](../../APPlyVault/03%20Execution/Cash-Pay%20Billing%20Test%20Plan.md)
- [APPly progress log](../../APPlyVault/03%20Execution/Progress%20Log.md)
- [Owner decisions](OWNER_DECISIONS.md)

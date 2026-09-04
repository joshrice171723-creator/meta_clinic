# Cash-Pay Billing Audit Plan

## Purpose and boundaries

Verify that APPly cash-pay billing is financially correct, tenant-safe, privacy-preserving, understandable, accessible, observable, and ready for a controlled release. This is an implementation-readiness audit, not legal, tax, accounting, HIPAA, PCI, or professional certification.

Use the [roadmap](ROADMAP.md), [build plan](CASH_PAY_BILLING_BUILD_PLAN.md), and live APPly [implementation package](../../APPlyVault/03%20Execution/Cash-Pay%20Billing%20Implementation%20Package.md) as the connected source set.

## Evidence rules

Every result must be labeled one of:

- **Automated pass:** named command, environment, test count, assertions, and commit.
- **Live observed:** real local synthetic flow, viewport, date, and screenshot/evidence link.
- **Source inspected:** exact file/route/model and reviewer.
- **Policy approved:** named owner, decision date, and versioned policy.
- **Blocked:** prerequisite, authority, credential, or runtime unavailable.
- **Inconclusive:** bounded run did not produce trustworthy evidence; rerun once before changing code.

Never label a synthetic adapter, offline gate, or passing unit test as a live provider or production approval.

## Current APPly evidence and retest queue — 2026-09-03

### Shipped locally and pushed

- Draft invoice edit is restricted to `draft`; posted lines remain immutable and audited.
- `POST /api/clinic/payment_events/:id/allocations` allocates an existing payment remainder through the locked Rails operation and returns exact allocated/unapplied totals.
- The patient ledger and MUI staff surface expose unapplied amounts and eligible target invoices without making the browser authoritative.

### Evidence already collected

- Automated pass: web typecheck, Vite production build, targeted Prettier, Ruby syntax, and vault verification.
- Source inspected: practice-scoped route/controller, existing `AllocatePayment` lock/idempotency path, patient ledger serializer/query, capability gate, and MUI allocation control.
- Blocked/inconclusive: focused Rails rerun could not boot because two concurrent patient-portal migrations are pending in the shared test database; the full Vitest run produced no completion output in a bounded window and was stopped. No billing assertion failure was observed.

### Required retest before closing the receivables gate

1. Re-run the focused Rails workspace and permission tests after the concurrent migration state is resolved, without staging or resetting those portal changes.
2. Add or verify explicit denials for cross-practice and cross-patient invoice IDs, currency mismatch, draft/void targets, over-allocation, read-only actors, and conflicting replay intent on the new remainder route.
3. Capture synthetic desktop/tablet/narrow browser evidence for draft edit, post, partial/unapplied payment, later remainder allocation, and audit history once the API context is available.
4. Record command, commit, environment, viewport, and limits in this plan and the APPly progress log.

## Required audit evidence

- Commit, branch, dependency lockfile, runtime, schema/migration state, and environment description.
- Route, model, service, capability, audit, UI, worker, provider, and configuration inventory.
- Focused Rails/web/release tests with counts, assertions, and failure output where applicable.
- Synthetic fixtures and seed instructions; proof that no real patient/card/check data was used.
- Browser evidence for desktop, tablet, and narrow flows when the local API context is available.
- Data-flow diagram for ledger, drawer, receipt, check adapter, processor boundary, logs, and release systems.
- Policy decisions for numbering, service date, receipt delivery/reissue, check custody, processor scope, retention, support, and release ownership.
- Open findings register with severity, owner, remediation, retest, and decision deadline.

## Audit workstreams

### A. Ledger and receivables

Trace draft create → edit → post → allocation → unapplied remainder → later allocation → audit timeline. Verify posted lines cannot be edited, balances are server-derived, exact-decimal strings survive JSON, and a payment remainder cannot cross patient/practice/currency scope.

Minimum denials: read-only mutation, cross-practice IDs, cross-patient invoice, over-allocation, invalid decimal, conflicting replay key, and stale version.

### B. Cash terminal and drawer

Trace open drawer → cash tender/change → receipt → cash refund → expected cash → staff close → manager reconciliation. Verify one open drawer per physical site, immutable expected/count/discrepancy, non-blocking staff close, manager-only reconciliation, safe identical replay, and no financial fact changes during reconciliation.

Minimum denials: closed drawer collection/refund, open-drawer reconciliation, missing note/key, read-only actor, cross-practice ID, mismatched replay intent, over-refund, and imported/non-cash refund.

### C. Check intake

Verify the default path fails closed without approved provider/policy. Test rejection of image/blob/object fields, unbounded references, invalid amount/currency, and unsupported keys. Inject a synthetic adapter result and confirm only opaque status and field-presence metadata leave the boundary.

Before provider launch, audit image transport/custody, retention/deletion, access logging, provider failure/unknown states, bank-data handling, dedupe, and handoff into the locked payment operation.

### D. Receipts and documents

Audit the basic cash HTML receipt for scope, no-store headers, immutability, and absence of processor references. Keep production document work blocked until invoice numbering, service date, clinic identity, template fields, PDF/digest, delivery, reprint/reissue, retention, and superbill boundaries are approved.

Minimum denials: cross-practice receipt ID, unauthorized patient, altered issued payload, unscoped download, and correction that overwrites history.

### E. Stripe boundary

For the synthetic boundary, verify collection-intent idempotency, provider-event uniqueness, raw-body HMAC timestamp tolerance, redaction, unmatched/out-of-order state, and no automatic ledger application. Before real integration, audit account ownership, contracts/BAA applicability, test/live key separation, Payment Element scope, webhook secret rotation, refund/dispute policy, and reconciliation ownership.

Never use real keys, PAN, CVC, or live transactions in this audit.

### F. Release, security, and operations

Run the offline release-readiness gate and inspect CI wiring, digest pairing, health/readiness probes, backup/restore isolation, migration compatibility, container boundaries, and secret/log redaction. Confirm hosted environment, on-call, secrets, recovery, incident, access-review, privacy, professional, and accessibility owners before release approval.

## Role and scope matrix

| Actor | May read | May mutate | Must be denied |
|---|---|---|---|
| Billing reader | Scoped ledger, invoice, permitted receipt status | None | Draft/post/payment/refund/close/reconcile/export |
| Billing operator | Scoped ledger, invoice, drawer, receipts | Draft/post, cash/check entry when approved, staff close | Manager reconciliation, processor configuration, cross-scope data |
| Reconciliation manager | Scoped closed drawers and discrepancy evidence | Manager reconciliation with note and request key | Patient/practice escape, posted financial edits, processor secrets |
| Supervisor/admin | Explicitly assigned operational review | Approved corrections/configuration only | Unbounded clinical or secret access |
| Unauthenticated | Public health surface only | None | Any patient, financial, provider, or release data |

Test each role across tenant, practice, site, patient, invoice, payment, drawer, receipt, and provider-event IDs.

## Severity and release gates

- **P0 — block:** wrong patient/practice disclosure, unauthorized money mutation, duplicate collection, bypassed opt-out/reconciliation control, raw card/check leakage, or inability to stop a provider/release.
- **P1 — block pilot:** incorrect exact-decimal result, broken tenant lock, replay duplication, incorrect drawer discrepancy, forged webhook acceptance, missing audit trail, inaccessible critical action, or unrecoverable migration/restore failure.
- **P2 — track:** confusing copy, incomplete filter, weak diagnostic, or non-critical layout issue with owner and deadline.
- **P3 — backlog:** polish that does not affect comprehension, safety, or recoverability.

Release requires zero open P0/P1 findings, passing role/isolation tests, evidence for replay and correction safety, redacted logs, backup/restore rehearsal, accessibility review, privacy/security/professional approval, named support/on-call owners, and a written go/no-go decision.

## Test matrix

| ID | Assertion | Evidence required | Current state |
|---|---|---|---|
| AUD-01 | Ledger is exact and scoped | Rails integration plus denial cases | Local pass; Rails rerun may be environment-blocked |
| AUD-02 | Cash terminal is atomic and replay-safe | Focused transaction/concurrency gate | Local pass |
| AUD-03 | Drawer close/reconcile preserves facts | Staff/manager role and discrepancy tests | Implemented; rerun Rails evidence when DB is available |
| AUD-04 | Check boundary cannot scan or persist without authority | Adapter unit tests and source inspection | Pass for fail-closed boundary; provider blocked |
| AUD-05 | Receipt is scoped and immutable | Response/header and negative authorization tests | Pass for basic HTML; production document contract blocked |
| AUD-06 | Stripe boundary cannot accept forged/out-of-order events | HMAC/dedupe/redaction tests | Synthetic pass; real integration blocked |
| AUD-07 | Release controls cannot be bypassed | Offline CI/readiness and redaction tests | Pass offline; hosted evidence blocked |
| AUD-08 | Visible cash journey works at supported sizes | Browser screenshots with API context | Blocked by local Loading/API context |

## Finding and retest protocol

1. Record exact command, commit, environment, scope, expected result, actual result, and evidence.
2. If a coding defect is found, Luna performs the repair and retest. Terra is not used.
3. If the run is blocked by authority or environment, record it as blocked; do not speculate or relabel it pass.
4. Retest the failed path and its neighboring invariants after every repair.
5. Update this plan, the roadmap, and the APPly progress log before closing the gate.

## Audit outputs

- Executive readiness summary with shipped, synthetic-only, blocked, and unverified claims separated.
- Findings register with severity, evidence, root cause, owner, remediation, and retest criteria.
- Role/scope denial matrix and data-flow/retention summary.
- Test and browser evidence index tied to commits.
- Release recommendation: go, conditional go, or no-go, with explicit approvals and unresolved risks.

# Cash-Pay Billing Audit Evidence

Date: 2026-09-03
Evidence commit: `d804ad3`
Evidence branch: `main`
Push status: pushed; `origin/main` advanced from `d92d2cc` to `d804ad3`

## Finding addressed

The existing remainder route accepted only `invoice_id` and `amount`. Its allocation operation was naturally repeatable for the same payment/invoice pair, but it had no request-key receipt. A retry with the same client intent redirected to another invoice could therefore be interpreted as a new allocation. This was a replay-safety gap at the route boundary.

## Evidence recorded

### Source inspected

- `apps/api/app/controllers/clinic/billing/payment_events_controller.rb`: practice-scoped payment/invoice lookup, capability gate, exact-decimal input validation, idempotency wrapper, replay resource resolution, and audit recording.
- `apps/api/app/services/clinic/billing/allocate_payment.rb`: posted-invoice, same-patient, same-currency, payment remainder, invoice balance, and locked allocation checks.
- `apps/api/app/services/clinic/idempotency.rb`: practice/actor request receipt, canonical payload digest, safe identical replay, conflicting replay rejection, and append-only receipt behavior.
- `apps/web/src/features/clinic/Billing.tsx`: request-key generation and retry preservation in the real patient-ledger allocation control.

### Automated pass

- Ruby syntax passed for the changed controller and integration test.
- TypeScript typecheck passed.
- Scoped whitespace check passed.
- Commit scope passed: no `patient_ledger.rb`, concurrent migrations, or unrelated files were included.

### Test coverage added but not yet executable

`ClinicWorkspaceTest` now asserts synthetic denials for cross-practice, cross-patient, currency mismatch, draft, void, over-allocation, and excessive decimal precision. It also asserts billing read-only denial, one-write identical replay, conflicting replay, exact unapplied totals, one durable operation receipt, and no duplicate allocation.

The assertions are **unverified** because the shared test DB had pending concurrent migrations. A separate clone avoided changing that shared DB, but current concurrent test-seed code requires `clinic_communication_endpoints`, which is not present in the clone. The clone migration attempt was blocked by unavailable `pg_dump`; no shared migration was run.

## Scope and authorization matrix

| Boundary | Expected result | Current evidence |
| --- | --- | --- |
| Billing operator, same patient/currency, posted target, positive exact amount | One allocation and durable receipt | Source inspected; test added; runtime unverified |
| Identical request key and payload | Same allocation, no second write | Source inspected; test added; runtime unverified |
| Same key with changed invoice or amount | Conflict, unchanged ledger | Source inspected; test added; runtime unverified |
| Read-only billing role | Forbidden before mutation | Existing capability gate plus test added; runtime unverified |
| Foreign practice invoice | Not found through current-practice scope | Scoped lookup plus test added; runtime unverified |
| Same-practice foreign-patient invoice | Unprocessable; service patient check | Service inspected plus test added; runtime unverified |
| Currency mismatch, draft, or void target | Unprocessable; service state/currency checks | Service inspected plus test added; runtime unverified |
| Over-allocation or unsupported precision | Unprocessable; exact-decimal and locked total checks | Service/controller inspected plus test added; runtime unverified |
| Browser/API context | No live mutation without available context | Browser evidence blocked |

## Open findings

- **P1 / unverified:** execute the focused Rails assertions after the shared migration/schema state is repaired. Owner: APPly implementation agent. Retest: both focused integration files against a migrated task-owned database.
- **P2 / inconclusive:** rerun targeted Prettier and record completion. Owner: APPly implementation agent. Retest: changed-file formatting check.
- **P1 / blocked:** capture the real synthetic browser journey at desktop, tablet, and narrow widths after the API context leaves Loading. Owner: APPly runtime/UX agent. Retest: no mutation claims until the flow is visibly observed.

These findings do not authorize live payment processing, processor credentials, check images, patient portal exposure, receipt PDF production, or deployment.

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

### Test coverage and runtime execution

`ClinicWorkspaceTest` now asserts synthetic denials for cross-practice, cross-patient, currency mismatch, draft, void, over-allocation, and excessive decimal precision. It also asserts billing read-only denial, one-write identical replay, conflicting replay, exact unapplied totals, one durable operation receipt, and no duplicate allocation.

The task-owned PostgreSQL database `apply_billing_acceptance_20260904` was loaded from the current schema and registered with all current migration versions. Focused billing checks passed: `payment_collection_boundary_test.rb` — 8 runs, 41 assertions; `check_intake_test.rb` — 4 runs, 16 assertions. The broader `clinic_workspace_test.rb` ran serially with 22 runs and 202 assertions, but exposed 1 failure and 1 error.

### Current failures

- **P1 / billing draft edit:** `ClinicWorkspaceTest#test_billing_draft_edits_stay_draft-only_and_payment_allocation_reports_unapplied_remainder` receives the append-only trigger error from `Clinic::Billing::UpdateDraftInvoice`.
- **P1 / allocation validation:** `ClinicWorkspaceTest#test_remainder_allocation_is_scoped,_exact,_authorized,_and_safely_replayed` receives `201 Created` where the existing assertion expects `422 Unprocessable Entity` for the invalid replay case.

## Scope and authorization matrix

| Boundary | Expected result | Current evidence |
| --- | --- | --- |
| Billing operator, same patient/currency, posted target, positive exact amount | One allocation and durable receipt | Source inspected; focused runtime checks pass |
| Identical request key and payload | Same allocation, no second write | Source inspected; focused runtime checks pass |
| Same key with changed invoice or amount | Conflict, unchanged ledger | Source inspected; broader integration assertion currently fails |
| Read-only billing role | Forbidden before mutation | Existing capability gate plus focused runtime checks pass |
| Foreign practice invoice | Not found through current-practice scope | Scoped lookup plus broader integration assertion runs with the two known failures |
| Same-practice foreign-patient invoice | Unprocessable; service patient check | Service inspected; broader integration assertion runs with the two known failures |
| Currency mismatch, draft, or void target | Unprocessable; service state/currency checks | Service inspected; broader integration assertion runs with the two known failures |
| Over-allocation or unsupported precision | Unprocessable; exact-decimal and locked total checks | Service/controller inspected; broader integration assertion runs with the two known failures |
| Browser/API context | No live mutation without available context | Browser evidence blocked |

## Open findings

- **P1 / open:** resolve the two billing regressions above in billing-owned code/tests, then rerun the focused and broader billing checks against a fresh task-owned database. Owner: APPly implementation agent.
- **P2 / resolved:** focused billing formatting and diff checks were completed in the prior implementation run.
- **P1 / blocked:** capture the real synthetic browser journey at desktop, tablet, and narrow widths after the API context leaves Loading. Owner: APPly runtime/UX agent. Retest: no mutation claims until the flow is visibly observed.

These findings do not authorize live payment processing, processor credentials, check images, patient portal exposure, receipt PDF production, or deployment.

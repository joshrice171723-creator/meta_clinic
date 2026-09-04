# Cash-Pay Billing Audit Evidence

Date: 2026-09-04
Evidence commit: `dc7909b` (billing repair), rerun recorded at `e1b3040`
Evidence branch: `joshuarice/sc-132/make-inventory-movement-ledger-p`
Push status: current checkout is synchronized with its configured origin branch; no push was performed in this run.

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

The task-owned PostgreSQL database `apply_billing_acceptance_20260904` was loaded from the current schema and registered with all current migration versions. Focused billing checks passed: `payment_collection_boundary_test.rb` — 8 runs, 41 assertions; `check_intake_test.rb` — 4 runs, 16 assertions. After the billing repair, the two affected integration examples passed: draft edit/payment remainder — 1 run, 10 assertions; scoped remainder allocation/replay — 1 run, 22 assertions. A clean isolated full workspace rerun then passed `test/integration/clinic_workspace_test.rb` — 22 runs, 228 assertions, 0 failures, 0 errors, 0 skips. The scratch database was removed after the run.

The development and test databases both contain 65 migration rows and report migration `20260903001400` as up. The Windows PostgreSQL wrapper is now committed in `e1b3040`; the isolated rerun used the current schema and all migration versions.

### Current failures

- **P1 / live integration evidence:** the billing Rails suite is green, but the authenticated browser journey is still an empty-state/read-only observation. Route/context and narrow-layout evidence remain open.

## Scope and authorization matrix

| Boundary | Expected result | Current evidence |
| --- | --- | --- |
| Billing operator, same patient/currency, posted target, positive exact amount | One allocation and durable receipt | Source inspected; focused runtime checks pass |
| Identical request key and payload | Same allocation, no second write | Source inspected; focused runtime checks pass |
| Same key with changed invoice or amount | Conflict, unchanged ledger | Source inspected; focused remainder integration test passes |
| Read-only billing role | Forbidden before mutation | Existing capability gate plus focused runtime checks pass |
| Foreign practice invoice | Not found through current-practice scope | Scoped lookup plus focused remainder integration test passes |
| Same-practice foreign-patient invoice | Unprocessable; service patient check | Focused remainder integration test passes |
| Currency mismatch, draft, or void target | Unprocessable; service state/currency checks | Focused remainder integration test passes |
| Over-allocation or unsupported precision | Unprocessable; exact-decimal and locked total checks | Focused remainder integration test passes |
| Browser/API context | Authenticated billing workspace renders without mutation | Live `/clinic/billing` DOM observed; ledger empty and payment collection unavailable in this local workspace |

## Open findings

- **P1 / resolved:** clean isolated full workspace rerun passed 22 runs/228 assertions with no failures or errors.
- **P2 / resolved:** focused billing formatting and diff checks were completed in the prior implementation run.
- **P1 / open:** capture the real synthetic browser journey at desktop, tablet, and narrow widths after route/context wiring is available. Owner: APPly runtime/UX agent. Retest: no mutation claims until the flow is visibly observed.

These findings do not authorize live payment processing, processor credentials, check images, patient portal exposure, receipt PDF production, or deployment.

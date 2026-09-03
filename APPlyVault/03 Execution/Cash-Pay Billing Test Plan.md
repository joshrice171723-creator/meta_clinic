---
type: test-plan
status: active
updated: 2026-09-03
---
# Cash-Pay Billing Test Plan

Home: [[00 Home]] · Package: [[Cash-Pay Billing Implementation Package]] · Status: [[Roadmap and Tasks]] · Evidence: [[Progress Log]]

## Purpose and test boundary

This plan is the verification companion to [[Cash-Pay Billing Implementation Package]]. It tests the locally implemented, synthetic cash-pay milestone against the current Rails/PostgreSQL ledger and the React staff surface. It does not authorize real cash, checks, cards, patient data, document delivery, processor accounts, deployment, or release.

Rails remains authoritative for practice/actor authorization, invoice state, exact amounts, allocation, drawer expected cash, idempotency, persistence and receipt records. Browser checks verify presentation, request ownership and visible failure states; they never establish financial correctness by themselves.

## Evidence rules

- **Pass** means the command or scenario ran in the named local environment and produced the expected result.
- **Fail** means an expected assertion, invariant, build, or scoped behavior was violated. A failure is escalated to Terra Med for that exact slice before any unrelated package work continues.
- **Blocked** means a prerequisite or authority is unavailable. It is not a pass and does not trigger speculative implementation.
- **Inconclusive** means the run did not produce trustworthy completion evidence (for example, a timeout or unavailable browser/API). Rerun once with the same bounded scope before escalating a code fix.
- All fixtures and records must be synthetic and visibly labeled. Never include patient names, credentials, card data, check images, raw processor payloads, or secrets in output.

## Test matrix

| ID | Slice and failure hypothesis | Required check | Current status |
| --- | --- | --- | --- |
| DB-01 | Forward migrations can be applied without replacing the existing ledger | Test database prepare/migrate; inspect `db/structure.sql` diff and required tables/constraints | Planned |
| DB-02 | Drawer/tender/receipt rows can cross practices or lose exactness | Composite tenant FKs, decimal checks, unique payment/tender and one-open-drawer-per-site constraints | Planned |
| LED-01 | A billing operator can read only the selected practice/patient ledger | Focused Rails integration: scoped ledger, exact totals, credit/refund projection, omission of processor reference | Pass — Rails file gate: 10 tests / 92 assertions |
| LED-02 | Historical payments are not falsely labeled as cash | Ledger returns `cash_payment: false` and `receipt_available: false` for an ordinary imported event | Pass — covered by the focused Rails file gate |
| PAY-01 | A posted invoice can be paid from an open drawer with correct change | Create synthetic drawer/invoice; record tender and allocation; assert server-derived change and one linked receipt | Pass — covered by the focused Rails file gate |
| PAY-02 | A timeout/retry cannot duplicate money | Replay the same request key with identical intent; assert one payment event, tender and receipt | Pass — covered by the focused Rails file gate |
| PAY-03 | A replay key cannot change its financial intent | Reuse the key with a different drawer/tender/change/allocation; expect a scoped validation error and no new rows | Planned |
| PAY-04 | Partial payment/tender/receipt failure cannot leave a half-recorded trail | Force a transaction failure at the linked write boundary; assert payment event, allocation, tender and receipt all roll back | Planned |
| PAY-05 | Browser-supplied totals or ownership cannot set authority | Forge patient/practice, invoice balance, actor, negative/over-allocation or invalid decimal inputs; expect denial/validation and unchanged ledger | Planned |
| REF-01 | A refund can only reduce cash that was actually collected | Refund a cash payment; assert immutable refund/receipt and expected cash decreases | Pass — covered by the focused Rails file gate |
| REF-02 | Refunds cannot exceed the original cash payment or refund non-cash history | Cumulative over-refund and imported/non-cash refund attempts return validation/authorization errors | Planned |
| DRAW-01 | Only one active drawer exists per physical site | Open twice for one site (reject second); open separate synthetic site (allow) | Planned |
| DRAW-02 | Closing records the observed variance without silently balancing it | Close with short/over count; assert status, counted cash, discrepancy and explanation; staff close remains non-blocking | Pass — covered by the focused Rails file gate |
| DRAW-03 | Closed drawers cannot accept new collection/refund activity | Attempt payment/refund after close; expect rejection and unchanged totals | Planned |
| DRAW-04 | Drawer endpoints enforce practice and capability boundaries | Cross-practice drawer/invoice/payment/receipt IDs and a read-only billing user; expect forbidden/not-found without leakage | Planned |
| REC-01 | A receipt is scoped, immutable and not cached as patient content | Payment/refund receipt returns only linked synthetic fields, `Cache-Control: no-store`, and no processor reference | Pass — covered by the focused Rails file gate |
| REC-02 | Receipt correction does not overwrite history | Reissue/version/PDF/delivery behavior is a blocked production contract; do not mark local HTML as production acceptance | Blocked by approved document contract |
| UI-01 | Staff controls consume the API contract without local financial authority | Web typecheck, build, changed-file formatting and Impeccable detector | Pass — Luna audit: typecheck, build, detector and changed-file checks |
| UI-02 | Staff can complete the visible cash journey at supported sizes | Running local browser: open drawer, select drawer, collect, open receipt, refund, close; desktop/tablet/narrow screenshots | Blocked: local page stayed Loading without API context |
| UI-03 | Multiple physical-site drawers are explicit to the operator | With two open synthetic sites, the UI requires an explicit drawer selection and posts that ID | Planned |
| REG-01 | Existing clinic billing behavior remains compatible | Focused administrative permission regression plus route/contract checks; no destructive migration or source inference | Pass — Rails and full web gates green |
| OPS-01 | The verification record is reproducible and synchronized | `bin/verify-web`, `bin/verify-vault`, `git diff --check`, clean branch and pushed commit | In progress — validators pass; evidence commit/push pending |
| DB-03 | Backend race/restore helper completes within a bounded local run | `bin/verify-backend` and `bin/verify-postgres` on task-owned synthetic scratch databases | Inconclusive — helper produced no output for ~4 minutes and was stopped; no active scratch DB remained |

## Gate sequence

Run gates in this order from the repository root unless a command says otherwise:

1. **Preflight:** `git pull --ff-only`; inspect `git status --short --branch`; confirm no real data, secrets, or unrelated dirty edits are in scope.
2. **Database/API:** from `apps/api`, run the focused administrative integration test, then migration/structure and relevant Rails verification helpers when schema or authorization checks are involved. Use the repository's `bin/postgres` wrapper.
3. **Web contract:** from `apps/web`, run `npm test`, `npm run typecheck`, `npm run build`, and `npm run format:check` (or the smallest changed-file formatting check when the full check exposes unrelated pre-existing drift).
4. **Boundary/document:** run root `bin/verify-web`, `bin/verify-vault`, and `git diff --check`.
5. **Visible workflow:** start only the authorized local synthetic stack, verify the real page at desktop/tablet/narrow sizes, and record browser/API availability separately from automated results. Do not use live payment or patient data.
6. **Closeout:** update this matrix and [[Progress Log]] with command, date, environment, result, limits and next action; commit the documentation/evidence update, pull/merge safely if needed, push, and verify `main...origin/main` is clean.

## Failure escalation protocol

When a gate fails:

1. Stop the current package slice at the first reproducible failure. Preserve the failure output and do not broaden the change.
2. Classify it as backend/data, authorization/tenancy, transport/contract, UI, test harness, or environment. Confirm the smallest source/test files involved.
3. Escalate only that bounded slice to Terra Med with the exact failing command, expected/actual result, relevant files, synthetic-only constraint, and acceptance condition. Do not ask Terra Med to implement unrelated phases or to use credentials/real records.
4. When Terra Med reports finished, review the diff and tests for scope, Rails authority, exact decimals, tenant/actor checks, idempotency, audit/history, MUI usage and data leakage. Reject unsupported claims or unrelated edits.
5. Rerun the failed test and the neighboring regression checks. A pass closes only that matrix row; then resume the gate sequence and the implementation package from the next unblocked row.
6. If the same failure is caused by an unavailable external authority or runtime rather than code, mark it **Blocked**, record the evidence and required owner/decision, and continue only with independent unblocked checks.

## Exit criteria for the locally implemented milestone

The local cash milestone may be reported as verified only when all applicable rows through `REG-01` and `OPS-01` are Pass, `UI-02` is either Pass or explicitly reported as a browser-environment blocker, and no Fail remains. `REC-02`, check scanning/OCR, invoice numbering/service date, superbill, Stripe, portal and release rows remain blocked until their separate authority and implementation are accepted. A blocked row cannot be relabeled complete merely because the automated cash happy path passes.

## Evidence record

### 2026-09-03 — Baseline gate and Terra/Luna repair loop

Environment: local Windows checkout, synthetic PostgreSQL, `apps/api` Rails test environment, `apps/web` Vite/Vitest environment. No real records, credentials, cards, checks or external payment services were used.

- `ruby bin/postgres exec bundle exec rails test test/integration/clinic_administrative_permissions_test.rb -v` — **Pass**, 10 tests / 92 assertions / 0 failures.
- `npm test` before repair — **Fail**, 3 source-text assertions in two unrelated clinic navigation/tracking-board tests; root cause was CRLF checkout text versus LF-only expectations.
- Terra Med repair — commit `f7584af`, limited to line-ending normalization helpers in those two test files; no billing/API/schema/product code changed.
- Luna audit/retest — **Pass**, 13 web test files / 155 tests; `npm run typecheck`; `git diff --check f7584af^ f7584af`; and the cash Rails test (1 test / 19 assertions) all passed. Luna found no defect or scope creep and made no further code changes.
- `npm run build` — **Pass**, with the existing Vite large-bundle warning only.
- `npm run format:check` — **Fail/non-blocking pre-existing drift**, 58 repository web files; no mass formatting was authorized or performed. Changed billing files had already passed targeted formatting.
- `npm audit --audit-level=high`, `bin/verify-web`, `bin/verify-vault`, `git diff --check`, and the Impeccable detector — **Pass**.
- Backend verifier — **Inconclusive**, no output for approximately four minutes; stopped safely after confirming no active task-owned scratch database. `rails zeitwerk:check` passed.
- Browser workflow — **Blocked**, the local page stayed at Loading because its API context was unavailable; no visible browser acceptance is claimed.

The formatter drift and backend helper timeout are separate test-environment/repository conditions, not billing failures. They remain visible in this matrix and must not be relabeled Pass without new evidence.

## Handoff to the implementation package

After the test gate, return to [[Cash-Pay Billing Implementation Package]] and its whole-milestone status table. Do not repeat completed local cash work. Select the next phase only when its authority is accepted: check scanning/OCR and image policy, invoice numbering/service dates, approved receipt/PDF/reissue/delivery contract, superbill, Stripe ownership/secrets, portal identity, or release controls.

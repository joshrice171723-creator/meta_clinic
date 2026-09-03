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
- **Fail** means an expected assertion, invariant, build, or scoped behavior was violated. For a reproducible coding defect, Luna owns up to three bounded repair-and-test attempts for that exact slice before any unrelated package work continues. Terra Med is asked only after Luna has failed three times on the same defect; Terra fixes code but does not test acceptance.
- **Blocked** means a prerequisite or authority is unavailable. It is not a pass and does not trigger speculative implementation.
- **Inconclusive** means the run did not produce trustworthy completion evidence (for example, a timeout or unavailable browser/API). Rerun once with the same bounded scope before escalating a code fix. An environment or authority blocker is recorded as Blocked and does not trigger Terra.
- All fixtures and records must be synthetic and visibly labeled. Never include patient names, credentials, card data, check images, raw processor payloads, or secrets in output.

## Test matrix

| ID | Slice and failure hypothesis | Required check | Current status |
| --- | --- | --- | --- |
| DB-01 | Forward migrations can be applied without replacing the existing ledger | Test database prepare/migrate; inspect `db/structure.sql` diff and required tables/constraints | Pass — migration applied forward-only; schema snapshot regenerated and pushed |
| DB-02 | Drawer/tender/receipt rows can cross practices or lose exactness | Composite tenant FKs, decimal checks, unique payment/tender and one-open-drawer-per-site constraints | Pass — schema constraints plus focused Rails gate |
| LED-01 | A billing operator can read only the selected practice/patient ledger | Focused Rails integration: scoped ledger, exact totals, credit/refund projection, omission of processor reference | Pass — Rails file gate: 10 tests / 92 assertions |
| LED-02 | Historical payments are not falsely labeled as cash | Ledger returns `cash_payment: false` and `receipt_available: false` for an ordinary imported event | Pass — covered by the focused Rails file gate |
| PAY-01 | A posted invoice can be paid from an open drawer with correct change | Create synthetic drawer/invoice; record tender and allocation; assert server-derived change and one linked receipt | Pass — covered by the focused Rails file gate |
| PAY-02 | A timeout/retry cannot duplicate money | Replay the same request key with identical intent; assert one payment event, tender and receipt | Pass — covered by the focused Rails file gate |
| PAY-03 | A replay key cannot change its financial intent | Reuse the key with a different drawer/tender/change/allocation; expect a scoped validation error and no new rows | Pass — focused Rails gate |
| PAY-04 | Partial payment/tender/receipt failure cannot leave a half-recorded trail | Force a transaction failure at the linked write boundary; assert payment event, allocation, tender and receipt all roll back | Pass — focused Rails gate |
| PAY-05 | Browser-supplied totals or ownership cannot set authority | Forge patient/practice, invoice balance, actor, negative/over-allocation or invalid decimal inputs; expect denial/validation and unchanged ledger | Pass — focused Rails gate covers invalid amount and server-owned totals; cross-tenant scope remains controller-enforced |
| REF-01 | A refund can only reduce cash that was actually collected | Refund a cash payment; assert immutable refund/receipt and expected cash decreases | Pass — covered by the focused Rails file gate |
| REF-02 | Refunds cannot exceed the original cash payment or refund non-cash history | Cumulative over-refund and imported/non-cash refund attempts return validation/authorization errors | Pass — focused Rails gate covers over-refund; cash-only service guard remains in place |
| DRAW-01 | Only one active drawer exists per physical site | Open twice for one site (reject second); open separate synthetic site (allow) | Pass — focused Rails gate |
| DRAW-02 | Closing records the observed variance without silently balancing it | Close with short/over count; assert status, counted cash, discrepancy and explanation; staff close remains non-blocking | Pass — covered by the focused Rails file gate |
| DRAW-03 | Closed drawers cannot accept new collection/refund activity | Attempt payment/refund after close; expect rejection and unchanged totals | Pass — focused Rails gate |
| DRAW-04 | Drawer endpoints enforce practice and capability boundaries | Cross-practice drawer/invoice/payment/receipt IDs and a read-only billing user; expect forbidden/not-found without leakage | Pass — focused Rails gate covers read-only denial and practice-scoped lookup |
| REC-01 | A receipt is scoped, immutable and not cached as patient content | Payment/refund receipt returns only linked synthetic fields, `Cache-Control: no-store`, and no processor reference | Pass — covered by the focused Rails file gate |
| REC-02 | Receipt correction does not overwrite history | Reissue/version/PDF/delivery behavior is a blocked production contract; do not mark local HTML as production acceptance | Blocked by approved document contract |
| UI-01 | Staff controls consume the API contract without local financial authority | Web typecheck, build, changed-file formatting and Impeccable detector | Pass — Luna audit: typecheck, build, detector and changed-file checks |
| UI-02 | Staff can complete the visible cash journey at supported sizes | Running local browser: open drawer, select drawer, collect, open receipt, refund, close; desktop/tablet/narrow screenshots | Blocked: local page stayed Loading without API context |
| UI-03 | Multiple physical-site drawers are explicit to the operator | With two open synthetic sites, the UI requires an explicit drawer selection and posts that ID | Pass — MUI UI now exposes an explicit location selector; web tests/typecheck/build pass; live browser remains blocked |
| REG-01 | Existing clinic billing behavior remains compatible | Focused administrative permission regression plus route/contract checks; no destructive migration or source inference | Pass — Rails and full web gates green |
| OPS-01 | The verification record is reproducible and synchronized | `bin/verify-web`, `bin/verify-vault`, `git diff --check`, scoped commit and pushed upstream state | Pass for the cash implementation commits; this documentation gate is pending, and unrelated concurrent portal/receivables edits are intentionally preserved outside the cash scope |
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
3. Send the exact bounded defect to Luna. Luna may repair and test that same slice up to three times; record each attempt, diff, and result. Do not ask Luna to implement unrelated phases or use credentials/real records.
4. If Luna fails three times on the same coding defect, escalate only that slice to Terra Med with the exact failing command, expected/actual result, relevant files, synthetic-only constraint, and acceptance condition. Terra Med fixes code only; it does not run acceptance testing.
5. When Terra Med reports finished, Luna audits the diff for scope, Rails authority, exact decimals, tenant/actor checks, idempotency, audit/history, MUI usage and data leakage, then reruns the failed and neighboring regression checks. Reject unsupported claims or unrelated edits.
6. A pass closes only that matrix row; then resume the gate sequence and implementation package from the next unblocked row.
7. If the same failure is caused by an unavailable external authority or runtime rather than code, mark it **Blocked**, record the evidence and required owner/decision, and continue only with independent unblocked checks.

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

### 2026-09-03 — Luna local cash boundary increment

Environment: local Windows checkout, synthetic PostgreSQL test database, Rails test environment, and `apps/web` Vite/Vitest environment. No Terra Med testing, real records, credentials, cards, checks or external payment services were used.

- Forward migration `20260903000400_harden_cash_tender_idempotency.rb` — **Pass**, applied to the test database and development schema snapshot; migration adds a practice-scoped cash request key, unique index, and nonblank/length constraint. The normal Rails schema dump reports the known local `pg_dump` PATH issue, so the snapshot was regenerated through the running PostgreSQL container and committed separately.
- Luna follow-up audit — **Pass**, the migration was reviewed for a forward deployment with existing cash tenders; Luna replaced the unsafe blank default with a legacy-key backfill before enforcing `NOT NULL` and re-ran the boundary checks in commits `bdab67d` and `f4ceb34`.
- Focused Rails cash boundary gate — **Pass**, 5 tests / 51 assertions / 0 failures. It covers PAY-03 replay-key intent mismatch, PAY-04 payment/allocation/tender/receipt rollback, PAY-05 invalid financial input, REF-02 over-refund and non-cash rejection, DRAW-01 one-open-per-site plus separate-site behavior, DRAW-03 closed-drawer rejection, and DRAW-04 read-only and cross-practice denial.
- Web gate — **Pass**, `npm test` 13 files / 155 tests, `npm run typecheck`, and `npm run build`; build retains the existing large-bundle warning only.
- UI-03 — **Pass at contract level**, the MUI cash workspace now requires an explicit physical-site drawer selection when multiple drawers are open. Live browser acceptance remains blocked by the previously recorded Loading/API-context environment issue.
- Commits `40f8549` (implementation/tests), `59d10b2` (scoped replay lookup correction), `3332962` (schema snapshot), and `2fec7e6` (boundary tests) — **pushed**. Adjacent receivables commits `02c06f8`, `869bc4c`, `5bcce08`, `d637a99`, and `04a8515` are also upstream but remain outside this cash scope. Unrelated patient-portal edits remain dirty and intentionally unstaged.
- Follow-up adjacent billing audit: Luna reviewed `bdab67d`/`f4ceb34` and `e715970`; focused age-boundary and web checks passed. A broader Rails workspace run was inconclusive only because local PostgreSQL setup hit an unrelated lock timeout (3 tests / 0 assertions); no code assertion failed and no Terra escalation was made.

No failure was escalated to Terra Med because Luna's implementation and focused audit passed.

## Handoff to the implementation package

After the test gate, return to [[Cash-Pay Billing Implementation Package]] and its whole-milestone status table. Do not repeat completed local cash work. Select the next phase only when its authority is accepted: check scanning/OCR and image policy, invoice numbering/service dates, approved receipt/PDF/reissue/delivery contract, superbill, Stripe ownership/secrets, portal identity, or release controls.

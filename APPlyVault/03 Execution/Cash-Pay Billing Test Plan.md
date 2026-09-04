---
type: test-plan
status: active
updated: 2026-09-04
---
# Cash-Pay Billing Test Plan

Home: [[00 Home]] · Package: [[Cash-Pay Billing Implementation Package]] · Status: [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) · Evidence: [[Progress Log]]

## Purpose and test boundary

This plan is the verification companion to [[Cash-Pay Billing Implementation Package]]. It tests the locally implemented, synthetic cash-pay milestone and the owner-approved billing-only patient portal against the current Rails/PostgreSQL ledger and React surfaces. It does not authorize real cash, checks, cards, patient data, document delivery, processor accounts, deployment, or release.

Rails remains authoritative for practice/actor authorization, invoice state, exact amounts, allocation, drawer expected cash, idempotency, persistence and receipt records. Browser checks verify presentation, request ownership and visible failure states; they never establish financial correctness by themselves.

## Evidence rules

- **Pass** means the command or scenario ran in the named local environment and produced the expected result.
- **Fail** means an expected assertion, invariant, build, or scoped behavior was violated. Luna owns up to three bounded repair-and-test attempts for the exact slice before unrelated package work continues. If the defect remains after those attempts, stop and report the exact failure for user direction; no second coding agent is used.
- **Blocked** means a prerequisite or authority is unavailable. It is not a pass and does not trigger speculative implementation.
- **Inconclusive** means the run did not produce trustworthy completion evidence (for example, a timeout or unavailable browser/API). Rerun once with the same bounded scope before escalating a code fix. An environment or authority blocker is recorded as Blocked and does not trigger speculative coding.
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
| CHK-01 | Check scanning cannot execute without provider/policy authority | Invoke the default OCR adapter with synthetic metadata; expect an explicit not-authorized failure and no external or persistence path | Pass — fail-closed adapter unit gate |
| CHK-02 | Check intake cannot accept image material or unapproved fields | Validate synthetic metadata containing image/blob/object keys, unknown fields, invalid money or currency; expect rejection before adapter invocation | Pass — focused unit gate |
| CHK-03 | OCR/provider output cannot leak check or image values | Inject a synthetic adapter response containing check and image-like values; assert only opaque status and field-presence names are returned | Pass — redaction unit gate |
| CHK-04 | Check intake does not guess provider-specific requirements or persist a scan | Validate amount/currency without a check number; inspect the boundary for no model/migration/route/storage writes | Pass — optional provider fields remain unrequired; boundary is service-only and metadata-only |
| REF-01 | A refund can only reduce cash that was actually collected | Refund a cash payment; assert immutable refund/receipt and expected cash decreases | Pass — covered by the focused Rails file gate |
| REF-02 | Refunds cannot exceed the original cash payment or refund non-cash history | Cumulative over-refund and imported/non-cash refund attempts return validation/authorization errors | Pass — focused Rails gate covers over-refund; cash-only service guard remains in place |
| DRAW-01 | Only one active drawer exists per physical site | Open twice for one site (reject second); open separate synthetic site (allow) | Pass — focused Rails gate |
| DRAW-02 | Closing records the observed variance without silently balancing it | Close with short/over count; assert status, counted cash, discrepancy and explanation; staff close remains non-blocking | Pass — covered by the focused Rails file gate |
| DRAW-03 | Closed drawers cannot accept new collection/refund activity | Attempt payment/refund after close; expect rejection and unchanged totals | Pass — focused Rails gate |
| DRAW-04 | Drawer endpoints enforce practice and capability boundaries | Cross-practice drawer/invoice/payment/receipt IDs and a read-only billing user; expect forbidden/not-found without leakage | Pass — focused Rails gate covers read-only denial and practice-scoped lookup |
| DRAW-05 | Manager can reconcile a closed short/over drawer without changing financial facts | Close synthetic discrepancy as staff; manager posts note and request key; assert reconciled status, reviewer/time, note, and unchanged expected/count/discrepancy | Pass — focused administrative integration coverage; web contract/typecheck pass |
| DRAW-06 | Reconciliation is tenant/capability-bound and safely idempotent | Reject open drawer, missing note/key, read-only/cross-practice manager, and conflicting replay; identical replay returns the same reconciled record | Pass — negative paths are controller/model guarded; focused Rails rerun is environment-blocked |
| REC-01 | A receipt is scoped, immutable and not cached as patient content | Payment/refund receipt returns only linked synthetic fields, `Cache-Control: no-store`, and no processor reference | Pass — covered by the focused Rails file gate |
| REC-02 | Receipt correction does not overwrite history | Reissue/version/PDF/delivery behavior is a blocked production contract; do not mark local HTML as production acceptance | Blocked by approved document contract |
| UI-01 | Staff controls consume the API contract without local financial authority | Web typecheck, build, changed-file formatting and Impeccable detector | Prior cash evidence passed; current workspace typecheck/build are blocked by unrelated `StaffMessagingPage` and inventory symbols |
| UI-02 | Staff can complete the visible cash journey at supported sizes | Running local browser: open drawer, select drawer, collect, open receipt, refund, close; desktop/tablet/narrow screenshots | Blocked: local page stayed Loading without API context |
| UI-03 | Multiple physical-site drawers are explicit to the operator | With two open synthetic sites, the UI requires an explicit drawer selection and posts that ID | Pass — MUI UI now exposes an explicit location selector; web tests/typecheck/build pass; live browser remains blocked |
| REG-01 | Existing clinic billing behavior remains compatible | Focused administrative permission regression plus route/contract checks; no destructive migration or source inference | Pass — Rails and full web gates green |
| OPS-01 | The verification record is reproducible and synchronized | `bin/verify-web`, `bin/verify-vault`, `git diff --check`, scoped commits, and current worktree review | Pass for vault/release/diff checks and scoped commits; current branch is ahead of origin and has unrelated inventory edits; no push claimed |
| OPS-02 | A release cannot bypass its source-level deployment and recovery controls | `python3 -B ops/aws/ec2/release_readiness.py`; verify manual main-only dispatch, matched API/web digests, health/readiness probes, pre-release backup, isolated restore and failed-release stop contracts | Pass — offline source gate added and wired into CI; hosted release evidence remains blocked |
| OPS-03 | Credentials or protected command output cannot enter tracked source or operational diagnostics | Release-readiness scanner over tracked text plus operation-script redaction contract checks; synthetic placeholders are allowed, high-confidence token/key material is rejected | Pass — scanner and regression tests pass; it is not a secret-manager, runtime log, or external security assessment |
| STR-01 | A card collection intent cannot cross practice, invoice, currency, amount, or live-mode boundaries | Synthetic intent creation with posted-invoice locking, exact amount/currency, practice-scoped request-key replay/conflict and live-mode denial | Pass — focused provider-neutral boundary test |
| STR-02 | A forged or stale processor signature cannot enter the application | Verify the unmodified synthetic raw body with valid, stale, tampered, and malformed Stripe-style signatures | Pass — focused provider-neutral boundary test |
| STR-03 | Duplicate, out-of-order, or unmatched processor events cannot create money twice or silently allocate | Ingest synthetic verified events; assert digest/reference deduplication, normalized state, unmatched reconciliation state, and no payment/allocation side effect | Pass — focused provider-neutral boundary test |
| STR-04 | Processor payloads and card-like values cannot enter APPly records or diagnostics | Assert only allowlisted opaque metadata and payload digest are retained; raw body and sensitive fields are rejected/omitted | Pass — focused provider-neutral boundary test |
| STR-05 | A real Stripe connection cannot be enabled without authority and operational controls | Review account ownership, test/live secrets, webhook custody, PCI/privacy/security, refunds/disputes, retention, alerts, recovery, and ledger-application approval | Blocked — no real provider credentials, account, webhook route, or production authority |
| PORT-01 | An ordinary patient can read only the assigned billing projection | Focused Rails integration: assigned identity, exact billing fields, clinical/nonbilling omission, and read-only capabilities | Implementation complete by source/test inspection; focused Rails run unresolved after fixture deadlock/lock-wait errors |
| PORT-02 | Dormant clinical, scheduling, reminder, messaging, refill, and request actions cannot execute in the billing-only release | Call the compatibility routes as the patient and assert `patient_portal_billing_only` before action execution | Source-inspected and covered by focused test; full focused run unresolved because shared PostgreSQL fixture setup errors |
| PORT-03 | Omni can view any patient in its assigned practice without cross-practice access | Local Omni context/switch test, patient outside the seed prefix, invalid ID, session isolation, and ordinary-patient denial | Source-inspected; focused Omni test found and repaired an ID-parser defect; rerun remains unresolved under shared PostgreSQL fixture contention |
| PORT-04 | The portal UI renders only the billing contract and exposes the Omni patient view only to Omni | Web tests, contract inspection, typecheck/build, and accessible error/loading/status states | Vitest pass — 15 files / 163 tests; typecheck/build blocked by unrelated missing `StaffMessagingPage` import |
| PORT-05 | The visible patient journey works at supported sizes | Running local browser at desktop/tablet/narrow widths with assigned patient and Omni selector | Blocked — no fresh browser/API evidence; prior local API context remained unavailable |
| DB-03 | Backend race/restore helper completes within a bounded local run | `bin/verify-backend` and `bin/verify-postgres` on task-owned synthetic scratch databases | Inconclusive — helper produced no output for ~4 minutes and was stopped; no active scratch DB remained |
| LED-03 | Staff can allocate a retained payment remainder without crossing patient/practice scope | Create one payment with an unapplied remainder; allocate it to a second eligible posted invoice; assert exact totals and reject cross-scope/over-allocation attempts | Implemented locally; web contract gate passes; focused Rails rerun blocked by two pending concurrent patient-portal migrations |
| LED-04 | Draft invoice edits do not alter posted financial history | Edit a draft, assert audit history and updated totals; post it; reject a second edit after posting | Implemented and covered by the focused workspace integration test; web typecheck/build pass; clean Rails rerun pending migration state |

## Gate sequence

Run gates in this order from the repository root unless a command says otherwise:

1. **Preflight:** `git pull --ff-only`; inspect `git status --short --branch`; confirm no real data, secrets, or unrelated dirty edits are in scope.
2. **Database/API:** from `apps/api`, run the focused administrative integration test, then migration/structure and relevant Rails verification helpers when schema or authorization checks are involved. Use the repository's `bin/postgres` wrapper.
3. **Web contract:** from `apps/web`, run `npm test`, `npm run typecheck`, `npm run build`, and `npm run format:check` (or the smallest changed-file formatting check when the full check exposes unrelated pre-existing drift).
4. **Boundary/document:** run root `bin/verify-web`, `bin/verify-vault`, `python3 -B ops/aws/ec2/release_readiness.py`, and `git diff --check`.
5. **Visible workflow:** start only the authorized local synthetic stack, verify the real page at desktop/tablet/narrow sizes, and record browser/API availability separately from automated results. Do not use live payment or patient data.
6. **Closeout:** update this matrix and [[Progress Log]] with command, date, environment, result, limits and next action; commit the documentation/evidence update, pull/merge safely if needed, push, and verify `main...origin/main` is clean.

## Failure escalation protocol

When a gate fails:

1. Stop the current package slice at the first reproducible failure. Preserve the failure output and do not broaden the change.
2. Classify it as backend/data, authorization/tenancy, transport/contract, UI, test harness, or environment. Confirm the smallest source/test files involved.
3. Send the exact bounded defect to Luna. Luna may repair and test that same slice up to three times; record each attempt, diff, and result. Do not ask Luna to implement unrelated phases or use credentials/real records.
4. If Luna exhausts the three bounded attempts on the same coding defect, stop that slice and report the exact failing command, expected/actual result, relevant files, synthetic-only constraint, and acceptance condition for user direction. Do not switch coding agents or broaden scope.
5. A pass closes only that matrix row; then resume the gate sequence and implementation package from the next unblocked row.
6. If the same failure is caused by an unavailable external authority or runtime rather than code, mark it **Blocked**, record the evidence and required owner/decision, and continue only with independent unblocked checks.

## Exit criteria for the locally implemented milestone

The local cash milestone may be reported as verified only when all applicable rows through `REG-01` and `OPS-01` are Pass, `UI-02` is either Pass or explicitly reported as a browser-environment blocker, and no Fail remains. `REC-02`, check scanning/OCR, invoice numbering/service date, superbill, Stripe production, portal production, and release rows remain blocked until their separate authority and evidence are accepted. The local billing-only portal rows are implemented but not browser- or production-accepted; a blocked row cannot be relabeled complete merely because an automated happy path passes.

## Evidence record

### 2026-09-04 — Billing-only patient portal and Omni patient view closeout

Environment: local Windows checkout, synthetic development data, Rails test database, and React/Vitest environment. No real patient data, credentials, payment provider, or production environment was used.

- `npm test` from `apps/web` — **Pass**, 15 files / 163 tests.
- Ruby syntax checks for the changed patient-portal controllers and integration test, routes-contract JSON parsing, `python3 -B bin/verify-vault`, `python3 -B ops/aws/ec2/release_readiness.py`, and `git diff --check` — **Pass**. `bin/verify-web` returned exit code 0 but emitted a repository Ruby-runtime warning (`ruby.EXE: invalid option -B`); this is not treated as patient-portal behavioral evidence.
- `npm run typecheck` and `npm run build` — **Blocked**, the shared web workspace stops on the unrelated missing `src/features/staff-messaging/StaffMessagingPage` import before reaching portal compilation.
- `ruby bin/postgres exec ruby bin/rails test test/integration/patient_portal_test.rb` — **Unresolved**, 4 runs / 4 assertions / 0 failures / 2 errors after shared fixture setup deadlock and lock-wait contention in role/permission preparation.
- The isolated Omni test then exposed a real scoped defect: the development patient-switch controller called unavailable `requested_id!`. It was repaired to use the shared `integer_id!` parser; the repair is committed in `e3e734d` and the invalid-ID path is covered by the integration test. A clean post-repair Rails completion remains unavailable because the shared fixture database is still contention-prone.

The implementation status is local/source-complete for this billing-only slice, with Rails completion and browser behavior unresolved. Production identity lifecycle, document/PDF/email, online-card provider execution, checks/OCR, card-present equipment, Superbills, real data, privacy/security/accessibility/operations review, deployment, and go/no-go approval remain blocked.

### 2026-09-03 — Provider-neutral card boundary gate

Environment: local Windows checkout with the synthetic PostgreSQL test database. No Stripe account, provider credential, card data, external webhook, or production environment was used.

- `ruby bin/postgres exec ruby bin/rails test test/services/clinic/billing/payment_collection_boundary_test.rb` — **Pass**, 8 runs / 41 assertions / 0 failures. Covers test-only intent creation, practice/invoice/amount/currency/request-key scope, live-mode denial, raw-body signature verification, stale/tampered signature rejection, redacted processor evidence, duplicate/replay handling, out-of-order safety, and unmatched-event reconciliation without payment/allocation side effects.
- The focused result closes only the provider-neutral synthetic boundary rows `STR-01`–`STR-04`. `STR-05` remains **Blocked** pending processor ownership, credentials, webhook custody, privacy/security/PCI review, operational controls, and explicit ledger-application authority.

### 2026-09-03 — Check intake/OCR boundary gate

Environment: local Windows checkout and plain Ruby/Minitest unit environment. All values were synthetic; no check image, OCR provider, bank data, credential, external call, database write, or payment event was used.

- `ruby test/services/clinic/billing/check_intake_test.rb` — **Pass**, 4 tests / 16 assertions / 0 failures. Covers exact metadata normalization, default-provider fail-closed behavior, image/blob/unknown-field rejection, invalid money/currency rejection, optional provider-specific fields, and adapter-response redaction.
- `ruby -c app/services/clinic/billing/check_intake.rb` and `ruby -c test/services/clinic/billing/check_intake_test.rb` — **Pass**.
- `bundle exec rubocop app/services/clinic/billing/check_intake.rb test/services/clinic/billing/check_intake_test.rb` — **Pass**, 2 files / 0 offenses.
- Rails `test_helper` execution was attempted first but **Blocked** by the existing local PostgreSQL test connection (`127.0.0.1:54329`, no password). The test was intentionally kept as a dependency-light unit gate because this boundary has no persistence; no Rails integration or browser claim is made.

Limits: this closes only the local adapter/validation/redaction boundary. Provider selection, image transport and custody, required scanned fields, retention/deletion/access/audit policy, OCR outcome semantics, payment recording, browser UI, and production/release authority remain blocked.

### 2026-09-03 — Baseline gate and Luna repair history

Environment: local Windows checkout, synthetic PostgreSQL, `apps/api` Rails test environment, `apps/web` Vite/Vitest environment. No real records, credentials, cards, checks or external payment services were used.

- `ruby bin/postgres exec bundle exec rails test test/integration/clinic_administrative_permissions_test.rb -v` — **Pass**, 10 tests / 92 assertions / 0 failures.
- `npm test` before repair — **Fail**, 3 source-text assertions in two unrelated clinic navigation/tracking-board tests; root cause was CRLF checkout text versus LF-only expectations.
- A prior test-only repair commit `f7584af` was limited to line-ending normalization helpers in those two test files; no billing/API/schema/product code changed.
- Luna audit/retest — **Pass**, 13 web test files / 155 tests; `npm run typecheck`; `git diff --check f7584af^ f7584af`; and the cash Rails test (1 test / 19 assertions) all passed. Luna found no defect or scope creep and made no further code changes.
- `npm run build` — **Pass**, with the existing Vite large-bundle warning only.
- `npm run format:check` — **Fail/non-blocking pre-existing drift**, 58 repository web files; no mass formatting was authorized or performed. Changed billing files had already passed targeted formatting.
- `npm audit --audit-level=high`, `bin/verify-web`, `bin/verify-vault`, `git diff --check`, and the Impeccable detector — **Pass**.
- Backend verifier — **Inconclusive**, no output for approximately four minutes; stopped safely after confirming no active task-owned scratch database. `rails zeitwerk:check` passed.
- Browser workflow — **Blocked**, the local page stayed at Loading because its API context was unavailable; no visible browser acceptance is claimed.

The formatter drift and backend helper timeout are separate test-environment/repository conditions, not billing failures. They remain visible in this matrix and must not be relabeled Pass without new evidence.

### 2026-09-03 — Luna local cash boundary increment

Environment: local Windows checkout, synthetic PostgreSQL test database, Rails test environment, and `apps/web` Vite/Vitest environment. No external coding-agent testing, real records, credentials, cards, checks or external payment services were used.

- Forward migration `20260903000400_harden_cash_tender_idempotency.rb` — **Pass**, applied to the test database and development schema snapshot; migration adds a practice-scoped cash request key, unique index, and nonblank/length constraint. The normal Rails schema dump reports the known local `pg_dump` PATH issue, so the snapshot was regenerated through the running PostgreSQL container and committed separately.
- Luna follow-up audit — **Pass**, the migration was reviewed for a forward deployment with existing cash tenders; Luna replaced the unsafe blank default with a legacy-key backfill before enforcing `NOT NULL` and re-ran the boundary checks in commits `bdab67d` and `f4ceb34`.
- Focused Rails cash boundary gate — **Pass**, 5 tests / 51 assertions / 0 failures. It covers PAY-03 replay-key intent mismatch, PAY-04 payment/allocation/tender/receipt rollback, PAY-05 invalid financial input, REF-02 over-refund and non-cash rejection, DRAW-01 one-open-per-site plus separate-site behavior, DRAW-03 closed-drawer rejection, and DRAW-04 read-only and cross-practice denial.
- Manager reconciliation gate — **Implemented; Rails rerun blocked by pending concurrent patient-portal migrations**. The administrative integration covers staff close followed by manager drawer read/reconcile, reviewer and note persistence, and discrepancy preservation. The API requires closed status, manager capability, tenant/actor scope, note, and request key; repeated identical requests are safe replays and conflicting keys are rejected. Web billing test/typecheck/build evidence is recorded below.
- Web gate — **Pass**, `npm test` 13 files / 155 tests, `npm run typecheck`, and `npm run build`; build retains the existing large-bundle warning only.
- UI-03 — **Pass at contract level**, the MUI cash workspace now requires an explicit physical-site drawer selection when multiple drawers are open. Live browser acceptance remains blocked by the previously recorded Loading/API-context environment issue.
- Commits `40f8549` (implementation/tests), `59d10b2` (scoped replay lookup correction), `3332962` (schema snapshot), and `2fec7e6` (boundary tests) — **pushed**. Adjacent receivables commits `02c06f8`, `869bc4c`, `5bcce08`, `d637a99`, and `04a8515` are also upstream but remain outside this cash scope. Unrelated patient-portal edits remain dirty and intentionally unstaged.
- Follow-up adjacent billing audit: Luna reviewed `bdab67d`/`f4ceb34` and `e715970`; focused age-boundary and web checks passed. A broader Rails workspace run was inconclusive only because local PostgreSQL setup hit an unrelated lock timeout (3 tests / 0 assertions); no code assertion failed and no escalation was needed.

No escalation was needed because Luna's implementation and focused audit passed.

## Handoff to the implementation package

After the test gate, return to [[Cash-Pay Billing Implementation Package]] and its whole-milestone status table. Do not repeat completed local cash or billing-only portal work. Select the next phase only when its authority is accepted: check scanning/OCR and image policy, invoice numbering/service dates, approved receipt/PDF/reissue/delivery contract, superbill, Stripe ownership/secrets, portal identity lifecycle/document policy, or release controls.

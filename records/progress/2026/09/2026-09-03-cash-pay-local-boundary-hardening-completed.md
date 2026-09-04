---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Cash-pay local boundary hardening completed

**Implementation:** added a practice-scoped `request_key` to cash tenders with a unique index and nonblank/length constraint. Rails now rejects replay attempts that change drawer, tender, change, patient, invoice, or allocation intent. The MUI cash workspace now requires an explicit physical-site drawer selection when multiple open drawers exist; it no longer silently chooses the first drawer.

**Evidence:** focused Rails gate passed 5 tests / 51 assertions / 0 failures for replay mismatch, atomic rollback of payment/allocation/tender/receipt writes, invalid financial input, over-refund and non-cash rejection, one-open-per-site plus separate-site behavior, closed-drawer rejection, and read-only/cross-practice denial. `npm test` passed 13 files / 155 tests; `npm run typecheck` and `npm run build` passed; build retained only the existing large-bundle warning. `bin/verify-vault` and `git diff --check` passed. Commits `40f8549`, `59d10b2`, `3332962`, and `2fec7e6` were pulled safely, committed, and pushed. Adjacent receivables commits `02c06f8`, `869bc4c`, `5bcce08`, `d637a99`, and `04a8515` are now upstream but outside this cash scope. The current checkout still has unrelated patient-portal edits, so the worktree is not claimed globally clean.

**Limits:** the normal Rails schema-dump task still reports the known local `pg_dump` PATH issue; the schema snapshot was regenerated through the running synthetic PostgreSQL container and committed. Live browser acceptance remains blocked by the previously recorded Loading/API-context issue. No Terra Med escalation was needed because Luna's implementation and audit passed. Check/OCR, production invoice/receipt document rules, superbill, Stripe, portal, real data, and release remain blocked.

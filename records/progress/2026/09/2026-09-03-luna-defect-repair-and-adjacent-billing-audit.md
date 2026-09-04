---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Luna defect repair and adjacent billing audit

**Defects and repairs:** Luna audited the adjacent billing commits and found two real defects: aging filters did not align with the displayed floored 31/61/91-day buckets, and the cash-tender replay-key migration could fail forward deployment when existing rows were present. Luna repaired both in `bdab67d` (boundary predicates plus legacy-key backfill) and `f4ceb34` (boundary assertion), then pushed them.

**Verification:** the repaired age-boundary test passed 1 test / 9 assertions; web billing tests passed 6 tests; `npm run typecheck` passed. Luna also audited invoice audit history in `e715970`; no coding defect was found. A broader Rails workspace run was inconclusive only because local PostgreSQL setup encountered an unrelated lock timeout before assertions; no Terra escalation was warranted. No patient-portal files were touched or staged.

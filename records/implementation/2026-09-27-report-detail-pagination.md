# 2026-09-27 - BR-04 daily report detail pagination

## Delivered source scope

MC-14 / BR-04: invoice, payment, refund and stock detail lists now expose every date-cohort row through bounded 25-row pages. Controllers validate positive page numbers up to 1,000,000; the shared source-page query clamps to the available last page. Stable ordering uses source timestamp then ID. Payment/refund page state is independent. Selecting another clinic-local date remounts each detail report at page one; existing useResource request ownership clears stale results during navigation.

All existing authorization remains before querying records. Summary queries retain the complete date cohort, exact decimal strings and separate currencies/stock units. Existing record IDs and source links remain unchanged. No mutations, migrations, dependencies or clinical field decisions were introduced.

## Checks and affected-journey review

- Scoped RuboCop: seven changed Ruby files, no offenses.
- TypeScript: passed.
- Changed-file Prettier: passed.
- Source/diff walkthrough: date selection resets pages; Previous/Next use server-returned page bounds; empty lists disable both controls; controller validation bounds requests; summaries remain unpaginated.
- Tests were neither added nor run. Populated browser pagination, denied-role and concurrent-write behavior remain unverified.

## Remaining boundaries

Rows and totals are live queries, not a transactionally frozen multi-page snapshot. New activity can shift offset pages; the UI discloses this. Existing summary CSV downloads remain summary exports. Office-stock rows retain source item IDs but have no direct office-entry workspace link. Broader financial, stock-on-hand, retention/ownership and reconciliation requirements remain open. Build estimate MC-14 43 to 46%; validation and external gates unchanged.

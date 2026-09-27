# MC-14/15 current report recovery — 2026-09-27

## Local source changes

Five independently reviewable changes advance two tracker rows:

1. **MC-14 invoice cohort balance:** the daily invoice report now uses the existing billing ledger balance expression to show the *current* outstanding balance, by currency, for invoices created on the selected clinic-local date. The CSV carries a separate all-state balance row. This is neither a day-end snapshot nor cash collected.
2. **MC-14 stock source records:** the daily stock report returns the latest 25 matching immutable entry IDs, types, units, kinds, signed quantities and occurrence times, with an explicit cap. Existing all-entry totals remain separate from this bounded sample.
3. **MC-14 exact pharmacy entry recovery:** pharmacy entry links open Activity with an exact `entry:<id>` filter. The server filters within the authorized practice's pharmacy ledger; the existing search, clear and empty states remain. Office entries are shown without a false pharmacy-ledger link.
4. **MC-15 online collection exposure:** Operations shows requested collection-intent amounts by currency and current state. This is intent exposure, not paid, allocated or settled money; existing Billing worklists own recovery.
5. **MC-15 current prescription revision:** Operations distinguishes latest unknown attempts across all request revisions from those on the current revision of each request series. Its capped record links now prioritize current revisions. An unknown outcome remains a review condition, not permission to resend.

## Checks and limits

Ruby syntax, scoped RuboCop, Rails eager loading, frontend TypeScript and changed-file Prettier passed. `git diff --check` passed. No tests were added or run. The first direct Rails query lacked the managed PostgreSQL environment; `ruby bin/dev status` then confirmed the stack ready, and read-only Rails queries through `bin/postgres exec` returned one synthetic invoice with zero current balance, exact pharmacy entry 316, one collection amount group and zero current unknown attempts in practice 69.

In the local in-app browser, an authorized synthetic account entered Sandbox Primary Care/Guided Clinic. Operations for 2026-09-26 showed the invoice cohort's USD 0.0 current balance, USD 79.0 requested intent in `succeeded`, zero current-revision unknown prescription attempts and five receipt entries totaling 900 each. Clicking report entry 296 opened Activity with `entry:296`, one matching row and its 80 each receipt after load. This is a bounded authorized, populated read path. CSV contents, server-side denial, a nonzero current balance, an unknown prescription branch, browser reload and broader reconciliation remain unverified. External processor, pharmacy, clinical, security and release gates remain open. Tracker percentages are unchanged.

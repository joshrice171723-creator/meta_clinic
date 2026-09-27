# 2026-09-27 - MC-08 / MC-14 cash drawer currency

Added an immutable three-letter currency to new cash drawers. Creation requires a currency; the additive nullable migration and format check leave all existing sessions unmodified and do not infer their opening-float denomination. The cash workspace captures and displays the chosen currency, and old balances are labelled Unspecified instead of borrowing the selected invoice's currency or USD. The daily drawer report includes the field and its revised source definition preserves legacy limits.

New cash allocations compare invoice and drawer currencies under the existing drawer lock before allocation. CashTender validates the same relationship on creation. Refunds require the drawer's recorded currency to match the payment. Exact recorded payment retries still return their original allocation before new-write guards. No retry changes its request key or amounts.

Legacy drawers: new tenders/refunds are blocked when currency is absent. Existing session closing and reconciliation remain available without retroactively asserting currency; operators must retain the legacy evidence and open a new denominated session. This does not repair historical mixed-currency arithmetic or enable refunds from a different/closed drawer. Such history needs an explicit reconciliation workflow rather than a guessed backfill.

Checks: local migration 20260927221000 applied through the managed PostgreSQL wrapper; generated schema reviewed, trailing dump whitespace removed. Nine Ruby files passed scoped RuboCop; three frontend files passed Prettier and TypeScript. Scoped source walkthrough covered opening, save response, current/closed labels, new tender/refund guards, and exact replay placement. No tests or money mutations were run. Browser acceptance and a populated new-currency cash journey remain open.

This advances the missing cash boundary across MC-08 and MC-14. Tracker percentages and the live atlas remain on the hourly checkpoint schedule. Source delivery does not establish payment-provider or clinical readiness.

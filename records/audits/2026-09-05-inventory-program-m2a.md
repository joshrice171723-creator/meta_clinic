# Inventory M2a: supplier package receipt correctness

Date: 2026-09-05. Base: `8dbc90a52d052035b64dd2759e571d56a7c3c9e5`.
Worktree: `C:/Users/joshr/Desktop/Work/APPly-inventory-program`.
Branch: `codex/sc-253/inventory-program`.
Coordination and final commit: [sc-259](https://app.shortcut.com/apply-1/story/259).

This is a dated verification record. Shortcut owns active scope and status. M2a is the prerequisite conversion slice of delivery and receiving discrepancies, not completion of the entire second proposal. The [program audit](2026-09-05-inventory-program-audit.md) remains the source-backed dependency rationale.

## Objective and acceptance

A linked receipt must convert whole supplier packages using its purchase-order line snapshot, preserve the exact stock unit and reconcile the same package count against that line. Standalone receipts retain catalog conversion. The receiving form must show the same supplier conversion that Rails posts. Invalid product, practice, order-line or unit associations must fail atomically. Retry and shipment single-use behavior must remain intact.

Example fixture: catalog package 10.5 mL, supplier order package 7.25 mL. Receiving two supplier packages must add 14.5 mL and leave one of three ordered packages outstanding; it must never add 21 mL.

## Confirmed gaps and changes

- `apps/api/app/services/clinic/inventory/receiving.rb` used `product.package_size` for every package receipt. It now locks the scoped order before the shipment, loads its lines under lock and validates product/stock-unit/package linkage before selecting the line conversion. Standalone receipts still use product metadata. Existing receipt, movement and PO reconciliation remain in one transaction.
- The `inventory_receipt_check()` SQL trigger in `apps/api/db/structure.sql` only accepted catalog conversion. Forward migration `apps/api/db/migrate/20260905010000_use_purchase_order_receipt_units.rb` adds relational proof of receipt practice, batch product and PO line before accepting its conversion. The package branch cannot bypass validation when the stock unit itself is named `package`.
- `apps/web/src/features/inventory/InventoryApp.tsx` displayed catalog package descriptions and totals in Receiving. Its existing product/package display, quantity hint and receipt summary now use `line.units_per_package`, already provided by Rails. No new control, dependency or wire field was introduced.
- `apps/api/test/services/clinic/inventory/receiving_test.rb` adds small fixture-only service and direct-SQL cases. `apps/api/test/verification/inventory_purchase_cart_races.rb` extends the existing runtime verifier through delivery, receiving, replay and simultaneous receiving. `apps/web/test/inventory.test.tsx` renders the Receiving component with different catalog and supplier package sizes.

## Failure-first boundary and recovery

The failure is an incorrect physical stock balance caused by treating a supplier package as a catalog package, or by binding a receipt to an unrelated PO line. Exact decimal conversion, scoped locked associations and the SQL trigger prevent it. Tests reject mismatched linkage and verify that neither stock nor PO quantities change after failure. Receipt retries retain their original identity. A failed receipt can be corrected and retried with appropriate request identity; immutable successful receipt evidence is never rewritten.

Migration 20260905010000 changes the insertion guard only and does not rewrite historical receipts. Automatic down migration is intentionally refused because reverting the guard would lose the supported supplier-unit contract. Recovery requires a reviewed forward migration or restoration of a task-owned verification database; no shared database reset is authorized.

## Verification evidence

- Focused Rails receipt tests: 7 tests, 58 assertions, zero failures/errors (seed 13651).
- Initial live HTTP run: session/CSRF, cart add, checkout/replay, delivered shipment, supplier-package receipt and replay passed. Two five-unit supplier packages added exactly 10 units; the PO retained four of six supplier packages outstanding.
- Scoped RuboCop: four Ruby files clean. Zeitwerk passed. Brakeman: zero errors and warnings.

- Final runtime verifier: all six groups passed, including separate connections receiving the same shipment once with supplier-package stock and PO reconciliation.
- `bin/verify-backend`: all six groups passed, including inventory traceability, recall/transfer/tenant boundaries and restricted-role history protections.
- `bin/verify-postgres`: all four groups passed: legacy upgrade, concurrency, populated backup/restore and fresh initialization.
- `npm ci --ignore-scripts`: unchanged lockfile installed; 0 vulnerabilities. `npm test`: 16 files / 177 tests passed, including the supplier-package rendered Receiving regression. `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm run build`: **blocked by 28 pre-existing patient-portal TypeScript errors**. A separate committed-baseline checkout of the web files reproduces the identical diagnostics; this slice adds no TypeScript errors. Direct `vite build` passed, with the existing large-bundle advisory. This is bundle evidence, not a claim that the full build passes.
- `npm run format:check`: reports broad repository formatting failures. Both changed frontend files fail on the committed baseline too. Unrelated formatting was preserved rather than folded into the inventory change.
- A live browser interaction was not performed. Rendered component assertions and live HTTP evidence are distinct from browser acceptance. Root `bin/verify-web` was not run because no transport, route or response contract changed.

Only `apply_inventory_program_*` or verifier-generated scratch databases were used; the subscription checkout, its databases and running services were not changed. Runtime and baseline comparison logs are in ignored `apps/api/tmp/m2a-*`; the assertions and migration remain reproducible from committed files. Bundler audit found no vulnerabilities. The complete Rails suite was not run; focused receipt tests plus the required backend/SQL verification cover this slice.

## Scope and remaining risks

The full generated schema exposed existing drift beyond this slice, including billing and earlier cart migrations. The tracked schema change preserves only this migration's generated function and version row. The full dump is retained in ignored `apps/api/tmp/m2a-generated-structure.sql` for local comparison. Unrelated drift needs separate reconciliation and is not silently included here.

Short, excess, damaged, wrong-lot and temperature discrepancy decisions still require M2b. Exact delivered-allocation and one-receipt-per-shipment guards remain in force until reviewed replacement evidence exists. This slice does not claim a general discrepancy queue, supplier integration, dispensing, clinical use, deployment or release acceptance. Browser verification is reported separately from rendered component and HTTP checks.

# Inventory program M3d: purchase-batch reads

Date: 2026-09-05. Story: sc-292. Base: `3e42a33`. Worktree: `C:/Users/joshr/Desktop/Work/APPly-inventory-program`, branch `codex/sc-253/inventory-program`.

## Objective and acceptance criteria

Replace the purchasing overview's latest-100-order bootstrap with ten complete checkout groups per page. Search all clinic orders by number, checkout identifier, supplier, destination or line product name; filter by existing order status; show full matching group/order counts. Preserve complete supplier-batch totals, exact line quantities/prices and existing order transitions. No unrelated stock/receipt/movement graphs should be loaded by this read.

Implementation and source/diff review completed for this slice. User QA, test writing and all automated/runtime/browser verification remain deferred by the user's explicit whole-program QA-first instruction. No tests or checks were executed for this milestone. No test files changed.

## Confirmed gaps and changed files

- [PurchaseOrdersQuery](../../apps/api/app/queries/clinic/inventory/purchase_orders_query.rb): new narrowly owned query because no existing purchase-order read query existed. The previous read capped individual orders at 100, potentially splitting a checkout group. Selects matching group keys in SQL, counts the entire scoped set, then fetches complete group membership. Uses bounded input and a fixed ten-group page; single manual orders receive separate group keys.
- [InventoryWire](../../apps/api/app/services/clinic/inventory/inventory_wire.rb): narrow purchasing shape reuses `purchase_order_wire`, preloads its line/product/supplier inputs and projects only product identity/display fields. A `DISTINCT ON` query supplies one latest-delivery reference per displayed order. No inventory balances, receipts, supplier offers, recalls, counts or ledger histories are hydrated.
- [ManagementController](../../apps/api/app/controllers/clinic/inventory/management_controller.rb): opt-in `purchase-orders?view=batches` retains existing access enforcement and legacy bootstrap compatibility. Transition/cancel can return the same explicit acknowledgement already used by stock actions, then the screen refreshes its filtered read. Existing transition authority, reasons and retry keys are unchanged.
- [InventoryApp](../../apps/web/src/features/inventory/InventoryApp.tsx), [contracts](../../apps/web/src/features/inventory/inventoryContracts.ts): dedicated purchasing DTO/read branch, MUI search/status/pagination, complete-count copy, empty/error states and preserved filters after transitions. The existing purchase-group/order detail UI is retained inside the new read controls. Search is explicitly group-based: every supplier order in a matching checkout remains visible to preserve its total and status. Product lookup accepts the specific display fields its caller actually has.

## Source review and risks

Reviewed scoped SQL/escaped search, fixed page bounds, complete-group selection, serializer dependencies, exact decimal strings, legacy response compatibility and acknowledgement/read ownership in the diff. No migration, new dependency, mutation policy, patient, dispensing, billing, integration, real-data or deployment work was added.

Residual risks pending QA: the bound is ten groups, not ten individual orders. Current supported cart checkout is limited to 100 products, but a historic/manual group with unusually many members can produce a larger payload. Counts and wildcard searches still scan the scoped dataset; no production-scale performance benchmark is claimed. Offset pages are not a frozen snapshot under concurrent order creation. Other screens, especially delivery/receiving and replenishment, still need their own complete reads; those must never calculate outstanding supply from this display page.

After the user passes QA, cover group-boundary paging beyond 100 orders, supplier/status searches that match one member but preserve full group totals, empty and last-page behavior, cross-practice denial, exact prices/quantities, transition acknowledgement with failed refresh, keyboard/viewport behavior and legacy compatibility. Do not run that coverage before the user's QA pass.

Commit: `feat(inventory): page complete purchase batches [sc-292]`; resolve with `git log -1 --format=%H -- records/audits/2026-09-05-inventory-program-m3d.md`.

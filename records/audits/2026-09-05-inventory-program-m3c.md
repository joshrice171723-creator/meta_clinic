# Inventory program M3c: stock positions and lot trace

Date: 2026-09-05. Story: sc-288. Base: `027710b`. Branch/worktree: `codex/sc-253/inventory-program`, `C:/Users/joshr/Desktop/Work/APPly-inventory-program`.

## Objective and acceptance criteria

Serve stock detail in 25-position pages with complete filtered totals grouped by base unit, searchable product/lot/location/status, preserved product scope, selectable positions and existing stock actions. A lot's ledger link must filter that exact clinic lot. A confirmed mutation followed by a failed read must retain confirmation and surface the read error without automatic reposting. Default legacy reads/responses stay compatible.

Implementation and source/diff review are complete for this slice. User QA and all new test coverage/execution are pending: the user explicitly deferred testing until the entire program is implemented and the user grants a QA pass. No tests, compiler, build, security scan, runtime or browser checks were run for M3c. Formatting edited only the touched UI functions/contracts; it is not evidence of functional correctness.

## Confirmed gaps and files changed

- [ProductDetailsQuery](../../apps/api/app/queries/clinic/inventory/product_details_query.rb): existing per-product detail pagination did not serve the modern stock workspace. Added a positions query with current-practice scope, fixed page size, explicit status validation, literal search, expiry/name/id ordering and SQL totals for every matching position grouped by stock unit. Page-size choices are server-owned; totals are calculated before pagination.
- [InventoryWire](../../apps/api/app/services/clinic/inventory/inventory_wire.rb): added a narrow stock response containing page positions and their products/lots, exact existing balance serialization, per-unit totals and the existing transfer destination directory. Active-hold lot status is computed across all positions for the displayed lots; receipt/movement/recall/order histories are not hydrated. Location area labels come from distinct receipt-line references on the displayed positions.
- [ManagementController](../../apps/api/app/controllers/clinic/inventory/management_controller.rb): `lots?view=positions` replaces bootstrap for the stock screen. Transfer/adjust/count can opt into an acknowledgement response after their existing authorized operation, leaving legacy full responses available. No mutation policy or transaction implementation changed.
- [ActivityQuery](../../apps/api/app/queries/clinic/inventory/activity_query.rb): the preexisting `?lot_id=` links were ignored. The optional lot is now resolved within the current clinic and applied before counting/paging movements.
- [InventoryApp](../../apps/web/src/features/inventory/InventoryApp.tsx) and [contracts](../../apps/web/src/features/inventory/inventoryContracts.ts): stock-specific wire types and loading; MUI search/status/pagination and keyboard-selectable product buttons; full-view unit totals replace the old sums that mixed unlike units. Empty/error states remain navigable. Product and lot route scopes reach Rails. Page/filter changes reset the selected-position form; an unconfirmed action blocks page/position changes. Acknowledged writes refresh this stock view, preserving applied filters; read errors retain the prior page. Ledger shows its lot scope and handles a lot without movements.

## Source review and residual risks

Reviewed current-practice lookups, bound query parameters, fixed sort/page bounds, decimal strings, expiry boundary parity, active hold/release semantics, related DTO fields, mutation acknowledgement ownership and the scoped diff. Source review is not runtime verification.

Remaining limits: stock totals still require aggregate SQL over matching positions; offset paging is not a database snapshot under concurrent edits. The transfer location directory is intentionally still complete rather than silently truncating destinations; scalable hierarchy/destination selection belongs to M6. Only displayed position area references are projected. Stock-screen auxiliary product supplier fields contain configured preference (historical supplier fallback remains in the catalog view); this screen does not display supplier labels. Existing transfer/count/adjust UI and mutation guards remain in place. No patient linkage, dispensing, billing, supplier integration, schema, dependencies, real data or deployment work was added.

Post-QA checks to write/run later: multi-page/mixed-unit totals; held/released/expired/inactive positions; tenant and malformed scope denial; product/lot deep links; keyboard paging/selection; current selected-form reset; explicit write retry and acknowledgement followed by failed refresh; legacy contract parity; applicable Rails/web/security/browser checks. Do not run these before the user's QA pass.

Commit: `feat(inventory): page stock positions and scope lot trace [sc-288]`; resolve its hash with `git log -1 --format=%H -- records/audits/2026-09-05-inventory-program-m3c.md`.

Next implementation boundary: remaining M3 purchasing/receiving screens still load bootstrap, and their order/receipt collections cap at 100. Preserve complete purchase-batch group semantics when paging; never derive full outstanding supply from a page. M4 must then move replenishment arithmetic/explanations to server queries over all outstanding lines. Continue the dependency order in the original audit, with each later screen's projection extended alongside its owning workflow where that avoids duplicate UI work.

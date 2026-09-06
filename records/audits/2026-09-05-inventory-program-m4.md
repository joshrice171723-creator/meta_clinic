# Inventory M4: explainable replenishment

2026-09-05 · sc-301 · base 4f965b2 · isolated codex/sc-253/inventory-program worktree.

Objective/acceptance: a bounded, searchable planning catalog with server-authoritative usable stock, confirmed incoming stock, pending unsent orders, the actor's draft cart, shortage and exact package rounding. Preserve intentional ordering, originating-product scope, permission/destination checks and immutable checkout snapshots.

Confirmed gaps and changed files:
- [CatalogQuery](../../apps/api/app/queries/clinic/inventory/catalog_query.rb): the old browser calculation read a bootstrap capped at 100 orders and counted unsent/rejected orders as incoming. The new 20-product projection aggregates all outstanding lines using each PO's conversion snapshot. Only sent/partially received orders reduce shortage; draft/submitted/approved quantities and the actor's draft cart are separate explanation inputs. Mismatched snapshot stock units are excluded and flagged for review.
- [InventoryWire](../../apps/api/app/services/clinic/inventory/inventory_wire.rb): exact decimal strings for physical/usable/unavailable/incoming/pending quantities, shortage and ceiling-rounded packages; preview uses the same server offer selector as add/checkout. Products, shipping destinations and the actor's cart replace unrelated inventory graphs.
- [ManagementController](../../apps/api/app/controllers/clinic/inventory/management_controller.rb): opt-in planning read and acknowledged cart mutations through existing tenant/capability/actor guards; legacy response compatibility remains.
- [InventoryApp](../../apps/web/src/features/inventory/InventoryApp.tsx), [contracts](../../apps/web/src/features/inventory/inventoryContracts.ts): consume the planning projection and explanations, preserve explicit manual ordering and product-origin scope, and display read/mutation failures. The final scoped diff is the authoritative UI evidence.

Source review: traced full outstanding-order aggregates, current practice date/stock availability, snapshot-unit comparability, actor-owned cart scope, decimal rounding, offer error isolation and mutation acknowledgement behavior. No patient, dispensing, billing, integration, real-data, dependency or deployment changes.

Tests/runtime/browser: none written or run for this milestone. The user explicitly changed the gate to whole-program implementation, their QA and pass, then test work. Source review does not establish runtime acceptance. Earlier completed checks are recorded only in their own milestone reports.

Remaining risks: read counts and stock are not a transaction snapshot; concurrent stock/offer changes are revalidated by existing write services. Pending orders and draft carts are displayed separately rather than silently reducing confirmed shortage. Supplier eligibility/currency/rounded-cost correctness belongs to the following M5 milestone. After the user's QA pass, cover order history beyond the old cap, partial receipts, held/expired stock, snapshot unit changes, exact rounding, filtering/paging, origin links, explicit cart edits and failure recovery.

Commit: feat(inventory): explain replenishment from complete supply totals [sc-301]. Resolve with git log -1 --format=%H -- records/audits/2026-09-05-inventory-program-m4.md.

# Inventory M3e: delivery reads

2026-09-05 · sc-297 · base eea154e · isolated codex/sc-253/inventory-program worktree.

Objective/acceptance: 25-delivery pages with full counts and open/reconciled/all search; selected shipment detail with complete PO allocation snapshots and saved receipt/reconciliation evidence; exact product/lot lookup for expiry and recall guidance; preserve receiving authority, quantities and explicit acknowledgement refresh.

Confirmed gaps and changed files:
- [ReceivingQuery](../../apps/api/app/queries/clinic/inventory/receiving_query.rb): new scoped queue query; the old receiving alias inherited the 100-order bootstrap cutoff. Search by delivery/order/supplier, fixed page size and explicit selected-shipment scope. Completed selections can remain visible outside the current open queue after saving.
- [InventoryWire](../../apps/api/app/services/clinic/inventory/inventory_wire.rb): selected shipment/PO/receipt inputs only, plus the existing complete destination directory. No full stock, supplier-price, movement or recall graphs. Exact entered-lot lookup returns its known expiry, current hold state and matching recall guidance. Only recorded receipt lots are initially projected; an open delivery does not choose a lot from unrelated existing stock.
- [ManagementController](../../apps/api/app/controllers/clinic/inventory/management_controller.rb): opt-in deliveries and receiving-lot reads behind the existing inventory gate; acknowledged receipt response after the unchanged receiving operation. Legacy full responses stay available.
- [InventoryApp](../../apps/web/src/features/inventory/InventoryApp.tsx), [contracts](../../apps/web/src/features/inventory/inventoryContracts.ts): delivery queue wrapper preserves the receiving form; MUI search/status/page/selection controls; deep links select their exact shipment; cancelled superseded lot reads; accepting stock requires a completed exact-lot check. Lookup failure has explicit retry. Known expiry and quarantine guidance are applied from the server. Lot input is normalized consistently before recall comparison and posting. Saved reconciliation remains visible after acknowledgement, including when it leaves the open queue.

Source/diff review: traced scoped record selection, serializer inputs, literal search and page validation, retained form/receipt evidence, stale lookup cancellation, normalized lot matching and acknowledgement/read separation. No migration, dependency, patient, dispensing, billing, supplier integration, real-data or deployment changes.

Tests/runtime/browser: none written or run. Compiler, build and automated checks were also deferred under the user's instruction: finish implementation, await whole-program user QA pass, then handle testing. Source formatting is not functional verification. Acceptance remains pending QA.

Risks: queue paging is not a transaction snapshot; aggregate counts/search still need later scale measurement. The full destination directory remains until M6. The selected PO keeps all of its lines, and lookup returns all recalls matching that exact lot; existing backend recall policy remains authoritative, including its treatment of historical cases. Multi-line receipt behavior was not expanded. After QA, cover older deliveries beyond 100 orders, saved/no-stock discrepancies, selection outside filters, lookup races/failures/expiry/recalls, permission/tenant denial, exact quantities and browser interactions.

Commit: feat(inventory): page deliveries and resolve exact receiving lots [sc-297]. Resolve with git log -1 --format=%H -- records/audits/2026-09-05-inventory-program-m3e.md.

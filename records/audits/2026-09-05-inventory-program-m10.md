# Inventory M10: scanner-assisted workflows

2026-09-05. Story sc-324. Base 0390a3a. Isolated branch codex/sc-253/inventory-program.

Objective and acceptance: let a keyboard-wedge scanner select existing inventory context in receiving, stock transfer and assigned count sessions. Match exact local SKU, NDC or device identifier; present ambiguous and unmatched codes explicitly. Scanning must never increment a quantity, create a record or post stock. Keep manual entry and current authorization, stale-read and uncertain-mutation safeguards.

Confirmed gaps and changed files:

- [ScanResolver](../../apps/api/app/services/clinic/inventory/scan_resolver.rb): the existing catalog had identifiers but no workflow-local resolution. The new read-only service scopes products to the clinic, requires the context's permission, binds receiving to its selected product and counting to an assigned open session. Count candidates identify existing frozen session lines without expected quantities. Candidate responses are bounded, and full-session line pages allow selection outside the visible page.
- [ManagementController](../../apps/api/app/controllers/clinic/inventory/management_controller.rb) and [routes](../../apps/api/config/routes.rb): add a same-origin POST read endpoint using existing authentication, capability, CSRF and error handling. [Parameter filtering](../../apps/api/config/initializers/filter_parameter_logging.rb) redacts the scan input from parameter logs.
- [InventoryScanInput](../../apps/web/src/features/inventory/InventoryScanInput.tsx) and [contracts](../../apps/web/src/features/inventory/inventoryContracts.ts): shared Material UI input supports Enter and explicit lookup, bounded candidate selection, clear no-match feedback and context-aware async response ownership.
- [InventoryApp](../../apps/web/src/features/inventory/InventoryApp.tsx) and [CycleCountsScreen](../../apps/web/src/features/inventory/CycleCountsScreen.tsx): integrate receiving product validation, product-scoped stock navigation and count-line selection. Existing quantity entry and explicit posting actions remain authoritative.

Checks: parent and delegated source review and git diff whitespace review only. No tests written or executed; no typecheck, build, runtime, browser or hardware checks, following the user's whole-program QA-first instruction. No migration, schema change or dependency was needed.

Remaining risks and boundaries: this milestone supports exact plain identifiers only. Composite GS1 parsing, automatic lot/expiry extraction, camera scanning, hardware SDKs and external directory resolution are not implemented. Lot, expiry and stock-position choice retain manual review. Leading zeros and punctuation must match the stored identifier; there is no guessed GTIN-to-NDC conversion. Live scanner behavior, repeated scans, stale replies, permissions, ambiguity, off-page selection and replay remain for user QA and subsequent authorized tests. No patient, dispensing, billing, integration, real data or deployment scope.

Commit: feat(inventory): assist receiving transfer and counts with local scans [sc-324]. Resolve the exact hash with git log -1 --format=%H -- records/audits/2026-09-05-inventory-program-m10.md.

## Stable snapshot and exact continuation

A separate APPly synchronization task requested a stable inventory commit before merging. This worktree pauses writes after this milestone commit; it does not push or modify main. This is a dated handoff, not whole-program acceptance.

Remaining implementation is M3f, the last part of the screen-specific read milestone:

1. Refresh the Shortcut overlap/claim review and check the inventory branch and synchronization outcome before editing. Preserve subscription work in the other checkout.
2. Extend [ReceivingQuery](../../apps/api/app/queries/clinic/inventory/receiving_query.rb) or the existing purchase-order query with a bounded, searchable delivery-intake selector for sent/partially received orders. Select exact requested order details independently of the selector page. Compute each line's unallocated packages from all unreconciled shipment allocations, matching ManagementController.create_shipment; current ShipmentCreateScreen uses ordered minus received only and can overstate the intake allowance.
3. Add the narrow wire/controller read and shipment acknowledgement response, retaining the legacy response for compatibility. Change ShipmentCreateScreen to this DTO with paging, explicit line selection, current allowance, stale/error handling and retained exact uncertain-outcome retries. Do not change shipment posting semantics.
4. Serve only InventoryWire.context plus a screen marker for catalog creation/configuration. Narrow those component props to the context fields they use and support acknowledgement responses for their existing mutations. Remove the last actual inventory-screen dependency on full bootstrap; retain the legacy endpoint for compatibility.
5. Complete source review, record the changed files/risks and commit M3f separately. Then present the implemented program for the user's QA. Do not write or execute tests, typechecks, builds, runtime or browser checks until the user gives the requested whole-program QA pass.

Prior milestone commit map (each linked record contains objective, acceptance, source gaps, files and verification limits):

| Milestone | Commit(s) | Evidence |
| --- | --- | --- |
| M1 cart | 8dbc90a | [M1](2026-09-05-inventory-program-m1.md) |
| M2 receiving | f97a2a9, bcb548d, 60c79a7 | [M2a](2026-09-05-inventory-program-m2a.md), [M2b](2026-09-05-inventory-program-m2b.md), [M2c](2026-09-05-inventory-program-m2c.md) |
| M3 ledger/catalog/stock/orders/deliveries | 10655fa, 027710b, 3e42a33, eea154e, 4f965b2 | [M3a](2026-09-05-inventory-program-m3a.md), [M3b](2026-09-05-inventory-program-m3b.md), [M3c](2026-09-05-inventory-program-m3c.md), [M3d](2026-09-05-inventory-program-m3d.md), [M3e](2026-09-05-inventory-program-m3e.md) |
| M4 replenishment | 080b4c7 | [M4](2026-09-05-inventory-program-m4.md) |
| M5 supplier correctness | b5894c1 | [M5](2026-09-05-inventory-program-m5.md) |
| M6 locations/bins | 7dea5d3 | [M6](2026-09-05-inventory-program-m6.md) |
| M7 exceptions | 64958cd, 5a0d2dc | [M7](2026-09-05-inventory-program-m7.md) |
| M8 recall cases | 9b40251 | [M8](2026-09-05-inventory-program-m8.md) |
| M9 cycle counts | 0390a3a | [M9](2026-09-05-inventory-program-m9.md) |

Tests predating the user's pause remain historical evidence, not proof for later commits. In particular, M3b recorded unrelated baseline PatientPortal type errors and existing formatting issues; they were not repaired by importing subscription work. M3c onward remains source-only pending the user's QA and subsequent authorized verification.

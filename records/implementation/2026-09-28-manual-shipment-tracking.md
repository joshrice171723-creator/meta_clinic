# Manual shipment tracking source delivery — 2026-09-28

**Milestone:** MC-11 — Inventory / procurement
**Source commit:** `19c2af20` (`feat(inventory): add manual shipment tracking`)
**Build estimate:** MC-11 75% → 79%; MC-01–15 equal-weight average 69.6% → 69.9%. Validation and external/human estimates are unchanged.

Staff can register an expected shipment with optional carrier and tracking identifiers, record manual shipment events with an explanatory note, and see the event history from its purchase order. Only delivered or exception shipments appear in receiving. The event record is append-only and bound in PostgreSQL to the shipment, practice, and recording membership. No carrier is contacted and no live tracking event is claimed.

## Exact source commit line counts

Counts are from `git show --numstat 19c2af20`; binary files are absent.

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/inventory/management_controller.rb` | 20 | 5 |
| `apps/api/app/models/clinic/inventory/shipment.rb` | 16 | 1 |
| `apps/api/app/models/clinic/inventory/shipment_event.rb` | 66 | 0 |
| `apps/api/app/queries/clinic/inventory/purchase_orders_query.rb` | 11 | 1 |
| `apps/api/app/queries/clinic/inventory/receiving_query.rb` | 11 | 3 |
| `apps/api/app/services/clinic/inventory/inventory_wire.rb` | 19 | 8 |
| `apps/api/app/services/clinic/inventory/receiving.rb` | 1 | 1 |
| `apps/api/config/routes.rb` | 1 | 0 |
| `apps/api/db/migrate/20260928000100_add_manual_shipment_tracking.rb` | 40 | 0 |
| `apps/api/db/structure.sql` | 102 | 0 |
| `apps/web/src/features/inventory/InventoryApp.tsx` | 192 | 39 |
| `apps/web/src/features/inventory/inventoryContracts.ts` | 22 | 2 |
| **Total** | **501** | **60** |

## Verification and remaining evidence

- Passed: TypeScript `tsc --noEmit`; Prettier check for both changed frontend files; Rails route lookup; Ruby syntax and scoped RuboCop for changed API files; `zeitwerk:check`; additive migration against the local synthetic development database; generated `structure.sql` diff and `git diff --check`.
- Not run: tests, per Joshua's standing instruction.
- Not verified: browser registration/event/reload/receiving journey or permission-denial walkthrough. The running web server belongs to the main checkout, not this isolated worktree.
- Still separate: actual carrier access, live tracking events, and supplier transactions.

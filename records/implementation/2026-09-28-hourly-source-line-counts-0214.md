# Hourly source line counts — 2026-09-28 02:14 UTC

Source: `git show --format= --numstat` for every source-tree commit after the 2026-09-28 00:15 UTC checkpoint. Documentation-only commits are omitted. Counts measure changed lines, not feature completeness.

| Commit | File | Added | Deleted |
| --- | --- | ---: | ---: |
| `19c2af2061b25812f8f32769ab5b7f9136754a36` | `apps/api/app/controllers/clinic/inventory/management_controller.rb` | 20 | 5 |
|  | `apps/api/app/models/clinic/inventory/shipment.rb` | 16 | 1 |
|  | `apps/api/app/models/clinic/inventory/shipment_event.rb` | 66 | 0 |
|  | `apps/api/app/queries/clinic/inventory/purchase_orders_query.rb` | 11 | 1 |
|  | `apps/api/app/queries/clinic/inventory/receiving_query.rb` | 11 | 3 |
|  | `apps/api/app/services/clinic/inventory/inventory_wire.rb` | 19 | 8 |
|  | `apps/api/app/services/clinic/inventory/receiving.rb` | 1 | 1 |
|  | `apps/api/config/routes.rb` | 1 | 0 |
|  | `apps/api/db/migrate/20260928000100_add_manual_shipment_tracking.rb` | 40 | 0 |
|  | `apps/api/db/structure.sql` | 102 | 0 |
|  | `apps/web/src/features/inventory/InventoryApp.tsx` | 192 | 39 |
|  | `apps/web/src/features/inventory/inventoryContracts.ts` | 22 | 2 |
| **MC-11 manual shipment tracking subtotal** | | **501** | **60** |
| `7d8770dcd7bacd6da694a96a3380520a7337de65` | `apps/api/db/structure.sql` | 0 | 1 |
| **generated schema whitespace correction subtotal** | | **0** | **1** |
| `3ff6ae9f271befa20c45e0369e6ce7a6c9d8f407` | `apps/api/app/controllers/clinic/base_controller.rb` | 1 | 1 |
|  | `apps/api/app/controllers/clinic/context_controller.rb` | 1 | 1 |
|  | `apps/api/app/controllers/identity/api/sessions_controller.rb` | 5 | 5 |
|  | `apps/api/app/services/clinic/deployment_access.rb` | 1 | 0 |
|  | `apps/api/app/services/staging/demo_clinic.rb` | 16 | 3 |
|  | `apps/api/test/integration/production_demo_test.rb` | 3 | 3 |
|  | `apps/web/src/App.tsx` | 2 | 0 |
|  | `apps/web/src/features/clinic/Facilities.tsx` | 8 | 0 |
|  | `apps/web/src/features/identity/DevelopmentAccountSwitcher.tsx` | 0 | 3 |
|  | `apps/web/src/features/owner/OwnerCommandCenter.tsx` | 10 | 0 |
|  | `ops/lightsail/release.sh` | 1 | 0 |
| **demo clinic access and setup route repair subtotal** | | **48** | **16** |
| `b7ed490b6158b6aa9142078364ff02ae50361472` | `apps/web/src/features/clinic/PrescriptionFulfillmentPanel.tsx` | 15 | 6 |
|  | `apps/web/src/features/inventory/InventoryApp.tsx` | 36 | 11 |
| **MC-10/11 recovery paths in this run subtotal** | | **51** | **17** |
| **Checkpoint total** | **4 source-tree commits** | **600** | **94** |

The first three commits were already on main when this run started. This run's source delivery is `b7ed490b`: MC-10 hides an invalid not-sent action for accepted or acknowledged attempts and displays saved reconciliation reason/parent event; MC-11 gates manual status controls by receive permission, restores links to closed delivery records, and shows manual status history at receiving. TypeScript, changed-file Prettier and diff checks passed. No tests or connected browser acceptance ran. Build and validation percentages are unchanged.

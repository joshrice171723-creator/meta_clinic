# 2026-09-27 hourly source checkpoint — exact Git line counts

These are committed source changes since the preceding 20:51 UTC tracker checkpoint. Counts come from `git show --format= --numstat` for each commit. Binary files show as binary instead of a line count. No tests or browser acceptance are inferred.

## ae0aab5f feat(storefront): save shared public page accent

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/membership_prospects_controller.rb` | 1 | 0 |
| `apps/api/app/controllers/clinic/membership_storefront_controller.rb` | 4 | 2 |
| `apps/api/app/controllers/public/clinic_services_controller.rb` | 1 | 1 |
| `apps/api/app/controllers/public/membership_storefronts_controller.rb` | 1 | 1 |
| `apps/api/app/models/clinic/practice.rb` | 1 | 0 |
| `apps/api/app/queries/clinic/operations/configuration_manifest.rb` | 1 | 0 |
| `apps/api/app/services/clinic/membership_growth/storefront_configuration.rb` | 2 | 1 |
| `apps/api/db/migrate/20260927215500_add_public_page_accent.rb` | 8 | 0 |
| `apps/api/db/structure.sql` | 3 | 0 |
| `apps/web/src/features/membershipGrowth/MembershipGrowth.tsx` | 23 | 2 |
| `apps/web/src/features/membershipGrowth/PublicClinicServices.tsx` | 3 | 2 |
| `apps/web/src/features/membershipGrowth/PublicMembershipStorefront.tsx` | 2 | 1 |
| `apps/web/src/features/membershipGrowth/publicPageTheme.ts` | 25 | 0 |
| `apps/web/src/features/membershipGrowth/types.ts` | 2 | 0 |
| `records/implementation/2026-09-27-public-page-accent.md` | 19 | 0 |
| **Commit total (15 files)** | **+96** | **-10** |

## fcbc1b45 feat(operations): summarize authorized scribe activity

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/reports/scribe_activity_controller.rb` | 9 | 0 |
| `apps/api/app/queries/clinic/reports/scribe_activity.rb` | 27 | 0 |
| `apps/api/config/routes.rb` | 1 | 0 |
| `apps/web/src/features/clinic/Operations.tsx` | 1 | 0 |
| `apps/web/src/features/clinic/OperationsIntegrationInventory.tsx` | 77 | 0 |
| `apps/web/src/features/clinic/OperationsProviderReadiness.tsx` | 3 | 2 |
| `records/implementation/2026-09-27-scribe-operations-inventory.md` | 9 | 0 |
| **Commit total (7 files)** | **+127** | **-2** |

## 3e142ce3 feat(reports): add daily cash drawer reconciliation view

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/reports/daily_cash_drawers_controller.rb` | 11 | 0 |
| `apps/api/app/queries/clinic/reports/catalog.rb` | 5 | 0 |
| `apps/api/app/queries/clinic/reports/daily_cash_drawers.rb` | 31 | 0 |
| `apps/api/config/routes.rb` | 1 | 0 |
| `apps/web/src/features/clinic/OperationsReportsCatalog.tsx` | 117 | 1 |
| `records/implementation/2026-09-27-daily-cash-drawer-report.md` | 11 | 0 |
| **Commit total (6 files)** | **+176** | **-1** |

## b5575405 feat(billing): bind cash drawers to an explicit currency

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/billing/cash_drawers_controller.rb` | 2 | 1 |
| `apps/api/app/models/clinic/cash_drawer_session.rb` | 3 | 0 |
| `apps/api/app/models/clinic/cash_tender.rb` | 10 | 0 |
| `apps/api/app/queries/clinic/billing/cash_drawer.rb` | 1 | 1 |
| `apps/api/app/queries/clinic/reports/catalog.rb` | 2 | 2 |
| `apps/api/app/queries/clinic/reports/daily_cash_drawers.rb` | 1 | 1 |
| `apps/api/app/services/clinic/billing/record_cash_payment.rb` | 2 | 0 |
| `apps/api/app/services/clinic/billing/record_cash_refund.rb` | 1 | 0 |
| `apps/api/db/migrate/20260927221000_add_cash_drawer_currency.rb` | 7 | 0 |
| `apps/api/db/structure.sql` | 3 | 0 |
| `apps/web/src/api/contracts.ts` | 1 | 0 |
| `apps/web/src/features/clinic/CashDrawerOperations.tsx` | 53 | 9 |
| `apps/web/src/features/clinic/OperationsReportsCatalog.tsx` | 2 | 1 |
| `records/implementation/2026-09-27-cash-drawer-currency.md` | 11 | 0 |
| **Commit total (14 files)** | **+99** | **-15** |

## 96f32c1b feat(reports): add current stock balances and attention view

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/reports/current_stock_controller.rb` | 12 | 0 |
| `apps/api/app/queries/clinic/reports/current_stock.rb` | 38 | 0 |
| `apps/api/config/routes.rb` | 1 | 0 |
| `apps/web/src/features/clinic/OperationsReportsCatalog.tsx` | 147 | 0 |
| `records/implementation/2026-09-27-current-stock-report.md` | 11 | 0 |
| **Commit total (5 files)** | **+209** | **-0** |

## 4caff5ed feat(public-pages): add saved clinic logo

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/membership_prospects_controller.rb` | 2 | 0 |
| `apps/api/app/controllers/clinic/membership_storefront_controller.rb` | 6 | 2 |
| `apps/api/app/controllers/public/clinic_services_controller.rb` | 12 | 1 |
| `apps/api/app/controllers/public/membership_storefronts_controller.rb` | 3 | 1 |
| `apps/api/app/models/clinic/practice.rb` | 12 | 0 |
| `apps/api/app/queries/clinic/operations/configuration_manifest.rb` | 2 | 1 |
| `apps/api/app/services/clinic/membership_growth/storefront_configuration.rb` | 17 | 1 |
| `apps/api/config/routes.rb` | 1 | 0 |
| `apps/api/db/migrate/20260927224000_add_public_page_logo.rb` | 6 | 0 |
| `apps/api/db/structure.sql` | 3 | 0 |
| `apps/web/src/features/membershipGrowth/MembershipGrowth.tsx` | 83 | 2 |
| `apps/web/src/features/membershipGrowth/PublicClinicServices.tsx` | 14 | 0 |
| `apps/web/src/features/membershipGrowth/PublicMembershipStorefront.tsx` | 14 | 0 |
| `apps/web/src/features/membershipGrowth/types.ts` | 2 | 0 |
| **Commit total (14 files)** | **+177** | **-8** |

## db7618d3 feat(reports): page daily visit source appointments

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/reports/daily_visits_by_state_controller.rb` | 2 | 1 |
| `apps/api/app/queries/clinic/reports/catalog.rb` | 1 | 1 |
| `apps/api/app/queries/clinic/reports/daily_visits_by_state.rb` | 7 | 1 |
| `apps/web/src/features/clinic/OperationsReportsCatalog.tsx` | 30 | 2 |
| **Commit total (4 files)** | **+40** | **-5** |

## 25259f5c feat(workforce): surface paged work after account revocation

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/operations/follow_ups_controller.rb` | 3 | 1 |
| `apps/api/app/services/clinic/operations/follow_up_worklist.rb` | 22 | 10 |
| `apps/web/src/features/clinic/WorkInbox.tsx` | 103 | 29 |
| `apps/web/src/features/workforce/EmploymentAdminPage.tsx` | 9 | 0 |
| **Commit total (4 files)** | **+137** | **-40** |

## f1065b82 feat(procurement): retain dated supplier quotes on draft orders

| File | Added | Deleted |
| --- | ---: | ---: |
| `apps/api/app/controllers/clinic/inventory/management_controller.rb` | 15 | 2 |
| `apps/api/app/controllers/clinic/inventory/supplier_pricing_controller.rb` | 30 | 1 |
| `apps/api/app/models/clinic/inventory/supplier_product.rb` | 3 | 0 |
| `apps/api/app/services/clinic/inventory/ingest_price_sheet.rb` | 3 | 0 |
| `apps/api/app/services/clinic/inventory/inventory_wire.rb` | 4 | 2 |
| `apps/api/app/services/clinic/inventory/purchase_cart_checkout.rb` | 3 | 1 |
| `apps/api/config/routes.rb` | 1 | 0 |
| `apps/api/db/migrate/20260927225000_add_manual_supplier_quote_provenance.rb` | 14 | 0 |
| `apps/api/db/structure.sql` | 7 | 0 |
| `apps/web/src/features/inventory/InventoryApp.tsx` | 22 | 1 |
| `apps/web/src/features/inventory/SupplierPricing.tsx` | 154 | 1 |
| `apps/web/src/features/inventory/inventoryContracts.ts` | 6 | 0 |
| **Commit total (12 files)** | **+262** | **-8** |

**All nine commits: +1323 / -89 lines.**

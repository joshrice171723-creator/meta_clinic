# MC11 quoted-fee source increment

Base: `d3c8de26580879bcb70abbc5f30cccfd91b50d53`. Dedicated branch: `codex/mc11-quote-fee-provenance-20260930`.

## Approved requirement and bounded contract

Original coverage matrix row 11-P42 and `docs/development/meta-clinic-build-and-acceptance.md:227` require known quote fees distinct from merchandise prices, with unknown fees preserved. Fee categories, calculation, allocation and supplier policy remain undefined.

This increment records one supplier-stated fee amount, its quote currency and a required supplier-stated basis. It preserves exact decimal strings (six places), explicit zero and unknown (all three fields NULL). Currency derives from the validated quote currency. It does not multiply, allocate, rank by or add the fee to order totals. The UI labels evidence as excluded from merchandise totals. Staff can record the evidence through both existing quote forms. Existing authorization, tenancy, CSRF, audit and stale-offer guards remain in use.

Acceptance: saving a quote with `1.230001 USD / Entire quoted shipment` preserves that exact evidence on the offer and closed request. Changing the fee invalidates a previously selected cart digest and requires explicit refresh. Both existing order-preparation paths snapshot the evidence; subsequent offer edits or price-sheet imports cannot change those historical snapshots. Blank means unknown, zero means a known zero, an amount without basis is rejected, and imports clear the replaced manual fee. Existing rows upgrade to unknown without backfill assumptions.

## Owned source

- Forward migration `apps/api/db/migrate/20260930213011_preserve_supplier_quote_fee_evidence.rb`: optional fields and complete-tuple/nonnegative/currency/basis/source checks on offers, quote requests and PO lines.
- `apps/api/app/controllers/clinic/inventory/supplier_pricing_controller.rb`: quote evidence parsing, existing-quote save, manual-offer creation, closed-request snapshot.
- `apps/api/app/controllers/clinic/inventory/management_controller.rb`: manual order line snapshot and digest.
- `apps/api/app/services/clinic/inventory/purchase_cart_checkout.rb`: cart digest and checked-out order line snapshot; merchandise math unchanged.
- `apps/api/app/services/clinic/inventory/ingest_price_sheet.rb`: replaced fee evidence cleared.
- `apps/api/app/services/clinic/inventory/inventory_wire.rb`, `apps/web/src/features/inventory/inventoryContracts.ts`: additive exact evidence contract.
- `apps/web/src/features/inventory/SupplierPricing.tsx`, `InventoryApp.tsx`, `quoteFeeEvidence.ts`: supplier evidence entry and offer/request/order display. InventoryApp's pre-existing unrelated formatting is preserved.

## Executed synthetic evidence

`BROWSER_EXECUTABLE_PATH=/usr/bin/chromium pnpm --dir apps/web exec vitest run test/supplier-quote-fee-workflow.test.ts test/supplier-quote-fees.test.ts test/supplier-request-pages.test.ts --maxWorkers=1`: **3 files, 9 tests passed**. The new mounted case exercises the production quote component/API client with intercepted synthetic HTTP: missing basis prevents submission; exact amount/basis/currency/stale timestamp are sent; a rejected save refreshes the offer; staff reopen and submit the same evidence; confirmed evidence is displayed. Three helper cases distinguish unknown/legacy, zero and exact fractional evidence. Five existing mounted paging/read-only cases remain passing. These are browser/source checks, not Rails persistence or provider acceptance.

`pnpm --dir apps/web run build`: **passed**, including TypeScript. Selected changed frontend files pass Prettier; `git diff --check` passes. No new dependencies.

## Sage backend gate: not executed in cloud

`ruby --version` returns command not found. No runtime/database/provider was provisioned. Authored Rails regressions cover exact/zero/unknown/rejected evidence, closed-request history, CSV replacement, both PO snapshot paths, unchanged merchandise totals and fee-only stale-cart rejection. They have not run here. Generated `db/structure.sql` must be supplied/reviewed by the runtime owner; it was not fabricated.

Run against the existing local PostgreSQL service, from `apps/api`, on a fresh uniquely named synthetic test database. These commands neither start infrastructure nor touch an existing development database:

```sh
python ../../bin/agent-resources run -- ruby bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc11_quote_fee_20260930 SKIP_TEST_DATABASE=1 SCHEMA=tmp/mc11-fee-structure.sql bin/rails db:create db:migrate db:structure:dump
python ../../bin/agent-resources run -- ruby bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc11_quote_fee_20260930 SKIP_TEST_DATABASE=1 SCHEMA=tmp/mc11-fee-structure.sql bin/rails test test/integration/clinic_supplier_pricing_test.rb test/integration/inventory_purchase_cart_test.rb test/services/clinic/inventory/purchase_cart_checkout_offer_selection_test.rb
python ../../bin/agent-resources run -- ruby bin/postgres exec bin/verify-backend
python ../../bin/agent-resources run -- ruby bin/postgres exec bin/verify-postgres
```

Confirm scratch name is unused before creation; retain failure evidence and stop on migration/constraint/authorization errors. Review generated structure and changed-file Ruby checks before integration. Existing unrelated schema/history must remain intact. The verification harnesses manage only their own generated scratch databases. An upgrade test with an existing pre-migration quote must verify all new fields remain NULL; a second migration run must be a no-op.

## Remaining boundaries

11-39 durable delivery-attempt preparation/persistence/recovery is still missing source; this increment does not close it. 11-40 backend vendor simulation is unchanged and cannot establish external acceptance. Undefined delivered-cost/fee allocation and provider contracts remain clinic/provider decisions. No simulator, live supplier order, payment, carrier call, credentials, patient data, scores, PR, main merge or deployment was created. Independent scorer owns credit; this record claims only the executed checks above.

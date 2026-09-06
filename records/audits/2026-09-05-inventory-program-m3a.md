# Inventory M3a: bounded searchable activity reads

Date: 2026-09-05. Base: `60c79a711c5eceb658941f96bef3dafba402ea0e`.
Worktree: `C:/Users/joshr/Desktop/Work/APPly-inventory-program`.
Branch: `codex/sc-253/inventory-program`. Claim and exact commit: [sc-275](https://app.shortcut.com/apply-1/story/275).

This is the first cohesive screen-specific read slice following [M2 completion](2026-09-05-inventory-program-m2c.md). The [original audit](2026-09-05-inventory-program-audit.md) contains rankings and dependencies for all ten improvements. M3 remains broader than this ledger slice.

## Objective and acceptance

Search the complete practice movement ledger and browse bounded, stable pages without loading unrelated inventory graphs. Preserve tenant/read permissions, exact decimals, truthful counts, previous-page retention after a failed read, and distinct empty/no-match states. Existing API callers must remain compatible.

## Confirmed gaps and changed files

- `apps/api/app/controllers/clinic/inventory/management_controller.rb#activity` previously aliased the complete bootstrap. It now selects the narrow projection for `view=ledger`; calls without that view retain the original response. Existing inventory-read authorization remains authoritative.
- `apps/api/app/queries/clinic/inventory/activity_query.rb` is the domain query for the previously missing cross-product ledger read. Existing CatalogQuery/ProductDetailsQuery remain intact because neither owns this ledger. The query scopes pharmacy entries to the current practice, searches type/reason/displayed source with escaped literal wildcard text, validates a positive bigint cursor, returns at most 50 movements, and supplies full matching/overall counts. ID-descending keyset pages preserve the previous recorded-order convention.
- `apps/api/app/services/clinic/inventory/inventory_wire.rb` reuses its extracted context and existing movement serializer. The activity response includes page metadata and the rows' lot/location/stock-unit labels; it does not load or pretend to return catalog, supplier, order, recall, batch-history or audit collections.
- `apps/web/src/features/inventory/inventoryContracts.ts` defines the distinct narrow activity response. `InventoryApp.tsx` selects that endpoint, validates response scope, ignores superseded reads and clears screen data on route changes. Existing ActivityScreen uses MUI TextField/Button/Alert for submitted server search, counts, older/newest navigation, loading and read errors. Failed reads retain the previous rows; filter/no-match and empty-ledger behavior from sc-132 remains.
- `apps/api/test/integration/inventory_activity_test.rb` covers full-history search, bounded hydration, exact labels/quantities, traversal after an insert, malformed input, literal wildcards, tenant/permission denial and legacy response compatibility.
- `apps/web/test/inventory.test.tsx` verifies rendered totals, units, page controls, loading/failure retention text and empty/no-match/empty-page states.
- `bin/verify-web` now asserts the new narrow search contract through the real frontend proxy. An observed startup-only `Net::OpenTimeout` is handled by its existing bounded readiness retry; application assertions and ordinary request failures are unchanged.

## Verification

- API integration: **3 tests / 68 assertions**, no failures/errors, seed 21355. Traversed the initial 205 movements exactly once after inserting a new movement between pages; found an old receipt beyond the former 200-row cap. At most 51 movement objects were hydrated to select a 50-row page; unrelated product/offer/order classes were not hydrated.
- Web: **16 files / 178 tests passed**. Full build remains blocked by the same **28 baseline PatientPortal type errors**; direct Vite bundle passed. npm audit found 0 vulnerabilities. Whole-repository formatting reports the same 78-file baseline debt.
- Root `bin/verify-web`: final run passed all phases including the narrow ledger/decimal assertion, after recording and correcting the startup timeout handling. Generated scratch database and helper processes were cleaned by the verifier.
- Scoped query/controller/test RuboCop clean. InventoryWire retains one unchanged module-ending whitespace offense; the extracted context's trailing comma was corrected. Zeitwerk passed. Brakeman: 0 errors / 0 warnings.
- Live Chromium shell, existing binary and isolated fixture database: 207-entry ledger loads 50 rows, older navigation changes the page, keyboard search finds the older 2.5 mL receipt, no-match/clear recovery works, forced offline read preserves existing rows and explicit retry succeeds. Network inspection confirmed **no inventory bootstrap request** on Activity.
- Screenshots inspected at **1440, 834 and 768 px**; no horizontal page overflow. The existing table scroll container contains its wide columns on tablets. Evidence images and browser driver remain in ignored `apps/api/tmp/m3a-*`; no browser dependency was installed.

No migration or production authorization code changed, so migration/concurrency-write/restore suites were not repeated for this read-only slice. The full Rails suite was not run. This is local fixture evidence, not deployment or operational acceptance.

## Remaining risks and next milestone

Counts are live and may change between page requests; a cursor is a stable older-ID boundary, not an archival snapshot. Complete counts and substring search still scan matching database history; large-practice query cost needs measurement before adding indexes or changing search semantics.

The other inventory screens still use the legacy bootstrap. Continue M3 with the catalog/overview using existing CatalogQuery, CatalogResponse and SQL stock aggregates, preserving global totals and existing filter/sort semantics while bounding displayed product/detail rows. Then migrate purchasing/receiving and exception/count reads in cohesive verified commits before M4 replenishment. Do not mark M3 or all ten improvements complete based on this activity slice.

Subscription work, patient linkage, dispensing, real data, external suppliers, billing, dependencies, schema and deployment remain outside this commit. M2's task-only fixture and runtime isolation are preserved.

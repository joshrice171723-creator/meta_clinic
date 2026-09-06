# Inventory program M3b: catalog reads

Date: 2026-09-05. Story: sc-282. Base: `10655fa7e7b5cdf23b3351a7d22904eb75246467`. Branch: `codex/sc-253/inventory-program` in the isolated inventory worktree. The subscription checkout is untouched.

## Objective and acceptance

Bound the overview to 20 products and a 20-lot attention preview; search/filter/sort the complete clinic catalog in SQL, expose accurate counts, preserve exact available/on-hand quantities, supplier fallback and reorder editing, and retain explicit loading/error/empty states. Legacy callers retain the full response. This is another slice of M3, not completion of all screen reads.

## Confirmed gaps and files changed

- [CatalogQuery](../../apps/api/app/queries/clinic/inventory/catalog_query.rb): the existing stock aggregation was used by the older pharmacy screen, while the modern overview filtered complete arrays. Added its table projection with scoped search across product identifiers, displayed supplier, lots and locations; whitelisted stock status/sort; deterministic name/id ties; bounded pages and total counts. Uses existing `PharmacyProduct.with_stock` and active-hold semantics.
- [InventoryWire](../../apps/api/app/services/clinic/inventory/inventory_wire.rb): full bootstrap hydrated every product/batch plus receipt/movement history and unrelated purchasing/recall collections. Added a separate narrow catalog shape, reused the product serializer for both paths, selected the latest receipt supplier in SQL when no preferred supplier exists, and returned a counted held/recalled preview and destination-availability flag.
- [ManagementController](../../apps/api/app/controllers/clinic/inventory/management_controller.rb): `catalog` aliased bootstrap. `?view=table` now opts into the narrow read behind the existing permission gate; default stays compatible.
- [InventoryApp](../../apps/web/src/features/inventory/InventoryApp.tsx), [contracts](../../apps/web/src/features/inventory/inventoryContracts.ts): overview now uses the new endpoint and server counts/pages. MUI search/status/sort/paging controls replace the changed raw controls. Search submits with Enter; reorder/header refresh retain applied filters. Added no-match and failed-read retention. Attention shows its total and a stock-detail link. Shared helpers accept only the fields they consume. Exact base units no longer append an incorrect `s` to mL in the catalog.
- [Rails coverage](../../apps/api/test/integration/inventory_catalog_test.rb), [web coverage](../../apps/web/test/inventory.test.tsx), [web verifier](../../bin/verify-web): added before the user's testing-sequence change below.

## Completed checks before the user changed the sequence

- Failure first: 3 API tests failed on absent catalog metadata and unvalidated filters before implementation.
- Catalog + activity integration: 7 tests, 163 assertions passed, seed 20020. Includes complete paging/search, literal wildcards, tenant/permission checks, exact decimals, preferred/latest supplier precedence, destination readiness, multiple/released holds, bounded 25-lot attention, inactive and expired stock. No batch, receipt, movement, offer or order model hydration in the catalog read.
- Web: 16 files / 179 tests passed. A new test fixture initially missed two required nullable fields; corrected. Final typecheck showed only the same 28 baseline PatientPortal errors. Direct Vite bundle passed (existing large-chunk warning). Full build remains blocked by those baseline portal types; no subscription work was imported. Formatting reports 77 existing-file issues; no broad formatting sweep.
- Root `ruby bin/verify-web` passed all real proxy/session/CSRF/origin/role/settings/receipt/portal checks, including new catalog and ledger decimal contracts. Its generated scratch database and helpers were removed by the verifier.
- Scoped RuboCop: query/controller/test clean; InventoryWire retains its one baseline module-ending blank-line offense. Zeitwerk passed. Brakeman: 0 errors / 0 warnings. Ruby and npm audits: no vulnerabilities.
- Real browser, isolated local fixture database with 47 products: 20-row first and distinct second pages; Enter search by lot beyond the first two pages; exact 2.5 mL; reorder-point save and refresh preserve filters; no-match/reset; failed read retains rows and explicit recovery succeeds. Network capture confirms no inventory bootstrap request. Screenshots at 1440/834/768 inspected: page containment and horizontal stock table remain usable.
- Browser driver failures preserved: first navigation preceded Rails readiness; added task-local API readiness wait. A later driver advanced before same-page refresh completed; waiting for its request and new saved value fixed the driver race. No application workaround was added for those driver issues.

## User-directed verification pause and risks

After the checks above, the user instructed: skip tests until the entire implementation is finished, the user performs QA, and grants a pass. No more test writing, automated checks or browser tests will run before that approval. Existing coverage is retained. Source/diff review and separate implementation commits continue. This instruction supersedes the earlier per-milestone test gate.

Remaining risks: production-scale query timing has not been benchmarked; SQL still computes full-catalog counts/stock aggregates and uses offset pages, so concurrent catalog changes can move rows between pages. The attention preview is bounded and links to existing full stock detail; M7 owns the later exception queue. Other screens still request bootstrap. No schema, stock mutation or authorization policy changed, so database-write/restore/full Rails suites were not repeated. Broad release/operational acceptance is not claimed.

Commit: the commit containing this record and `feat(inventory): page and search catalog overview [sc-282]`; resolve with `git log -1 --format=%H -- records/audits/2026-09-05-inventory-program-m3b.md`.

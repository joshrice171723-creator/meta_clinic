# Inventory program milestone 1: purchase-cart hardening

Date: 2026-09-05. [Audit, ranking and dependencies](2026-09-05-inventory-program-audit.md).
[Claim and commit reference: sc-253](https://app.shortcut.com/apply-1/story/253).
Branch: `codex/sc-253/inventory-program`; worktree: `C:/Users/joshr/Desktop/Work/APPly-inventory-program`.
Base: `856887b229152caeb94b6f2f4155b0247e2fdb03`.

## Objective and acceptance

Protect the existing cart HTTP actions and checkout operation against incorrect clinic/actor authority, stale writes, malformed inputs, changed supplier snapshots, request-key misuse and partial multi-supplier writes. Preserve the existing API response shape and supplier-grouped draft purchase orders.

Acceptance for this bounded application milestone:

- Cart changes authorize the current actor, serialize with checkout and recheck draft state while locked.
- Destination lookup and checkout independently require the facility to belong to the current practice; checkout requires active status and a complete address.
- Whole package quantities stay positive and at most 1,000,000 after duplicate-product merging; supplier-package conversion respects the same bound. A cart supports at most 100 products. Invalid source/status/unit values fail validation.
- The server owns supplier, price, actor and practice values. Unavailable offers and inactive products fail closed. A changed reviewed price/SKU/ordering unit produces the existing `cart_offer_changed` conflict and preserves the draft.
- One valid UUID key belongs to one cart checkout. Uppercase UUIDs normalize; matching retries return the same order IDs; different carts/keys cannot silently reuse a completed checkout.
- Failure after a supplier order has been written rolls back all orders, lines, events and cart-item links. No write is attempted inside a failed PostgreSQL transaction's rescue path.
- Focused HTTP tests, real independent-connection races and an isolated live HTTP smoke prove these behaviors. Applicable broader checks are recorded separately below.

## Confirmed gaps and exact changes

| File | Baseline gap | Change |
| --- | --- | --- |
| [ManagementController](../../apps/api/app/controllers/clinic/inventory/management_controller.rb) | Metadata update, item update and removal did not serialize with checkout; add did not recheck draft state and accepted raw facility IDs; merged quantity could exceed its input bound. | Existing cart actions now use `with_draft_lock`; facility selection is scoped and active; product/offer reads are locked in the mutation transaction; parsing enforces whole packages and cumulative bounds. Unrelated actions are unchanged. |
| [PurchaseCart](../../apps/api/app/models/clinic/inventory/purchase_cart.rb) | Tenant concern did not validate destination tenancy; no shared draft-state mutation guard. | Added same-practice destination validation and a locked draft mutation block. Practice/user shared locks follow existing inventory lock order, authorization is rechecked after acquiring the cart lock, and successful edits increment the existing version. |
| [PurchaseCartItem](../../apps/api/app/models/clinic/inventory/purchase_cart_item.rb) | Source/status/input-unit were only presence-checked; malformed values reached database constraints. | Added matching application validations and the aggregate quantity bound. |
| [PurchaseCartCheckout](../../apps/api/app/services/clinic/inventory/purchase_cart_checkout.rb) | Snapshot omitted SKU/ordering identity; inactive products were eligible; keys were incompletely bound; destination association could cross practice; rescue updated an aborted transaction. | Locked identity/context and source records, rechecked permission and destination, validated/normalized UUIDs, bound retries to carts, extended fingerprint, bounded package conversion and removed rescue writes. Existing transaction/grouping remains authoritative. |
| [InventoryPurchaseCartTest](../../apps/api/test/integration/inventory_purchase_cart_test.rb) | One happy-path test. | Expanded to 14 HTTP/service cases with 116 assertions. Uses minimal fixture clinic/role records through the existing authorization helper rather than unrelated patient/office fixtures. |
| [Inventory cart race and runtime verifier](../../apps/api/test/verification/inventory_purchase_cart_races.rb) | No cart concurrency/runtime proof. | Added independently connected PostgreSQL draft/checkout/stale-edit tests and actual loopback HTTP session/CSRF/add/checkout/replay. Only runs against an `apply_inventory_program_*` test database. Stops its own temporary server in `ensure`. |
| [Existing PostgreSQL client wrapper](../../apps/api/bin/pg-client.rb) | Container `psql` could not open a Rails schema dump at a Windows host `--file`/`-f` path, blocking the required verifier. | Stream an existing local file through stdin while preserving the file-option position. Existing no-file commands and restore/dump paths remain unchanged. No dependency added. |
| [Program audit](2026-09-05-inventory-program-audit.md) and this record | No current ten-item evidence/ranking/handoff. | Dated source audit, relative priority/effort, dependency order, exact source map, bounded acceptance and continuation instructions. Shortcut remains the live task owner. |

No migration, schema, route, shared type, frontend, dependency, billing or subscription file changed. The original dirty working tree was not staged or copied into this branch.

## Verification record

All commands ran in the isolated worktree. Rails commands below run from `apps/api`; Python vault checks run from the repository root. Existing local PostgreSQL was used only for separately named task databases. The local helper credential stayed in ignored runtime storage and was never printed or committed.

| Evidence | Command / observation | Result |
| --- | --- | --- |
| Automated test | `ruby bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_inventory_program_test BUNDLE_FROZEN=true ruby bin/rails test test/integration/inventory_purchase_cart_test.rb` | Final run: **14 tests, 116 assertions, zero failures/errors/skips**, seed 33321. |
| Automated concurrency | `ruby bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_inventory_program_races BUNDLE_FROZEN=true ruby bin/rails runner test/verification/inventory_purchase_cart_races.rb` | All three independent-connection cases passed: unique active cart, idempotent simultaneous checkout, stale edit rejected after checkout commit. |
| Live local HTTP | Same verifier, temporary Puma on `127.0.0.1:3016`, test database, random fixture account | Login **200**, CSRF, add **201**, checkout **201**, replay **201** with identical order IDs. Server stopped after the check. No browser session used. |
| Automated test | `ruby bin/postgres exec env BUNDLE_FROZEN=true python bin/verify-backend` | Passed all six reported invariant groups, including inventory wire/PO/receipt traceability, recalls, transfers, tenancy and controlled separation of duties; verifier removed its own scratch database. |
| Automated test | `ruby bin/postgres exec env BUNDLE_FROZEN=true APPLY_TEST_DATABASE=apply_inventory_program_test python bin/verify-postgres` | Final run **passed all four stages**: legacy upgrade, concurrent stock/settings, backup/restore, and fresh initialization. Earlier runs failed fresh schema loading; the narrowly scoped wrapper correction and recovery are documented below. |
| Automated migration | `db:migrate` with `RAILS_ENV=test`, task-specific test database, and `SCHEMA` directed to ignored `tmp` | All 73 baseline migrations applied to each of two fresh task test databases. |
| Automated migration | `db:migrate` with `RAILS_ENV=development`, `APPLY_DEVELOPMENT_DATABASE=apply_inventory_program_fresh`, and task-local `SCHEMA` | Independent fresh-database reproduction passed all migrations after the verifier failure. |
| Automated static | `ruby bin/rubocop` with the seven changed Ruby paths | Seven files inspected, no offenses; includes the verification wrapper. |
| Live PostgreSQL client | `ruby bin/postgres exec env PGDATABASE=apply_inventory_program_fresh ruby bin/pg-client.rb psql --no-psqlrc --tuples-only --no-align --file 'tmp/cart schema smoke.sql'` | Returned `host-file-stream-ok` from SQL in a Windows host file with spaces in its name. |
| Automated static | `ruby bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_inventory_program_test BUNDLE_FROZEN=true ruby bin/rails zeitwerk:check` | Passed eager loading. |
| Automated security | `ruby bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error` with frozen bundle | Zero errors and zero security warnings. Windows fork warning did not prevent the completed scan. |
| Dependency audit | `ruby bin/bundler-audit check --update` with frozen bundle | No vulnerabilities reported; advisory database updated 2026-09-05. No dependency or lockfile changes. |
| Documentation | `python -B bin/verify-vault`; `python -B bin/vault-audit` | 44 vault notes and 521 wiki links verified; hygiene output is advisory baseline size/metadata findings. No vault edits. |
| Source/diff | `git diff --check`; scoped diff and Markdown-link verification | Passed; all relative links resolve. Shared schema/routes/lockfile/frontend still match the isolated branch's base. |
| Not run | Full Rails suite, full-project RuboCop, frontend tests/build, visual browser/responsive checks | The selected component suite and runtime proof cover the backend change. No frontend or visual behavior was changed or claimed browser-verified. |

Initial test failures were fixture errors, not accepted passes: catalog mutations attempted to bypass actor attribution and immutable package-unit guards. Tests now use `update_catalog!` for permitted changes and an explicit second-order SQL fault for rollback proof. The runtime probe initially expected login 201; actual session creation returns 200. The expectation was corrected and the full runtime verifier rerun successfully.

`db:prepare` initially attempted to feed a Windows file path to container `psql`; it failed without loading the schema. Explicit migration from source succeeded. The final handoff must not describe the initial schema-load or full-verifier failure as a pass.

The failure was reproduced in the empty, task-created `apply_inventory_program_schema_probe` database by running `db:migrate` with `SCHEMA` pointing at an existing Windows dump. The exact failure was `psql: error: .../tmp/inventory-fresh-structure.sql: No such file or directory`. Rails 8.1's `DatabaseTasks.initialize_database` loads an existing dump for a fresh database; the repository's Docker `psql` wrapper did not stream a host `--file` path. Migrating the independent fresh database with a new, nonexistent dump path passed. The claim was extended to the minimal existing-wrapper correction needed to complete this check: pass the host file as stdin and change its psql argument to `-`. No schema-loading guard was disabled. The empty reproduction database was then removed by its exact task-owned name.

## Remaining risks

- This is hardening of supported application mutations, not a full SQL-bypass redesign. Cart destination still has its original single-column foreign key; application validation and scoped checkout are the protections added here. Database owners and unsupported direct writes are outside the bounded acceptance.
- Existing draft items with the old fingerprint require explicit refresh through the existing item update action before checkout. Completed cart retries are checked before offer selection, so recorded orders do not get repriced.
- Supplier eligibility/ranking, unknown availability, contract status and comparing offers in different currencies remain M5. The present checkout rejects mixed selected currencies; it does not perform currency conversion.
- Receiving's supplier-package conversion and exact-allocation-only restriction remain M2. No claim that placing an order proves its eventual receiving workflow.
- Browser error presentation and multi-tab review of draft quantities were not tested. Locks protect committed checkout state; they do not constitute a browser optimistic-concurrency/review contract.
- The wrapper correction is deliberately limited to existing local files supplied with separate `--file` or `-f` arguments, as Rails uses. It does not claim to implement every possible psql command-line form.
- No release, professional, clinical, security-certification or real-data acceptance. Nothing pushed, merged into the subscription checkout or deployed.

## Exact continuation handoff

Continue from `C:/Users/joshr/Desktop/Work/APPly-inventory-program` on `codex/sc-253/inventory-program`. Resolve this milestone's commit with `git log -1 --format=%H -- records/audits/2026-09-05-inventory-program-m1.md`; the sc-253 completion comment also records the exact hash. Inspect `git status --short` and current Shortcut claims before new writes. Do not cherry-pick, merge or stage the subscription work unless separately requested.

M2 is the next bounded implementation milestone: **delivery and receiving discrepancies**. Read `Receiving`, `ManagementController#create_shipment/create_receipt`, `Shipment`, `ShipmentLine`, `Receipt`, `ReceiptLine`, `PurchaseOrderLine`, current SQL receipt/allocation triggers, `InventoryWire`, `inventoryContracts.ts`, and the Delivery/Receiving screens in `InventoryApp.tsx`. Start by making PO-linked receipt units come from the immutable PO line's conversion factor and proving a supplier package that differs from the catalog package. Then extend the existing receipt/hold evidence to explicitly capture expected, delivered, accepted and held/rejected quantities with a reason and unresolved discrepancy state. Do not relax allocation or stock guards without equivalent new invariants.

M2 acceptance: normal full receipt remains compatible; short/damaged/extra/wrong-lot entries produce explicit discrepancies rather than silent stock; only accepted/held quantities actually received enter the appropriate balance; excess cannot silently exceed the order; outstanding PO quantities remain truthful; retries do not duplicate movements; contradictory lot expiry and cross-practice allocation fail; exact package snapshots survive catalog/supplier changes; automated authorization/concurrency/receipt tests and visible receiving workflow checks pass. Follow the database-change playbook for necessary additive schema work and coordinate unique migration versions and `structure.sql` with sc-246 first.

After committing M2, proceed serially through M3 screen-specific reads, M4 explainable replenishment, M5 supplier correctness, M6 location/bin hierarchy, M7 expiration/exception queue, M8 recall cases, M9 cycle-count program, and M10 scanner assistance. Each row of the linked audit gives current files, hard dependencies and required proof. Do not label the remaining nine proposals implemented based on this handoff.

Runtime resources left for continuation are fixture-only task databases `apply_inventory_program_test`, `apply_inventory_program_races`, and `apply_inventory_program_fresh`. No new persistent service was installed. The HTTP probe owns port 3016 only while it runs; it refuses an occupied port. Use an independent development database and different ports if later UI work needs a managed full stack. Never point the worktree's development lifecycle at the original subscription database.

## Completion addendum

The bounded M1 application implementation and stated local acceptance checks passed. The full PostgreSQL verifier passed after the host-file streaming correction. Final staged diff: seven Ruby files and these two dated evidence records; no unrelated existing edits. The milestone is committed separately, with its exact hash recorded in sc-253 and the user handoff. Browser visual acceptance, the broader risks above and milestones 2-10 remain outside this completed slice. No new milestone was started before M1 verification and commit.

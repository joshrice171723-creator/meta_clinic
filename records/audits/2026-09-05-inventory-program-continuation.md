# Inventory program continuation checkpoint

Dated 2026-09-05. This is an exact handoff snapshot, not an alternative live task register. Shortcut Agent Workspace owns claims, acceptance and status. Follow root/nested AGENTS.md before writes.

## Resume location and authority

- Worktree: `C:/Users/joshr/Desktop/Work/APPly-inventory-program`
- Branch: `codex/sc-253/inventory-program`
- Original main baseline: `856887b229152caeb94b6f2f4155b0247e2fdb03`
- M1: `8dbc90a52d052035b64dd2759e571d56a7c3c9e5`, [sc-253](https://app.shortcut.com/apply-1/story/253)
- M2a: `f97a2a94669430be71775a6cf53cdfaf716e1b2d`, [sc-259](https://app.shortcut.com/apply-1/story/259)
- M2b: the commit containing this checkpoint; exact hash and review gate are in [sc-264](https://app.shortcut.com/apply-1/story/264).
- Start with `git status --short`, `git branch --show-current`, and `git log -3 --oneline`; preserve any subsequent changes.
- Main/other subscription work lives in `C:/Users/joshr/Desktop/Work/APPly`, owned by sc-246. Do not merge its code or use its databases/services to clear inventory verification failures.
- The user authorized continued autonomous inventory work, one cohesive verified milestone and local commit at a time. No push, deployment, patient linkage, dispensing, supplier connection, billing change, real data or new dependency is authorized.

## First action: resolve the remaining broad M2 verification gates

Read [M2a evidence](2026-09-05-inventory-program-m2a.md) and [M2b evidence](2026-09-05-inventory-program-m2b.md), then inspect/reuse sc-264. M2b focused tests, PostgreSQL guards/races, live proxy and desktop browser receiving/rejection/reload passed. Root `bin/verify-web` now migrates its empty scratch database correctly, but named fixture setup fails with an inventory permission error at unchanged `Development::TestAccounts.prepare!` line 68 → `TestClinic.create!`. Trace its opening adjustment and effective grant/transaction timing; timing is a hypothesis, not a confirmed cause. Coordinate sc-246 before any write to shared development-account fixtures. The full web build still has 28 confirmed baseline patient-portal type errors. Do not start M3 while the broad gate remains unresolved.

A separate tablet/narrow viewport was not verified. Desktop at 1051 × 899 passed keyboard shipment selection, balanced-count protection, damage classification, explicit confirmation, saved observations and reload. Fixture-only database `apply_inventory_program_browser` is migrated and contains a named `client-a` development account, its inventory-only configured clinic, a supplier package of 7.25 mL versus catalog 10.5 mL, a delivery reconciled through the real Vite proxy as two accepted / one missing, and a replacement rejected through the browser as zero accepted / one damaged package. Stock remains 14.5 mL and the PO has one package outstanding. Create a new task-only delivery for another fresh-form check; never rewrite inspection history. Servers 3125/3126 were stopped. Restart only on verified free ports, loopback-bound, with hidden Windows helper windows; stop only your captured processes afterward.

From `apps/api`, the existing launcher form is:

```powershell
$env:BUNDLE_FROZEN='true'
ruby bin/postgres exec env RAILS_ENV=development APPLY_DEVELOPMENT_DATABASE=apply_inventory_program_browser APPLY_TEST_DATABASE=apply_inventory_program_browser_unused APP_DEVELOPMENT_LOGIN=1 ruby bin/rails server -b 127.0.0.1 -p 3126 --pid tmp/pids/inventory-m2b-browser.pid
```

From `apps/web`, set existing `APPLY_API_PORT=3126` and `APPLY_WEB_PORT=3125` in that process and run Vite on loopback 3125. Open `/login?next=%2Fclinic%2Finventory%2Freceiving`, select **Test Client A**, and use the existing **Use test login** control. All displayed inventory must come from the API. Do not seed fake frontend fallbacks.

## Remaining execution order

The [read-only audit](2026-09-05-inventory-program-audit.md) contains rankings, dependency reasons and source evidence for all ten items. Continue in this order after M2 acceptance, claiming each bounded milestone in Shortcut and committing it separately:

| Next | Exact starting points | Acceptance focus |
| --- | --- | --- |
| M3: screen-specific reads | `apps/api/app/controllers/clinic/inventory/management_controller.rb` screen aliases; `apps/api/app/services/clinic/inventory/inventory_wire.rb`; existing `CatalogQuery` / `ProductDetailsQuery`; `apps/web/src/features/inventory/InventoryApp.tsx` bootstrap load | Reuse existing SQL queries. Stable bounded pages, complete aggregate totals, tenant/permission checks, explicit history pagination; migrate screen consumers together. No wholesale frontend rewrite. |
| M4: explainable replenishment | Existing frontend `replenishmentCandidates`, availability queries, PO line received/remaining quantities | Server-owned exact available/on-order/deficit/rounding explanations. Missing/rejected deliveries remain outstanding; unsent drafts do not count as confirmed supply. |
| M5: supplier correctness | `PurchaseCartCheckout.select_offer`, SupplierProduct and supplier pricing screen | Contract/availability/effective-date eligibility, package-rounded economics and explicit currency boundaries. No guessed exchange rates or external integrations. |
| M6: location/bin hierarchy | Location, Clinic::Site, location APIs and existing facility/receiving selectors | Add bounded parent/site/bin relationships with same-practice/cycle/active-state checks; preserve existing locations and historical stock. |
| M7: expiration and exception queue | Availability/holds, existing attention views, new ShipmentReconciliation evidence | One actionable, paginated queue with ownership and reviewed resolution; never release held/recalled/expired stock implicitly. Reuse M2 evidence rather than duplicate receiving records. |
| M8: recall cases | Recall, RecallLot, RecallDisposition and existing Recall screen | Case-wide affected lots/batches, disposition evidence and closure only when all affected balances satisfy the case. Preserve recall-linked holds. |
| M9: cycle counts | Count.observe!, Count approval/investigation and existing controlled screen | Sessions/worklists/assignment around immutable cutoff observations and existing independent approval; stale-count and concurrent stock protection. |
| M10: scanner workflows | Existing UDI/GTIN catalog lookup and receiving/count entry points | Local keyboard-wedge capture, deterministic parsing/matching, explicit operator confirmation and ambiguous/unmatched states. No SDK, supplier integration or patient/dispensing scope. |

## Verification environment and known constraints

- Use `BUNDLE_FROZEN=true` to avoid unrelated Gemfile.lock churn.
- Focused test database: `apply_inventory_program_test`; independent-connection/runtime database: `apply_inventory_program_races`. Use only these or a newly generated task-owned name. Existing PostgreSQL helper targets loopback port 54329 and reads its ignored credential file; never print it or reset/drop shared databases.
- Example focused test: `ruby bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_inventory_program_test ruby bin/rails test test/services/clinic/inventory/receiving_test.rb`.
- Example runtime: `ruby bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_inventory_program_races ruby bin/rails runner test/verification/inventory_purchase_cart_races.rb`. It creates fixture data and temporarily owns port 3016; check the port first. All seven groups passed at this checkpoint.
- Migration/history/authorization changes require `verify-backend` and `verify-postgres`; API contract changes require root `verify-web`. Each creates only its own scratch databases. Root `verify-web` now uses actual migrations and a task-local schema dump rather than falsely marking migrations applied.
- The installed web lockfile is unchanged. Web tests pass; the full build has 28 confirmed pre-existing patient-portal type errors. Direct Vite bundle passes. Whole-repo formatting debt and two baseline InventoryWire RuboCop offenses remain; do not clean unrelated files.
- Preserve generated schema changes for each inventory migration only. The committed snapshot has older unrelated drift; actual migration-based fresh initialization, upgrade and restore passed. Final gate results and exact commit hashes belong in the corresponding Shortcut Story and result record.

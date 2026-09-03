---
type: execution-handoff
status: active
updated: 2026-09-02
---
# APPly Inventory Integration Handoff

## Ownership

APPly is the runtime and source of truth. The standalone prototype remains a visual and domain reference only:

- Prototype reference: `C:\Users\joshr\Desktop\New folder (3)\pharmacy-inventory-completed-2026-09-01\pharmacy-inventory-completed-2026-09-01`
- APPly implementation: `C:\Users\joshr\Desktop\Work\APPly`
- APPly frontend: `apps/web/src/features/inventory/`
- APPly Rails API: `apps/api/app/controllers/clinic/inventory/management_controller.rb`
- APPly wire contract: `apps/api/app/services/clinic/inventory/inventory_wire.rb`

The integration does not copy the prototype shell, actor switcher, SQLite database, or fixture fallback into APPly. Authentication, practice tenancy, authorization, persistence, CSRF, and audit identity remain APPly-owned.

## User-facing routes

| Screen | APPly route | API read endpoint |
| --- | --- | --- |
| Product catalog | `/clinic/inventory` | `/api/clinic/inventory/bootstrap` |
| Replenishment | `/clinic/inventory/replenishment` | `/api/clinic/inventory/replenishment` |
| Purchase orders | `/clinic/inventory/purchasing` | `/api/clinic/inventory/purchase-orders` |
| Receiving | `/clinic/inventory/receiving` | `/api/clinic/inventory/receiving` |
| Inventory and lots | `/clinic/inventory/lots` | `/api/clinic/inventory/lots` |
| Activity ledger | `/clinic/inventory/activity` | `/api/clinic/inventory/activity` |
| Recalls | `/clinic/inventory/recalls` | `/api/clinic/inventory/recalls` |
| Controlled reconciliation | `/clinic/inventory/controlled` | `/api/clinic/inventory/controlled` |

The existing `/clinic/pharmacy*` and `/api/clinic/pharmacy*` compatibility routes remain available.

## Domain mapping

Existing APPly inventory models remain authoritative for products, suppliers, locations, lots/batches, balances, receipts, movements, holds, counts, profiles, and audit records. The additive workflow migration adds purchase orders and events, shipments, transfers, recalls and dispositions, and controlled reviews. Composite practice/actor keys and database checks preserve tenant boundaries.

All consequential commands use a request key, server-side capability checks, a PostgreSQL transaction, and append-only movement/event/audit records. Controlled certification requires a separate authorized reviewer after variance resolution.

## Local synthetic demo

In an explicitly enabled local development session, the inventory page can load the canonical synthetic scenario. It uses APPly PostgreSQL IDs and creates no patient or clinical association:

- Acetaminophen: 600 available tablets at Main Pharmacy.
- Dextroamphetamine: 300 tablets at Controlled Cabinet, with a synthetic 300 expected / 299 counted variance.
- Purchase order `PO-2026-000345`: 45 ordered, 40 received, 5 remaining, `$108 + $12 = $120`.
- Shipment `MS-88421`: 40 packages / 4,000 units, quarantined for a recall match.
- Recall `FDA-ACET-2026-08`: 4,000 units held pending evidence-backed disposition.

The scenario is idempotent and is available only through the local development demo boundary.

## Verification evidence

Completed checks include:

- Clean-room Rails workflow verifier: inventory wire, purchase-order/receipt traceability, recall blocking/disposition, transfer replay, tenant isolation, and controlled separation of duties.
- Architecture route/model boundary tests: 4 runs, 349 assertions, 0 failures.
- Zeitwerk eager loading, scoped RuboCop, Brakeman, Bundler audit, Ruby syntax, TypeScript, frontend tests, production build, and high-severity npm audit.
- Visible browser workflow across all eight screens, including blocked recalled transfer, adjustment, recall disposition, premature certification denial, separate-reviewer certification, replenishment draft, and purchase-order lifecycle transitions.

The reviewed browser runtime uses a disposable PostgreSQL database and is reachable locally at `http://127.0.0.1:3005/clinic/inventory`. Do not treat that database as application data.

## Mainline integration reconciliation — 2026-09-02

The mainline inventory migration and the earlier local patient-membership migration had independently used version `20260902000400`. Mainline retains that published inventory version. The unmerged patient-membership and provider-assignment migrations moved forward to `20260902000800`–`20260902001000`, and `20260902001100_reconcile_inventory_management_workflows` now handles the already-existing local collision without rewriting migration history. It returns when all inventory objects exist, creates the complete workflow only when none exist and refuses a partial state. An architecture test prevents duplicate migration versions.

The persistent `apply_development` database was migrated forward without a reset. It now contains both the tracking-board membership/provider structures and the complete inventory-management workflow. A managed `./dev_server_startup restart --seed --no-browser` passed readiness on ports 3000/3001, and the database-backed inventory scenario loaded successfully in the normal clinic shell.

The local Omni account intentionally retains unrestricted clinic behavior while its selected profile changes presentation. Inventory database triggers also authorize writes from immutable role grants, so Omni role version 4 gives every Omni presentation profile the complete database-enforced inventory permission set. This aligns Rails capability responses with PostgreSQL enforcement without weakening ordinary account grants or production guards.

The integrated UI preserves the shared clinic shell and local tracking/schedule navigation, synchronizes parent and inventory subroutes, supports browser Back, and keeps all eight inventory screens inside `/clinic/inventory*`. Redundant environment/provenance labels were removed from ordinary inventory screens; the persistent clinic header remains the single visible environment marker.

APPly also has PostgreSQL 17 host clients while the local Docker server is PostgreSQL 18.6. Verification must continue through the repository-managed container commands; a host-client warning alone is not database compatibility or release evidence.

The inventory workflow migration intentionally refuses `db:migrate:down` to prevent destructive removal of immutable workflow evidence. Revert by restoring a reviewed database backup and applying a forward migration, not by deleting workflow tables.

## Adversarial hardening — 2026-09-02

A Sol/medium read-only review identified six integration blockers, all corrected before closing the merge:

- Receipt posting and purchase-order reconciliation now share one locked transaction; controlled-count correction and investigation also commit or roll back together.
- Receiving, transfer, control-review and recall-disposition replay checks bind the complete command intent. The browser retains an unconfirmed command's key and permits only an explicit same-intent retry.
- Rails workflow capabilities and PostgreSQL triggers now agree through a constrained transaction-local action context. Positive atomic-capability tests cover transfer to Returns Holding, while a negative database test proves an unrelated catalog context cannot authorize a posting.
- Quantities and money serialize as exact decimal strings, and browser totals/comparisons use scaled `BigInt` helpers rather than JavaScript-number coercion.
- Inventory subnavigation uses the clinic's shared History API owner.
- The fabricated count witness field and seed-specific recall routing condition were removed. Transfer-to-Returns-Holding now creates the intended safety hold.

Repository-wide verification after these corrections passes 266 Rails tests / 4,202 assertions and 141 frontend tests, plus eager loading, RuboCop over 307 files, Brakeman, dependency audits, PostgreSQL upgrade/concurrency/restore/fresh-migration checks, the backend invariant verifier, the live frontend/API boundary and vault validation. A managed seeded restart and live browser pass on port 3000 traversed all eight inventory routes, exercised browser Back and returned to the populated tracking board with membership, provider, care and vital data intact. The existing Vite large-chunk warning remains non-blocking.

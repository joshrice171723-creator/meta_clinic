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

## Known local environment limitation

The existing persistent `apply_development` database has unrelated pre-existing migration drift: migration `20260902000100_index_patient_care_summary_records` is marked applied while required patient columns are absent. APPly also has PostgreSQL 17 host clients while the local Docker server is PostgreSQL 18.6. The safety guard refused to reset or regenerate that persistent volume. Repair or replace that local environment separately before using the default `3000` runtime; the inventory integration was verified against clean disposable databases instead.

The inventory workflow migration intentionally refuses `db:migrate:down` to prevent destructive removal of immutable workflow evidence. Revert by restoring a reviewed database backup and applying a forward migration, not by deleting workflow tables.


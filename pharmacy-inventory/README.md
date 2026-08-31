# Pharmacy inventory background

Updated: **2026-08-30**

This folder retains the source product specification, database design, and PostgreSQL proposal. The working synthetic pharmacy experience is now part of APPly's existing Rails EHR workspace at `/clinic/pharmacy`; there is no separate pharmacy app or Vite build.

## Retained reference material

- `PRODUCT_SPECIFICATION.md` — proposed full inventory scope and acceptance criteria, not a claim that all features are implemented.
- `DATABASE_DESIGN.md` — proposed entities, invariants and query patterns.
- `schema.sql` — original PostgreSQL proposal, preserved unchanged. Do not run it against APPly's Rails database: it defines overlapping identity tables and lacks the composite clinic constraints used in the implementation.

## Rails implementation

See [the site README](../site/README.md) for startup and [the Rails README](../site/backend/README.md) for boundaries. Paths below are relative to `site/backend/`.

- `app/services/pharmacy/ndc_directory.rb` ports the FDA lookup/mapping from `src/fdaNdc.js`. It uses `packaging.package_ndc`, expands package options, matches the selected NDC to its own description, bounds network requests, and handles unavailable/empty responses.
- `app/controllers/clinic/pharmacy_controller.rb` and `app/views/clinic/pharmacy/` provide the catalog, explicit public-directory search/import, lot receiving, movement history and stock/expiry worklists.
- `db/migrate/20260830000400_create_pharmacy_inventory.rb` adapts products, lots and append-only movements to clinic-scoped SQLite tables, with separate batch-status history. `db/structure.sql` preserves the database guards when preparing fresh databases.

The standalone React/Vite UI, HTML entry point, stylesheet, browser helper, package manifest and npm lockfile were removed after the port. They remain recoverable from Git commit `f0421ae`. No frontend dependency installation or JavaScript runtime is required.

## Implemented boundary

The local prototype tracks **whole sealed packages**, with no dose conversion. Batches use a required fictional location and optional fictional supplier label. Stock is derived from the movement ledger; receipts, count corrections, damage, expiry write-offs and supplier returns are recorded with an authenticated actor and reason. Quarantine/recall/release reviews preserve status history. Expired, held and inactive-product stock is excluded from availability. No dispensing, patient links or procurement action is implemented.

FDA searches are explicit, server-side HTTPS requests containing only the entered public name/NDC. Search results are signed, short-lived and bound to the current account/clinic before import. Imports add reference metadata, never stock; duplicate package imports reuse the existing catalog entry. There is no background ingestion job, API key, bulk import, auto-refresh, or recall feed. Listing does not imply FDA approval or medical suitability; see [openFDA's NDC guidance](https://open.fda.gov/apis/drug/ndc/).

This is not the full pharmacy specification. Decimal dispensing units, transfers, barcode hardware, supplier/location administration, purchasing, valuation, historical reports/export, persistent alert acknowledgment, controlled-substance workflows, prescription integration and production authorization remain unimplemented. All stock examples must be wholly synthetic, and clinic routes remain disabled in production.

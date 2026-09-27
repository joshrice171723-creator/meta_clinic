# 2026-09-27 - MC-14 current stock report

Added a current-stock query and Operations report using existing ProductDetailsQuery.positions and PharmacyProduct.with_stock calculations. Pharmacy totals preserve stock-unit groups and physical versus available quantities; availability reuses hold, expiry, product and location rules. Details retain product/lot/location/expiry, show impending expiry and link to the existing product-filtered Lots workspace. All/available/held/expired filtering and 25-row pagination reuse inventory semantics.

Office items have separate pages, each-unit quantities and reorder indicators; no location or expiry tracking is invented for that model. Reorder counts cover the clinic, while pharmacy unit totals follow the selected status filter. Office quantities are never added to pharmacy quantities. All amounts remain exact strings. The read permission and practice scope precede every query.

The report includes current snapshot time, inventory date/timezone and source tables. It is independent of the daily report date and explicitly is not a historical stock balance or valuation. No stock-changing operation, clinical rule or vendor call was introduced.

Checks: TypeScript, one-file Prettier, three-file RuboCop and scoped diff review passed. A read-only managed Rails query over existing synthetic inventory returned four pharmacy positions, two office items and one unit group. Source walkthrough covered filter reset, independent page state, full-cohort totals and exact product-to-Lots navigation; no browser acceptance or tests ran. Page-two, empty/held/expired and permission-denial behavior remain unverified at runtime.

MC-14 source progress is recorded here for the next hourly tracker/atlas checkpoint; no immediate percentage adjustment.

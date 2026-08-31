# Pharmacy Inventory Management System — Database Design

**Status:** Proposed relational design  
**Last verified:** 2026-08-30  
**Dialect:** PostgreSQL 15+ baseline  
**Next action:** Confirm database engine and decide whether inventory quantities are tracked in packages, dispensing units, or both.

## Design principles

- Batch-level traceability is mandatory.
- Inventory history is an append-only ledger.
- Current stock is represented by the sum of movement quantities, not by an untraceable mutable counter.
- Negative stock is rejected by transaction-level validation in the application or database procedure layer.
- Product, batch, and movement records are retained for history.
- All business tables include pharmacy ownership to support future location growth.
- Patient-identifying information is outside this schema.

## Entity summary

| Entity | Purpose |
| --- | --- |
| `pharmacies` | Pharmacy organization and timezone configuration |
| `users` | Staff identity and role status |
| `suppliers` | Supplier directory |
| `product_categories` | Optional catalog grouping |
| `products` | Medicine/product master data and reorder settings |
| `inventory_locations` | Shelves, rooms, dispensaries, or stores |
| `product_batches` | Batch/lot, expiration, cost, and status |
| `purchase_orders` | Optional receiving reference |
| `purchase_order_items` | Product quantities expected or received |
| `inventory_movements` | Immutable stock ledger |
| `stock_alerts` | Actionable low-stock and safety alerts |
| `audit_log` | Record of important entity changes |

## Quantity model

`inventory_movements.quantity` is signed:

- Positive values add stock.
- Negative values remove stock.

The application should calculate available quantity for a product/batch/location as the sum of movements, excluding or separately reporting quantities moved into non-available statuses. A production implementation should expose transactional procedures for receiving, dispensing, adjusting, and transferring so validation and ledger writes cannot be bypassed.

## Important constraints

- Product names and supplier names are required.
- Batch number and expiration date are required for stocked batches.
- A batch cannot reference an inactive or unrelated product.
- Movement quantities cannot be zero.
- Movement types are constrained to the documented set.
- Transfer movements share a `transfer_group_id`.
- Soft deactivation is used instead of deleting products or locations.

## Recommended indexes

- Product search by normalized brand/generic name.
- Barcode and SKU lookup within a pharmacy.
- Batch lookup by product, location, status, and expiration date.
- Movement history by pharmacy, location, batch, and occurred time.
- Unresolved alerts by severity and due time.
- Audit history by entity and changed time.

## Transaction expectations

Every stock-changing command should run in one transaction:

1. Lock or otherwise serialize the affected product/batch/location balance.
2. Validate product, batch, location, status, permissions, and quantity.
3. Insert the movement row.
4. Update or create related alert rows.
5. Insert audit details where applicable.
6. Commit only after all validations pass.

## Security and privacy boundary

The schema contains staff identifiers but no patient identifiers. Credentials and secrets must not be stored in these tables. Application authorization must be enforced before movement insertion, and audit records should be protected from ordinary staff edits.
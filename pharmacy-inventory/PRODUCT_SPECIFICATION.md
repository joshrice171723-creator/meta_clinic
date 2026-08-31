# Pharmacy Inventory Management System — Product Specification

**Status:** Proposed MVP specification  
**Last verified:** 2026-08-30  
**Scope:** Inventory operations only; no patient data  
**Next action:** Confirm operating assumptions and approve the database target before application development.

## 1. Product objective

Provide pharmacy staff with a reliable view of what medicine is available, where it is stored, which batch should be used next, what needs reordering, and why inventory changed.

The system is an operational inventory tool. It is not a dispensing decision-maker, clinical system, regulatory certification, or substitute for pharmacy supervision and applicable procedures.

## 2. Users and roles

### Pharmacy administrator

- Manage pharmacy locations, users, suppliers, products, and configuration.
- Review audit history and inventory reports.
- Approve or perform stock corrections according to local procedure.

### Inventory staff

- Receive shipments and assign batches to locations.
- Record transfers, returns, damage, expiration, and cycle counts.
- Review stock and alerts.

### Pharmacist or dispensing staff

- Review available batches and expiry ordering.
- Record dispensing-related stock deductions through an approved workflow.
- Quarantine or flag recalled inventory.

### Read-only reviewer

- View catalog, stock, alerts, and reports without changing inventory.

Role enforcement belongs to the application layer. The database records the acting user for accountability.

## 3. MVP capabilities

### 3.1 Dashboard

Show:

- Total active products.
- Total available units by location.
- Low-stock products.
- Batches expiring within a configurable window.
- Expired, recalled, and quarantined stock.
- Recent inventory movements.

### 3.2 Product catalog

Each product can include:

- Brand and generic names.
- Active ingredient.
- Strength and dosage form.
- Package description and unit of measure.
- SKU, barcode, and optional NDC identifier.
- Prescription-required and controlled-substance flags.
- Reorder point and target stock level.
- Preferred supplier.
- Active/inactive status.

The catalog describes a product; quantities belong to batches at locations.

### 3.3 Batch and location tracking

Each batch records:

- Batch/lot number.
- Expiration date.
- Quantity received and current quantity.
- Cost and optional selling price.
- Supplier and receipt reference.
- Storage location.
- Status: active, depleted, expired, recalled, or quarantined.

The system should recommend first-expiring, first-out (FEFO) batches, but a qualified staff member remains responsible for the final selection.

### 3.4 Inventory movements

Supported movement types:

- Receipt from supplier.
- Dispense/stock deduction.
- Positive or negative adjustment.
- Return to supplier.
- Customer return.
- Damaged stock.
- Expired stock.
- Recalled stock.
- Transfer into a location.
- Transfer out of a location.

Every movement includes quantity, batch, location, acting user, timestamp, reason, and optional external reference. Movement records are append-only.

### 3.5 Alerts

Generate alerts for:

- Available quantity at or below reorder point.
- Batches approaching expiration.
- Expired batches with remaining quantity.
- Recalled or quarantined batches.

Alerts should be de-duplicated per product/batch/location/alert type and retain resolution history.

### 3.6 Audit and reporting

Reports should support:

- Current inventory by product, batch, and location.
- Inventory valuation using recorded unit cost.
- Movement history by date, user, type, product, batch, and location.
- Expiration and recall worklists.
- Stock adjustments and their reasons.

## 4. Core business rules

1. A stock quantity cannot become negative.
2. A movement must reference the product, batch, and location affected.
3. A batch belongs to one product and one pharmacy; it may be stocked at multiple locations through movements.
4. Expired, recalled, and quarantined units are excluded from available-to-dispense quantity.
5. Corrections create compensating movements; historical movements are not overwritten.
6. Transfers create paired outbound and inbound movements linked by a common reference.
7. A receiving operation and its stock movement must commit atomically.
8. Product deactivation does not delete historical products, batches, or movements.
9. Quantities use a non-negative decimal type to support package and unit-based inventory where needed.
10. All timestamps are stored in UTC and displayed in the pharmacy’s configured timezone.

## 5. Key workflows

### Receive shipment

1. Select supplier and receiving location.
2. Enter product, batch number, expiration date, quantity, cost, and receipt reference.
3. Validate required fields and duplicate batch conditions.
4. Create or update the batch record.
5. Append a `RECEIPT` movement.
6. Recalculate alerts and commit the transaction.

### Record stock deduction

1. Select product and location.
2. Display eligible batches ordered by earliest expiration.
3. Select batch and quantity.
4. Validate that the batch is active and has enough available quantity.
5. Append a `DISPENSE` movement with a non-patient reference such as an internal transaction number.
6. Recalculate alerts.

### Quarantine or recall stock

1. Select product, batch, location, and affected quantity.
2. Record the reason and source reference.
3. Append the appropriate movement or status change.
4. Exclude affected units from available stock.
5. Create or update a visible alert.

### Cycle-count correction

1. Record the counted quantity and reason.
2. Compare counted quantity with the ledger-derived quantity.
3. Require an authorized user to approve the difference where configured.
4. Append an adjustment movement for the difference.
5. Preserve the original count and approval details.

## 6. MVP acceptance criteria

- Staff can create and deactivate products without deleting history.
- Staff can record multiple batches of the same product with different expiration dates.
- Current quantity can be derived from movements and cannot go negative.
- Receiving and dispensing update stock atomically.
- The system identifies low-stock and expiring inventory.
- Expired, recalled, and quarantined stock is not treated as available.
- Every stock change identifies the acting user and reason.
- A transfer can be traced from outbound to inbound movement.
- No patient-identifying fields are required for inventory operations.
- An export or report can reproduce the inventory position for a selected location and date.

## 7. Future considerations

These are intentionally deferred:

- Patient and prescription systems.
- Purchasing automation and vendor integrations.
- Barcode scanning hardware integration.
- Controlled-substance-specific workflows and required dual approvals.
- Accounting, invoicing, and payment processing.
- Multi-tenant SaaS authentication and organization billing.
- External regulatory reporting.

Each deferred area requires separate workflow, security, and professional review before implementation.
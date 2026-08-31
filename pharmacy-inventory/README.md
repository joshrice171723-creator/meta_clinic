# Pharmacy Inventory Management System

Status: **Specification and database design only**  
Last updated: **2026-08-30**

This folder defines the initial inventory-management product for a pharmacy. It does not contain an application, deployment configuration, authentication implementation, or patient-record functionality.

## Scope

The first release is intended to help pharmacy staff:

- Maintain a medicine catalog.
- Track stock by batch/lot and expiration date.
- Receive inventory from suppliers.
- Record dispensing, returns, transfers, damage, expiration, recalls, and corrections.
- Identify low-stock, expiring, expired, recalled, and quarantined inventory.
- Review an auditable history of inventory changes.

## Deliberate exclusions

The initial design does **not** store:

- Patient names, addresses, dates of birth, medical records, or other patient identifiers.
- Prescriptions or clinical notes.
- Payment-card information.
- Credentials, tokens, or secrets.

Prescription and patient workflows can be integrated later through a separately reviewed boundary.

## Files

- `PRODUCT_SPECIFICATION.md` — product goals, workflows, roles, business rules, and MVP acceptance criteria.
- `DATABASE_DESIGN.md` — entities, invariants, query patterns, and implementation notes.
- `schema.sql` — initial relational schema and lookup data.

## Schema assumptions

`schema.sql` targets PostgreSQL 15+ syntax while keeping the model straightforward to adapt to another relational database. The application should use transactions for every stock-changing operation and should never edit or delete historical movement rows during normal operation.

## Next step

Before implementation, confirm the target database, pharmacy operating model, number of locations, staff roles, barcode requirements, and the review required for applicable pharmacy and controlled-substance workflows.
---
type: architecture-pointer
status: superseded-proposal-pointer
updated: 2026-09-13
lifecycle: superseded
canonical_for: historical-data-modeling-proposal-pointer
---
# Data Modeling

Home: [[00 Home]] · Current boundary: [[Clinic Domain and Data Boundaries]] · Developer design: [target-state ERD](../../docs/architecture/clinic-target-state-erd.md) · Original proposal: [dated record](../../records/proposals/2026-08-30-data-modeling.md)

## Current disposition

This note's former catalog, illustrative SQL and broad security proposal are preserved unchanged in the dated proposal record. They are not executable schema or a mandate to implement every proposed entity. Migrations and `apps/api/db/structure.sql` remain runtime truth.

## Durable boundary

Practice-local custody, tenant-qualified relationships, immutable clinical/history records, a single authoritative inventory ledger, explicit protected-document ownership, and complementary audit evidence remain the durable design invariants. Current unresolved professional, retention, identity, external-service and release gates remain open in [[Risks and Assumptions]] and [Meta Clinic Implementation Tracker](Meta%20Clinic%20Implementation%20Tracker.md).

## Auditing design

The original audit design and synthetic acceptance cases remain available in the [dated proposal](../../records/proposals/2026-08-30-data-modeling.md). Do not treat its examples as evidence that access-read auditing, independent durability or protected-value handling is complete.

## Inventory and commercial boundary

The broader inventory/commercial proposal is preserved in the [dated proposal](../../records/proposals/2026-08-30-data-modeling.md). The implemented inventory foundation and later workflow evidence are separate current source/documentation concerns.

## Required synthetic acceptance scenarios

Historical scenarios remain in the [dated proposal](../../records/proposals/2026-08-30-data-modeling.md), with dated applicability. They must be revalidated against current source before being promoted to current acceptance.

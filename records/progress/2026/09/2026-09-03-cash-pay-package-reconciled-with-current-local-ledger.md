---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Cash-pay package reconciled with current local ledger

**Request and outcome:** performed a read-only inspection of the active synthetic `apply_development` PostgreSQL billing tables and current allocation operation before revising [[Cash-Pay Billing Implementation Package]]. The package now records the confirmed bigint/practice/patient/exact-decimal ledger shape, unique `(practice_id, external_event_reference)` payment idempotency, existing locked allocation behavior, separate credit/refund history, and the actual absent records needed for payment sources, drawers/tenders, processor events/intents, receipts, invoice numbering, and service dates.

**Limits:** the database contains synthetic records only; no row content, payment credentials, real data, migrations, application code, payment, receipt, processor configuration, or hosted environment was changed. The selected source-table design deliberately leaves existing payment events source-free rather than inventing historical payment methods; a processor event remains unapplied until verified and reconciled.

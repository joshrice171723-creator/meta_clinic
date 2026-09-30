# Local carrier tracking preparation

## Assignment and authority

MC11 source-only assignment from dot, 2026-09-30. Implement grounded local carrier preparation identity/provenance/replay; no carrier API, send, credentials, response ingestion or simulator completion. Josh directs no tests/build/lint. Relay owns integration, tracker and release. Supplier delivery preparation is already built at `07121a53607f0176cf503deee635cf5ab351622d`; this branch starts there and does not modify or duplicate its implementation.

## Current sources and decisions

Authority: D-072 in [Decisions](../../../APPlyVault/03%20Execution/Decisions.md), [vendor-independent workflows](../meta-clinic-build-and-acceptance.md#vendor-independent-workflow-preparation), and original MC08/11/13 matrix `d3c8de26580879bcb70abbc5f30cccfd91b50d53`, `records/audits/2026-09-30-mc08-mc11-mc13-original-source-coverage.md`, row11-39. They require durable request/source-version identity, actor/time/correlation and unsent preservation separate from manual domain events.

Existing `ManagementController#create_shipment` records shipment/order linkage, carrier/tracking strings, references and quantities. `ShipmentEvent.record!` attributes manual transitions; receiving independently records stock receipt/reconciliation. No carrier preparation/acknowledgement exists in those paths. Supplier preparation supplies the existing practice/user authorization locks, immutable snapshot, exact retry and authorized recovery pattern used here.

Source/version requirement is grounded in the existing immutable shipment record: `clinic_inventory_shipments` already has PostgreSQL `immutable_history`, practice/id uniqueness, actor and purchase-order linkage. Manual events/receiving do not rewrite it. No detailed vendor field map is selected. No healthcare exchange guide defines this internal stock-logistics preparation record; it contains existing nonclinical shipment identifiers and generic software attempt provenance, not new clinical fields. Carrier interface documentation and partner requirements remain external prerequisites before any adapter.

## Connected journey

1. In Purchasing, an authorized reader opens the existing shipment alongside its independent manual event history.
2. The new panel loads the immutable shipment source/digest and local preparation history. It explicitly shows a disconnected carrier and unknown external outcome.
3. With existing `inventory.receive` permission and active inventory configuration, an operator reviews the recorded carrier/tracking identifiers, enters a reason and saves local tracking-lookup preparation. Nothing is sent.
4. Server locks/rechecks authorization and the shipment, validates its reviewed digest and writes one immutable preparation with attempt UUID, correlation UUID, actor and preparation time. The HTTP acknowledgement confirms this local record only.
5. After a lost response, the retained body/key remains frozen. Exact retry returns the original record; protected history lookup by the retained key can reconcile it independently of the displayed history limit. Failed/denied retries cannot erase prior uncertainty.
6. Manual shipment status events, delivery and clinic receiving remain separate. They cannot resolve the unknown carrier outcome or generate carrier-confirmed evidence.

## Fields and action rules

Routes: `GET` / `POST /api/clinic/inventory/shipments/:id/carrier-preparations`. Reads require the existing inventory-access gate and `procurement.read`. Creates require `inventory.receive` and repeat the existing Access transaction checks/active inventory configuration, including shared practice/user locks. The caller cannot choose actor, practice, status, provider or correlation identity.

POST body: `{preparation: {request_key, source_digest, reason}}`. UUID retry key is normalized lowercase; reason1–200 characters. Caller-supplied digest must match the server snapshot. Source snapshot: immutable shipment ID and creation-time version reference, linked purchase-order ID, shipment/supplier references, supplied carrier/tracking identifiers, original package count/expected units and recording time. Source tag is `manual_shipment_record`, operation `tracking_lookup`. It excludes mutable manual status/receiving history deliberately: those are not carrier responses or changes to carrier query identifiers. No units/quantities are recalculated.

Preparation record: tenant/shipment/actor foreign keys, UUID attempt/correlation identities, source/intent SHA256 digests, key, reason, JSON snapshot and prepared timestamp. Only `prepared` / `disconnected` / `unknown` / `local_preparation` are supported. Database checks bind these states; immutable trigger denies update/delete, including bulk mutation. Composite foreign keys bind shipment/actor membership to the clinic. Model is read-only after persistence.

One preparation per shipment source digest prevents a new key from duplicating an unresolved source after reload. Exact same-key/same-actor/same-source/same-reason retry returns the original record before checking current source eligibility. Changed intent conflicts. The source version is immutable shipment identity plus creation time and digest, not a fabricated mutable version counter. A future provider contract must explicitly define additional transport attempts, polling and response/reconciliation semantics; this increment does not manufacture them.

GET returns `{data: {source_digest, snapshot, can_prepare, attempts, truncated, recovered_attempt}}`. Existing history remains readable when configuration is suspended, while server-projected preparation eligibility becomes false. POST returns `{acknowledged: true, data: persisted_record}`. Newest25 records are displayed and truncation is explicit; retained-key recovery remains independent. No public unauthenticated reads/writes or new grants.

Browser fences reads and writes by component generation, read sequence and actor/practice/shipment key. Retained requests lock competing order/financial/shipment actions; the owning panel can still perform exact retry and protected reconciliation. Explicit current-source review clears a retained request only after a successful history read finds no owned key record; the unique source constraint still prevents a later second-key duplicate. Navigation/unload warns while uncertainty remains. No browser persistence, automatic replay, carrier job or credential backfill.

## Ownership and dependency matrix references

Nova owns the new `CarrierPreparation` model, forward migration `20260930222511`, `PrepareCarrierTracking` service, carrier controller, new MUI shipment panel, two additive routes and narrow `InventoryApp` mount/blocker integration. Supplier preparation files, supplier fees, manual shipment transitions and receiving services remain unchanged. Relay should cherry-pick this increment after its supplier base; do not cherry-pick the supplier lane twice. No canonical score/tracker changes.

## Implementation and acceptance

Source mechanism implemented. Static review checked route/payload matching, existing permission/configuration locks, tenant/actor foreign-key targets, existing shipment immutability, exact replay, source uniqueness, fixed unknown states, immutable record guard, retained-key lookup and frontend freeze/fencing/blockers. `git diff --check` passed.

No tests, typecheck, formatter/lint, bundle, Rails runtime, migration execution or live operation ran. No generated `structure.sql` was fabricated; migration/schema integration remains deferred to the established local runtime when verification is authorized. Ruby is absent here; no provisioning attempted. This is source evidence, not verified persistence, carrier connectivity, delivery/receipt acceptance or 11-40 simulator evidence.

Deferred synthetic checks when authorized: correct saved linkage/reload, missing identifiers, write/read denial and foreign shipment, suspended configuration, stale digest, identical retry after manual status changes, altered intent conflict, different-key/same-source duplicate, lost reply→denied retry→owned recovery, late replies/unmount, failed history preserving uncertainty, explicit missing-key reconciliation, no changes to shipment events/receipts/stock, composite constraints and immutable bulk guards.

## Checkpoint

Proposed tracker entry: **MC11 / 11-39 carrier local preparation:** immutable shipment-bound tracking-query snapshot, attributed request/attempt/correlation identity, exact retry and authorized retained-key recovery implemented in source. Carrier remains disconnected and outcome unknown; manual status/receiving never become provider evidence. Migration/runtime verification, provider mapping, response semantics, 11-40 simulation and live connection acceptance remain open. No percentage assigned.

## Last run

2026-09-30. Base `07121a53607f0176cf503deee635cf5ab351622d`. Completed bounded carrier preparation source and static contract/diff inspection only. Existing supplier implementation preserved. Next: Relay source integration, then deferred isolated schema/behavior checks when authorized. No test/build/lint, new PR, main merge, deployment, provider calls or live fixture changes.

# MC11 durable local supplier-delivery preparation

Branch: `codex/mc11-delivery-preparation-20260930`. Parent: `ba08d520fdb0705aaf7e157afe0c65f824801d87` (quoted-fee increment). This is a separate source commit; Relay can cherry-pick it after integrating its parent.

## Requirement and bounded acceptance

Original matrix 11-39, D-072 and `docs/development/meta-clinic-build-and-acceptance.md:235-241` require integration preparation and durable attempt identity separate from manual domain events. This increment implements the local supplier-order preparation portion. It does not implement carrier requests, vendor mapping, transport, vendor responses or external acceptance.

An authorized operator reviews an existing approved supplier purchase order and saves a local preparation. The server records an immutable attempt UUID, correlation UUID, preparation time, actor, normalized retry key, order version, source digest, reason and exact source snapshot. The snapshot preserves supplier/destination, lines, package/merchandise prices, order totals and quoted-fee provenance. It never recalculates fees or changes purchase-order state.

The only supported record state is `prepared`, connection `disconnected`, external delivery outcome `unknown`, source `local_preparation`. A local HTTP acknowledgement means the local record was saved; it is not a supplier acknowledgement. There is no sending action, job, adapter or automatic credential/backlog replay.

Acceptance contract:

- Permission and active inventory configuration are checked before every create/replay; practice/actor locks reuse existing Access authorization. History requires procurement.read and inventory access. Composite foreign keys bind order and actor to practice.
- Preparation is allowed only for approved orders with supplier and lines. The server compares the operator-reviewed order version and exact source digest under the order lock.
- Same-key/same-intent retries return the original record, even after later domain events; changed intent conflicts. One preparation per order version plus row/advisory locks prevents a new key from duplicating preparation after a lost response or reload.
- The record is read-only in the model and append-only under a PostgreSQL trigger, including bulk update/delete paths. Existing manual sent/receipt events retain separate meaning and do not turn unknown external delivery into acceptance.
- History is read back from persistence after reload. A retained uncertain key can be reconciled independently of the newest 25 displayed records. Older records remain stored; truncation is explicit.
- The browser freezes the body/key, locks other order actions, warns before leaving, and preserves the request through failed/denied retries. Read responses are fenced by component generation and sequence; panel identity is keyed by actor/practice/order.
- A stale/rejected request may be cleared explicitly for current-source review only after a successful authorized history read finds no record for its key. A late prior commit still cannot create duplicate version records. This clears local request context, never an existing server attempt.
- Frozen history displays its own quoted-fee evidence and flags changed source as historical. Unknown external outcome remains explicit after successful local save or reconciliation.

## Owned paths

- `apps/api/db/migrate/20260930220011_create_inventory_delivery_preparations.rb`: additive table, complete local-state/digest/key checks, practice/order/actor foreign keys, unique identity/version and immutable trigger. Forward-only; no history rewrite.
- `apps/api/app/models/clinic/inventory/delivery_preparation.rb`: tenant-owned immutable preparation record.
- `apps/api/app/services/clinic/inventory/prepare_order_delivery.rb`: authorization, stable snapshot/digest, locked stale-source checks, exact replay and explicit audit event.
- `apps/api/app/controllers/clinic/inventory/delivery_preparations_controller.rb` and additive routes: authorized preparation/history/recovery endpoints, no external sending.
- `apps/web/src/features/inventory/OrderDeliveryPreparation.tsx`: existing MUI Stack/Alert/Button/TextField/Typography, frozen local request, explicit reconciliation and history evidence.
- `apps/web/src/features/inventory/InventoryApp.tsx`: mounting seam, combined reconciliation blockers and native disabled fieldset around the existing financial reconciliation controls while preparation is unresolved. The fieldset is a narrow browser-semantic form-group guard, not a reusable custom UI primitive. Other unrelated pre-existing formatting remains intact.
- `apps/api/test/integration/inventory_delivery_preparations_test.rb` and `apps/web/test/order-delivery-preparation.test.ts`: synthetic regression source authored before the test-stop direction.

## Obtained evidence and latest test-stop instruction

Before the parent's test-stop message arrived, the final owned command completed: **3 frontend files / 10 tests passed**, comprising six mounted Chromium preparation scenarios plus the existing quote workflow and three fee helpers. Those scenarios cover saved history across reload, after-commit lost response reconciliation, loss → denied retry → exact successful retry, read-only/denied history, stale request explicit review after confirmed history, and frozen historical fee evidence. Controlled HTTP does not prove backend persistence or vendor acceptance.

The same completed command ran the production build and TypeScript successfully. No subsequent test/build/lint/review queue was started. These prior results are preserved as evidence only; they do not independently earn Build credit. Release verification is deferred and not claimed passed.

Ruby is absent (`ruby --version`: command not found). Rails tests, migration execution, upgrade/constraints/concurrency verification and generated `db/structure.sql` review have not run here. Structure was not fabricated, and no infrastructure workaround was attempted.

## Portable backend commands for Sage when verification resumes

From `apps/api`, use the existing local PostgreSQL service and first confirm the explicit synthetic scratch name is unused. These are deferred commands, not execution claims:

```sh
python ../../bin/agent-resources run -- ruby bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc11_preparation_20260930 SKIP_TEST_DATABASE=1 SCHEMA=tmp/mc11-preparation-structure.sql bin/rails db:create db:migrate db:structure:dump
python ../../bin/agent-resources run -- ruby bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc11_preparation_20260930 SKIP_TEST_DATABASE=1 SCHEMA=tmp/mc11-preparation-structure.sql bin/rails test test/integration/inventory_delivery_preparations_test.rb test/integration/clinic_supplier_pricing_test.rb test/integration/inventory_purchase_cart_test.rb test/services/clinic/inventory/purchase_cart_checkout_offer_selection_test.rb
python ../../bin/agent-resources run -- ruby bin/postgres exec bin/verify-backend
python ../../bin/agent-resources run -- ruby bin/postgres exec bin/verify-postgres
```

Review generated structure, changed Ruby source and migration upgrade/no-op behavior before release. Stop on migration, identity, permission, stale-source or constraint defects; retain failure evidence. Concurrent same-key and different-key/same-version probes remain an explicit backend gate. Do not reset shared databases or delete existing history. Verification harnesses manage only their own generated scratch databases.

## Remaining source and external gates

Carrier-specific local preparation and independently tagged supplier/carrier response evidence are not implemented by this bounded increment. Selected provider mapping, response/reconciliation semantics and any real sending remain undefined/external. The record is a prepared local request, not a transport attempt that reached a vendor. No simulator was added for score, no real supplier/carrier/payment operation ran, and no patient/provider data or credentials were used. No score, PR, main merge or deployment changes.

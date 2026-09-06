# Inventory M2b: delivery reconciliation

Date: 2026-09-05. Base: `f97a2a94669430be71775a6cf53cdfaf716e1b2d`.
Branch: `codex/sc-253/inventory-program`, worktree `C:/Users/joshr/Desktop/Work/APPly-inventory-program`.
Scope, review status and final commit: [sc-264](https://app.shortcut.com/apply-1/story/264).

This dated evidence record continues [M2a](2026-09-05-inventory-program-m2a.md) and the [ordered program audit](2026-09-05-inventory-program-audit.md). It is not a live task register. The [continuation checkpoint](2026-09-05-inventory-program-continuation.md) identifies the remaining broad verification gates and subsequent execution order.

## Objective and acceptance

Reconcile accepted, missing and rejected packages against an immutable delivered allocation. Record excess packages refused separately. Only accepted packages enter inventory; missing/rejected quantities remain outstanding on the PO and become available for a replacement delivery. A zero-accepted inspection must preserve evidence without creating a receipt, lot, batch or stock movement. Duplicate, concurrent, cross-practice, unauthorized, malformed and contradictory actions must not alter stock twice or leave partial evidence.

The bounded disposition is **refused at receiving**: rejected/excess goods are not put into local inventory. Existing recall quarantine remains available for accepted recalled goods through its existing permission and hold mechanism. This does not transmit a supplier return, create a credit, determine clinical suitability or infer a temperature policy.

## Confirmed gaps and exact change points

- `apps/api/app/controllers/clinic/inventory/management_controller.rb`, `create_shipment`: authorization and remaining-quantity checks existed, but no order/line lock or reservation of other open deliveries prevented concurrent over-allocation. The operation now uses `Access.with`, locks order then line, and subtracts open, unreconciled shipment allocations. Reconciled missing/rejected quantities can be delivered again.
- The same controller's `create_receipt` and `apps/api/app/services/clinic/inventory/receiving.rb#validate_shipment!` required a full exact shipment receipt. They now allow an explicit balanced discrepancy while retaining the exact-full default. Zero acceptance does not require invented lot, expiry or destination values. Whole decimal strings such as `2.0`, already used in the API projections, are accepted as whole package counts.
- `apps/api/app/models/clinic/inventory/shipment_reconciliation.rb` and migration `20260905010100_add_shipment_reconciliations.rb` add one append-only reconciliation per shipment, actor/profile/practice linkage, a receipt only when accepted packages are positive, bounded whole counts, classification/reason and bounded observations. SQL authorizes receiving, verifies shipment/receipt allocation, checks accepted counts against actual postings at commit and prevents later receipt insertion for a reconciled shipment. Shipment and allocation history now also have SQL update/delete guards, extending their existing model-level append-only behavior.
- `apps/api/app/models/clinic/inventory/shipment.rb` derives discrepancy status from that evidence. `apps/api/app/services/clinic/inventory/inventory_wire.rb` eager-loads and projects the recorded reconciliation; `apps/web/src/features/inventory/inventoryContracts.ts` describes its optional, backward-compatible wire field.
- `apps/web/src/features/inventory/InventoryApp.tsx#ReceivingScreen` uses existing MUI TextField, MenuItem and Alert primitives for counts, classification, balance feedback and recorded evidence. The explicit confirmation names accepted/missing/rejected/excess quantities and their stock/PO consequences. A reconciled delivery cannot be submitted again. Its displayed lot, expiry, temperature and reason come from recorded inspection evidence, including an absent lot on a zero-accepted delivery, rather than catalog defaults. Existing supplier package conversion from M2a is retained. MUI MCP docs were unavailable; installed v9.4.0 types and the [official TextField documentation](https://mui.com/material-ui/react-text-field/) informed the existing component APIs.
- `bin/verify-web` previously loaded a stale schema and marked every migration applied without running it. Its named-account fixture failed in unchanged `Development::InventoryScenario.populate!` at line 21. The verifier now initializes its generated empty scratch database through actual migrations, with the generated schema confined to an ignored task file. It never migrates an existing application database.

## Files changed

1. `apps/api/app/controllers/clinic/inventory/management_controller.rb`
2. `apps/api/app/models/clinic/inventory/shipment.rb`
3. `apps/api/app/models/clinic/inventory/shipment_reconciliation.rb`
4. `apps/api/app/services/clinic/inventory/receiving.rb`
5. `apps/api/app/services/clinic/inventory/inventory_wire.rb`
6. `apps/api/db/migrate/20260905010100_add_shipment_reconciliations.rb`
7. `apps/api/db/structure.sql` — only this migration's generated reconciliation objects and version row
8. `apps/api/test/services/clinic/inventory/receiving_test.rb`
9. `apps/api/test/verification/inventory_purchase_cart_races.rb`
10. `apps/web/src/features/inventory/InventoryApp.tsx`
11. `apps/web/src/features/inventory/inventoryContracts.ts`
12. `apps/web/test/inventory.test.tsx`
13. `bin/verify-web`
14. This dated result record and the continuation checkpoint

## Verification

- Receiving tests: **15 tests, 116 assertions**, no failures/errors, seed 29891. Includes short, all-rejected, damaged/excess, invalid counts, unauthorized zero-stock action, rollback after lot failure, immutable SQL history, refusal of subsequent receipts and deferred receipt-count proof.
- Existing runtime verifier: **7 groups passed**, including independent connections, simultaneous delivery allocation, live session/CSRF, checkout, supplier-unit receipt/replay, zero-stock shortage/replay, replacement delivery, partial damaged/excess rejection, exact stock/PO totals and wire evidence.
- `bin/verify-backend`: all 6 groups passed. `bin/verify-postgres`: all 4 groups passed (upgrade, concurrency, populated restore, fresh initialization).
- Web: **16 files / 177 tests passed**, including rendered receiving totals, discrepancy controls and saved reconciliation. Actual Vite proxy on 3125 to Rails on 3126 passed named fixture login, bootstrap, partial receipt and replay: two 7.25 mL packages posted 14.5 mL and left one package missing. No fixture data was hardcoded into the application UI.
- `npm run build` remains blocked by exactly the same **28 patient-portal TypeScript diagnostics** reproduced from the committed baseline; this slice adds no type errors. Direct Vite bundle passed, with the existing large-chunk advisory.
- Scoped RuboCop: seven changed Ruby files clean. InventoryWire has two unchanged baseline style offenses, verified against HEAD. `npm run format:check` reports 78 files, matching the broad baseline formatting debt; unrelated files were preserved.
- Zeitwerk passed. Brakeman: 0 errors / 0 warnings. Bundler and npm audits: 0 vulnerabilities. Agent harness verification passed (30 documents, 7 skills, 9 commands).
- Live in-app browser at 1051 × 899: named fixture login, saved shortage totals, keyboard shipment selection, unbalanced-count warning/disabled submission, damage classification, explicit zero-accepted confirmation, successful posting, reload and persisted evidence all verified. A read-only database check confirmed the browser rejection created no receipt, kept stock at 14.5 mL and left one package outstanding. An initial browser timeout was recovered through the in-app browser entry point. A separate tablet/narrow viewport was not verified.
- Final root `bin/verify-web`: scratch migrations pass, then named development fixtures fail with `ArgumentError: Your account does not have permission for this inventory action.` The unchanged path is `Development::TestAccounts.prepare!` line 68 → `TestClinic.create!`, whose opening inventory adjustment uses existing authorization. Its raw diagnostics were suppressed and only error class/static source paths inspected. The broad session/portal gate therefore remains unresolved; the isolated inventory proxy/browser checks above passed. No overlapping subscription fixture code was edited.

The full Rails suite was not run. Detailed local logs and full generated schema comparison are retained under ignored `apps/api/tmp/m2b-*`. Browser helper processes on 3125/3126 were stopped after verifying their captured process identities. Only task-owned databases and generated verifier scratch databases were used. No subscription checkout, shared application database, dependency, patient linkage, supplier integration, billing implementation, push or deployment was changed.

## Remaining risks and recovery

- The broad web verifier remains blocked in existing named-account fixture setup; the complete web build has the separate patient-portal errors. Resolve or coordinate those checks before starting M3; do not absorb overlapping subscription or portal work into inventory commits. Desktop browser interaction passed; a separate narrow viewport remains unverified.
- The broader discrepancy/expiration assignment and resolution queue remains M7. This milestone records a final inspection/refusal with immutable evidence, not a mutable case or supplier return workflow. The existing receiving form still handles one selected lot at a time.
- Temperature and expiry suitability remain operator decisions; no thresholds or clinical rules were invented. Existing recall quarantine guards remain authoritative.
- Unrelated schema-snapshot drift is preserved rather than silently merged. Use actual forward migrations for fresh setup; do not mark unapplied migrations complete after loading a snapshot.
- Existing successful receipts and reconciliations cannot be rewritten. Missing/rejected quantities are recovered through a new delivery against remaining PO quantities. Migration rollback intentionally refuses deletion of inspection history; changes require reviewed forward migration or isolated backup/restore.

The exact commit and remaining review gates are recorded in sc-264 alongside this evidence.

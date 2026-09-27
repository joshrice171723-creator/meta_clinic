# MC-14/15 current-record visibility — 2026-09-27

## Implemented source slices

1. **MC-14 invoice balance:** each selected-day invoice row carries its current outstanding balance using the billing dashboard's existing balance expression. The report definition advances to revision 3. This is a query-time balance, not the balance at day end.
2. **MC-14 stock lineage:** each bounded inventory entry row carries the owning office item or pharmacy batch ID. The report definition advances to revision 3. It remains a movement report, not stock on hand.
3. **MC-15 active collection recovery:** pending and processing collection intents have a separate count and bounded exact-invoice list. The owning billing view rechecks the current intent before further collection.
4. **MC-15 current prescription outcome:** the latest attempt on each current medication-request revision is grouped by recorded simulator outcome, excluding superseded revisions from this view.
5. **MC-15 current prescription record:** up to 25 current-revision attempts link to the owning encounter and exact attempt. The existing unknown-outcome worklist remains separate so it is not displaced by accepted outcomes.

All query reads remain practice-scoped behind the existing billing, inventory or clinical-record permission gate. The browser continues through the owning workspace for exact-record authorization. No mutation, retry, vendor call or production access was added.

## Evidence and remaining proof

Five changed Ruby files passed syntax and RuboCop. Rails eager loading, web TypeScript and changed-file Prettier passed. Vault link verification and diff whitespace checks passed; vault audit reported existing size and lifecycle advisories. In the checkout-owned local browser, a setup-complete synthetic clinic's Operations page displayed one current accepted request-revision attempt with its exact encounter link. On the selected 2026-09-26 clinic date, invoice 5862 displayed a current USD 0.0 balance and five pharmacy entries displayed batch IDs; the report returned zero in-flight collections. This proves rendering and source response for those populated and empty examples, not reconciliation of a nonzero balance or pending/processing state. Denied-role browser paths, reload and exact-record focus, CSV content, nonzero invoice balances, pending/processing and unknown-outcome branches, external processor/pharmacy response, and broader acceptance remain open. Tests were not added or run under the current repository instruction.

# MC-14/15 Operations source-record recovery — 2026-09-27

## Implemented source slices

1. **MC-14 invoice:** a daily invoice row opens its patient ledger with that invoice selected and its details expanded. A missing or inaccessible invoice is disclosed rather than replaced silently by another invoice.
2. **MC-14 payment:** a daily payment row opens its patient ledger and focuses the exact recorded payment. The ledger reports when that payment is unavailable.
3. **MC-14 refund:** a daily refund row opens its linked payment and focuses the exact refund entry, including its recorded reason. The ledger reports when the refund is unavailable.
4. **MC-15 collection recovery:** an Operations reconciliation row opens its patient invoice with the collection-intent ID. The invoice's current active intent and state are compared with the linked ID; changed state is disclosed before another collection.
5. **MC-15 prescription recovery:** an Operations unknown-attempt row opens the owning encounter and reads the exact attempt through the existing site-authorized request-history endpoint. The view checks encounter ownership, displays the attempt's recorded outcome, and selects its revision when that revision remains current. Older revisions still have read-only attempt evidence.

The existing report queries retain practice and permission scoping. The patient billing ledger and prescription history endpoint reauthorize their own reads. No mutation or automatic retry is introduced. These are source changes, not browser acceptance or evidence of external payment or prescription transmission.

## Checks and remaining proof

Ruby syntax and changed-file RuboCop passed for the changed API files. Rails eager loading, web TypeScript, changed-file Prettier, vault link verification, vault audit and diff whitespace checks passed. The vault audit reported existing size/lifecycle advisories. No tests were added or run under the current repository instruction. A populated authorized/denied/reload/download walkthrough, actual cross-record reconciliation, browser focus behavior, and exact external-provider responses remain open. Tracker percentages are unchanged.

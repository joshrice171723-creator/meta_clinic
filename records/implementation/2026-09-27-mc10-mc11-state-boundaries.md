# MC-10/11 local state-boundary checkpoint — 2026-09-27

This checkpoint advances five independently reviewable source boundaries across two tracker rows. It uses the existing local prescription simulator and procurement records; no pharmacy, supplier, or carrier connection was exercised.

| Tracker | Source slice | Owner and limit |
| --- | --- | --- |
| MC-10 | Block direct simulated prescription outcomes through the generic event route. | `PrescriptionWorkflow.record` reserves those outcomes for `PrescriptionTransmissionWorkflow.submit`; manual review and linked reconciliation remain available. |
| MC-10 | Bind every persisted transmission attempt to a same-revision simulated event with the same outcome. | `PrescriptionTransmissionAttempt` validation; no new response schema or vendor assertion. |
| MC-10 | Require an actual recorded attempt before reconciling a simulated outcome. | `PrescriptionWorkflow.record` rejects an unlinked prior event; unresolved records remain visible for investigation. |
| MC-11 | Require a named supplier before an order can enter `sent`. | `PurchaseOrder.transition!`; a supplier-free draft remains possible. |
| MC-11 | Prevent manual `complete` while any ordered packages remain or the order has no lines. | `PurchaseOrder.transition!`; existing receipt posting still owns quantity changes and automatic completion. |

Source review traced the event controller to the prescription workflow and the inventory management controller to the order transition. The exact changed files were inspected. Ruby syntax passed for four changed files; scoped RuboCop found no offenses; Rails eager loading passed; vault verification passed; vault audit returned advisory size/metadata findings; `git diff --check` passed. No tests were added or run per repository instruction. No changed-journey browser walkthrough was completed; direct-route denial, simulator submission/reconciliation, supplier selection, sent-order completion, reload, and concurrent recovery remain unverified in a running UI. The existing MC-10/11 percentages and external/human gates are unchanged.

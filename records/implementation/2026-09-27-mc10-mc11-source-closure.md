# MC-10/11 source closure follow-up — 2026-09-27

Four independently reviewable local safeguards advance two tracker milestones without a vendor connection:

| Tracker | Source change | Scope |
| --- | --- | --- |
| MC-10 | Prescription reconciliation must retain the prior event's evidence source. | Prevents a manual outcome from being relabeled as a simulator outcome, and the reverse. |
| MC-10 | A simulated attempt must pair with its initial same-key simulator event. | The existing model check now rejects a reconciliation event or unrelated retry identity as an attempt's source event. |
| MC-11 | An order needs a line before submission. | Prevents an empty procurement request from advancing to review or sending. |
| MC-11 | An order with unresolved shipments cannot close. | A receipt or shipment discrepancy reconciliation must exist before manual completion or cancellation. |

The previous [state-boundary checkpoint](2026-09-27-mc10-mc11-state-boundaries.md) remains separate. These safeguards leave MC-10 response/RxFill and MC-11 supplier/carrier workflow work open. The hourly target of five substantive slices is short by one; no placeholder change was added to fill it.

Scoped checks: Ruby syntax passed for three changed files; changed-file RuboCop found no offenses; Rails Zeitwerk eager loading passed; vault verification passed; vault audit reported advisory size and metadata findings; `git diff --check` passed. Source review traced the prescription event controller through reconciliation and attempt creation, and the inventory management controller through order transition, shipment creation and receiving. No tests were added or run under the repository's explicit testing preference. No browser mutation walkthrough was completed, so permission, reload, cancellation, receiving and recovery behavior remain unverified; external acceptance is separate.

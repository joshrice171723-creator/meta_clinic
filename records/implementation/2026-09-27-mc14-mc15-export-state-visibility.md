# MC-14 / MC-15 export and state visibility source checkpoint — 2026-09-27

This run changes only the existing Operations presentation of clinic-owned, permission-gated report responses. It uses no new endpoint, local fixture, external provider, or clinical rule.

| Tracker slice | Implemented source outcome | Remaining proof |
| --- | --- | --- |
| MC-14 invoice export | The loaded daily invoice report can be downloaded as CSV with source, definition revision, clinic date, timezone, as-of time, counts by currency/state and the posted-line total on the posted-state row. | Confirm populated browser download, spreadsheet import, permission denial and ledger reconciliation. The total is not cash collected or outstanding balance. |
| MC-14 stock export | The loaded daily movement report can be downloaded as CSV with source/date provenance and unit-separated kind, count and signed quantity. | Confirm browser download and reconcile to the movement ledger. These are movements, not stock-on-hand balances. |
| MC-14 export safety | The shared Operations CSV download prefixes text that begins like a spreadsheet formula; signed numeric quantities remain numeric. Existing visit and payment CSV use the same guard. | Open a downloaded CSV in target spreadsheet software. This is source review and formatting evidence only. |
| MC-15 collection states | Operations displays every current collection-intent state count supplied by the billing-authorized report, including failure and cancellation states hidden by the former compact summary. | Confirm populated reload, denied role and exact invoice recovery. Counts do not prove processor settlement. |
| MC-15 prescription outcomes | Operations displays reported outcome counts for all historical local attempts and the latest attempt per request revision, alongside the existing latest-per-revision unknown count. | Confirm populated reload and denied role. Revisions may be superseded; these counts do not locate current unresolved medication requests. |

TypeScript and changed-file Prettier passed. No tests were added or run under the repository instruction. A local browser sign-in to the Weight Loss Clinic's Main location and Local Clinic Workspace's Main clinic redirected to Clinic Setup because each lacked a saved location specialty; the Operations page was not reached. No populated download, role denial, external payment/prescription, clinical, operational or release acceptance is claimed.

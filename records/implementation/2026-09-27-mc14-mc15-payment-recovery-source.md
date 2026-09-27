# MC-14 / MC-15 payment and recovery source checkpoint — 2026-09-27

This run extends the existing Operations reports and integration inventory with five bounded, independently reviewable outcomes. All data comes from clinic-owned records and is scoped to the signed-in practice. No external payment, prescription transmission, patient record, or hosted environment was used.

| Tracker slice | Source outcome | Limit and next proof |
| --- | --- | --- |
| MC-14 recorded payments | A clinic-local date report groups recorded payment events by currency, count, and exact decimal amount behind billing read access. Operations links back to Billing. | A recorded payment is not an invoice allocation, drawer cash total, or processor settlement. Populated reload and denied-role proof remain. |
| MC-14 recorded refunds | The same date report independently groups refund events by currency, count, and exact decimal amount. Refunds may refer to payments recorded on an earlier date. | No net-cash, drawer, or processor reconciliation is inferred. Populated reload and denied-role proof remain. |
| MC-14 payment activity export | Operations downloads the loaded payment/refund report as CSV with source, definition revision, clinic date, timezone, and as-of metadata. | Download and spreadsheet import were not exercised in a browser. Retention and legal-hold policy remain human decisions. |
| MC-15 collection state | A billing-authorized, practice-scoped projection counts current online collection-intent states, including pending, processing, and needs-reconciliation. Operations links to Billing. | Counts do not prove a successful charge or identify the exact invoice needing recovery. Browser role denial and record-level recovery remain. |
| MC-15 prescription outcome | The clinical-records-authorized local attempt projection now distinguishes historical unknown attempts from the latest recorded attempt for each medication-request revision. | An older revision may be superseded; the count is not an unresolved patient worklist. Browser role denial and request-level recovery remain. |

No tests were added or run under the repository's testing instruction. Source checks and Git outcome are recorded in the automation handoff; runtime, browser, external, professional, and release acceptance stay open.

# 2026-09-27 - MC-14 daily cash drawer report

Source scope: added a clinic-local opening-date report for drawer sessions with 25-row pagination, full-cohort open/awaiting-reconciliation/variance counts, source metadata and a billing-workspace link. Each row reuses the existing cash drawer projection for float, received/refunded/current expected cash and saved count/discrepancy. Expected-at-close is reconstructed only from the saved counted_cash minus saved discrepancy; it is distinct from current expected cash. No monetary total combines sessions.

Permission matches the owning drawer workspace: payment-record, legacy billing-write or cash-reconcile capability. A billing-read-only role is not enough. Query and date bounds are practice-scoped. Financial values remain decimal strings; no monetary mutation occurs. Discrepancy and reconciliation free-text notes are excluded from this report.

Currency boundary: drawer sessions have no explicit currency field. The report lists currencies evidenced by their linked payment events and withholds the UI monetary comparison for mixed-currency sessions. No payment currency is silently assigned to the float, and the report explicitly discloses the missing denomination. Adding an explicit drawer currency and preventing mixed-currency tender remains a separate source gap.

Checks: TypeScript, one-file Prettier, four-file RuboCop and scoped diff review passed. A read-only Rails runner query against existing local synthetic drawer data returned one session, zero open sessions and zero sessions awaiting reconciliation. The first runner file-write used a duplicated working-directory prefix; corrected once, then succeeded. No tests or browser acceptance ran. Page-two, denial and mixed-currency behavior remain source-reviewed only.

Tracker/atlas status and build estimate remain deferred to the next hourly checkpoint. This is an opening-date cohort of current drawer state, not daily cash flow, bank settlement or a historical end-of-day cash snapshot.

# Atlas day-end review checkpoint — 2026-09-28

The 0.1.8 source and hosted demo are at `e5484889bdecc0b58bc239abe8624a299a20951a`. This 0.1.9 development-branch slice has **not** been published. Its source adds two connected operations behaviors:

- The permission-gated daily cash report now pages unresolved drawers opened before the selected practice date, with exact links back to Billing. Its report definition is revision 3. A prior-day drawer no longer disappears from the action list solely because it was opened on another date.
- A staff member with billing-read and cash-reconciliation authority, or the existing billing-write legacy grant, can save an attributed review note for a selected practice date. The server captures invoice, payment/refund and drawer summaries, their separate `as_of` values and report definitions in an append-only review record. An exact request-key retry returns the same record; reuse with a different date or note conflicts. The UI retains the key after an uncertain save response.

The checkpoint is a record of **review**, not a balanced ledger, settled payment, immutable source ledger, clinic-selected policy or completed retention plan. Invoice cohorts use invoice creation dates and current balances; payment/refund reports use event creation dates; drawer sessions use opening dates, with earlier unresolved drawers shown separately. Site-local visit states remain a separate report and are not captured in the practice-wide financial checkpoint. Later source changes can justify another review; the saved record retains the values seen at its capture times.

**Source checks:** Ruby syntax for the new controller, service and migration passed; scoped RuboCop passed 8 files; Rails eager loading and route enumeration passed; the isolated synthetic `apply_atlas_019_dev` migration is up; TypeScript passed. Vite emitted a completed production bundle, but the heavy-command wrapper exited 1 afterward while updating its shared metadata (`PermissionError`), so the overall queued build command is not recorded as a clean pass. The first `db:prepare` applied the migration in the isolated database but errored when opening `db/structure.sql` on Windows. The nine new schema blocks were copied from that PostgreSQL 18.6 dump into the previous canonical structure, avoiding unrelated dump-format churn. No tests or browser save/reload/denial walkthrough ran.

**Build estimate:** MC-08 91→92 for carried drawer recovery; MC-14 58→66 for a server-captured, attributed, replay-safe review record and linked source recovery; MC-15 55→57 for the Operations checkpoint and history. These 11 row points move the equal-weight MC-01–15 Build estimate 72.1→72.8%. Validation and External / human scores stay unchanged. The 74% QA consolidation and 75% publication gate are still ahead.

## Date-switch retry repair

The review form now keeps an unconfirmed save attempt bound to its original clinic date when the report date changes. It asks the reviewer to return to that date for exact-key retry instead of sending the saved key with another date. This is source-checked only; no connected browser retry was exercised. Build scoring is unchanged.

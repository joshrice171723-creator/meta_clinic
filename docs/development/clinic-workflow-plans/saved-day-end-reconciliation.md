# Saved day-end source reconciliation

## Assignment and authority

Nova owns the bounded MC14 product increment explicitly assigned by dot on 2026-09-30: the founder's open saved end-of-day reconciliation outcome. Implement source and synthetic regressions on a dedicated branch; Relay alone integrates. No new PR, merge, deployment, credentials, provider transaction, live fixture or score edit is authorized. This is a staff comparison of identified records, not payment settlement, financial certification or a second cash-drawer reconciliation.

## Current sources and decisions

- [Canonical tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md), founder outcome 12: reconcile drawer, invoices and visits; saved reconciliation remains open.
- [Prior day-end review evidence](../../../records/implementation/2026-09-28-atlas-day-end-review.md): existing append-only-by-API summary checkpoint captures actor, note and invoice/payment/drawer aggregates, without source record IDs or visits.
- Existing `RecordDayEndReview`, `DayEndReview`, `DayEndReviewsController` and daily report queries were traced at combined source `10707c6163ad43b5cdbb59f6f1c9e0225cd2901c`. That fetched candidate did not extend the summary capture. Existing Billing `/cash_drawers/:id/reconcile` remains the sole drawer reconciliation write.
- [Non-vendor hardening plan](../non-vendor-clinic-hardening-plan.md), reporting ownership: identify comparison sources; do not rewrite source records to match a report.
- Standards applicability: reviewed the repository [standards procedure](../healthcare-standards.md) and existing reporting contracts. This internal operational comparison adds no clinical fields, exchange mapping, treatment rule, coding system or new regulatory/export policy. No new FHIR/U.S. clinical implementation guide requirement applies; this is a founder-directed product outcome, not standards conformance or accounting/legal acceptance.

## Connected journey

Authorized staff selects the report date and site in Operations. A protected preview shows practice-date financial cohorts, selected-site-local-date visits, exact source IDs and captured values, separate currency totals and source capture times. Staff expands source groups, follows existing Billing links where supported, then chooses an observed comparison outcome and explains evidence or follow-up. Save recaptures sources and checks the displayed source digest. A changed source rejects the save and refreshes comparison. A matching save preserves the source values, outcome, actor and note in the existing day-end record. Reload shows the attributed receipt and expandable historical source values. Links open current records; historical captured values do not change.

Uncertain save keeps its exact payload and request key in the mounted form. Editing and refresh are disabled; changing report context cannot send the original attempt as a different date/site. Returning to its original context permits explicit same-request retry. A late success cannot announce completion in a different context. A full page reload loses the in-memory attempt; inspect existing saved history before starting another comparison. No ledger mutation occurs even if another comparison is later recorded.

## Fields and action rules

| Field/action | Origin and rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date/site    | Existing report selector; Rails resolves the site through current practice and enforces `appointments.read` at that site. Financial dates use practice timezone; visits use site timezone. Different cohorts are not equated. Future dates cannot save.                                                                                                                                                                                                                          |
| Preview      | `GET /api/clinic/day_end_reviews/preview?date=YYYY-MM-DD&site_id=ID`; existing billing read plus cash reconcile, or legacy billing write, and site appointment read. No-store.                                                                                                                                                                                                                                                                                                   |
| Sources      | Identified invoices, invoice lines, credits, allocations, payments, refunds, opened drawers, earlier unresolved drawers and selected-site visits. Currency/amounts remain exact strings; no patient names, free clinical content or encrypted correction/credit reasons are copied. Definitions, financial/visit time intervals, current summaries and separate `as_of` times are retained. Capture queries have separate times; no single atomic ledger settlement is asserted. |
| Bounds       | All matching source IDs are captured beyond daily reports' first 25 rows. More than 500 records in any source group fails closed; no truncated reconciliation can save.                                                                                                                                                                                                                                                                                                          |
| Outcome      | Explicit `no_discrepancy_observed` or `follow_up_required`. This records staff observation, not an automatic balanced/settled/closed state. Source records remain unchanged.                                                                                                                                                                                                                                                                                                     |
| Evidence     | Required trimmed note, at most 500 characters. Follow-up outcome is visible in saved history; it does not silently create/resolve clinical or financial tasks.                                                                                                                                                                                                                                                                                                                   |
| Save         | Existing `POST /api/clinic/day_end_reviews`, additive `site_id`, `comparison_outcome`, `source_digest`. Actor/practice remain server derived. An exact replay returns the original receipt after later source changes; changed date/note/site/digest/outcome conflicts. Permissions are rechecked before replay.                                                                                                                                                                 |
| History      | Existing latest-20 practice-date read remains compatible with summary-only checkpoints. New source reconciliation records are omitted when the reader lacks their site's appointment read permission.                                                                                                                                                                                                                                                                            |
| Links        | Existing exact Billing invoice/payment/refund/drawer links. Visit/line/allocation IDs are displayed without inventing unsupported deep links.                                                                                                                                                                                                                                                                                                                                    |

## Ownership and dependency matrix references

Reuses [build/acceptance matrix](../meta-clinic-build-and-acceptance.md) OP-05 and OP-10–12 for owned follow-up, protected action, persistence and recovery. Existing billing ownership and permissions authorize comparison; assignment creates no privilege. Source changes block only this save, oversized sources block only full reconciliation capture, and denied site access hides only its reconciliation. Chart, invoice, drawer and other authorized work remain available. No new policy, export, retention or clinical matrix gate is introduced.

Owned source: one new report query, additive existing day-end service/controller/route changes, one new MUI component and its Operations mount, focused Rails/browser tests and this brief. MC03/07/09/12/15 helper implementations and shared WorkInbox/service paging are untouched. The Operations component is based on the combined candidate already containing MC15 mapping; only an import and mount are changed, preserving its ownership.

## Implementation and acceptance

Implemented on `codex/pilot-saved-day-end-reconciliation`, base `10707c6163ad43b5cdbb59f6f1c9e0225cd2901c`; no schema change. Reuses the existing JSONB day-end record and audited actor projection. Historical summary-only create/replay remains supported.

Actually run with locked dependencies and synthetic intercepted transport only:

- `vitest run test/day-end-reconciliation.test.tsx test/operations-report-date.test.tsx --maxWorkers=1`: **15 passed**, including six new controlled browser cases: source links and save/reload receipt; exact unknown retry and different-date block; source-change rejection/refresh; denied preview; late old-date read; late old-date save receipt. Final duration 21.87 seconds.
- TypeScript `tsc --noEmit`: passed.
- Scoped Prettier for the new component and harness: passed. Unrelated inherited formatting in Operations is preserved.
- Vite production bundle: passed, 1,479 modules, 1.51 seconds.
- Scoped diff whitespace inspection: passed.

Five authored Rails integration cases are **not executed here**: source IDs/attribution/ledger unchanged/exact replay/conflict; changed digest and invalid outcomes; wrong-site/foreign-practice/revoked permissions and history; beyond-page-one and oversized cohorts; legacy review compatibility. Ruby/Bundler are absent; do not provision another runtime. Route to Sage's existing isolated runtime from `apps/api`:

```sh
ruby -S bundle exec rails test test/integration/day_end_reconciliation_test.rb test/integration/clinic_daily_visits_by_state_report_test.rb
ruby -S bundle exec rubocop app/queries/clinic/reports/day_end_reconciliation.rb app/services/clinic/reports/record_day_end_review.rb app/controllers/clinic/reports/day_end_reviews_controller.rb config/routes.rb test/integration/day_end_reconciliation_test.rb
ruby -S bundle exec rails zeitwerk:check
```

No connected Rails-backed browser proof, independent review, external/human acceptance or score increment is claimed. Retention, export authorization and an accounting definition of final balanced closeout remain separate human-owned gaps.

## Checkpoint

Source is ready for independent backend/frontend review and Relay's scoped integration. The unrelated delivery-attention report was paused at local commit `646bc531` on `codex/pilot-estimate-delivery-attention`; 13 focused frontend cases passed there, backend/type/bundle review is incomplete, and it is not part of this increment. Preserve it; do not score or integrate the unfinished checkpoint as saved reconciliation.

Relay/scorer own tracker integration. Proposed owning-row entry: “MC14 saved source reconciliation adds a server-captured, identified financial/selected-site visit manifest, explicit staff comparison outcome, source-change guard and attributed replay-safe receipt using existing day-end records and billing/site permissions. Fifteen synthetic frontend cases, typecheck and bundle passed; five authored Rails cases await existing-runtime verification. No settlement, cash-drawer replacement, export policy, connected acceptance or score change claimed.”

## Last run

2026-09-30 follow-up to Relay's review of `418f9a92`: an already-unconfirmed attempt now stays frozen through a later deterministic denial; a fresh pre-commit denial remains editable. Added loss → 403 → exact retry → owned-success, including blocked different-date retry, plus fresh-403 regression. All eight reconciliation browser cases passed in 19.38 seconds; TypeScript and scoped formatting passed. Backend source is unchanged and its queued verification need not repeat for this frontend repair. Lab provenance work is preserved separately and will resume after this handoff.

2026-09-30. Inspected combined revision `10707c6163ad43b5cdbb59f6f1c9e0225cd2901c`; traced the previously missing identified-source persistence contract and preserved the existing drawer reconciliation. Implemented the scoped source and tests; final frontend checks passed. A transient executor disconnect recovered without duplicate commands or pushes. Tracker and release sources remain separately owned. Next: exact published head and Sage's backend/source review, then Relay integration after approval.

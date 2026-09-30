# Prescription reconciliation worklist pages

## Assignment and authority

2026-09-30: Nova owns MC-10's independently confirmed access gap from the >90 Build sprint checklist at `e33648c278ca8d7c7abe0ad0d662f9560e806894`. Implement/test/publish a product source branch; Relay alone integrates. No new PR, merge, deployment, provider transmission, signing, clinical policy, live fixture or credentials.

Read this brief and canonical references before resuming. Reconcile newer source/direction before editing; preserve existing work and ownership. MC-12 helper owns WorkInbox/follow-up service paging; these paths are untouched. Shared `contracts.ts` changes are confined to the prescription worklist declaration.

## Current sources and decisions

Source base: combined PR66 `8c3d2358073acd14bb135a93a3adb1d7aa9034c8`, including independently approved PR65. The query already applies patient, practice and eligible site authority; it represents original revisions/closed encounters and excludes series with a later non-review resolution. It counts all matches but limits returned attempts to the oldest 50 with no offset. The component discloses truncation but cannot navigate overflow.

The [canonical tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md), [build/acceptance guide](../meta-clinic-build-and-acceptance.md), [PR65 worklist brief](prescription-reconciliation-worklist.md) and [source checklist, priority 4](https://github.com/joshrice171723-creator/meta_clinic/blob/e33648c278ca8d7c7abe0ad0d662f9560e806894/records/progress/2026/09/2026-09-30-tracker-score-reconciliation.md) define the outcome. Counts/pages are derived local state, not clinical reconciliation or provider proof. No clinical/exchange fields or regulatory rule changes; the healthcare reference map does not add prescribing requirements to this navigation slice. No new external guide applies.

## Connected journey

Authorized reader opens Prescription reconciliation, sees first-page count/source/time, navigates later/earlier pages, and follows each unchanged original revision/attempt history link. Page requests reapply the existing authority before totals and rows. Errors hide unconfirmed rows and offer explicit same-page read retry; they cannot assert a clear queue. Actor/practice/site or capability changes suppress old responses and reset to page one. Removing resolved work can shrink the page range; server clamps to the remaining last page. No read navigates or replays a prescribing mutation.

## Fields and action rules

| Field/control    | Rule                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`           | Optional GET parameter, default 1, integer 1–999999. Existing parameter handler returns 400 with `field: page` for invalid input.                                                                        |
| Server page      | Fixed 50 rows, immutable attempt-ID ascending order, offset after the existing authorized/series-resolution query. Requested page clamps to available pages; empty population is page 1 of 1.            |
| Pagination       | Additive `pagination: {page, per_page, total, total_pages}` on existing v1 contract; full matching count retains its original meaning. Existing limit/returned_count/truncated fields remain.            |
| Client ownership | Accept matching actor/practice/site, bounded integer metadata and expected/clamped page only. Key state by context plus page. Missing pagination fails closed, requiring compatible backend integration. |
| Previous/next    | Existing MUI Buttons; disabled at bounds. Refresh/retry repeats the current requested page; no record writes.                                                                                            |
| Empty page       | Only zero authorized total can say queue clear. An empty page with nonzero total asks reader to refresh. Live reconciliation may move offset boundaries; this is not a frozen snapshot.                  |
| History link     | Existing encounter, original revision and attempt IDs preserved; no new medication request or clinical action.                                                                                           |

## Ownership and dependency matrix references

Reuse OP-05 (permission/coverage), OP-06 (disconnected vendor) and OP-10 (stale/retry/outcome unknown) in the existing matrix. No matrix change, new owner, approval or threshold. Local recorded work may be reviewed while external execution is unavailable. Missing read authority blocks this projection, not unrelated permitted care. Reconciliation remains in the existing prescribing owner/history; paging never resolves an attempt.

## Implementation and acceptance

Owning files: prescription-specific Care query/controller, corresponding contract declaration, PrescriptionReconciliationWorklist, existing paired browser/API tests and this brief. No routes, schema, API write paths, shared WorkInbox, follow-up service or dependency changes. Reused MUI Button/Stack/Typography and installed types (no exposed MUI MCP) preserve the existing presentation.

Author regressions cover first/later pages and unchanged links/counts/ledger, authority before pages, invalid inputs, population shrink, both-direction navigation, failed later-page retry, old page/context suppression, malformed/missing metadata, capability restoration and bounds.

Commands from `apps/web`:

```sh
python ../../bin/agent-resources run -- node node_modules/vitest/vitest.mjs run test/prescription-reconciliation-worklist.test.tsx --maxWorkers=1
python ../../bin/agent-resources run -- node node_modules/typescript/bin/tsc --noEmit
python ../../bin/agent-resources run -- node node_modules/vite/bin/vite.js build
```

Backend routing from `apps/api`, existing isolated synthetic runtime only:

```sh
ruby -S bundle exec rails test test/integration/prescription_reconciliation_worklist_test.rb
ruby -S bundle exec rubocop app/queries/clinic/care/prescription_reconciliation_worklist.rb app/controllers/clinic/care/prescription_reconciliation_worklists_controller.rb test/integration/prescription_reconciliation_worklist_test.rb
```

Ruby/Bundler is absent here; no provisioning or backend execution is claimed. The eight Rails cases (six existing, two new with two existing expanded) remain unexecuted by Nova. Controlled Chromium/API fixtures do not establish Rails authorization integration, external pharmacy response or connected clinical acceptance. Independent runtime/review remains separate from built source; tracker/score owner determines any credit.

## Checkpoint

Source implemented. Final **11 controlled Chromium cases passed** (18.64 seconds; six existing plus five new). TypeScript, scoped Prettier, Vite production bundle (1,474 modules; 1.05 seconds) and diff checks passed. The initial 10/11 run exposed stale pagination metadata in an existing empty-result fixture; it was corrected before the final pass. Rails cases/lint remain unexecuted here.

## Last run

2026-09-30; baseline `8c3d2358073acd14bb135a93a3adb1d7aa9034c8`; inspected scorer checklist `e33648c278ca8d7c7abe0ad0d662f9560e806894`. Implemented bounded independent MC-10 source increment; no shared WorkInbox ownership or score change. Next: Relay receives the verified source commit; route Rails tests/lint to existing runtime owner before integration acceptance. Relay/tracker owner links this brief in MC-10 without duplicate credit.

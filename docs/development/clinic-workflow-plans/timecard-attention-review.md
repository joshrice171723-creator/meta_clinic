# Timecard attention review

## Assignment and authority

2026-09-30: Nova's authorized Meta Clinic product lane implements one missing MC-13/MC-14 workforce review workflow from the canonical tracker toward the build target. Source branch only; Relay owns the combined release PR. No new feature PR, deployment, payroll rules, credentials, live fixtures or provider action.

Read this brief and its canonical references before resuming. Compare the baseline and newer user direction before dependent edits; preserve existing branches and source owners.

## Current sources and decisions

Baseline: PR66 `8c3d2358073acd14bb135a93a3adb1d7aa9034c8`. Only PR66 was open at inspection; delivered PR64 estimate comparison and PR65 prescription reconciliation are already included and untouched.

[Canonical tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md), [product strategy](../../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md), [engineering guide](../meta-clinic-build-and-acceptance.md), and [non-vendor hardening plan, slice 9](../non-vendor-clinic-hardening-plan.md) own the scope. Slice 9 explicitly includes workforce approval exceptions. The existing review page lists latest cards and pending correction requests but offers no attention selection. Existing `TimecardsController`/`TimecardSerializer` and adjustments reads own authorization and site-limited data; submit/approve/decide own policy and version checks. No replacement report, endpoint or ledger is introduced.

[Healthcare reference map](../us-healthcare-reference-map.md) explicitly distinguishes workforce payroll/UI from FHIR requirements. No clinical/exchange fields, pay rules or regulatory interpretation change; no external clinical guide is applicable to this presentation-only selection. Requirements here are product decisions and existing server state, not standards-compliance claims.

## Connected journey

Authorized workforce reader opens Timecard review at a location. The attention view groups latest employee/period versions into submitted for approval, recorded exceptions and pending corrections. Submitted is recorded state, not approval eligibility. Correction requests against earlier versions remain listed with the existing decision editor even if no latest card can be matched.

A reviewer can use the existing manager correction/decision actions; an approver uses the existing version-bound approval. Successful actions refresh the selected view, removing cards that no longer match. Loading, denied reads and failed refreshes do not retain another location's actionable attention rows. Explicit refresh recovers reads without replaying writes. Readers lacking review/approve capability see no corresponding actions.

## Fields and action rules

| Field/control | Origin and rule |
| --- | --- |
| Timecard view | Transient MUI select: all latest, submitted, exceptions, pending corrections. Never persisted or sent as authority. |
| Latest version | Highest server `version_number` for `employment_id` + `period_start`, independent of array order; a superseded latest card cannot resurrect an older card. |
| Submitted group | Latest status equals `submitted`; no inference of policy eligibility or manager approval. |
| Exception group | Non-final latest card has recorded `unresolved_exceptions`; null overtime/configuration values do not become invented exceptions. |
| Correction group | Existing submitted adjustment references a card in the employee/period chain. All pending requests stay visible separately, including unmatched sources. Resolved requests are excluded. |
| Failed correction read | Count explicitly unknown; correction filter disabled, authorized card data may remain available. No zero-count assertion. |
| Approval / correction | Existing source IDs, lock version and reasons retained; server rechecks policy/permissions. No new approval shortcut. |
| Refresh / location | Clear old attention rows while loading, abort/ignore stale replies; explicit refresh, no automatic mutation retry. |

## Ownership and dependency matrix references

Reuse OP-05 (privilege/coverage), OP-10 (stale/retry) and OP-12 (unfinished work) in the [existing matrix](../meta-clinic-build-and-acceptance.md). No matrix row or policy change. Missing correction visibility blocks that attention projection, not unrelated authorized timecard reads. Pending requests remain unresolved until the existing authorized decision workflow records a decision. No deadline, pay amount, clinical hold or privilege is inferred.

## Implementation and acceptance

Changed source: `apps/web/src/features/workforce/TimecardReviewPage.tsx` and `timecardAttention.ts`. Existing MUI TextField/MenuItem, Paper, Alert, Typography and Button handle selection/status/recovery. Installed MUI types are the documentation fallback because no MUI MCP is available. No dependency, backend, migration or contract change.

Authored model cases cover input ordering, period/employee separation, superseded/final negatives, historical/unmatched corrections and absent data. Controlled Chromium cases exercise real React/MUI plus existing same-origin transport with entirely synthetic workspace/API fixtures: selections, existing lock-version approval and removal, failed-read recovery, unknown correction coverage, read denial, late previous-location response, and capability-limited reader.

Commands from `apps/web`:

```sh
python ../../bin/agent-resources run -- node node_modules/vitest/vitest.mjs run test/timecard-attention.test.ts test/timecard-attention-browser.test.tsx --maxWorkers=1
python ../../bin/agent-resources run -- node node_modules/typescript/bin/tsc --noEmit
python ../../bin/agent-resources run -- node node_modules/vite/bin/vite.js build
```

These browser fixtures are not Rails integration or live clinic acceptance. Existing backend guards remain unchanged; connected authorized/denied API execution and independent review remain necessary. Ruby is absent here; no provisioning or backend execution is claimed. If backend verification is requested, route unchanged `test/integration/workforce_access_test.rb` and `test/integration/workforce_payroll_journey_test.rb` through the existing isolated runtime owner.

## Checkpoint

Source implemented. Final focused run passed **11 tests**: four model cases and seven controlled Chromium cases (14.05 seconds). TypeScript passed on that source/test snapshot. Final scoped Prettier passed and the Vite production bundle passed (1,475 modules; 2.13 seconds). Diff whitespace checks passed. The unknown-correction case also verifies that a failed selected correction view does not assert an empty queue. Initial browser fixture wiring failed to replace the workspace context and was corrected in the test harness; it was not a production authorization defect.

## Last run

2026-09-30; inspected PR66 `8c3d2358073acd14bb135a93a3adb1d7aa9034c8`. Implemented bounded timecard attention selection and authored regressions. Tracker linked without percentage changes. Next: publish the verified source commit for Relay, then independent review and connected acceptance.

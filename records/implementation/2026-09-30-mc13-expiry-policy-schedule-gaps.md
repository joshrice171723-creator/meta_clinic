# MC-13 expiry, explicit policy gaps and schedule variance

Source branch: `codex/mc13-policy-gaps-20260930`, based on immutable integrated cutoff `c16468388eeaed39acbbb2184049fd4c72ff2462`. Authorized local source publishing and synthetic checks; no PR, main merge, deployment, live workforce changes, credentials or score change. MC-14 reports/reconciliation and existing attention pages remain unchanged.

Original scope: [workforce build contract](../../josh_current_work/employee%20workforce/EMPLOYEE_WORKFORCE_BUILD_PLAN.md), lines 45, 48–50, 58 and 119; [audit contract](../../josh_current_work/employee%20workforce/EMPLOYEE_WORKFORCE_AUDIT_PLAN.md), lines 44, 51–53 and 61. Coverage findings are retained independently on documentation commit `d3c8de26580879bcb70abbc5f30cccfd91b50d53`.

## Increments

1. `f3329b16`: expiry is rechecked under the existing request transaction/lock before fresh target acceptance or manager approval. Expiry equality is expired; no default expiry is invented. Decline, cancellation and manager denial retain their existing authorized paths. A committed exact receipt still replays its recorded outcome after expiry without new publication. Two synthetic regressions cover preserved request/publication on rejection, target decline, exact consent replay and manager denial. Rails execution remains pending.
2. Calculator/schema/presentation increment: unconfigured rounding or a configured rounding mode lacking its required increment leaves rounded/paid values null with `rounding_policy_unconfigured`. Null break-pay policy retains the observed break but leaves paid values null with `break_pay_policy_unconfigured`. Unknown paid time also prevents guessed later overtime categorization. Explicit `none` rounding and explicit unpaid breaks retain their existing semantics. Raw interval timestamps/minutes, punch references, settings provenance and old immutable cards remain intact. Totals become null when any contributing value is unknown; existing approval/export exception guards remain authoritative.
3. Same calculator increment adds a narrow published-schedule comparison. Recorded work outside the union of published employee shifts gets `off_schedule_work`; there is no tolerance, automatic deduction or rejected punch. Draft schedules are ignored. No published schedule is recorded as comparison unavailable, with an informational summary message, not an off-schedule assertion or new mandatory scheduling prerequisite. Latest site/week publication identity joins the calculation digest, including correction sites and adjoining nonmidnight/overnight windows; recalculation creates a successor without editing prior cards. The snapshot retains the compared publication IDs. Seven synthetic calculator cases cover missing rounding, missing increment, null break pay, configuration recovery, publication revision/recalculation, absent publication, another-site correction and nonmidnight boundary (configuration recovery is part of the rounding case).

The forward migration only permits SQL null for derived rounded/paid segment values and rounded card total. Existing nonnegative constraints, raw values, tenant references and immutable triggers remain in place; no existing row is rewritten. Downgrade is explicitly irreversible because replacing unknown values with guessed values is not a safe rollback. Do not use this calculator before applying the migration in the owning synthetic environment.

## Checks and limits

- Passed: locked frontend dependency install without scripts through the shared resource queue; changed frontend formatting; full frontend TypeScript check; focused `test/timecard-policy-state.test.tsx` (2 tests); source/whitespace review.
- Focused frontend checks exercise actual `TimecardSummary`: unknown financial categories remain "Not configured", raw time is visible, policy warning remains, and absent published schedule differs from a recorded variance. They are static rendering checks, not connected Rails/browser acceptance.
- Bounded independent read-only source review caught missing adjustment-site digest input and the nonmidnight ending-window omission; both are repaired and have authored regressions. Expiry replay and null-total propagation were also inspected.
- Ruby/Bundler are unavailable in this execution environment. Nine new Rails cases are authored and unrun. Migration execution, generated `db/structure.sql`, Ruby syntax/lint/eager loading, full focused Rails receipts and schema constraint/immutability checks require the existing authorized Sage runtime. No schema dump is fabricated here.
- The frontend-ui skill's MUI MCP tools were unavailable. Existing MUI Alert composition was retained and checked against [official MUI Alert documentation](https://mui.com/material-ui/react-alert/) (9.4.0, reviewed 2026-09-30); no new UI API or dependency was introduced.

## Sage handoff

Use the final published branch head and an explicitly owned synthetic test database; preserve other workers' runtime/state. Apply the forward migration through the repository's existing `bin/postgres` wrapper, regenerate `db/structure.sql` from that migrated source, and inspect that only the three nullability changes plus the migration version are added. Do not regenerate from a different main/combined source tree or overwrite Nova's schema work.

From `apps/api`, after the owner selects its isolated synthetic target:

```sh
bin/postgres exec env RAILS_ENV=test bin/rails db:migrate
bin/postgres exec env RAILS_ENV=test bin/rails db:structure:dump
bin/postgres exec bin/rails test test/services/clinic/workforce_scheduling_test.rb test/services/clinic/workforce_timecards_test.rb test/services/clinic/workforce_payroll_test.rb
bin/postgres exec env RAILS_ENV=test bin/rails zeitwerk:check
```

Queue these through the existing shared resource runner and use one Rails worker. Review/payroll compatibility checks use the unchanged approval/export guards, not live payroll. Validate unknown minutes persist as null, negatives remain denied, old immutable source rows remain unchanged and unresolved cards cannot approve/export. Return exact-head receipts and the scoped generated schema diff through the coordinator. No main/PR/deploy/scores are authorized by this handoff.

## Precise unselected policy

Early/late grace tolerances, off-schedule blocking, break compensation choice, rounding mode/increment and statutory labor/overtime rates remain clinic/human decisions. This increment records exact known published-schedule variance and unknown configuration; it selects none of those policies. It creates no fallback coverage owner, automatic payroll or live workforce operation. Approval of genuine schedule variances still follows the existing correction/configuration workflow; a new override/acknowledgment policy was not selected.

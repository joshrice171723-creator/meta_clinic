# Workforce development — 2026-10-05

## Session basis

The user authorized five hours of workforce development beginning at approximately 10:33 UTC (05:33 America/Chicago), ending at 15:33 UTC (10:33 America/Chicago). Work uses `codex/workforce-five-hour-20261005` in its own managed worktree, based on the previous workforce branch at `a77a8a7d`. An initial pull confirmed that fetched `origin/main` was already integrated; the remote has no `master`. Unrelated primary-checkout changes and other worktrees were preserved.

The [previous session](2026-10-04-workforce-development.md) describes inherited implementation and evidence. Its 27 batches are not new work from this session. No hosted deployment is authorized by this development pass.

## First implementation batch

- Payroll history now exposes a strictly older-ID cursor and loads additional groups of 50 saved exports. The UI appends history without resetting payroll settings, selected timecards, preview, or an unconfirmed export attempt. Loading errors preserve the cursor for explicit retry. Location changes, session changes, reloads, and unmounts abort the history request. Existing site/practice and payroll authorization remain in force.
- New schedule publication snapshots retain start/end clock-occurrence choices. Swap publication copies those choices; older snapshots recover the matching occurrence from the recorded UTC instant, local time, and timezone through the existing resolver. An unresolvable legacy instant stops the swap rather than changing its meaning.
- Two small runnable regression checks were added for the pagination boundary/authorization and legacy repeated-hour recovery. They have not been executed.

These changes repair operational history and scheduling behavior. They introduce no clinical fields, FHIR exchange, overtime calculation, or jurisdiction-specific employment policy; no healthcare implementation guide is applicable to this bounded repair.

### Evidence at 10:51 UTC

- Locked dependency prewarm passed with unchanged manifests and lockfiles.
- Ruby syntax passed for all five changed Ruby files; scoped RuboCop passed with no offenses.
- The changed frontend file was formatted; scoped diff review and `git diff --check` passed.
- Frontend type/build verification is queued behind shared resource ownership.
- Docker inventory succeeded. An isolated PostgreSQL container/database and loopback ports were reserved for this worktree; managed startup has begun migrating the new database. Connected API/browser acceptance remains pending.

Material UI v9 controls reuse existing components. The [official pagination guidance](https://mui.com/material-ui/react-pagination/) was consulted through the MUI documentation tool. No frontend dependency or shared UI abstraction was introduced.

### Checkpoint at 11:01 UTC

- TypeScript and both Vite bundles passed. The existing marketing static/dynamic import warning remains. The first queued build failed before compilation because Windows could not resolve `pnpm`; invoking it through `cmd /d /c` completed successfully.
- Owned API, web, worker, and isolated PostgreSQL startup passed at `http://127.0.0.1:3240`. Standard synthetic local role accounts were prepared in the new database.
- A database-guarded, ignored local script created 51 synthetic history-only export records. In Chrome as Payroll Operator, the page showed 50 records, loaded the remaining oldest record, removed the load-more control, and retained an unsaved configuration-name draft. The temporary draft was then discarded through the UI.
- Opening the oldest export returned the application's digest-checked download-request notice. The browser download event timed out and no expected file was found in Downloads; an on-disk CSV download is not verified.
- No test suite or added regression test was run. Repeated-hour swap publication and session/location cancellation remain source-reviewed, not browser-accepted.

### Remaining boundaries

Payroll's initial candidate list still caps approved timecards at 250 and configuration history at 25; loading older export files does not remove those separate limits. Actual persisted pagination, downloads, session/location cancellation, and swap publication remain to be checked in the owned runtime. A separate source finding is that approving time off does not modify already-published shifts or warn the employee about an overlap; no automatic reassignment is implied.

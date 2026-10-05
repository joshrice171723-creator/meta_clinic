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

### First-batch remaining boundaries

Payroll's initial candidate list still caps approved timecards at 250 and configuration history at 25; loading older export files does not remove those separate limits. On-disk downloads, session/location cancellation, and swap publication remain to be checked in the owned runtime. The separate time-off warning finding is addressed below; no automatic reassignment is implied.

## Published schedule and time-off conflicts

Request review now reports the number of overlapping currently published shifts at the selected location, under the existing review authorization. It reads the latest publication snapshots once per nonempty time-off review queue. Approval remains the existing request decision; it never deletes or reassigns published shifts.

The employee schedule annotates only the employee's already-authorized returned shifts when approved time off overlaps them. The leave query is bounded to displayed shift times and covers the employee's approved leave across locations. Empty own-shift results do not query leave. These are read projections; immutable publication snapshots are not modified.

The browser walkthrough exposed a premature unconfirmed-decision warning during ordinary saving. The page now shows neutral saving feedback while the request is running and reserves recovery details for an unconfirmed completed attempt. The employee location selector now visibly displays its default All locations option.

### Evidence at 11:13 UTC

- In the isolated development database, existing scheduling services created one published synthetic shift for Morgan Example on October 7, 09:00–17:00 America/Chicago. A submitted time-off request covered 12:00–16:00 on that day.
- Chrome request review displayed one overlapping published shift at this location. Approval returned Request approval saved and removed the item from the pending queue.
- Database read-back confirmed request status approved at revision 2, with publication version 1 and the original one-shift snapshot retained.
- Chrome employee sign-in showed the same assigned shift, Published v1, and the approved-time-off warning. This validates the reviewer-to-employee local journey, not hosted acceptance or automatic coverage resolution.
- TypeScript and both Vite bundles passed; scoped RuboCop passed for all five changed Ruby files. A final selector-only adjustment passed TypeScript again. The preexisting marketing import warning remains.
- A small serializer regression check was added but not run. It covers own-employee filtering, selective conflict flags, and unchanged stored snapshots. No automated tests were executed.

## Empty schedule publication and older payroll corrections

Publishing an empty draft now creates a valid successor publication. The confirmation describes clearing the location/week while retaining earlier publications, and publish authorization, draft revision, and immutability remain enforced. The former presence validation rejected an empty array after the UI allowed all shifts to be removed.

Payroll correction selection now loads the latest eligible approved cards for the original export's exact employee/workweek population before applying the 250-card ceiling. The server retains practice/site scoping and export authorization. The page preserves settings drafts and loaded history, exposes a candidate-only refresh/retry, and clears stale choices while loading. Normal new-export candidates still show the most recent 250, now with an explicit limit notice; configuration history remains capped at 25.

### Evidence at 11:25 UTC

- Before the model repair, a nonpersisted publication copy with an empty array failed validation with Shift snapshot can't be blank.
- In Chrome, an administrator published an empty successor for October 5–11 after reviewing the clearing warning. Database read-back showed publication 1/version 1 with one shift and publication 2/version 2 with zero shifts, superseding publication 1. Employee My schedule then showed No assigned published shifts for the same week.
- A database-guarded ignored script created 252 synthetic history-only approved cards and an export linked to the oldest one. The default page displayed 250 candidates and the limit notice, excluding the oldest period. Selecting export 52 loaded only its original December 13–20, 2021 card and retained an unsaved configuration-name draft. The final loading state showed neither stale candidates nor a false missing-card warning. The temporary draft was discarded through the UI.
- These historical candidate fixtures do not establish time calculation, approval, or export generation correctness. The missing payroll-ID warning correctly remained visible.
- TypeScript and both Vite bundles passed; a final loading-copy adjustment passed TypeScript. Scoped RuboCop passed for the four changed Ruby files. The existing marketing import warning remains.
- Small regression checks for empty successor retention/idempotency and old correction candidates/site isolation were added but not executed. No automated tests were run.

## Payroll workweek search and correction review guidance

Payroll preparation now accepts an exact workweek before the existing candidate cap, with Apply/Clear controls and an explicit applied-date label. Correction mode clears that filter and the server rejects incompatible correction/workweek parameters. Draft settings and export history survive candidate refreshes. A single workweek exceeding 250 candidates remains a documented ceiling; files themselves still accept at most 250 cards.

Correction review now receives a server-projected `can_decide` capability. Reviewer-scoped pending corrections requested by another membership can be decided; requester and employee self views cannot. The UI omits unavailable decision controls and explains independent review, while the existing backend prohibition remains authoritative. Create/decision responses default the projection to false without exposing requester identifiers.

Timecard submission, approval, correction requests/decisions, and payroll creation show neutral progress during saving. Unconfirmed-outcome recovery remains available after an uncertain completed request. No retry, authorization, immutable-history, or lost-work protection was removed.

### Local journey evidence at 11:46 UTC

- A separate synthetic employee (Taylor Example), location (Payroll journey), explicit development calculation settings, and two September 28 raw punches were prepared in the owned database. No calculated card or export was seeded. Location setup used the repository's existing development profile helper. The first fixture attempt failed request-key validation and rolled back; corrected UUIDs succeeded.
- In Chrome as Payroll Operator, calculation produced timecard 253/version 1 with eight paid and regular hours and no exceptions. The operator submitted it; a Clinic Administrator approved it. Payroll settings and employee ID WF-002 were saved through the UI. Preview showed one row, eight paid hours, zero overtime. Creation saved export 53.
- The administrator requested changing the interval end from 17:00 to 18:00. Self-decision was correctly rejected by the server, exposing the UI guidance defect fixed in this batch. A different Payroll Operator approved the request. Calculation produced card 254/version 2 with nine paid hours, eight regular hours, and one overtime hour under the explicit fixture policy. The operator submitted it and the administrator approved it.
- Selecting export 53 for correction loaded the latest approved original-population card (version 2). Preview and creation saved export 54 with nine paid hours and one overtime hour. History displayed both files and their replacement relationship.
- Database read-back confirmed both cards remain approved, correction 1 links to card 254, raw punches remain at 09:00 and 17:00 America/Chicago, export 54 supersedes 53, and both stored CSV SHA-256 digests match their contents. This is local synthetic workflow evidence, not employment-policy/legal acceptance or hosted acceptance.
- On the final workweek-filter code, Main clinic's default list showed 250 cards. Applying December 20, 2021 returned the one older unexported card and retained an unsaved configuration draft. Clear restored 250 candidates with the draft still intact; the draft was discarded through the UI.
- On the final correction-capability code, an administrator-created second correction displayed independent-review guidance and no approval/decision-reason controls to its requester. Payroll Operator saw enabled approval/denial controls and denied the request; the pending count returned to zero without changing approved hours.
- TypeScript and both Vite bundles passed before the final capability projection. Final TypeScript initially identified an existing typed test fixture missing the new boolean; the fixture was updated and TypeScript then passed. Scoped RuboCop passed. No automated tests were executed; regression checks remain unrun.

### Download evidence boundary

The high-level browser download wait timed out. Tab-scoped Chrome diagnostics separately observed `Page.downloadWillBegin` for workforce-hours-54.csv and all 138 bytes received. No completed download event or persisted file path was observed. The app's content/digest verification and browser receipt are established, but on-disk delivery remains unverified. No download-policy or browser preference was changed.

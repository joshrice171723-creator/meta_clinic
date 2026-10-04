# Workforce development — 2026-10-04

## First implementation checkpoint

Source commit: `99646cfa`, based on fetched `origin/main` `3775977a`.
Branch: `codex/workforce-three-hour-20261004`.
The primary checkout and its unrelated work were preserved. All prepared resource slots were already claimed; this work uses a separate managed checkout.

### Implemented behavior

- Employee request history and manager review now show the requesting employee, location, exact time interval/timezone or weekly availability, and recorded reasons. Shift details come from the saved publication. Review loads use the existing abortable resource hook; only target-accepted swaps enter the manager queue.
- Availability requests expose effective start/end dates, label each day's time controls, and support an explicitly unavailable week. The API rejects reversed effective dates. These are workforce operational records; no clinical field, FHIR resource, labor-law rule or payroll calculation policy was introduced.
- Employee submissions and request decisions retain their in-memory retry key for identical unacknowledged payloads. Request-decision authorization is checked before returning saved receipts.
- Timecard, correction and kiosk listings honor the selected location for practice-wide operators. Practice-wide timecard readers retain empty cards for employees assigned to the location, so missing-punch correction work is not hidden by the new filter. Existing restricted-reader projection remains unchanged.
- Timecard calculation is unavailable while its employee/location data is loading; changing location clears employee/date/decision selections.
- Correction creation serializes its work and checks an exact saved retry before rejecting a stale source lock. Retry ownership includes the original actor and lock version. Proposed correction destinations participate in the existing site permission checks.
- Payroll corrections must cover the original employees and workweeks, while allowing corrected timecard revision IDs. Already-exported workweeks, unrelated corrections and second successors are rejected before preview. Saved export retries return the saved content.

### Verification actually performed

- Locked worktree prewarm succeeded; package and lockfiles were unchanged.
- Frontend TypeScript and both Vite bundles passed. The pre-existing marketing static/dynamic import warning remains.
- Prettier passed for the five changed/new frontend files.
- RuboCop passed for all seven changed Ruby files; the later timecard filter repair separately passed its scoped lint check.
- Source/diff review and `git diff --check` passed.
- No automated tests were added or run, following the repository preference.
- Connected database/browser verification remains unperformed. `docker ps` in the configured `desktop-linux` context hung without returning a container inventory; only that task-owned read process was stopped. No shared Docker service, database or runtime was reset.

These are local source/build results, not persisted browser acceptance or deployment evidence. No provider, payroll transmission or hosted release occurred.

### Concrete follow-up findings

Source tracing identified these remaining issues, not completed repairs:

- `CalculateTimecard` matches corrected intervals by nonempty punch IDs, so a previously added manual interval cannot reliably be replaced or removed again.
- Removal validation needs a source-segment ownership review.
- The manager timecard screen offers approval but needs reconciliation with the server's manager-required submission path.
- Payroll selection still offers historical approved versions and cards without hours at the chosen location; the export service now rejects those invalid selections.
- Site-restricted timecard projection needs a bounded review of empty-segment exceptions and retained snapshot provenance.

The three-hour development window remains active through 2026-10-04 10:20 America/Chicago. Subsequent source checkpoints must retain their own verification boundaries.

UI implementation reuses Material UI and the existing resource/date helpers. The current [Material UI TextField documentation](https://mui.com/material-ui/react-text-field/) was consulted for labeled, disabled and date/time controls; no UI dependency was changed.

## Second implementation checkpoint

Source commit: `cd1015df`, pushed to the same owned branch after pulling `origin/main` (already current). The remote has no `master` branch; synchronization uses its actual `main` branch.

- Manual intervals, including midnight-split slices, can be replaced or removed when their source matches uniquely. Ambiguous or missing sources remain exceptions. Pending manual corrections require the source digest to remain current. Calculation version changes apply only to manual-source correction chains.
- Correction model validation checks source-card employee/practice ownership and validates removal source IDs before its early return.
- Timecards expose server-derived submission/approval availability and blocking reasons. Manager-required drafts now have a submission action; employee-required submissions retain their separate policy. Authorized manager reads take precedence over self-service restrictions on the manager's own card. Mutations retain lock, source-digest and policy checks.
- Correction review identifies the employee/workweek and shows original and proposed intervals. The correction form preserves the original interval location, prefills interval times, labels the device timezone, validates time order and holds a retry key for the same unacknowledged payload. Its controls lock while saving.
- Employee hours use the existing abortable resource loader, including retry and refresh states.
- Payroll candidates must contain the selected location's hours and have no newer version, even if that newer version is a draft. Scoped timecard snapshots filter schedule comparisons and omit cross-location source punch IDs. The UI identifies location-only versus full-card totals.

Verification: TypeScript and both Vite bundles passed; the existing marketing import warning remains. RuboCop passed for all six changed Ruby files. Changed frontend formatting passed after formatting the existing correction fixture; `git diff --check` and scoped source review passed. The existing fixture was extended with required response fields; no test cases were added and no tests were run. `docker desktop status` returned that it could not retrieve status, so connected database/browser behavior is still unverified. No shared runtime was reset and no deployment occurred.

Remaining observed boundaries: site-restricted readers still cannot retrieve empty-segment cards through the segment-based scope; historic correction replay can reorder if the synthetic business clock is moved backward between approvals. Those paths need their own bounded implementation and verification. The user's renewed three-hour request continues from this checkpoint.

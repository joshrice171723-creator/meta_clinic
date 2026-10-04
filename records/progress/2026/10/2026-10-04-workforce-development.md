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

## Third implementation checkpoint

Source commit: `332f4071`, pushed after another clean synchronization with `origin/main`.

- Schedule bootstrap now projects location-specific manage/publish permissions. Read-only users see published schedules without draft editing controls. Publishers can inspect draft shifts without receiving editing permission.
- Managers can select a Monday for a new weekly draft. Draft selection locks action controls while loading; successful save/delete responses update the displayed draft revision. Published schedules remain visible below the editor, and both team and employee views support refresh/retry.
- Shift editors preserve and expose first/second clock occurrences for repeated local times. Template creation normalizes those saved choices only when the target date has a single occurrence, including the actual overnight end date; ambiguous choices and gap rejection remain with the existing resolver.
- Unsaved shift changes use the existing clinic/demo navigation guards. Save controls lock during mutations; publication is disabled while unsaved shift changes remain. Publication retains its exact retry key after an unknown response and warns before route exit loses that retry. Refresh selects another available draft when the just-published draft leaves the list.
- Shift-swap publication now locks the site before validating and copying the source publication. This closes the gap in which a concurrent publication could be overwritten by the swap. The reviewed order is request, site, new draft, then sorted employment locks; ordinary publication never acquires a request row lock.

Verification: final TypeScript and both Vite bundles passed after the review repairs; the existing marketing import warning remains. Three changed Ruby files passed scoped RuboCop. Three frontend files passed Prettier; scoped source review and `git diff --check` passed. No tests were added/run. Connected scheduling persistence, concurrent requests, navigation and responsive browser behavior are unverified because an owned database/runtime remains unavailable. No deployment occurred.

The renewed continuation is scheduled through **2026-10-04 10:39 America/Chicago (15:39 UTC)**. Continue useful bounded workforce implementation from this clean checkpoint; do not rerun unchanged checks or reset shared Docker. Prioritize the unresolved empty-card location scope and correction chronology only after inspecting their exact authority and persistence paths. At the deadline, finish/save the current small change and pause the continuation.

## Fourth implementation checkpoint

Source commit: `c16266c7`, pushed after synchronization with `origin/main` (already current).

- A shared timecard location query now retains empty cards when every saved punch reference belongs to the selected location, employee and practice. A card without any punch references instead requires an active, currently effective employee assignment. Mixed-location or invalid punch provenance does not satisfy the single-location proof.
- Location list and detail reads use that same scope. Authorized empty-card projections retain missing-punch exception codes, and action guidance asks for missing intervals instead of incorrectly reporting an unconfigured approval policy. Employee self reads derive empty-card locations from saved punches before falling back to assignments.
- A location-limited correction reviewer sees only requests whose full interval/destination scope is reviewable there. Correction creation rechecks the empty-card location proof. Employee correction policy includes original punch locations as well as the proposed destination; practice-wide review authority takes precedence over self-service restrictions for a manager's own correction.
- Correction decisions capture one actual business timestamp at database precision. Pending calculation inserts the request using the same timestamp/ID order used after persistence, retaining historical ordering and digest semantics even if the synthetic business date moved backward. A pending correction with a missing, partial or ambiguous source now raises before creating a new timecard, so the enclosing decision transaction leaves that request submitted. Historical source exceptions retain their previous handling.

Verification: six changed/new Ruby files passed scoped RuboCop; source review and staged diff checks passed. No frontend source changed, so the preceding successful frontend build was not repeated. No tests were added/run. The new PostgreSQL relation, transaction outcomes and browser exception queue still need connected verification; Docker was not retried or reset without a changed prerequisite. No deployment occurred.

Further bounded findings remain: scoped cards with some completed intervals can still omit card-level missing-punch exception codes from their attention projection; a site-only manager correcting their own card still follows the existing self-service branch. Review those exact paths before expanding the next batch. The three-hour continuation remains active until its recorded deadline.

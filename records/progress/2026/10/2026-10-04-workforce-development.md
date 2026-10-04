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

## Fifth implementation checkpoint

Source commit: `0c9aeedf`, pushed after synchronization with `origin/main` (already current).

- Location-restricted timecard projections retain card-level exception codes when every completed interval and saved source punch belongs to that location. This includes a partly completed card with a missing final punch. Mixed-location cards keep their restricted exception projection. The whole-card proof is loaded once for the list, rather than queried separately for each card.
- Correction lists and review authorization reuse the same whole-card location proof, including unfinished source punches. A location manager can request a correction to their own card through their review permission without requiring employee self-service. Proposed destinations still participate in the location proof, and the separate prohibition on deciding one's own correction remains unchanged.

Verification: all three changed Ruby files passed scoped RuboCop; source/diff review and `git diff --check` passed. No frontend files changed, so the prior successful frontend build was not repeated. No tests were added/run. PostgreSQL execution, persisted correction decisions and browser behavior remain unverified without an owned runtime; no shared Docker resources were reset and no deployment occurred.

These two findings from the fourth checkpoint are implemented in source. Continue with a new bounded employee, scheduling, request or payroll journey during the remaining authorized window; avoid repeatedly auditing the same scope. Connected verification remains a separate gap, not a source acceptance claim.

## Sixth implementation checkpoint

Source commit: `7edcc9b1`, pushed after synchronization with `origin/main` (already current).

- Payroll controls now use permissions returned for the selected location. Export history identifies replacement files; correction choices omit exports already replaced. Saved employee/workweek metadata selects the latest available approved cards matching a correction's original population. The API loads this metadata in batches and finds successors beyond the history display limit; existing export population validation remains authoritative.
- Payroll file settings warn before navigation, location changes or refresh discard edits. Saving or discarding settings is required before preparing an export. Refresh and failed-load retry are available, and successful saves reload the current records.
- An unconfirmed export retains its exact payload and retry key, locks selection changes and offers an explicit retry. A later rejected retry does not clear uncertainty about the first attempt; leaving or refreshing warns that the saved retry will be lost. Confirmed success refreshes history. Payroll preview follows the selected configuration's actual column order and headings.

Verification: TypeScript and both Vite bundles passed; the existing marketing import warning remains. After a focused retry-state repair, final TypeScript and Prettier checks passed. The changed payroll controller passed scoped RuboCop. Source/diff review and `git diff --check` passed. No tests were added/run, no runtime resources were changed, and no deployment occurred. Browser navigation, persisted exports and PostgreSQL metadata queries still require an owned connected runtime.

Continuation remains active through 15:39 UTC. Next useful scope can be the existing employee setup or request journey, rather than further speculative payroll policy or repeated review of completed changes.

## Seventh implementation checkpoint

Source commit: `992f5de9`, pushed after synchronization with `origin/main` (already current).

- Badge candidates now include the selected location's effective assignment eligibility. The API projects the existing PIN requirement; unconfigured settings remain visible without suppressing badge history. Employee assignments are preloaded for this projection.
- Badge and kiosk loading states no longer appear as empty saved lists. Issuance controls wait for available records, lock inputs during saves and explain missing employee eligibility. PIN requirements use task-facing copy and client validation while retaining server enforcement.
- One-time badge and enrollment material remains in memory through refresh while its record is still issued. Navigation and location changes warn before losing it; accidental badge dialog dismissal asks for confirmation. A printed badge includes the employee name; enrollment codes show their location and actual expiry. Matching revocation, replacement or enrollment state clears unusable displayed material. Creating another enrollment requires explicitly finishing with the current code.
- Refresh/retry controls and unknown-outcome messages direct operators to inspect saved records before issuing replacement material. Tokens remain one-time responses; no token persistence, replay endpoint or new credential storage was introduced.

Verification: TypeScript, both Vite bundles, Prettier and the changed Ruby controller's RuboCop check passed. The existing marketing import warning remains. Source/diff review and `git diff --check` passed. No tests were added/run. Actual badge printing, kiosk enrollment, navigation dialogs and database behavior are unverified without an owned runtime. No deployment or shared runtime reset occurred.

The authorized work window remains active until 15:39 UTC. A next bounded employee request journey can proceed from this clean source checkpoint; do not present these source/build results as connected acceptance.

## Eighth implementation checkpoint

Source commit: `5cb82e1c`, pushed after synchronization with `origin/main` (already current).

- Employee request drafts warn before changing location, changing request type or leaving the page. Discard and successful submission reset the complete editor; history refresh and unrelated decision success preserve an unsaved draft. Stale shift/employee choices are identified and cannot be submitted as a new swap.
- Submission, cancellation and swap responses retain one exact payload and retry key while their outcome is unknown. The page offers explicit recovery, freezes conflicting edits/actions, and keeps that retry through history refresh or a later rejected retry. Stopping recovery explicitly warns that the action may already have saved. Confirmed-save notices remain visible even when history reload fails.
- Time-off controls expose the API's existing first/second clock-occurrence fields. The shared resolver remains unchanged: equal or backward local endpoints are interpreted as overnight before timezone resolution, so short intervals spanning the repeated fall-back hour in that direction are still unsupported. This is a concrete remaining temporal boundary, not a completed repair.
- Create replay now verifies both saved employment/requester identity and persisted requesting user before returning a prior availability, time-off or swap request. Normal replay and concurrent-create recovery use the same ownership check; existing context checks and payload conflict behavior remain intact.

Verification: TypeScript and both Vite bundles passed, with the existing marketing import warning. After the final success-notice rendering repair, TypeScript and Prettier passed again. The changed request controller passed scoped RuboCop. Source/diff review and `git diff --check` passed. No tests were added/run; no database, browser or daylight-saving runtime acceptance is claimed. Shared runtimes were untouched and no deployment occurred.

Continuation remains active through 15:39 UTC. The next batch may address the known shared local-interval resolver boundary only after tracing its callers and preserving template overnight behavior, or proceed with another concrete workforce journey.

## Ninth implementation checkpoint

Source commit: `bf952238`, pushed after synchronization with `origin/main` (already current).

- The local-interval resolver now has an explicit overnight-inference option, defaulting to the existing behavior for template and development callers. Dated time-off requests, direct shift entry and assistant shift validation disable that inference and compare resolved instants. Explicitly dated overnight intervals still work; reversed or zero elapsed intervals reject instead of silently gaining a day.
- Shift and time-off forms permit a same-date first-occurrence start and second-occurrence end candidate even when the displayed end clock is equal to or earlier than the start. The server remains responsible for actual timezone ambiguity, gap and positive-duration validation. Existing selected-week shift boundaries and break-duration validation remain in force.
- Saving a weekly template from a short repeated-hour-only shift is blocked with an explanation, preventing its dated interval from silently turning into the legacy next-day template interpretation. Existing weekly template overnight behavior and target-date occurrence normalization remain unchanged.

Verification: TypeScript and both Vite bundles passed; the existing marketing import warning remains. All four changed Ruby files passed scoped RuboCop, both changed frontend files passed Prettier, and source/diff review plus `git diff --check` passed. No tests or executable timezone examples were added/run. Daylight-saving persistence, browser input behavior and template reuse remain unverified in a connected runtime. No deployment or shared runtime changes occurred.

The eighth checkpoint's concrete repeated-hour source limitation is addressed, with runtime acceptance still pending. Continuation remains active until 15:39 UTC; proceed to another bounded workforce journey rather than repeating this verification.

## Tenth implementation checkpoint

Source commit: `f260dcb2`, pushed after synchronization with `origin/main` (already current).

- Manager request decisions retain their original request, revision, reason and retry key after an unknown response. An explicit retry panel shows the decision and request context, blocks conflicting edits/actions, requires the original selected location and preserves uncertainty if recovery is rejected. Explicitly stopping recovery warns that the decision may already have saved.
- Review reasons remain in memory through refresh and location changes, with navigation warnings before page closure. If another reviewer removes a request from the queue, its unsaved reason stays visible for copying or explicit discard at that location. Successful decisions clear only their own reason.
- Confirmed success and recovery messages remain visible during failed or pending queue reloads, including when no location is selected.

Verification: TypeScript and both Vite bundles passed; the existing marketing import warning remains. Prettier, scoped source review and `git diff --check` passed. No backend source changed, so Ruby checks were not repeated. No tests were added/run. Browser navigation, response-loss recovery and concurrent reviewer behavior remain unverified without an owned connected runtime. No deployment or runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue a concrete remaining timecard/correction or employee journey; preserve the accumulated verification boundaries.

## Eleventh implementation checkpoint

Source commit: `e4ce2793`, pushed after synchronization with `origin/main` (already current).

- Employee self-view timecards now expose active, currently effective assigned locations for correction entry. The correction form uses those choices for missing time, including an empty card with no source punches from which the server could infer a location. Existing read/self-service authorization is unchanged; other views receive no new site list.
- Closing or navigating away from an unsaved correction asks before discarding it. An unknown submission retains the exact payload, source lock and retry key, freezes editable controls and offers explicit retry. A rejected recovery attempt does not clear the original uncertainty.
- Unchanged selected interval boundaries are submitted with their exact saved timestamp strings, preserving the original repeated-hour occurrence and sub-minute precision. Newly entered/edited ambiguous local times still use the existing browser Date interpretation; explicit clock-occurrence selection for those correction fields remains a separate gap.
- Confirmed employee correction submissions remain visible if the subsequent timecard reload fails.

Verification: TypeScript, both Vite bundles, changed frontend formatting and the timecards controller's scoped RuboCop check passed. The existing marketing import warning remains. Source/diff review and `git diff --check` passed. No tests were added/run; connected empty-card correction, response-loss, database and browser verification remain pending. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. A concrete next employee journey is viewing saved correction history and outcomes from My Hours; the current employee hours response/view does not yet render that separate correction queue.

## Twelfth implementation checkpoint

Source commit: `2cdb6aaa`, pushed after synchronization with `origin/main` (already current).

- My Hours now loads the existing employee correction history independently of timecards. Employees can see pending, approved and denied requests, original/proposed intervals, their reason, review reasons and timestamps, including requests against earlier card versions.
- An approved correction links to its resulting card when that card is present in the authorized self-view response. The result opens read-only; unavailable results are identified without inventing a card or exposing another employee's records.
- Hours and correction failures have separate retry controls. Successful calculations, submissions and correction requests refresh both resources; confirmed outcomes remain visible if either reload fails.

Verification: TypeScript and both Vite bundles passed, with the existing marketing import warning. Prettier, focused source review and `git diff --check` passed. No backend source changed; Ruby lint was not repeated. No tests were added/run. Connected browser, persisted correction outcomes and result-card walkthrough remain pending because no owned runtime is available. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. A next bounded scope can address manager correction-review draft/recovery behavior or explicit occurrence selection for newly entered correction timestamps; do not repeat completed checks without new changes.

## Thirteenth implementation checkpoint

Source commit: `be281f78`, pushed after synchronization with `origin/main` (already current).

- Manager correction decisions now retain the original request, decision, reason and optimistic-lock version after an unknown response. A visible retry panel freezes competing writes and location changes, supports exact retry, and preserves uncertainty if a later recovery attempt is rejected. Stopping recovery explicitly warns that the decision may already be saved.
- Review reasons survive refresh and location changes. A reason remains available for copying or explicit discard if its correction leaves the pending queue. Confirmed decisions clear only their own draft. Leaving the page warns about drafts or unconfirmed decisions; navigation is blocked during an active save.
- The API previously checked the old lock version before replay, rejecting exact retries after a successful save. It now accepts an immutable terminal result only for the original reviewer, same decision and normalized reason, and the original pre-save version. Practice and requester-self-decision guards run before replay; mismatches remain conflicts. Submitted transitions retain exact current-version checks.

Verification: TypeScript and both Vite bundles passed with the existing marketing import warning. Frontend formatting, one-file Ruby lint, focused source review and `git diff --check` passed. No tests were added/run. Lost-response recovery, concurrent reviewer persistence and navigation behavior remain unverified in a connected runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Remaining concrete scope includes explicit repeated-clock occurrence selection for newly entered correction times and employee setup journeys, subject to bounded source inspection.

## Fourteenth implementation checkpoint

Source commit: `ef90f3d2`, pushed after synchronization with `origin/main` (already current).

- Correction entry now offers explicit first/second repeated-clock choices for each edited endpoint. Newly entered times go to the server as local minute values plus the displayed device timezone, avoiding the browser's implicit ambiguous-time choice or silent gap normalization.
- Unchanged source endpoints can retain their recorded occurrence and exact timestamp precision. Hybrid corrections preserve one original UTC boundary while resolving the other edited local boundary. Choosing a new occurrence explicitly replaces that boundary's recorded precision.
- The existing local-time resolver exposes a shared single-instant entry point. Correction input normalizes to the existing persisted UTC shape before canonical request replay checks, rejects dual local/UTC input for one endpoint and orphan occurrence fields, and keeps existing source/location authorization and final positive-interval validation. Scheduling callers retain existing overnight semantics.

Verification: TypeScript and both Vite bundles passed with the existing marketing import warning. Frontend formatting, two-file Ruby lint, focused source/contract review and `git diff --check` passed. No tests or executable timezone examples were added/run. Browser controls, actual timezone-gap/repeated-hour persistence and response-loss recovery remain unverified without an owned connected runtime. No deployment or shared runtime changes occurred.

The eleventh checkpoint's edited ambiguous-time source gap is addressed; connected acceptance remains pending. Continuation remains active through 15:39 UTC. Next bounded work should prioritize employee setup or another concrete existing journey, rather than repeating timezone audits.

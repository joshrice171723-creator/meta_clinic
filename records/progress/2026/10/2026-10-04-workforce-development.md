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

## Fifteenth implementation checkpoint

Source commit: `7749761e`, pushed after synchronization with `origin/main` (already current).

- Employee setup retains its one-time activation link with the submitted employee name, invitation ID and expiry. Starting unrelated actions no longer silently clears it. Creating another setup requires explicitly finishing with the displayed link; the form also freezes during an active save.
- Navigation warns before losing activation material even after the setup draft resets. Active or unconfirmed setup blocks navigation. Existing unknown-setup reconciliation remains in place.
- A successful matching revoke response clears only its invitation's material. Failed or uncertain revocation preserves the material and directs the operator to refresh saved invitations; the displayed link may already be invalid. No generic list-absence effect clears a newly created token because an older pre-create read can arrive later. Explicit dismissal or a matching confirmed revoke is required; external activation, expiry or token rotation is not automatically reconciled.
- Employees and invitations have an explicit refresh action. Failed refresh reports that previously loaded records remain visible. Tokens remain in component memory only; no persistence or replay endpoint was introduced.

Verification: TypeScript and both Vite bundles passed with the existing marketing import warning. After the final retention/revoke refinement, TypeScript and formatting passed again. Focused source/response-contract review and `git diff --check` passed. No backend source changed and Ruby lint was not repeated. No tests were added/run. Browser navigation, activation and uncertain-revoke persistence remain unverified without an owned connected runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue with a bounded employee scheduling or clock journey; do not equate source/build evidence with connected acceptance.

## Sixteenth implementation checkpoint

Source commit: `983712e3`, pushed after synchronization with `origin/main` (already current).

- Unknown kiosk punches retain the original challenge, event and request key through network failures, server errors, timeout/session-change responses and rejected recovery attempts. New actions, scans and cancellation are blocked while recovery is pending; page unload warns before losing the in-memory retry.
- Status lookup always uses the pending request key. A receipt confirms success only when it reports saved and matches that key. A not-found lookup no longer claims that an earlier in-flight write cannot still commit. Existing server replay and kiosk authorization remain unchanged.
- Successful receipts clear the active challenge and offer Next employee before the existing automatic reset. Badge verification failures no longer schedule a delayed reset that can erase the next scan. Initial configuration/status loading gates input, with a reconnect action when configuration could not load.
- Synchronous guards prevent overlapping punch/challenge requests. Manual badge verification stops the camera; detector results belong to their captured stream and cannot act after restart. Camera scanning reads the current in-memory PIN.

Verification: TypeScript and both Vite bundles passed with the existing marketing import warning. After final camera/receipt refinements, TypeScript and formatting passed again. Focused source/API contract review and `git diff --check` passed. No backend source changed and Ruby lint was not repeated. No tests were added/run. Kiosk hardware, camera permission lifecycle, interrupted-network persistence and connected browser behavior remain unverified without an owned runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue another concrete workforce slice rather than broadening this into hardware or release acceptance.

## Seventeenth implementation checkpoint

Source commit: `1db28cb3`, pushed after synchronization with `origin/main` (already current).

- My Schedule now browses an explicit Monday–Sunday week using the existing `from`/`to` endpoint contract. Previous, next, current-week and date controls stay available during loading or errors. Calendar-day arithmetic avoids shifting the week across daylight-saving changes.
- Employees can filter the returned publications by location. Filters reset on a new week or if that location disappears on refresh. Shift timestamps continue to use each published shift's timezone.
- Empty-week wording describes the absence of assigned published shifts without asserting that no clinic schedule exists. A shortcut opens the existing time-off and shift-request page. Historical browsing still follows the backend's current employment/site/self-service eligibility; no new access or historical-authorization semantics were introduced.

Verification: TypeScript, both Vite bundles, frontend formatting, focused source/API contract review and `git diff --check` passed. The existing marketing import warning remains. No backend source changed; Ruby lint was not repeated. No tests were added/run. Connected weekly browsing, publication replacement and browser layout remain unverified without an owned runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue a bounded existing workflow from this clean checkpoint.

## Eighteenth implementation checkpoint

Source commit: `4845dceb`, pushed after synchronization with `origin/main` (already current).

- Employee submission and manager submission/approval now retain the original card, action, lock version and selected location after an unknown response. Explicit retry works independently of a refreshed card's action availability. Rejected recovery does not erase the earlier uncertainty; stopping recovery warns and refreshes current records.
- Competing timecard writes, new corrections and manager location changes remain blocked while a transition is unconfirmed. Refresh stays available, and navigation warns before losing the saved retry.
- The controller accepts an immediately completed submission/approval only for the original actor and original pre-save version, after current authorization and inside the existing employment/card lock order. Replay makes no mutation. All new-transition source, exception, policy, pending-correction and newer-version checks remain. A submission that has already advanced to approval still conflicts rather than fabricating a durable receipt.

Verification: TypeScript, both Vite bundles, frontend formatting, one-file Ruby lint, focused source/contract review and `git diff --check` passed. The existing marketing import warning remains. No tests were added/run. Lost-response/concurrent-transition persistence and browser recovery remain unverified without an owned connected runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue concrete bounded workforce implementation; preserve these connected-verification limits.

## Nineteenth implementation checkpoint

Source commit: `8cf41667`, pushed after synchronization with `origin/main` (already current).

- Settings drafts warn before scope changes, refresh or navigation. Saving freezes the form; successful confirmation reports the returned saved revision and effective time and remains visible through reload failures.
- Unknown settings saves keep the draft and freeze resubmission until the operator explicitly discards it and reviews saved revisions. Existing revision conflicts are not presented as proof of an earlier save. No replay receipt or new settings policy was added.
- The settings response exposes future-dated versions from the same authorized scope, ordered by effective time and revision. Current, scheduled and effective settings share one captured business time. A read-only list shows future version values and dates while the editor continues to start from currently effective values. Copy explains that later revisions win when effective times are equal.

Verification: An initial TypeScript failure identified an invalid Typography prop; it was repaired, then TypeScript and both Vite bundles passed. The existing marketing import warning remains. Final wording/value-display refinements passed TypeScript and formatting; one-file Ruby lint, focused source/contract review and `git diff --check` passed. No tests were added/run. Connected future-revision activation, unknown-save recovery and browser draft guards remain unverified without an owned runtime. Settings effective-time entry still uses the existing device Date interpretation. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue bounded existing workforce workflows from this checkpoint.

## Twentieth implementation checkpoint

Source commit: `d146dcc5`, pushed after synchronization with `origin/main` (already current).

- Payroll history downloads use the existing API client, preserving demo routing and clinic actor/practice/site context instead of navigating through a raw anchor. An optional JSON response returns the same saved CSV after unchanged authorization and audit; raw CSV download remains the default for existing callers.
- The client verifies the downloaded UTF-8 bytes against the saved batch's SHA-256 before issuing a browser download. It preserves CSV line endings and adds no BOM. Session/location changes or unmount cancel a pending download, including the asynchronous digest stage.
- Download errors stay inline and preserve file-setting drafts and unconfirmed export retries. The success notice says a download was requested and directs the operator to browser downloads; it does not claim that a browser file write completed. Retrying retrieves the same saved file without creating an export.

Verification: TypeScript, both Vite bundles, formatting, one-file Ruby lint, focused source/contract review and `git diff --check` passed. The existing marketing import warning remains. No tests were added/run. Actual browser downloads, demo namespace execution, session-switch cancellation and downloaded-byte acceptance remain unverified without an owned runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue a concrete bounded workforce improvement; no deployment or connected acceptance is implied by these commits.

## Twenty-first implementation checkpoint

Source commit: `6e31741b`, pushed after synchronization with `origin/main` (already current).

- Payroll preparation identifies selected employees missing payroll IDs in the chosen configuration and directs authorized operators to save a new configuration version. It reports selected timecard and employee counts.
- Correction exports list the original employee/workweek combinations still missing from the selection, distinguishing available cards from unavailable eligible approved cards. Unrelated workweeks cannot be selected during correction preparation; authorized operators can open timecard review.
- New previews and exports are blocked while these preparation gaps remain. Exact unconfirmed export retries bypass the new readiness checks, preserving the server's existing saved-request recovery semantics. No payroll calculation or population policy changed.

Verification: TypeScript and both Vite bundles passed with the existing marketing import warning. A final alert-visibility refinement passed formatting and `git diff --check`; focused parent and independent backend-contract reviews found no concrete defects. No backend source changed and Ruby lint was not repeated. No tests were added/run. Connected correction preparation, configuration changes and browser layout remain unverified without an owned runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue bounded workforce implementation from this saved checkpoint.

## Twenty-second implementation checkpoint

Source commit: `3ef70e33`, pushed after synchronization with `origin/main` (already current).

- Unknown payroll file-setting saves preserve and freeze the draft, including when a session change arrives after the request. Refresh explicitly confirms draft discard before fetching saved configuration versions. The existing revision guard remains; no durable configuration replay receipt was introduced.
- Successful file-setting saves validate the returned configuration identifier/revision and report that saved revision. An incomplete successful response is treated as unconfirmed, preserving the draft.
- Export recovery no longer treats explicit `outcome_unconfirmed` or `session_changed` client errors as definite rejections merely because their status is 4xx. It retains the exact original request for recovery; rejected retries still do not erase earlier uncertainty.

Verification: TypeScript, both Vite bundles, formatting, focused parent/independent recovery review and `git diff --check` passed. The existing marketing import warning remains. No backend source changed and Ruby lint was not repeated. No tests were added/run. Lost-response persistence, session transitions and browser recovery remain unverified without an owned runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue a bounded existing workforce journey from this checkpoint.

## Twenty-third implementation checkpoint

Source commit: `09d6a1bf`, pushed after synchronization with `origin/main` (already current).

- Employee request history can be filtered independently of the request draft by request type, saved status, or swaps awaiting the employee's response. Counts, clear-filter and distinct filtered-empty states preserve access to the full returned history; a selected status stays available if a refresh removes its last matching row.
- History shows saved creation and decision timestamps in the request timezone. Swap explanations distinguish replacement-employee acceptance from manager approval and schedule publication. No cancellation/target-response timestamp or inferred expired status is fabricated.
- Request submission, cancellation and swap-response recovery retains the exact original request when the API reports an explicit unknown outcome or session change, including 4xx statuses. These are no longer mistaken for definite rejection.

Verification: TypeScript and both Vite bundles passed with the existing marketing import warning. Final responsive-wrap/wording refinements passed formatting and `git diff --check`. Focused source and backend-contract review confirmed status semantics. No backend source changed and Ruby lint was not repeated. No tests were added/run. Connected filtering, refresh/recovery and browser layout remain unverified without an owned runtime. History still uses the existing unpaginated API; this batch adds no read limits or pagination. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue another bounded workforce slice and preserve these verification limits.

## Twenty-fourth implementation checkpoint

Source commit: `37db3f52`, pushed after synchronization with `origin/main` (already current).

- Schedule publication recovery retains the original draft identifier, revision, location, week and request key. Dedicated retry actions remain available after refreshing away a published draft or changing draft selection/revision. Current-location, publish-permission and unsaved-editor guards remain; explicit stop-retry confirmation warns that publication may already be saved.
- A rejected publication recovery no longer discards earlier uncertainty. Explicit unknown-outcome/session-change responses also retain publication retries instead of being classified by 4xx status alone.
- The same explicit-error classification is corrected for manager request decisions, timecard correction decisions and correction submissions. Badge/kiosk-code failure wording now identifies these responses as potentially saved outcomes and directs saved-record review.

Verification: TypeScript and both Vite bundles passed after the recovery implementation. A final location-label refinement initially needed formatting; formatting was repaired and TypeScript passed again. Scoped diff and independent recovery/contract review found no further defects. The existing marketing import warning remains. No backend source changed and Ruby lint was not repeated. No tests were added/run. Lost-response persistence, location/session transitions and connected browser recovery remain unverified without an owned runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue bounded workforce implementation from this saved checkpoint.
## Twenty-fifth implementation checkpoint

Source commit: `cf0281ce`, pushed after synchronization with `origin/main` (already current).

- My Hours now filters latest timecards and correction history together by saved workweek boundaries. Available weeks come from both histories, so a correction remains discoverable even when its resulting card is unavailable. Dates are compared as returned, without timezone conversion.
- Correction history also filters by awaiting-review, approved or denied status. Counts, distinct filtered-empty states and clear filters support returning to the complete loaded history. Refresh retains filter choices and supplies a fallback option if the selected week is no longer returned.
- Filtering leaves unconfirmed submission recovery and correction-dialog drafts independent of the visible card list. Existing latest-version selection, recalculation, permissions and API read scope remain unchanged.

Verification: TypeScript, both Vite bundles, formatting, source diff review, backend date/order contract review and `git diff --check` passed. The existing marketing import warning remains. No backend source changed and Ruby lint was not repeated. No tests were added/run. Connected refresh/filter/dialog interaction and browser layout remain unverified without an owned runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Continue bounded implementation without treating source checks as connected acceptance.

## Twenty-sixth implementation checkpoint

Source commit: `c101642d`, pushed after synchronization with `origin/main` (already current).

- Manager timecard review filters the selected attention view and pending corrections by employee-name text and saved workweek. Matching counts, a filtered-empty state and clear controls distinguish the visible results from all records in the attention view.
- Hidden pending correction review drafts remain stored and trigger a reminder to clear filters. Existing orphaned-draft recovery and unconfirmed submission/approval/correction actions remain outside the filtered lists.
- Review filters reset on an explicit location change and remain separate from employee/date inputs used to calculate a card. Current-source, permission and action-availability guards remain unchanged; no new server read or write scope was introduced.

Verification: TypeScript, both Vite bundles, formatting, focused source/diff review and `git diff --check` passed. The existing marketing import warning remains. No backend source changed and Ruby lint was not repeated. No tests were added/run. Connected filtering, retained-draft interactions and browser layout remain unverified without an owned runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Keep remaining work bounded and save a final session handoff at the deadline.

## Twenty-seventh implementation checkpoint

Source commit: `2831ad05`, pushed after synchronization with `origin/main` (already current).

- Payroll preview now pages through every returned row instead of truncating the review to 25 rows. Operators can choose 25, 50 or 100 rows per page; a new preview resets to its first page.
- The preview identifies the selected configuration name and revision and keeps server-calculated whole-file totals visible. Copy explains that page navigation does not change the export selection. Existing configured column headings, readiness guards and exact export recovery remain unchanged.

Verification: TypeScript, both Vite bundles, formatting, focused source/diff review and `git diff --check` passed. The existing marketing import warning remains. No backend source changed and Ruby lint was not repeated. No tests were added/run. Connected preview pagination, narrow-screen layout and final file acceptance remain unverified without an owned runtime. No deployment or shared runtime changes occurred.

Continuation remains active through 15:39 UTC. Preserve the final checkpoint and stop new scope at the authorized deadline.

## Session integration handoff prepared at 15:32 UTC

The owned branch contains 27 implementation commits, from `99646cfa` through `2831ad05`, with their per-batch evidence recorded above. At this checkpoint, source and records through `5e6a29de` are pushed, the worktree is clean, and fetched `origin/main` is already integrated. The session remains authorized only through 15:39 UTC; this handoff does not extend that window.

- Employee setup: preserve one-time activation links and badge/kiosk enrollment material across unrelated actions, improve eligibility context and failed-save guidance.
- Scheduling and requests: complete dated draft/week navigation and location permissions, handle repeated local clock hours, show request context/outcomes, protect drafts and preserve original publication/request retries through uncertain responses.
- Timecards and corrections: repair manual-source correction chains, missing-punch location visibility and review scope, expose submission/approval availability, preserve exact retries and review reasons, show correction history and employee/workweek filters.
- Settings and payroll: show scheduled settings revisions and protect drafts, enforce original correction-export populations and latest eligible cards, expose missing payroll IDs/workweeks, review every preview row, and retrieve digest-checked saved CSV files through the authorized API client.

Verification evidence is the focused source review, TypeScript, both Vite bundles, formatting and scoped Ruby lint recorded for each affected batch. Final branch-wide `git diff --check` passed. An independent final source review of transition/adjustment replay and payroll correction authorization found no concrete integration defect requiring another fix. No test cases were added and no tests were run; one existing typed test fixture received required response fields in the second batch so frontend typechecking remained valid.

Remaining acceptance work requires an owned connected runtime/database: exercise actual saved-state concurrency and lost-response recovery, selected-site permissions, daylight-saving correction boundaries, future settings activation, browser navigation/responsive behavior, kiosk camera/scanner/PIN flows, and actual payroll preview/download bytes. Docker inventory/status was unavailable; no shared runtime was reused or reset. The existing marketing import warning remains. In-memory retries are lost on page closure; current authorization may prevent recovering an earlier receipt; submission replay after a later approval remains a conflict. No durable configuration-save replay receipt was added, and request history remains unpaginated. No deployment, payroll transmission or external messages occurred.

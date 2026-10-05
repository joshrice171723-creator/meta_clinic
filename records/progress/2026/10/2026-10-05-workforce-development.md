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

## Shift swap walkthrough and incomplete-card display

The shared schedule interval formatter now includes short timezone names. This removes the ambiguity between 01:15 CDT and 01:45 CST in shift choices, employee schedules, drafts, and published schedule details. The same existing formatter and timestamps remain in use. Employee request submission/acceptance also uses neutral saving feedback while preserving uncertain-outcome recovery.

The earlier history-only payroll candidate fixtures deliberately lacked calculated snapshot totals. Opening their employee's My hours exposed a whole-route render failure in TimecardSummary. The shared component now displays the employee/workweek and an unavailable-details warning, without totals or review actions, when required snapshot totals/segments are absent. It does not invent hours or repair the underlying record. Valid calculated cards keep their existing display.

### Evidence at 12:00 UTC

- TypeScript passed for the display changes. A small static-render regression was added for incomplete-card containment but not run. In Chrome the incomplete history showed unavailable-card messages, no route error, and working My hours/My schedule/My requests navigation. This malformed-snapshot reproduction came from the bounded history fixtures, not an observed normal calculation output.
- A guarded ignored fixture published two November 1 shifts at Main clinic using existing scheduling services: Morgan's 01:15 first occurrence to 01:45 second occurrence (90 actual minutes) and Taylor's 03:00–04:00 shift. It enabled only the required site request settings and current Taylor site assignment; no request/decision was seeded.
- Front Desk Coordinator (Morgan) submitted the swap, Clinical Staff (Taylor) accepted, and database read-back showed accepted/revision 2 with only the original publication still present. Clinic Administrator then approved through Request review.
- Database read-back showed request approved/revision 3 and publication 4/version 2 superseding publication 3/version 1. The transferred shift retained 06:15Z–07:45Z, first/second occurrence, and 90-minute duration, while employment changed from Morgan to Taylor. The unrelated Taylor shift retained its instants and 60-minute duration. The original publication remained unchanged.
- The published team schedule and Taylor's My schedule for October 26–November 1 displayed both version-2 assignments with explicit CDT/CST labels. This verifies the modern repeated-hour publication path locally. Recovery from older snapshots without occurrence fields remains pending its own walkthrough.

### Legacy publication evidence at 12:08 UTC

- A guarded ignored fixture created a fresh valid draft through existing services and a new version-3 successor snapshot with occurrence fields deliberately omitted. The two original shift instants were verified before saving; no existing publication or request was changed.
- In Chrome, Taylor requested the 90-minute shift back to Morgan. Morgan accepted; the page explicitly retained the manager-approval requirement. A Clinic Administrator approved through Request review and saw the saved decision with an empty review queue.
- Database read-back showed the request approved at revision 3 and publication 6/version 4 superseding publication 5/version 3. The transferred shift kept 06:15Z–07:45Z and recovered first/second occurrences; the unrelated shift kept 09:00Z–10:00Z and recovered only/only. Versions 1–3 remained intact, including the occurrence-free version-3 snapshot. Team schedule displayed version 4 with Morgan's CDT–CST shift and Taylor's unchanged CST shift.
- Schedule builder's existing empty choices now visibly say No draft selected and Blank schedule; the empty draft selector is disabled. Browser read-back confirmed both defaults and the selected blank-template option. TypeScript passed. No automated tests were run.

## Availability and weekly template walkthrough

- With only the existing availability and approval settings enabled in the isolated fixture, Morgan submitted Monday 09:00–17:00 availability effective November 2, with all other days unavailable. Request history and the administrator queue displayed the same seven-day rules. Administrator approval saved revision 2.
- A November 2 draft accepted a Tuesday shift for editing, but publication correctly rejected it with Morgan Example: shift is outside recorded availability. The dialog retained the draft and Keep editing action.
- The administrator changed the shift to Monday, saved the Monday coverage template, and published successfully. Database read-back showed only publication 7/version 1 for November 2, containing the corrected 09:00–17:00 interval; the rejected Tuesday draft did not create a publication.
- Creating November 9 from the saved template produced draft 8 with Morgan's Monday 09:00–17:00 shift. Browser and database read-back matched. That next-week schedule remains a saved draft. No implementation change was needed for this journey.

## Disabled kiosk feedback and recovery

Kiosk configuration now includes the existing effective `kiosk_enabled` setting. When disabled, the page shows an unavailable message, hides new badge/camera/punch actions, and stops an active camera stream. Existing saved-request status/retry controls remain available; the server still rechecks clock settings for new challenges and punches. Check availability reloads configuration after a manager restores access. The badge administration expiry label now explicitly identifies enrollment-code expiry, which differs from the clock session lifetime.

### Local evidence at 12:28 UTC

- A temporary Main clinic enrollment was created and redeemed through the owned local browser. The one-time value stayed within browser runtime memory and was not written to notes or tool output. The enabled configuration showed an active scan field.
- An immutable local settings revision disabled the kiosk. Reload showed the unavailable message with no badge input. After a settings revision re-enabled it, Check availability restored the scan field without re-enrollment.
- The fixture returned the kiosk to disabled, and the temporary enrollment was revoked through the UI. The administrative row displayed revoked with the clarified enrollment-code expiry label. No badge was issued and no punch was created in this walkthrough.
- TypeScript and Ruby syntax checks passed. A small API regression for disabled configuration projection and challenge rejection was added but not run. Active-camera cleanup and uncertain-punch recovery were source-reviewed, not exercised in this browser walkthrough. No automated tests were run.

## Employee timecard history pagination

Employee My hours loads fifty immutable versions at a time using a cursor constrained to the authorized employee history. Appending older versions retains the newest card for each workweek and existing filters/correction draft state. Refresh, location/session changes, and unmount cancel pending history requests. Correction history can fetch its exact resulting card through the existing authorized detail endpoint when that version is outside the loaded pages.

### Local evidence at 12:46 UTC

- Morgan's 252 history-only cards loaded in browser pages of 50, 100, 150, 200, 250, then 252; the final page removed Load older timecards. Refresh returned the initial page.
- A guarded ignored fixture added fifty snapshot-only historical versions after Taylor's actual calculated version 2, without modifying the original cards, correction, or exports. These copies are pagination fixtures, not calculation or approval evidence; they have no relational time segments and correctly cannot be submitted.
- Before loading older versions, View resulting timecard fetched the actual approved version 2 and displayed nine paid hours, eight regular hours, one overtime hour, and its corrected interval. Loading the final two versions retained version 52 as the workweek's newest displayed card and changed the correction link to View resulting timecard · version 2.
- TypeScript, Ruby syntax, and scoped diff checks passed. Cursor regression coverage was added but not executed. Correction-draft retention and cancellation paths were source-reviewed; no automated tests were run.

## Schedule review before publication

Review and publish now uses the existing validation endpoint before enabling publication. It displays blocking conflicts and advisory facility-hours warnings, and binds a successful preview to the current draft, site, revision, and status. A changed saved revision has an explicit Refresh saved draft recovery path. Read requests cancel on closing, reload, location change, or unmount. Saved uncertain-publication retries retain their original request keys and do not depend on a new preview. The server still rechecks publication authorization, revision, and conflicts.

The validation endpoint now accepts same-site publish permission when manage permission is absent, matching existing draft-read access. A small publisher-only/site-isolation regression was added but not run.

### Local evidence at 12:54 UTC

- Draft 8's Monday shift passed preview with Publish enabled. Saving the same shift on Tuesday showed the recorded-availability conflict before publication and disabled Publish. No November 9 publication existed after this blocked review.
- Restoring Monday passed preview. A guarded local fixture added Monday facility hours of 10:00-16:00; review displayed the outside-hours warning for the 09:00-17:00 shift while leaving Publish enabled.
- While the browser held revision 3, a guarded call through UpsertScheduleShift changed the saved role and produced revision 4. Preview displayed the stale-draft message, disabled Recheck and Publish, and offered Refresh saved draft. That action loaded revision 4 and the changed role.
- A fresh review passed with its advisory hours warning, and browser publication succeeded. The page showed November 9 version 1 with one shift; database read-back confirmed exactly one publication for that week.
- TypeScript and scoped Ruby syntax/diff checks passed. No automated tests were run. Publisher-only access and uncertain-publication retry preservation were source-reviewed; the administrator browser journey does not establish those separate acceptance cases.

## Clock badge, punch, and revocation walkthrough

- At 12:53-12:58 UTC, a temporary badge for Morgan and a Main clinic kiosk enrollment were issued through the local UI, with kiosk temporarily enabled. Credential values stayed in browser runtime memory and were cleared after use; none were logged or persisted in notes.
- Scanning offered only Clock in. The saved punch was recovered after a browser reload as Clock in saved at 7:55:11 AM. The next scan offered only Clock out; it saved at 7:56:08 AM.
- Database read-back confirmed exactly two Morgan punches: IDs 3 and 4, clock_in at 12:55:11.008Z and clock_out at 12:56:08.572Z, both site 1 and kiosk session 2. No punches were seeded for this walkthrough.
- Revoking the badge through administration left the employee account active and caused the next scan to show Badge could not be verified. The kiosk was then revoked; reload returned Enroll this clock. Its temporary browser tab was closed and the Main clinic setting returned to disabled.
- This verifies the local scanner-input journey, receipt recovery, permitted transitions, and revocation. It does not verify physical barcode hardware, camera scanning, or a simulated uncertain network response. No implementation change was needed.
- The web TypeScript check and both Vite bundles passed after employee history and schedule preview changes. The existing marketing static/dynamic import warning remains. No automated tests were run.

## Availability boundaries and facility-hours context

Schedule validation now checks availability on each applicable effective-date segment, using each recorded policy's timezone. It honors the previous day's overnight rule, keeps unspecified policy periods unchanged, and selects the current approved replacement ahead of a superseded record sharing its effective date. Historical ties use decision time (creation time fallback) and record identity, not a per-record concurrency revision. The model splits repeated-hour intervals at timezone transitions and checks fractional civil seconds, so a clock rollback cannot hide an unavailable part of the interval.

Facility warnings now use the site's timezone, date-specific hour exceptions, configured closed/missing weekdays, and same-local-day bounds, consistent with existing calendar hours. They remain advisory and identify the affected shift interval. Repeated validation messages use separate UI keys. Availability history remains an employee/site-scoped in-memory scan; per-zone database filtering is a future scaling step.

### Local evidence at 13:14 UTC

- A guarded service fixture created unpublished draft 9 with Taylor shifts on November 16, including 15:00-09:00 overnight, while that date had a closed-hours exception. Before repair, validation returned no warnings. After repair, it returned two advisory warnings; the browser displayed both with their separate shift intervals and left Publish enabled.
- Taylor submitted Monday 22:00-06:00 availability effective November 23 through My requests. Administrator approval saved availability 2 at revision 2. Draft 10 contained Monday 22:00-Tuesday 02:00 and Tuesday 03:00-05:00. Browser review allowed both, including the early-next-day interval covered by Monday's rule.
- Taylor also submitted all-unavailable rules effective November 24. Administrator approval saved availability 3 and superseded availability 2 through November 23. Both draft shifts then showed blocking availability conflicts and disabled Publish; the cross-date shift could no longer skip validation at the handoff.
- Taylor submitted a replacement effective on the same November 24 date, with Tuesday 00:00-06:00. Administrator approval left availability 3 superseded at revision 3 and availability 4 approved at revision 2. Database validation and browser review correctly used the newly approved rules and allowed both shifts. Drafts 9 and 10 remain unpublished.
- A read-only Rails diagnostic used a 01:45 CDT-01:15 CST interval: Sunday availability 01:30-02:00 rejected the interval, while 01:00-02:00 accepted it. This is runtime calculation evidence; that repeated-hour availability case was not submitted through the browser.
- Ruby syntax, scoped RuboCop (three files), TypeScript, and diff checks passed. Small regression cases were added for prior-day coverage, allowed/blocked handoffs, same-date replacement ordering, daylight-saving rollback, fractional endpoints, and facility warnings; none were executed. No automated tests were run.

## Ending an active break after tracking is disabled

The challenge and punch-commit checks now disable only new break starts when break tracking is turned off. An employee already on a recorded break can still end it, subject to the existing current-state and challenge checks. They then see Clock out only. New or unexpected break-end events remain disallowed by the existing transition guard.

The settings scope selector also explicitly shows Practice defaults instead of a blank selected value.

### Local evidence at 13:24 UTC

- Main clinic settings revision 9 enabled the temporary kiosk and break tracking through the UI, with manual unpaid breaks explicitly selected. Browser clock-in saved punch 5 at 13:18:58.075Z; Start break saved punch 6 at 13:19:46.642Z.
- A UI-saved revision 10 disabled break tracking effective 13:20:00Z. Before repair, a fresh scan after that time showed Hello, Morgan Example and only Cancel: neither End break nor Clock out was available.
- After the two-service repair, Cancel and a fresh scan offered End break. Saving created punch 7 at 13:22:15.129Z. A subsequent scan offered only Clock out, which created punch 8 at 13:23:00.171Z. Database read-back confirmed all four events at Main clinic and kiosk session 3, in order; none were seeded.
- The temporary badge and kiosk were revoked through administration; the employee account remained active, kiosk reload required enrollment, and the tab was closed. Credential variables were cleared and Main clinic kiosk access returned to disabled. No badge/PIN value was logged or persisted in evidence.
- Browser verification confirmed Practice defaults is visible before choosing Main clinic. TypeScript, scoped Ruby syntax/RuboCop, and diff checks passed. One state-transition regression was added but not executed. No automated tests were run.

## Availability input and employee cancellation

At 13:34 UTC, the shared availability model now rejects duplicate weekdays, including mixed string/integer representations. This prevents an unavailable rule and a conflicting available rule from being approved for the same weekday. A small regression was added but not executed; queued Ruby syntax, scoped RuboCop, and diff checks passed.

Taylor submitted availability 5 for December 1 in the browser, began a separate draft, refreshed history, and canceled the saved request. The UI reported Request canceled and retained the new draft text. Database read-back confirmed availability 5 cancelled at revision 2; availability 4 remained approved at revision 2. No change was needed for this journey.

The subsequent discard-draft confirmation stalled the browser control channel. The supported dialog API, one direct dialog recovery attempt, and closing the owned tab could not clear the focus-emulation timeout. The canceled request is persisted; final draft-discard completion and later browser journeys remain unverified until browser access recovers. No browser policy or security setting was changed.

## Disabled request entry and recovery after schedule revision

The request index now projects all three request types as disabled when employee self-service is disabled at that site, while retaining eligible location and saved-history data. Swap creation checks an existing request's authorized idempotency key and matching payload before validating a new publication/target; fresh requests retain every existing eligibility and latest-publication guard.

### Local browser and database evidence at 13:50 UTC

- A new Chrome tab recovered normal browser operation; the older discard-confirmation tab remains stalled, so its draft-discard result is still unverified.
- The administrator saved Main clinic settings revision 12 with employee self-service disabled. Taylor's My requests showed all six saved requests, the existing unavailable message, and disabled Time off, Availability, Shift swap, and Submit request controls.
- A guarded local fixture restored the original enabled value as revision 13. Refreshing My requests re-enabled all three tabs. Other settings were preserved.
- Taylor submitted a November 1 03:00-04:00 CST swap to Morgan. Browser developer control intercepted only that API's Fetch response after the server returned 201, then dropped the response. The page displayed the unconfirmed outcome and retained Retry saved action. Interception was cleared immediately afterward; normal networking was restored.
- A guarded call through the ordinary schedule services copied the current October 26 week into publication 9, version 5, superseding publication 6 without changing either assignment or clock interval.
- Refreshing request history preserved the original saved retry. Retry then reported Request saved, cleared the pending action and draft, and left seven history entries. Database read-back confirmed exactly one new submitted swap at revision 1, still referencing source publication 6, alongside the two earlier approved swaps. It did not create a duplicate request or another publication.
- Queued Ruby syntax and scoped RuboCop passed for the controller and its two added regression cases. Those tests were not run. The new regression fixture schedules next week's shift so its employment effective dates precede the offered work.

## Declining a swap after availability changes

The target-decline transition now finishes before acceptance eligibility checks. Acceptance still checks expiry and target eligibility, and publication still rechecks eligibility. A refusal cannot assign coverage or create a schedule revision.

### Local evidence at 13:56 UTC

- A guarded local fixture added approved Morgan time off for November 1 03:00-04:00 CST, overlapping the offered shift on saved swap 3. This time-off approval was fixture setup, not a browser approval claim.
- Before repair, Morgan clicked the visible Decline button and received Target employee has approved time off during this shift. The request remained submitted and needed a response.
- After repair, the same browser action showed Swap declined and zero requests needing a response. Database read-back confirmed swap 3 declined at revision 2, target employment 1, decided at 13:55:20.097Z. It retained source publication 6; the week still had five publications and latest publication 9, proving decline created no successor.
- Ruby syntax, scoped RuboCop, and diff checks passed. One regression retaining blocked acceptance while allowing decline was added but not run.

## Employee-access saves keep their recovery screen

The individual access editor now registers a hard clinic navigation blocker during saving and while an access result is unconfirmed. Unsaved ordinary edits keep their existing discard confirmation. The busy message explicitly says that employee access is still saving. The suspected restore-confirmation gap was withdrawn after source review: the existing sameRoleScope check already requires active employment and account state.

### Local browser and database evidence at 14:04 UTC

- A guarded fixture used the normal LinkEmployment service to create Casey Example (employment 5, account 11) at Main clinic with the catalogued Front Desk Coordinator role. An initial attempt using the old default employee role was rejected and transactionally rolled back; the final fixture explicitly chose the catalogued role. A generated fixture password remained inside Rails process memory and was never printed or copied.
- In the browser, the administrator added Payroll journey to Casey's work sites. Only that PATCH response was held after HTTP 200. Clicking Team schedule left the browser on Employees while the save was pending.
- Dropping that response produced the unconfirmed-access message. Clicking Team schedule still left the recovery screen open. All temporary interception was cleared immediately after the dropped response.
- Check saved access confirmed the stored role and work sites. The administrator then restored Main clinic only through the UI, revoked Casey's clinic account through its explicit confirmation dialog, and successfully navigated to Team schedule.
- Read-back confirmed Casey inactive for work and login, Main clinic as the sole active work-site assignment, zero active role grants, and retained history of all three Front Desk Coordinator grants as revoked. No existing employee's role or work-site assignment was changed for this walkthrough.
- Scoped Prettier, TypeScript, and diff checks passed. The existing UI regression now includes the ordinary clinic navigation guard; it was not executed. No automated tests were run.

## Distinct access-role labels and invitation revocation

At 14:13 UTC, workforce roles retain their Workforce prefix in API role options, employee grants, and the directory fallback. The browser previously offered two distinct roles with the identical Payroll Operator label. It now distinguishes Payroll Operator from Workforce Payroll Operator and also shows Workforce Administrator and Workforce Location Manager. Role codes, grants, and authorization behavior are unchanged. TypeScript, scoped RuboCop for both API files, formatting, and diff review passed.

An independent browser journey created invitation 1 for synthetic Avery Example at Main clinic with Front Desk Coordinator. The page showed the one-time activation material without that material being read into logs or evidence. The administrator revoked the invitation through the existing confirmation dialog. Token/link fields and pending revoke actions disappeared. Database read-back confirmed revoked status at 14:07:44.918Z, a cleared token digest, no activation timestamp, and no Avery user account. No code change was required for invitation revocation.

## Invitation revoke replay

The shared onboarding service now returns an already-revoked invitation after rechecking the actor's active membership and workforce administration permission and locking the invitation. It preserves the original revocation timestamp and creates no second audit event. Pending invitations retain the ordinary revoke transition; activated invitations remain rejected.

At 14:22 UTC, a synthetic Blair Example invitation (2) was created through the UI. Developer response interception held its revoke PATCH after HTTP 200, then dropped the response. The UI retained its pending invitation action and displayed an unconfirmed-result warning. Interception was cleared. Source inspection showed retry would previously reject this already-revoked record. The service repair addresses that branch; post-repair browser replay was not completed.

One browser alert read inadvertently included the already-revoked synthetic activation link. The affected panel inspection stopped, the user was notified without repeating the value, and existing logs were preserved. No value was copied into files or Git; no independent credential rotation or evidence deletion occurred. Follow-up checks are confined to source and non-sensitive status. This is not a completed incident assessment.

Ruby syntax and scoped RuboCop passed. The existing onboarding regression now checks repeated revoke success and unchanged revocation time; it was not run. The initial lint invocation used the wrong relative resource-runner path, then the corrected invocation passed.

## Current-week calculation, correction chain, and approval recovery

At 14:39 UTC, the local browser calculated Morgan's six actual kiosk punches from this session into card 305, version 2. Its five segments split the recorded break exactly at the 13:20 UTC settings boundary. Both break segments remain unpaid. Unconfigured rounding and off-schedule work remain explicit blockers; no approval or export of that card was attempted.

A guarded local fixture added Taylor's single open clock-in punch 9 at Payroll journey on October 5 at 12:00 UTC. This punch is setup data, not a claimed kiosk event. All subsequent calculation and correction actions used the browser:

- Calculation created card 306, version 1, with missing clock out and no completed intervals. Submission and approval were unavailable.
- The administrator requested 12:00-14:00 UTC as correction 3. The UI required another reviewer. Payroll Operator approved it, producing card 307, version 2, with 120 paid/regular minutes and no exceptions.
- Payroll Operator requested correction 4 against saved manual segment 260, extending the end to 14:15 UTC while preserving the original start precision. The administrator independently approved it, producing card 308, version 3, with 135 paid/regular minutes and zero overtime/exceptions.
- The administrator submitted version 3. Its approval response was intercepted only after HTTP 200 and then dropped. The UI retained Retry saved timecard action and hid competing card actions. Retrying completed the original approval; navigation to Payroll exports succeeded and the approved version 3 was available for selection. Interception was cleared immediately after the dropped response.
- Database read-back confirmed corrections 3 and 4 approved by different reviewers from their requesters, result chain 306 to 307 to 308, card 308 approved, and the original punch 9 unchanged as clock_in at 12:00 UTC. No extra timecard version appeared from the approval retry.

No implementation change was needed for these journeys. A bounded independent source review found no further defect in the simple open-punch correction flow or the invitation replay authorization/locking change. At source 304af35a, the consolidated web build passed TypeScript and both Vite bundles; the existing marketing static/dynamic-import warning remains. No automated tests were run.

## Current-week payroll export

At 14:44 UTC, the administrator previewed approved card 308 and saved export 55 through the browser. The preview and stored CSV both contain one WF-002 / WFPAY row for October 5 with 2.25 regular and paid hours, and zero overtime. Database read-back ties the file to card 308 and confirms the SHA-256 digest matches all 140 stored bytes.

Download export 55 produced the application's explicit Download requested message. A supported browser download waiter timed out after ten seconds, and the exact expected filename was absent from the default Downloads directory. On-disk/browser-completed delivery remains unverified; no browser download policy or security setting was changed. No payments or external payroll transmission occurred.

## Denied calculation leaves no out-of-scope records

Timecard calculation and its final read-scope check now share a database transaction. A location-limited reviewer whose employee has historical work elsewhere still receives the existing permission denial, but a newly calculated card and its segments roll back instead of remaining saved. Successful authorized calculations keep their ordinary response.

### Local evidence at 15:07 UTC

- A guarded fixture created Drew Example (employment 6) with current eligibility at Main clinic and Payroll journey, plus September 28 clock punches only at Payroll journey. The reviewer received one temporary Main-only Workforce Location Manager grant (13). Read-back confirmed no practice-wide timecard read, Main read allowed, and Payroll journey read denied.
- The development sign-in picker initially selected Drew's same-named Front Desk Coordinator role rather than Morgan's combined-role entry. A context read limited to actor IDs and workforce booleans identified that fixture account. Its unnecessary fixture role grant 14 was revoked, and the explicit Front Desk Coordinator / Workforce Location Manager entry selected the intended reviewer. This was a fixture selection issue; no capability-projection change was made.
- The browser selected Drew and September 28, then Calculate returned the permission-denied message. Read-back confirmed zero Drew timecards and zero segments.
- A second guarded fixture added one Main clinic interval on October 5. The same browser reviewer calculated that week successfully into card 310, version 1, with one segment. September 28 still had no saved card. Ordinary Main clinic policy/variance exceptions remained visible.
- Cleanup through the existing access services revoked temporary reviewer grant 13 and Drew's work/login access. Drew has zero active grants; the allowed calculation and source punches remain as synthetic evidence. Existing reviewer grants were preserved.
- Ruby syntax, scoped RuboCop, and diff checks passed. One integration regression was added but not run. Its employment predates the historical punch while its current Main assignment remains unchanged.

Taylor's employee-facing My hours also showed approved current-week version 3, 2h 15m, and both correction review outcomes before the scoped reviewer walkthrough.

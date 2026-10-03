# 2026-10-03 — evaluation of all 116 Muse workflows

This is an item-by-item source/evidence evaluation, not a newly executed 116-workflow test sweep. Joshua requested evaluation of each item and had already authorized source repairs and main push. The prior repair record remains [unchanged](2026-10-03-qa-236-253-reconciliation.md).

## Inputs and observed state

- Muse's supplied 2026-10-03 register names 29 problem workflows and one systemic copy item, plus 18 explicit new-pin passing workflows. Its reported aggregate is 116 tested, 91 posted and 25 queued. That aggregate is reported evidence, not independent current-build acceptance.
- Read the live QA result database at 2026-10-03T08:42:16Z. Exactly 91 workflow snapshots contain verdict receipts on `aab93057680cb18cba5eb3b4c0cdf090446ba2ed`: 70 pass, 12 fail, 9 blocked. Another five snapshots contain expired claims, not verdicts.
- The Office mirror has 116 rows: 91 recorded verdicts, five expired claims and 20 older imported rows. Mirror row count is not a current acceptance count. This explains why different surfaces/tallies cannot be treated interchangeably.
- Confirmed the clean live pin `6d96d07184a32440a59dfb6530dad78c83e7ff65` at 2026-10-03T08:42:55Z through the authorized owner operator path, retaining the owner audit event. Fresh public QA UI shows BUILD PIN CONFIRMED and matching full live/confirmed revisions. No deployment, reset, role/key grant or verdict rewrite occurred.
- The first public-browser pin request returned HTTP accepted/proposal semantics but the UI falsely announced confirmation. New source handles proposals separately and shows the failure/action message inside the dialog.
- Dot question was persisted as room message #743, addressed to dot, authored through Joshua's existing owner account with self-reported Codex operator attribution. No authenticated Dot/Codex identity was impersonated. Dot has not replied at the last read.
- Source repair base is main `6447c121b25b0174ed6fc06627863cc2e64efc79`. It is newer than live `6d96d071`. None of these main-branch repairs is represented as deployed by the QA pin confirmation.

## Register discrepancies requiring reconciliation

1. WF-031, WF-038 and WF-040 have posted pass receipts but the register says FAIL and files #248, #249 and #250. They remain unresolved acceptance discrepancies; no receipt was overwritten.
2. WF-058, WF-061 and WF-067 legitimately have workflow pass receipts and separate defects #244, #245 and #243. A lifecycle pass does not close its defective branch.
3. WF-045 is posted BLOCKED but omitted from the problem register: recurrence is disabled by clinic policy, Weekly is disabled and no preview/series scheduling can be exercised without changing configuration. The source policy navigation repair for WF-050 is relevant; recurrence itself remains unverified.
4. The attachment reports four queued/unfiled defects, but identifies only WF-101, WF-111 and WF-116 as unfiled; care gaps already exists as #254. Preserve the reported tally and ask the QA owner to reconcile the fourth rather than inventing an ID.
5. The 25 workflows without a posted current sweep verdict are enumerated below. Eighteen have an explicit reported new-pin pass, three an explicit fail, and WF-112–WF-115 have no individual queued result in the supplied attachment. Older imported results cannot fill those four missing claims.

## Evaluation of every problem item

| Item | Reported outcome | Original defect | Evaluation and closure requirement |
| --- | --- | --- | --- |
| WF-002 | Blocked | — | Owner restriction, not a demonstrated new product failure. Reset entry exists; reset and confirmation remain unverified. Preserve the no-reset rule. |
| WF-010 | Fail | #238 | Source role-catalog/scope repair is on main. Invite a clinician and verify backend role after reload; persistence remains pending. |
| WF-012 | Blocked | #238 | Same root as WF-010. Source bulk eligibility repair is on main; active scoped selection/change/save/reload remains pending. |
| WF-014 | Blocked | #240 | Existing visit-type editor restored in source. Controls were observed locally; create and reload remain pending. |
| WF-015 | Blocked | #240 | Separate acceptance from WF-014: disable a saved type and verify it is unavailable for new booking while historical appointments remain readable. |
| WF-016 | Blocked | #240 | Offering editor restored; visit types refresh available options. Create/publish/reload remains pending. |
| WF-019 | Fail | #239 | Supported profile editor explains prerequisites; local Tobacco use change persisted at backend revision 2. Hosted acceptance remains pending. |
| WF-020 | Blocked | — | Protected insurance control displays the backend value disabled in source. This is the expected protected state; no insurance enablement is authorized or claimed. |
| WF-021 | Fail | #247 | Local out-of-week rejection, valid shift save/edit and publication observed. Source retains publication feedback. Remaining error/retry branches and hosted retest remain pending. |
| WF-028 | Blocked | — | Browser kiosk route and enrollment link exist; valid enrolled-device authentication and the production kiosk guard remain required. No hardware/device acceptance claimed. |
| WF-031 | Fail | #248 | Local merge input preserves SBX-1-092 and 001092, blocks invalid IDs and does not merge. Stored verdict says pass despite the filed defect; preserve both and reconcile with Muse. |
| WF-038 | Fail | #249 | Source projects intake-reported allergies/medications with provenance and review state. Populated intake/chart/reconciliation persistence remains pending. Stored pass does not close this defect. |
| WF-040 | Fail | #250 | Source preserves duration on start edits, blocks invalid end, restores detail reschedule action and fixes cancel guidance. Mutation/reload remains pending; stored pass conflicts with the register. |
| WF-047 | Fail | #251 | Backend arrival lateness is separate from time waiting after arrival. Seeded local lateness/wait rendering observed; fresh late-check-in confirmation remains pending. |
| WF-050 | Blocked | — | Source links the policy status to the location-authorized editor. Actual policy change/save/reload and overbook exception remain pending; defaults/authorization remain enforced. |
| WF-058 | Pass with bug | #244 | Education title/ciphertext constraint and receipt reconciliation repaired; local save/reload/same-request replay observed. Stored lifecycle pass remains historical and does not waive the education defect. |
| WF-061 | Pass with bug | #245 | Local negative cough persisted through template application, unsigned save and signing review. This preserves structured ROS; hosted retest and other systems remain pending. |
| WF-063 | Fail | #241 | Local Add procedure dialog opens after supported sandbox scope repair. Actual procedure save/reconciliation is not claimed. |
| WF-064 | Fail | #241 | Local Add immunization dialog opens. Administration configuration/evidence guards remain; actual immunization recording is not claimed. |
| WF-065 | Fail | #246 | Separate configuration cause from #241. Category setup link works; local backend revision 2 retains Tobacco use and opens a blank unscored assessment. Approved instruments/scoring and completed assessment remain separate. |
| WF-067 | Pass with bug | #243 | Empty prompts cannot be applied or falsely claim insertion; choosing a template without prompts remains available. Recovery autosave and explicit chart revision remain intentionally separate. |
| WF-069 | Fail | #242 | Source explicit stale-state reconciliation adopts the latest expected version and preserves local edits. Forced conflict/reconcile/save/reload/assign/resolve walkthrough remains pending. |
| WF-079 | Fail | #254 | New source patient Care gaps section reads the existing authorized patient-filtered recall projection. It displays due/upcoming/snoozed, exclusions, errors and a qualified empty state; no screening rules or clinical recommendations are inferred. |
| WF-089 | Fail | #236 | Local authenticated statement preview loaded correct ledger amounts and Print/save PDF control. Native print completion remains unverified. |
| WF-090 | Fail | #252 | Local authenticated receipt preview loaded and converted to a 38,003-byte PDF. Native print/save completion remains unverified. |
| WF-101 | Fail | Queued, no ID supplied | Missing verified destination raises ArgumentError in the reminder service; BaseController did not translate it. New scoped controller handler returns 422 invalid_request without weakening endpoint/consent/provider guards. Exact hosted failure trace and repaired send walkthrough remain pending. |
| WF-102 | Fail | #253 | Local new session persisted through the normal sandbox endpoint and reloaded in the session rail. Recording/consent/provider acceptance remain separate. |
| WF-111 | Partial fail | Queued, no ID supplied | Hosted reproduction identified the actual cause: DemoFrameBoundary blocks every download anchor, including authorized same-origin Blob files. The repair permits only same-origin Blob downloads in an active Sandbox with no new-window target; tour, lesson and external navigation restrictions remain. URL cleanup waits 60 seconds and request/error feedback is visible. File delivery must still be verified after the correction is published. The hidden input behind Compare saved JSON is a standard labelled file-picker pattern, not by itself proof of a dead control. |
| WF-116 | Fail | Queued, no ID supplied | Confirmed projection mismatch: public coverage reads Workspace.state while signed writes update office:qa-ledger. New source reads the existing Office QA API, shows recorded-verdict count, original revision, stale-build marker and archived observation text; no bulk import is needed for signed writes. |
| Copy quality | Systemic | #237 | Earlier source repairs cover the reported spacing/price/encoding examples and schedule copy. This is bounded evidence, not proof that every screen or helper is free of copy defects. |

## All 116 workflow IDs

Every ID appears once. Posted results retain the old full pin above. “Reported queued” describes the supplied attachment, not a persisted receipt. None is promoted to current-build acceptance here. The original defect/evidence remains authoritative for its claim.

| Workflow | Posted sweep receipt | Explicit new-pin report | Evaluation |
| --- | --- | --- | --- |
| WF-001 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-002 | blocked · aab93057 | No newer per-ID result supplied | —: Owner restriction, not a demonstrated new product failure. Reset entry exists; reset and confirmation remain unverified. Preserve the no-reset rule. |
| WF-003 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-004 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-005 | pass · aab93057 | No newer per-ID result supplied | #237 copy finding accompanies a historical pass; bounded source copy repairs do not establish screen-wide copy acceptance. |
| WF-006 | pass · aab93057 | No newer per-ID result supplied | #237 copy finding accompanies a historical pass; bounded source copy repairs do not establish screen-wide copy acceptance. |
| WF-007 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-008 | pass · aab93057 | No newer per-ID result supplied | #237 copy finding accompanies a historical pass; bounded source copy repairs do not establish screen-wide copy acceptance. |
| WF-009 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-010 | fail · aab93057 | No newer per-ID result supplied | #238: Source role-catalog/scope repair is on main. Invite a clinician and verify backend role after reload; persistence remains pending. |
| WF-011 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-012 | blocked · aab93057 | No newer per-ID result supplied | #238: Same root as WF-010. Source bulk eligibility repair is on main; active scoped selection/change/save/reload remains pending. |
| WF-013 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-014 | blocked · aab93057 | No newer per-ID result supplied | #240: Existing visit-type editor restored in source. Controls were observed locally; create and reload remain pending. |
| WF-015 | blocked · aab93057 | No newer per-ID result supplied | #240: Separate acceptance from WF-014: disable a saved type and verify it is unavailable for new booking while historical appointments remain readable. |
| WF-016 | blocked · aab93057 | No newer per-ID result supplied | #240: Offering editor restored; visit types refresh available options. Create/publish/reload remains pending. |
| WF-017 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-018 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-019 | fail · aab93057 | No newer per-ID result supplied | #239: Supported profile editor explains prerequisites; local Tobacco use change persisted at backend revision 2. Hosted acceptance remains pending. |
| WF-020 | blocked · aab93057 | No newer per-ID result supplied | —: Protected insurance control displays the backend value disabled in source. This is the expected protected state; no insurance enablement is authorized or claimed. |
| WF-021 | fail · aab93057 | No newer per-ID result supplied | #247: Local out-of-week rejection, valid shift save/edit and publication observed. Source retains publication feedback. Remaining error/retry branches and hosted retest remain pending. |
| WF-022 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-023 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-024 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-025 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-026 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-027 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-028 | blocked · aab93057 | No newer per-ID result supplied | —: Browser kiosk route and enrollment link exist; valid enrolled-device authentication and the production kiosk guard remain required. No hardware/device acceptance claimed. |
| WF-029 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-030 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-031 | pass · aab93057 | No newer per-ID result supplied | #248: Local merge input preserves SBX-1-092 and 001092, blocks invalid IDs and does not merge. Stored verdict says pass despite the filed defect; preserve both and reconcile with Muse. |
| WF-032 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-033 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-034 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-035 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-036 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-037 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-038 | pass · aab93057 | No newer per-ID result supplied | #249: Source projects intake-reported allergies/medications with provenance and review state. Populated intake/chart/reconciliation persistence remains pending. Stored pass does not close this defect. |
| WF-039 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-040 | pass · aab93057 | No newer per-ID result supplied | #250: Source preserves duration on start edits, blocks invalid end, restores detail reschedule action and fixes cancel guidance. Mutation/reload remains pending; stored pass conflicts with the register. |
| WF-041 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-042 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-043 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-044 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-045 | blocked · aab93057 | No newer per-ID result supplied | Policy-blocked recurrence: Weekly disabled, no series preview/schedule path exercised. Relevant source policy setup link restored; configuration and series persistence remain unverified. |
| WF-046 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-047 | fail · aab93057 | No newer per-ID result supplied | #251: Backend arrival lateness is separate from time waiting after arrival. Seeded local lateness/wait rendering observed; fresh late-check-in confirmation remains pending. |
| WF-048 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-049 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-050 | blocked · aab93057 | No newer per-ID result supplied | —: Source links the policy status to the location-authorized editor. Actual policy change/save/reload and overbook exception remain pending; defaults/authorization remain enforced. |
| WF-051 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-052 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-053 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-054 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-055 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-056 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-057 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-058 | pass · aab93057 | No newer per-ID result supplied | #244: Education title/ciphertext constraint and receipt reconciliation repaired; local save/reload/same-request replay observed. Stored lifecycle pass remains historical and does not waive the education defect. |
| WF-059 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-060 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-061 | pass · aab93057 | No newer per-ID result supplied | #245: Local negative cough persisted through template application, unsigned save and signing review. This preserves structured ROS; hosted retest and other systems remain pending. |
| WF-062 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-063 | fail · aab93057 | No newer per-ID result supplied | #241: Local Add procedure dialog opens after supported sandbox scope repair. Actual procedure save/reconciliation is not claimed. |
| WF-064 | fail · aab93057 | No newer per-ID result supplied | #241: Local Add immunization dialog opens. Administration configuration/evidence guards remain; actual immunization recording is not claimed. |
| WF-065 | fail · aab93057 | No newer per-ID result supplied | #246: Separate configuration cause from #241. Category setup link works; local backend revision 2 retains Tobacco use and opens a blank unscored assessment. Approved instruments/scoring and completed assessment remain separate. |
| WF-066 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-067 | pass · aab93057 | No newer per-ID result supplied | #243: Empty prompts cannot be applied or falsely claim insertion; choosing a template without prompts remains available. Recovery autosave and explicit chart revision remain intentionally separate. |
| WF-068 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-069 | fail · aab93057 | No newer per-ID result supplied | #242: Source explicit stale-state reconciliation adopts the latest expected version and preserves local edits. Forced conflict/reconcile/save/reload/assign/resolve walkthrough remains pending. |
| WF-070 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-071 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-072 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-073 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-074 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-075 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-076 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-077 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-078 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-079 | fail · aab93057 | No newer per-ID result supplied | #254: New source patient Care gaps section reads the existing authorized patient-filtered recall projection. It displays due/upcoming/snoozed, exclusions, errors and a qualified empty state; no screening rules or clinical recommendations are inferred. |
| WF-080 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-081 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-082 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-083 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-084 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-085 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-086 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-087 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-088 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-089 | fail · aab93057 | No newer per-ID result supplied | #236: Local authenticated statement preview loaded correct ledger amounts and Print/save PDF control. Native print completion remains unverified. |
| WF-090 | fail · aab93057 | No newer per-ID result supplied | #252: Local authenticated receipt preview loaded and converted to a 38,003-byte PDF. Native print/save completion remains unverified. |
| WF-091 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-092 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-093 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-094 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-095 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-096 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-097 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-098 | pass · aab93057 | No newer per-ID result supplied | Historical pass receipt retained; no new failure reported for this ID. Not a fresh pass on 6d96d071. |
| WF-099 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-100 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-101 | No posted sweep verdict | Reported fail; queued on 6d96d071 | Queued, no ID supplied: Missing verified destination raises ArgumentError in the reminder service; BaseController did not translate it. New scoped controller handler returns 422 invalid_request without weakening endpoint/consent/provider guards. Exact hosted failure trace and repaired send walkthrough remain pending. |
| WF-102 | fail · aab93057 | No newer per-ID result supplied | #253: Local new session persisted through the normal sandbox endpoint and reloaded in the session rail. Recording/consent/provider acceptance remain separate. |
| WF-103 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-104 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-105 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-106 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-107 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-108 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-109 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-110 | No posted sweep verdict | Reported pass; queued on 6d96d071 | Reported passing; signed new-pin receipt and original evidence still needed. |
| WF-111 | No posted sweep verdict | Reported fail; queued on 6d96d071 | Queued, no ID supplied: Hosted reproduction identified the actual cause: DemoFrameBoundary blocks every download anchor, including authorized same-origin Blob files. The repair permits only same-origin Blob downloads in an active Sandbox with no new-window target; tour, lesson and external navigation restrictions remain. URL cleanup waits 60 seconds and request/error feedback is visible. File delivery must still be verified after the correction is published. The hidden input behind Compare saved JSON is a standard labelled file-picker pattern, not by itself proof of a dead control. |
| WF-112 | No posted sweep verdict | Individual queued result not supplied | Unknown individual result; older import is not a substitute for the queued verdict. |
| WF-113 | No posted sweep verdict | Individual queued result not supplied | Unknown individual result; older import is not a substitute for the queued verdict. |
| WF-114 | No posted sweep verdict | Individual queued result not supplied | Unknown individual result; older import is not a substitute for the queued verdict. |
| WF-115 | No posted sweep verdict | Individual queued result not supplied | Unknown individual result; older import is not a substitute for the queued verdict. |
| WF-116 | No posted sweep verdict | Reported fail; queued on 6d96d071 | Queued, no ID supplied: Confirmed projection mismatch: public coverage reads Workspace.state while signed writes update office:qa-ledger. New source reads the existing Office QA API, shows recorded-verdict count, original revision, stale-build marker and archived observation text; no bulk import is needed for signed writes. |

## Source ownership and standards mapping

Existing clinical follow-up data and authorization remain backend-owned. Patient Care gaps reuses `Clinic::Operations::RecallWorklist` and the existing `patient_id` filter; status, plan and due dates are projected by Rails. The display qualifies its scope as recorded recall work, distinguishes excluded work from active work, and never displays an empty-state conclusion on loading, denial or read error. No screening interval, instrument, diagnosis, treatment or due-date inference was added.

Reviewed 2026-10-03: [US Core CarePlan 9.0.0 STU9, FHIR R4 4.0.1](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-careplan.html), patient/status/intent and narrative/provenance guidance; [FHIR R4 Task 4.0.1](https://hl7.org/fhir/R4/task.html), operational work tracking distinct from the clinical request/plan. The global Task resource is used only as the workflow foundation alongside U.S. Core context. No exchange partner, FHIR conformance or clinical approval is claimed. Backend patient filtering and existing scope checks remain; the UI only renders those records and links to the recorded source encounter/worklist.

## Focused verification and remaining acceptance

Scoped diff/source review covers all 30 listed problem items and every workflow's stored/reported evidence category. New source changes cover care-gap patient presentation, reminder validation response, coverage projection, pin proposal feedback, and configuration download lifecycle/feedback. Earlier local proof is referenced per item; it was not rerun or relabelled.

TypeScript, main/Office bundles, changed Ruby syntax and scoped RuboCop passed for the new source. The local patient record shows the existing saved follow-up as one due care gap, and its patient-filtered recall link opens the same plan with All selected. The local QA empty-ledger branch renders without demanding a bulk export. No tests were added or run. Native file/download/print dialogs, configured clinical recording, permissions/persistence branches listed above and all exact hosted workflow acceptance remain pending. Pin and room-message mutations have independent live readback; no clinical or financial record was changed.

Joshua subsequently authorized merging/pushing the repairs and publishing the matched revision to aimetaclinic.com. Publication uses the canonical Lightsail backup, restore-check, encrypted recovery, matched-image and hosted verification path; publication results will be recorded separately rather than inferred from a main push.

The first guarded publication completed for `463ea183d7f8a3c3a81e9007c108577d17d5ff4b`: both databases were backed up and restore-checked, encrypted recovery passed round-trip verification, matched images activated, and all 26 hosted checks passed. Hosted download reproduction then identified the blanket demo download guard as the principal WF-111 failure. A narrow correction follows; the first publication is not reported as download acceptance.

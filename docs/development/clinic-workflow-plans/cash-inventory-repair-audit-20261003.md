# Cash and inventory repair audit — 2026-10-03

Assignment: integration owner, bounded repairs and maintainability. Joshua authorized implementation and focused synthetic verification through the parent task. Preserve the complete application; the cash/inventory demonstration selects verification journeys and does not narrow product scope. This assignment does not itself grant a new production release.

Baseline: `3da3ca67355f45d10cf4980ca9c1e492dd393534`, branch `codex/cash-inventory-slice-20261003`. The diligence document was read at SHA-256 `EF5CC355E6DB0A2311AFF7486905098DFFD0C71AE8616900A77025DB4A6F28D8`. Its older source pin and CI evidence are historical, not current acceptance. Existing original QA and modernization packet counts remain unchanged.

Canonical contracts: [build and acceptance](../meta-clinic-build-and-acceptance.md), [modernization](clinic-workspace-modernization.md), [behavioral health](behavioral-health-therapy.md), and [tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md). Reuse existing patients, appointments, immutable receipts, payments, clinical tasks, contact versions, authorization and stock records. No schema or separate task engine is proposed.

## Ranked repair inventory

These are source-confirmed defects selected for repair, ordered by privacy/data safety and core workflow value. All acceptance is pending coordinated checks unless separately recorded. Counts represent distinct causes, not each affected route or assertion; the requested 100-item audit must not be padded with failures sharing a cause, suspicions, or enhancements.

| ID | Defect and affected action | Owning implementation | Acceptance requirement |
| --- | --- | --- | --- |
| FIX-01 | Obsolete contact versions used for patient lookup, recovery delivery and portal invitation | CurrentPatientContact and existing consumers | Removed/current/future contacts; obsolete queued recovery denied |
| FIX-02 | Payment allocation ignores invoice credits | AllocatePayment | Net balance cap, rollback, exact replay after later credits |
| FIX-03 | Accepted lab provenance fields discarded by HTTP assembly | LabReportsController | Organizations, method and timestamps persist; correction/replay validation |
| FIX-04 | First-available booking bypasses common capacity checks without clinician | CapacityGuard | Legal no-provider booking; closed hours, patient conflict and room/hold denial |
| FIX-05 | Source lab follow-up completion bypasses contact-task prerequisites | LabResultFollowUps | Atomic rejection with no partial completion; succeeds after prerequisites |
| FIX-06 | Staff-request task projections share reminder identity | StaffRequestTaskProjection | Separate requests/owners/completion; legacy rows preserved |
| FIX-07 | Request-owned staff tasks allow generic finalization while source remains open | TaskContinuity | Source-owned finalization only; legacy manual reconciliation preserved |
| FIX-08 | Reminder exact retry ignores appointment and expiry | Reminders::Create | Same intent replay; changed source/expiry rejected |
| FIX-09 | Reviewed invoice posting omits optimistic version | BillingDashboard | Stale revision rejected; reviewed version retained in exact retry |
| FIX-10 | Lab review receipt omits supplied follow-up due time | LabReports | Due-only changed retry conflicts and original remains unchanged |
| FIX-11 | Routine lab follow-up silently discards unsupported escalation due input | LabResultFollowUps | Explicit 422 rejection without writes; valid no-date retry; existing model/database policy preserved |
| FIX-12 | Work task transport timeout loses mutation attempt | WorkInbox | Network/408 retains key and original action |
| FIX-13 | Work navigation/removal hides unresolved mutation recovery | WorkInbox and clinic navigation | Hard SPA guard and visible explicit retry after row refresh |
| FIX-14 | Follow-up exact retry uses changed outcome/version | WorkInbox | Frozen request/version/outcome and visible recovery after refresh |
| FIX-15 | Waitlist timeout/navigation loses exact request | WaitlistWorkspace | 408/pending guard; byte-equivalent retry and release after acknowledgement |
| FIX-16 | Inventory HTTP 408 treated as definite failure | Inventory mutation recovery | Retained intent/key; deterministic rejection permits correction |
| FIX-17 | Late inventory mutation response hijacks another route | InventoryApp | Route/unmount fence; same-run busy cleanup cannot clear newer run |
| FIX-18 | Drawer reconciliation uncertainty generates fresh key | CashDrawerOperations | Explicit original-key retry with frozen note/drawer |
| FIX-19 | Drawer same-key replay accepts changed note | CashDrawersController | Normalized same note replays; changed note denied |
| FIX-20 | Default receipt lookup excludes online card payment | PaymentEventsController | Local card/cash/subscription receipt and cross-practice/role denial |
| FIX-21 | Aggregate credits hide unrelated unpaid invoice balance | PatientLedger and IncomeOutlook | Per-invoice floor before currency sum; dashboard parity |
| FIX-22 | Series preview uses original series site/clinician after occurrence reassignment | ManageSeries | Current occurrence resource checks and actual conflict denial |
| FIX-23 | Reauthentication drops valid clinic destinations | API client | Route/query retained while external redirect denied |
| FIX-24 | No-show eligibility uses wall clock instead of configured business time | frontDeskModel | Ahead/behind business-date eligibility |

The first 20 are the highest-value selected repairs. Additional listed changes share already-owned small surfaces and remain separately verified; none is complete from source edits alone. Independent review identified busy-state and cross-invoice retry issues during implementation; their correction and focused reruns must precede acceptance.

## Responsibility and preservation

Workers have separate bounded source/test packets for billing, clinical, scheduling/contact privacy, frontend recovery, Inventory helpers and CareFlow extraction. The root alone performs combined Git writes and heavy checks. Each packet has an explicit manifest in its handoff; no unrelated dirty checkout, WIP stash or historical patch is imported.

CareFlow extraction preserves all 89 original top-level declaration bodies and existing public exports/component identities. Inventory extraction retains its existing public names, routes, decimal semantics, draft identities and capabilities. Only verified duplicate helpers and imports made unused by extraction are removed. No unreachable feature deletion was established.

The frozen BH head `329298133e28ee0b4781a825d83ec839044dd06f` is already an ancestor of the integration base. Avoid duplicate cherry-picks. Its owner's 2026-10-03 handoff distinguishes completed selected engineering, local browser evidence, unverified stress/download/provider cases, and absent independent acceptance of the final ASQ/query candidate. No hosted BH acceptance follows from ancestry.

## Verification and stop conditions

Use only an independently created local PostgreSQL container `apply-cash-inventory-20261003`, port 54406, development database `apply_cash_inventory_development` and separate test database `apply_cash_inventory_test`; planned web/API ports 3260/3261. Preserve all other runtimes. Install this checkout's locked dependencies without mutating the prior owner's junction target. Queue heavy checks through agent-resources.

Run affected Ruby/API tests, focused frontend transport/browser regressions, TypeScript, both production bundles and scoped formatting/whitespace. Record actual results and exact candidate identity. Then prove the connected synthetic cash/inventory journey, denial, retry and recovery against the owning API. Intercepted component tests are separate evidence. Retain every failed attempt and baseline CI failure independently; source-only fixes do not close historical QA.

Source-confirmed remaining findings and historical CI causes belong in the audit evidence inventory, with verified, suspected, external-access and enhancement states separated. No new provider call, transaction, outreach, permission grant, credential change, shared reset or deployment is part of these checks. An unavailable external gate stays unavailable; do not label stopped/disconnected QA or Muse passed.

Checkpoint: TypeScript and both production bundles passed on the combined source, retaining the existing marketing dynamic-import warning. Initial API run: 94 tests, 900 assertions, 11 failures, five errors, no skips; eight billing API cases and four first-available capacity cases passed. Initial frontend run: 129 passed, two failed assertions, 27 skipped due to missing browser paths. Installed Chrome rerun stalled during Vite dependency optimization and fork teardown; only its verified owned process tree was terminated. All failures and queue timeouts remain evidence. A fresh API rerun and narrowly repaired, serial browser harness checks are pending; no aggregate or connected acceptance follows yet.

Runtime findings added during checks: actual patient contact removal used an unsupported `1.microsecond` helper, and PurchaseOrder's PaperTrail transient version setter cleared its domain optimistic-version column. Narrow repairs and regressions are prepared. Review also requires source-request prerequisite enforcement and retained invoice recovery across selection/status changes. The source-confirmed inventory currently has 35 deduplicated defects including remaining findings; this is not a 100-item or runtime-verification claim. The canonical tracker remains the sole live status record.


## Cloud verification handoff - 2026-10-03

Joshua requested moving heavy execution away from Windows because of machine load. No additional local tests, builds or browser jobs are authorized in this checkpoint. The shared queue's last job is finished. This branch is a transferable engineering review candidate, not accepted for main or publication. All owned source and fixtures are frozen; the root retains sole Git integration ownership.

Accepted targeted API evidence covers 97 distinct cases using unchanged-source reuse: eight billing cases from the first run, 87 passing cases from the 89-case rerun, and two repaired fixture cases rerun with 66 assertions and zero failures/errors/skips. TypeScript and both production bundles passed before subsequent test-fixture-only changes. Original failed runs remain recorded above. CareFlow preserves 89/89 declaration bodies and all public names; no feature deletion was justified.

Latest serial frontend attempt: 82 cases, 56 passed, 15 failed, 11 skipped. Provider-flow's 23 cases and 30 inventory policy cases passed. Cash-drawer startup skipped seven mounted cases; Inventory startup skipped four mounted cases. Five PatientFlow cases failed from missing Vite development JSX exports; inclusion has since been corrected but not rerun. Billing passed stale, unknown and retained cross-invoice recovery cases; nine other cases failed from cold navigation, stale response fixtures or exact timezone expectations. Those fixture/startup repairs are frozen, without weakening product guards or UI assertions. Waitlist's mounted retry case failed to render. WorkInbox's separate four-case attempt failed before expected controls appeared; dependency inclusion and fresh browser diagnostics are frozen, still awaiting rerun. Do not sum repeated attempts into distinct accepted cases.

Actual synthetic login and registration entry passed against the isolated Rails API. The complete connected journey did not finish: the next browser navigation timed out before patient registration or other domain mutation. No connected cash/payment/stock success is claimed. Local synthetic data and ignored session material remain on Windows; do not transfer authentication state or secrets. Cloud must create its own independently synthetic fixture and use supported development-session login.

Cloud lane 01a1016f-50ef-7407-81ca-4c08fd0bb0d8 owns read-only InventoryApp/CareFlow coupling, duplication and dead-code analysis against its fetched main. Do not duplicate that analysis locally. A separable verification lane can fetch this exact branch, inspect its committed diff, and run only the unresolved mounted fixtures, one worker and one browser at a time through bin/agent-resources. Install the existing lockfile only; use BROWSER_EXECUTABLE_PATH for an existing cloud browser. Startup budgets are bounded and assertion budgets unchanged.

Unresolved fixture files: apps/web/test/work-inbox-follow-up-recovery.test.tsx; waitlist-recovery.test.tsx; patient-flow-actions-recovery.test.tsx; billing-dashboard-payment-evidence.test.tsx; cash-drawer-count.test.tsx; inventory-domain-policy.test.ts. For the last file, select only the four mounted browser cases and preserve its 30 passing policy cases. No root/API changes are delegated by this verification handoff. A further implementation handoff requires exact file claims and evidence; cloud does not merge, push main or publish concurrently.

Canonical tracker remains the sole live status. The original QA campaign and fixed modernization packet counts are unchanged. Final browser acceptance, connected journey, aggregate independent acceptance and fresh whole-candidate CI remain open. Historical failed CI and stopped/disconnected external QA are not green. No production release, provider connection or external transaction is part of this handoff.

The canonical managed stop completed successfully in 7.59 seconds, stopping only this checkout's web/API/worker services and apply-cash-inventory-20261003. PostgreSQL storage, all source and verification logs were preserved; no other owner runtime was stopped.

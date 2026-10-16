# Sandbox Account Selection

## Tracker milestone connections

Reviewed 2026-10-16 against this plan’s scope and the implementation tracker. These connections identify related work and explicit dependency boundaries, not completion or new QA evidence.

| Milestone | Area | Connection in this plan |
| --- | --- | --- |
| MC-02 | Digital front door / Growth | Visitor registration and the pre-login Sandbox account picker form the entry journey. |
| MC-12 | Portal / messaging / follow-up | Patient-role entry and patient pending-write vetoes preserve portal session and recovery boundaries. |
| MC-13 | Workforce / locations | Staff-role selection preserves existing grants, revocation and site/practice authority; it does not create new workforce permissions. |
| MC-15 | Onboarding / integrations / operations | Shared demo preparation, account switching, session isolation and guarded reset/restore are the operating scope. |

## Assignment and authority

Joshua approved the additional sandbox experience item on 2026-10-02: five real seeded accounts, a picker before login, a top-bar account switcher and a guarded nightly reset at 02:00 America/Chicago. This is item 75, additional to the original 74 modernization packets. A owns integration and shared/session boundaries. Reviewed source6992ce4 was published14:43UTC. Parent created one enabled daily02:00America/Chicago automation, first2026-10-03; no duplicate host timer, actual nightly reset, new credentials or provider connection was created by A.

## Current sources and decisions

Current published source:6992ce409b014b7b7adad3eb99d77304a30a3532. Actual local production-boot clone proof completed all21stages with full289-table rollback and a second committed reset, preserving credentials/effectiveauthority/fiveactors and259protected-practice tables. The host script is installed root:root700 with SHA2561814e916bc8025e70039be74a0842f9ad3c25c77a1ba46aa6cd9ba62d1c786ee; published unadapted--check passed14:57UTC. Initial authoring base and historical evidence below remain preserved.

Base: `1f579adeca804760d27e253a8d20ff53116fa605`; isolated branch `codex/sandbox-accounts-20261002`. Reuse `SharedDemoLesson`, the existing 21 preparers, seeded staff role grants and patient portal identities. The [modernization plan](clinic-workspace-modernization.md) retains its original fixed packet scope; the [canonical tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) is the sole live status record. Applicable AGENTS, frontend-ui and clinic-workflow-planning instructions were reviewed. MUI documentation tools were unavailable; existing installed TextField, MenuItem and Dialog composition/types were reused. No new dependency. This changes demo authentication/navigation, not clinical fields, exchange data or clinical gates; no healthcare implementation guide applies to the account picker itself.

## Connected journey

Register visitor -> Open Sandbox -> choose Admin, Front Desk, Clinician, Inventory or Patient -> prepare/reuse shared synthetic clinic without an Admin login -> establish the selected real account -> show clinic or patient portal with ordinary server permissions. Account switching first asks the current iframe's existing unsaved-work blocker. Cancellation, stale frame replies, revoked actors and invalid selections preserve or deny the session. Selection stays in the server-backed browser session; clinics and account pool remain shared.

## Fields and action rules

Finite account key is the only selected field; actor, membership, practice, site and patient IDs are resolved on the server. Both entry and switching retain CSRF and Origin checks. Switching requires the current run and actor, an active prepared registered sandbox, and active seeded user/identity/grants. The iframe confirmation checks origin, exact window, request correlation, run, actor and generation; timeout fails closed. No authentication data is stored in browser storage.

## Ownership and dependency matrix references

A owns the service/controller contract, demo UI, frame/navigation confirmation and guarded host command. Existing local reviewers independently reviewed session/navigation and reset source; final acceptance remains open. Existing clinic/portal permission and lost-work contracts apply; no clinical matrix gate changes. B domain implementations remain separately owned. Reviewable commits contain at most five files.

## Implementation and acceptance

Source implemented for real account resolution, visitor-bound pre-login preparation, session rotation, role-aware iframe destination, MUI account picker and top-bar switcher, origin/source/generation handshake. The host command defaults to --check, locks against release/reset overlap, allows only apply_guided_demo, retains a dump plus hash, fully restores scratch and compares persisted counts before --run. Reset runs all21existing seed stages in one transaction and verifies unchanged account identities, credentials and effective authority. Published unadapted host--check passed; parent-owned automation is configured, not evidence of a completed nightly run.

Bounded five-role/dirty-switch observations and independent source/guard reviews exist; broader complete browser lost-work/authority coverage remains open. Authorized host recovery/fullscratchrestore, actual isolated21-stage reset/rollback and parent-owned single schedule have distinct evidence. Landing copy/discoverability remains a dedicated fixer item: deployed roles are present in a dialog afterOpenSandbox, while the entry card still says administrator access. Existing missing-marker completion protection is retained; a completed legacy run needs positive completion evidence, otherwise preparation remains creator-only. No item75completion award or future execution claim follows from scheduling.

## Checkpoint

2026-10-02 15:01UTC: parent created and A harmlessly read confirmed enabled automation6abfc7526ebc819183a055aa589b18e8, title Refresh clinic sandbox, exact DTSTART;TZID=America/Chicago:20261003T020000 and daily02:00 recurrence. It delegates to authorized Windows DESKTOP-2LUU1IF via GPT-6.1Sol, existing SSH ubuntu@aimetaclinic.com and sudo bash /opt/meta-clinic/deploy/reset-sandbox.sh --run. Windows executor uses existing release mutex/heavy queue; host flock/advisory transaction/backup handshake stay mandatory. If desktop/access is unavailable or any guard fails, skip/report without automatic retry. No key transfer/new access, duplicate schedule or host timer. Retain command receipt and recovery references; first scheduled run has not occurred. Parent-provided Cformal release review recordSHA256ab744e2e96dcc00cebfd83889815f3b266bd9f07c89077d80ea3d63b701bffdd supports original MZ12a/b/c bounded release awards72/74implemented10/74boundedvalidated;11a/b andcoverage gaps remain unfinished. Actual unadapted readiness receipt:ignored tmp/release-reconcile/published-reset-readiness-installed.json, SHA2560a2023b8d5748d9928d314ec03bdf653e8f96f7c6df9f0a897f9b391dde8655f; recovery /opt/meta-clinic/backups/sandbox-20261002T145710Z-3696853.

2026-10-02: initial TypeScript, Ruby/Bash syntax and 22 focused frontend cases passed. The missing assumed test database blocked the first backend attempt; an isolated apply_sandbox_accounts_20261002_test was created and the preparation-access regression passed 4 cases / 62 assertions. New real-account authorization/concurrency coverage passed 14 cases / 267 assertions with zero failures/errors/skips. This includes revocation, real role/site/practice denial, patient isolation, two-browser session independence and a controlled cached-session interleaving, not simultaneous HTTP timing.

Independent reviewers found and confirmed repairs for the actual run/view endpoint, clinic beforeunload-only warnings, patient hard vetoes, fresh session validation for view/resume, retained pool lock through backup, scratch ownership, coprocess descriptors, transaction-local handshake timeout and effective-authority snapshots. Reset now rejects nonrevoked expiring or future grants in both clinics before rebuilding; two new focused guard cases passed 17 assertions. Three changed Ruby files passed RuboCop. Credentials, IDs and current authority remain transactional checks; seed recreation is not allowed to extend temporal authority.

Patient pending/unknown writes expose a synchronous account-switch veto. Refill and waitlist preserve exact retries; waitlist callback uncertainty stays sticky across later rejection. Education retains exact keys, permits leaving after a definitive first rejection, and keeps an explicit exact-key retry available even after a refresh marks the material viewed. The new controlled-handler tests are scoped source interaction evidence, not a full-frame browser walkthrough. Prior affected checks: 29 frontend unit/static cases passed; six demo preparation cases passed; four appointment change cases passed; 13 billing recovery cases passed. Eight patient intake browser cases have passing evidence (seven in the initial run plus the one cold-start timeout's targeted retry); the original timeout remains recorded. New retry-navigation checks and final reviewed file hashes are retained in the checkpoint evidence artifact.

The reset protocol harness passed six mock scenarios: check-success, dump failure, restore failure, scratch collision, wrong database and overlapping invocation. Invalid earlier harness attempts and prerequisite failures remain limitations, not passes. Mock checks do not establish PostgreSQL/application restore or real 21-stage reset. No host reset, timer, deploy or publication ran. The safe host command defaults to --check and still requires the existing authorized host/configuration plus retained recoverable backup/restore proof. Original modernization scores and QA remain unchanged.

## Last run

2026-10-02; published6992ce4, installed exact guarded command and unadapted--checkPASS; parent-created single daily02:00America/Chicago automation independently read as enabled. No actual nightly run/host timer/reset now. Changed thisbrief and canonicaltracker/ProgressLog alongside already-pending modernization documentation; no UI edits. Dedicated fixer owns landing-copy/discoverability correction, to join the next reviewed bounded batch. Keep item75, original74awards, originalQA and new100-workflow exploration separate; record future execution receipts rather than claiming scheduling is execution.

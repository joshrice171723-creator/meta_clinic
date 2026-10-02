# Sandbox Account Selection

## Assignment and authority

Joshua approved the additional sandbox experience item on 2026-10-02: five real seeded accounts, a picker before login, a top-bar account switcher and a guarded nightly reset at 02:00 America/Chicago. This is item 75, additional to the original 74 modernization packets. A owns integration and shared/session boundaries. No live reset, timer, new credentials, provider connection or publication has been performed.

## Current sources and decisions

Base: `1f579adeca804760d27e253a8d20ff53116fa605`; isolated branch `codex/sandbox-accounts-20261002`. Reuse `SharedDemoLesson`, the existing 21 preparers, seeded staff role grants and patient portal identities. The [modernization plan](clinic-workspace-modernization.md) retains its original fixed packet scope; the [canonical tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) is the sole live status record. Applicable AGENTS, frontend-ui and clinic-workflow-planning instructions were reviewed. MUI documentation tools were unavailable; existing installed TextField, MenuItem and Dialog composition/types were reused. No new dependency. This changes demo authentication/navigation, not clinical fields, exchange data or clinical gates; no healthcare implementation guide applies to the account picker itself.

## Connected journey

Register visitor -> Open Sandbox -> choose Admin, Front Desk, Clinician, Inventory or Patient -> prepare/reuse shared synthetic clinic without an Admin login -> establish the selected real account -> show clinic or patient portal with ordinary server permissions. Account switching first asks the current iframe's existing unsaved-work blocker. Cancellation, stale frame replies, revoked actors and invalid selections preserve or deny the session. Selection stays in the server-backed browser session; clinics and account pool remain shared.

## Fields and action rules

Finite account key is the only selected field; actor, membership, practice, site and patient IDs are resolved on the server. Both entry and switching retain CSRF and Origin checks. Switching requires the current run and actor, an active prepared registered sandbox, and active seeded user/identity/grants. The iframe confirmation checks origin, exact window, request correlation, run, actor and generation; timeout fails closed. No authentication data is stored in browser storage.

## Ownership and dependency matrix references

A owns the service/controller contract, demo UI, frame/navigation confirmation and guarded host command. Existing local reviewers independently reviewed session/navigation and reset source; final acceptance remains open. Existing clinic/portal permission and lost-work contracts apply; no clinical matrix gate changes. B domain implementations remain separately owned. Reviewable commits contain at most five files.

## Implementation and acceptance

Source implemented for real account resolution, visitor-bound pre-login preparation, session rotation, role-aware iframe destination, MUI account picker and top-bar switcher, origin/source/generation handshake. The host command defaults to --check, locks against release/reset overlap, allows only apply_guided_demo, retains a dump plus hash, fully restores scratch and compares persisted counts before --run. Reset runs all 21 existing seed stages in one transaction and verifies unchanged account identities and credentials. No timer or host run performed.

Acceptance still requires the full account-switch browser journey, restore rehearsal on the authorized host and parent-owned single schedule after publication. Focused synthetic authorization tests and independent bounded source review are recorded below, not substituted for these gates. Existing missing-marker completion protection is retained; a completed legacy run needs positive completion evidence, otherwise preparation remains creator-only. No packet award from source alone.

## Checkpoint

2026-10-02: initial TypeScript, Ruby/Bash syntax and 22 focused frontend cases passed. The missing assumed test database blocked the first backend attempt; an isolated apply_sandbox_accounts_20261002_test was created and the preparation-access regression passed 4 cases / 62 assertions. New real-account authorization/concurrency coverage passed 14 cases / 267 assertions with zero failures/errors/skips. This includes revocation, real role/site/practice denial, patient isolation, two-browser session independence and a controlled cached-session interleaving, not simultaneous HTTP timing.

Independent reviewers found and confirmed repairs for the actual run/view endpoint, clinic beforeunload-only warnings, patient hard vetoes, fresh session validation for view/resume, retained pool lock through backup, scratch ownership, coprocess descriptors, transaction-local handshake timeout and effective-authority snapshots. Reset now rejects nonrevoked expiring or future grants in both clinics before rebuilding; two new focused guard cases passed 17 assertions. Three changed Ruby files passed RuboCop. Credentials, IDs and current authority remain transactional checks; seed recreation is not allowed to extend temporal authority.

Patient pending/unknown writes expose a synchronous account-switch veto. Refill and waitlist preserve exact retries; waitlist callback uncertainty stays sticky across later rejection. Education retains exact keys, permits leaving after a definitive first rejection, and keeps an explicit exact-key retry available even after a refresh marks the material viewed. The new controlled-handler tests are scoped source interaction evidence, not a full-frame browser walkthrough. Prior affected checks: 29 frontend unit/static cases passed; six demo preparation cases passed; four appointment change cases passed; 13 billing recovery cases passed. Eight patient intake browser cases have passing evidence (seven in the initial run plus the one cold-start timeout's targeted retry); the original timeout remains recorded. New retry-navigation checks and final reviewed file hashes are retained in the checkpoint evidence artifact.

The reset protocol harness passed six mock scenarios: check-success, dump failure, restore failure, scratch collision, wrong database and overlapping invocation. Invalid earlier harness attempts and prerequisite failures remain limitations, not passes. Mock checks do not establish PostgreSQL/application restore or real 21-stage reset. No host reset, timer, deploy or publication ran. The safe host command defaults to --check and still requires the existing authorized host/configuration plus retained recoverable backup/restore proof. Original modernization scores and QA remain unchanged.

## Last run

2026-10-02; base 1f579adeca80, initial candidate 0465e733. Review repairs and narrow new tests are grouped into bounded private commits. Checks actually run and retained failures are recorded in Checkpoint; the ignored tmp/sandbox-account-review-checkpoint.json records exact candidate/file hashes. Next: full account-switch browser walkthrough and a separate authorized host restore rehearsal. Read this brief and its canonical references before resuming, compare newer source/direction and reconcile stale assumptions before dependent edits. Keep original QA, board/finance render work and the future post-publication 100-workflow loop separate.

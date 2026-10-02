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

A owns the service/controller contract, demo UI, frame/navigation confirmation and guarded host command; C independent review is pending. Existing clinic/portal permission and lost-work contracts apply; no clinical matrix gate changes. B domain implementations remain separately owned. Reviewable groups contain at most five files: account backend (3), frame handshake (3), picker/contract/test (3), reset service/host command (2), plan/tracker (2).

## Implementation and acceptance

Source implemented for real account resolution, visitor-bound pre-login preparation, session rotation, role-aware iframe destination, MUI account picker and top-bar switcher, origin/source/generation handshake. The host command defaults to --check, locks against release/reset overlap, allows only apply_guided_demo, retains a dump plus hash, fully restores scratch and compares persisted counts before --run. Reset runs all 21 existing seed stages in one transaction and verifies unchanged account identities and credentials. No timer or host run performed.

Acceptance still requires focused backend account/permission/concurrency proof, unsaved form browser walkthrough, independent review, restore rehearsal on the authorized host and parent-owned single schedule after publication. Existing missing-marker completion protection is retained; a completed legacy run needs positive completion evidence, otherwise preparation remains creator-only. No packet award from source alone.

## Checkpoint

2026-10-02: TypeScript PASS after a frame-fixture type compatibility correction; 22/22 focused frontend cases PASS (four new confirmation cases plus existing demo route/navigation cases). Changed Ruby services/controller syntax PASS; Bash syntax PASS. First backend attempt failed before cases because the previously assumed test database did not exist; preserved as a prerequisite failure. The isolated apply_sandbox_accounts_20261002_test database was created and loaded through the heavy-resource queue; the preparation-access regression passed 4/4 cases, 62 assertions, no failures/errors/skips. Shared development runtime remains unchanged. New account experience is not accepted or counted complete.

## Last run

2026-10-02; inspected base 1f579adeca80. Implemented the bounded source groups above and updated this plan plus the canonical tracker. Checks actually run are recorded in Checkpoint. Next: finish focused backend proof, obtain C review, then isolated browser walkthrough and guarded host verification. Read this brief and its canonical references before resuming, compare current source/newer user direction and reconcile stale assumptions before dependent edits. Keep the original QA campaign and future post-publication 100-workflow loop separate.

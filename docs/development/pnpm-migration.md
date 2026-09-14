# Shared dependency store migration

The requested outcome is one content-addressed pnpm store reused by independent Meta Clinic frontend worktrees. pnpm 11.19.0 is pinned; the npm lock is imported before replacement. Application behavior and database ownership are unchanged.

The main failure risks are missing dependencies exposed by isolated linking, native packages missing with scripts disabled, stale lifecycle checks, and inconsistent CI/container installation. Frozen installs, full frontend tests/build, lifecycle tests and two separate clean installations check these paths. Every checkout keeps its own dependency links. Cross-drive copies and first-time store population are not claimed as avoided work.

Recovery uses the prior committed npm manifest/lock in a separate checkout; it does not delete the shared pnpm store or alter a running checkout. Never patch shared package files directly. Docker and CI retain frozen installs and disabled dependency scripts.

The phase-aware selector suite passed all 11 tests. Four focused lifecycle tests passed 10 assertions, covering frozen install arguments, Windows pnpm invocation, dependency markers and prewarming without database/service startup. `verifyDepsBeforeRun: error` prevents implicit installs during ordinary commands.

Clean installation and frontend execution results are pending.

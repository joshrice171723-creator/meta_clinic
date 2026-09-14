# Shared dependency store migration

The requested outcome is one content-addressed pnpm store reused by independent Meta Clinic frontend worktrees. pnpm 11.19.0 is pinned; the npm lock is imported before replacement. Application behavior and database ownership are unchanged.

The main failure risks are missing dependencies exposed by isolated linking, native packages missing with scripts disabled, stale lifecycle checks, and inconsistent CI/container installation. Frozen installs, full frontend tests/build, lifecycle tests and two separate clean installations check these paths. Every checkout keeps its own dependency links. Cross-drive copies and first-time store population are not claimed as avoided work.

Recovery uses the prior committed npm manifest/lock in a separate checkout; it does not delete the shared pnpm store or alter a running checkout. Never patch shared package files directly. Docker and CI retain frozen installs and disabled dependency scripts.

The phase-aware selector suite passed all 11 tests. Four focused lifecycle tests passed 10 assertions, covering frozen install arguments, Windows pnpm invocation, dependency markers and prewarming without database/service startup. `verifyDepsBeforeRun: error` prevents implicit installs during ordinary commands.

The local pnpm installation completed in 11m 56.5s while the shared store was being populated. A separate clean directory then installed all 165 packages with `--offline`: 165 reused, zero downloaded, 5m 17.2s. These runs were under concurrent machine load and are not a controlled npm-versus-pnpm benchmark. Windows `fsutil hardlink list` confirmed that the installed icon package shares file content with the pnpm store. Per-worktree file linking still has a measurable cost.

Managed prewarm passed in 56.82s, including runtime and API dependency checks. TypeScript and the Vite production build passed. Initial clean Linux CI exposed two tests importing undeclared `postcss`; it is now declared explicitly at the already-locked 8.5.26 version, without upgrading the package. Final frontend tests and audit are still being checked.

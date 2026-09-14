# Shared dependency store migration

The requested outcome is one content-addressed pnpm store reused by independent Meta Clinic frontend worktrees. pnpm 11.19.0 is pinned; the npm lock is imported before replacement. Application behavior and database ownership are unchanged.

The main failure risks are missing dependencies exposed by isolated linking, native packages missing with scripts disabled, stale lifecycle checks, and inconsistent CI/container installation. Frozen installs, full frontend tests/build, lifecycle tests and two separate clean installations check these paths. Every checkout keeps its own dependency links. Cross-drive copies and first-time store population are not claimed as avoided work.

Recovery uses the prior committed npm manifest/lock in a separate checkout; it does not delete the shared pnpm store or alter a running checkout. Never patch shared package files directly. Docker and CI retain frozen installs and disabled dependency scripts.

The phase-aware selector suite passed all 11 tests. Four focused lifecycle tests passed 10 assertions, covering frozen install arguments, Windows pnpm invocation, dependency markers and prewarming without database/service startup. `verifyDepsBeforeRun: error` prevents implicit installs during ordinary commands.

The local pnpm installation completed in 11m 56.5s while the shared store was being populated. A separate clean directory then installed all 165 packages with `--offline`: 165 reused, zero downloaded, 5m 17.2s. These runs were under concurrent machine load and are not a controlled npm-versus-pnpm benchmark. Windows `fsutil hardlink list` confirmed that the installed icon package shares file content with the pnpm store. Per-worktree file linking still has a measurable cost.

Managed prewarm initially passed in 56.82s, including runtime and API dependency checks. After the final manifest correction it passed in 16.23s; pnpm itself reported 3.9s. TypeScript and the Vite production build passed locally. Initial clean Linux CI exposed two tests importing undeclared `postcss`; it is now declared explicitly at the already-locked 8.5.26 version, without upgrading the package.

[CI run 34815632485](https://github.com/joshrice171723-creator/meta_clinic/actions/runs/34815632485), at commit `ddc4585`, passed the frozen pnpm install, all 43 frontend files / 322 tests, TypeScript/Vite build, and audit with no known vulnerabilities. The existing full frontend formatting baseline and unrelated backend CI failures remain. Changed migration files passed formatting, all 11 harness tests passed, and four focused lifecycle tests passed 10 assertions. The duplicate local full frontend run was stopped after its successful build in favor of the completed clean CI test run. The Dockerfile was updated but no local Docker image build or deployment was performed.

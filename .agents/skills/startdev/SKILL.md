---
name: startdev
description: Start, refresh, stop, set up, reset, or strictly diagnose the canonical APPly local development environment. Use only when the user explicitly invokes startdev, $startdev, or /startdev, or explicitly asks for the complete APPly development lifecycle.
---

# Manage APPly development

Use repository-root `bin/dev` as the only public lifecycle interface. Do not reconstruct lifecycle phases or invoke compatibility shims unless diagnosing a shim itself.

## Actions

| Request | Command and behavior |
| --- | --- |
| no action, `start`, or `up` | `bin/dev start`; migrate, start and strictly verify without Git, dependency installation or data reset |
| `restart` | `bin/dev restart`; restart checkout-owned services without resetting data or stopping PostgreSQL |
| `refresh` or `update` | `bin/dev refresh`; fast-forward a clean checkout when possible, reconcile locked dependencies, migrate, restart and verify |
| `setup` | `bin/dev setup`; install locked dependencies and prepare the guarded development database, then stop |
| `reset-data` | Only after that exact user request, run `bin/dev reset-data --yes`; replant the guarded synthetic database and leave services stopped |
| `stop` or `down` | `bin/dev stop` |
| `status` or `doctor` | `bin/dev status` |

Add `--no-browser` to `start`, `restart` or `refresh` only when requested or when the environment cannot open a browser. Reject unknown actions rather than guessing. On Windows invoke the same entry point as `ruby .\bin\dev ACTION`.

## Boundaries

- `start` is non-destructive: it performs no Git operation, installs no dependency and never seeds or replants data.
- `refresh` requires a clean named branch with an upstream. It fetches the configured remote and permits equal, ahead-only or behind-only states. Behind-only is fast-forwarded; divergence stops before services, dependencies or the database are touched. It never merges, rebases, stashes, resets, pushes or resets data.
- `setup` and `refresh` may install only versions already locked by `Gemfile.lock` and `package-lock.json`. A dependency-resolution or lockfile change is outside this lifecycle.
- `reset-data --yes` is the only destructive data action. It is hard-walled to a loopback `apply*_development` database and wholly synthetic seeds. Never infer reset authority from `start`, `restart`, `refresh`, a stale marker or a failing test.
- All commands reject `DATABASE_URL`, a non-development `RAILS_ENV`, a non-loopback `PGHOST`, an invalid database name or an invalid APPly container name.
- Do not kill a process merely because it occupies an expected port. Start and status require checkout-bound PID records and listener ownership.

Repository-changing agent use of `refresh`, `setup`, or a lifecycle repair still follows the root Story claim and change workflow. Ordinary `start`, `stop`, `restart`, and `status` do not authorize source edits.

## Readiness and traces

Treat the environment as ready only when the canonical command exits successfully. Strict readiness includes pinned Ruby, Bundler and Node versions; locked dependencies; Docker/PostgreSQL; checkout-owned listeners; no pending migrations; a live database query; and frontend/API HTTP checks.

Every lifecycle command emits an incremental metadata-only JSON trace and self-contained SVG task timeline under ignored `tmp/task-traces/`. Report the total duration, failed or slow phases and both artifact paths. Trace labels never contain credentials, environment values, raw commands, database values or user data.

On failure, preserve the reported phase and relevant bounded logs under `tmp/dev/logs`; do not substitute a manually started process and report success. Runtime mismatch, Git divergence, missing locked dependencies, pending migrations after migration, an unowned port, or a failed database/HTTP probe remains a failure until the canonical command passes.

## Handoff

Report the requested action, source branch/update result when refresh was used, database name only when reset was explicitly requested, strict final status, total duration, trace/timeline paths, and every failed or skipped phase. Local readiness is not application, security, clinical, release or deployment acceptance.

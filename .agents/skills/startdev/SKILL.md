---
name: startdev
description: Refresh and start the managed APPly local development environment from a safe Git state, or explicitly stop or diagnose it. Use only when the user explicitly invokes startdev, $startdev, or /startdev, or explicitly asks for this complete APPly development refresh.
---

# Refresh APPly development

Bring a clean checkout forward to its configured upstream, stop the repository-owned stack, rebuild the local development database from synthetic seeds, start PostgreSQL, Rails and Vite, and verify readiness. This is intentionally destructive to the selected local development database.

## Action contract

| Request | Behavior |
| --- | --- |
| no action, `start`, `up`, `restart`, or `refresh` | Run `bin/startdev-refresh`, adding `--no-browser` only when appropriate. |
| `stop` or `down` | Run `./dev_server_startup stop` only. |
| `status` or `doctor` | Run `./dev_server_startup status` only. |

Reject unknown actions rather than guessing. On Windows, invoke the root lifecycle file through Ruby, for example `ruby .\dev_server_startup stop`, and express scoped environment variables with PowerShell syntax.

## Complete refresh workflow

The checked-in `bin/startdev-refresh` helper executes these phases in order from the repository root. Use it rather than reconstructing the destructive sequence ad hoc. Stop at the first failed guard; do not continue into database cleanup after an incomplete Git reconciliation.

### 1. Inspect and reconcile Git

1. Read root `AGENTS.md`, run `bin/agent-preflight --path .agents/skills/startdev`, and inspect `git status --short` before any mutation.
2. Require a named current branch with a configured upstream. Resolve its configured remote instead of assuming `origin`, then run `git fetch <remote>` with that exact remote name.
3. Compare `HEAD` with `@{upstream}` using `git rev-list --left-right --count HEAD...@{upstream}`.
4. Continue only in one of these states:
   - equal and clean: no pull is needed;
   - behind only and clean: run `git pull --ff-only`, then recheck the status and upstream comparison.
5. Stop and report the exact state when the checkout is dirty, detached, lacks an upstream, is ahead, has diverged, cannot fetch, cannot fast-forward, or becomes dirty after the pull. Do not stash, commit, reset, clean, merge, rebase, force, switch branches, delete files, or push to reconcile it.

Record the starting and final commit IDs and whether a fast-forward occurred. A remote fetch or pull does not authorize dependency updates, deployment, hosted access, external communication, or use of real/confidential data.

### 2. Stop only the managed stack

Run `./dev_server_startup stop`. This stops only the PID-tracked APPly Rails/Vite processes and the configured APPly PostgreSQL container while preserving its volume and local credential file. Do not kill a process merely because it occupies an expected port.

### 3. Guard, clean and reseed local development

Before touching the database:

- refuse a non-empty `DATABASE_URL`;
- require `RAILS_ENV` to be unset or `development`;
- resolve the selected database as `APPLY_DEVELOPMENT_DATABASE`, defaulting to `apply_development`, and require its name to start with `apply` and end with `_development`;
- use only the repository `apps/api/bin/postgres` wrapper and its loopback connection; never use hosted credentials or a manually supplied database command.

The helper starts PostgreSQL with `apps/api/bin/postgres`, prepares migrations, then uses a Rails runner through the same wrapper to confirm all three facts from the live connection: `Rails.env.development?`, the `ActiveRecord::Base.connection_db_config` database exactly matches the guarded name, and the database host is loopback.

Only after those checks pass, run the equivalent of:

```sh
APP_SYNTHETIC_SEEDS=1 ruby bin/postgres exec env RAILS_ENV=development bin/rails db:seed:replant
```

This intentionally removes all records from the selected local development database, including manual local edits, and reapplies the ordinary plus rich synthetic seeds. It does not drop the database, test database, PostgreSQL volume, credential file, or any hosted data. Do not substitute `db:drop`, `db:reset`, destructive SQL, wildcard cleanup, or Docker volume deletion.

### 4. Start and verify

Return to the repository root and run `./dev_server_startup start`, adding `--no-browser` only when requested or when the environment cannot open a browser. Do not pass `--seed`; the database was already replanted.

Treat the refresh as successful only when the managed command reports PostgreSQL, Rails and Vite ready and `./dev_server_startup status` confirms the concise final state. If startup fails, preserve the error, inspect only relevant files under `tmp/dev/logs`, run status, and fix only a consequential in-scope lifecycle defect. Do not substitute an unrecorded manual server and report success.

## Handoff

Report the Git comparison and final commit, the exact local development database name that was replanted, the resulting service state, and any skipped or failed phase. Local readiness is not application, security, clinical, release or deployment acceptance.

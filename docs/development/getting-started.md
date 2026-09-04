# Local development

APPly is a React/Vite frontend backed by a Rails JSON API and local PostgreSQL. Use synthetic data only. The frontend listens on `127.0.0.1:3000`, Rails on `127.0.0.1:3001`, and the PostgreSQL helper on loopback port `54329`.

## Prerequisites

Use the pinned versions in `apps/api/.ruby-version`, `apps/api/Gemfile.lock`, `apps/web/.node-version` and `apps/web/package-lock.json`. Install Ruby/Bundler, Node 24, Docker, Python 3, `lsof` on macOS/Linux, and PostgreSQL 18 client tools (`psql`, `pg_dump`, `pg_restore`, `createdb`, `dropdb`, `pg_isready`).

## First setup

From the repository root:

```sh
bin/dev setup
bin/dev start
```

Open `http://127.0.0.1:3000/login` and choose **Continue as demo client** only for a fictional Test Clinic. Do not tunnel local services or put credentials, records or real/real-derived data in this workspace.

## Canonical lifecycle

Use only repository-root `bin/dev` for the combined local stack:

```sh
bin/dev start
bin/dev restart
bin/dev status
bin/dev stop
bin/dev refresh
bin/dev reset-data --yes
```

`start` and `restart` do not run Git, install dependencies or reset data. They migrate the guarded development database, launch checkout-owned services and require strict migration, database, process and HTTP readiness. `refresh` requires a clean branch and fast-forwards only; divergence stops before runtime mutation. It reconciles only locked dependencies and never auto-merges or resets data. `reset-data --yes` is the sole destructive command and replants only the selected loopback `apply*_development` database with synthetic fixtures.

Each command prints phase durations and writes a metadata-only JSON trace plus SVG timeline under ignored `tmp/task-traces/`. Use `--no-browser` with `start`, `restart` or `refresh` when needed. On Windows use `ruby .\bin\dev ACTION`. Older launchers remain compatibility shims only.

## Isolated checkouts

Each developer uses an independent checkout and database. A second local worktree must use its own `APPLY_POSTGRES_CONTAINER`, `PGPORT`, `APPLY_DEVELOPMENT_DATABASE`, `APPLY_WEB_PORT` and `APPLY_API_PORT`; never point two checkouts at one database. The detailed example lives in the API README.

The explicit `$startdev` skill delegates every action to `bin/dev`; it does not make refresh destructive. `$task-trace` measures observable task work and returns the same safe timeline format. Neither skill authorizes hosted changes.

# Local development

APPly is a React/Vite frontend backed by a Rails JSON API and local PostgreSQL. Use synthetic data only. The frontend listens on `127.0.0.1:3000`, Rails on `127.0.0.1:3001`, and the PostgreSQL helper on loopback port `54329`.

## Prerequisites

Use the pinned versions in `apps/api/.ruby-version`, `apps/api/Gemfile.lock`, `apps/web/.node-version` and `apps/web/pnpm-lock.yaml`. Install Ruby/Bundler, Node 24, Docker, Python 3, `lsof` on macOS/Linux, and PostgreSQL 18 client tools (`psql`, `pg_dump`, `pg_restore`, `createdb`, `dropdb`, `pg_isready`).

## First setup

Install the pinned package manager once: `npm install --global pnpm@11.19.0`. Frontend installs, CI and Docker use `pnpm-lock.yaml`; `ruby bin/dev prewarm` prepares an isolated worktree from the shared pnpm store without starting services. See the [frontend guide](../../apps/web/README.md) for same-drive reuse and migration details.

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

`start` and `restart` do not run Git, install dependencies or reset data. They compare the source migration versions directly with the guarded development database, run Rails migrations only when needed, launch the API and frontend, verify database and HTTP readiness without extra Rails boots, and then start the checkout-owned worker. `refresh` requires a clean branch and fast-forwards only; divergence stops before runtime mutation. It reconciles only locked dependencies and never auto-merges or resets data. `reset-data --yes` is the sole destructive command and replants only the selected loopback `apply*_development` database with synthetic fixtures.

Each command prints phase durations and writes a metadata-only JSON trace plus SVG timeline under ignored `tmp/task-traces/`. Use `--no-browser` with `start`, `restart` or `refresh` when needed. On Windows use `ruby .\bin\dev ACTION`. Older launchers remain compatibility shims only.

## Isolated checkouts

Each developer uses an independent checkout and database. A second local worktree must use its own `APPLY_POSTGRES_CONTAINER`, `PGPORT`, `APPLY_DEVELOPMENT_DATABASE`, `APPLY_WEB_PORT` and `APPLY_API_PORT`; never point two checkouts at one database. Choose unused loopback ports and a database name within the guarded `apply*_development` boundary. For example, from the second worktree on Windows:

```powershell
$env:APPLY_POSTGRES_CONTAINER = 'apply-meta-pilot-closeout'
$env:PGPORT = '54331'
$env:APPLY_DEVELOPMENT_DATABASE = 'apply_pilotcloseout_development'
$env:APPLY_WEB_PORT = '3100'
$env:APPLY_API_PORT = '3101'
ruby .\bin\dev setup
ruby .\bin\dev start
```

The container name and PostgreSQL port are part of the isolation boundary because each checkout keeps its local PostgreSQL credential file beside its source. Do not reuse another checkout's container, database, credential file, or running services. These settings affect only the current shell; set them again in a new shell or store them in a local ignored profile.

The explicit `$startdev` skill delegates every action to `bin/dev`; it does not make refresh destructive. `$task-trace` measures observable task work and returns the same safe timeline format. Neither skill authorizes hosted changes.

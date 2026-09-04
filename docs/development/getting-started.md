# Local development

APPly is a React/Vite frontend backed by a Rails JSON API and local PostgreSQL. Use synthetic data only. The frontend listens on `127.0.0.1:3000`, Rails on `127.0.0.1:3001`, and the PostgreSQL helper on loopback port `54329`.

## Prerequisites

Use the pinned versions in `apps/api/.ruby-version`, `apps/api/Gemfile.lock`, `apps/web/.node-version` and `apps/web/package-lock.json`. Install Ruby/Bundler, Node 24, Docker and Python 3. PostgreSQL 18 client tools are optional for commands run through `apps/api/bin/postgres exec`; its child-process shims route `psql`, `pg_dump`, `pg_restore`, `createdb`, `dropdb` and `pg_isready` through the local PostgreSQL container.

## First setup

From the repository root:

```sh
cd apps/api
bundle install
bin/postgres start
bin/postgres exec pg_isready -d postgres
bin/postgres exec bin/rails db:prepare db:seed
cd ../web
npm ci --ignore-scripts
cd ../..
APP_DEVELOPMENT_LOGIN=1 bin/dev
```

Open `http://127.0.0.1:3000/login` and choose **Continue as demo client** only for a fictional Test Clinic. Do not tunnel local services or put credentials, records or real/real-derived data in this workspace.

For the normal daily lifecycle, use `./dev_server_startup start|restart|stop|status` from the root. It does not install dependencies or reset the database. The lower-level `bin/dev` remains useful after PostgreSQL is already running. See the app READMEs for API/frontend-specific setup and verification.

## Isolated checkouts

Each developer uses an independent checkout and database. A second local worktree must use its own PostgreSQL container/volume, port, database names and application ports; never point two checkouts at one database. The detailed example lives in the API README.

The explicit `$startdev` skill starts a clean, synchronized local checkout without replants or destructive database resets. It requires the skill's confirmation and branch/upstream safeguards; it never authorizes hosted changes.

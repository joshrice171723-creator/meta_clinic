# APPly

One repository, two applications: a React/TypeScript frontend and a Rails JSON API. Launch/onboarding and synthetic clinic operations remain distinct product areas.

## Developers — start here

Use the [vault table of contents](APPlyVault/01%20Table%20of%20Contents.md) to choose relevant notes/sections; agent work no longer requires reading the entire vault.

For repository-changing agent work, read the root [agent contract](AGENTS.md), inspect and claim the matching Shortcut Story, then run `bin/agent-preflight --story sc-<id> --path <target>` and read the nearest nested `AGENTS.md`. The [agent harness](agent-harness/README.md) owns reusable procedures, repository skills and deterministic checks. `APPlyVault/` is the separate software knowledge base. `bin/verify-agent-harness` validates the control plane; `bin/verify-vault` validates the knowledge base.

Read the [developer documentation](docs/development/README.md) first: local setup, separate branches/databases, checks, pull requests and the release boundary. [Software Architecture](APPlyVault/03%20Execution/Software%20Architecture.md) explains where code belongs; the [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) holds Epics and Stories.

Current source is React/Vite + Rails API + PostgreSQL. The last recorded EC2 verification (2026-08-30) used the older Rails/SQLite bootstrap. Hosted PostgreSQL cutover and delivery activation are still pending in the record; this checkout is not proof of deployed state.

## Repository map

```text
apps/web/           Screens, navigation, forms, styles; independent npm build
apps/api/           Sessions, authorization, domain workflows, PostgreSQL; Rails
bin/                Local startup, verification and agent workflow helpers
ops/aws/            Infrastructure, paired releases and recovery procedures
APPlyVault/         Canonical requirements, research, decisions and tasks
agent-harness/      Agent architecture, on-demand procedures and provenance
.agents/skills/     Canonical repository skills, including Plan, Act and frontend UI
.github/workflows/  API/frontend CI and prepared delivery workflows
site/               Historical Sites metadata/assets only
```

The frontend calls `/api/*` on the same browser origin. It cannot access PostgreSQL or backend credentials. Rails owns business rules and every permission check; JSON quantities retain exact decimal strings. UI and API have separate dependencies, tests and Docker build contexts.

The founder removed the retired `reference/` folder on 2026-08-31 after its useful behavior was mapped into the app. It is not a build/runtime dependency. Rails migrations and `apps/api/db/structure.sql` are authoritative; the removed background files remain in Git history.

## Develop locally

Use the Ruby/Bundler versions from `apps/api`, Node 24, Docker, PostgreSQL 18 client tools, and `lsof` on macOS/Linux for strict listener ownership checks. The repository has one public local-development interface. From the repository root, first-time setup is:

```sh
bin/dev setup
bin/dev start
```

Normal lifecycle commands are:

```sh
bin/dev start
bin/dev restart
bin/dev status
bin/dev stop
```

`start` is non-destructive: it never runs Git commands, installs dependencies or resets data. It verifies pinned runtimes and locked dependencies, starts PostgreSQL, migrates the guarded local development database, launches Rails and Vite in the background, and returns success only after strict process, migration, database and HTTP readiness checks pass.

Use the explicit maintenance commands only for their named jobs:

```sh
bin/dev refresh
bin/dev reset-data --yes
```

`refresh` requires a clean named branch, fetches its configured remote, fast-forwards only when behind, reconciles locked dependencies, and restarts. It never auto-merges, rebases, stashes, pushes or resets data; divergence stops before service, dependency or database mutation. `reset-data --yes` is the only destructive lifecycle action and replants only the guarded loopback `apply*_development` database with wholly synthetic data.

On Windows, invoke the same canonical Ruby entry point:

```powershell
ruby .\bin\dev setup
ruby .\bin\dev start
```

Every command writes an incremental metadata-only JSON trace and self-contained SVG timeline under ignored `tmp/task-traces/`, with phase durations printed at completion. Logs rotate at 10 MiB. `APPLY_WEB_PORT`, `APPLY_API_PORT`, `APPLY_POSTGRES_CONTAINER`, `APPLY_DEVELOPMENT_DATABASE` and `PGPORT` support isolated checkouts while preserving the local-only guards.

In Codex, use `$startdev` for the canonical lifecycle and `$task-trace` to profile observable work. The task trace reports activity after trace initialization, not private reasoning or a CPU profile. Select repository skills through `/skills`; Codex does not currently register arbitrary repository-defined slash aliases. `dev_server_startup`, `bin/apply`, `bin/start-dev`, `bin/start-dev.ps1`, `bin/doctor`, `bin/doctor.ps1` and `bin/startdev-refresh` are deprecated compatibility shims that delegate to `bin/dev`; do not use them in new documentation or tooling.

The VS Code workspace tasks call `bin/dev` directly on every platform.

Open [local login](http://127.0.0.1:3000/login). The managed lifecycle enables only the loopback synthetic walkthrough. Frontend defaults to 3000 and API to 3001. No signup, patient data, live integrations or development tunnels.

- [Frontend ownership and commands](apps/web/README.md)
- [API, database and security boundaries](apps/api/README.md)
- [Architecture and extension rules](APPlyVault/03%20Execution/Software%20Architecture.md)
- [Developer workflow and CI](docs/development/README.md)
- [Hosted state](ops/aws/ec2/environments.md) and [pending PostgreSQL cutover](ops/aws/ec2/postgres-cutover.md)
- [Planning home](APPlyVault/00%20Home.md), [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) and [decisions](APPlyVault/03%20Execution/Decisions.md)

Read [AGENTS.md](AGENTS.md) and the [agent harness map](agent-harness/README.md) before agent work. Never build from the repository root or include the vault, credentials, records or logs in an image. The source split does not activate delivery or approve confidential/clinical use. Clinic UI and API remain blocked in packaged production runtime.

The local `apply_test` database was recreated with the owner's authorization after a verifier cleanup mistake; the corrected helper targets only its generated scratch database. Details and actual checks are preserved in the Progress Log.

## Files that stay local

The root `.gitignore` covers local environment/key files, database files/dumps, logs, dependencies, build output and caches across the repository. App-specific rules additionally protect Rails credentials, storage and temporary files. Source, lockfiles, migrations, schema SQL and the planning vault remain tracked. Ignore rules do not remove files already committed or make sensitive storage safe; never put real patient information or credentials in this workspace.

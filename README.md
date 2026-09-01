# APPly

One repository, two applications: a React/TypeScript frontend and a Rails JSON API. Launch/onboarding and synthetic clinic operations remain distinct product areas.

## Developers — start here

Use the [vault table of contents](APPlyVault/01%20Table%20of%20Contents.md) to choose relevant notes/sections; agent work no longer requires reading the entire vault.

For agent work, read the root [agent contract](AGENTS.md), then run `bin/agent-preflight --path <target>` and read the nearest nested `AGENTS.md`. Reusable procedures live in [agent workflow playbooks](agent-workflows/README.md); `bin/agent-check` selects verification from changed paths and `bin/verify-vault` validates vault/instruction documents. Cline receives thin path-conditional adapters from `.clinerules/`; nested `AGENTS.md` files remain the canonical cross-agent source.

Read the [CI/CD and two-developer guide](APPlyVault/03%20Execution/CICD.md) first: local setup, separate branches/databases, checks, pull requests and the release sequence. [Software Architecture](APPlyVault/03%20Execution/Software%20Architecture.md) explains where code belongs; [canonical tasks](APPlyVault/03%20Execution/Roadmap%20and%20Tasks.md) holds remaining work.

Current source is React/Vite + Rails API + PostgreSQL. The last recorded EC2 verification (2026-08-30) used the older Rails/SQLite bootstrap. Hosted PostgreSQL cutover and delivery activation are still pending in the record; this checkout is not proof of deployed state.

## Repository map

```text
apps/web/           Screens, navigation, forms, styles; independent npm build
apps/api/           Sessions, authorization, domain workflows, PostgreSQL; Rails
bin/                Local startup, verification and agent workflow helpers
ops/aws/            Infrastructure, paired releases and recovery procedures
APPlyVault/         Canonical requirements, research, decisions and tasks
agent-workflows/    On-demand implementation, data, research and release procedures
.clinerules/        Thin Cline adapters to canonical nested instructions
.github/workflows/  API/frontend CI and prepared delivery workflows
site/               Historical Sites metadata/assets only
```

The frontend calls `/api/*` on the same browser origin. It cannot access PostgreSQL or backend credentials. Rails owns business rules and every permission check; JSON quantities retain exact decimal strings. UI and API have separate dependencies, tests and Docker build contexts.

The founder removed the retired `reference/` folder on 2026-08-31 after its useful behavior was mapped into the app. It is not a build/runtime dependency. Rails migrations and `apps/api/db/structure.sql` are authoritative; the removed background files remain in Git history.

## Develop locally

Use Ruby/Bundler versions from `apps/api`, Node 24 and PostgreSQL 18 client tools. First-time setup:

```sh
cd apps/api
bundle install
bin/postgres start
bin/postgres exec pg_isready -d postgres
```

Wait for PostgreSQL to report accepting connections, then continue:

```sh
bin/postgres exec bin/rails db:prepare db:seed
cd ../web
npm ci --ignore-scripts
cd ../..
APP_DEVELOPMENT_LOGIN=1 bin/dev
```

Open [local login](http://127.0.0.1:3000/login). The optional flag enables only the loopback synthetic walkthrough. Frontend runs on 3000, API on 3001. No signup, patient data, live integrations or development tunnels. Omit the flag for ordinary provisioned accounts.

- [Frontend ownership and commands](apps/web/README.md)
- [API, database and security boundaries](apps/api/README.md)
- [Architecture and extension rules](APPlyVault/03%20Execution/Software%20Architecture.md)
- [Team/CI/release guide](APPlyVault/03%20Execution/CICD.md)
- [Hosted state](ops/aws/ec2/environments.md) and [pending PostgreSQL cutover](ops/aws/ec2/postgres-cutover.md)
- [Planning home](APPlyVault/00%20Home.md), [canonical tasks](APPlyVault/03%20Execution/Roadmap%20and%20Tasks.md) and [decisions](APPlyVault/03%20Execution/Decisions.md)

Read [AGENTS.md](AGENTS.md) before agent work. Never build from the repository root or include the vault, credentials, records or logs in an image. The source split does not activate delivery or approve confidential/clinical use. Clinic UI and API remain blocked in packaged production runtime.

The local `apply_test` database was recreated with the owner's authorization after a verifier cleanup mistake; the corrected helper targets only its generated scratch database. Details and actual checks are preserved in the Progress Log.

## Files that stay local

The root `.gitignore` covers local environment/key files, database files/dumps, logs, dependencies, build output and caches across the repository. App-specific rules additionally protect Rails credentials, storage and temporary files. Source, lockfiles, migrations, schema SQL and the planning vault remain tracked. Ignore rules do not remove files already committed or make sensitive storage safe; never put real patient information or credentials in this workspace.

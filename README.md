# APPly

One repository, two applications: a React/TypeScript frontend and a Rails JSON API. Launch/onboarding and synthetic clinic operations remain distinct product areas.

## Developers — start here

Use the [vault table of contents](APPlyVault/01%20Table%20of%20Contents.md) to choose relevant notes/sections; agent work no longer requires reading the entire vault.

For agent work, read the root [agent contract](AGENTS.md), then run `bin/agent-preflight --path <target>` and read the nearest nested `AGENTS.md`. The [agent harness](agent-harness/README.md) owns reusable procedures, repository skills and deterministic checks. `APPlyVault/` is the separate software knowledge base. `bin/verify-agent-harness` validates the control plane; `bin/verify-vault` validates the knowledge base.

Read the [developer documentation](docs/development/README.md) first: local setup, separate branches/databases, checks, pull requests and the release boundary. [Software Architecture](APPlyVault/03%20Execution/Software%20Architecture.md) explains where code belongs; [canonical tasks](APPlyVault/03%20Execution/Roadmap%20and%20Tasks.md) holds remaining work.

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

From the repository root, use the checked-in lifecycle entry point; no installer or PATH change is required:

```sh
./dev_server_startup start
./dev_server_startup restart
./dev_server_startup stop
./dev_server_startup status
```

With no command, `./dev_server_startup` performs `start`. On Windows, invoke the same file through Ruby:

```powershell
ruby .\dev_server_startup start
ruby .\dev_server_startup restart
```

`start` and `restart` launch the local Docker/PostgreSQL dependency, Rails API, and Vite frontend in the background, but return success only after all three are ready. Startup failures propagate to the command, and occupied ports are accepted only when their recorded processes belong to this checkout. `stop` stops only APPly-owned development processes and the named local PostgreSQL container; it never deletes the persistent volume or database. The lower-level `bin/apply` implementation remains repository-owned, but developers do not need to install its optional global launcher.

In Codex, invoke the explicit `$startdev` repository skill for a full local refresh: its checked-in `bin/startdev-refresh` helper requires a clean branch, fetches its configured upstream, fast-forwards when behind and merges the upstream automatically when clean local work has diverged, then stops the managed stack, replants the guarded loopback development database with rich synthetic seeds, and starts and verifies PostgreSQL, Rails and Vite. A merge conflict still stops for resolution. When the skill finds uncommitted changes, it pauses, shows the scope, and offers one local commit; it proceeds only after explicit confirmation of that scope and commit message. For a missing locked Bundler dependency, it likewise pauses and identifies the exact gem/version, registry, checksum provenance and use before offering a frozen install. It accepts only an unchanged lockfile or removal of Bundler's own checksum entry as expected metadata normalization; any dependency-resolution change still stops the workflow. Clean ahead-only local commits are retained without pushing. This intentionally deletes all records and manual edits in that local development database. Detached and no-upstream checkouts stop for human reconciliation; the skill never stashes, resets, rebases, pushes or deletes the PostgreSQL volume. Its `stop`/`down` and `status`/`doctor` subcommands remain non-resetting. Select it through `/skills`; Codex does not currently register repository skills as arbitrary slash aliases.

The platform-specific `bin/start-dev` and `bin/start-dev.ps1` files are implementation details used by the root command. Run them directly only when diagnosing that lifecycle layer; the ordinary developer interface remains `dev_server_startup`.

Pass `--seed` to `dev_server_startup start` or `restart` only when synthetic seed data is intentionally needed, or pass `--no-browser` when the browser should not open. Use `dev_server_startup status` for a concise environment diagnosis. The existing `bin/dev` remains available as the lower-level foreground launcher after PostgreSQL has already been started.

For the daily reset workflow, run `ruby .\bin\apply up --no-browser` on Windows or `ruby bin/apply up --no-browser` on macOS/Linux. `apply up` refreshes the CSV-backed dev database once per local calendar day, then starts Rails and Vite. The reset is hard-walled to the configured `apply_development` database and requires the internal refresh flag; `--no-seed-refresh` skips it for that startup. `--seed` keeps the existing explicit seed path instead of the daily refresh.

The VS Code workspace tasks select the Windows PowerShell or macOS/Linux launcher automatically.

Open [local login](http://127.0.0.1:3000/login). The optional flag enables only the loopback synthetic walkthrough. Frontend runs on 3000, API on 3001. No signup, patient data, live integrations or development tunnels. Omit the flag for ordinary provisioned accounts.

- [Frontend ownership and commands](apps/web/README.md)
- [API, database and security boundaries](apps/api/README.md)
- [Architecture and extension rules](APPlyVault/03%20Execution/Software%20Architecture.md)
- [Developer workflow and CI](docs/development/README.md)
- [Hosted state](ops/aws/ec2/environments.md) and [pending PostgreSQL cutover](ops/aws/ec2/postgres-cutover.md)
- [Planning home](APPlyVault/00%20Home.md), [canonical tasks](APPlyVault/03%20Execution/Roadmap%20and%20Tasks.md) and [decisions](APPlyVault/03%20Execution/Decisions.md)

Read [AGENTS.md](AGENTS.md) and the [agent harness map](agent-harness/README.md) before agent work. Never build from the repository root or include the vault, credentials, records or logs in an image. The source split does not activate delivery or approve confidential/clinical use. Clinic UI and API remain blocked in packaged production runtime.

The local `apply_test` database was recreated with the owner's authorization after a verifier cleanup mistake; the corrected helper targets only its generated scratch database. Details and actual checks are preserved in the Progress Log.

## Files that stay local

The root `.gitignore` covers local environment/key files, database files/dumps, logs, dependencies, build output and caches across the repository. App-specific rules additionally protect Rails credentials, storage and temporary files. Source, lockfiles, migrations, schema SQL and the planning vault remain tracked. Ignore rules do not remove files already committed or make sensitive storage safe; never put real patient information or credentials in this workspace.

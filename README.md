# APPly

One repository, two applications: a React/TypeScript frontend and a Rails JSON API. Launch/onboarding and synthetic clinic operations remain distinct product areas.

## Repository map

```text
apps/web/           Screens, navigation, forms, styles; independent npm build
apps/api/           Sessions, authorization, domain workflows, PostgreSQL; Rails
bin/                Local two-process startup and synthetic HTTP verification
ops/aws/            Infrastructure, paired releases and recovery procedures
reference/pharmacy/ Imported specifications and archived SQL; not executable app code
APPlyVault/         Canonical requirements, research, decisions and tasks
.github/workflows/  API/frontend CI and prepared delivery workflows
site/               Historical Sites metadata/assets only
```

The frontend calls `/api/*` on the same browser origin. It cannot access PostgreSQL or backend credentials. Rails owns business rules and every permission check; JSON quantities retain exact decimal strings. UI and API have separate dependencies, tests and Docker build contexts.

## Develop locally

Use Ruby/Bundler versions from `apps/api`, Node 24 and PostgreSQL 18 client tools. First-time setup:

```sh
cd apps/api
bundle install
bin/postgres start
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

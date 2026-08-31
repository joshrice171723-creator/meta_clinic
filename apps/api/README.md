# APPly Rails API

See [the repository README](../../README.md) for orientation and [Software Architecture](../../APPlyVault/03%20Execution/Software%20Architecture.md) for module ownership. Local startup and verification are below.

**PostgreSQL is now required in every application environment.** The installed EC2 bootstrap images still use SQLite pending the reviewed maintenance cutover; see [the cutover runbook](../../ops/aws/ec2/postgres-cutover.md). Existing SQLite files are preserved solely as conversion/recovery sources, never an alternative application adapter.

## Authentication and boundaries

Rails owns JSON transport, cookie sessions/CSRF, provisioned identity, clinic permissions, domain operations and PostgreSQL. The independent [frontend](../web/README.md) owns browser rendering and calls same-origin `/api/*` endpoints. Rails no longer serves application pages or CSS.

| Owner | Backend location |
| --- | --- |
| Identity | `Identity::Api::SessionsController`, `User`, `MemberSession`, `MemberAuthentication` |
| Launch | `launch/api` controllers; `Launch` models, queries and services |
| Clinic care | `clinic/care` models/controllers |
| Inventory | `clinic/inventory` controllers, serializers, queries, services and models |
| Staff | `clinic/staff` directory model/controller |
| Tenancy | `Clinic::Practice`, `Clinic::Membership` |
| Integrations | `Integrations::Fda::NdcDirectory` — public metadata only |
| Synthetic fixtures | Guarded `Development` services |

`ApplicationController < ActionController::Base` intentionally retains session and CSRF middleware. JSON-only transport does not justify dropping either. No broad CORS, browser bearer token or frontend database connection is configured. Mutations require CSRF; Origin validation, account/membership checks, no-store responses and production guards remain server-side. UI capability flags are presentation hints, never authorization.

Backend route contracts live in `test/architecture/routes_contract.json`; browser types live in `apps/web/src/api/contracts.ts`. Add explicit serializer fields, update consuming types and test both sides together. Keep decimal quantities as strings, and do not expose unrestricted record attributes. `/api/paperworks/:id/receipt` is an authenticated text attachment; `/up` is process health.

Clinic data is a non-production synthetic prototype. Separate prefixed tables, permissions and composite constraints are not production tenant-isolation approval. Staff-directory entries do not grant login access, and consultancy administration grants no clinic access.

The pharmacy module at `/clinic/pharmacy` uses a shared office/pharmacy ledger, exact typed quantities, lot/location balances, separate receipt provenance/costs, overlapping holds, count observations/approvals and versioned synthetic configuration. Database constraints/triggers enforce clinic/actor references, exact units, nonnegative stock and protected history. Receipt retries do not repost stock. Catalog changes retain actor/field metadata. Action permissions distinguish catalog, receipt, adjustment, hold, release, count and configuration. Existing package history is retained without reinterpretation. `db/structure.sql` is the canonical PostgreSQL schema; `reference/pharmacy/schema.sql` remains an unexecuted reference proposal.

`Integrations::Fda::NdcDirectory` performs only explicit public-directory searches over HTTPS, with time/size limits and controlled query fields. The lookup is rate-limited per account; no API key, background polling or bulk ingestion is configured. Responses are escaped as text. Signed import references expire after 20 minutes and are bound to the initiating clinic/account; public results cannot choose local ownership or add stock. See [the source-folder README](../../reference/pharmacy/README.md) for supported features and intentional exclusions.

## Production runtime configuration

The selling/onboarding application needs:

- `RAILS_ENV=production`
- `APP_DEPLOYMENT_ENV=staging` or `production` (missing defaults to production, with demos off)
- `APP_SITE_ORIGIN`: exact HTTPS origin, without path, credentials, query or fragment
- `SECRET_KEY_BASE`: fresh strong secret, managed outside source/chat
- `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY`
- `ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY`
- `ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT`
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`: explicit PostgreSQL connection settings; production rejects missing values and obsolete `DATABASE_PATH`

No cross-origin frontend configuration is required. The edge proxy routes `/api/*` and `/up` to private Rails, and allowed page/static requests to the independent web container. Never copy local keys/databases into staging. Preserve independent encryption-key backups and prove restore; losing keys loses encrypted content. Use an approved secret-handling workflow, never paste values into the vault, Git, or agent output.

The Linux amd64 container is verified with separate PostgreSQL 18 storage, a 500 MiB Rails limit and 256 MiB database limit. The verifier exercises TLS, production guards, encrypted writes, restart, PostgreSQL restore/decryption and restricted runtime privileges. Hosted PostgreSQL cutover remains separate from this local evidence. Keep a trusted HTTPS terminator and loopback-only/private networking; never expose Puma or PostgreSQL publicly.

Migrate explicitly with the maintenance identity, then apply `db/runtime_privileges.sql`; server startup does not run migrations. The runtime role cannot create schema, truncate tables or rewrite protected history. The owner can still bypass controls, and actor attribution does not establish a trusted security identity. RLS, independent read audit, MFA, operational key management and the complete clinical isolation architecture remain unimplemented. Keep one application process until process-local rate limits are replaced and scaling is reviewed.

The local demo shortcut is denied in production regardless of its flag. **All clinic routes are also denied in production regardless of account or flag.** This is a release boundary, not a compliance certification or sufficient real-data safeguard.

## Release work remaining

Operator activation/recovery delivery, MFA, audit/monitoring, scoped confidential-data permissions, reviewed packet/content, real signatures, PDF/institution pipeline, private media, notices/retention, encrypted backup/restore, clinical workflow review and full access-isolation assessment remain open. No PHI, real applicant records, public release or AWS resource provisioning is authorized by this README.

## Separate staging and production

Both private EC2 environments are running; see the [environment runbook](../../ops/aws/ec2/environments.md). Production seeds no samples, assigns no demo paperwork, filters existing demo documents/sample guides from all portal access and rejects demo signing. Staging retains synthetic portal content but uses ordinary provisioned login. Neither deployed environment enables clinic routes or the local login shortcut. The root delivery workflows are prepared but await GitHub authentication/configuration and publication; no automatic deployment is active yet.

## Local PostgreSQL and conversion checks

Install PostgreSQL 18 client tools (`psql`, `pg_dump`, `pg_restore`, `createdb`, `dropdb`) and use the pinned Ruby/Bundler versions. On macOS `brew install libpq` supplies them; add its `bin` directory to PATH for the current shell. `bin/postgres start` creates a loopback-only PostgreSQL 18.6 container with a persistent named volume and a generated ignored mode-0600 local password file. `bin/postgres exec COMMAND...` passes the secret without printing it. Do not delete that file while retaining the database volume. This helper is local/synthetic only and never resets data.

```sh
# From the repository root:
cd apps/api
bundle install
bin/postgres start
bin/postgres exec bin/rails db:prepare db:seed
# API only; the frontend runs separately on 3000:
bin/postgres exec env APP_DEVELOPMENT_LOGIN=1 bin/dev
# Run these separately (not `db:prepare test` in one Rails process):
bin/postgres exec env RAILS_ENV=test bin/rails db:prepare
bin/postgres exec bin/rails test
bin/postgres exec env RAILS_ENV=test bin/rails zeitwerk:check
bin/postgres exec bin/verify-postgres
bin/postgres exec bin/rails inventory:verify
bin/rubocop
bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error
bin/bundler-audit check --update
```

`bin/verify-postgres` creates uniquely named scratch databases, generates an independent synthetic legacy SQLite fixture, imports all legacy tables with value reconciliation, migrates forward, tests simultaneous writes/retries and restores a PostgreSQL dump. It removes only its own scratch databases. `bin/import-legacy-sqlite --synthetic SOURCE_BACKUP` is a one-time maintenance tool requiring an explicit empty PostgreSQL target at migration 004; it never reads an existing source automatically. See the cutover runbook before using it. Preserve existing SQLite files and matching encryption keys until an authorized migration and recovery check succeeds.

Use repository-root `bin/dev` to start both apps after frontend `npm ci --ignore-scripts`. Root `bin/verify-web` checks the real local proxy/API with an explicit generated scratch PostgreSQL database; it uses single-target `createdb`/`dropdb`, isolates companion test settings and never uses Rails' multi-database cleanup task.

Open [local login](http://localhost:3000/login) and explicitly choose **Continue as demo client**. Each entry creates an isolated fictional Test Clinic and demo launch document. Navigation never creates a session; there is no clinic picker or public signup. Do not expose or tunnel the development server. Normal accounts use the interactive `members:create` task after payment confirmation; assisted password reset revokes sessions. No email delivery or payment automation is implemented.

## Refactor compatibility

The Ruby application module remains `Backend::Application`. Tables, migrations, database names, session cookie and encryption derivation are preserved. Browser URLs moved to the frontend; clinic JSON endpoints now live beneath `/api/clinic`. Native page controllers/views and compatibility symlinks were retired. Ignored runtime data/keys moved with Rails, and the PostgreSQL bind path now uses `apps/api` with the same persistent storage identity. Existing development records were not reset.

The generated nested `.github/dependabot.yml` remains dormant; moving it to repository-root would enable scheduled work and is not part of this refactor. Active CI/release workflow definitions live only in repository-root `.github/workflows/`.

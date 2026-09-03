# APPly Rails API

See [the repository README](../../README.md) for orientation, [developer documentation](../../docs/development/README.md) for workflow, and [Software Architecture](../../APPlyVault/03%20Execution/Software%20Architecture.md) for module ownership. Local startup and verification are below.

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

The pharmacy module at `/clinic/pharmacy` uses a shared office/pharmacy ledger, exact typed quantities, lot/location balances, separate receipt provenance/costs, overlapping holds, count observations/approvals and versioned synthetic configuration. Database constraints/triggers enforce clinic/actor references, exact units, nonnegative stock and protected history. Receipt retries do not repost stock. Catalog changes retain actor/field metadata. Action permissions distinguish catalog, receipt, adjustment, hold, release, count and configuration. Existing package history is retained without reinterpretation. `db/structure.sql`, generated from `db/migrate/`, is the canonical PostgreSQL schema. The founder removed the former reference proposal; no runtime or migration depends on it.

`Integrations::Fda::NdcDirectory` performs only explicit public-directory searches over HTTPS, with time/size limits and controlled query fields. The lookup is rate-limited per account; no API key, background polling or bulk ingestion is configured. Responses are escaped as text. Signed import references expire after 20 minutes and are bound to the initiating clinic/account; public results cannot choose local ownership or add stock. See [Clinic Workspace](../../APPlyVault/03%20Execution/Clinic%20Workspace.md) and [PostgreSQL and Inventory Foundation](../../APPlyVault/03%20Execution/PostgreSQL%20and%20Inventory%20Foundation.md) for supported features and intentional exclusions.

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

The local demo shortcut is denied in production regardless of its flag. Clinic routes are denied in production and to ordinary hosted accounts. Current source has one explicit exception for the managed `StagingDemoUser` identity when `APP_DEPLOYMENT_ENV=staging`; it still requires an active exact clinic assignment and server-enforced permissions. This is a bounded synthetic review release, not a compliance certification or sufficient real-data safeguard.

## Release work remaining

Operator activation/recovery delivery, MFA, audit/monitoring, scoped confidential-data permissions, reviewed packet/content, real signatures, PDF/institution pipeline, private media, notices/retention, encrypted backup/restore, clinical workflow review and full access-isolation assessment remain open. No PHI, real applicant records, public release or AWS resource provisioning is authorized by this README.

## Separate staging and production

Both EC2 environments are running; see the [environment runbook](../../ops/aws/ec2/environments.md). Production seeds no samples, assigns no demo paperwork, filters existing demo documents/sample guides from all portal access and rejects demo signing. Staging retains synthetic portal content and uses ordinary provisioned login behind the authenticated review edge. Current source prepares one isolated managed clinic for `StagingDemoUser`; hosted evidence is recorded separately after matched-pair delivery and exact-candidate review. Production and the local login shortcut remain denied. Main CI drives automatic staging delivery; production delivery remains separately inactive.

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

For reusable local personas, run `APP_DEVELOPMENT_LOGIN=1 bin/postgres exec bin/rails members:prepare_test_accounts` in your own development database, then start the app with the same flag. The local login selector offers Test Client A, Test Client B, Test Admin (inquiry inbox, no clinic), Test Disabled (expected denial), and OmniLogin. Omni's existing clinic is populated in place with the rich patient, appointment, encounter, vital-sign and SOAP scenarios described below; it is not reassigned to a backend-review clinic. Client progress and separate test clinics persist across visits; repeated setup preserves existing state and refuses identity conflicts. No passwords are issued, and these profiles cannot use ordinary password login or hosted shortcuts. Sessions have an absolute 12-hour maximum, including legacy sessions originally issued with a longer expiry. See [Client Access Workflow](../../APPlyVault/03%20Execution/Client%20Access%20Workflow.md) for accepted structure and remaining production gates.

## Refactor compatibility

The Ruby application module remains `Backend::Application`. Tables, migrations, database names, session cookie and encryption derivation are preserved. Browser URLs moved to the frontend; clinic JSON endpoints now live beneath `/api/clinic`. Native page controllers/views and compatibility symlinks were retired. Ignored runtime data/keys moved with Rails, and the PostgreSQL bind path now uses `apps/api` with the same persistent storage identity. Existing development records were not reset.

The generated nested `.github/dependabot.yml` remains dormant; moving it to repository-root would enable scheduled work and is not part of this refactor. Active CI/release workflow definitions live only in repository-root `.github/workflows/`.

## Final backend verification and synthetic scenarios

The [backend verification report](../../APPlyVault/03%20Execution/Backend%20Verification%20Report.md) maps all 68 ERD entities and 103 diagram edges, records tests and corrections, and identifies the remaining security/clinical gaps. The current backend is synthetic-only; field names beginning with `encrypted_` do not yet establish encryption, and operation/read auditing remains incomplete.

For richer local scenarios, explicitly opt in on your own development database:

```sh
APP_SYNTHETIC_SEEDS=1 bin/postgres exec bin/rails db:seed
bin/postgres exec bin/verify-backend
```

Seeds create two synthetic organizations/practices, 60 richly populated patients, 36 accounts across administrator, clinician, staff, inventory, billing and read-only roles, four sites with eight rooms, historical/upcoming visits, vital signs, versioned SOAP drafts/signatures and related document/message/invoice/office-stock examples. Each role has two active identities and one intentionally inactive membership per clinic. Registration examples include demographics, phone/email contacts, emergency contacts, communication preferences, social history and a non-deliverable synthetic address. They preserve existing scenario edits, inactive memberships and revoked grants on rerun. No document objects, real messages or payment processing exist.

Passwords are random and never printed. Use the existing interactive `members:reset_password` task for a selected address such as `synthetic-review-a-admin@example.invalid`, `synthetic-review-a-clinician-2@example.invalid`, or another listed role/account when manually testing. No new login shortcut is enabled. Ordinary and production seeds create no clinic examples. Patient commercial membership, patient deletion, vital-sign deletion and post-signature addendum endpoints are not currently implemented; the fixtures do not simulate those missing transitions.

`bin/verify-backend` creates its own uniquely named test database, tests true concurrent allocations/addresses/bookings/revisions and restricted runtime history/catalog grants, then removes only that database and its unique temporary no-login role. Run it through `bin/postgres exec`, with PostgreSQL client tools on PATH. Tests require `RAILS_ENV=test`; never point them at an existing development/hosted database. Migration `20260831000800` adds identity/history/index/reservation guards without editing prior migrations. It is forward-only and has not been applied to existing development or hosted databases; review backups, locks and legacy access-equivalence before any cutover.

## CSV-backed dev seed data

`ruby bin/apply up` refreshes `db/seed_data/bulk_v1` once per local calendar day after PostgreSQL is ready. The refresh truncates the explicitly discovered application tables, preserves Rails metadata tables, and refuses any database other than the configured `*_development` database. Use `ruby bin/apply up --no-seed-refresh` to skip the reset for one startup. The lower-level task is `APP_DEV_SEED_REFRESH=1 bundle exec rails dev:refresh_seed` and is guarded by the same database checks.

Regenerate the checked-in CSV bundle with:

```sh
ruby script/generate_bulk_seed_csv.rb
```

The bundle contains 100 patients, 220 visits, 220 invoices with five lines each (1,100 `clinic_invoice_lines`), 100 office items, 100 pharmacy products, 200 pharmacy batches and receipts, plus payments, coverage versions, credits, refunds, claims, role grants and inventory adjustments. Records are dated across the prior 90 days. Invoice balances exercise draft, void, paid, partial and open views; paid/partial/open are represented by posted invoices with their corresponding allocation balances.

The user rows include `omni@test.com`, `admin@test.com`, `clinician1@test.com`, `clinician2@test.com`, `staff1@test.com`, `staff2@test.com`, `inventory1@test.com`, `inventory2@test.com`, `billing1@test.com`, `billing2@test.com`, `frontdesk@test.com`, `reader@test.com`, and an inactive `disabled@test.com`. The Omni account uses the existing local development account verifier; the other active role accounts use the deterministic local password form `ApplyDev-<user_key>-2026!`. These addresses are for the local dev database only. See [`db/seed_data/bulk_v1/README.md`](db/seed_data/bulk_v1/README.md) for the CSV map and integrity rules.

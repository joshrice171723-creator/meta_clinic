# Rails API agent instructions

These instructions apply to `apps/api/` and extend the repository root contract.

## Ownership and boundaries

- Rails owns authentication, authorization, tenancy, domain workflows, exact quantities, persistence and PostgreSQL access. Controllers translate HTTP; operations own transactions; scoped queries own complex reads.
- Keep the established Launch, Identity and `Clinic::{Care, Inventory, Staff}` boundaries. Do not create catch-all `utils`, `common` or `manager` layers.
- Recheck active account, practice ownership and action permission on every protected read/write. Browser capability flags and query objects are not authorization gates.
- Keep session, CSRF and Origin protections. Do not add browser tokens, broad CORS or client-supplied actor/tenant authority.
- Use wholly synthetic records. Packaged clinic routes remain denied until separately authorized release gates are satisfied.

Read the applicable `Software Architecture.md` domain/audit sections and [developer documentation](../../docs/development/README.md) before changing code; app-specific commands below remain authoritative.

## PostgreSQL and migrations

- Migrations and generated `db/structure.sql` are the executable schema. Illustrative vault SQL and removed reference material are not alternatives.
- Use forward migrations. Do not edit shared applied migrations, reset an existing database, discard history or rewrite data without explicit transition authority.
- Review the generated structure diff and preserve exact decimal handling, tenant keys, immutable history and database constraints.
- `bin/postgres` manages persistent local storage and never deletes it. Verification helpers may remove only their explicitly generated scratch databases.
- Never run an unqualified development `rails db:drop`, `db:reset`, destructive SQL or wildcard database cleanup. Follow [`../../agent-harness/workflows/database-change.md`](../../agent-harness/workflows/database-change.md).

## Auditing and protected values

- Follow the selected PaperTrail contract in `Software Architecture.md`; explicit model opt-in does not prove complete auditing.
- Derive actor, practice and correlation metadata server-side. Never record credentials, raw sessions or protected values in versions, exceptions or diagnostics.
- Test callback, service, job and bypass paths that mutate audited records. Reads, denials, exports and external-object outcomes need complementary evidence.
- A field named `encrypted_*` is not evidence that encryption is implemented or accepted.

## Checks

Run the smallest relevant set, expanding for boundary changes:

```sh
bin/postgres exec env RAILS_ENV=test bin/rails db:prepare
bin/postgres exec bin/rails test
bin/postgres exec env RAILS_ENV=test bin/rails zeitwerk:check
bin/rubocop
bin/brakeman --quiet --no-pager --exit-on-warn --exit-on-error
bin/bundler-audit check --update
```

For schema, concurrency, migration, authorization or history changes also run:

```sh
bin/postgres exec bin/verify-backend
bin/postgres exec bin/verify-postgres
```

For API contracts consumed by the browser, update serializers/types and both sides' tests together, then run root `bin/verify-web`. Do not claim a check passed unless its prerequisites were available and the command actually ran.

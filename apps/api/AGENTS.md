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

Use the root active-development policy and phase-aware selector. Ordinary component work runs impacted Rails tests and changed-file RuboCop:

```sh
python -B ../../bin/agent-check --phase final --staged --path apps/api --level component --run
```

For authorization, session, routing, schema and cross-domain changes, run focused tests of the affected behavior and required migration correctness. Reserve `integration` and these broad verifiers for an explicitly selected stable milestone or prelaunch:

```sh
bin/postgres exec bin/verify-backend
bin/postgres exec bin/verify-postgres
```

Bundler Audit is selected only for `Gemfile` or `Gemfile.lock` changes; existing CI retains broader checks in the background. Update both sides of browser-consumed contracts and verify the changed interaction without automatically launching the full transport suite. Do not claim a check passed unless it ran with its prerequisites.

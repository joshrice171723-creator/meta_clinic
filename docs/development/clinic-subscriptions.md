# Clinic subscription development workflow

The implementation uses the existing Rails identity, clinic authorization, audit and billing ledger. [Meta Clinic Implementation Tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) owns implementation coordination. [Dated build evidence](../../records/clinic-subscriptions/2026-09-05-local-build.md) separates source, tests, browser results and approval gaps.

## Local walkthrough

1. Follow [the development setup](README.md). Run the additive migrations through `ruby bin/dev start --no-browser` from the repository root. Do not reset a populated database for this feature.
2. If the established Omni clinic already exists, prepare only its assigned patient from `apps/api/`:

   ```powershell
   $env:APP_DEVELOPMENT_LOGIN = '1'
   ruby bin/postgres exec bin/rails members:prepare_patient_account
   ```

   This creates or verifies the reserved patient fixture and connects it to the existing Omni clinic's first dev seed patient, creating one independently invented patient if none exists. It does not alter historical Omni roles or replant inventory. Conflicting or disabled accounts fail closed; no password is printed or reset.
3. Use **OmniLogin**, then **Clinic → Subscriptions**. Create a custom family and reusable service, then a package. Configure terms and service-selection rules, save, preview and publish.
4. Sign out and choose **Open assigned patient portal**. Review a package, select valid services, request the server quote and confirm the purchase. The invoice and selected terms are saved by Rails. **Open Omni patient portal** is preview-only and cannot purchase.
5. Request the local test payment. It remains processing until a clinic billing operator delivers a signed fixture outcome. Sign in as Omni, open **Billing → Subscription billing**, expand the purchase, and select the appropriate test outcome. Unknown results require reconciliation before another attempt.
6. Return as the assigned patient. The subscription, invoice, payment, balance and receipt reflect the same posted ledger. Cancellation records its effective date. Staff can perform a full remaining fixture refund where the purchased policy allows it.

For an existing cash/manual payment, use the patient ledger and record payment through its normal workflow. **Activate from posted payment** requires exact full allocations with no credits/refunds and creates no second payment. Cash refunds remain in the existing cash workflow.

## Configuration and publication

When multiple agents are running, give each agent a separate development database and test database. Docker isolates the PostgreSQL server from the host; separate database names isolate agent data inside that server. Set `APPLY_DEVELOPMENT_DATABASE` before starting the agent's Rails process and `APPLY_TEST_DATABASE` before its tests. Use distinct API/frontend ports through the existing `APPLY_API_PORT` and `APPLY_WEB_PORT` settings. A second source worktree alone does not change those database defaults. Clone dev seed data with a read-only `pg_dump` and restore into a newly created, explicitly named database; never reset the shared development database for a walkthrough. Preserve task-owned databases for review, or remove only their exact names after stopping their own processes.

- Family, service, package and tier names are ordinary clinic-defined data. A package version snapshots all display names, services, prices and conditions.
- Choose-one groups require exactly one selection. Choose-many groups share a minimum/maximum; included services are automatic, optional services may be omitted. The backend enforces the same rules at quote and checkout.
- Prices are positive exact decimals with two fractional digits. Extra service prices are nonnegative. The existing ledger's two-decimal currency policy is retained; currencies requiring different minor units need a reviewed extension.
- Availability limits new purchases. A term begins on verified payment activation. Read-time state evaluation expires it at the recorded end date. End-of-term cancellation preserves access until that timestamp; immediate cancellation ends access immediately.
- Publication requires `subscription_catalog.publish`; drafts require `subscription_catalog.write`; browsing requires `subscription_catalog.read`. Eligibility approval requires `subscriptions.review`. Payment/recovery actions require the existing billing payment capability. Publishing authority does not grant payment authority.
- Retirement removes a family/package from new purchase availability. Retiring a reusable option blocks its use in later publications; an already-published immutable package retains its earlier definition. Retire its package to stop further sales of that definition.

## Verification and recovery

Joshua subsequently authorized a light focused test pass for the Stripe membership continuation. See [Stripe monthly membership setup](stripe-memberships.md) for the current provider and manual acceptance boundaries; the commands below also describe the older fixture workflow.

From `apps/api/`, using a prepared isolated test database:

```powershell
$env:RAILS_ENV = 'test'
$env:APPLY_TEST_DATABASE = 'apply_sc246_test'
ruby bin/postgres exec bin/rails test test/services/clinic/subscription_workflow_test.rb test/integration/subscription_portal_test.rb test/services/development/subscription_patient_test.rb
ruby bin/postgres exec bin/verify-subscriptions
```

`verify-subscriptions` requires local PostgreSQL and creates its own unique databases. It checks fresh migration, an empty rollback/reapply, independent-connection retries, and populated backup/restore. Cleanup targets only databases created by that invocation. Do not use its rollback pattern against a populated operational database; use a reviewed forward change or restore a preserved backup into a separate target.

After migration/restore, apply the established [runtime privileges](../../apps/api/db/runtime_privileges.sql) as the database owner in the appropriate environment. The new immutable tables are explicitly excluded from runtime update/delete permissions.

From `apps/web/`, run `npx vitest run test/subscriptions.test.tsx` and `npm run build`. Root `ruby bin/verify-web` additionally checks shared HTTP transport using its own scratch data.

## Processor and release boundary

Fixed-term development purchases can still use the local `development_fixture` provider. [Stripe sandbox monthly memberships](stripe-memberships.md) add clinic Connect onboarding, hosted Checkout and verified recurring invoice reconciliation. Automatic plans require Stripe; they cannot be activated by fixture/manual payment. Stripe collection remains unavailable in production. A browser redirect is never payment evidence.

Stripe recurring source implementation and its manual acceptance gate are tracked in [Meta Clinic Implementation Tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md). Proration, taxation, service-consumption tracking and production release remain outside this implementation. Finance, privacy/security, clinical eligibility, support/retention ownership and production approvals are not established by this local walkthrough.

# MC02 paid-conversion atomicity source increment — 2026-09-30

Status: source candidate, unintegrated and not runtime-verified. No score award or release approval.

## Accepted contract and confirmed discrepancy

The [Membership Growth Build Plan](<../../josh_current_work/membership growth/MEMBERSHIP_GROWTH_BUILD_PLAN.md>) requires verified payment to create the patient, invoice, paid agreement, allocation, receipt, verified-account portal identity and front-desk task in one local transaction. The MC02 finding in audit revision `df1dfec3fc9eb14b859b98bdf186d29fee1e18e9`, `records/audits/2026-09-30-mc01-mc02-mc04-source-coverage.md`, is confirmed against approved source base `c16468388eeaed39acbbb2184049fd4c72ff2462`: public webhook reconciliation committed before onboarding began a separate transaction. An onboarding exception therefore left an incomplete paid conversion.

Branch: `codex/mc02-paid-conversion-atomicity-20260930`, based on that approved source. This branch does not incorporate the unintegrated MC09 entitlement increment.

## Owned change and finish line

- [PublicCheckout](../../apps/api/app/services/clinic/membership_growth/public_checkout.rb): extract local onboarding preparation from receipt delivery. The public paid webhook now performs purchase-record creation, payment reconciliation and onboarding preparation within its existing outer transaction. Receipt delivery follows successful completion. Staff fulfillment retains its existing caller behavior through the wrapper.
- [Synthetic integration tests](../../apps/api/test/integration/membership_growth_test.rb): two cases, fixed-term and automatic. Both use the existing simulated gateway and a genuinely verified account. Inject an onboarding audit exception after identity, task and prospect writes; expect all ten local record counts and prospect conversion references to roll back, with no receipt email. Replay the exact paid event with a receipt-delivery failure; expect a complete paid conversion to remain committed. Replay twice successfully; expect unchanged conversion IDs/counts, one onboarding audit, one receipt email, and no additional provider write requests.

Finish line: those regression cases and existing membership/payment tests pass independently, along with changed-file lint and eager loading, against the published candidate. Runtime proof is still required.

Payment-event routing, signed-event entry points, fresh provider validation, immutable quote/fee/amount checks, tenant/actor authorization, existing lock order and payment deduplication are preserved. No migration, permission grant, recurring allowance policy, provider configuration or charge action changes. Approved MC09 UI/history and shared WorkInbox source are untouched.

## Actual cloud checks and Sage handoff

`git diff --cached --check` passed. Scoped final selector ran and stopped at database preparation because `ruby` is absent; Bundler is also absent. No Ruby syntax, functional test, eager-loading or RuboCop result is claimed. No substitute runtime stack was installed.

Run the following in Sage's existing isolated backend test environment, with its prepared scratch database and repository runtime configuration (not an existing shared database reset):

```sh
cd apps/api
ruby bin/postgres exec bin/rails test test/integration/membership_growth_test.rb
ruby bin/postgres exec bin/rails test test/services/clinic/stripe_memberships_test.rb test/architecture/patient_membership_schema_migration_test.rb
ruby bin/postgres exec env RAILS_ENV=test bin/rails zeitwerk:check
ruby bin/rubocop app/services/clinic/membership_growth/public_checkout.rb test/integration/membership_growth_test.rb
```

For a focused regression first:

```sh
ruby bin/postgres exec bin/rails test test/integration/membership_growth_test.rb -n /paid_conversion_rolls_back_onboarding_failure/
```

## Known limits and next gap

The fix covers local conversion atomicity, not a transaction spanning Stripe and the database. Provider payment can already be completed when local persistence fails; recovery reprocesses the same verified event and performs existing provider reads. Checkout-session/status metadata written before conversion is intentionally retained for recovery; the pre-existing verified account is not rolled back.

The email-delivery marker retains its established semantics: a mail failure before delivery can retry without duplicating local conversion. Delivery accepted externally followed by a process failure before the marker commits can still produce a repeated email. This increment adds no email outbox or claim of exactly-once external delivery. The synthetic failure occurs before sending; it does not prove that crash boundary.

Next action is Sage's isolated runtime verification and independent source review. Existing unrelated architecture failures need baseline classification, not repair in this increment. Relay alone integrates; no PR, main merge, deployment, live provider call or score-table edit was performed.

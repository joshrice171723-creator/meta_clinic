# Stripe sandbox implementation handoff — 2026-09-06 UTC

Source task: [sc-294](https://app.shortcut.com/apply-1/story/294). Base `d90493b30a6970a09f02fe2f8c5c02526eb85a39`, main, `C:/Users/joshr/Desktop/Work/APPly`. This is evidence, not a second task register. [Setup and manual walkthrough](../../docs/development/stripe-memberships.md).

The user authorized source implementation, non-test type/syntax checks and manual computer use, but prohibited automated tests until personal acceptance and explicit testing authorization. The prior untracked `apps/api/test/services/clinic/stripe_connect_test.rb` was preserved untouched and excluded from the commit. No tests were created, modified or run, including browser scripts, verification helpers and hooks. The documentation harness command is deferred under the same explicit restriction.

## Implemented source

Completed the existing uncommitted Stripe integration: Accounts v2/full Dashboard, direct connected-account Checkout, automatic monthly subscriptions with a 2.1% application fee, signed event evidence, paid renewal ledger cycles, receipts/periods, missed-history recovery, hosted invoice recovery, paid-end cancellation, abandoned Checkout expiry and observed refunds. Added database recovery fields and immutable/unique routing constraints. Automatic terms require monthly duration, end-of-term cancellation and one enrollment per patient. Billing embeds connection status and separates paid access from Stripe renewal state; its collections figure explicitly excludes processing/application fees.

The separate clinic software subscription page, live activation, automatic test-clock customer setup, actual processing-fee/payout ledger imports and production operations remain outside this source implementation. Synchronous provider calls under locks and cumulative refund observations are documented limitations. No production-readiness or end-to-end success is asserted.

## Evidence and failures

- Official Stripe sources and installed generated SDK source confirmed stripe-ruby 19.6.1 and API 2026-08-26.dahlia compatibility. The Stripe documentation connector was disconnected; official web documentation was used.
- Required additive migrations 20260906000200, 20260906000300 and 20260906000400 applied to the existing `apply_sc269_development` database. No reset or test database migration was run. The generated schema was isolated in an ignored temporary file; only Stripe-owned schema blocks and new migration identifiers belong in the commit. Existing unrelated working-schema changes were retained.
- `npm run typecheck` passed after source changes. Ruby syntax checks passed for 20 changed source/migration files and `bin/stripe-listen`. These checks are not user acceptance or runtime payment proof.
- Manually opened Chrome on port 3200, signed in through OmniLogin, navigated Billing and selected Stripe setup. Existing backend financial records rendered. The first membership request failed because the pre-existing API process had booted before the Stripe gem was added; that specific port-3201 API was restarted against the same database. Other servers were preserved.
- After the restart, the membership panel returned the existing backend membership record, the 2.1% fee and the expected configuration-required/card-payments-disabled/payouts-disabled state. The connection button was disabled while credentials were incomplete; the earlier server error was resolved.
- Browser screenshot capture timed out. Screenshot-based desktop/narrow visual verification is incomplete; accessibility observations do not establish pixel-level acceptance.
- The official Windows Stripe CLI 1.50.10 was installed under ignored `apps/api/tmp/stripe-cli/`; its zip SHA-256 matched the official release checksum. Only version/help were run. The listener was not started and no synthetic provider events were generated.
- Restricted-key permissions were prepared in the APPly sandbox browser. The user pasted the new key into a JSON property name instead of its value. A diagnostic accidentally output that property name, exposing the key. The agent notified the user, corrected the private file's layout without making provider calls, and requested revocation/replacement. No credential value is recorded here. Stripe setup remains blocked until the replacement is privately saved and confirmed.

## Handoff boundary

Credential recovery update: the user confirmed rotating the exposed key and saving its replacement privately. `ruby bin/stripe-listen` was then started with API port 3201; its authenticated listener returned a signing secret that the helper saved privately. Only credential-validity/presence booleans were inspected. No payment or generated event was run. This supersedes the credential/listener blocker above.

Onboarding update: after credential recovery, manual computer use selected **Connect clinic with Stripe**. The server created the clinic sandbox account and returned a working `connect.stripe.com` hosted onboarding page. That page displayed the APPly sandbox identity and requested the business owner's email. It was left open for the user; no owner details or agreements were submitted by the agent.

The user must complete sandbox clinic onboarding and personally try Checkout. Capability activation, initial payment, subsequent monthly collection, failure recovery, replay ordering, cancellation and refunds remain unverified against Stripe. After personal acceptance and explicit testing authorization, meaningful negative/recovery/concurrency tests and repository checks may be created and run. Do not reinterpret the user's status questions as testing authorization.

Scoped changes are committed locally without push. Unrelated API client/inventory edits, earlier schema changes and the pre-existing Bundler checksum remain uncommitted. Shortcut retains the current scope, blocker and acceptance gate.

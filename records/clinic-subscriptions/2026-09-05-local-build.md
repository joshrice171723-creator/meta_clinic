# Clinic subscription implementation evidence — 2026-09-05

This dated record covers sc-246, local development only. Shortcut owns current task status: https://app.shortcut.com/apply-1/story/246. The authoritative checkout is `C:\Users\joshr\Desktop\Work\APPly`, branch `main`, initial commit `856887b229152caeb94b6f2f4155b0247e2fdb03`. Joshua authorized the full local implementation and explicitly approved reconciling overlapping sc-95/sc-146 shared-file claims; their unfinished acceptance work was preserved.

## Implemented contracts

- Arbitrarily named product families, reusable services, packages and tier labels; included, optional, choose-one and choose-many groups; quantities/frequency, availability windows, eligibility review, two-decimal price/currency, fixed duration, cancellation, refund and concurrent-purchase rules.
- Separate catalog read/write/publish and eligibility-review permissions through existing Ability/Authorization. Staff payments use existing billing permissions. Portal identity and practice come from the authenticated assigned patient, with Omni restricted to preview.
- Immutable published versions and purchased snapshots. Posted invoice lines, payments, refunds and receipts stay in the existing ledger. Package replacement never changes an earlier purchase.
- Fixed-term, one-time purchase. Renewal is none or manual (a new purchase after the old term ends). Automatic charges, proration, discounts and tax calculation are not implemented.
- The only subscription processor is an explicitly local fixture. Patient payment requests create a test collection intent; an authorized clinic operator delivers a signed simulated outcome. Account/mode/amount/currency/intent/signature checks precede the existing processor-event ingestion and payment allocation. No live payment credentials, card entry or outbound charge exists.
- Failed payments permit an explicit new attempt; unknown outcomes block retry until reconciled. Terminal/superseded events cannot overwrite the current attempt. End-of-term cancellation preserves active status until its effective date. Expiration is evaluated by the backend from the immutable term on reads.
- Existing posted cash/manual allocations can activate a subscription after exact full-payment reconciliation. The fixture refund action supports a full remaining refund only. Cash refunds continue through the existing cash workflow.
- Usage limits are purchase terms; this implementation does not track clinical service consumption or make eligibility decisions automatically.

## Schema and recovery

`20260905000300_create_clinic_subscription_products.rb` creates six tenant-scoped tables: `clinic_subscription_families`, `clinic_service_options`, `clinic_subscription_packages`, `clinic_subscription_versions`, `clinic_subscription_agreements`, and `clinic_subscription_events`. Composite foreign keys bind patients, invoices and package versions to their practice. Unique request keys serialize retries. Database triggers prevent updates/deletes of published versions, agreements and events. Existing billing receipt kinds are extended for subscription payment/refund.

The existing development database received only the additive migration. No existing database was reset or dropped. The pre-existing dirty canonical schema was copied before work; only new subscription objects and the receipt constraint were committed. Unrelated schema changes and the existing API-client/inventory-CSS changes remain outside this task's commits.

`bin/verify-subscriptions` creates two uniquely named `apply_subscription_verify_*` databases, checks fresh migration, empty rollback and reapply, runs independent-connection purchase/payment/refund races, backs up and restores populated records, and removes exactly those generated databases. For populated real deployments, rollback is not an approved workflow: restore a pre-change backup into a separate verified target or use a forward migration. Removing the receipt constraint extension after subscription receipts exist is expected to reject rollback.

## Evidence planes

| Plane | Observed evidence | Limit |
|---|---|---|
| Source | Connected admin catalog, assigned-patient checkout, existing ledger and staff reconciliation | Source is not production acceptance |
| Automated | Initial 14 subscription tests / 104 assertions passed; frontend suite 176 passed; 3 added presentation tests passed | Later integration/recovery checks recorded below |
| Build/loadability | TypeScript, Vite build and Rails Zeitwerk passed | Build warned about existing large bundle |
| Security tools | Brakeman: zero warnings/errors; bundler-audit and npm audit: no vulnerabilities | No certification or external penetration review |
| Existing backend verification | `bin/verify-backend` passed its independent-connection and restricted-role checks | Subscription-specific race proof recorded separately |
| Migration | Fresh subscription migration, empty rollback and reapply passed | Existing `bin/verify-postgres` passed upgrade/concurrency/restore then failed its final fresh phase; not counted as an overall pass |
| Browser | Admin created family, service and package, reviewed patient preview and published through the local UI | Patient purchase walkthrough continued below |
| Formatting | Subscription files passed focused formatting/RuboCop | Repository-wide Prettier reported 56 pre-existing files; no unrelated formatting sweep |
| Runtime launcher | Existing localhost services responded after additive migration | `bin/dev start/setup` reported dependency-marker/Windows PID-ownership failures; no unrelated process was stopped |

## Local commits and file map

Initial implementation: `320b0fa` — Add versioned clinic subscriptions with patient purchase and billing reconciliation.

The initial commit changes these files (paths relative to the authoritative checkout):

- `apps/api/app/controllers/clinic/billing/subscriptions_controller.rb`
- `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb`
- `apps/api/app/controllers/clinic/context_controller.rb`
- `apps/api/app/controllers/clinic/patient_portal/subscriptions_controller.rb`
- `apps/api/app/models/ability.rb`
- `apps/api/app/models/clinic/billing_receipt.rb`
- `apps/api/app/models/clinic/care/service_option.rb`
- `apps/api/app/models/clinic/care/subscription_agreement.rb`
- `apps/api/app/models/clinic/care/subscription_event.rb`
- `apps/api/app/models/clinic/care/subscription_family.rb`
- `apps/api/app/models/clinic/care/subscription_package.rb`
- `apps/api/app/models/clinic/care/subscription_version.rb`
- `apps/api/app/queries/clinic/care/subscription_projection.rb`
- `apps/api/app/services/clinic/billing/subscription_payments.rb`
- `apps/api/app/services/clinic/care/subscription_access.rb`
- `apps/api/app/services/clinic/care/subscription_catalog.rb`
- `apps/api/app/services/clinic/care/subscription_definition.rb`
- `apps/api/app/services/clinic/care/subscription_purchase.rb`
- `apps/api/app/services/development/test_clinic.rb`
- `apps/api/config/routes.rb`
- `apps/api/db/migrate/20260905000300_create_clinic_subscription_products.rb`
- `apps/api/db/structure.sql`
- `apps/api/test/architecture/routes_contract.json`
- `apps/api/test/integration/subscription_portal_test.rb`
- `apps/api/test/services/clinic/subscription_workflow_test.rb`
- `apps/web/src/App.tsx`
- `apps/web/src/api/contracts.ts`
- `apps/web/src/features/clinic/Billing.tsx`
- `apps/web/src/features/clinic/BillingDashboard.tsx`
- `apps/web/src/features/clinic/Workspace.tsx`
- `apps/web/src/features/clinic/subscriptions/PackageCard.tsx`
- `apps/web/src/features/clinic/subscriptions/SubscriptionBilling.tsx`
- `apps/web/src/features/clinic/subscriptions/SubscriptionCatalog.tsx`
- `apps/web/src/features/clinic/subscriptions/contracts.ts`
- `apps/web/src/features/identity/Login.tsx`
- `apps/web/src/features/patientPortal/PatientPortal.tsx`
- `apps/web/src/features/patientPortal/PatientSubscriptions.tsx`

## Approval boundaries

Local development fixtures only. Processor/merchant integration and recurring payments require a separately approved adapter and test-account integration. Finance must review currency minor units, taxation, revenue/refund policy and reconciliation procedures. Privacy/security, clinical eligibility/entitlement policy, retention/support ownership and production/release acceptance remain separate gates. This record does not authorize any live charge, real patient data, deployment, or external communication.

## Final verification addendum

The second local slice adds a targeted assigned-patient fixture, server-side billing search/state filtering before the 200-row cap, selection-aware patient preview, explicit runtime privileges for immutable subscription history, and independent-connection recovery verification. Historical Omni role definitions remain unchanged. Development grants now use PostgreSQL's transaction timestamp so long fixture setup transactions do not create grants that appear future-effective to database guards.

Browser verification found and corrected a stale-summary issue: subscription mutations now refresh the parent Billing dashboard and selected invoice together. Singular one-month terms and heading semantics were corrected in the same presentation pass.

### Executed checks

- `ruby bin/postgres exec bin/rails test test/services/clinic/subscription_workflow_test.rb test/integration/subscription_portal_test.rb`: expanded service/HTTP pass, 14 tests / 104 assertions at that checkpoint.
- `ruby bin/postgres exec bin/rails test test/integration/subscription_portal_test.rb test/integration/patient_portal_test.rb test/services/development/subscription_patient_test.rb test/services/clinic/billing/payment_collection_boundary_test.rb`, with `RAILS_ENV=test` and `APPLY_TEST_DATABASE=apply_sc246_test`: final combined pass, 16 tests / 139 assertions, zero failures/errors/skips. Covers foreign-practice and another same-practice patient's payment/receipt denial, existing portal/payment boundaries, and targeted fixture repeatability/disabled-account rejection.
- `ruby bin/postgres exec bin/verify-subscriptions`: passed fresh migrations, empty rollback/reapply, duplicate checkout/payment intent/event/refund races using separate connections, populated backup/restore, and immutable restored history. Exactly the two generated databases were removed.
- `ruby bin/postgres exec bin/verify-backend`: passed the existing independent-connection and restricted-runtime-role checks.
- `npm test -- --run`: final frontend suite passed 179 tests across 17 files, including three added subscription presentation checks.
- `npm run build`: final TypeScript/Vite build passed. Existing large-chunk warning remains.
- Rails Zeitwerk, focused RuboCop and focused Prettier passed. Brakeman reported zero warnings/errors; bundler-audit and npm audit reported no vulnerabilities. Full-repository Prettier still reports 56 pre-existing files; no unrelated formatting was changed.
- `ruby bin/postgres exec bin/verify-postgres`: upgrade/concurrency/restore phases passed, but the overall command failed at its final fresh-schema phase. The Windows PostgreSQL wrapper does not stream a host `psql --file` path into Docker. sc-253 owns that wrapper fix in its separate inventory worktree; sc-246 did not overwrite it. Subscription-specific fresh/restore proof passed independently.
- Root `ruby bin/verify-web`: initial fixture authorization failure was diagnosed and the transaction-timestamp correction passed the existing portal regression suite. A subsequent run passed fixture setup but failed during process startup with `Net::OpenTimeout`; its generated database/processes were cleaned by the verifier. This is not recorded as a pass. Final retry outcome is recorded separately below.

### Database separation

The initial additive migration and catalog/purchase UI walkthrough used `apply_development`; no reset/drop occurred. On Joshua's request to check agent collisions, the sc-246 API on 3101 was stopped, a read-only custom dump was saved under this task's `work/`, and it was restored into the newly created `apply_subscription_browser_90673ca9`. The API was restarted with `APPLY_DEVELOPMENT_DATABASE` pointing to that exact database; Vite uses 3100 and proxies to 3101. Subsequent browser payment/recovery writes are isolated there. A direct query after reconciliation showed four subscription events in the isolated database and only the original purchase event in `apply_development`.

Tests use `apply_sc246_test` or generated subscription scratch databases. The other active inventory task was observed in `APPly-inventory-program` on `codex/sc-253/inventory-program`, with distinct inventory test databases. There was no observed cross-agent same-table test write. Both tasks still share the Docker PostgreSQL server and host CPU/memory; Docker alone does not assign an agent-specific database. No unrelated process was stopped.

### Browser evidence

Through the real UI with dev seed data: created a custom family and service; saved, previewed and published package version 1 at USD 75.25; signed in as the assigned patient; reviewed the exact server quote and confirmed purchase; observed pending payment and invoice 6; requested the test payment; observed processing with retry blocked; signed in as the clinic operator; delivered unknown and then succeeded signed fixture outcomes; observed active term 2026-09-05 through 2026-10-05, paid USD 75.25 and zero remaining balance in both the subscription and refreshed clinic invoice/dashboard. Signed back in as the patient and opened server-issued subscription payment receipt 1 for USD 75.25.

Screenshots were visually inspected in the task at clinic desktop 1440x1000, clinic tablet 834x1112, and patient mobile 390x844. DOM width measurements were respectively 1425, 819, and 375 within their viewports, with no horizontal page overflow. The mobile purchase and receipt dialogs were readable with visible actions. Semantic labels, dialog names/initial focus, headings and native controls were inspected. A full keyboard-only or assistive-technology audit was not performed and remains a review limitation.

### Final runtime and check outcomes

The clinic operator issued a full USD 75.25 fixture refund through the UI. The subscription became refunded. The assigned patient then saw USD 75.25 paid, USD 75.25 refunded, zero outstanding balance, payment 3 and refund 1. The receipts dialog preserved payment receipt 1 and displayed refund receipt 2, each USD 75.25. No live processor or money movement occurred.

The last root HTTP verifier retry again failed during process startup with `Net::OpenTimeout` after fixture setup; generated scratch databases and child processes were removed. The source command is not marked passing and no startup guard was weakened. The connected subscription journey was independently exercised in the browser. Final `python bin/verify-agent-harness` passed 30 documents, 7 skills and 9 commands.

The isolated 3100 frontend / 3101 API and `apply_subscription_browser_90673ca9` database are retained for local review. The original development database retains its original draft/published catalog and pending-purchase dev seed data; later payment and refund records are in the isolated database only. Shared default services and the other agent's worktree/database were left alone.

### Second-slice file map

This verification and workflow correction slice includes the following files. Its exact commit is identified by `git log` and the external implementation handoff (a commit cannot contain its own final hash).

- `apps/api/app/controllers/clinic/billing/subscriptions_controller.rb`
- `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb`
- `apps/api/app/services/clinic/care/subscription_catalog.rb`
- `apps/api/app/services/development/test_accounts.rb`
- `apps/api/app/services/development/test_clinic.rb`
- `apps/api/bin/verify-subscriptions`
- `apps/api/db/runtime_privileges.sql`
- `apps/api/lib/tasks/development_accounts.rake`
- `apps/api/test/integration/subscription_portal_test.rb`
- `apps/api/test/services/development/subscription_patient_test.rb`
- `apps/api/test/verification/subscription_races.rb`
- `apps/web/src/features/clinic/BillingDashboard.tsx`
- `apps/web/src/features/clinic/subscriptions/PackageCard.tsx`
- `apps/web/src/features/clinic/subscriptions/SubscriptionBilling.tsx`
- `apps/web/src/features/clinic/subscriptions/SubscriptionCatalog.tsx`
- `apps/web/src/features/patientPortal/PatientSubscriptions.tsx`
- `apps/web/test/subscriptions.test.tsx`
- `docs/development/clinic-subscriptions.md`
- `records/clinic-subscriptions/2026-09-05-local-build.md`

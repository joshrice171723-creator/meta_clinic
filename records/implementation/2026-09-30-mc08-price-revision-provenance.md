# MC08 source-price revision increment — 2026-09-30

Base: PR66 `5470609423ed67b99453c3b779f584e0c86f2fd8`. Branch: `codex/mc08-source-gap-20260930`. Original source matrix: `d3c8de26580879bcb70abbc5f30cccfd91b50d53`, [immutable audit](https://github.com/joshrice171723-creator/meta_clinic/blob/d3c8de26580879bcb70abbc5f30cccfd91b50d53/records/audits/2026-09-30-mc08-mc11-mc13-original-source-coverage.md), originally inspected at `c164`. Audit commit fetched for read-only review; its file is not present in the PR66 base and is not copied into this increment. No score changes or completion percentage claim.

## Reconciliation and selected acceptance

[Accepted hardening brief](../../docs/development/non-vendor-clinic-hardening-plan.md#3-cash-pay-estimates-and-gfe-workflow), rows at lines 130–133, specifies price-revision provenance, charge date basis, and applicability/request context. At the newer base, inspection of `CashPayEstimate`, `CashPayEstimateLine`, create/correct/issue services, estimate controller, SQL schema, and `CashPayEstimates.tsx` confirms all three omissions remain. Amount and service/offering IDs were present; source revision was absent. Date basis and self-pay/uninsured/request/scheduled facts were absent; policy version and planned delivery method do not supply them. These findings are not failed runtime reproductions.

Selected smallest complete slice: 08-18, saved source-price revision. Reuse `BillingService.lock_version`, the existing server catalog revision used by `ManageBillingService.update` under row lock. Its identity is `(billing_service_id, source_price_revision)`; it versions the whole catalog record, including metadata edits, rather than counting only price changes. This is provenance for the saved amount, not a new price schedule or legal policy.

New estimate/correction lines capture the locked service revision alongside the exact amount. Exact idempotent replay retains the first snapshot. Existing issued-line guards protect the new field. API and staff/printable snapshots expose the saved revision. Additive nullable integer and nonnegative/source-ID check preserve existing records; no backfill guesses historical revisions. Unknown historical provenance remains labelled explicitly. Client input cannot choose a revision. No catalog, offering, Stripe, configuration, authorization, provider or payment behavior changes.

## Standards and presentation basis

Reviewed 2026-09-30: [FHIR R4 Invoice 4.0.1 scope/boundaries](https://hl7.org/fhir/R4/invoice.html), trial-use global financial resource relevant to the accepted U.S. cash-pay product, distinguishes charge lines, prices and source definitions. It does not prescribe this internal revision field. No exchange partner/profile is selected; this local provenance increment makes no FHIR conformance claim. [CMS U.S. GFE FAQ Part 1](https://www.cms.gov/cciio/resources/regulations-and-guidance/downloads/guidance-good-faith-estimates-faq.pdf) supplies operational context, not permission to infer applicability or timing. Date/applicability policy remains unresolved outside this slice.

Repository `frontend-ui` skill used. MUI MCP unavailable; installed MUI 9.4.0 and [official Typography documentation](https://mui.com/material-ui/react-typography/) provide the fallback. Existing Typography renders provenance beside the saved line. No custom interaction primitive or dependency change. Graft executable unavailable; bounded source reads and `rg` used.

## Cloud evidence

- Locked frontend install passed with lifecycle scripts disabled and a temporary pnpm store; lockfile unchanged. Initial default-store install failed because `/home/agent/.local/share/pnpm` could not be created; setting `XDG_DATA_HOME` and store directory under `/tmp` resolved it without escalation.
- Three estimate snapshot/failure cases passed, including revision zero, prior/corrected source revisions and unknown historical provenance.
- Six controlled Chromium estimate/comparison cases passed at 1440×1000; source revision displayed before/after reload and unknown draft provenance displayed. Synthetic GET fixtures forbid financial writes. These are frontend evidence, not Rails-backed acceptance.
- TypeScript and production bundle passed. Changed frontend formatting and Git whitespace checks passed.
- Authored backend assertions cover server-derived revision, catalog change, exact create/correction replay, issued immutability, historical null, model/DB rejection of negative revisions, and API list/show/correction projection. **Unrun:** Ruby/Bundler are unavailable in cloud. No replacement stack was provisioned.

## Sage handoff — backend and generated schema pending

Parent/Sage must run these from `apps/api` on this branch using its existing local PostgreSQL runner, with a newly owned synthetic scratch database. The explicit name below is task-local; if it already exists, stop and choose a new owned name rather than resetting it. No shared fixture/database reset is authorized.

```sh
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_revision_sage_20260930_2044 SCHEMA=/tmp/mc08-sage-structure.sql bin/rails db:create
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_revision_sage_20260930_2044 SCHEMA=/tmp/mc08-sage-structure.sql bin/rails db:migrate
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_revision_sage_20260930_2044 bin/rails test test/services/clinic/cash_pay_estimate_test.rb test/integration/clinic_cash_pay_estimate_corrections_test.rb test/integration/estimate_invoice_comparison_test.rb
python ../../bin/agent-resources run -- bundle exec rubocop app/controllers/clinic/billing/cash_pay_estimates_controller.rb app/models/clinic/billing/cash_pay_estimate_line.rb app/services/clinic/billing/create_cash_pay_estimate.rb db/migrate/20260930230000_add_price_revision_to_cash_pay_estimate_lines.rb test/services/clinic/cash_pay_estimate_test.rb test/integration/clinic_cash_pay_estimate_corrections_test.rb
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_revision_sage_20260930_2044 SCHEMA=db/structure.sql bin/rails db:schema:dump
```

Review/retain the generated `db/structure.sql` diff on the integration candidate. This cloud increment deliberately does not hand-author a generated SQL snapshot. Sage should additionally verify upgrade/repeat/rollback/fresh migration behavior only in its owned disposable scratch databases. Any backend acceptance or generated-schema receipt is pending, not a pass. Relay alone combines; no PR, main merge or deployment.

## Remaining limits

08-19 charge date basis and 08-20 self-pay/uninsured plus request/scheduled context remain missing source. Their accepted fact-recording requirements are genuine; exact legal applicability, automatic timing defaults and scheduling policy are not defined and must not be invented. Other MC08 connected Rails/browser, delivery and financial race acceptance remains separate. This increment neither certifies a compliant GFE nor changes milestone scores.

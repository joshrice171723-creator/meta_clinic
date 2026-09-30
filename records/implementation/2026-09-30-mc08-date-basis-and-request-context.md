# MC08 charge date basis and recorded context — 2026-09-30

Increment base: `d19c90a86fd94d1998c17dbfcdf9054643b99d66`, branch `codex/mc08-date-context-20260930`. Relay owns combination. This adds the remaining 08-19/08-20 source fields; it does not change scores, financial balances, provider operations or clinical/scheduling policy.

## Source contract and representation

[Accepted hardening brief](../../docs/development/non-vendor-clinic-hardening-plan.md#3-cash-pay-estimates-and-gfe-workflow), lines 130–133, requires expected-charge date basis and self-pay/uninsured/request/scheduled context. The [original audit at d3c8de](https://github.com/joshrice171723-creator/meta_clinic/blob/d3c8de26580879bcb70abbc5f30cccfd91b50d53/records/audits/2026-09-30-mc08-mc11-mc13-original-source-coverage.md) identified 08-19 and 08-20 at c164. Reinspection at d19c confirmed no owning schema/model/service/API/UI field. [Prior increment](2026-09-30-mc08-price-revision-provenance.md) owns 08-18 and records the initial reconciliation.

Bounded representation choices:

- `date_basis`: nullable, trimmed plain-language string, at most 500 characters per expected-charge line. Staff can state a known expected date/range or the source/uncertainty; no parser invents an appointment, timezone, delivery or charge-posting date. Blank is stored as null and displayed as not recorded.
- `payment_context`: recorded choice `unknown`, `uninsured`, `self_pay`, or `other`. Missing old/new values default to explicit unknown, not a false uninsured/self-pay assertion. This is a fact-context label, not an applicability or eligibility determination.
- `request_context`, `scheduled_context`: nullable, trimmed plain-language strings, at most 500 characters each. Staff records known request/scheduled facts or explicitly records no request/service scheduled. No dates are computed or inherited from membership, invoice, appointment or delivery.

Create saves unknown drafts. Authorized new issuance requires a non-unknown payment context, nonblank request/scheduled context and the pre-existing policy version. `other` does not automatically disqualify or qualify a GFE: reviewed human policy still owns applicability. Context can be supplied when issuing an existing draft without editing an issued snapshot. Date-basis uncertainty does not impose a guessed scheduling gate.

Corrections retain predecessor context when no replacements are supplied; explicit replacement facts belong to the new revision. Line date basis is supplied explicitly with correction lines (the UI seeds it from the selected snapshot). Original snapshots and delivery history stay unchanged. Model issued-snapshot/line guards protect new fields; old issued records with unknown context remain readable, deliverable and supersedable rather than retroactively rewritten.

New context is included in idempotency payloads only when supplied. Omitted context/line date basis keeps the prior payload shape, preserving legacy exact-receipt replay. Changed supplied facts/date basis conflict on an already committed key. New issuance checks run inside the existing locked transaction after receipt replay; replay never reissues or fills missing historical facts. Existing authorization, practice/patient scope, catalog price locking and exact amounts remain in force.

Migration `20260930230100_add_date_basis_and_context_to_cash_pay_estimates.rb` follows d19c's `20260930230000_add_price_revision_to_cash_pay_estimate_lines.rb`; do not reuse either number. It adds fields and a payment-context allowlist constraint, with no backfill of historical facts. **Generated SQL is unchanged in cloud.** Sage/MC15's existing assigned schema gate should generate/review the schema only after both increments are present.

## Standards and interface

The accepted brief's U.S. source mapping and this conversation's 2026-09-30 review of [CMS GFE FAQ Part 1](https://www.cms.gov/cciio/resources/regulations-and-guidance/downloads/guidance-good-faith-estimates-faq.pdf) provide GFE context, while [FHIR R4 Invoice 4.0.1](https://hl7.org/fhir/R4/invoice.html) distinguishes financial charge/source facts. Neither supplies a clinic applicability algorithm or requires a structured internal date format. No exchange profile/partner is selected; no FHIR or legal conformance claim is made. Exact state/federal applicability, delivery timing, deadlines and complete compliant document contents remain human/release gates.

Repository `frontend-ui` skill reused; installed MUI 9.4.0 TextField/MenuItem/Stack/Typography compose the controls and saved/printable display. No new dependency, browser persistence or custom interaction system. MUI MCP and Graft remain unavailable; reviewed official documentation, installed types and bounded source reads supply the fallback.

## Cloud verification

- Ten unique focused frontend cases passed: three saved-snapshot/failure cases and seven controlled Chromium cases at 1440×1000. New journey covers unknown-context issuance disabled, typed date-basis submission/snapshot, recorded context, draft save, synthetic uncertain issue response, frozen fields, exact request retry and context reload. One draft-read case was rerun after adding explicit missing-date/request display assertions and passed.
- TypeScript and production bundle passed on final application source. Changed-file Prettier and staged whitespace checks passed. Final scoped check selection inspected; no broad billing/payment suite was launched in cloud.
- Five new Rails service cases authored: unknown draft/issuance rejection and legacy payload digest; each missing context/`other` factual context; exact retry/conflict/correction/immutable history; legacy unknown issued delivery; invalid enum/type/oversize inputs. Two API cases added for create/issue/reload/conflicting retry and unknown draft/issuance denial with independent history read. Existing MC08 issue fixtures now supply explicit synthetic context; existing authorization/practice denials remain unchanged.
- **Backend tests, migration correctness, RuboCop and generated schema are unrun here:** Ruby/Bundler remain unavailable; no download retry or replacement backend stack was attempted.

## Portable Sage commands

Run from `apps/api` on the integrated candidate containing d19c and this increment, using the already assigned local runner. Use a newly owned wholly synthetic scratch database. The explicit name below must not already exist; stop on a collision rather than resetting/reusing shared fixtures. The temporary schema output prevents migration's automatic dump from replacing the tracked generated file before review.

```sh
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_context_sage_20260930_2100 SCHEMA=/tmp/mc08-context-sage-structure.sql bin/rails db:create
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_context_sage_20260930_2100 SCHEMA=/tmp/mc08-context-sage-structure.sql bin/rails db:migrate
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_context_sage_20260930_2100 bin/rails test test/services/clinic/cash_pay_estimate_context_test.rb test/services/clinic/cash_pay_estimate_test.rb test/integration/clinic_cash_pay_estimate_corrections_test.rb test/integration/estimate_invoice_comparison_test.rb
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_context_sage_20260930_2100 bin/rails zeitwerk:check
python ../../bin/agent-resources run -- bin/rubocop app/controllers/clinic/billing/cash_pay_estimates_controller.rb app/models/clinic/billing/cash_pay_estimate.rb app/models/clinic/billing/cash_pay_estimate_line.rb app/services/clinic/billing/create_cash_pay_estimate.rb app/services/clinic/billing/correct_cash_pay_estimate.rb app/services/clinic/billing/issue_cash_pay_estimate.rb db/migrate/20260930230100_add_date_basis_and_context_to_cash_pay_estimates.rb test/services/clinic/cash_pay_estimate_context_test.rb test/services/clinic/cash_pay_estimate_test.rb test/integration/clinic_cash_pay_estimate_corrections_test.rb
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_context_sage_20260930_2100 SCHEMA=/tmp/mc08-context-sage-structure.sql bin/rails db:migrate
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_context_sage_20260930_2100 SCHEMA=/tmp/mc08-context-sage-structure.sql VERSION=20260930230100 bin/rails db:migrate:down
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_context_sage_20260930_2100 SCHEMA=/tmp/mc08-context-sage-structure.sql VERSION=20260930230100 bin/rails db:migrate:up
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc08_context_sage_20260930_2100 SCHEMA=db/structure.sql bin/rails db:schema:dump
```

Sage should additionally verify fresh/upgrade/repeat/rollback migration behavior in its owned disposable scratch databases and preserve its receipts. Schema generation and backend correctness are pending gates, not passing evidence. No shared reset, persistent grant, credential, production configuration, PR, merge, deployment or live money/provider operation occurred. These source fields do not establish full MC08 acceptance or genuine Build >90 by themselves.

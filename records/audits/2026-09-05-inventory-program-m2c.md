# Inventory M2 verification follow-up

Date: 2026-09-05. Base: `bcb548d9ff8d8c1a7690908a1ef7e194e7b72b03`.
Worktree: `C:/Users/joshr/Desktop/Work/APPly-inventory-program`.
Branch: `codex/sc-253/inventory-program`. Claim and exact commit: [sc-264](https://app.shortcut.com/apply-1/story/264).

This follow-up supplements [M2b evidence](2026-09-05-inventory-program-m2b.md); it preserves the earlier failed checks as historical evidence. The [program audit](2026-09-05-inventory-program-audit.md) retains the source-based ranking and dependencies.

## Objective and acceptance

Resolve the local development fixture failure that prevented the broad frontend/API verifier from reaching inventory. Prove the correction preserves permission denial and does not change production authorization, shared subscription code or existing databases. Complete receiving desktop/tablet visual checks before M3.

## Confirmed gap and changes

`apps/api/app/services/development/test_clinic.rb#grant_access!` created each fixture grant with `1.minute.ago`. PostgreSQL's authorization function uses `CURRENT_TIMESTAMP`, fixed at the beginning of the outer transaction. When fixture preparation lasts longer than a minute, Rails considers the new grant effective while SQL sees it as future-dated. Opening inventory adjustment then fails.

The fixture now obtains PostgreSQL's transaction timestamp once and uses it for newly created grants. Existing grants, permission lists, production authorization SQL, application access checks and subscription/TestAccounts code are unchanged.

`apps/api/test/services/development_inventory_grants_test.rb` advances the Rails clock three minutes inside an already-open fixture transaction. It failed before the correction with the same inventory permission error; after correction it posts exactly three office units and still denies ungranted receiving permission. No patient linkage or patient fixture is needed by this regression.

## Verification

- Focused regression: 1 test, 4 assertions, no failures/errors; seed 15319. The initial uncorrected run failed with the expected permission error (seed 51200).
- Scoped RuboCop: both changed Ruby files clean. Zeitwerk passed; Brakeman reported 0 errors / 0 warnings; Bundler audit found no vulnerabilities. Agent harness passed (30 documents, 7 skills, 9 commands).
- Root `bin/verify-web` passed: real Vite proxy, session/CSRF/origin, named role isolation, settings conflict, fresh fixture clinic, exact decimal receipt/retry, portal and logout. Its generated scratch database and child processes were removed by the verifier.
- Existing installed Chromium headless shell, real Vite/Rails and isolated fixture database: 1440, 834 and 768 px receiving screenshots inspected; controls, recorded discrepancy and PO totals remain contained, with no horizontal page overflow. Desktop keyboard and rejection/reload behavior was already verified in M2b. Screenshots are retained in ignored `apps/api/tmp/m2c-receiving-{1440,834,768}.png`. No browser dependency was installed.

## Remaining boundaries

The separate patient-portal type errors remain outside inventory scope. No dependencies, supplier connection, billing change, real data, deployment, push or shared database reset is included. Only independently created task fixtures are used. A resource-constrained parallel browser attempt was stopped; its result is not browser acceptance.

The full Rails suite was not run for this fixture-only correction; no migration or production authorization code changed. Task browser helpers were stopped after inspection. M2 scoped acceptance is complete; the documented baseline patient-portal build failure remains a separate application integration risk, not an unresolved receiving defect. Continue with M3 screen-specific reads.

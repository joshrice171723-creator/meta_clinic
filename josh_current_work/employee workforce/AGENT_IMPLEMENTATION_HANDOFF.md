# Employee workforce implementation handoff

[Roadmap](ROADMAP.md) | [Build plan](EMPLOYEE_WORKFORCE_BUILD_PLAN.md) | [Audit plan](EMPLOYEE_WORKFORCE_AUDIT_PLAN.md)

## Active delivery checkpoint — 2026-09-06

Implementation is authorized, including routine design choices and forward migrations. This is a local implementation and verification pass, not deployment or payroll/legal acceptance. Base checkout: `C:/Users/joshr/Desktop/Work/APPly`, `main`, integration base `5d2025c`.

## Integrated ownership and entry points

- Foundation (Sol high): `7583976`, `3a596a2`, `ff8676b`; account linkage, invitations, effective assignment history and location settings; foundation models/services/controllers and three UI pages.
- Scheduling (Sol medium): `6565003`, `bca6ebc`; templates, drafts, immutable publications, availability/time off and consent-aware shift swaps; four UI pages and service tests.
- Clock/timecards (Sol high): scoped implementation and test corrections in progress; root owns runtime and database verification.
- Coordinator: shared authorization/context, `/clinic/workforce` navigation, `/workforce/kiosk`, `/workforce/activate`, route contracts, payroll CSV versions/batches, schema integration and verification.

Migrations `20260906001000`–`20260906001400` are applied to isolated `apply_workforce_01a075b2_test`. Migration 014 adds historical assignment exclusion constraints and required request timestamps. Workforce schema blocks are integrated without staging the preexisting unrelated `db/structure.sql` changes.

## Decisions

- Same host account/session authority; an employee badge authorizes clock actions only on an enrolled kiosk. No badge login into patient or manager screens.
- USB keyboard-style barcode scanners and optional supported-browser camera scanning use Code 128. No new hardware service or library dependency.
- All location features are explicitly configurable; false overrides remain false and null means inherit. Missing overtime/pay rules block approval/export rather than supply a statutory assumption.
- Payroll support is custom CSV with configured headings and per-location employee IDs, immutable batch downloads, formula-safe cells, retry identity and explicit corrective exports. No live payroll provider or payments.
- Existing APPly MUI composition is preserved. MUI MCP was unavailable; installed types and official documentation were used. General visual redesign is out of scope.

## Verified so far

- Foundation/payroll and architecture: 16 tests, 601 assertions passed.
- Workforce access integration: 5 tests, 47 assertions passed (self/manager context, tenant tampering, employment inactivation, activation CSRF and release gate).
- Scheduling: 5 tests, 17 assertions passed after version-accessor and interval-precision corrections.
- Rails eager loading passed.
- Existing backend race verification passed (allocation, address, room/revision races, inventory, restricted history role).
- PostgreSQL verification passed legacy upgrade, concurrent inventory/settings, backup restore and fresh migrations.

## Unified employee administration — Shortcut sc-382

- `/clinic/workforce/employees` is now the single admin surface for employee name, job title, clinic login linkage or invitation, workforce role, assigned sites and effective date.
- The duplicate Employees navigation item is removed. `/clinic/staff` remains a backwards-compatible redirect to Workforce Employees.
- New-login activation creates the user, clinic membership, employment, employment sites and role grants in one database transaction. A role-assignment failure rolls the entire activation back.
- Existing-account linkage creates the staff directory record, employment, sites and workforce role in one transaction. Roles remain clinic-scoped authorization data on the linked membership rather than employment attributes.
- Focused backend verification passes: 14 runs, 101 assertions, no failures. Focused navigation verification passes: 8 tests. Eager loading, targeted RuboCop, `git diff --check` and `ruby bin/verify-web` pass.
- The full web suite passes 199 tests with two unrelated existing failures in Staff Messaging copy and Tracking Board CSS scoping. Typecheck remains blocked only by existing MUI API errors in Reminders and Staff Messaging; no employee-workforce type errors were reported.
- Shortcut story: https://app.shortcut.com/apply-1/story/382

## Continuing checks / known gaps

- Rerun clock/timecard/API and payroll tests after focused corrections; complete integrated happy-path coverage and source review.
- The full web suite has two unrelated failures: staff-messaging copy and tracking CSS assertions. The workforce SVG correction passes.
- Full web build currently encounters preexisting MUI API incompatibilities in Reminders and StaffMessaging; workforce typography correction is applied. Do not claim a passing build.
- Managed restart initially failed stopping a stale API PID. The repository HTTP/session/CSRF verification subsequently passed without resetting data.
- Browser automation initialization timed out twice. No live screenshot, physical scanner, camera or responsive visual proof yet.
- Shortcut OAuth was refreshed and story sc-382 is claimed. Final tracker status should remain In Review until human review.
- No deployment, external email, real employee/patient data or live provider activity occurred.

Keep existing source/plan paths; update this checkpoint with final commits and evidence rather than create another queue.

# APPly software production-readiness audit

**Scope:** software only; source, configuration, local runtime and automated checks. This is not a HIPAA certification or legal assessment.

## Verdict

**Not ready for real clinic data — 45/100 (medium confidence).** The clinic API intentionally returns 404 in production except for its synthetic staging-demo identity, and several required production workflow and release gates remain incomplete.

## Release blockers

| ID | Severity | Status | Evidence | Minimal remediation |
| --- | --- | --- | --- | --- |
| R1 | Blocker | Verified | `apps/api/app/controllers/clinic/base_controller.rb:61-66` denies the clinic workspace in production unless `Staging::DemoClinic.available_to?` is true. | Replace the synthetic-only gate with a reviewed real-clinic launch gate, then independently test real role, practice, and site isolation. |
| R2 | High | Verified | `apps/api/config/routes.rb:97-101` exposes session/settings/development endpoints only; `apps/api/app/models/user.rb:2` uses password authentication; no MFA, password-reset, or recovery workflow was found. | Implement MFA and a secure recovery/reset flow with rate limits, audit events, revocation and tests. |
| R3 | High | Verified | `npm.cmd test -- --reporter=verbose` fails 2/50 tests in `apps/web/test/clinic-navigation.test.ts:73,110`; current `apps/web/src/App.tsx:342-343,390-392` no longer satisfies those navigation/auth-shell contracts. | Repair either the application regression or stale assertions; make the full frontend suite green in CI. |
| R4 | High | Verified | No Good Faith Estimate model, route, service, or UI was found; billing routes only support invoice show/post/payment allocation in `apps/api/config/routes.rb:31-35`. | Define and implement a versioned estimate workflow, required snapshots, disclosure artifacts, patient linkage, authorization and audit tests. |
| R5 | High | Verified | Billing UI displays void states, but the API route surface has no refund, void, receipt, or credit-note mutation route; `apps/api/app/controllers/clinic/billing/invoices_controller.rb:50-76` only posts invoices and records allocations. | Implement authorized, append-only void/refund/credit workflows with reason, reconciliation and duplicate-event protection. |

## Positive verified controls

- Cookie sessions are `HttpOnly`, `SameSite=Lax`, secure in production: `apps/api/config/initializers/session_store.rb:1-3`.
- The React client is same-origin only and sends CSRF tokens for mutations: `apps/web/src/api/client.ts:53-97`; Rails enforces forgery protection at `apps/api/app/controllers/application_controller.rb:1-20`.
- Login rate limits and session rotation are implemented: `apps/api/app/controllers/identity/api/sessions_controller.rb:6-10`, `apps/api/app/controllers/concerns/member_authentication.rb:15-20`.
- Clinic authorization is server-side and practice/site scoped: `apps/api/app/controllers/clinic/base_controller.rb:68-92`, `apps/api/app/services/clinic/authorization.rb:5-23`, `apps/api/app/models/ability.rb:16-61,136-211`.
- The browser policy blocks scripts and framing and restricts origin/resource types: `apps/api/config/initializers/browser_security.rb:1-17`.
- Audit events are append-only at model level: `apps/api/app/models/clinic/audit_event.rb:15-21`; sensitive reads are recorded after successful response in `apps/api/app/controllers/clinic/base_controller.rb:98-104`.
- Inventory receiving is transactional, locks critical records and binds retry keys to payloads: `apps/api/app/services/clinic/inventory/receiving.rb:10-24,62-70`.

## Verification record

- Repository: `C:\Users\joshr\Desktop\Work\APPly`
- Branch/commit: `main` / `e023e771313079a78f286c8777c95f668e800501`
- Working tree was clean before this report was added.
- Passed: `npm.cmd run build`; `bundle exec brakeman -q -f plain` (0 warnings); `bin/rails test` (exit 0).
- Failed: `npm.cmd test -- --reporter=verbose` (2 failing navigation-contract tests).
- Not independently verified: production-edge headers, external dependency-advisory result, backup restore, real payment processing, real clinic production runtime, and browser/manual accessibility journey.

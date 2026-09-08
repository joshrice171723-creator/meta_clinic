# APPly software production-readiness audit

**Scope:** software only; source, configuration, local runtime and automated checks. This is not a HIPAA certification or legal assessment. The local/synthetic environment and intentional production clinic lock are excluded from feature-readiness scoring.

## Verdict

**Cash-based clinic feature readiness — 60/100 (medium confidence).** APPly is a credible internal clinic-operations MVP: patients, schedule/board, encounters, draft/sign/revise notes, allergy and medication summaries, documents, message intents, billing ledger, role-scoped API access, and extensive inventory controls. It is not yet a complete patient-care workflow for a cash clinic.

**Technical HIPAA safeguard readiness — 65/100 (medium confidence).** The API/frontend design is strong for a prototype on authorization, tenant/site scoping, encrypted sensitive fields, CSRF, session handling, audit records and no-store responses. MFA/recovery, complete audit-coverage proof, and real consent/document flows remain gaps. This number is not a compliance certification.

## Release blockers

| ID | Severity | Status | Evidence | Minimal remediation |
| --- | --- | --- | --- | --- |
| R1 | High | Verified | `apps/api/config/routes.rb:10-12` supports appointment create and status transition, but lacks update/reschedule/cancel endpoints. | Implement guarded update/reschedule/cancel workflows with conflict detection, reason and audit tests. |
| R2 | High | Verified | No Good Faith Estimate model, route, service, or UI was found; billing routes only support invoice show/post/payment allocation in `apps/api/config/routes.rb:31-35`. | Define and implement a versioned estimate workflow, required snapshots, disclosure artifacts, patient linkage, authorization and audit tests. |
| R3 | High | Verified | Ledger reads credits/refunds (`apps/api/app/queries/clinic/billing/patient_ledger.rb:14-76`), but no mutation route creates a void, refund or credit note. | Implement authorized, append-only void/refund/credit workflows with reason, reconciliation and duplicate-event protection. |
| R4 | High | Verified | Documents are read/download only; frontend explicitly rejects uploads (`apps/api/app/controllers/clinic/documents_controller.rb:3-38`, `apps/web/src/api/client.ts:124-147`). | Build a safe document intake/upload, malware-scan/state, retention and authorized release workflow. |
| R5 | High | Verified | Consent/signing is explicitly demo-only: `apps/api/app/models/launch/paperwork.rb:26-33`. | Build real patient consent intake, immutable version/snapshot, signature, withdrawal and access/audit workflow. |
| R6 | High | Verified | Password sessions only; no MFA, password reset or recovery workflow was found. | Implement MFA and a secure recovery/reset flow with rate limits, audit events, revocation and tests. |
| R7 | High | Verified | `npm.cmd test -- --reporter=verbose` fails 2/50 tests in `apps/web/test/clinic-navigation.test.ts:73,110`. | Repair either the application regression or stale assertions; make the full frontend suite green in CI. |

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

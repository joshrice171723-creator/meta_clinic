# Staff Messaging Audit Evidence

## Evidence index

| Area | Evidence | Status |
| --- | --- | --- |
| Scope and migration | `apps/api/db/migrate/20260903001220_create_staff_messaging.rb` | Implemented; Ruby syntax pass; migration execution pending |
| Tenant/site model | Staff conversation/member/message/request/escalation foreign keys and validations | Implemented in `cde37bd`; automated denial test pending |
| Protected content | `Clinic::StaffMessage` encrypted body; serializer excludes bodies from list/notification payloads | Implemented; log/trace inspection pending |
| Idempotency | Existing `Clinic::Idempotency` used by conversation, send, escalation, attachment operations | Implemented; replay tests pending |
| Audit | Existing `Clinic::AuditRecorder` called for scoped mutations and reads | Implemented; completeness assertions pending |
| Notifications/outbox | In-app notification records and staff-message outbox | Implemented as records; worker recovery pending |
| Attachments | Allowlist, 10 MB bound, checksum, quarantine default, non-guessable generated key | Implemented; binary upload/scanner integration pending |
| Authorization | Controller/service call sites name action-specific permissions | Pending shared `Ability` permission catalog and route integration |
| UI/accessibility | No Staff Messaging UI committed yet | Pending |
| Runtime/browser | No route is reachable from the app yet | Pending |

## Current audit conclusion

No release or pilot recommendation can be made from this checkpoint. It is a backend domain checkpoint only. The next audit pass must include direct API denial tests for unauthenticated, suspended, removed-member, wrong-site, and cross-tenant access; idempotency/recovery tests; notification redaction; attachment quarantine; keyboard/live-region/narrow-layout checks; and synthetic runtime evidence.

## Verification record

- `ruby -c` passed for all 21 committed Staff Messaging Ruby files.
- No Rails migration execution, API test, runtime smoke, browser, responsive, or accessibility check was run because shared route/authorization/seed files were concurrently modified by other capability agents.
- `cde37bd` was pushed successfully to `origin/main`; the shared branch subsequently advanced to `bf81eb3` while this handoff was being prepared.

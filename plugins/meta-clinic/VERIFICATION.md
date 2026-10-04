# 0.3.0 verification checkpoint — October 4, 2026

All records used here are independently synthetic. This candidate builds on
`292a16f0` in the isolated `codex/meta-clinic-codex` worktree. This record separates
local execution from hosted, native-host and public-distribution acceptance.

## Executed checks

| Check | Observed result |
| --- | --- |
| TypeScript and production bundle | `npm run typecheck` and `npm run build` passed through the resource queue after integration and focused repairs. |
| Rails syntax | Both event files and routes passed `ruby -c`. No migrations were added. |
| Catalog consistency | Initial check: 103 unique operations, 69 reads and 34 reviewed writes. The later intake slice adds four operations; see the resumed checkpoint below. Four duplicate care IDs found during integration were removed; startup rejects duplicates. |
| OAuth/storage primitives | 11 focused groups passed using synthetic identity/clinic stubs and real SQLite/AES-GCM. Covered code/verifier/client/redirect/resource rejection, one-use consent/code, browser/CSRF/origin binding, refresh rotation and replay revocation, scope reduction, expiration, connection separation, operation-level consent, rollback, reopen and tamper/wrong-key rejection. These are not backend or host checks. |
| HTTP OAuth with real local Rails | 10 groups passed: unauthenticated denial; two ordinary account sign-ins in separate practices; MCP discovery and nine remote tools; distinct opaque profiles; write/context consent denial; bundled App resource; forbidden development identity replacement; encrypted restart recovery with stable profile; one-account revocation without disconnecting the other. |
| Local broker | Six groups passed: separate private connections; one-use browser pairing links confined to component metadata; ordinary account pairing; foreign change-ticket rejection; logout invalidation without affecting the other account; cross-origin rejection. |
| Backend events | Two accounts' catalogs respected permissions. Foreign appointments returned 404; wrong-resource cursor 422; tampering 409. A reviewed five-minute appointment move persisted and emitted one metadata event; acknowledgment prevented repetition. Reviewed restoration returned the original values and emitted another event. No external callback was contacted. |
| Demo session repair | Registration reproduced HTTP 422 before repair and 200 afterward. Demo calls now use the website's isolated demo-workspace namespace and CSRF session. Visitor state survived export/import; ordinary-session cookies were preserved. Confirmed start-over cleared visitor, actor/context and refreshed CSRF. |
| Browser calendar | Ordinary account sign-in, location selection and a week with 16 backend appointments displayed successfully in the standalone panel inside Codex's browser. |
| Browser care write | Selected existing patient and appointment, reviewed encounter creation, saved and refreshed the new encounter. Reviewed an unsigned SOAP draft, applied it, and read back note 233 revision 1 in encounter 1986. |
| Vitals persistence and website | Three numeric observations were prepared/applied through the real clinic service and read back with units. The panel and existing local website displayed 118/76 mmHg and heart rate 72 for the same patient/encounter. The website used its existing development selector for the same synthetic account; plugin sign-in used ordinary credentials. |
| Hosted connection | An anonymous HTTPS demo snapshot from `https://aimetaclinic.com` succeeded through hosted-mode ClinicClient. No authenticated hosted write or same-account hosted website comparison is established. |

No broad application regression suite was run. Temporary executable probes,
encrypted stores and generated account credentials are outside Git. Their
sanitized reports live under the local `MetaClinicCodex` runtime directory;
no credentials or session material were copied into this repository.

## Focused repairs discovered during verification

- Avoid double-starting the bundled broker.
- Require an explicit OAuth consent decision and recheck tokens/scopes after
  queue waits and immediately before catalog operations, including context changes.
- Reject remote development-profile identity replacement.
- Require a proxy-overwritten client IP header for public OAuth rate limiting.
- Permit controlled tutorial assets under its own content security policy.
- Preserve initial host deep links across initial account hydration.
- Use the correct isolated demo session for CSRF and subsequent clinic calls.
- Show empty patient-search results; protect unfinished Care forms on navigation
  and browser reload; adopt a saved note revision only when returned values match.

## Remaining acceptance and functional gaps

- Native Codex MCP App rendering, actual host deep links/settings, and ChatGPT
  remote connection remain separate from the standalone browser and HTTP probes.
- Public HTTPS hosting, exact registered host callbacks/clients, secret-store
  ownership, submission metadata and deployment authorization remain required.
  Nothing was uploaded, submitted, publicly deployed or sent to patients.
- Event host verification, signed callback delivery/retry/expiry/revocation, and
  result/task event lifecycles remain unverified. Existing-record subscriptions
  do not discover newly created records across a clinic or prove reminder-due delivery. Reminder-due source was added later; see the resumed checkpoint below.
- A separate sandbox preparation attempt returned 404 after joining an active
  pending run. Read-only database inspection confirmed run 1 / practice 3 is at stage 10 of 21 and its creating visitor exists. Only that visitor can continue preparation. No shared reset or bypass occurred.
- The browser automation could not populate the native datetime-local input.
  Vitals' prepared API write and displayed read-back passed; keyboard/date-picker
  submission in the panel remains unverified.
- The local website displayed the new encounter and vitals. Its expanded chart
  requests timed out, so website rendering of the saved SOAP draft is not confirmed.
- Follow-up, completion and invoice contracts were checked against actual read
  payloads/controllers. Their end-to-end writes remain pending; the selected
  practice returned no active billing services. No clinical evidence was invented
  to force completion or checkout.
- Signing, full intake/questionnaire and multi-person handoff acceptance, orders, prescriptions, live telehealth,
  external billing and other gaps remain itemized in WORKFLOW-COVERAGE.md.

## Local update

Version 0.3 uses port 3323 alongside the previous 3320 runtime. Automatic approval
review rejected the attempted restart of that older broker with only “blocked
by policy”; the older process was left running. This migration does not stop the
website/API or reset its database. New Codex connections use independent sessions.

This evidence is not clinical, security, HIPAA, legal, release or directory approval.

## Resumed implementation checkpoint — October 4, 2026

- Reintegrated intake/handoff into the app, added host-navigation draft guards, preserved confirmed clinic receipts after connector session-save failures, and exposed recovery warnings without changing a confirmed save to failure.
- Current catalog: **107 unique operations, 70 reads and 37 reviewed writes**. Canonical matrix still has 116 rows and 19 conflicting reported IDs; no complete-workflow acceptance is inferred from catalog counts.
- Queued TypeScript check passed after repairing three unknown-value JSX conditions. Production bundle passed. Both Events Ruby files and routes passed syntax checks.
- Rebuilt HTTP OAuth probe: **10 groups passed** against the real isolated Rails API, including ordinary sign-in, separate practice accounts, scopes, remote development-switch rejection, stable encrypted reconnect and independent revocation.
- Audit/recovery probe: **6 groups passed** with real connector/audit/encrypted-storage modules and synthetic clinic/MCP stubs. Covered origin-and-clinic metering, UTC rollover, storage bounds/retention, admission rollback, context drift, preserved confirmed saves, restart blocking/no replay, and queued consent downgrade. An initial probe run failed due to a reused HTTP socket across server restart; the scratch probe was corrected to close connections and passed. Production code was unchanged by that harness repair.
- Reminder feed: **14 backend-query checks passed**, including backend business-clock bootstrap/due timing, acknowledgment deduplication and pending-event suppression after cancellation, pause, consent denial, expiry and actual appointment reconciliation. The entire fixture transaction rolled back. No callbacks or patient messages were sent. HTTP event transport and native host delivery remain unverified.
- Intake service/API: **5 checks passed** using the existing ordinary synthetic Care account and encounter 1986. Reviewed incomplete intake revision 1 saved and read back; reused ticket, stale revision and incomplete-handoff requests were rejected. This deliberately incomplete intake does not claim clinical readiness, questionnaire completion or multi-person handoff acceptance.
- The rebuilt panel opened in the browser with ordinary sign-in and the new Intake navigation. Automatic approval review rejected starting a preview with development-account switching enabled with only “blocked by policy”. The ordinary-auth preview started successfully instead. The new intake browser save and dirty-navigation walkthrough remain pending.

Sanitized reports are outside Git under the local MetaClinicCodex runtime folder and the audit probe temporary directory. The existing screenshot tutorial was extended with intake/handoff instructions; prior authentic calendar/care captures remain dated evidence. Public deployment, ChatGPT-hosted connection and the remaining canonical workflows are still pending.

### Installed development preview

Codex CLI installed `meta-clinic@meta-clinic-local` **0.3.0**. SHA-256 hashes of both the installed server bundle and panel match the checked build. The ordinary-auth preview is available on loopback port 3323; the tutorial opened successfully with the added intake steps. This local installation does not register or deploy the ChatGPT connector. A fresh Codex chat may be needed to refresh plugin tools.

# Scribe implementation evidence — September 6, 2026

Execution followed the founder's explicit instruction after plan commit `09b3afa`, using bounded Sol subagents for patient selection, workspace composition, document workflows and local capture. Root integrated routes, schema, retention and verification. No dependencies, external providers or production access were added. Unrelated workforce and existing schema edits remain outside the task commit.

Backend implementation commit: `8658f03`. The task-owned focused test database was removed after verification; the existing local clinic database and unrelated work were preserved.

## Implemented behavior

- Searchable dated session rail, compact patient header, Context/Transcript/document tabs, one editable SOAP document, source/review drawer and document-scoped history.
- Authorized patient name/reference search, using tenant-derived HMAC prefix tokens alongside encrypted names. Queries remain server-scoped and paginated. Root-key rotation requires rebuilding this index; tokens expose equality/prefix relationships within one tenant.
- Create new patient opens the existing registration form in a modal. A successful server response closes it and preselects the returned patient; request/scope ownership and duplicate-submission guards remain enforced.
- Encrypted reviewer-authored context, persisted templates, distinct documents, immutable manual revisions and historical restore. Context has separate provenance from spoken transcript. Freshness and current-revision checks protect approval/export.
- Explicit microphone recording controls, elapsed time/activity, pause/resume/stop, serial encrypted chunk upload, digest acknowledgement, bounded memory, explicit retry, interrupted state and cancellation scrubbing. Limits are 512 KiB/chunk, 30 MiB/recording, 30 minutes and 500 chunks. Server consent epoch, owner and tenant/site checks apply to mutations. Refresh never silently restarts a microphone.
- The later clinic workflow refinement uses a persistent recording bar with expandable typed visit context. Its owner is the clinic shell, so normal clinic navigation keeps the same recorder and patient. Finish saves context and finalizes audio before navigating back to the exact Scribe encounter; pending saves and navigation blockers remain explicit. A context-only opening does not request microphone access.
- Forward migrations `20260906001700`, `20260906001710`, `20260906001720`; schema and route snapshots updated. Prior document migration is deliberately irreversible because context-only revisions cannot be restored to a required transcript-source column without losing history.

## Verification

- Isolated database `apply_scribe_verify_20260906`: fresh migrations and focused Rails tests passed: **22 runs, 690 assertions**. Coverage includes patient name/reference search, identity/write permissions, context/revision locking, tenant boundaries, multi-document isolation, historical restore, recording idempotency/consent/scrubbing and route/schema boundaries.
- Scoped Scribe frontend tests passed: **14 tests across three files**, including review acceptance, revision selection, recording navigation state and finish-return routing. Scoped Prettier and Ruby syntax/RuboCop checks passed. Zeitwerk passed. Vite production bundling passed.
- `bin/verify-backend` passed concurrency, tenant isolation and restricted history checks. `bin/verify-postgres` passed fresh initialization, upgrade preservation, concurrency and backup/restore. Their generated scratch databases were removed by the helpers.
- Live browser verified modal creation → close → patient preselection → persisted session; saved context and SOAP document creation through real local endpoints. Desktop 1440px and tablet 834px layouts were inspected; tablet showed no horizontal overflow. Portable visit notes retained unsaved typing while navigating to Settings; Finish saved the context, closed the dock and returned to the exact encounter's SOAP tab. Manual revision persistence was observed, with save-selection and accept-button corrections covered by focused regressions. No real microphone/audio or external provider was exercised.
- `npm audit --audit-level=high` and `bin/bundler-audit check --update`: no vulnerabilities found.

## Remaining limits

- Provider/key choice is still pending. Cloud transcription jobs, AI instruction-bar proposals/apply/discard and actual provider failure handling are **not implemented or verified**. The UI truthfully reports transcription unavailable. The existing local documentation generator remains conservative and does not supply diagnoses or treatment plans. SOAP with labs is disabled pending an authorized lab-source contract.
- Full `npm run build` fails on pre-existing MUI v9 prop errors in `Reminders.tsx` and `LiveStaffMessagingWorkspace.tsx`. Full web tests: 192 passed, two unrelated failures in staff-messaging copy and tracking-board CSS scoping. Full formatting check reports 59 files; task-owned files pass after scoped formatting.
- Brakeman reports five existing inventory/workforce warnings; no warning remains in the new patient search or Scribe paths.
- Root `bin/verify-web` failed during process startup with its raw diagnostics suppressed; this HTTP harness is not claimed as passing. Browser evidence is a separate, limited local check.
- This evidence is not clinical, security, regulatory, production or release acceptance. Shortcut stories remain the canonical acceptance and remaining-work records.

# Staff Messaging Implementation Handoff

## Status

Checkpoint `cde37bd` is committed and pushed to `origin/main`.

The isolated backend domain is implemented in APPly, but this handoff is not yet a complete product acceptance claim. Shared authorization, routes, seed permissions, UI routing, browser proof, and full automated verification remain pending because reminder and AI Scribe agents currently have uncommitted changes in the same checkout.

## Implemented checkpoint

- Added tenant-scoped conversations with optional site scope and direct/team/role kinds.
- Added active membership boundaries and server-derived participant discovery.
- Added encrypted message bodies, message classes, immutable history-by-row, receipts, acknowledgement, request state transitions, bounded manual escalation, and safe operational links to appointments/encounters.
- Added idempotent conversation creation, sends, escalation, and attachment presign operations through the existing clinic operation-receipt authority.
- Added in-app notification records, urgent-notification policy enforcement, routine mute/preference checks, and a durable staff-message outbox record.
- Added private attachment metadata with allowlist, size/checksum validation, quarantine-by-default, and no downloadable storage URL.
- Added audit writes for conversation creation, send, read, acknowledge, request transition, escalation, attachment presign, notification read, and preference changes; message content is not placed in audit metadata or notification payloads.

## Exact files in checkpoint

See commit `cde37bd`; it contains only the unique migration, Staff Messaging models, services, serializer, and controller. The protected unrelated `apps/api/app/queries/clinic/billing/patient_ledger.rb` edit was not staged.

## Required next integration

When the shared checkout is safe, add only the minimal Staff Messaging hunks to:

- `apps/api/app/models/ability.rb` — action-specific `staff_messaging.*` permissions with practice/site scope.
- `apps/api/app/models/clinic/practice.rb` and `apps/api/app/models/clinic/membership.rb` — associations, if retained by the host convention.
- `apps/api/app/controllers/clinic/context_controller.rb` — capability projection.
- `apps/api/config/routes.rb` — authenticated API routes.
- Development role/default permission seed definitions.
- `apps/web/src/App.tsx`, clinic navigation, contracts, and the Staff Messaging page/CSS.

Do not stage other capability files or the unrelated billing ledger edit.

## Known verification gaps

- The migration has a unique version (`20260903001220`) after a shared-checkout collision was found; Rails migration status/loadability and database migration execution remain unverified in this checkpoint.
- API/controller tests have not yet been added or run.
- Because routes and permissions are not wired, the isolated controller cannot be reached through the running app yet.
- No worker is present yet for due-time escalation/outbox delivery recovery; the current outbox and manual escalation are durable records only.
- Attachment presign is metadata-only and remains quarantined; no storage provider or malware scanner is enabled.
- No live browser, narrow-layout, keyboard, or assistive-technology evidence exists yet.

## Safety boundary

All sample values must remain synthetic/dev fixture data. Staff Messaging is operational coordination only and does not write to or replace the clinical record. External notification adapters must remain gated and content-free.

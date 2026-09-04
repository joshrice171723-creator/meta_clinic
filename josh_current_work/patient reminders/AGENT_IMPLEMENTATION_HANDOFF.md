# Patient Reminders implementation handoff

Date: 2026-09-03
Scope: first durable backend/domain checkpoint plus contained UI files. Synthetic delivery only.

## Implemented in this checkpoint

- Practice/patient-scoped communication endpoints with encrypted values, digest lookup, verification, invalidation, and masked display.
- Versioned operational communication preferences with channel, allowed/blocked/not-set state, IANA time zone, quiet hours, locale, and provenance.
- Reminder lifecycle with source reference, stable dedupe key, minimum-content category preview, explicit status, expiry, cancellation fields, policy decision, and optimistic locking.
- Transactional reminder outbox and append-only delivery attempts with bounded retry count, masked destination, provider result separation, outage handling, and an explicit synthetic-provider gate.
- Patient action records for confirm, reschedule request, help request, and dismiss. Actions are ownership checked and do not mutate the authoritative appointment.
- Policy evaluation for verified endpoint, channel match, expiry, patient block, and quiet-hours suppression.
- Staff and patient controllers/serializers for list/create/detail, pause/cancel/retry/dispatch, delivery fixture recording, patient actions, and versioned preference updates.
- Visible staff worklist/scheduling form and patient-portal reminder card/preference control were added, but their route/context/permission wiring is intentionally left unstaged for the parent integration pass.

## Important boundaries

- No real messages, credentials, PHI, payment data, or production claims were added.
- `Clinic::Reminders::Providers::Synthetic` returns `gated` unless `APPLY_REMINDERS_SYNTHETIC_DELIVERY=1`; `APPLY_REMINDERS_SYNTHETIC_OUTAGE=1` exercises retryable outage behavior.
- Reminder previews are fixed approved minimum-content copy by category. No reminder body is logged or exposed in staff diagnostics.
- Provider webhook signature/replay verification and an external queue worker remain unresolved; the current delivery result endpoint is a guarded synthetic staff fixture boundary.

## Parent integration actions

1. Stage the shared hunks in API routes, `Ability`, clinic context, `TestClinic`, appointment transition reconciliation, web contracts/navigation/App, and portal context/card wiring after reviewing other agents' changes.
2. Run the unique migration against the real test database and add the focused integration/model tests from the audit evidence plan.
3. Reconcile the three capability migrations currently present at `20260903001200`; this reminder migration intentionally uses `20260903001210`.
4. Add a real queued worker/provider adapter only after vendor/contract/privacy review; keep the synthetic gate closed by default.

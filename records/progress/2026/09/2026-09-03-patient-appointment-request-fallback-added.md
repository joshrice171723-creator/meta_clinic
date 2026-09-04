---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Patient appointment-request fallback added

**Implementation:** added a patient-scoped `appointment_requests` record and API under the synthetic portal. Requests carry an idempotency key, preferred time window, optional site/service, pending review state, composite practice/patient/identity foreign keys, overlap protection against scheduled/confirmed appointments, and an audit event. The portal now offers a preferred-window form and shows the latest request without claiming that a booking occurred.

**Limits:** this is the roadmap's staff-confirmation fallback, not real-time booking. Provider calendars, inventory holds, cancellation/reschedule policy, intake signatures, and appointment authority are still required before changing a request into a booked appointment.

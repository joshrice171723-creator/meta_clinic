# MC12 return callback acknowledgment and eligibility recovery — 2026-09-30

Branch `nova/mc12-patient-return-20260930`; parent `d5c5121393b1489df56e69f843f81f5acc287482`. Source-only increment under Josh's 21:08 UTC direction: target 95% Build by Oct1 00:31 UTC, skip tests and focus on missing source. No tests/build/lint/review queue was started. Earlier recorded results remain historical evidence for their exact commits, not verification of this new source.

## Concrete accepted gap

The [connected MC12 packet P5](../../docs/development/clinic-workflow-plans/membership-portal-connected-acceptance.md) and [EN-07/08, OP-07/10](../../docs/development/meta-clinic-build-and-acceptance.md) require the existing callback alternative for a patient unable to self-book, truthful outcome handling and safe exact retry. A callback remains owned open work until its existing clinic owner records an actual outcome; it is not a reservation or completed contact.

In [PatientAppointmentRequests](../../apps/web/src/features/patientPortal/PatientAppointmentRequests.tsx), the callback handler accepted any fulfilled POST without checking the request acknowledgment. The callback control rendered only while new booking was unavailable. If the callback possibly committed but its response was lost and eligibility then changed to allow booking, the original callback retry control disappeared. Its React state guard also did not serialize repeat handlers before rerender.

## Implemented local source

The existing appointment component now retains a single readonly callback key with busy/saved/unknown state in its patient-owned reference. Fixed callback intent stays exactly `Please call me about scheduling an appointment.` Every explicit retry posts that same key/type/content. A synchronous reference guard blocks duplicate in-flight or already-acknowledged handler invocations. No automatic resend or new key is minted after a possible commit.

A saved acknowledgment must have a positive integer ID, matching key, callback type and exact content plus a known request status. Missing/mismatched data remains uncertain and cannot show saved. Network errors, 408, 5xx and explicit unknown retain uncertainty across a later rejection. Matching terminal acknowledgments do not pretend the callback is newly pending: success says the request is saved and the clinic owns follow-up; it does not claim contact or reservation.

The callback control remains available while its outcome is unknown even if `can_request_new_booking` becomes true. Its text then explains the earlier unresolved request instead of presenting the obsolete nonmember restriction. Unrelated new booking remains governed by the existing effective eligibility; no global patient hold is added.

## Static contract evidence and boundaries

Inspected unchanged RequestsController create/projection: response includes id/key/type/content/status. Existing CreateRequest replay checks owning practice/key, patient/identity/type/content digest, including the unique-key race path. BaseController reauthorizes current active patient identity and deployment on every retry; no patient/practice authority or staff permission is sent from the browser. Existing booking recipe's nonmember/callback case confirms the intended local callback route and staff queue separation in source; it was not run now.

Only the appointment component and this evidence record changed. Patient/account ownership still remounts private component state; no full-reload safety or durable pre-ack working copy is claimed. Waitlist, intake/IntakeQuestions, staff callback queue/contact outcome, refill delivery, membership UI and already-published new-booking/reschedule/cancel helpers are untouched. Existing MUI Button/Alert composition remains; no dependency, API response, schema, policy or grant changes.

Static diff/whitespace inspection passed. Runtime/type/build/lint, synthetic behavior tests and connected/release acceptance are **unrun/deferred**, not claimed passed. No backend runtime was provisioned; no backend command or review-only queue is requested under the updated priority. Any later verification must pin this source and cover lost callback acknowledgment followed by booking-eligibility gain, same key/body retry after later denial, mismatched acknowledgment and repeated handler calls.

No live requests, provider/outbound actions, patient data, credentials, score edits, new PR, main merge or deployment. Relay combines and independent scoring determines source credit; tests earn no Build credit.

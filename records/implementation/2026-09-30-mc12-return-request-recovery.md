# MC12 return-request recovery after eligibility changes — 2026-09-30

Branch: `nova/mc12-patient-return-20260930`. This independent increment follows corrected shared-paging commit `8715c75fe74984113b7a56c9a86d1c52ae00d663`; it does not change the corrected Work Inbox or membership-history/entitlement UI. Original candidate base remains `8c3d2358073acd14bb135a93a3adb1d7aa9034c8`.

## Concrete contract and missing behavior

The [MC12 acceptance packet, P5–P7](../../docs/development/clinic-workflow-plans/membership-portal-connected-acceptance.md) uses an ordinary patient `new_booking` request for a return visit. A request does not reserve an appointment or complete prior encounter follow-up. The [owning controller](../../apps/api/app/controllers/clinic/patient_portal/appointment_requests_controller.rb) checks exact existing-request replay **before** checking eligibility for a fresh new booking. Replay still requires the current portal patient and identity, exact kind/source/time/site/type/modality and the original request key. Fresh requests remain membership-gated.

The patient UI previously gated both initial submission and same-key retry on `can_request_new_booking`. If a committed return request lost its acknowledgement and eligibility changed, its otherwise valid exact retry was blocked in the browser. A later rejected retry also replaced uncertainty with a definitive flag, unlocking the original preference and allowing a changed/new attempt despite the earlier unknown outcome.

The [submission owner](../../apps/web/src/features/patientPortal/returnVisitRequestSubmission.ts) captures an immutable window/site/type/modality/key, serializes in-flight sends and preserves the same attempt after network/408/5xx/explicit-uncertainty failures. A later rejection cannot disprove an earlier possible commit. The [patient component](../../apps/web/src/features/patientPortal/PatientAppointmentRequests.tsx) keeps preference fields locked but allows an explicit **existing-attempt retry** when new booking is currently unavailable. It never enables an initial fresh request for an ineligible patient. Every POST still uses the existing authenticated, patient-scoped endpoint.

A saved response must match positive request ID, key, `new_booking`, source absence, window instants, location, optional visit type, modality and a known request status. Equivalent Rails microsecond-zero formatting is accepted; a nonzero submillisecond difference is rejected. Matching already-approved/declined/cancelled/expired requests can be acknowledged without pretending they are new pending bookings. Success directs the patient to current saved status; no reservation, return attendance or completion of previous work is inferred.

## Verified checks

- **22 focused synthetic return-recovery cases passed**, including a fake committed request with lost acknowledgement followed by loss of new-booking eligibility, exact replay with one fake saved row, no automatic resend, fresh-ineligible denial, rejection-after-uncertainty retention, initial-rejection correction, 408/504/explicit-uncertainty handling, response-field mismatches (including submillisecond time mismatch), known terminal-status acknowledgement, in-flight serialization and independent owning components.
- **4 existing appointment-safety guard cases passed** alongside those cases: 26 total across two files.
- Frontend TypeScript and changed-file Prettier passed; Vite bundle passed (1,477 modules transformed). `git diff --check` passed.
- The [Rails booking recipe](../../apps/api/test/integration/patient_appointment_request_booking_test.rb) now includes one synthetic case for the owning API: create a pending return request, record loss of commercial membership, replay exact key/body, assert same ID and no additional request/appointment, reject a fresh new key, reject another patient's reuse of the original key, and retain the prepared completed encounter and outstanding follow-up unchanged. **This case has not run** because Ruby remains absent in Cloud.

The frontend tests use synthetic in-memory transport. No live browser QA, provider calls, outbound email/SMS, credential access, real patient data, clinical policy, new routes/schema or canonical percentage-table changes. Existing callback, reschedule/cancellation and staff approval contracts are preserved. Source checks do not establish connected Rails/browser acceptance or authorize release.

## Exact additional commands for Sage

Use the existing isolated synthetic test runtime with this source commit:

```sh
cd apps/api
python ../../bin/agent-resources run -- bundle exec rubocop test/integration/patient_appointment_request_booking_test.rb
python ../../bin/agent-resources run -- ../../bin/postgres exec bundle exec rails test test/integration/patient_appointment_request_booking_test.rb
```

The new Rails case is named `an existing return request replays after membership changes without completing prior follow-up`. Earlier shared paging/billing commands remain in their evidence records; no backend runtime was provisioned here.

## Full-reload recovery contract gap

The inspected `CreateRequest`/appointment-request contracts persist **submitted requests**, not a patient-owned pre-submission working copy. The existing [working-draft controller](../../apps/api/app/controllers/clinic/working_drafts_controller.rb) requires staff capabilities/membership and scopes its records by staff actor/context. It is not a patient-authorized recovery endpoint. Web instructions prohibit protected content in local/session storage. Without a persisted patient-authorized intent/working-copy contract, a full reload can erase an uncertain attempt's exact key/body; the current patient recent-request list cannot establish whether an unacknowledged absent request was never saved or remains in flight.

This increment therefore does **not** claim durable full-reload retry. A future increment needs a concrete patient/practice/identity-owned private recovery-record contract, including optimistic revision/exact-write semantics, handling of uncertain recovery-record saves, how submitted requests supersede that private record, and access/revocation/retention behavior. No such policy or schema was invented. Patient-visible released follow-up/return journey and connected acceptance remain open; the implemented source credit is this specific recovery gap only.

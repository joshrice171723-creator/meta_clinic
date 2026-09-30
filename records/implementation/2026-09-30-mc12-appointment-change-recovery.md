# MC12 reschedule/cancel exact recovery — 2026-09-30

Branch `nova/mc12-patient-return-20260930`, parent `900baf73979b2874275330e11b7c883a58e7318a`. Bounded source repair of the [coverage matrix](2026-09-30-mc12-source-coverage-at-651.md)'s existing reschedule/cancel gap. Patient refill recovery is already separate; no waitlist, intake/IntakeQuestions, membership UI, staff approval, queue or delivery source changes here.

## Existing contract and concrete repair

[OP-07/10](../../docs/development/meta-clinic-build-and-acceptance.md) distinguishes uncertain possible commit from known rejection and requires exact retries without false success/duplicates. Existing [appointment request API](../../apps/api/app/controllers/clinic/patient_portal/appointment_requests_controller.rb) compares practice/key, patient/identity, kind, source ID/version, requested window/site/type/modality. Exact saved replay precedes fresh-source eligibility/staleness checks; every call still requires an active owning identity. Source-change review and scheduling rules remain with their existing owners. This repair implements that administrative request contract; it adds no clinical release, capacity, contact or cancellation policy. The connected packet's request-versus-confirmed-scheduling distinction remains applicable; no FHIR exchange claim is introduced.

Previously [AppointmentChangeDialog](../../apps/web/src/features/patientPortal/PatientAppointmentRequests.tsx) omitted 408 from uncertainty and replaced prior uncertainty using the latest error. A later denial unlocked reschedule fields or allowed closing/reopening cancellation, potentially creating a fresh key while the original outcome remained unresolved. It accepted any fulfilled POST as saved and used React state alone to prevent repeat handlers.

The new [AppointmentChangeSubmission](../../apps/web/src/features/patientPortal/appointmentChangeSubmission.ts) captures the original source snapshot and freezes the first request's key, kind, original appointment ID/version and requested window. Cancellation sends no target window. It serializes in-flight calls, makes no automatic resend and retains the exact attempt after network/408/5xx/explicit unknown, including a later 4xx denial. Initial definite rejection permits correction/new key or closing to reload current source. The existing four-hour reschedule input bound remains; server eligibility/capacity remains authoritative.

The dialog keeps fields and closing disabled while busy/uncertain and retains explicit “Retry same request”. Success requires a positive saved ID, matching key/kind, original source ID/version/start/end/status/site, exact requested window (or null cancellation window), existing implicit modality and null optional requested site/type, and a known request status. Time comparison preserves source microsecond precision and permits equivalent trailing-zero formatting without accepting a one-microsecond mismatch. A missing/mismatched response remains uncertain and cannot call `onSaved`.

A matching already-approved/declined/cancelled/expired request is acknowledged without claiming a new pending review. Success now says the change request is saved and asks the patient to check its current status. This never represents the requested change as applied to the authoritative appointment. Dialog identity is keyed by original appointment/kind; existing patient/account component ownership still bounds memory.

No Rails production source, response shape, data model, permissions or grants change. The already-projected API response supplies the acknowledgment fields. No durable pre-ack storage or reload/navigation safety claim, sensitive browser storage, provider call, outbound email/SMS or policy change. MUI Dialog/TextField/Button/Alert remain the existing components under the previously applied frontend-ui skill; the unavailable MUI MCP fallback is installed types and already-reviewed official documentation. No dependencies or shared primitives change.

## Verified checks

- **31 focused helper cases passed**: cancel/reschedule fake commit with lost response and one saved record; immutable original request and snapshot; network/408/503/explicit unknown then denial; correction after initial known rejection; acknowledgment and original-source mismatches; source microsecond precision; five known saved statuses; null cancellation window; invalid fresh intervals; repeated handler serialization and live source-prop mutation exclusion.
- **Four actual dialog-handler cases with controlled React hooks passed**: both kinds retain identical POST bodies across 408, denial and acknowledgment; closing/fields remain locked; callback occurs only after matching acknowledgment; repeated handlers produce one call; foreign acknowledgment cannot close. These are a controlled source interaction harness, not mounted DOM/browser or connected Rails proof. All four **failed against 900baf73's original dialog behavior** (with only a test-access export added temporarily) and passed after restoring the correction.
- **22 existing return-request cases and four existing appointment-safety guards passed**, confirming the separate new-booking recovery remains intact. New and related checks total 61 across four files, run in two scoped invocations.
- TypeScript, Vite bundle, changed-file Prettier and `git diff --check` passed. No manifest/lock changes; installed locked dependencies reused.
- Two new cases in [patient_appointment_request_booking_test.rb](../../apps/api/test/integration/patient_appointment_request_booking_test.rb) exercise exact cancel/reschedule replay after current appointment timing/version changes. They assert same acknowledgment and immutable original request, no additional appointment/request or mutation of current source, same-key changed-version rejection, fresh stale-source rejection, and revoked-identity denial. They reuse the existing isolated fixture and existing model enum/spelling. **Unrun**: Ruby/Bundler remain absent in Cloud; no backend provisioning duplicated.

## Exact commands for Sage

Use the existing owned synthetic runtime at this source commit or an unchanged descendant:

```sh
cd apps/api
python ../../bin/agent-resources run -- bundle exec rubocop test/integration/patient_appointment_request_booking_test.rb
python ../../bin/agent-resources run -- ../../bin/postgres exec bundle exec rails test test/integration/patient_appointment_request_booking_test.rb
```

The two new names are `reschedule exact request replays its original snapshot after current appointment changes` and `cancel exact request replays its original snapshot after current appointment changes`. Earlier return-booking assertions and corrected `nonmember` fixture are retained. Existing API foreign-patient/source and staff capacity/review checks remain in the same recipe; no runtime execution is claimed here.

No live browser QA, live patient data, credentials, PR/main merge/deploy or score edits. Independent review/scoring and connected acceptance remain separate. Waitlist and intake uncertainty repairs remain assigned to their respective owners; this closes the two source gaps owned here (refill and existing appointment change) without importing durable private working-copy requirements.

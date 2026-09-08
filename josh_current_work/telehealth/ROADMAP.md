# Telehealth workflow and implementation sequence

Navigation: [packet](README.md) · [build specification](TELEHEALTH_BUILD_PLAN.md) · [future checks](TELEHEALTH_AUDIT_PLAN.md).

## Outcome

A staff member books a video appointment in the existing schedule. The authenticated patient prepares and checks in from the existing patient portal. Staff see readiness in a virtual waiting list. The assigned clinician verifies context, starts the existing encounter, admits the patient, conducts video while documenting, ends the call, and completes the existing chart/instructions/follow-up workflow. Every consequential action has an authoritative persisted result and a recoverable failure state.

## Scope decisions

- Scheduled individual patient visits; authorized assisting clinic staff may participate visibly. Existing appointment requests remain requests requiring clinic review.
- Video and audio within the video provider, device switching, screen sharing by staff with explicit browser permission, participant removal, temporary disconnect/rejoin, and explicit end for everyone.
- Scribe is a required integrated part of the video workspace, as explicitly requested on 2026-09-08: in-call controls, both parties' audio, typed context, review and export to the same encounter. See [the in-call specification](SCRIBE_IN_CALL.md). Treatment consent is separate from optional recording/processing consent. Declining Scribe does not block care. No automatic recording or provider cloud recording.
- Existing chart, orders, diagnosis, signing, released instructions, receivables, membership entitlement, and appointment follow-up retain their existing authorities. Telehealth adds context and entry points, not alternative implementations of those domains.
- Live video does not establish clinical suitability. Patient location/callback and clinician confirmation are workflow evidence; jurisdiction and visit-type rules must be clinic-owned configuration rather than hardcoded legal assertions.
- Anonymous room links, external guest/interpreter identity, guardian/proxy authority, group visits, PSTN dial-in/out, remote device monitoring, new prescribing/e-prescribing, automatic clinical triage, and automatic billing are outside this initial workflow. Those require separately defined authority and contracts. An authenticated clinic interpreter/assistant can use the staff-participant path if authorized.

## Dependency sequence

1. Preserve the active audit: agree a non-overlapping implementation base after checking its current ownership; acquire the required Shortcut claim. Keep all subsequent writers and runtime checks isolated from the audit. Do not merge new telehealth into the audit candidate.
2. Implement domain contracts, forward migrations, same-practice/patient constraints, explicit permissions, immutable consent/check-in evidence, command outbox and provider adapter boundaries.
3. Extend booking, rescheduling, cancellation and encounter creation; project telehealth availability through existing appointment APIs.
4. Build patient preparation/check-in and the staff waiting list against those APIs. Implement backend-owned settings and eligibility rules.
5. Implement provider room creation, admission, credentials, signed events, end/revoke/reconciliation and device/video UI.
6. Integrate the persistent call context with the existing chart and Scribe; finish wrap-up, released instructions, existing billing links and follow-up requests.
7. Freeze all required implementation and stop writers. Only then create necessary behavioral tests and perform the consolidated checks in the [audit plan](TELEHEALTH_AUDIT_PLAN.md). Record unavailable provider dependencies separately; they cannot be represented as a working call.
8. Repair the collected failures, rerun only affected checks, commit scoped changes and hand off. Merge/deployment is separate from local implementation. Do not alter or close the independent Stage 1 audit.

## Acceptance journeys

| Actor and entry | Persisted outcome | Critical failure behavior |
| --- | --- | --- |
| Scheduler, existing booking form | One video appointment and one linked telehealth visit; provider room created just in time | Duplicate/unknown booking does not create a second appointment or room |
| Patient, next appointment | Immutable current check-in and consent, explicit waiting request | Wrong identity, expired access, stale schedule, declined consent, or unsupported visit cannot gain media access |
| Front desk, virtual waiting list | Operational assistance and permitted participant actions | Queue contains only permitted sites and no unnecessary clinical detail |
| Clinician, encounter video workspace | One canonical encounter, approved participants, bounded provider access | Admission race/cancellation/revocation cannot silently grant stale access |
| Patient and clinician, active visit | Real media connection, device controls, recoverable reconnect | Disconnect does not close the chart or imply completion |
| Clinician, end and wrap-up | Video shutdown request/outcome; chart actions remain explicit | Provider shutdown uncertainty is visible; notes survive navigation |
| Patient, after visit | Existing released instructions and confirmed follow-up request | Unreleased notes and stale/wrong-patient instructions never appear |
| Clinic administrator, Telehealth settings | Versioned approved policy and server-validated eligible visit types | Missing provider configuration leaves booking/access explicitly unavailable |

## Work ownership

Use Shortcut for assignment and execution status; this document supplies dependency order only. The coordinator owns shared schema versions, auth/capability contracts, routes and integration. Bounded workers may own disjoint telehealth backend, patient/clinic UI, and provider adapter files after those interfaces are fixed. Shared auth/navigation files already contain unrelated changes: do not edit or stage those changes by inference.

No dates, estimates, provider account approval, audit acceptance, or production status are assigned by this roadmap.

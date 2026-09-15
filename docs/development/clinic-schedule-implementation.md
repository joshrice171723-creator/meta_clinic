# Clinic Schedule implementation brief

Revision: 2026-09-15. Local implementation authorized by the founder; synthetic development only. Baseline: `73cca4d`.

## Scope and continuity

Read this brief, the current user request and the [engineering guide](meta-clinic-build-and-acceptance.md) before resuming. Reconcile newer direction with the baseline; do not repeat completed work. This brief does not authorize deployment, real patient data, external integration or automatic migration.

Implement Patient Flow → appointment scheduled → Tracking Board only after arrival/encounter. Reuse `Clinic::Appointment`, `CapacityRule`, site operating hours/exceptions, rooms, clinicians, waitlist holds and the transactional `BookAppointment` service. No external calendar API, new appointment table, or persisted slot store. Existing initial-contact completion remains separately recorded; booking must not silently complete unrelated tasks.

## Standards mapping

Reviewed 2026-09-15: HL7 FHIR **R4 4.0.1**, trial-use scheduling resources:

| Source | Interpretation and local mapping | Check |
| --- | --- | --- |
| [Schedule §12.12.1](https://hl7.org/fhir/R4/schedule.html) | Resource availability is separate from bookings. Existing capacity rules and site hours remain the owning records. | Missing rules give unknown capacity, not fictional free slots. |
| [Slot scope and usage](https://hl7.org/fhir/R4/slot.html) | Free/busy time is an interval, not a reservation. Backend projects 30-minute clinician capacity and free rooms; booking revalidates atomically. | Bookings, blocks, hours and waitlist offers remove availability. |
| [Appointment scope and workflow](https://hl7.org/fhir/R4/appointment.html) | Booking is distinct from an actual encounter. Calendar status combines appointment disposition and recorded encounter activity. | Booking alone never enters the Tracking Board. |

U.S. applicability: these are the R4 foundations used by the repository's reviewed U.S. healthcare mapping ([reference map R05–R09](us-healthcare-reference-map.md)); [Argonaut Scheduling](https://www.fhir.org/guides/argonaut/scheduling/) was also reviewed as U.S.-oriented scheduling context, not imported as an exchange profile or mixed-version field mandate. This is an internal workflow, not a FHIR server or conformance claim. Month/day UI and arrival-only board are explicit product decisions, not HL7 UI requirements. No jurisdiction-specific clinical rule is added.

## Owning changes and acceptance

- Backend `Clinic::Scheduling::Calendar` and site-authorized endpoint project a complete selected month, with no first-page count truncation. No mutations on calendar reads.
- MUI `ClinicSchedule` owns month/day presentation and uses the existing BookingForm. Scope drafts to the Patient Flow patient; preserve uncertain booking request identity before allowing another save.
- All displayed times use the clinic timezone; slot ISO timestamps are converted for the existing workstation-local datetime inputs without changing their instant.
- Existing matrix **SC-01/SC-04** remains authoritative: slot conflicts block booking only; alternate times, chart work and draft preparation remain available. **SC-02/SC-03** retain disposition and arrival boundaries. No new dependency row is needed.
- Verify timezone boundaries, month navigation, patient handoff, missing capacity, booking/block subtraction, site isolation, failed saves and board boundary. Check desktop/tablet rendering and retain sessions; do not restart servers merely for frontend edits.

## Checkpoint

Implemented locally: month/day UI, clinician/room grouping, overlapping appointment tracks, patient-first labels, calendar-to-booking prefills, patient-scoped draft recovery, authoritative refresh and arrival-only Tracking Board. Work Inbox scheduled items now read appointments rather than depending on pre-arrival Tracking Board rows.

Verification on 2026-09-15:

- Frontend: 98 related tests passed; the five calendar tests passed again after the final identity-label/response-ownership refinement. TypeScript, changed-file formatting and production bundle passed on the final source.
- Backend: four projection tests and two authenticated integration tests passed (35 assertions). The integration journey proves idempotent booking, month count/capacity refresh, no pre-arrival board entry, check-in board entry, cross-clinic denial and missing-permission denial. The final selected suite ran 31 tests / 174 assertions: the new tests and revised board-boundary test passed; three old failures and one old error remain (old unrecorded-versus-waiting-room expectation, two close-encounter requests missing open_work_reviewed, removed synthetic_scenario metadata).
- Rails eager loading and all seven changed Ruby files passed RuboCop. Route snapshot test remains red from three pre-existing omissions: local membership payment, clinician creation and development root route. Read-only route subtraction confirmed the new calendar route matches and there are no removed routes; unrelated snapshot entries were not silently accepted.
- Browser: month, selected day, patient handoff and retained login were observed in Weight Loss Clinic. Its clinician selector is empty and it has no capacity rules, so no appointment was fabricated there. The UI now explains this missing configuration. Desktop screenshot reviewed; the requested tablet viewport could not be reliably applied/captured by the browser tool and was reset. Tablet visual acceptance remains unverified.
- Vault links, vault hygiene audit (existing size/metadata advisories only), harness validation and scoped diff whitespace passed. No live provider, real-patient or launch acceptance is claimed.

Next verification: an authorized clinic administrator must configure the intended clinician and capacity, then exercise selecting an open time → booking → visible month/day appointment → arrival/check-in in that clinic. The isolated backend journey does not substitute for this still-pending populated-browser walkthrough.

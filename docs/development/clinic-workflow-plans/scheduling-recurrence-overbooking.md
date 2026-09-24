# Scheduling recurrence and overbooking — assignment brief

## Assignment and authority

- **Status:** original 2026-09-23 planning baseline inspected `main` at `4095c61d`; MC-04 implementation checkpoint below supersedes its source-status claims. This brief does not authorize live deployment.
- **Outcome:** define selected-site settings, staff booking flows, recurrence lifecycle, intentional overbook exception, conflict handling, permissions and recovery in the existing Schedule. Shared ambulatory core; in-person and video visits; the local ten-room clinic is a synthetic example.
- **Distinctions:** existing weekly capacity rules repeat availability, not appointments. Different clinicians and free rooms at one time are ordinary bookings. Overbooking means intentionally overlapping one clinician. Patients and physical rooms remain exclusive in this proposal.
- **Exclusions:** external calendar write/sync, patient self-service recurrence or overbooking, clinical treatment-frequency policy, group visits, room sharing, bypassing closed hours/blocks/holds, automatic patient messages and live-clinic activation.
- **Implementation choices:** selected-site switches default off; clinic administrators receive the overbook capability; eligible visit types are configured per site; at most two simultaneous visits per clinician. A site's actual enablement and eligible types remain explicit settings choices.
- **Continuity:** a building agent reads this brief and linked canonical records before starting, after context reset or handoff; compares this baseline with newer source and user direction; reconciles drift before dependent edits; updates the checkpoint at completed slices, blockers and handoff. This brief is planning guidance, not implementation authority or proof.

## Current sources and decisions

| Source / authority | Finding or planning use |
| --- | --- |
| [Tracker MC-04 and PR-10](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) | MC-04 owns the implemented local scheduling slice; PR-10 remains separate conditional scope. |
| [Dependency matrix SC-01–04](../meta-clinic-build-and-acceptance.md) | Atomic conflicts, cancellation/no-show, independent work and resource ownership already have stable IDs. |
| [Decisions D-073/D-078](../../../APPlyVault/03%20Execution/Decisions.md) and [capability architecture](../../architecture/clinic-capability-architecture.md) | Block the affected action only; policy editing and exception execution need distinct scoped authority and revision history. |
| `apps/web/src/features/clinic/Facilities.tsx`, `WaitlistWorkspace.tsx`, `ClinicSchedule.tsx`, `CareFlow.tsx` | Clinic Setup already selects site, hours and rooms; Capacity and waitlist owns operational availability; Schedule/booking modal own booking. Reuse them. |
| `apps/api/app/queries/clinic/scheduling/calendar.rb` and `apps/api/app/models/clinic/scheduling/site_policy.rb` | Calendar reads selected-site policy; defaults remain off until saved. |
| `apps/api/app/services/clinic/scheduling/capacity_guard.rb`, `book_appointment.rb`, `reschedule_appointment.rb`, `apps/api/db/structure.sql` | Booking checks resources transactionally; allocation positions allow one permissioned clinician overlap while patient and physical-room exclusions remain. |

**Official-source review (accessed 2026-09-23):** [HL7 FHIR R4 4.0.1 Appointment §12.10.1](https://hl7.org/fhir/R4/appointment.html) describes one visit per Appointment; repeating visits require distinct instances, and apparent availability never guarantees booking. [HL7 FHIR R4 4.0.1 Slot §12.13.1](https://hl7.org/fhir/R4/slot.html) separates offered time from reservations, allows system-defined multiple allocations and describes `overbooked` status. Map to one real appointment per occurrence, explicit occupancy and server revalidation. These global R4 foundations apply to this U.S. internal workflow through [reference map R05–R07](../us-healthcare-reference-map.md), without mandating a FHIR-native schema. [Published HL7 FHIR R5 5.0.0 Appointment recurrence elements](https://hl7.org/fhir/R5/appointment.html) inform series/occurrence terminology only; R5 is separate trial-use material, not an R4/US Core conformance requirement. No reviewed U.S. guide sets a universal overbook count, cadence, UI location or clinical frequency; those are product/clinic decisions.

## Connected journey

| Step / actor | App location and entry | Success evidence | Recovery and independent work |
| --- | --- | --- | --- |
| Site setup staff | **Clinic Setup → Sites → selected site → Scheduling policy**, beside hours and rooms. Separate Recurring appointments and Overbook exceptions controls; show revision, writer and effective time. | Explicit site policy revision affects future bookings, never silently rewrites existing visits. | Stale/denied save blocks policy change only; schedule and other setup remain usable. |
| Scheduler creates series | **Schedule → open cell or Book appointment → existing modal**. Complete patient, site, clinician, visit type, format, room and duration. **Repeat** defaults to **Does not repeat**. | Weekly section opens; preview lists numbered intended dates, times and resources in the site timezone. | Incomplete form remains a working draft. Preview is not a reservation. |
| Scheduler resolves preview | Each conflict row identifies resource category without exposing another patient's identity to an unauthorized user. | Change time/free room or **Skip this date** with reason; every row ends bookable or explicitly skipped. | Unresolved dates block **Schedule series** only; alternate slot, waitlist/callback and chart work remain possible. |
| Server commits series | Staff review booked/skipped totals, then confirm. | One idempotent transaction rechecks all rows, books one normal appointment per accepted occurrence and stores series/exception history. Booking does not imply arrival, encounter or outbound message. | Race rejects the whole batch with per-date conflicts; exact-key retry reconciles unknown outcome before a new attempt. |
| Staff manage series | Appointment card links to series. Choose **This appointment** or **This and future**; preview future changes before commit. | Reschedule/cancel only selected future bookings; preserve original dates, past/completed visits, revisions, actor and reasons. Reminders remain per real appointment under existing rules. | Failed future edit commits none of its proposed changes. Encounter, work and communication states remain independent. |
| Scheduler requests exception | Busy clinician/time offers **Schedule another at this time** to permitted staff; manual busy-time entry leads to same flow. Show ordinary alternatives before **Request overbook**. | Show conflict category, occupancy (for example 1 of 2), free room choices and required reason; confirm exact clinician/date/time. | Without policy/role/eligible type, offer other time, waitlist or callback. Patient, room, closed hours, clinician block, active hold/offer remain blocked. |
| Server books exception | Authorized staff confirm one appointment. | Transaction rechecks role, policy revision, type, occupancy, patient/room and other hard rules. Persist actor, reason, policy revision and conflicting appointment IDs; cards show textual **Overbooked** label, while normal free-slot counts remain honest. | Race/revoked role/changed policy fails with refreshed choices; exact-key replay avoids duplicate. Disabling policy leaves existing visits/history visible. |

**Proposed first-slice bounds:** one weekday matching the first visit, every 1–4 weeks, 2–12 intended occurrences, final date within 180 days; no endless series. Preserve site wall time and IANA timezone; nonexistent or ambiguous daylight-saving times require staff resolution, never silent shifting. Batch series creation cannot overbook; a later individual occurrence can use the separate exception path. Overbooking is staff-only, maximum **two overlapping appointments per clinician**, one in-person appointment per physical room and one appointment per patient at a time. It does not bypass hours, blocks, offers or holds.

When recurrence is later switched off, existing series and appointments stay visible; staff may cancel future occurrences or edit one appointment under ordinary booking rules, but cannot add occurrences or apply a new “this and future” schedule revision. A video visit uses clinician capacity without reserving a physical room; a telehealth room label alone does not create a second clinician or virtual-capacity allowance.

## Fields and action rules

| Label / control | Owner, origin, values | Writer / gate | Validation, recovery, provenance |
| --- | --- | --- | --- |
| Recurring appointments | Versioned site policy; entered off/on, default off. | Site-scoped configuration staff. | Off stops new series, not old occurrences; stale revision: “Scheduling policy changed. Review current settings.” |
| Overbook exceptions | Versioned site policy; Off or Authorized staff exception, default Off; first-slice maximum 2 fixed. | Site configuration writer saves; distinct `appointments.overbook` capability executes. | Disable stops new exceptions without cancelling existing visits. |
| Eligible visit types | Site-policy links to existing same-practice types; searchable multi-select. | Site configuration writer; at least one type before enabling exceptions. | Retired type cannot receive new exception; historical booking retains policy/type snapshot. |
| Repeat, Every, Visits | Working draft then series; Does not repeat/Weekly; integer 1–4 weeks, 2–12 visits, 180-day horizon; inherited site timezone. | Booking staff; patient/site/clinician/type/format/start/end required for preview. | Draft may be incomplete; “Complete appointment details to preview.” Out of range: “Choose 2–12 visits within 180 days.” |
| Per-date resolution | Series occurrence: booked, moved or skipped; original local date, resolved UTC instant, change/skip reason. | Booking staff resolve every preview row. | “Resolve or skip every conflicting date.” Preserve original values, actor and revision. |
| Overbook reason | Append-only exception; nonempty bounded free text; no speculative diagnosis. | Only `appointments.overbook`; show exact conflict and free room before confirmation. | “Enter why this visit must overlap this clinician's appointment.” Retain after later reschedule. |
| Conflict and occupancy | Server-calculated read-only projection from appointments, holds, clinician, patient and room; role-filtered. | Server rechecks create, reschedule and series commit. | “The schedule changed. Review the highlighted time and retry.” No other-patient identity without `patients.read`. |

**Backend records proposed:** versioned `clinic_site_scheduling_policies` (practice/site, modes, eligible types, effective revision, writer); `clinic_appointment_series` (patient/site, original local time, IANA zone, weekly interval/count/template/revision); `clinic_appointment_series_occurrences` (stable sequence/original date, booked appointment or explicit skip, changed time/room/history); and append-only appointment overbook exceptions (actor/reason/conflict snapshot/policy revision). Each booked occurrence remains an ordinary `Clinic::Appointment`. No care plan or service offering silently generates bookings.

**Collision design:** current clinician exclusion prevents intentional overlap. In a separately reviewed migration, backfill active clinician bookings into allocation position 1, then use a PostgreSQL exclusion constraint on `(practice, clinician, allocation position, time range)` for positions 1–2. Keep room exclusion unchanged. Transactional guard under clinician/site locks assigns position 2 only to an authorized exception, rechecking occupancy and every hard rule. Verify synthetic backfill, rollback and concurrent booking before turning policy on. Never simply drop the old constraint or exempt flagged rows.

**API ownership:** site-scoped policy read/write under existing Clinic Setup/facilities authority; server preview and idempotent series create/revise/cancel; explicit overbook request in existing booking/rescheduling service. Policy edit and exception execution need distinct capabilities. Calendar reports `configured` only from an effective persisted policy after behavior exists. Schedule shows separate feature statuses linked to that site's setting. External sync stays `read_only_export`.

## Ownership and dependency matrix references

- **SC-01** remains atomic booking. Once policy is accepted, ordinary clinician conflict blocks confirmation; the narrow exception requires site policy, role, eligible type, reason and remaining allocation. Patient/room overlap still blocks.
- **SC-04** owns required resource checks per occurrence; preview never reserves capacity. Equipment/chair rules need their own owner before those visit types use series booking.
- **SC-02** preserves cancellation/no-show and post-encounter work; series cancellation changes only chosen future visits. **SC-03** rooming/handoff is unchanged. **CF-04** governs protected setup changes. **D-073** separates scheduling-team ownership from patient/encounter responsibility. Unresolved exceptions stay visible in the scheduling queue, without invented individual owner or deadline.
- Reviewed complete applicable matrix rows CF-01–04 and SC-01–04. No matrix row is changed now because limits are proposals. After acceptance, refine SC-01/SC-04 in the canonical six-column matrix if needed, preserving stable IDs; do not create a parallel matrix.

## Implementation and acceptance

| Ordered slice / owner | Planned change | Required proof |
| --- | --- | --- |
| 1. Policy — Rails/API and Clinic Setup | Versioned site policy, eligible types, scoped permissions, off defaults and selected-site Scheduling policy panel. | API site isolation, role denial, stale revision; browser save/reload; independent setup succeeds after denied save. |
| 2. Series — Rails/API | Series/occurrences, bounded local-time expansion, per-date preview, atomic idempotent commit, single/future edit/cancel; reuse booking guard. | DST/horizon; patient/room/capacity/hold/offer conflicts; all-or-nothing rollback; replay/outcome-unknown; cross-site denial. Browser preview → resolve → save → reload → edit/cancel. |
| 3. Overbook — schema and Rails/API | Allocation-position exclusion, exception provenance and narrow policy/role/type branch in booking/rescheduling; retain hard checks. | Synthetic migration/backfill/rollback; race for second allocation; third denied; disabled/revoked/stale denial; patient/room/hours/block/hold denial; different-clinician booking still works. |
| 4. Schedule/modal — web | Repeat section/preview, busy-time action, reason/confirmation, textual series/overbook labels, edit scope and precise policy state. | Keyboard/screen reader, role denial, desktop/tablet/phone fallback, room/clinician views, draft/reload recovery. |
| 5. Connected synthetic proof — full local stack | Enable one site after prior slices pass; book weekly series, resolve/skip conflict, ordinary same-time visits, permitted same-clinician exception in separate rooms, disable/cancel/retry and cross-role denial. | API and browser evidence separately in MC-04; no provider, external-calendar, real-patient or clinical-release claim. |

**Stop conditions:** no mutation with missing/stale policy revision, unbounded series, unresolved conflict, uncertain prior outcome, unauthorized role, site mismatch or absent independent database collision protection. Passing source checks alone does not authorize live activation.

## Implementation checkpoint — 2026-09-23

- **Implemented in MC-04 branch:** versioned selected-site policy with off defaults and eligible visit types; weekly 1–4 interval, 2–12 visit, 180-day series preview and atomic idempotent booking; per-date move/skip and future change/cancel history; reasoned permissioned overbook exception with two clinician allocations; Schedule, booking and Clinic Setup controls. Patient and physical-room exclusion remains.
- **Evidence already collected:** 36 focused Rails runs/354 assertions, frontend typecheck, and 17 existing schedule/booking tests. An isolated synthetic site's policy saved as revision 1 and the enabled Schedule/booking controls appeared in the browser. The user stopped further test creation and runs.
- **Unverified:** browser submission/reload of a series and overbook exception, actual concurrent allocation race and rollback, and older MC-04 hold/waitlist recovery. Local site policy defaults off; no live-clinic activation. PR-10 remains separate.
- **Next:** connected mutation/recovery evidence when verification resumes. Reconcile any clinic-specific policy and role choices before use outside the synthetic development environment. Reconcile plan with newer source/decisions first.

## Last run

- **Date and baseline:** 2026-09-23 America/Chicago; `main` `4095c61d` before documentation commit.
- **Outcome:** created one proposed scheduling recurrence/overbooking assignment and linked MC-04; no capability activated.
- **Changed paths:** this brief and `APPlyVault/03 Execution/Meta Clinic Implementation Tracker.md`; shared matrix unchanged pending policy acceptance.
- **Sources/checks:** inspected current scheduling UI/API/schema, tracker/matrix and official HL7 FHIR R4 4.0.1 Appointment/Slot plus R5 5.0.0 Appointment on 2026-09-23. Final `agent-check` for docs passed harness verification and 24 harness unit tests; final `agent-check` for the tracker passed vault verification (43 notes, 520 links) and hygiene audit (existing size/metadata advisories only). Staged whitespace checks passed. No application test or booking mutation ran in this planning task.
- **Next action:** review proposed bounds and authority, then implement site policy and collision protection under accepted separate scope.

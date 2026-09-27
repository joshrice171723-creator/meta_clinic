# MC-04 closed-site appointment recovery

Date: 2026-09-27

## Delivered

- Front Desk now offers a paginated, searchable closed-site recovery queue covering upcoming scheduled/confirmed appointments at temporarily closed or retired locations, excluding visits with an encounter. It retains the existing authorized appointment scope and shows each appointment's date. Staff use the existing appointment editor and cancellation flow; successful changes refresh the queue.
- The shared capacity guard locks and rejects an inactive destination site, including bookings without an assigned clinician. Booking, rescheduling, series, holds and waitlist flows reuse this guard. The editor disables unavailable destination sites. Existing source and destination authorization, conflict checks, stale-write checks, idempotency, audit and reminder reconciliation remain.
- Video rescheduling now checks telehealth availability at the destination even when the visit was already video, instead of checking the old site only on format conversion.

## Evidence and remaining scope

TypeScript and scoped RuboCop passed. Changed frontend files were formatted with Prettier. Source walkthrough: choose Closed-site recovery, filter/search, open an appointment, select an active destination and time, save through the existing authorized service, then refresh the queue. No tests or browser mutation walkthrough were run; this is source delivery, not runtime acceptance.

MC-04 Build moves 86 to 88; validation remains 68. Date-specific hours exceptions are still enforced by the capacity guard but are not included in this status-based recovery queue. An offering unavailable at the destination remains rejected; no service substitution is silently made. Cross-site offering substitution, overbooking, hold/waitlist recovery and concurrent allocation evidence remain open.

The MC-08 follow-up applied the already-delivered contact-snapshot migration and updated its historical evidence. It is not counted as a new feature slice. This checkpoint contains three implementation slices under MC-04, two short of the five-slice hourly target and one short of two milestones with new implementation. The next high-value work remains open; this checkpoint does not represent completion of the autonomous build goal.

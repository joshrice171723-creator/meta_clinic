# Patient Reminders audit evidence

Date: 2026-09-03
Status: checkpoint; not a pilot approval.

## Evidence labels

- **Inspected in source:** reminder schema, state transitions, tenant validations, policy checks, masked destinations, synthetic provider gate, and controller ownership lookup.
- **Verified by syntax:** `ruby -c` passed for the reminder migration, models, services, controllers, and serializer.
- **Verified by build:** web `npm run build` completed in the checkpoint run (`tsc --noEmit && vite build`).
- **Verified by Rails integration:** With the task-owned test database prepared through the local PostgreSQL wrapper, `test/integration/patient_reminders_security_test.rb` passed with 2 runs and 14 assertions, 0 failures, 0 errors, and 0 skips.
- **Unresolved:** Policy breadth, delivery callbacks/workers, and browser/runtime evidence remain open; this checkpoint does not establish pilot or release acceptance.

## Safety/reliability inspection

- Cross-practice patient, endpoint, reminder, and action associations have model validations and controllers resolve records from the current practice/portal patient scope.
- A reminder cannot be created without a verified endpoint matching the requested channel.
- A blocked operational preference or quiet-hours match suppresses before synthetic provider invocation.
- Create uses a unique practice-scoped request/dedupe key and returns the existing compatible reminder on replay; changed intent raises an error.
- Outbox and delivery-attempt records carry idempotency keys; attempts are capped at three and provider outage is retryable.
- Confirm/reschedule/help/dismiss are recorded as patient actions; no action directly changes appointment status.
- Delivery state separates provider acceptance from delivered, failure, and unknown in reminder state/outbox metadata.
- Staff output exposes masked destinations and fixed safe previews only.

## Gaps to retest

- Re-run the focused security test after any shared authorization, context, route, or contract integration change; the current task-owned test database has the capability migrations applied.
- Add/run policy, authorization, replay, cancellation-race, DST/quiet-hours, callback replay, and accessibility tests.
- Live-verify staff and patient portal pages at desktop and narrow viewport sizes.
- Verify appointment cancellation/reschedule reconciliation after shared service wiring is staged.
- Add signed provider callback verification and failure escalation through the typed Staff Messaging boundary.

# Patient Reminders audit evidence

Date: 2026-09-03
Status: checkpoint; not a pilot approval.

## Evidence labels

- **Inspected in source:** reminder schema, state transitions, tenant validations, policy checks, masked destinations, synthetic provider gate, and controller ownership lookup.
- **Verified by syntax:** `ruby -c` passed for the reminder migration, models, services, controllers, and serializer.
- **Verified by build:** web `npm run build` completed in the checkpoint run (`tsc --noEmit && vite build`).
- **Unresolved:** Rails runtime/migration and integration tests were started but the shared checkout's Rails runner did not return within the checkpoint window and was stopped. No browser/runtime claim is made.

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

- Apply migration `20260903001210_create_patient_reminders.rb` and verify Rails loading with the two other untracked capability migrations.
- Add/run policy, authorization, replay, cancellation-race, DST/quiet-hours, callback replay, and accessibility tests.
- Live-verify staff and patient portal pages at desktop and narrow viewport sizes.
- Verify appointment cancellation/reschedule reconciliation after shared service wiring is staged.
- Add signed provider callback verification and failure escalation through the typed Staff Messaging boundary.

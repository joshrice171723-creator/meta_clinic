# MC04 reasoned overbook rescheduling — 2026-09-30

## Source increment and authority

Branch `codex/mc04-overbook-reschedule-20260930` is rooted at `ca7302d215d2aa104a524edb718065e0e3c5b2db`. It deliberately excludes the separate provenance repair `2d96bed50ea815e294e3e80aea246926136d94bc`; Relay should apply only this increment's commit, retaining the provenance repair independently. The eight restored overbook files matched stash `d6c7824c68ab2731ee7f048ce5c4fef4c75cb641` byte-for-byte before further scoped changes. The stash remains a backup, not another integration candidate.

The source gap is MC04-33 from `df1dfec3fc9eb14b859b98bdf186d29fee1e18e9:records/audits/2026-09-30-mc01-mc02-mc04-source-coverage.md`. [The accepted recurrence/overbooking brief](../../../../docs/development/clinic-workflow-plans/scheduling-recurrence-overbooking.md) expressly includes exceptions in existing booking/rescheduling services. Current initial booking already selects permission, site policy, active eligible visit type, reason, exactly one overlap and one remaining clinician allocation; rescheduling previously had no reason/policy inputs and always used the ordinary capacity branch. This increment implements that specified path without inventing resource compatibility, wait escalation or category policies.

## Implemented source

- [Appointment PATCH](../../../../apps/api/app/controllers/clinic/scheduling/appointments_controller.rb) accepts bounded explicit `overbook_reason` and `expected_policy_revision`. Blank submitted reasons fail parameter validation.
- [RescheduleAppointment](../../../../apps/api/app/services/clinic/scheduling/reschedule_appointment.rb) includes exception fields in request identity only when an exception is requested, preserving the old ordinary-reschedule fingerprint. It requires destination `appointments.overbook` on initial authorization, transactional authorization and replay. Both source/destination booking authorization remain. Inside existing locks it checks current destination policy revision, active eligible type, explicit 1–500-character reason, non-walk-in semantics and separate physical room for in-person exceptions.
- The unchanged capacity guard determines allocation using its existing exactly-one-overlap rule and preserves patient/room/hours/capacity-template/block/offer/hold restrictions. The moving appointment is excluded from overlap counts. Only the moving appointment is updated; blockers and other allocations are untouched. Ordinary changes retain their previous allocation-1 behavior. No implicit exception is granted merely because an appointment has historical overbook provenance.
- Each committed exception appends encrypted reason, actor membership, site, policy revision and conflicting appointment IDs to the existing immutable event table. [Appointment associations](../../../../apps/api/app/models/clinic/appointment.rb) expose all immutable events plus the latest event through the existing singular projection. Ordinary moves preserve prior events and labels.
- [One forward migration](../../../../apps/api/db/migrate/20260930204800_allow_append_only_reschedule_overbook_exceptions.rb) converts only the per-appointment exception index from unique to nonunique, permitting another reasoned reschedule without overwriting history. The immutable trigger, tenant foreign keys, clinician allocation bounds and patient/room/provider collision constraints are unchanged. Down migration refuses before mutation when duplicate history exists; it never deletes/collapses events.
- [FrontDesk editor](../../../../apps/web/src/features/clinic/FrontDesk.tsx) obtains the selected site's projected policy and execution capability, offers an explicit checkbox/reason field, and captures the policy revision at selection. A site change clears that site-bound selection and room while preserving reason text. Known stale policy requires refreshed policy and renewed selection. During uncertain responses, reason/selection/revision remain frozen for explicit retry; no automatic retry is introduced. [The request adapter](../../../../apps/web/src/features/clinic/rescheduleOverbook.ts) excludes dormant exception fields from ordinary saves.

## Scope and verification limits

No other milestone, live patient/provider/payment operation, production setting, credential, persistent runtime grant, shared fixture reset, percentage, PR, main merge or deployment was changed.

Josh's 21:08 UTC source-first direction was received while one owned frontend build was already active. That command finished; no new test/build/lint/review-only command was started afterward. Static scoped diff/whitespace review completed. Previously obtained results are retained as verification evidence only, not Build credit:

- 12 focused frontend cases passed (10 new overbook editor/request cases plus two existing FrontDesk layout cases).
- The already-active TypeScript/Vite build passed (1,479 modules). This checks the authored frontend snapshot, not backend behavior.
- Frontend formatting passed before the final handler-test additions; those additions were formatted before the source-first direction. No subsequent lint or format check ran.

[Six synthetic backend cases](../../../../apps/api/test/integration/clinic_overbook_reschedule_test.rb) were authored before the source-first direction and remain **unexecuted**. They cover successful move/spare allocation/unchanged blocker, exact replay and changed-reason conflict, repeated append-only history and ordinary move, immutability and refusal of destructive rollback, separate permission/revoked replay, blank/missing/stale/disabled/ineligible inputs, ordinary overlap denial, room/patient/third-allocation failures, capacity/closure/block/hold/offer failures. Frontend checks execute helper behavior and the actual editor checkbox/location/reason-control handlers using synthetic inputs; they do not establish connected API or browser acceptance.

Ruby is unavailable in cloud. Backend syntax, migrations, execution, races, rollback, connected browser acceptance and release verification remain deferred. No replacement stack/runtime download was attempted. `db/structure.sql` was deliberately not hand-edited; generation from the migration is pending Sage and must be reviewed before claiming a complete current schema snapshot.

## Portable Sage source-completion handoff

From `apps/api` in Sage's existing local synthetic runtime, use a newly owned isolated database, **not** shared `apply_test`, development, hosted or production state. The explicit name below is reserved for this increment and has not been created by cloud; if it exists, stop and choose a fresh owned name rather than reset it.

```sh
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc04_overbook_20260930_2110 bin/rails db:create db:migrate db:structure:dump
```

This is migration/schema generation, not a request to run tests. Return the actual generated `db/structure.sql` diff and command result to Relay. Expected owned schema delta: that exception index becomes nonunique, plus migration `20260930204800`; no patient/room/provider allocation constraint or immutable-trigger removal. Preserve unrelated schema additions in Relay's combined checkout. Schema/migration execution is currently pending, not passing.

For a later explicitly authorized verification phase only, the portable focused commands from the same isolated database are:

```sh
python ../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test APPLY_TEST_DATABASE=apply_mc04_overbook_20260930_2110 PARALLEL_WORKERS=1 bin/rails test test/integration/clinic_overbook_reschedule_test.rb test/integration/clinic_scheduling_policy_series_test.rb test/integration/clinic_schedule_calendar_test.rb
python ../../bin/agent-resources run -- bin/rubocop app/controllers/clinic/scheduling/appointments_controller.rb app/models/clinic/appointment.rb app/services/clinic/scheduling/reschedule_appointment.rb db/migrate/20260930204800_allow_append_only_reschedule_overbook_exceptions.rb test/integration/clinic_overbook_reschedule_test.rb
```

Do not execute those verification commands under the current skip-tests direction. No deferred check is counted as passed.

## Standards and remaining scope

The existing accepted overbook bounds remain product policy. The accepted brief's existing [FHIR R4 Appointment 4.0.1](https://hl7.org/fhir/R4/appointment.html), [Slot 4.0.1](https://hl7.org/fhir/R4/slot.html) and [Schedule 4.0.1](https://hl7.org/fhir/R4/schedule.html) inform the repository's U.S. internal scheduling distinction between availability and booked appointments; no exchange partner/profile, new clinical eligibility rule or FHIR-conformance claim is introduced. Existing MUI Checkbox/FormControlLabel/TextField/Alert composition supplies the editor controls; no custom interactive primitive or dependency change.

Required chair/equipment compatibility/schema details, structured block category values and operational waiting escalation settings remain unresolved policy scope. This increment does not fill those inputs by assumption. Connected operational/human acceptance remains separate from source implementation.

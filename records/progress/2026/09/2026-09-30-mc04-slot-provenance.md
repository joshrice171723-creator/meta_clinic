# MC04 slot provenance increment — 2026-09-30

## Scope and baseline

Dedicated branch `codex/mc04-slot-gap-20260930`, based on PR66 `5470609423ed67b99453c3b779f584e0c86f2fd8`. Verified the MC04 source inventory in `df1dfec3fc9eb14b859b98bdf186d29fee1e18e9:records/audits/2026-09-30-mc01-mc02-mc04-source-coverage.md` against the accepted D-079 hardening plan, recurrence/overbooking brief, SC01–04 engineering matrix and current source. No scores, other milestone lanes, existing appointments or allocation rules were changed. No PR, merge or deploy is authorized by this increment.

The selected smallest complete contract is the source-rule/version and generation-time portion of [the slot/projection contract](../../../../docs/development/non-vendor-clinic-hardening-plan.md). The calendar previously emitted only start/end, clinician and room IDs; its envelope `as_of` did not associate each opening with the actual rules used.

## Implementation and acceptance

- The read-only [calendar query](../../../../apps/api/app/queries/clinic/scheduling/calendar.rb) attaches `provenance.generated_at` and `provenance.source_rules[{id,version}]` to every slot. Version is the existing capacity-rule `lock_version`, matching the capacity API's `version` semantics; generation time is one server value shared with envelope `as_of`.
- Overlapping weekly rules still produce one opening. All contributing IDs/revisions are retained in stable ID order, including version zero. Existing site/timezone/hour/block/booking/offer/hold/room filters and slot ordering are unchanged.
- [The browser contract](../../../../apps/web/src/api/contracts.ts) carries those fields. [The existing booking dialog](../../../../apps/web/src/features/clinic/ClinicSchedule.tsx) shows the selected opening's site-local calculation time and source revisions using MUI Stack/Typography. Manual/busy-time booking has no fabricated slot metadata. Provenance remains informational: current server capacity checks still decide booking. A displayed opening does not reserve capacity.
- No new persistence, migration, rule taxonomy, exception policy, authorization, booking request field or allocation mutation was introduced.

## Verified and pending checks

Cloud frontend dependency installation used the unchanged lockfile with `--frozen-lockfile --ignore-scripts`; pnpm's data/store directories were relocated to `/tmp` after its default home directory was unavailable. No dependency or lockfile changes.

Passed at the final application-source snapshot:

```sh
python bin/agent-resources run -- pnpm --dir apps/web exec vitest run test/schedule-pagination.test.tsx --maxWorkers=1
# 1 file, 12 tests passed (includes two new provenance cases)
python bin/agent-resources run -- pnpm --dir apps/web run build
# TypeScript passed; Vite built 1,478 modules successfully
```

Changed frontend files were formatted with installed Prettier; scoped formatting and `git diff --check` passed. The focused UI check renders the actual provenance component with synthetic inputs, asserting site-local time, all rule revisions and capacity-recheck text, plus absence for manual/busy-time booking. This is static component execution, not connected browser/API proof. No connected desktop/tablet walkthrough ran because this environment has no Ruby-backed local API.

Two new wholly synthetic [backend query tests](../../../../apps/api/test/queries/clinic/scheduling/calendar_test.rb) cover deduplicated multi-rule provenance, changed revisions, inactive/other-site rule exclusion, original room availability, and no appointment/hold writes. Ruby is unavailable in cloud. No runtime downloads, substitute stack, backend test, lint, database preparation or fixture reset was attempted.

**Exact Sage handoff:** apply this isolated source increment to the parent's owned synthetic checkout/test database, then run from `apps/api` using its existing runtime. Do not point at a shared development/production database or reset fixtures:

```sh
../../bin/agent-resources run -- bin/postgres exec env RAILS_ENV=test PARALLEL_WORKERS=1 bin/rails test test/queries/clinic/scheduling/calendar_test.rb test/integration/clinic_schedule_calendar_test.rb
../../bin/agent-resources run -- bin/rubocop app/queries/clinic/scheduling/calendar.rb test/queries/clinic/scheduling/calendar_test.rb
```

Backend behavior remains pending those commands. Existing synthetic calendar tests cover bookings, blocks, duplicate slots, holds, room reservations, closures and timezone behavior; their past results are not treated as this increment's proof.

## Other matrix discrepancies, kept separate

| Finding | Current evidence and boundary |
| --- | --- |
| Reasoned overbook rescheduling | Still a concrete source gap. The accepted recurrence/overbooking brief explicitly calls for booking/rescheduling exceptions. `RescheduleAppointment.call` accepts no reason/policy revision, calls ordinary `CapacityGuard` and sets allocation 1; the appointments controller and FrontDesk editor expose no exception request. Initial booking's policy/permission/type/reason checks and two-allocation hard limits exist. This increment does not modify those paths. A follow-on must preserve patient/room/hour/block/offer/hold constraints and immutable exception history. |
| Chair/equipment allocation | Generic required resources are selected in D-079/SC04, but existing guard and calendar own clinician/patient/room only. Clinic resource compatibility, schema/policy details are undefined. No equipment defaults or clinical rules were invented. |
| Structured block reasons | Capacity controller/model retain encrypted free text and weekly/block rule kind; that kind is not a reason category. Accepted category values and selection policy are undefined. No taxonomy was invented. |
| Waiting escalation configuration | SC03 selects configurable thresholds; tracking-board data/view show duration while scheduling site policy contains recurrence/overbook only. Threshold semantics/values, recipient and escalation action are undefined and overlap queue owners. No clinical urgency, recipient or settings were invented. |

These are source/policy limits, not numerical completion claims. Connected browser acceptance, Sage execution and operational/human gates remain separate.

## Standards and UI references

Reviewed 2026-09-30: [HL7 FHIR R4 Slot 4.0.1](https://hl7.org/fhir/R4/slot.html), sections 12.13.1–2, and [Schedule 4.0.1](https://hl7.org/fhir/R4/schedule.html), section 12.12.1. These trial-use base resources inform U.S. internal scheduling through the repository's existing R4 reference map: slot schedule linkage and time windows are distinct from appointments. There is no selected exchange partner or standalone U.S. scheduling profile for this local provenance addition. Source revisions/generation time are explicit D-079 product requirements, not asserted FHIR conformance or a prescribed scheduling algorithm.

MUI documentation MCP tools were unavailable. Used installed MUI 9.4.0 types and [official Stack documentation](https://mui.com/material-ui/react-stack/) for the existing Stack/Typography composition. No custom interactive primitive or dependency patch.

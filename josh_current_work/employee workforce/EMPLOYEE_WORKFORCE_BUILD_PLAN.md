# Employee Workforce Build Plan

[Roadmap index](../ROADMAP_INDEX.md) | [Roadmap](ROADMAP.md) | [Audit plan](EMPLOYEE_WORKFORCE_AUDIT_PLAN.md)

## Planning contract

This document defines the build contract. Implementation is authorized and in progress; the [implementation handoff](AGENT_IMPLEMENTATION_HANDOFF.md) distinguishes delivered source from actual verification and remaining gates. The host application owns login/session security, current practice/site context, authorization, audit metadata, and canonical site and staff records. Workforce owns employment linkage, eligible work sites, workforce settings, badges, kiosk enrollment/challenges, punches, calculations, schedules, requests, and export artifacts.

## Inspected source map

| Existing path | Reuse / constraint |
| --- | --- |
| `apps/api/app/models/clinic/staff/member.rb` and `controllers/clinic/staff/members_controller.rb` | Practice-scoped directory CRUD only; do not overload `active` as account lifecycle or infer login identity. |
| `apps/api/app/serializers/clinic/staff_member_serializer.rb` | Extend only with authorized workforce linkage summary; never expose badge/PIN secrets. |
| `apps/api/app/models/clinic/membership.rb` | Existing user/practice access record and active scope; proposed employment linkage must validate same practice and active membership. |
| `apps/api/app/models/user.rb` | Existing normalized unique-email/password identity; password or active-state changes revoke member sessions. Employee invitation/activation must preserve this host lifecycle rather than add workforce credentials. |
| `apps/api/app/models/clinic/site.rb`, `apps/api/app/models/clinic/role_grant.rb`, `apps/api/app/models/ability.rb` | Reuse tenant/site ownership and site/practice permission patterns; add narrowly named workforce permissions. |
| `apps/api/app/controllers/clinic/context_controller.rb` | Reuse accessible sites/current site for staff UI, but derive kiosk site from enrolled server session, not browser-selected context. |
| `apps/api/app/controllers/identity/api/sessions_controller.rb` | Existing staff login/session boundary. No verified staff-account provisioning service exists; provisioning UI/service is a proposed bounded identity addition. |
| `apps/api/app/controllers/clinic/facilities_controller.rb` | Reuse facility operating hours for contextual warnings only, never as employee schedules or automatic deductions. |
| `apps/api/app/models/concerns/clinic/tenant_scoped.rb`, `append_only.rb` | Apply tenant scoping broadly and append-only behavior to raw punch/audit-like facts. |
| `apps/api/config/routes.rb` | Add explicit clinic workforce and separate kiosk route namespaces. |
| `apps/web/src/features/clinic/Staff.tsx`, `apps/web/src/features/clinic/Workspace.tsx`, `apps/web/src/App.tsx` | Extend staff administration and navigation; add persisted workforce pages under existing authenticated shell. |
| `apps/web/src/api/contracts.ts`, `client.ts` | Add typed contracts and use the existing CSRF/error client; no hardcoded fallback data. |
| `apps/api/db/structure.sql` | Canonical schema output is currently concurrently modified; only the migration owner may regenerate/integrate it. |

Existing `staff-workflow.test.tsx` exercises unrelated patient workflows and is not evidence for workforce behavior.

## Proposed data model and integrity

Exact migration names/timestamps are allocated centrally at implementation time. Proposed model/controller paths use `Clinic::Workforce::*` under `apps/api/app/` and corresponding `clinic_workforce_*` tables. Every proposed persisted record has `id`, `practice_id`, `created_at`, and `updated_at` unless it is deliberately append-only (where `updated_at` must remain unchanged). Consequential records also carry request/correlation IDs and the relevant employee/manager/kiosk actor references. Composite same-tenant foreign keys or equivalent database enforcement must prevent an ID from being paired with a record from another practice; model checks alone are insufficient.

| Record | Required fields and constraints |
| --- | --- |
| `Employment` | `id`, `practice_id`, `staff_member_id`, `membership_id`, `status`, `effective_from`, `effective_until`, timestamps; unique current link per staff member and membership; all related records same practice. Historical identity is retained. |
| `EmploymentSite` | `id`, `practice_id`, `employment_id`, `site_id`, `active`, effective window, timestamps; same-practice FK validation and non-overlapping active assignment. |
| `SettingsVersion` | scope kind, nullable site, effective window, revision, kiosk/scanner/camera/PIN/request/export flags, practice workweek start/day/time and calculation policy reference. Practice values are complete; a site row may explicitly override local settings true/false/inherit, but cannot reset employee-wide weekly aggregation. Prevent overlapping effective versions per scope. |
| `BadgeCredential` | opaque `id`, tenant/employment link, random secret digest, printable format/version, issued/revoked/replaced timestamps and actor memberships; unique digest, one active primary badge unless policy explicitly permits more. Raw secret returned only in the authorized issuance/print response; reprinting requires revoke/reissue because the server retains only the digest. |
| `KioskEnrollment` / `KioskSession` | opaque ID/digest, practice/site, status, expiry/rotation/revocation, created/revoked actor and timestamps; session capability restricted to clock APIs. |
| `PunchChallenge` | opaque random digest, kiosk/site, resolved employment, permitted transitions, expiry, one-use timestamp, failed-attempt counters; short lived. PIN is separately slow-hashed server-side and never returned. |
| `Punch` | opaque ID, practice/site/employment, `event_type`, `occurred_at_utc`, IANA zone, UTC offset, source, kiosk/session reference, idempotency key, request/correlation IDs, received time; append-only; unique tenant/endpoint/idempotency key. |
| `TimecardVersion` / `TimeSegment` | employment, workweek key, version, source punch range/digest, calculation policy version, regular/other categorized minutes without guessed statutory rates, status, calculation/approval/freeze timestamps and actors; immutable after approval/export. |
| `AdjustmentRequest` | target timecard/interval, proposed UTC times/type, reason, requester, status, reviewer/decision/reason, timestamps; it creates a new calculation version and never edits/deletes punches. |
| `ScheduleTemplate` / `ScheduleDraft` / `Shift` / `SchedulePublication` | tenant/site, local date/time plus IANA zone and resolved UTC instants, employment/role, breaks as explicit planned data, draft revision, publication/version actors/timestamps; uniqueness/overlap checks and immutable publication snapshots. |
| `AvailabilityVersion`, `TimeOffRequest`, `ShiftSwapRequest` | employment/site scope, effective/interval times, status, requester/reviewer, reason, offered/target shifts, expiry and timestamps; approvals preserve history and flow through schedule publication. |
| `PayrollConfigurationVersion` / `ExportBatch` / `ExportRow` | provider kind (`custom_file` plus only implemented adapters), effective mapping schema/version, cadence metadata, approved timecard version IDs/digest, preview errors, generated artifact metadata, status and actors; no credentials in rows/logs, immutable generated content, explicit supersession. |

All opaque public IDs should be unguessable. Database constraints, transaction locks, and server-side tenant checks reinforce model validation. Sensitive PIN/badge/enrollment material is digest-only; printable badge content contains no name, practice, site, or database ID. Practice policy owns the common workweek boundary and employee-wide aggregation. Site overrides may configure overtime thresholds/premiums, breaks, rounding and exceptions, but cannot erase another site's hours or restart weekly totals. Define deterministic allocation of categorized minutes to originating sites and resolve incompatible policies before approval. Export cadence never defines or resets a workweek.

Each settings version has a validated calculation-policy payload: timezone, enabled daily/weekly thresholds, premium/category precedence, rounding mode/increment, paid/unpaid break treatment, break reminders and exception handling. Missing rules produce an explicit unconfigured category, never a guessed legal rate. Preserve unrounded duration and all contributing practice/site policy version IDs with the timecard.

## Proposed API and UI journeys

| Slice | Server API/service outcome | Persisted UI outcome |
| --- | --- | --- |
| sc382 identity | `/api/clinic/workforce/employments`, site assignments, and effective settings; services validate directory/member/membership/site tenant equality and effective activity. A proposed host identity admin path handles employee invitation/activation where no account exists. | Staff detail gains login-link, workforce-active, eligible-sites, and settings controls gated by practice permissions. Missing account is an explicit bounded identity action, never a patient-portal redirect. |
| sc383 clock | Admin badge issue/revoke/print endpoints; kiosk enroll/revoke; public-looking but enrolled-session-protected challenge and punch endpoints. Punch service locks employment state, consumes challenge once, checks intended transition, debounce, idempotency, site eligibility, and persists audit metadata atomically. | Manager badge/kiosk settings; dedicated `/workforce/kiosk` scanner/camera/manual fallback view. It states the intended action, reports saved/duplicate/conflict/unknown distinctly, and clears employee display automatically. |
| sc384 timecards | Period/current-state endpoints; calculate/recalculate, adjustment request/decision, approve/freeze actions. Calculation service pairs valid transitions across sites, preserves exceptions, and aggregates by configured employee workweek. | Employee hours/current status and manager exception/timecard review. Off-schedule/overlap/missing-event issues are flagged; no schedule-derived deduction and no blocked punch that loses time. |
| sc385 schedules | Template CRUD, draft shift CRUD/validation, publish, and published schedule reads. Publication resolves DST/overnight instants and snapshots a version. | Manager template/builder/draft/publish flow and employee published schedule. UI distinguishes site opening hours from shifts and never shows unpublished data to employees. |
| sc386 requests | Availability versions and time-off/swap submit/cancel/target-accept-or-decline/manager-approve-or-deny endpoints with idempotent decisions and schedule-change proposal creation. Target consent is mandatory even when configured policy automatically approves afterward. | Optional employee request surfaces and manager approval queue shown only when effective settings enable them. |
| sc387 exports | Configuration version, mapping validation, preview, generate, authorized custom-file retrieval, fail/retry/supersede endpoints. Adapter boundary accepts normalized approved rows; custom file is the baseline, named provider delivery requires separate implementation, credentials, authorization, and evidence. | Configuration/mapping, preview errors, immutable batch history, and authorized file download. Do not claim or initiate live provider delivery in the baseline. |

Suggested controllers are `apps/api/app/controllers/clinic/workforce/*`; services are `apps/api/app/services/clinic/workforce/*`; serializers are `apps/api/app/serializers/clinic/workforce/*`; React pages/components are `apps/web/src/features/workforce/*`. These are proposed, not inspected existing paths.

### Proposed exact path ownership

Basenames in each row expand beneath the stated workforce roots: the first group contains models, `_controller.rb` files are controllers, and the next group contains services. React basenames use `apps/web/src/features/workforce/`. Explicit full paths override these roots. Add `apps/api/app/models/clinic/workforce/kiosk_session.rb` alongside the sc383 models. Shared existing filenames abbreviated above retain their listed directory: `append_only.rb` is in `apps/api/app/models/concerns/clinic/`, `client.ts` is in `apps/web/src/api/`, and `members_controller.rb` is in `apps/api/app/controllers/clinic/staff/`.

| Slice | Proposed files (in addition to centrally allocated migrations) |
| --- | --- |
| sc382 | `apps/api/app/models/clinic/workforce/employment.rb`, `employment_site.rb`, `settings_version.rb`; `apps/api/app/controllers/clinic/workforce/employments_controller.rb`, `settings_controller.rb`; `apps/api/app/services/clinic/workforce/effective_settings.rb`, `link_employment.rb`; `apps/api/app/serializers/clinic/workforce/employment_serializer.rb`; `apps/web/src/features/workforce/EmploymentAdminPage.tsx`, `WorkforceSettingsPage.tsx`. Host invitation/activation filenames are chosen only after sc382 confirms the existing identity boundary. |
| sc383 | `badge_credential.rb`, `kiosk_enrollment.rb`, `punch_challenge.rb`, `punch.rb`; `badges_controller.rb`, `kiosks_controller.rb`, `apps/api/app/controllers/workforce/kiosk_clock_controller.rb`; `issue_badge.rb`, `resolve_badge_challenge.rb`, `record_punch.rb`; `apps/web/src/features/workforce/BadgeAdminPage.tsx`, `KioskClockPage.tsx`. |
| sc384 | `timecard_version.rb`, `time_segment.rb`, `adjustment_request.rb`; `timecards_controller.rb`, `adjustments_controller.rb`; `calculate_timecard.rb`, `decide_adjustment.rb`; `apps/web/src/features/workforce/EmployeeHoursPage.tsx`, `TimecardReviewPage.tsx`. |
| sc385 | `schedule_template.rb`, `schedule_draft.rb`, `shift.rb`, `schedule_publication.rb`; `schedules_controller.rb`; `validate_schedule.rb`, `publish_schedule.rb`; `apps/web/src/features/workforce/ScheduleBuilderPage.tsx`, `EmployeeSchedulePage.tsx`. |
| sc386 | `availability_version.rb`, `time_off_request.rb`, `shift_swap_request.rb`; `workforce_requests_controller.rb`; `decide_workforce_request.rb`; `apps/web/src/features/workforce/EmployeeRequestsPage.tsx`, `RequestReviewPage.tsx`. |
| sc387 | `payroll_configuration_version.rb`, `export_batch.rb`, `export_row.rb`; `payroll_exports_controller.rb`; `validate_payroll_mapping.rb`, `generate_payroll_export.rb`; `apps/web/src/features/workforce/PayrollExportPage.tsx`. |

### Representative HTTP contracts

All authenticated clinic routes use the existing session/CSRF client and derive practice/actor server-side. Kiosk routes derive practice/site from the enrolled server session. Responses use opaque string IDs, a schema/version discriminator, and explicit `error.code`; clients never infer success from HTTP submission alone. The server computes a canonical payload digest excluding credential material and records server time for normal punches. Never trust a submitted digest, actor, site, or clock timestamp. Asserted backdated times enter the authorized correction workflow only.

| Method and path | Representative request | Representative success response |
| --- | --- | --- |
| `POST /api/clinic/workforce/employments` | `{ staff_member_id, membership_id, site_ids, effective_from }` | `{ schema_version, employment: { id, status, staff_member, membership_summary, sites, effective_from } }` |
| `PUT /api/clinic/workforce/settings` | `{ scope: { kind, site_id? }, effective_from, expected_revision, values: { kiosk_enabled, camera_enabled, scanner_enabled, pin_required, ... } }` | `{ settings_version, effective_settings }`; explicit false survives overlay. |
| `POST /api/clinic/workforce/badges` | `{ employment_id, format }` | `{ badge: { id, issued_at, printable_payload_once } }`; later reads omit payload. |
| `POST /api/workforce/kiosk/challenges` | `{ badge_payload }` under enrolled cookie | `{ challenge_id, expires_at, employee_hint, allowed_transitions, pin_required }`. |
| `POST /api/workforce/kiosk/punches` | `{ challenge_id, transition, pin?, idempotency_key }` | `{ result: saved|prior_result|debounced, punch_id?, current_state, recorded_at }`; prior success is returned before consumed-challenge failure when binding/server-computed digest match. |
| `POST /api/clinic/workforce/timecards/:id/adjustments` | `{ interval, proposed_values, reason, idempotency_key }` | `{ adjustment: { id, status }, successor_timecard_version? }`. |
| `POST /api/clinic/workforce/schedule-drafts/:id/publish` | `{ expected_revision, idempotency_key }` | `{ publication: { id, version, published_at }, shifts }`. |
| `POST /api/clinic/workforce/requests/:id/decision` | `{ decision: target_accept|target_decline|manager_approve|manager_deny, reason?, expected_revision }` | `{ request: { id, status, decided_at }, schedule_change_proposal_id? }`; swap approval cannot precede target consent. |
| `POST /api/clinic/workforce/payroll-exports` | `{ configuration_version_id, timecard_version_ids, idempotency_key }` | `{ batch: { id, status, source_digest, validation_errors } }`; generation/delivery status is polled/read separately. |

## Authorization and effective configuration

Add separate capabilities for workforce administration, kiosk enrollment/badge management, clock self-service, timecard read/review/approve, schedule read/manage/publish, request review, and payroll configure/export. Practice grants may operate across sites; site grants are restricted to their site. Employee self-service always derives employment from `current_user -> active same-practice membership -> employment`, never a submitted employee ID.

Effective configuration is resolved server-side at the action timestamp: select the applicable practice version, then overlay each non-inherit site property, preserving explicit false. Record the resolved configuration/version identifiers on consequential facts. Client visibility is convenience only; every mutation reauthorizes actor, practice, site, employment activity, and transition.

Directory `active=false` or inactive membership blocks new workforce mutations by that employee. Revoked site assignments block actions requiring that assignment; a revoked badge blocks that credential's clock actions, not an otherwise authorized account's schedule/timecard access. A lost badge can be replaced while the original shift remains open. Historical reads remain subject to current authorization. If inactivation prevents closing an interval, an authorized manager resolves it through append-only correction/review, never an inferred revocation punch. Workforce inactivation does not mutate `users`, other memberships, or patient portal records.

## Build order and ownership

| Wave | Owner recommendation | Files/contract ownership | Isolation and verification expectation |
| --- | --- | --- | --- |
| 0: sc382 shared foundation | Coordinator | migrations/schema integration, `Ability`, routes, context/contracts, identity seam, shared models | Serial in integration checkout; verify tenant constraints and every dependent contract before clock/schedule branches start. |
| 1A: sc383 + sc384 clock/calculation | Sol | coupled badge, kiosk, punch, locking, time state, calculation/correction vertical slices | Isolated worktree after Wave 0; no schedule/settings shared-file edits. Verify each slice source -> API -> UI -> persistence before integration. |
| 1B: sc385 schedule/settings surfaces | Terra | feature-local schedule/template UI and bounded schedule/settings endpoints/models | Isolated worktree after shared contracts; no shared migrations/routes/contracts unless coordinator assigns them exclusively. Verify draft and publish separately. |
| 2: sc386 requests | Terra | request models/services/API/UI using published schedule contract | Starts after sc385 contract is integrated; verify each state transition and resulting proposal. |
| 2: sc387 export | Sol or coordinator | normalized approved-time input, configuration/mapping, immutable export pipeline | Starts after sc384 approval/version contract; provider-specific work remains separate. Verify preview, generation, retry, and supersession. |
| 3: sc388 integrated audit | Coordinator-led | no implementation ownership assumed | Run only after all required slices integrate; collect evidence defined in the audit plan. |

Do not parallelize migration IDs, `db/structure.sql`, routes, `Ability`, shared contracts/context, or the same mutable database/runtime. Every future implementation run must inspect its isolated diff and explicitly verify its vertical slice; an agent summary or passing unit test is insufficient.

## Required failure behavior

- Same idempotency key plus kiosk/employee/transition/payload digest returns the original successful punch before challenge-consumed validation; the same key with a changed binding or payload is rejected. Debounce catches distinct near-simultaneous scans, while row/advisory locking prevents cross-device double transitions.
- Invalid state returns allowed next actions and never chooses clock-out automatically. Kiosk/network uncertainty remains visibly unsaved/unknown until server reconciliation.
- Blocked off-schedule punches are not discarded: accept authoritative time when permitted and flag the exception, or preserve an explicit failed attempt for manager correction under policy.
- Camera denial falls back to supported scanner/manual badge entry only if enabled; it never bypasses PIN or enrollment.
- DST gap/fold and overnight ambiguity block publication/calculation until resolved by declared policy; calculations use UTC instants.
- Export failure retains the frozen source/version and safe retry identity. Changed mappings or corrected timecards create a new batch/version rather than rewriting downloaded output. Live provider delivery is outside the custom-file baseline and requires separately authorized adapter work.

## Completion definition

A slice is implemented only when its database facts, service, API, authorized React journey, failure/recovery behavior, and audit metadata are connected without fabricated values. It remains pending verification until the [audit plan](EMPLOYEE_WORKFORCE_AUDIT_PLAN.md) has evidence against an identified revision and environment.

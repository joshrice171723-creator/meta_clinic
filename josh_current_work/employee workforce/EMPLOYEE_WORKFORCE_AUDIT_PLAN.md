# Employee Workforce Audit Plan

[Roadmap index](../ROADMAP_INDEX.md) | [Roadmap](ROADMAP.md) | [Build plan](EMPLOYEE_WORKFORCE_BUILD_PLAN.md)

## Purpose and evidence boundary

This is a future audit specification, not executed evidence. It does not certify payroll/legal compliance, privacy/security, accessibility, production readiness, or release approval. Each run must name the Git revision, database schema revision, environment, effective configuration versions, fixture provenance, browser/device matrix, commands, timestamps, and retained artifacts. Use independently created development fixtures only.

For every journey, collect all four layers: persisted database facts/constraints; Rails request/service logs with request and causal IDs but no secrets; API request/response results; and visible desktop plus narrow-layout behavior. A UI screenshot alone is insufficient.

## Gate 1: tenant, identity, and authorization

- Prove one practice cannot query, link, scan, schedule, adjust, or export another practice's employee, site, membership, badge, or opaque ID. Try swapped IDs and guessed/random IDs.
- Prove a staff member links only to a same-practice active membership and eligible same-practice sites. Duplicate/current link constraints fail atomically.
- Prove employee self-service ignores submitted actor/employee IDs and resolves from the authenticated membership.
- Exercise each proposed permission at practice and site scope, including denied reads and writes. A site manager cannot act at another site; practice authority can act only inside its practice.
- Set directory employment inactive, membership inactive, site assignment inactive, badge revoked, kiosk revoked, and effective settings false independently. Each immediately blocks the relevant new self-service action while historical authorized reads remain intact. If time is open, prove no revocation punch is fabricated and a manager can resolve it only through the append-only correction/review trail.
- Prove directory deactivation does not silently mutate the global user or unrelated access. Prove workforce activation cannot create or reuse patient portal credentials.
- Inspect the bounded staff account provisioning path if implemented: authorization, invitation/activation, uniqueness, revocation, enumeration resistance, and audit trail. If not implemented, record the missing dependency as a release blocker for unlinked employees.

## Gate 2: configuration and site semantics

- Create practice defaults and site overrides for every boolean, specifically `true -> explicit false`, `false -> explicit true`, and inherit. Verify server resolution at boundaries before/at/after effective timestamps.
- Attempt overlapping effective versions, cross-practice site references, missing practice defaults, retired sites, and retroactive changes affecting frozen facts. Constraints/services must reject or preserve prior resolved version provenance.
- Verify multiple-site employment inside one practice and reject cross-practice identity/assignment. Confirm site opening hours are only advisory and never become shifts or automatic time deductions.
- Confirm effective IANA time zone selection and that configuration changes do not reinterpret already persisted punches/publications/exports.

## Gate 3: badge and kiosk security

- Measure generated badge entropy/uniqueness. Permit the raw badge token only in the authorized issuance/print response, then inspect database, later API responses, logs, caches, browser storage/history, analytics, and error telemetry to prove it did not persist. PIN/enrollment/challenge secrets receive no display exception.
- Verify issue/print-once, lost-print reissue, revoke, replace, and old-badge rejection. Because only a digest remains, ordinary reprint must be unavailable and reissue must revoke the old credential. QR/barcode payload must be opaque and contain no employee/practice/site/database identifier.
- Verify kiosk enrollment is server-authorized and bound to one practice/site. From that session, attempt clinic context, staff directory, chart, patient, billing, schedule-management, and export APIs; all unrelated access must fail.
- Exercise scanner, camera permission allow/deny, camera disabled, scanner disabled, kiosk disabled, and optional PIN settings. No fallback may bypass effective policy.
- Verify challenge expiry, one-use consumption, replay, wrong PIN, repeated failures/rate limiting, revoked badge, inactive employee, and wrong site. Responses must not enumerate unrelated employees.
- After success/failure, confirm minimal employee data clears automatically and is absent after reload/back navigation. Verify no badge or PIN is retained in local/session storage.

## Gate 4: punch integrity, concurrency, and recovery

- Exercise valid sequences: clock-in -> clock-out and clock-in -> break-start -> break-end -> clock-out. Exercise every invalid/repeated/out-of-order transition and prove no implicit clock-out on rescan.
- Send identical retries with one idempotency key, conflicting payloads with that key, and distinct rapid scans inside/outside debounce. A bound identical retry after the challenge was consumed must return the prior success; changed kiosk/employee/transition/payload digest must fail. Distinguish original replay, debounce response, invalid state, and newly persisted punch.
- Race two kiosks/devices for the same employee at the same and different sites. Prove transaction locking permits one authoritative transition and returns a reconcilable conflict to the loser.
- Drop the response before/after commit and retry. UI must show unsaved/unknown until reconciliation, retain the retry identity, and never claim success from local state.
- Simulate connectivity loss: no offline punch is fabricated. Verify the manager correction route preserves asserted time, reason, requester, reviewer, and linkage to the incident without editing raw punches.
- Try an off-schedule, closed-facility, early/late, overlapping-site, and unassigned-site punch. No time is silently lost; policy either accepts and flags it or records a visible blocked attempt for correction.
- Confirm raw punches are append-only under application and direct model attempts; corrections and recalculation create new versioned records.

## Gate 5: calculations, time zones, and approvals

- Verify UTC storage plus IANA zone/offset/local-date provenance for normal, overnight, spring-forward gap, fall-back fold, and time-zone change cases. Compare durations to UTC instants, not naive local subtraction.
- Verify missing clock-out, missing break end, double break, overlapping work, cross-site continuation, and manual correction exceptions remain visible and deterministic.
- Aggregate one employee's practice-owned workweek across multiple practice sites. Apply different site overtime/break/rounding overrides and prove deterministic category allocation, retained unrounded duration/policy provenance, no restarted weekly totals, and explicit unresolved-policy errors before approval. Workweek boundaries are independent from export cadence.
- Revoke a lost badge during an open shift: account access stays separately authorized, and using a replacement badge does not create another open shift.
- Confirm no schedule-based unpaid deduction. Planned breaks may be compared to punches but cannot erase paid time. Inspect outputs for guessed overtime, premium, statutory break, rounding, or wage rates; none may appear without an approved versioned policy.
- Verify submit/approve/reject/reopen rules, separation-of-duties policy, reasons, actor/time audit, and optimistic concurrency. Once approved or exported, mutation fails; correction creates a successor version and records supersession.

## Gate 6: schedule and optional requests

- Build a template, create/edit a draft, detect employee/site overlap and ineligibility, publish, and read the employee view. Prove employees cannot see drafts and a publication snapshot does not change when template/draft records change.
- Verify overnight/DST shift resolution and ambiguous local-time handling. Confirm site opening-hour mismatch is a warning/policy exception, not a shift replacement.
- Race two editors and two publish requests; stale revisions conflict and one idempotent publication wins. Verify a later edit creates a new draft/publication version.
- With each optional feature disabled at practice and site scope, endpoints and UI are absent/denied. When enabled, test availability, time-off, and swap draft/submit/cancel/target-accept/target-decline/manager-approve/manager-deny/expiry paths. A swap must have target consent before approval; configured automatic manager approval may follow consent but never replace it.
- Prove request approval does not mutate an immutable published shift directly. It creates a traceable schedule proposal/change that must pass validation and publication.
- Verify swap participants, offered/target shifts, site eligibility, overlap checks, manager authority, stale shift versions, and revoked employment during approval.

## Gate 7: payroll configuration and exports

- Verify only implemented provider kinds are selectable. The custom mapping validates required fields, types, formats, duplicate destinations, unknown codes, missing employee payroll identifiers, and dangerous spreadsheet formula prefixes.
- Prove configuration versions are effective-dated, practice-scoped, credential-free in application records/logs, and immutable for generated batches. Site overrides cannot escape practice export authority.
- Preview and generate from explicitly approved timecard versions. Compare batch digest, rows, totals, workweek attribution, source-version references, and configuration version to persisted evidence.
- Retry failures before and after custom-file artifact creation/download. One retry identity must not duplicate the batch; failure preserves frozen sources. Mapping/timecard changes produce a new batch, and downloaded output is superseded rather than overwritten. Do not initiate live provider delivery in the baseline audit.
- Prove unauthorized employees/site managers cannot preview, download, deliver, or view sensitive export details. Verify retention/download controls and audit records for every access.
- Provider certification, credentials, live delivery, payroll correctness, and statutory interpretation remain separate gates; absence of an adapter must be shown truthfully, not hidden behind a success state.

## Gate 8: UI, accessibility, observability, and operations

- Run employee, manager, administrator, and kiosk journeys at desktop widths 1280 and 1440, tablet widths 768, 834, and 1024, plus the supported narrow fallback. Verify keyboard-only operation, focus order/restoration, scanner-as-keyboard behavior, labels, validation association, contrast, zoom, status announcements, reduced motion, and camera alternatives.
- Confirm every loading, empty, denied, stale, offline/unknown, partial, and server-error state is truthful and recoverable. No fabricated employee, shift, hour, setting, approval, or export values appear.
- Correlate enrollment, badge lifecycle, scans, punch attempts/results, corrections, approvals, publications, request decisions, and exports by opaque IDs/request IDs. Logs must exclude PINs, raw badge/challenge/enrollment secrets, and unnecessary employee detail.
- Exercise clock, schedule, calculation, and export job retries; database outage; clock skew; stale sessions; revoked permission mid-flow; and partial external-provider failure. Document alerts, reconciliation queries, support actions, and safe rollback/supersession.
- Review retention, encryption, key rotation, backup/restore, incident handling, rate limits, abuse controls, and performance/load results at expected kiosk concurrency. These require explicit evidence and approval; source inspection cannot close them.

## Evidence matrix and release decision

### Future verification entry points

Proposed focused coverage files under `apps/api/test/integration/` are `employee_workforce_access_test.rb`, `employee_workforce_clock_test.rb`, `employee_workforce_timecards_test.rb`, `employee_workforce_schedules_test.rb`, and `employee_workforce_exports_test.rb`. Frontend coverage belongs in `apps/web/test/employee-workforce.test.tsx`. Add meaningful service/concurrency cases alongside the owning slice as needed. These files are not created by this packet.

During authorized implementation, run owning Rails tests in an isolated task database, relevant frontend tests/typecheck/build, and checks selected by `python -B bin/agent-check --path apps/api --path apps/web`. Follow existing API instructions for migration/tenant/concurrency/history checks and the shared-contract `bin/verify-web` gate. Record visible journeys separately. This planning run performs document/link/diff checks only.

| Milestone | Minimum future evidence | Blocking failures |
| --- | --- | --- |
| sc382 | migration/constraint results, authorization matrix, API/UI linkage journey, deactivation audit | cross-tenant link, patient-auth reuse, implicit global account mutation, missing provisioning path for required users |
| sc383 | entropy/storage inspection, kiosk containment, transition/retry/concurrency traces, visible recovery | secret exposure, chart access, replay, double punch, implicit clock-out, false saved state |
| sc384 | immutable punch proof, deterministic calculation fixtures, correction/approval/freeze journey | edited raw punch, lost labor, guessed rules, mutable approved/exported version |
| sc385 | draft/publication/version evidence, employee read isolation, DST/overlap cases | draft leakage, mutable publication, ambiguous time accepted silently |
| sc386 | feature-gate and full request transition evidence | disabled feature callable, approval bypasses schedule validation/publication |
| sc387 | mapping validation, reproducible batch/digest, permission and retry/supersession evidence | unsupported integration claim, mutable/double-delivered output, unapproved source |
| sc388 | cross-browser/device integrated journeys, negative/security/accessibility/operations evidence | any unresolved critical tenant, identity, punch integrity, wage-loss, or kiosk-containment defect |

Record findings by severity, exact reproduction, affected revision/configuration, evidence link, owner, and retest result. A release decision requires every required milestone's evidence, explicit disposition of residual risks, and named operational/legal/payroll approvals where applicable. Passing automated checks alone does not establish readiness.

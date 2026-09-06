# Employee Workforce Roadmap

[Roadmap index](../ROADMAP_INDEX.md) | [Build plan](EMPLOYEE_WORKFORCE_BUILD_PLAN.md) | [Audit plan](EMPLOYEE_WORKFORCE_AUDIT_PLAN.md)

## Status and authority

This is a planning-only packet for employee workforce operations. It does not claim implementation, test, migration, runtime, browser, security, payroll, legal, or release evidence. Shortcut owns mutable task state; the linked stories define independently deliverable outcomes. The inspected source map was based on `38547aff18e9` and rechecked at `ddbeb076904f`; the intervening change was outside these workforce entry points.

## Objective and actors

Give a practice with multiple sites a server-authoritative way to:

- link an employee directory entry to that employee's existing clinic login;
- issue, print, revoke, and replace a unique random barcode/QR badge;
- run an enrolled, clock-only web kiosk using scanner input or camera capture, optionally requiring a PIN;
- record clock-in, break start/end, and clock-out events and calculate reviewable hours;
- build schedule templates, save drafts, and publish site schedules;
- optionally collect availability, time-off, and shift-swap requests with approvals;
- optionally export approved time data through configured file/provider mappings without implying every payroll provider is supported.

Actors are employees, workforce managers, practice administrators, enrolled kiosk devices, and export operators. A secure kiosk session is not a staff login and must never expose patient charts or the general clinic workspace.

## Scope boundaries and assumptions

The practice is the tenant and company-default boundary. Sites are locations inside one practice and may override practice workforce settings, including an explicit `false`; identities, badges, punches, schedules, and exports never cross practices. An employee may work at several sites in the same practice. Workweek totals aggregate that employee across those sites, while payroll export cadence is a separate configuration.

The existing staff directory is not identity authority. `Clinic::Staff::Member` currently stores practice-scoped encrypted display name, job title, active state, and address reference but no login linkage. `Clinic::Membership` links one user to clinic access and provides active membership and role grants. Workforce must reuse the existing clinic session, tenant, site, authorization, and audit infrastructure. If a suitable existing account can be selected, link it; otherwise employee invitation/activation and account provisioning are a bounded host-identity implementation, not a workforce-local credential store. Patient portal authentication must not be reused.

Existing site operating hours and hour exceptions describe facility opening times and may inform warnings; they are not employee shifts and must not be copied into schedule records or used for automatic unpaid deductions. Statutory overtime, premium, break, rounding, and payroll rates remain unresolved configuration/legal-policy inputs; the system must not guess them.

## End-to-end milestones

| Order | Outcome | Shortcut outcome | Completion boundary |
| --- | --- | --- | --- |
| 1 | Employment identity, site eligibility, and effective settings | [sc382](https://app.shortcut.com/apply-1/story/382) | An administrator links one directory member to one same-practice active membership, assigns allowed sites, sets practice defaults/site overrides, and can inactivate workforce access without silently mutating the global account. |
| 2 | Badge and kiosk clock | [sc383](https://app.shortcut.com/apply-1/story/383) | A manager issues/revokes a printable random badge; an enrolled site kiosk resolves badge + optional PIN through a one-use challenge and persists one valid punch transition. |
| 3 | Timecards and corrections | [sc384](https://app.shortcut.com/apply-1/story/384) | Employees/managers can read calculated periods; corrections preserve raw punches, require reason/provenance, follow approval policy, and freeze approved/exported versions. |
| 4 | Schedule templates and publication | [sc385](https://app.shortcut.com/apply-1/story/385) | A manager creates templates and draft shifts, validates overlaps/site eligibility, publishes an immutable schedule version, and employees see only authorized published shifts. |
| 5 | Optional employee requests | [sc386](https://app.shortcut.com/apply-1/story/386) | Enabled sites support availability changes, time-off, and shift swaps with explicit submit/approve/deny/cancel transitions and no direct schedule mutation. |
| 6 | Optional payroll export | [sc387](https://app.shortcut.com/apply-1/story/387) | An authorized operator configures a bounded mapping, previews, creates an immutable export version from approved timecards, and records delivery/download outcome. |
| 7 | Integrated evidence | [sc388](https://app.shortcut.com/apply-1/story/388) | Future audit evidence demonstrates tenant/site isolation, concurrency, retries, time-zone boundaries, kiosk containment, corrections, publication, and export reproducibility. |

The packet itself is covered by planning story [sc379](https://app.shortcut.com/apply-1/story/379). Dependencies are technical ordering, not a duplicate status register.

## State ownership and critical invariants

- **Employment:** `active -> inactive`; reactivation is explicit. Directory or employment inactivity immediately denies new employee self-service actions, including kiosk punches, but must not silently disable a global user account or erase history. If an interval remains open, a manager reviews/closes it through an append-only correction; revocation never fabricates a punch.
- **Badge:** `issued -> revoked` or `issued -> replaced` (which revokes the prior credential). The raw secret is returned only in the authorized issuance/print response and is never stored afterward; a lost print requires reissue/replacement. Printed payloads use opaque random values, not employee/database identifiers.
- **Kiosk:** administrator-enrolled session bound to practice and site; capabilities are restricted to challenge/punch endpoints. No badge, PIN, challenge, or employee detail is persisted in browser local storage.
- **Punch:** append-only raw events: `clock_in`, `break_start`, `break_end`, `clock_out`. Retry idempotency and duplicate-scan debounce are independent. A rescan never silently clocks an employee out; the server returns current state and requires an explicit intended transition.
- **Concurrency:** lock the employee's open time state across all devices/sites before validating and inserting a punch. A successful idempotent retry returns the prior result before challenge-consumed rejection; replay defense still binds the key/challenge to kiosk, employee, intended transition, and payload digest. A site mismatch, stale unrelated challenge, invalid state, or duplicate transition returns a safe conflict without fabricating success.
- **Time:** persist instants in UTC and record site IANA time zone plus offset/local-date provenance. Overnight shifts and DST gaps/folds use explicit rules; no duration is derived from naive wall-clock subtraction.
- **Timecard:** calculated versions derive from raw punches and approved adjustments. Practice policy owns the employee workweek and aggregation calculation across all practice sites; a site may override local break/exception behavior but cannot restart weekly totals. Payroll export cadence is independent. Approved/exported versions are immutable; a later correction creates a new version and, if necessary, an explicit export supersession.
- **Schedule:** template -> draft schedule -> published version. Publication snapshots shifts; later edits create another draft/version. Schedule variance can flag an exception but cannot block a lawful punch and lose labor.
- **Requests:** draft/submitted/accepted-or-declined-by-target/approved/denied/cancelled with actor and timestamp. A swap always requires the target employee's consent before manager approval, including when policy permits automatic manager approval. Approval creates a proposed schedule change that follows schedule validation/publication rather than rewriting a published shift.
- **Export:** draft/validated/generated/delivered/failed/superseded. Provider adapters are opt-in and only named when implemented; custom mapping must be versioned and validated before generation.

## Failure and recovery outcomes

The kiosk is online-first. If submission is uncertain, retain an explicit unsaved/unknown result, retry with the same idempotency key, and reconcile with the server. Do not offer a client-side offline punch engine in this scope. If connectivity prevents authoritative confirmation, instruct the employee to contact a manager; the manager correction path records the asserted time, reason, requester, approver, and related failed-attempt metadata without altering raw punches.

After a recognized scan, show only the minimum employee confirmation and current allowed actions, then automatically clear that display. Repeated bad PINs, revoked badges, inactive employment, unassigned sites, and challenge replay are rate-limited/audited without revealing whether unrelated employees exist.

## Release gates and first implementation boundary

Each milestone is a vertical slice from persisted source through Rails service/API to React UI, with authorization, audit, failure behavior, and later evidence. No UI may fabricate employees, shifts, hours, settings, or export results. Gate details are in the [audit plan](EMPLOYEE_WORKFORCE_AUDIT_PLAN.md).

The first bounded implementation action is sc382: define shared employment/site-assignment/effective-settings contracts and migration ownership, same-practice linkage rules, workforce permissions, and the administrator link/configure/inactivate journey. Badge, time, schedule, request, and export work waits on that authority boundary.

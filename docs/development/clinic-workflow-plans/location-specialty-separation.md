# Location specialty separation: weight loss and behavioral health

## Assignment and authority

Requested 2026-10-02: make differences between weight-loss and behavioral-health locations explicit, prevent workflows from mixing, and provide ordered visible progress. Joshua subsequently authorized implementation with “take care of it.” Application changes are in progress; runtime acceptance must be recorded separately. The single live checklist is [Location specialty separation in the implementation tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md#location-specialty-separation).

Accepted outcome: each location exposes its configured specialty and selected services consistently throughout setup, new-work creation, clinical work and follow-up. Shared capabilities remain reusable. An organization with different specialties at different locations must not leak one location's new-work choices into another. Existing authorized clinical history remains available under its own access rules; separation does not mean duplicating patients or concealing relevant history.

Scope: current weight-loss and behavioral-health profiles, their selected services, shared capabilities, location context, permissions and historical revision handling. New ABA, group/family therapy, assessment instruments, prescribing integrations and clinical protocols are separate future work. No deployment, data reset, external communication or background automation is authorized by this brief.

## Current sources and decisions

- [Product](../../../PRODUCT.md), [strategy](../../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md), [D-078 capability architecture](../../architecture/clinic-capability-architecture.md), and [Decisions](../../../APPlyVault/03%20Execution/Decisions.md): shared core; independent specialty, service, modality and payment choices; scoped change authority. D-080 supplies the existing protected psychotherapy-note direction.
- [Build and acceptance guide](../meta-clinic-build-and-acceptance.md): canonical field/action and dependency contract. This brief does not duplicate that matrix.
- [Behavioral-health assignment](behavioral-health-therapy.md) and [weight-management intake tracking](../weight-management-intake-tracking.md): retain their original scope and unresolved acceptance; this assignment does not replace those trackers' owning MC/BH records.
- Baseline: current remote main `e562e57f6484`, pulled in a clean managed worktree. The original checkout at `0f5c9627` has unrelated and overlapping location-setup edits; do not stage or overwrite them. Reconcile their owner before later application edits.
- Source-inspected starting points: `PracticeFeatures.snapshot/revise`, `StarterProfile.apply/form_id/service_available?`, behavioral-health questionnaire, protected-note service and shared clinical-plan owner. Compared current configuration/preset changes with the earlier audit. Current main adds service-disable impact review and preservation of renamed/retired visit identities; retain these behaviors. The broader end-to-end inventory remains pending.
- Candidates to investigate, not proved application-wide defects: clinic-default fallback for a location without an explicit profile; permissive service checks before finalization; practice-wide visit types versus location-specific availability; creation of psychiatric visit mappings when their service is unselected; UI/cache/draft context across location changes.
- This is a software configuration boundary, not a clinical treatment rule. No clinical guide determines which sidebar to show. Before substantive clinical field/template changes, follow [healthcare standards](../healthcare-standards.md) and the [U.S. reference map](../us-healthcare-reference-map.md); record exact applicable source/version and interpretation in the existing owning workflow. Do not invent clinical thresholds or infer that mental-health screening is exclusive to behavioral health.

## Connected journey

Follow the same ordered journey for location W (weight loss) and location B (behavioral health) in one synthetic organization:

1. Authorized setup staff select an explicit location, specialty, services, assessments, modality and payment options; save/reload and finalize valid dependencies. A clinic default may suggest values but must not silently establish a location's chosen specialty.
2. Front desk or patient entry selects an offered service and location. Booking, series, public offerings, requests and intake resolve compatible choices from that location. Draft/disabled setup must not grant new clinical work merely because the shell is reachable.
3. Staff open the booked encounter. Its persisted location and service determine forms, templates and actions, even when the navigation's selected location changes elsewhere. Existing actor permissions remain independently enforced.
4. Clinician records care using the appropriate specialty presentation over shared records. Weight-management forms/program views do not become therapy forms; therapy/private-note tools do not appear as new weight-loss work. Ordinary weight, medication history and mental-health screening remain shared where applicable.
5. Billing, prescriptions, tasks, follow-up, portal views and reports retain source location/service attribution and their own authorization. No cross-location copying of drafts, signatures, assessment interpretation, charges or private-note content.
6. Disable a service, change permitted settings, revisit historical records, and switch locations with open work. Preserve record versions and owners; stop only prohibited new actions and offer a clear recovery path. Organization-wide views aggregate authorized records with location labels, without turning aggregation into write authority.

## Fields and action rules

The following is the implementation mapping for LS-02. Each gate still requires its recorded verification.

| Configuration or context | Owner / origin / control | Required distinction and recovery |
| --- | --- | --- |
| Location | Existing site owner; explicit scoped reference | Required for location-specific setup/new work. Never infer another site's capability from organization defaults. |
| Specialty | Location feature revision; bounded setup select | Weight loss and behavioral health select reviewed presets, not clinical findings or staff privileges. Changing protected setup follows existing impact/change authority. |
| Services | Backend configuration; compatible multi-select | Specialty makes supported choices available; selected service permits its dependent new work. Unselected psychiatric/therapy services must not be activated by preset generation. |
| Assessments | Existing assessment selection and revisions | Shared depression/anxiety/general screening stays available where selected. Specialty-specific instruments/templates use explicit supported configuration; no automatic scoring protocol. |
| Modality and payment | Existing telehealth/insurance/cash configuration | Independent of specialty. Do not assume all weight loss is cash-pay or all behavioral health is insured/video. |
| Record context and revision used | Persisted appointment/encounter/site/service/form references | Read-only origin on historical work; validate mismatches and stale revisions on the server. Draft recovery remains bound to its original patient/location/record. |
| Staff authority | Existing membership/site permissions | Configuration never grants privileges; current permissions apply to reads and writes independently. |
| Reason and recovery | Backend decision projected to UI | Identify unavailable service, wrong location, incomplete setup, stale revision or denied action without conflating them. Final user wording belongs to the changed owning flow. |

Separation examples to adjudicate in LS-02:

- Weight-loss-specific: weight-management initial/return intake, weight-program longitudinal context, relevant program templates and follow-up presentation. Routine weight/BMI observations and medication tools remain shared.
- Behavioral-health-specific: initial/return specialty intake, therapy/psychiatry templates and specialty caseload presentation. Individual therapy/private notes and psychiatric/ADHD evaluation require their selected service and existing permissions.
- Shared or independently optional: patients, scheduling/series, generic notes/plans/goals, assessments, safety tasks, referrals, telehealth, medication reconciliation, prescribing preparation, billing, insurance/authorization, inventory, portal and reports. Show only applicable configured operations; reuse their existing owners.
- New ABA and group/family workflows are not silently enabled by selecting Behavioral Health. Specialized privacy follows the record and permission rules, not the currently selected navigation location.

## Ownership and dependency matrix references

Canonical dependencies remain [CF-01 through CF-04 and CV-10](../meta-clinic-build-and-acceptance.md#workflow-dependency-and-ownership-matrix): valid scoped references, idempotent/stale preset handling, historical/unfinished-work preservation, change authority, and exact content revision use. No dependency rows are changed by this planning run.

Map configuration to MC-01/15, permissions/context to MC-13, scheduling to MC-04, intake/chart to MC-05/06, medication to MC-10, patient return to MC-12, and reports to MC-14; retain BH-01/BH-02 and the existing weight-loss acceptance scope. Use one integrator for shared configuration/API/UI contracts. The integrator owns configuration, drafts, evidence and Git integration. Delegated slices own scheduling/public requests, clinical workflows and frontend context. All use the same isolated worktree; only the integrator commits.

## Implementation and acceptance

Execute the ordered LS checklist in the canonical tracker. For every applicable surface record: inspected source/revision, expected behavior in W and B, shared-capability behavior, observed outcome, and unresolved items. Coverage labels are inspected, partial, blocked, or uninspected; discovery alone is not acceptance. Trace actual callers before changing shared symbols. Reuse existing domain/configuration owners; no duplicate patient ledger, specialty fork or universal rules engine.

Required proof scenarios for later implementation:

- W and B in one organization, same authorized staff member; same patient seen at both locations without copying encounter data.
- Behavioral Health with individual therapy disabled, then enabled; psychiatric services independently unselected. Weight Loss with relevant shared services independently on/off.
- Location without explicit specialty, draft setup, finalized setup, disabled service, unavailable dependency and inactive location.
- Correct location/service succeeds; wrong location/service is denied server-side through ordinary UI and direct request/deep-link entry. An unrelated permitted shared action still succeeds.
- Switch W to B and back with pending reads, open tabs, cached navigation, unsaved draft, browser Back/Forward and a retry. No stale response, wrong-context save or silent draft replay.
- Appointment/encounter origin versus current selector; series, public booking, intake, chart, follow-up, portal, reports and exports. Report every uninspected entry point.
- Repeated setup application, renamed/retired visit type, stale configuration, service removal and unknown outcomes. Preserve impact review, exact request identity and historical revisions.
- Current role/site denial, historical authorized read, protected psychotherapy-note isolation, multiple unfinished tasks, and encounter closure without losing follow-up ownership.

Use scoped source/diff review and necessary non-test checks during implementation. No application tests are added or run unless Joshua explicitly requests them. Browser proof is a separate milestone; if it is not performed, retain an unverified state. Passing source/type/build checks cannot complete the runtime-proof row. No clinical, live-provider or deployment acceptance follows from this tracker.

## Implementation evidence — 2026-10-02

Source implemented on `codex/location-specialty-tracker` from `4a18ea50`, isolated from the original dirty checkout. No schema, dependency, clinical protocol or deployment changes. Dot received scope and exact claimed files for parallel integration coordination.

| Surface | Source result | Observed verification / remaining coverage |
| --- | --- | --- |
| Configuration and presets | Explicit site revision; no clinic-default inheritance. Backend service/assessment matrix; preserved preset IDs; only selected service visits generated. | Rollback-only local check passes unconfigured/draft/selected/disabled/renamed/retired cases and shared custom visits. Inactive-site and role-denial runtime proof pending. |
| Setup UI | Compatible catalog for selected facility; explicit clinic-wide administration toggle; unfinished setup does not request optional offering panels. | Real browser saved/finalized W and B; W has weight initial/follow-up plus shared visit; B has behavioral initial/follow-up, selected therapy plus shared visit; psychiatry/ADHD unselected. Switching W/B exposed duplicate React keys, repaired and repeated successfully. |
| Booking / entry | Staff booking, series, holds, reschedule, waitlist, calendar, public inquiries/offerings and portal options use location availability; telehealth requires site configuration. | Source inspected. Full staff/public/portal bookings, recurrence, request acceptance and modality permutations not exercised in browser. |
| Intake / clinical | Encounter-origin templates and weight context; new assessment/private-note creation gated; ordinary shared care preserved. | Backend check verifies template separation and first intake for an existing booking after service removal. Complete intake, note signing, assessment/private-note permission and closure journeys pending. |
| Switching / drafts | Site request fence and response generation; navigation guard/remount; appointment drafts scoped by site with matching-only legacy recovery. | Source inspected; selected-facility W/B setup switch observed. Cross-tab delayed-response, unsaved-draft, Back/Forward and retry scenarios remain unverified. |
| History / unfinished work | Explicit persisted encounter/appointment origins permit authorized historical routes through unfinished navigation setup; practice lock serializes new gated care against configuration edits. | Source inspected and saved-booking intake check passes. End-to-end historical record amendments, task ownership and protected-note denial proof pending. |
| Billing / reports | Invoice, ledger, dashboard, daily invoices/payments/refunds and CSV project recorded origin; shared/unallocated amounts labeled explicitly. Money calculations and practice-wide aggregation retained. | Source inspected, frontend build passes. Financial browser/CSV round-trip proof pending. Prescription activity location labels remain a known gap; other reports, payroll and scribe exports uninspected. |
| Medication / follow-up | Existing encounter-site ownership, stock-site denial and task owners retained. | Bounded source review only; dispensing/prescribing/stock and follow-up lifecycle runtime proof pending. |

Checks performed: all 44 changed/new Ruby files parse; frontend TypeScript and production main/Office bundles pass; scoped diff whitespace passes. A small development-only, rollback-only executable check is retained at `apps/api/script/check_location_specialty.rb`; it passes profile, service, visit, template, shared-work, booked-intake and preset-identity cases. No framework/full regression suite was run. The final setup-key correction also passes TypeScript.

Local proof used an independently created organization on the isolated `apply_location_specialty_development` database (API3151/web3150). Broad development seeding initially failed on strict setup; newly created fixture sites now explicitly finalize primary-care setup. Its retry hit an unrelated clinician capacity collision and rolled back. Browser proof used a separate minimal fixture; broad seed success is not claimed. Screenshot evidence is local and ignored: `tmp/location-specialty-behavioral.jpg`.

This is bounded implementation and partial runtime evidence, not full LS-10 acceptance. Next ordered work: finish same-patient W/B booking-to-closure, role/site denial, history, cross-tab/draft and downstream report proof; resolve prescription report attribution; record every remaining report/export as inspected or excluded with a reason. Deployment and clinical/provider acceptance remain separate.

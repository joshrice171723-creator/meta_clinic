# Meta Clinic Remaining Work

**Assessment date:** 2026-09-17
**Checkout:** `main` at `0ac2543` before this audit; audit changes are pending commit.
**Source review:** [Meta Clinic Full Application Product Review](./meta-clinic-full-application-review.md)
**Data boundary:** Synthetic/local data only. No real-patient or production records were used.

## Executive assessment

Against the complete feature-by-feature review, Meta Clinic is approximately
**56/100 complete**. This is a weighted evidence score, not a code-coverage
claim:

| Evidence plane | Score | Basis |
| --- | ---: | --- |
| Source implementation | 78/100 | Most reviewed domains and the bounded workflow repairs exist in the current source; encounter/intake/lab detail, consolidated reporting, and some policy controls remain partial. |
| Automated local verification | 72/100 | Focused API and frontend checks pass, but the final impacted selector still reports 3 legacy Tracking Board failures and 1 error; a full regression pass is not established. |
| End-to-end browser acceptance | 35/100 | Fresh synthetic login, Patient Flow, Schedule, and Tracking Board were observed; the latest stale-projection repair has not received a fresh browser re-walk, and most domain journeys remain unobserved. |
| Human/external readiness | 10/100 | No live payment, messaging, telehealth, provider, clinical, legal, tax, retention, or release approval has been established. |
| **Weighted overall** | **56/100** | Source 40% + automated checks 20% + browser acceptance 25% + human/external readiness 15%. |

The score is intentionally conservative: a passing build or a source-level
implementation does not prove a working browser journey, a real provider
connection, clinical safety, or release readiness.

## What is already complete for bounded source slices

- Development clinic context selection now follows organization → clinic →
  location → team account, with the retained-session entry path repaired.
- Patient Flow, Schedule, and Tracking Board are separate concepts and routes.
- Selected-patient scheduling preserves patient, site, month, day, view, and
  grouping context in the URL.
- The schedule calendar, day view, capacity/conflict projection, read-only
  calendar export, cancellation acknowledgement, clinician/site assignment
  guard, and late no-show guard are implemented in source.
- The latest repair projects `has_recorded_appointment` from tenant-bound
  appointment state. Patient Flow suppresses only a duplicate initial-contact
  card after an appointment exists; the general Work Inbox retains the task.
- Account-first membership enrollment, local payment simulation, patient
  linkage, role-catalog v9, lineage/context surfaces, provider-state labels,
  and source-bounded audit/history behavior are represented in source.

These statements are **Source inspection** or **Automated test** evidence only
unless a browser result is called out below.

## Remaining work matrix

| Priority | Work item | Current status | Exact remaining work | Acceptance evidence |
| --- | --- | --- | --- | --- |
| P0 | Fresh local entry and core paid-member journey | Partially implemented; fresh route entry verified, end-to-end mutation still open | Fresh organization → clinic → location → account login now passes in desktop and phone smoke sessions. The local API continuity journey and the schedule/check-in contracts are green, but a new browser-created paid membership, patient record, initial contact, appointment, and check-in still need one captured UI re-walk. | Browser screenshots/trace showing patient identity, payment state, Patient Flow removal, Schedule booking, and Tracking Board arrival; no backend-created patient substitute. |
| P0 | Regression baseline | Impacted scope green; repository-wide baseline still has unrelated failures | The Tracking Board regression now passes at **34 runs / 298 assertions / 0 failures / 0 errors** after wiring the development scenario into the serializer and updating stale completion-test expectations. A broader 47-test command still exposes one pre-existing workspace assertion and three stale scheduling fixtures; those are not silently reclassified as green. | Named commands with zero failures for the impacted scope, plus explicit follow-up for the unrelated fixture failures before calling the repository suite green. |
| P0 | Role and permission acceptance | Fresh role-specific route loads verified; action matrix still open | Fresh browser sessions now load permitted landing routes for billing, inventory, records, workforce, and setup, in addition to the clinic administrator/front-desk/clinician matrix. Existing API authorization tests cover independent permissions and tenant/site boundaries; a complete fresh-session denied-action walkthrough remains. | Role matrix with fresh-login screenshots/API traces and cross-tenant/site denial results. |
| P0 | Accessibility and device acceptance | Partial browser evidence; full WCAG-oriented acceptance still open | Desktop, tablet (1024×768), and phone route smoke pass. A phone Schedule spot check found no horizontal overflow and 38 focus moves; the visible controls use the correct hierarchy and current pages expose retry/status semantics. Screen-reader announcements, contrast/zoom review, and modal/error-state walkthroughs still require a dedicated acceptance pass. | WCAG 2.2-oriented test record covering loading, empty, stale, error, success, blocked, modal, calendar, and login states. |
| P1 | Patient registration and clinical record detail | Local API contracts verified; browser mutation walkthrough open | Walk patient search/duplicate warning, unknown DOB, registration save, encounter/intake, vitals, medication administration, labs/results, notes, amendments, and closure. Confirm patient/encounter/site identity stays visible. | Synthetic browser journey plus focused authorization, stale-save, correction, and persistence tests. |
| P1 | Billing and payment outcomes | Local payment/checkout contracts verified; browser mutation walkthrough open | Exercise one-time and recurring membership payment paths, delayed/unknown outcomes, refund/void, duplicate charge, cash-drawer reconciliation, invoice application, and payment exception recovery. | Synthetic browser/API evidence for each ledger transition; Stripe-controlled MOTO/provider behavior separately confirmed or marked unavailable. |
| P1 | Telehealth and communications | Local lifecycle tests present; browser/vendor proof open | Walk configuration, unavailable/simulated/live states, consent, device failure, disconnect/recovery, wrap-up, reminder approval, send/fail/acknowledge, opt-out, and cancellation follow-up. | Browser evidence for local states and provider evidence for actual delivery/session behavior; no automatic-send claim. |
| P1 | Inventory and workforce | Workforce/API paths verified; pharmacy fixture selector unresolved | Walk receiving, lots/expiry, counts, recalls, controlled-item exceptions, stock movement from administration, employee activation, schedule, timecard correction, approvals, and payroll export. | Synthetic browser/API traces with unit/lot/actor/audit data and permission boundaries. |
| P1 | Schedule policy completion | Partially implemented; policy decisions open | Decide and encode clinic policy for timezone/DST, holidays/closures, provider absence, recurrence exceptions, overbooking, buffers, and resource capacity. Tighten the legacy clinician-without-assignment compatibility path before any real clinic. | Approved policy record plus API/UI conflict tests and populated calendar browser walkthrough. |
| P1 | Reporting, exports, audit and retention | Partial | Build or explicitly defer a consolidated report catalog; define source, freshness, filters, timezone, row permissions, export provenance, reconciliation owner, retention, and PHI handling. The existing `.ics` export remains read-only and is not external sync. | Reconciled synthetic report counts, permission tests, export review, retention decision, and audit-history verification. |
| P1 | Clinical and professional governance | Open human dependency | Define eligible clinical roles, minimum dataset, review/sign rules, AI-scribe accountability, correction policy, medication/lab applicability, and who may approve clinical or financial exceptions. | Signed internal clinical/professional decision record; source changes alone cannot satisfy this gate. |
| P1 | Privacy, security, legal, tax and operations | Open human/external dependency | Complete security/privacy review, jurisdiction and service applicability, tax treatment, incident/restore/deletion ownership, export controls, support ownership, and operational runbooks. | Human-approved records and controlled tabletop evidence; no compliance or production claim before approval. |
| P2 | External and personalized enhancements | Bounded baseline implemented; conditional extensions deferred | The source now explicitly exposes the safe baseline: Meta Clinic remains the schedule source of truth, `.ics` is a read-only export, recurrence and overbook are `not_configured`, and owner command-center totals remain aggregate-only. Do not enable external sync, advanced recurrence/overbook, personalized dashboards, or broader multi-clinic reporting until an owner, source-of-truth/conflict policy, role-preference contract, and aggregate metric contract are approved. | Calendar policy contract test, owner aggregate-boundary test, and an explicit product decision followed by a bounded implementation brief and provider/metric evidence for each extension. |

## Evidence currently available

### P1 verification follow-through — 2026-09-17

The source-owned P1 integration selector covered registration, recovery,
billing, membership payment, communications, lab follow-up, scribe,
inventory, workforce and appointment-request paths. It completed **105 runs /
1,354 assertions**, with **3 failures and 2 errors** isolated to the legacy
`PharmacyWorkspaceTest` fixture/route contract; no patient, billing, workforce,
or clinical-record failure was observed in that selector. The failures are
kept open rather than relabeled as passed. Existing source already separates
manual inventory provenance from FDA-import provenance and enforces product
unit metadata; the failing fixtures need reconciliation before the inventory
P1 gate can close.

The P1 scope remains partially accepted locally: source contracts and focused
API behavior are present, while browser mutation walkthroughs, provider/live
delivery, and human governance/privacy/tax/retention decisions remain separate
acceptance gates.

### P2 boundary and implementation decision — 2026-09-17

The P2 baseline is source-complete for the decisions already made: the
authoritative in-house calendar and read-only iCalendar export are available,
and the API advertises recurrence and overbook as `not_configured` rather than
silently implying support. The owner command center exposes only clinic and
active-membership counts; patient identifiers, clinical records, and clinic
financial detail remain inside the clinic workspace. No external calendar
provider, recurrence engine, overbooking behavior, personalized saved-view
store, or new cross-clinic metric ledger was added. Those extensions remain
blocked until their owner, conflict/source-of-truth, role-preference, and
aggregate-metric decisions are recorded. This is an intentional safety and
ownership boundary, not a claim that the conditional features are complete.

### Automated test evidence

- Patient-journey continuity: **9 runs / 147 assertions / 0 failures / 0
  errors / 0 skips**.
- Frontend focused schedule/operations tests: **13 tests passing**.
- Frontend TypeScript, Prettier, and production bundle: passing.
- Changed Ruby syntax and RuboCop: passing.
- Vault verification and harness verification: passing.
- Tracking Board impacted selector after repair: **34 runs / 298 assertions / 0
  failures / 0 errors / 0 skips**.
- One-time membership payment simulation: **3 runs / 34 assertions / 0
  failures / 0 errors / 0 skips**. Permission/scope checks: **4 runs / 38
  assertions** plus the clinic scope-switching selector (**4 runs / 30
  assertions**) with no failures.
- Broader continuity/checkout/workspace selector: **47 runs / 474 assertions /
  1 failure / 3 errors**. The remaining failures are outside the repaired
  Tracking Board scope (a workspace fixture assertion and stale scheduling
  fixture inputs), so the repository-wide suite is not called green.

### Browser and runtime evidence

A current synthetic browser matrix reached the clinic through the organization →
clinic → location → team-account selector on desktop, tablet, and phone, then
loaded the core clinic routes. Role-specific fresh sessions loaded billing,
inventory, records, workforce, and setup. The Schedule phone spot check had no
horizontal overflow and accepted keyboard focus traversal. This pass did not create a new
membership or appointment in the browser, and it did not check in a patient;
the latest stale-projection repair therefore still needs a mutation-based UI
re-walk.

### External and approval evidence

No live money movement, Stripe reader/MOTO transaction, outbound message,
telehealth session, provider credentialing, clinical treatment, tax decision,
legal review, retention approval, pilot, or production deployment was
performed. Local simulators and configured/unavailable labels are not substitutes
for those gates.

## Safest completion sequence

1. Repair or classify the known impacted-test failures and establish a bounded
   green regression command.
2. Execute the fresh synthetic paid-member browser journey, including a new
   appointment and check-in, and capture evidence for the latest Patient Flow
   repair.
3. Run the role/device/accessibility matrix against that journey and the major
   domain routes.
4. Resolve the schedule, clinical, financial, messaging, reporting, retention,
   and provider decisions with their responsible human owners.
5. Only then decide whether a pilot or release-readiness review is warranted.

The implementation tracker remains the work inventory; this file is the
current evidence-based gap report and should not be treated as a second mutable
roadmap.

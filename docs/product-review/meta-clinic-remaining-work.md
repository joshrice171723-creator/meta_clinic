# Meta Clinic Remaining Work

**Assessment date:** 2026-09-17
**Checkout:** `main` at `fe6d5bf`
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
| P0 | Fresh local entry and core paid-member journey | Partially implemented; browser-verified only for a retained synthetic session | Re-run fresh organization → clinic → location → account login, then use the frontend to complete a synthetic paid membership, patient record, initial contact, first appointment, arrival/check-in, and encounter start. Re-walk the stale Patient Flow projection after the latest commit. | Browser screenshots/trace showing patient identity, payment state, Patient Flow removal, Schedule booking, and Tracking Board arrival; no backend-created patient substitute. |
| P0 | Regression baseline | Unresolved | Reproduce and either repair or explicitly reclassify the 3 Tracking Board failures and 1 error from the final selector. Investigate the unrelated membership `publish_catalog` fixture failure before calling the repository suite green. | Named commands with zero failures for the impacted scope, or documented quarantines with owners and issue references. |
| P0 | Role and permission acceptance | Source-inspected; browser-unverified | Exercise owner, front desk, nurse, clinician, billing, inventory, workforce, and patient roles from fresh sessions. Prove denied actions stay denied while independent permitted work remains available. | Role matrix with fresh-login screenshots/API traces and cross-tenant/site denial results. |
| P0 | Accessibility and device acceptance | Unverified | Run keyboard-only, focus/order, screen-reader announcements, contrast, zoom/reflow, and error/retry checks at the supported desktop and tablet sizes; verify phone fallback. | WCAG 2.2-oriented test record covering loading, empty, stale, error, success, blocked, modal, calendar, and login states. |
| P1 | Patient registration and clinical record detail | Partially implemented; browser-unverified | Walk patient search/duplicate warning, unknown DOB, registration save, encounter/intake, vitals, medication administration, labs/results, notes, amendments, and closure. Confirm patient/encounter/site identity stays visible. | Synthetic browser journey plus focused authorization, stale-save, correction, and persistence tests. |
| P1 | Billing and payment outcomes | Source-inspected; browser-unverified | Exercise one-time and recurring membership payment paths, delayed/unknown outcomes, refund/void, duplicate charge, cash-drawer reconciliation, invoice application, and payment exception recovery. | Synthetic browser/API evidence for each ledger transition; Stripe-controlled MOTO/provider behavior separately confirmed or marked unavailable. |
| P1 | Telehealth and communications | Source-inspected; vendor-unverified | Walk configuration, unavailable/simulated/live states, consent, device failure, disconnect/recovery, wrap-up, reminder approval, send/fail/acknowledge, opt-out, and cancellation follow-up. | Browser evidence for local states and provider evidence for actual delivery/session behavior; no automatic-send claim. |
| P1 | Inventory and workforce | Source-inspected; browser-unverified | Walk receiving, lots/expiry, counts, recalls, controlled-item exceptions, stock movement from administration, employee activation, schedule, timecard correction, approvals, and payroll export. | Synthetic browser/API traces with unit/lot/actor/audit data and permission boundaries. |
| P1 | Schedule policy completion | Partially implemented; policy decisions open | Decide and encode clinic policy for timezone/DST, holidays/closures, provider absence, recurrence exceptions, overbooking, buffers, and resource capacity. Tighten the legacy clinician-without-assignment compatibility path before any real clinic. | Approved policy record plus API/UI conflict tests and populated calendar browser walkthrough. |
| P1 | Reporting, exports, audit and retention | Partial | Build or explicitly defer a consolidated report catalog; define source, freshness, filters, timezone, row permissions, export provenance, reconciliation owner, retention, and PHI handling. The existing `.ics` export remains read-only and is not external sync. | Reconciled synthetic report counts, permission tests, export review, retention decision, and audit-history verification. |
| P1 | Clinical and professional governance | Open human dependency | Define eligible clinical roles, minimum dataset, review/sign rules, AI-scribe accountability, correction policy, medication/lab applicability, and who may approve clinical or financial exceptions. | Signed internal clinical/professional decision record; source changes alone cannot satisfy this gate. |
| P1 | Privacy, security, legal, tax and operations | Open human/external dependency | Complete security/privacy review, jurisdiction and service applicability, tax treatment, incident/restore/deletion ownership, export controls, support ownership, and operational runbooks. | Human-approved records and controlled tabletop evidence; no compliance or production claim before approval. |
| P2 | External and personalized enhancements | Deferred/conditional | Do not add external calendar sync, advanced recurrence, personalized dashboards, or multi-clinic aggregates until an owner, source of truth, conflict/overbook policy, and aggregate metric contract are approved. | Explicit product decision followed by a bounded implementation brief and provider/metric evidence. |

## Evidence currently available

### Automated test evidence

- Patient-journey continuity: **9 runs / 147 assertions / 0 failures / 0
  errors / 0 skips**.
- Frontend focused schedule/operations tests: **13 tests passing**.
- Frontend TypeScript, Prettier, and production bundle: passing.
- Changed Ruby syntax and RuboCop: passing.
- Vault verification and harness verification: passing.
- Final phase selector: **34 runs / 286 assertions / 3 failures / 1 error**,
  all in the legacy `ClinicTrackingBoardTest` scope; this is not a green full
  regression result.

### Browser and runtime evidence

A current synthetic browser walkthrough reached the clinic through the
organization → clinic → location → team-account selector, loaded Patient Flow,
opened a selected-patient Schedule view, displayed a populated month/day
calendar, and showed a separate Tracking Board encounter. It did not create a
new appointment or check in a patient. The latest stale-projection source repair
has not yet been re-walked in the browser.

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

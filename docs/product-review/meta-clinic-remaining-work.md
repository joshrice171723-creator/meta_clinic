# Meta Clinic Remaining Work

**Assessment date:** 2026-09-17
**Checkout:** `main` at `ea9d720` (final closeout handoff; source baseline `33f74f2`).
**Source review:** [Meta Clinic Full Application Product Review](./meta-clinic-full-application-review.md)
**Data boundary:** Synthetic/local data only. No real-patient or production records were used.

## Closeout reconciliation — steps 0–1 — 2026-09-17

The closeout runbook was added at
[`meta-clinic-session-closeout-runbook.md`](./meta-clinic-session-closeout-runbook.md).
The application source baseline remains `33f74f2`; `e05ae15` contains the
runbook documentation only. The recorded current evidence is unchanged:
the bounded Rails selector is green at 162 runs / 1,955 assertions, the
frontend suite is recorded at 51 files / 383 tests, and desktop/tablet/phone
route smoke passed. The fresh mutation walkthrough is now recorded in the
step-3 reconciliation below; the broader role, device, negative/recovery, and
human/provider gates remain open.

Older counts (including 45/392, 105/1,354, 47/474, and 51/382) are retained as
historical, selector-scoped evidence. The weight-loss brief's statement that
no additional J0–J7 browser action remains is superseded for this closeout
because this report records a separate application-wide mutation walkthrough;
that walkthrough does not expand the weight-loss brief's specialty scope. The
56/100 weighted score is retained as historical and is not recalculated in this
closeout step.

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

## Closeout reconciliation — step 3 — 2026-09-17

The fresh synthetic browser journey was completed through the clinic front end
in Chrome after selecting **Weight Management Organization → Weight Loss
Clinic → Main location → team account**. No patient, appointment, encounter, or
payment record was created through a backend shortcut.

- Front desk enrollment selected **GLP-1 weight management** with recurring
  monthly terms and synthetic contact details.
- The explicitly labeled local payment simulation verified payment and created
  **Closeout Patient 917** (clinic reference `MEM-Q-822A928B`) plus the initial-
  contact work item.
- Patient Flow showed the full patient name and a selected-patient
  **Schedule first appointment** link. After booking, the Ready to schedule
  count dropped from 8 to 7 and the Scheduled column showed one scheduled
  visit for this patient; the underlying work item remained available as the
  scheduled follow-up.
- Schedule opened with the selected patient context intact, showed the month
  calendar and day capacity, and created one **Weight-loss initial visit** on
  September 28, 2026 at 09:00–09:30 UTC with Avery Example. The day count
  changed to one appointment and the booked slot disappeared from availability.
- Front desk day queue showed the appointment as **Scheduled**. The front-end
  check-in confirmation then reported that Closeout Patient 917 was checked in
  and the visit was in progress.
- Tracking Board was switched to September 28 through the app-date control and
  then visibly contained the patient only after check-in, in **Waiting room**,
  with a linked encounter. Before check-in, the scheduled patient was absent
  from the board for that date.

The final Tracking Board screenshot was captured in the browser session. One
presentation follow-up remains for the device/accessibility pass: the compact
visual row renders the synthetic patient as `917, C.` while the accessible row
label exposes the full patient name. This is not a workflow or identity
failure, but the visual patient-identity treatment should be reviewed before
human acceptance. The browser trace also confirmed the selected-patient
schedule context and no duplicate initial-contact card after booking.

## Closeout reconciliation — steps 4–7 — 2026-09-17

Step 4's paired negative/recovery selector passes **87 runs / 724 assertions /
0 failures / 0 errors / 0 skips** across appointment idempotency, stale writes,
visit recovery, Tracking Board ownership, invoice/payment retry,
administrative permissions and provider assignment. Step 7 repaired only stale
test assumptions: reschedule fixtures now use future, capacity-backed times,
and the workspace test matches the practice-scoped multiple-membership
migration. No runtime guard, authorization check or source-of-truth boundary
was weakened. The broader continuity/checkout/workspace selector now passes
**50 runs / 525 assertions / 0 failures / 0 errors / 0 skips**.

Step 5's retained-session browser smoke matrix passed on desktop, tablet and
phone for `/clinic`, `/clinic/schedule`, `/clinic/work`, `/clinic/billing`,
`/clinic/inventory`, `/clinic/workforce` and `/clinic/telehealth`. The initial
`127.0.0.1` harness attempt did not enable the development selector; rerunning
against the running stack's `localhost` loopback host passed. This is recorded
as a harness-host assumption. Full assistive-technology, contrast/zoom,
two-hour idle/session and modal/error-state acceptance remain open.

Step 6 has no new human decision authority in this sandbox. Timezone/DST,
closures, recurrence/overbook, provider absence, clinical roles and signing,
Stripe/MOTO custody, messaging/telehealth/pharmacy/laboratory providers, tax,
privacy, retention, support, deployment, pilot and release gates remain
explicitly deferred/open under the existing decisions and risk register, with
owners unassigned. No external transaction, provider connection or professional
approval was performed or inferred.

## Final handoff and closure record — 2026-09-17

The authorized closeout changes are committed on `main` and the final handoff
has verified that the local and remote SHA match. The working
tree's unrelated `.codex` configuration and attachment files remain preserved
outside the change set. No secrets, real patient data, real payment data,
provider credentials, external messages, or production records were included.

Highest truthful status: **source-complete for the bounded local clinic journey;
locally verified and browser-verified for the recorded synthetic paths**. This
does not mean human-approved, provider-accepted, pilot-ready, or release-ready.
The remaining gates are the documented assistive-technology/contrast/zoom and
two-hour session acceptance, complete role-level permitted/denied-action review,
and the unassigned clinical, provider, privacy, tax, retention, support,
deployment, pilot, and release decisions. Those require a named decision owner
or external evidence and are not silently converted into source work. The next
action is to assign those owners and run the separate prelaunch acceptance pass;
no additional source change is required to close this sandbox session.

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
| P0 | Fresh local entry and core paid-member journey | Browser-verified for one fresh synthetic journey; broader acceptance remains open | The front-end walkthrough created a paid GLP-1 membership, patient, initial-contact work item, first appointment, and checked-in encounter. Patient Flow, Schedule, Front desk, and Tracking Board transitions were observed with no backend-created patient substitute. Device/accessibility coverage and negative/recovery paths remain separate closeout steps. | Browser trace and final Tracking Board screenshot show payment verification, patient identity, Patient Flow projection, Schedule booking, and post-check-in arrival. |
| P0 | Regression baseline | Source-owned selector green; repository-wide baseline still separate | The consolidated clinic selector now passes at **162 runs / 1,955 assertions / 0 failures / 0 errors / 0 skips**, including Tracking Board, continuity, scheduling, registration, billing, communications, inventory, workforce, patient-portal booking, and owner aggregate boundaries. A repository-wide baseline is still not established. | Keep the named selector green and run any broader baseline as a separate, explicitly scoped effort. |
| P0 | Role and permission acceptance | Fresh role-specific route loads verified; action matrix still open | Fresh browser sessions now load permitted landing routes for billing, inventory, records, workforce, and setup, in addition to the clinic administrator/front-desk/clinician matrix. Existing API authorization tests cover independent permissions and tenant/site boundaries; a complete fresh-session denied-action walkthrough remains. | Role matrix with fresh-login screenshots/API traces and cross-tenant/site denial results. |
| P0 | Accessibility and device acceptance | Partial browser evidence; full WCAG-oriented acceptance still open | Desktop, tablet (1024×768), and phone route smoke pass. A phone Schedule spot check found no horizontal overflow and 38 focus moves; the visible controls use the correct hierarchy and current pages expose retry/status semantics. Screen-reader announcements, contrast/zoom review, and modal/error-state walkthroughs still require a dedicated acceptance pass. | WCAG 2.2-oriented test record covering loading, empty, stale, error, success, blocked, modal, calendar, and login states. |
| P1 | Patient registration and clinical record detail | Local API contracts verified; browser mutation walkthrough open | Walk patient search/duplicate warning, unknown DOB, registration save, encounter/intake, vitals, medication administration, labs/results, notes, amendments, and closure. Confirm patient/encounter/site identity stays visible. | Synthetic browser journey plus focused authorization, stale-save, correction, and persistence tests. |
| P1 | Billing and payment outcomes | Local payment/checkout contracts verified; browser mutation walkthrough open | Exercise one-time and recurring membership payment paths, delayed/unknown outcomes, refund/void, duplicate charge, cash-drawer reconciliation, invoice application, and payment exception recovery. | Synthetic browser/API evidence for each ledger transition; Stripe-controlled MOTO/provider behavior separately confirmed or marked unavailable. |
| P1 | Telehealth and communications | Local lifecycle tests present; browser/vendor proof open | Walk configuration, unavailable/simulated/live states, consent, device failure, disconnect/recovery, wrap-up, reminder approval, send/fail/acknowledge, opt-out, and cancellation follow-up. | Browser evidence for local states and provider evidence for actual delivery/session behavior; no automatic-send claim. |
| P1 | Inventory and workforce | Local API selector green; browser walkthrough open | Pharmacy receiving, lot/expiry, stock movement, workforce access, schedule, timecard correction, approvals, and payroll paths pass the consolidated selector. Walk the populated browser journeys and retain unit/lot/actor/audit evidence. | Synthetic browser/API traces with unit/lot/actor/audit data and permission boundaries. |
| P1 | Schedule policy completion | Partially implemented; policy decisions open | Decide and encode clinic policy for timezone/DST, holidays/closures, provider absence, recurrence exceptions, overbooking, buffers, and resource capacity. Tighten the legacy clinician-without-assignment compatibility path before any real clinic. | Approved policy record plus API/UI conflict tests and populated calendar browser walkthrough. |
| P1 | Reporting, exports, audit and retention | Partial | Build or explicitly defer a consolidated report catalog; define source, freshness, filters, timezone, row permissions, export provenance, reconciliation owner, retention, and PHI handling. The existing `.ics` export remains read-only and is not external sync. | Reconciled synthetic report counts, permission tests, export review, retention decision, and audit-history verification. |
| P1 | Clinical and professional governance | Open human dependency | Define eligible clinical roles, minimum dataset, review/sign rules, AI-scribe accountability, correction policy, medication/lab applicability, and who may approve clinical or financial exceptions. | Signed internal clinical/professional decision record; source changes alone cannot satisfy this gate. |
| P1 | Privacy, security, legal, tax and operations | Open human/external dependency | Complete security/privacy review, jurisdiction and service applicability, tax treatment, incident/restore/deletion ownership, export controls, support ownership, and operational runbooks. | Human-approved records and controlled tabletop evidence; no compliance or production claim before approval. |
| P2 | External and personalized enhancements | Bounded baseline implemented; conditional extensions deferred | The source now explicitly exposes the safe baseline: Meta Clinic remains the schedule source of truth, `.ics` is a read-only export, recurrence and overbook are `not_configured`, and owner command-center totals remain aggregate-only. Do not enable external sync, advanced recurrence/overbook, personalized dashboards, or broader multi-clinic reporting until an owner, source-of-truth/conflict policy, role-preference contract, and aggregate metric contract are approved. | Calendar policy contract test, owner aggregate-boundary test, and an explicit product decision followed by a bounded implementation brief and provider/metric evidence for each extension. |

## Evidence currently available

### P1 verification follow-through — 2026-09-17

The source-owned P1 integration selector covered registration, recovery,
billing, membership payment, communications, lab follow-up, scribe,
inventory, workforce, appointment-request, and owner aggregate paths. After
reconciling the pharmacy fixture with required inventory-bin and input-unit
contracts, it completed **162 runs / 1,955 assertions / 0 failures / 0 errors /
0 skips**. Manual inventory provenance remains distinct from FDA-import
provenance, and product unit metadata remains enforced. Browser mutation and
provider/live evidence remain separate gates.

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
horizontal overflow and accepted keyboard focus traversal. The fresh mutation
walkthrough above then created a membership through the front desk, verified
payment in the local simulator, scheduled the first appointment, checked the
patient in, and confirmed the post-arrival Tracking Board row. This is one
desktop browser journey; it is not evidence for the complete role/device,
accessibility, provider, or negative/recovery gates.

### External and approval evidence

No live money movement, Stripe reader/MOTO transaction, outbound message,
telehealth session, provider credentialing, clinical treatment, tax decision,
legal review, retention approval, pilot, or production deployment was
performed. Local simulators and configured/unavailable labels are not substitutes
for those gates.

## Safest completion sequence

1. Repair or classify the known impacted-test failures and establish a bounded
   green regression command.
2. Run the role/device/accessibility matrix against the completed journey and
   the major domain routes.
3. Resolve the schedule, clinical, financial, messaging, reporting, retention,
   and provider decisions with their responsible human owners.
4. Only then decide whether a pilot or release-readiness review is warranted.

The implementation tracker remains the work inventory; this file is the
current evidence-based gap report and should not be treated as a second mutable
roadmap.

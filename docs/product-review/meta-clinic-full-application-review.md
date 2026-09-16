# Meta Clinic Full Application Product Review

**Review date:** 2026-09-15

**Scope:** End-to-end product, workflow, information architecture, data-entry, UX, accessibility, persistence, failure-state, and architecture review of the Meta Clinic repository and locally running application.

**Data boundary:** Synthetic/local data only. No real-patient or production records were accessed.
**Review mode:** Read-only review. No source code, schema, configuration, or application behavior was changed for this review.

## Reconciliation — 2026-09-15, after calendar commit `13accea`

The original review below observed concurrent, unfinished calendar work. Its historical browser observations and test failures are not a fresh assessment of the completed commit. The founder requested this reconciliation and authorized starting with the scheduling patient-context defect. Canonical product decisions remain in [Decisions](../../APPlyVault/03%20Execution/Decisions.md#schedule-and-patient-identity-clarification--2026-09-15); changing work status remains in the [implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md), not a second backlog here.

| Finding | Reconciled disposition |
|---|---|
| Month/day calendar, clinician/room lanes, capacity/conflicts, open-slot booking | Implemented in `13accea`, using existing appointments, weekly capacity rules, location hours/exceptions, rooms and waitlist holds. Do not rebuild or add a second slot/appointment store. |
| Patient Flow handoff, patient-scoped drafts, authoritative calendar refresh | Implemented; follow-up below addresses redundant patient selection controls and identity presentation. |
| Scheduled versus arrived | Booking alone does not enter the Tracking Board. Check-in/encounter opens board work. This is not a new universal persisted status machine or independent arrival record. |
| Earlier pagination test failure | Historical: replaced by calendar tests. Final calendar verification is in the [implementation brief](../development/clinic-schedule-implementation.md#checkpoint). Earlier navigation failure is not assumed fixed. |
| Verification | Prior completed run: 98 related frontend tests passed; six new backend tests passed. Old backend/snapshot failures remain. Month/day/patient handoff and retained login were observed; fresh-login recovery, populated clinic booking and tablet acceptance remain separate gaps. |
| Current clinic configuration | Browser showed no clinicians; capacity was not configured. Configure intended resources through supported clinic setup before the populated walkthrough; do not fabricate availability. |
| Role-based shell, cross-domain audit timeline, workforce-to-capacity integration | Not delivered by this calendar change. Retain as separately scoped recommendations, not calendar regressions. |
| Broad data requirements | Treat as review candidates. Classify each as present, hidden, unmapped, unverified or actually missing before schema changes. Proposed fields are not universal FHIR-mandated form requirements. |

Accepted terminology is **Patient Flow → Schedule → Tracking Board**. Patient Flow covers paid-membership onboarding/initial contact and preparation for scheduling. Schedule contains bookings; Tracking Board contains arrived/active encounter work. Initial-contact completion remains independently recorded. Payment, encounter completion, signing and billing remain distinct, sometimes parallel processes; membership payment can precede the visit.

The next bounded increment is selected-patient clarity: show the stored name prominently, label the clinic reference separately, hide search when a patient is selected, and offer an explicit Change patient / Keep current patient path. Preserve appointment details, request identity and unknown-outcome guards. A short stored name must not be expanded into an invented identity; provide registration review instead.

Follow-up implementation: the booking form now uses one identity summary and an explicitly opened search, with a permission-gated registration link. Browser observation confirmed selection → Change patient → Keep current patient preserves the selected record and date/time, hides the redundant search again and keeps the session signed in. The inspected synthetic record actually stores a one-character display/legal name; this is an incomplete registration value, not calendar truncation. No identity or appointment record was changed during this check. Full booking remains blocked by missing intended clinician/capacity configuration.

## 1. Scope, evidence, and sources

### Authorized implementation follow-through — 2026-09-15

The founder subsequently authorized implementation of the whole reconciled review. The historical findings below are retained, not rewritten as current failures. The canonical PR-01–PR-10 delivery rows are in the implementation tracker. This follow-through consolidates the existing product instead of replacing its domain records or adding every proposed field as a mandatory question.

Implementation contracts:

- Entry recovery must distinguish a failed login from a successful login whose navigation stalled. Recovery must not repeat an accepted session mutation or invalidate another open session.
- Schedule has its own `/clinic/schedule` route. Legacy patient-bearing `/clinic` links remain compatible; plain `/clinic` remains the Tracking Board. Patient identity is loaded from the authorized backend, not inferred from a membership reference.
- Patient context is explicit and URL-derived. Unrelated destinations must not inherit a hidden selected patient. Clinic/site/account changes must not retain another context's identity.
- Report discovery points to existing billing, stock-movement and payroll sources with their permissions and freshness boundaries. Telehealth health checks are configuration evidence, not proof of live delivery. Missing cross-provider health contracts remain unknown rather than fabricated green indicators.
- Message history shows the recorded delivery attempts. Provider acceptance, delivery confirmation, failure and unknown outcome remain distinct. Cancellation does not itself authorize a new outbound message.
- Patient activity history reads existing tenant-bound audit metadata for registration plus separately permission-filtered appointments, notes, invoices and reminders. It excludes protected-value snapshots and request/session metadata, enforces patient and site visibility, and declares unavailable domains. The history is capped at 25 with an explicit older-history indicator; it is not a complete audit export.
- Existing domain correction mechanisms remain authoritative: append-only contact versions, clinical revisions/signatures, invoice/payment events and inventory movements. A universal mutable audit ledger is not introduced. A combined cross-domain export requires a permission/retention/export contract before implementation.

Standards mapping for this increment: [FHIR R4 4.0.1 Provenance, sections 6.3.1–6.3.2](https://hl7.org/fhir/R4/provenance.html) describes activity, target, agent and time and prefers existing resource provenance where available. Here, `Clinic::ModelVersion` supplies record identity, event, actor reference, changed-field names and occurrence time; the staff-only patient-detail projection exposes that metadata without snapshots. This is a product mapping within the repository's U.S. workflow context, not a FHIR endpoint, US Core conformance assertion, clinical approval or legal retention policy. Missing actors/times are displayed as not recorded, never invented as system actions.

Conditional recommendations retain their stated dependencies: external calendar sync needs an approved partner/use case; overbooking needs an explicit operating policy; personalized views follow settled role navigation; multi-clinic reports require authorized aggregate definitions. Live integrations, professional eligibility/signing policy, jurisdiction-specific clinical requirements and export/retention approval cannot be inferred from this development request. Verification results belong in the tracker after the integrated pass, not in the original review's evidence table.

#### Integrated local verification follow-through

- Browser-proved with independently created synthetic records: front-desk recurring enrollment → configured local payment simulator → paid onboarding patient → initial-contact work item → selected-patient month/day booking → persisted appointment → check-in → Tracking Board waiting room. Before arrival the board returned zero visits; after explicit check-in it returned one. Booking changed the day from 0 to 1 scheduled and 16 to 15 available half-hour slots. No real card, outbound message or clinical treatment was involved.
- The local clinic lacked a usable clinician/capacity configuration. An independently synthetic clinician profile and Monday 09:00–17:00 UTC capacity were configured through the UI; no account role or clinical privileges were granted. Unconfigured days correctly retain zero availability. The booking form now uses the server-returned clinician name instead of a profile ID.
- Existing sessions remained signed in through navigation and source reloads. Source hot reload can still reset transient page state; this evidence does not establish every role's fresh-login path or a two-hour elapsed session test.
- Patient context and appointment identity were checked in the browser. The Tracking Board was visually inspected at desktop and 833 CSS-pixel tablet width: navigation collapses and the dense board uses its own horizontal scroll, with no document-width overflow. This is not a full assistive-technology/device-matrix certification.
- The shared `ResourceState` contract covers loading, empty, stale, error, success and blocked states. `LoadState` remains compatible; provider readiness demonstrates retaining a labeled last-successful snapshot during refresh/failure with explicit retry.
- A denied mutation previously lost its denial audit during transaction rollback. The repair retains exactly one server-attributed denial and fails closed when replacement audit persistence fails; focused mutation, read and audit-storage tests cover it.
- One-time front-desk enrollment previously dead-ended. The local-only signed-event simulator is now exposed through a staff-authorized endpoint and explicit simulation control. It does not implement live one-time MOTO, redirect a shared staff workstation to consumer Checkout, or claim vendor-confirmed payment. Live one-time staff collection remains an integration dependency; tax applicability/configuration also remains a separate prelaunch decision.
- Browser retry also proved one-time enrollment reaches verified simulated payment and exposes Proceed to onboarding. The local simulator reuses the clinic's exact configured platform sandbox connection without replacing it or contacting Stripe; a focused 18-assertion test covers fulfillment, stale version, replay and unchanged connection attributes. The membership preview now reflects the chosen one-time versus recurring terms before saving.
- Old patient details whose independent synthetic provenance was unclear were excluded from further inspection and screenshots. No existing record was deleted or rewritten. Verification used new `example.invalid` fixtures instead.

Additional follow-through after the initial pass: the workflow guide's Patient Flow action now targets `/clinic/work` rather than Growth; the launch portal now presents a source-owned checklist with completion counts and blocking language; Tracking Board rows expose patient, visit type, stage and ownership together; and multiple patient search results are explicitly marked as possible duplicates for comparison before registration. These are source changes with focused frontend coverage, not proof of every role's browser journey.

Two bounded slices were completed on 2026-09-16. Account activation and recovery screens now expose the lifecycle in context—invitation or recovery link received, identity verification, account/password completion, and patient-record linkage—while still hiding lifecycle claims when a token is missing. The nurse encounter workspace now keeps encounter, intake, vitals, site, and room state visible beside the patient and encounter identifier. These additions make existing server-recorded state legible; they do not create a new patient from an activation link, infer clinical values, or claim that an encounter is signed or clinically complete. No new tests were run at the founder's request; browser acceptance for these two slices remains a follow-up evidence item.

Six status-surface corrections were completed on 2026-09-16. Recall and refill queues now summarize due, review, delivery-follow-up, and clinician-next-action states; the virtual waiting room labels paginated results honestly; billing collections distinguish visible-page counts from total records; inventory configuration messaging matches the persisted readiness state; workforce navigation and encounter summaries announce dynamic state accessibly; and activation labels describe next steps rather than completed lifecycle claims. These are compact UI clarifications over existing API records, not new ledgers, fabricated counts, or approval claims. They do not complete the underlying workflows; browser and role/device acceptance remain unresolved.

Focused verification is recorded in the canonical tracker. Broad clinical, provider, export/retention, release and jurisdictional acceptance remain separate; historical recommendations below must not be read as either fresh failures or newly granted authority.

The review combined repository mapping, route and component inspection, local runtime checks, a browser walkthrough, frontend verification, focused test execution, and U.S.-relevant external guidance. The repository had concurrent uncommitted scheduling changes during the review; those changes were preserved and are treated as user-owned, provisional work rather than as changes made by this review.

### Evidence legend

| Label | Meaning |
|---|---|
| **Browser verified** | Observed in the running local application through the browser. |
| **Source verified** | Supported by current repository routes, components, tests, or controllers. |
| **Runtime verified** | Local server or endpoint responded during this review. |
| **External guidance** | Supported by an authoritative linked source. |
| **Inference** | Reasoned from multiple observations but not directly demonstrated. |
| **Recommendation/opinion** | Product judgment requiring a decision. |
| **Unknown** | Evidence was unavailable or contradictory. |

The supplied reference website was a placeholder (`[REFERENCE WEBSITE URL]`), not a usable URL. No specific third-party site could therefore be reviewed. Relevant official sources reviewed were:

- [HL7 FHIR R4 Appointment](https://hl7.org/fhir/R4/appointment.html), [Schedule](https://hl7.org/fhir/R4/schedule.html), and [Slot](https://hl7.org/fhir/R4/slot.html) — scheduling and appointment/encounter boundaries.
- [HL7 US Core Implementation Guide](https://hl7.org/fhir/us/core/) — U.S. exchange-oriented clinical data profiles.
- [HHS HIPAA Security Rule overview](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) — security-rule context; not a compliance determination.
- [W3C Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) — accessibility reference.
- Repository reference map: `docs/development/us-healthcare-reference-map.md`, including U.S. Core, FDA, CDC, CMS/CLIA, RxNorm, UCUM, and FHIR references.

## 2. Executive summary

Meta Clinic is a broad clinic-operations product with unusually strong workflow coverage for an early application. It has the beginnings of a coherent operating system: a clinic context, role/capability projection, Patient Flow and Tracking Board, scheduling, encounters, charting, reminders, billing, memberships, inventory, workforce, telehealth, and scribe review. The strongest product decision is the separation between a scheduled administrative event and an arrived/active clinical visit.

The main risk is not lack of screens. It is that the product currently exposes many screens and states without one consistently obvious journey for each role. The left navigation is comprehensive but dense; several domains can be entered from multiple places; and the difference between an appointment, a work item, an encounter, a reminder, an invoice, and a signed clinical record needs to be made explicit in the interface.

The most important evidence gap is end-to-end browser proof. The local application loaded, but the development sign-in flow remained on `ENTERING…` after synthetic account selection. An already authenticated local schedule surface was observable in another browser tab, but navigating away returned to the same sign-in selector. Therefore this review can confirm substantial source behavior and one schedule surface, but cannot claim that the complete user journey works in the browser.

The most important engineering evidence is mixed:

- `127.0.0.1:3000` and `127.0.0.1:3001/up` responded successfully.
- The current web typecheck passed after concurrent scheduling files appeared in the worktree.
- The current web test run reported failures in `clinic-navigation.test.ts` and `schedule-pagination.test.tsx`, then stalled and was stopped. It is not a passing regression signal.
- The working tree contains unrelated/concurrent changes in scheduling, tracking board, WorkInbox, routes, and tests. They were not modified or staged by this review.

This is a product review, not a regulatory, clinical, security, certification, or production-readiness assessment.

## 3. Overall product opinion

The product has a credible foundation and a good central idea: staff should be able to move a patient or task through a visible operational workflow while the chart, billing, communications, inventory, and workforce records retain their own ownership and status. The source shows thoughtful boundaries such as server-projected capabilities, clinic/site context, retryable data loads, explicit unavailable states, scribe review before chart save, and billing review before payment application.

The next product phase should be consolidation, not another large feature family. The app needs a role-centered shell and a small number of canonical workflows. Each screen should answer three questions immediately:

1. What record or queue am I looking at?
2. What is the next safe action?
3. What state will change when I complete it?

My opinion is that Meta Clinic should keep its own domain data and business rules as the source of truth. A calendar rendering library may be useful, but an external scheduling API should not become a second source of truth until an actual exchange or partner requirement is approved. This is a product recommendation based on the current ownership model, not a claim that an integration is impossible.

## 4. What should remain unchanged

| Existing decision | Why it is valuable | Evidence |
|---|---|---|
| Clinic, location, and organization context are explicit | Prevents records being silently created in the wrong site and supports multi-site growth | Source verified: `Workspace.tsx`, `/api/clinic/context` |
| Capabilities are projected by the server | Keeps authorization distinct from browser-only presentation logic | Source verified: `Workspace.tsx`, `clinicNavigation.tsx` |
| Tracking Board is separate from scheduling | An appointment is not an arrival, queue position, or clinical encounter | Browser/source verified; also consistent with FHIR Appointment and Encounter boundaries |
| Explicit empty, retry, unavailable, and “not evidence of none” states | Reduces unsafe interpretation of an empty response as an empty clinic | Browser verified on Schedule; source verified across worklists |
| Patient search/select before booking | Reduces anonymous or duplicate appointment records | Browser verified on Schedule |
| Start/end times, duration shortcuts, site, room, clinician, format, type, and reason | These are necessary for an operational booking, not merely a calendar label | Browser verified on Schedule |
| Scribe review, approval, chart save, and signing are separate | Keeps generated or reviewed material from being represented as a signed note prematurely | Source verified: scribe workspace |
| Billing has reviewable invoices, event references, and payment states | Creates a traceable review step before money is applied | Source verified: BillingDashboard |
| Inventory includes lots, receiving, counts, controlled items, and supplier pricing | Preserves provenance and operational accountability | Source verified: InventoryApp |
| Synthetic/local boundary and truthful provider labels | Avoids implying that simulated email/SMS/video behavior is live | Source verified and repository contract |

## 5. What should change

1. **Repair and document the local entry path.** The current browser entry flow hangs at `ENTERING…`; a role cannot evaluate the product if it cannot reliably enter it.
2. **Make the shell role-centered.** Replace the long flat navigation with a role-based landing page plus grouped domains. Preserve direct deep links, but reduce the number of competing first actions.
3. **Define canonical record transitions.** Show the relationship among prospect, patient, appointment, work item, encounter, note, invoice, payment, reminder, and subscription.
4. **Make the next action explicit.** Every empty or detail screen should have one primary action, a clear owner, and a completion message.
5. **Unify status vocabulary.** Map statuses across appointment, Patient Flow, encounter, invoice, reminder, scribe review, telehealth, and inventory without silently conflating them.
6. **Finish browser proof of the complete vertical journeys.** Source coverage is broad, but the current browser path and test failures prevent confidence in full behavior.
7. **Expose field provenance and ownership.** A field should state whether it is entered by patient, front desk, clinician, billing, inventory, or administrator, and whether it is editable after a downstream event.
8. **Separate configured, unavailable, simulated, and live integrations.** Video, text messaging, email, payments, and external clinical exchange need consistent status language.
9. **Add a cross-workflow audit timeline.** Users need to see what changed, when, by whom, and what downstream record was created.
10. **Treat responsive and accessibility verification as acceptance evidence.** The source contains good accessibility signals, but a full keyboard, zoom, mobile, and error-state walkthrough was not possible in this run.

## 6. Feature-by-feature review

The table is intentionally specific. “Source verified” means the feature is represented in the current code; it does not mean the full browser journey or persistence has been proven.

| Area / route or component | What it appears to do and who uses it | Keep | Change, confusion, or incompleteness | Missing fields/controls and ownership | Edge cases | Verification / evidence |
|---|---|---|---|---|---|---|
| Login and local account entry: `/login`, development selector | Selects a destination and synthetic organization, clinic, location, account, then enters a role-specific surface. Used by all local roles. | Keep explicit destination and context selection in local development. | Browser flow stayed on `ENTERING…`; no clear error, timeout, or recovery action. This is the primary review blocker. | Required: destination, organization, clinic, location, account. Optional: remembered safe context. Owner: developer/admin in local mode. | Missing/invalid context, expired session, duplicate session, backend unavailable, slow response. | **Browser verified** selector and stuck state; **runtime verified** app/API availability; **Unknown** root cause. |
| Registration, activation, recovery: patient portal, membership account, owner/workforce activation | Supports account activation, password recovery, and role-specific onboarding. Used by patients, owners, and employees. | Keep separate activation paths and avoid creating a patient merely from an unverified browser return. | Make the lifecycle visible: invited → identity verified → account active → eligible record linked. | Required: email/phone identifier, verification method, password/passkey, consent/terms where applicable. Optional: preferred contact. Owner: account holder; review: staff for linkage exceptions. | Reused email, expired token, wrong person, abandoned activation, account linked to wrong patient. | **Source verified** route and components; **Browser unverified** due entry blocker. |
| Launch/onboarding: `/paperwork`, `/training`, `/inquiries` | Provides startup paperwork, training/materials, and inquiry intake. Used by owners/admins and prospective clinics. | Keep launch work distinct from daily clinic operations. | Add a launch checklist with completion owner and blocking dependency; current route breadth may feel like separate products. | Required: organization, contact, item type/status. Optional: due date, attachment/reference, reviewer. Owner: launch coordinator; approver: owner/admin. | Incomplete paperwork, conflicting versions, no reviewer, external response unavailable. | **Source verified** in `App.tsx`; browser unverified. |
| Dashboard/home and navigation: `/clinic`, `Workspace`, `clinicNavigation` | Provides clinic context, Tracking Board and Schedule entry, and a broad operations shell. Used by all clinic staff. | Keep context, retry states, and role/capability projection. | Group navigation by job: Today, Patients, Care, Money, Inventory, People, Setup. Put “today’s work” ahead of configuration. | Required: active site/context, role, actionable counts. Optional: personalized shortcuts. Owner: system for counts; user for preferences. | Role has no accessible destination, stale count, location changes while editing, missing permission. | **Browser verified** schedule shell; **Source verified** navigation/context; **Unverified** full landing behavior. |
| Work inbox: `/clinic/work`, `WorkInbox` | Organizes work as New, In progress/Active, Ready to schedule, and Scheduled; supports All open/Mine/Overdue and work-type filters. Used by front desk, nurses, and clinicians. | Keep ownership and overdue concepts; keep Scheduled distinct from a completed visit. | Make the source of each card and next action obvious. Avoid making this a second patient search or second schedule. | Required: work type, source record, owner, status, created/updated time. Optional: due time, priority, handoff note. Owner: queue creator/assignee; review: role owner. | Duplicate work item, reassignment, closed record reopened, scheduled appointment missing, overdue after clinic closure. | **Source verified**; test reported navigation failure; browser unverified. |
| Tracking Board: `TrackingBoardPage` | Shows current visits by stage with filters, provider assignment, intake ownership, elapsed/waiting/duration, and board controls. Used by front desk, nurses, clinicians. | Keep Tracking Board as an arrival/active-encounter board, not a generic calendar. Keep visible ownership and stale/unknown states. | Add a compact visit header with appointment, encounter, patient context, current owner, and next action. Explain when a scheduled item enters the board. | Required: appointment/encounter link, arrival/check-in time, stage, owner, location. Optional: reason for delay, acuity/priority, communication preference. Owner: front desk for arrival; clinical staff for clinical stages; manager for override. | No-show, walk-in, late arrival, duplicate check-in, patient leaves, encounter opened without appointment, provider reassignment. | **Source verified** labels and controls; **Browser unverified** due login blocker; related tests show navigation failure. |
| Patients and discovery: `/clinic/patients`, `/clinic/patients/:id`, chart selection | Searches, selects, and opens patient records; related to onboarding and charting. Used by front desk, clinicians, nurses, billing. | Keep one canonical patient record and patient context propagation. | Search should distinguish exact match, possible duplicate, inactive, and no result. Add “why this result” and safe merge/escalation path. | Required: legal name, DOB, identity/duplicate matching fields, contact preference, status, source. Optional: pronouns, preferred name, language, emergency contact, communication restrictions. Owner: patient/front desk; duplicate review: authorized admin. | Duplicate patient, changed name, unknown DOB, minor/guardian, deceased/inactive, communication restriction, wrong chart selected. | **Source verified** route/components; **Browser unverified**. FHIR Patient is relevant external guidance. |
| Front desk and appointment intake: `/clinic/front-desk`, schedule form | Searches patient, chooses date/site, schedules, reschedules, and cancels. Used by front desk. | Keep patient-first booking and site/timezone visibility. | Cancellation currently communicates that reminders are cancelled but no cancellation message is sent; make this an explicit decision with message preview/status. | Required: patient, site, start/end or duration, visit format, visit type, clinician/resource. Optional: room, reason, notes, referral/source, accessibility needs, reminder preference. Owner: front desk; review: clinician for special visit types. | Double booking, overlap, time-zone/DST change, cancelled then rebooked, waitlist offer accepted, provider unavailable. | **Browser verified** schedule form and unavailable video warning; **Source verified** FrontDesk. FHIR Appointment/Schedule/Slot apply. |
| Schedule and availability: `/clinic` alias and scheduling controllers/UI | Shows scheduled visits and offers booking fields; current worktree also contains concurrent calendar/scheduling changes. Used by front desk, clinicians, managers. | Keep in-house appointment data and explicit scheduled-vs-arrived wording. Use a UI calendar library only as a renderer if desired. | Provide month aggregation, day time-grid, clinician/room/resource lanes, open capacity, conflict explanation, and a single authoritative page/route. Do not create a second source of truth with an external calendar API without an approved integration need. | Required: schedule owner/resource, planning horizon, slot start/end, availability status, overbook policy, appointment link. Optional: recurring rule, buffer, reason for block, external ID. Owner: manager/admin for templates; front desk for bookings; clinician for availability. | DST, holidays, closures, overbooking, provider absence, concurrent booking, stale page, recurrence exception, location timezone. | **Browser verified** empty Schedule and booking form; **Source verified** routes/controllers; **Test failure** schedule pagination. FHIR Schedule/Slot/Appointment apply. |
| Encounters, clinical history, charting, notes, plans | Provides clinical record workspaces, notes, history, plans, documents, follow-ups, and selection of chart context. Used by clinicians and nurses. | Keep signed-note and encounter concepts distinct from scheduling; preserve chart-save boundaries. | Put encounter status, author, service date, location, and signing state at the top. Make draft vs signed vs amended immutable-history behavior visible. | Required: encounter link, subject, service date/time, type, participant/author, status, reason. Optional: diagnoses, observations, procedures, care plan, attachments, provenance. Owner: clinician/nurse by scope; signer: clinician/authorized professional. | Wrong encounter, late entry, amended note, unsigned note at checkout, copied-forward content, failed save. | **Source verified** feature families/routes; **Browser unverified**. FHIR Encounter, Condition, Observation, Procedure, CarePlan, DocumentReference, Provenance apply. |
| Intake, vitals, medication administration, labs | Captures structured clinical observations, medication administrations, and lab/review worklists. Used by nurses, clinicians, and lab reviewers. | Keep structured data rather than burying all information in free text. | Show units, normal/abnormal interpretation, reference range provenance, collection/result time, and who verified it. | Required: subject, observation type/code, value and unit or coded result, effective time, performer, status. Medication administration: medication, dose, route, time, performer, lot when applicable. Lab: order, specimen/collection, result, verification. Owner: collecting staff; review: clinician/lab-authorized role. | Wrong unit, impossible value, corrected result, specimen rejected, duplicate result, missing reference range, medication refusal. | **Source verified** components and reference map; **Browser unverified**. UCUM, FDA, RxNorm, CLIA-relevant references apply. |
| Recalls, care gaps, refills, follow-ups | Creates and tracks clinical or operational tasks related to preventive care, refill requests, and follow-up. Used by nurses, clinicians, front desk. | Keep queue/worklist approach and explicit overdue handling. | Distinguish clinical recommendation from administrative task; show due date, protocol, and required reviewer. | Required: patient, request/gap type, source, due date, status, owner. Optional: protocol, reason, outcome, next due date. Owner: initiating role; reviewer/approver: clinician where clinical judgment is involved. | Duplicate refill, expired order, no response, patient declines, gap resolved externally, due date changed. | **Source verified** routes/components; browser unverified. |
| Reminders and messages: `/clinic/reminders`, `/clinic/messages` | Tracks upcoming appointments, attention items, message history, and staff follow-ups; supports custom reminder text and provider state. Used by front desk and staff. | Keep verified-contact warning, message-length limit, retry state, and truthful sandbox “no real text was sent” label. | Add a message lifecycle: draft → approved → queued → sent/failed → acknowledged. Show whether a cancellation message was or was not sent. | Required: recipient, verified channel, purpose/template, due/send time, status. Optional: language, opt-out, escalation. Owner: staff; approval: clinic policy owner for templates. | Unverified number, opt-out, provider timeout, duplicate send, wrong patient, diagnosis in message, quiet hours. | **Source verified** Reminders; browser unverified. HHS/WCAG implications for privacy and accessible messaging. |
| Telehealth booking, queue, visit, wrap-up | Supports video visit filters, consent, device check, waiting room, call controls, recovery, wrap-up, and settings. Used by patient, clinician, staff. | Keep consent/device/recovery/wrap-up separation and the explicit “video visits unavailable until admin config” state. | Make configured vs simulated vs live vendor state consistent. Show appointment, encounter, consent, and recording/scribe state together. | Required: modality, visit link/session, patient/provider, consent status/time, device result, start/end, outcome. Optional: interpreter, accessibility, connection notes, recording choice. Owner: patient for device/consent; clinician for outcome; admin for configuration. | No camera/mic, poor connection, consent withdrawn, provider absent, session disconnect, no-show, recovery to phone/in-person. | **Source verified** telehealth components; browser not reached. Vendor/live readiness unknown. |
| Scribe review and chart save: `/clinic/scribe` | Provides transcript/source spans, reviewer context, warnings/blockers, draft save, approval, and chart save. Used by clinicians/reviewers. | Keep evidence grounding, blockers, approval separate from signing, and no-source blocking. | Explain what the AI generated, what source supports it, what remains unverified, and exactly what save-to-chart changes. | Required: source/session, patient/encounter, reviewer, draft status, approval status, chart-save status, signature status. Optional: excluded section reason, correction note, model/version metadata. Owner: clinician/reviewer; signer: authorized clinician. | Wrong patient, stale transcript, hallucinated detail, partial save, conflicting reviewer, edited approved draft, recording unavailable. | **Source verified** scribe workspace; browser unverified. Clinical/professional acceptance is unknown. |
| Billing, invoices, payments, refunds: `/clinic/billing`, billing patients/services | Shows financial summary, invoice history, visits awaiting checkout, ledger, payment review, and application of payment. Used by billing/front desk/admin. | Keep event reference, invoice status, review before apply, and explicit no-invoice/no-payment states. | Tie every invoice to service, patient/account, payer/payment method, and refund/void history. Put “what happens next” after review. | Required: billable service, patient/account, service date, amount, status, payment/refund reference, created/updated actor. Optional: payer, authorization, adjustments, tax/discount, collection notes. Owner: billing; approval: manager for refund/adjustment. | Duplicate charge, partial payment, refund after encounter correction, failed gateway, cash drawer mismatch, chargeback, subscription overlap. | **Source verified** BillingDashboard/routes; browser unverified. Payment-provider readiness unknown. |
| Memberships and growth: `/memberships`, `/memberships/:slug`, `/clinic/subscriptions`, `/clinic/growth` | Supports public membership discovery/storefront, account activation, enrollment, subscriptions, patient preview, prospects, and growth work. Used by prospective patients, patients, front desk, owner/admin. | Keep account-first enrollment and do not create the definitive patient record from an unverified browser return. | Make prospect → account → verified payment → patient/clinic linkage visible. Avoid making membership status look identical to clinical eligibility or subscription payment status. | Required: membership plan/version, price, effective date, account, payment status, consent/terms, eligibility/result. Optional: household/dependent relation, referral source, cancellation reason, pause dates. Owner: account holder/prospect for input; staff/admin for exception review. | Payment succeeds but webhook delayed, abandoned checkout, duplicate account, plan version changes, refund, cancellation, dependent mismatch. | **Source verified** membership routes/components; public API runtime 200; browser unverified. Stripe integration/live payment status unknown. |
| Inventory, suppliers, receiving, counts, controlled items: `/clinic/inventory/*` | Manages catalog, scanning, supplier pricing, locations, replenishment, purchase orders/cart, receiving, lots, recalls, count sessions, and controlled items. Used by inventory staff and administrators. | Keep lot/provenance, count, receiving, and controlled-item separation. | Connect administered medication/stock consumption to inventory movement; expose unit conversion and location clearly. | Required: item identity/code, unit, location, quantity, lot/expiry where applicable, movement reason, actor. Optional: supplier, cost, reorder threshold, temperature record, witness. Owner: inventory staff; reviewer: manager/controlled-substance authority. | Negative stock, duplicate scan, recalled lot, expired stock, partial receipt, count variance, wrong unit, controlled discrepancy. | **Source verified** InventoryApp and reference map; browser unverified. FDA/CDC/CLIA relevance depends on item/workflow. |
| Workforce: `/clinic/workforce/*`, kiosk, employee/admin/schedules/payroll | Covers employees, activation, employment, hours, timecards, requests, badges, kiosk, schedule builder, payroll export, onboarding, and settings. Used by employees, managers, payroll/admin. | Keep separate employee identity, employment, timecard, schedule, and payroll concepts. | Show approval state and source of truth for hours; make edits after payroll export auditable and restricted. | Required: employee, employment status, role, location, scheduled shift, clock event, approval status. Optional: credentials/expiry, break, leave reason, pay code. Owner: employee for request/clock; manager for approval; payroll admin for export. | Missed punch, overnight shift, overlapping schedule, terminated employee, badge lost, late correction, export duplicate. | **Source verified** WorkforceApp/routes; browser unverified. |
| Clinic setup, facilities, visit types, clinicians, settings | Configures sites, rooms, facilities, visit types, clinicians, telehealth, roles, and clinic settings. Used by administrators/managers. | Keep setup separate from daily work and enforce capability checks. | Use progressive disclosure and dependency warnings: a visit type cannot be booked until its duration/resource/modality rules are complete. | Required: owner/site, active state, timezone, resource/room, visit type, duration, modality, permissions. Optional: buffer, capacity, instructions, external mapping. Owner: admin; approval: owner/clinical lead for clinical configuration. | Deactivating an in-use resource, site removal, timezone change, incomplete setup, permission drift. | **Source verified** route/component families; browser unverified. |
| Reports, metrics, exports, audit history | Route/component coverage exists through operations, billing, workforce, and domain worklists, but a single cross-domain reporting and audit experience was not established by this review. Used by managers, owners, billing, operations. | Keep domain-specific ledgers and export provenance. | Add a report catalog with source, date range, timezone, filters, freshness, row-level permissions, and export status. | Required: report definition, source, period, generated time, actor, filters, status. Optional: saved view, schedule, file format, reconciliation result. Owner: manager/admin; review: domain owner. | Partial export, stale data, large report, timezone boundary, PHI in export, permission change after creation. | **Source partially verified** through route families; **Unknown** consolidated report behavior. |

## 7. End-to-end workflow review

### 7.1 Acquisition and membership to patient

The source suggests a reasonable account-first acquisition pattern: public membership discovery/storefront, account activation, payment, and subsequent patient/clinic linkage. The product should show this as a progress trail rather than leaving users to infer what a successful browser return means.

Recommended canonical journey:

`Prospect → plan selected → account verified → payment confirmed by provider event → membership active → patient linkage/creation → previsit tasks → appointment request or booking`

The failure states that must be explicit are payment returned but not confirmed, account exists but is not linked, plan changed during checkout, and duplicate account detected. **Source verified** for route families; payment/event timing and browser proof are **unknown**.

### 7.2 Patient Flow to Schedule to Tracking Board

The strongest current concept is the distinction between a booking and an active visit. The interface should preserve that relationship:

`Verified membership payment → Patient Flow initial contact → appointment booked in Schedule → arrival/check-in or encounter start → Tracking Board → encounter work`

Note signing, billing and follow-up retain their own statuses and prerequisites; this sequence does not force them into a single linear lifecycle.

FHIR R4 models Appointment as an administrative booking that may result in an Encounter; its status vocabulary includes booked, arrived, checked-in, fulfilled, cancelled, no-show, and waitlist. Meta Clinic should map its product statuses to an internal canonical vocabulary and keep the original source status for integrations. See [FHIR Appointment](https://hl7.org/fhir/R4/appointment.html).

The current source supports pieces of this journey. The browser showed the Schedule form and empty-state language, but the review could not walk from booking to check-in because login re-entry stalled. The scheduling/navigation tests also failed during the current run.

### 7.3 Schedule and availability

FHIR Schedule represents availability for an actor/resource and Slot represents a time block that may be free or busy. The model allows busy-unavailable, tentative, overbooked, and even busy time without an appointment. See [FHIR Schedule](https://hl7.org/fhir/R4/schedule.html) and [FHIR Slot](https://hl7.org/fhir/R4/slot.html).

Product recommendation:

- Retain the implemented in-house calendar projection and existing conflict rules on appointment, clinician, room, site and status data; finish populated-browser verification rather than rebuilding them.
- Use a calendar component for month/day/time-grid rendering if helpful.
- Reuse existing weekly capacity rules and location hours/exceptions. Only add advanced recurrence or other policy after identifying a concrete gap in those records.
- Avoid an external calendar API as the source of truth until a specific integration partner, sync direction, conflict owner, and failure policy exist.

### 7.4 Encounter, chart, billing, and after-visit

The product has the right conceptual handoffs, but they need a visible completion chain. A completed encounter should not silently imply a signed note, billable service, payment, or patient instructions. Each should show its own state and owner:

`Encounter complete → note draft/signed → service billable → invoice issued → payment pending/settled → instructions released → follow-up due`

This is an **inference/recommendation** from the source’s separate components, not a browser-verified end-to-end result.

### 7.5 Telehealth

Telehealth includes the right safety checkpoints: consent, device check, waiting room, recovery, and wrap-up. The product should make the modality fallback policy explicit and avoid presenting a configured-but-unavailable vendor as a working visit. The queue’s “appointments in clinic timezone” helper is a good pattern to retain.

### 7.6 Workforce and operations

Workforce has extensive coverage, but it is a parallel product surface. The key integration is resource availability: an approved employee schedule, clinician status, room availability, and clinic closure should affect scheduling without copying values manually. Payroll export should remain a controlled boundary and should not be inferred from clinical activity.

### 7.7 AI-assisted scribe

The scribe flow is appropriately conservative in source: source spans, warnings, blockers, approval, chart save, and signing are distinct. The primary missing product decision is who is accountable for review and which clinical records may be generated or suggested. No clinical or professional acceptance should be inferred from the existence of the UI.

## 8. Workflow-planning overlay

This section applies the Meta Clinic workflow-planning method to the findings above. It does not replace the canonical dependency matrix. The authoritative matrix remains [`docs/development/meta-clinic-build-and-acceptance.md`](../development/meta-clinic-build-and-acceptance.md), and changing work remains owned by the [Meta Clinic Implementation Tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md). The rows below reference those existing matrix IDs rather than copying or revising them.

### Scope classification

| Classification | Included in this review/planning overlay |
|---|---|
| Accepted product direction | Shared clinic operating system; cash-pay core; scheduled, walk-in, and telehealth entry; patient/encounter distinction; server-owned permissions; vendor-independent local preparation; synthetic-only evidence boundary. |
| Proposed change | Role-centered shell; canonical status/lineage map; month/day/resource schedule; visible ownership/provenance; cross-domain audit timeline; browser acceptance pack. |
| Deferred | External calendar synchronization, advanced recurring capacity, multi-clinic reporting, live-provider readiness, broad specialty-specific protocols. |
| Unresolved | First clinic operating model, launch roles, jurisdiction/service applicability, integration providers, minimum clinical dataset, correction policy, and who may approve/sign/refund/export. |

### Reference journey and concurrent work

The reference journey for the next planning slice should be a synthetic cash-pay ambulatory visit that may begin from a membership/account, a staff-created patient, a scheduled appointment, a walk-in, or telehealth. The journey ends only when the visit’s independently owned work is visible, not when one screen says “complete.”

| Stage | Actor and owning record | Entry condition | Successful transition/evidence | Recovery and parallel work |
|---|---|---|---|---|
| Acquire/account | Prospect or account holder; prospect/account/membership records | Public offer or staff-assisted interest | Verified account and selected terms; payment is confirmed by server/provider evidence before conversion | Save interest, resolve duplicate, recover abandoned/pending payment; staff may review unrelated prospects while payment reconciles. Matrix: EN-03–EN-06. |
| Patient identity | Patient/front desk; patient record | Account linkage or staff registration | One selected patient with duplicate outcome recorded | Preserve draft and both candidates on ambiguity; no name-only merge. Matrix: EN-04. |
| Intake/preparation | Patient/front desk/nurse; intake revision and appointment | Patient context and applicable form/version | Required action-specific answers resolved or explicitly unknown/declined; draft/submission state visible | Save incomplete draft; scheduling or unrelated work may continue unless a specific action requires the missing answer. Matrix: CV-01, CV-02, CV-10. |
| Schedule or walk-in | Front desk; appointment, schedule/slot, arrival record | Patient and configured service/resource | Booking has linked patient/site/resource/time, or walk-in has recorded arrival without implying rooming | Recheck conflicts atomically; offer alternate time, callback, waitlist, or waiting queue. Matrix: CF-01, SC-01, SC-02, SC-03, SC-04. |
| Arrival and handoff | Front desk/nursing/clinician; arrival, encounter, handoff/task records | Appointment arrival or accepted walk-in | Check-in/arrival and handoff are separately recorded; receiving owner accepts | Keep prior coverage until transfer acceptance; room/provider absence remains visible. Matrix: CV-03, CV-04, OP-05. |
| Encounter and documentation | Nurse/clinician; encounter, observation, note, plan, order | Valid patient/encounter context | Encounter status, authored note, reviewed/signature state, and outstanding work are individually visible | Manual notes remain available if scribe fails; corrected data preserves versions. Matrix: CV-05–CV-10, RX-01–RX-03, LB-01–LB-06. |
| Fulfillment and inventory | Inventory/prescription/lab teams; request, stock movement, lot, result, fulfillment records | Approved/ready local work | Each local, transmitted, accepted, received, administered, and fulfilled state is distinct | Prepare locally when vendor disconnected; reconcile unknown submission; do not double-consume stock. Matrix: RX-03, LB-02–LB-06, IN-01–IN-03, OP-06–OP-08. |
| Checkout and follow-up | Billing/follow-up team; invoice/payment/refund/task/message | Billable service or follow-up rule | Invoice/payment/refund and follow-up completion have independent evidence and owners | Payment failure, message failure, unassigned task, and encounter closure leave visible open work. Matrix: OP-01–OP-04, OP-10, OP-12. |

Independent work should remain available while a dependency is unresolved. For example, a pending payment may block activation but not saved account recovery; a missing vendor connection may block transmission but not local preparation; an unsigned note may block finalization but not unrelated scheduling; and an open follow-up task should survive encounter closure. This is a direct application of the existing matrix’s separation of “what is blocked” from “what remains available.”

### Planning field/action contract

For each future implementation slice, use this field contract before adding a form question:

| Question to answer | Required planning detail |
|---|---|
| What is the user trying to do? | Name the action, not only the screen: book, check in, accept handoff, sign, transmit, reconcile, refund, or close. |
| Which record owns the value? | Identify the patient, account, appointment, slot/schedule, encounter, task, note, order, invoice, payment, message, or inventory movement. |
| Where does the value come from? | Mark entered, inherited from a linked record, calculated, or returned by a vendor. Never make a calculated or vendor value look user-entered. |
| What control is appropriate? | Use searchable linked references for patients/catalogs; bounded selects for finite statuses; typed dates/times/quantities; free text only for explanations. |
| When is it required? | Tie requiredness to the action and applicable policy, not to the existence of a future integration or a FHIR profile alone. |
| Who may write/review? | Identify authorized writer, reviewer, approver, signer, and any team/coverage path. Assignment must not grant privileges. |
| What can be drafted? | Specify draft fields, save behavior, version, stale-data check, and recovery message. |
| What proves completion? | Name the durable event/reference: saved revision, accepted handoff, confirmed appointment, signed note, provider response, reconciled payment, or counted stock. |

### Matrix coverage and gaps

| Canonical matrix family | Review coverage | Planning gap to resolve |
|---|---|---|
| CF-01–CF-04 configuration | Setup dependencies, stale presets, historical work, authority tiers, and unsupported transitions are addressed | The product needs a browser-visible setup impact preview and explicit request/handoff route; do not add a global setup hold. |
| EN-01–EN-09 enrollment/membership | Account verification, age/DOB, duplicates, payment states, self-scheduling, and renewal states are addressed | Confirm the first target clinic’s membership rules and whether staff-assisted booking has separate policy from online self-service. |
| SC-01–SC-04 scheduling/resources | Conflict, cancellation/no-show, walk-in waiting, and resource availability are addressed | Decide resource model, overbook policy, recurrence, exceptions, and canonical schedule route. |
| CV-01–CV-10 intake/visit/documentation | Drafts, corrections, identity, handoff, consent, telehealth, scribe, signing, and revision use are addressed | Establish exact action-specific prerequisites and professional review boundaries for the first service. |
| RX/LB/IN families | Prescription, lab, fulfillment, stock, lot, result, and vendor-unknown states are addressed | Select applicable services and vendor mappings; do not invent medication, lab, dose, or timing requirements. |
| OP-01–OP-13 operations | Billing, follow-up, ownership, vendor readiness, stale saves, dependency cycles, encounter closure, and coverage evidence are addressed | Define reporting, export, audit, and reconciliation ownership and retention behavior. |

The matrix is broad but is not proof that every specialty, jurisdiction, or vendor workflow is covered. The next verification should select one bounded vertical slice and prove both sides of every dependency: the exact dependent action is blocked, while an independent permitted action still succeeds.

## 9. Navigation and information architecture

### Current strengths

- The clinic shell has a clear context area and a recognizable operations frame.
- The source centralizes route normalization and capability checks in `clinicNavigation.tsx`.
- Direct domains are discoverable by source: Work inbox, Capacity and waitlist, Recalls and care gaps, Front desk, Tracking Board, Patients, Schedule, Telehealth, Operations, Clinic setup, Inventory, Workforce, Billing, Subscriptions, Growth, Reminders, Messages, Scribe, and Settings.

### Current risks

- The flat list is too large for a first-time staff member.
- Work inbox, Front desk, Tracking Board, Schedule, Patients, Reminders, and Messages can all feel like places to “find the patient,” creating competing entry points.
- Setup, Operations, Billing, Subscriptions, Growth, Inventory, and Workforce are all top-level, even though most roles need only a subset.
- `/clinic/schedule` is normalized to `/clinic`, which is convenient but can make deep links, browser history, and analytics ambiguous.

### Recommended information architecture

| Primary group | Canonical entry | Contents |
|---|---|---|
| Today | Role-specific home | My work, arrivals, overdue items, open tasks, urgent exceptions |
| Patients | Patient search | Patients, requests, recalls, refills, patient timeline |
| Care | Tracking Board / encounter | Active visits, encounters, notes, vitals, labs, care plans, scribe; pre-scheduling Patient Flow remains in Work inbox |
| Schedule | Schedule | Calendar, availability, waitlist, appointment requests |
| Money | Billing | Invoices, payments, refunds, subscriptions |
| Operations | Operations | Inventory, facilities, reminders, messages, reports |
| People | Workforce | Employees, schedules, timecards, requests |
| Setup | Clinic setup/settings | Sites, rooms, visit types, clinicians, telehealth, roles |

Keep direct links and permissions, but give each role a default landing page and a breadcrumb that preserves patient, encounter, site, and date context.

## 10. Data and input-field audit

The current application should prefer linked records and coded values over repeated free text. Required fields below mean required to create or advance the specific record, not necessarily required on the first contact.

| Record | Required at creation | Recommended optional fields | Validation | Enter/review/edit ownership |
|---|---|---|---|---|
| Patient | Name, date of birth or documented unknown, identity-match data, patient status, contact route or documented none | Preferred name, pronouns, language, accessibility needs, emergency contact, communication restrictions, guardian/dependent relation | Duplicate warning, date validity, contact verification, minor/guardian logic | Patient/front desk enters; authorized staff resolve duplicates; edits are audited |
| Appointment | Patient/account link, site/timezone, start/end or duration, visit type, modality, resource/clinician, status | Room, reason, referral, instructions, reminder preference, recurrence/exception | End after start, duration policy, conflict/overbook rule, DST, inactive resource | Front desk books/edits; manager configures availability; cancellation/reschedule is audited |
| Encounter | Patient, appointment or walk-in reason, service time, type, location/modality, participant, status | Diagnoses, observations, procedures, care plan, attachments, provenance | No wrong-patient context, status transitions, late/amended note handling | Nurse/clinician enters; clinician signs; corrections preserve history |
| Observation/vital/lab | Subject, coded test/observation, value plus UCUM unit or coded result, effective time, performer, status | Reference range, interpretation, specimen details, device, method | Unit/value range, duplicate result, correction/version, collection/result timestamps | Collecting staff enters; authorized reviewer verifies |
| Medication administration | Patient, medication code, dose, route, time, performer, status | Lot, expiry, site, witness, refusal reason, source order | Dose/route compatibility, lot availability, duplicate administration, controlled-item witness | Nurse/authorized staff enters; clinician reviews when required |
| Invoice/payment | Patient/account, service/event link, amount, currency, status, provider reference | Payer, adjustment, tax, refund reason, cash drawer, reconciliation note | Idempotency, amount bounds, duplicate reference, refund limit | Billing enters/reviews; manager approves adjustments/refunds |
| Subscription/membership | Account, plan/version, effective dates, payment/event status, cancellation state | Household relation, pause dates, source/referral, terms version | Event idempotency, plan version, date ordering, webhook delay | Account holder starts; system confirms event; staff handles exceptions |
| Reminder/message | Recipient, verified channel, purpose/template, queue time, status | Language, opt-out, quiet hours, escalation, acknowledgement | Privacy content guard, verified contact, rate/duplicate send, retry | Staff drafts/sends; policy owner approves templates |
| Workforce/timecard | Employee, location, role/employment, event or shift, timestamp, approval state | Break, pay code, correction reason, credential expiry | Overlap, missing punch, terminated employee, export lock | Employee enters; manager approves; payroll exports |
| Inventory movement | Item/code, quantity, unit, location, reason, actor, timestamp | Lot/expiry, supplier/cost, witness, temperature, order/receipt | Negative stock, unit conversion, recalled/expired lot, count reconciliation | Inventory staff enters; manager reviews controlled/variance events |

Do not put every FHIR element on every screen. Maintain a mapping layer and only expose the fields needed for the workflow, exchange, audit, and future reporting requirement.

## 11. Missing data and recommended data-model improvements

The following are the five most important missing or insufficiently visible data elements:

1. **Canonical record lineage:** explicit links and event history from prospect/account/membership to patient, appointment, encounter, note, invoice, payment, reminder, and subscription.
2. **Actor/resource availability:** clinician, room, site, closure, leave, timezone, buffer, and overbook policy represented independently from an individual appointment.
3. **Ownership and provenance:** created-by, entered-by, reviewed-by, approved-by, signed-by, source system, source event/reference, and last-change reason.
4. **Communication consent and delivery state:** verified channel, opt-out, preferred language, message purpose, queued/sent/failed/acknowledged status, and provider response.
5. **Correction and version history:** immutable prior value or event, amendment reason, effective time versus recorded time, and downstream records affected.

Recommended model rules:

- Use stable internal IDs plus external identifiers where integration is approved; never use display names as keys.
- Store status transitions as auditable events or a durable history, not only the latest label.
- Store both local clinic timezone and normalized timestamps for scheduling and reporting.
- Separate “unknown,” “not applicable,” “not collected,” and blank.
- Link inventory administration to lot and movement when the workflow requires it.
- Link billing to the service/encounter event without deriving clinical completion from payment state.
- Preserve source and review provenance for AI-assisted content.
- Use coded terminology mappings where they improve exchange/reporting; retain human-readable display text for usability.

## 12. External guidance and standards alignment

| Guidance | Relevant product implication | Current assessment |
|---|---|---|
| [FHIR Appointment R4](https://hl7.org/fhir/R4/appointment.html) | Model booking status, participants, reason, start/end, cancellation, waitlist, and the administrative boundary from Encounter. | Good conceptual alignment in Schedule/Front Desk; full field mapping and transitions are **unknown**. |
| [FHIR Schedule and Slot R4](https://hl7.org/fhir/R4/schedule.html), [Slot](https://hl7.org/fhir/R4/slot.html) | Availability is a schedule/resource concern; slots can be free, busy, unavailable, tentative, or overbooked. | Supports in-house scheduling recommendation; recurrence, exceptions, and overbook policy need decisions. |
| [US Core](https://hl7.org/fhir/us/core/) | Patient, Encounter, Observation/vitals, medications, conditions, diagnostic reports, documents, care plans, goals, procedures, and provenance should be exchange-mappable where applicable. | Source has related domains; profile-level Must Support and exchange tests are **unverified**. |
| [HHS Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) | Requires a risk-based security program when applicable; access, audit, integrity, and contingency concerns should inform product design. | No compliance claim. This review did not perform a security assessment or legal determination. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Keyboard operation, focus, labels, errors, contrast, reflow, status messages, and accessible authentication should be acceptance criteria. | Source has visible labels/ARIA and clear status text in reviewed areas; complete assistive-technology and responsive verification is **unknown**. |
| Repository U.S. reference map | FDA/RxNorm/UCUM, CDC/IIS, CMS/CLIA, and clinical-note/provenance references inform medication, immunization, laboratory, and record workflows. | Useful routing exists; applicability depends on the clinic’s actual services and jurisdiction. |

## 13. UX, accessibility, responsive, and usability findings

### Observed strengths

- The browser-visible Schedule screen had a clear title, labeled booking controls, duration shortcuts, timezone note, modality warning, and an explicit empty-state explanation.
- Tracking Board source includes accessible labels, stage/filter controls, and empty/no-match states.
- Reminders source includes a character limit, verified-phone warning, and provider-state language.
- The application uses a consistent clinic shell and progressive domain separation.

### Risks requiring browser verification

- Keyboard-only completion of login, patient search, booking, check-in, and board movement.
- Focus return after dialogs, patient selection, errors, and route changes.
- Screen-reader announcement of loading, success, conflict, and stale-data states.
- Month/day schedule reflow at narrow widths; horizontal time-grid scrolling; no loss of appointment context.
- Zoom/reflow at 200% and high text spacing.
- Contrast and non-color status encoding.
- Reduced-motion behavior in board transitions, loading, and the shared animated-book indicator.
- Error recovery after network interruption during appointment, note, payment, inventory, or timecard saves.

The evidence boundary matters: source inspection can show labels and handlers, but it cannot prove an accessible browser interaction. These checks should be captured as repeatable browser acceptance scenarios.

## 14. Permissions, persistence, failure states, and lost-work risks

### Permissions

Server-projected capabilities and explicit clinic context are strong foundations. The next requirement is a permission matrix per action, not just per page: view patient, edit demographics, create/reschedule/cancel appointment, check in, assign provider, enter/sign note, approve scribe, issue/refund payment, export reports, manage inventory, edit workforce records, and change configuration.

### Persistence and idempotency

Every mutation should communicate whether it saved, is pending, failed, or was rejected. Appointment creation, payment application, reminder send, membership activation, inventory receipt, timecard correction, and chart save require idempotency or duplicate protection. The current source suggests several retry/error patterns, but a complete mutation audit was not performed.

### Failure and lost-work risks

| Risk | Current evidence | Required product behavior |
|---|---|---|
| Sign-in stalls | **Browser verified** `ENTERING…` with no visible recovery | Timeout, retry, diagnostic reason, and safe return to selector |
| Schedule pagination/refresh inconsistency | **Test observed** failure in `schedule-pagination.test.tsx` | Server page remains authoritative; refresh returns to the same page and preserves filters |
| Navigation/listener scope regression | **Test observed** failure in `clinic-navigation.test.ts` | Route/listener ownership and state isolation should be asserted |
| Empty response mistaken for no work | **Browser/source verified** explicit wording exists in Schedule | Preserve “not evidence of none” and distinguish query failure from zero results |
| Video unavailable | **Browser verified** warning | Disable or redirect safely; never imply a working video visit |
| Message not sent on cancellation | **Source verified** | Offer a deliberate communication action and record the outcome |
| AI draft mistaken for signed clinical record | **Source verified** separate approval/signing | Keep blockers, provenance, reviewer, and signature state visible |
| Payment or webhook delay | **Source/inference** membership and billing routes | Show pending confirmation, idempotent retry, and exception queue |
| Context lost between patient/encounter/schedule | **IA inference** | Persist breadcrumb/context and confirm before switching patient/site |

## 15. Prioritized recommendations

Each recommendation includes the requested decision fields.

### Critical

| Problem | Proposed change | Reason | Affected users | Priority | Dependencies | Verification method | Basis |
|---|---|---|---|---|---|---|---|
| Local sign-in can remain at `ENTERING…` without a usable recovery | Add bounded request timeout, visible error classification, retry, and safe return to the selector; trace the backend response in synthetic/local mode | Without entry, no role can complete a journey or validate browser behavior | All roles; developers/testers | Critical | Auth/session route, local dev selector, API logs | Fresh browser session: enter each synthetic role/context, verify success and failure paths | Browser observation plus opinion |
| Current scheduling/navigation test run reports two failures and stalls | Reproduce and isolate the failing assertions, then restore deterministic test completion before using the suite as a release signal | A broad feature surface needs reliable regression feedback | Developers, reviewers, all users indirectly | Critical | Current concurrent scheduling work, test ownership | Run targeted tests, then full suite with bounded timeout and recorded output | Test observation |
| Appointment, visit, encounter, and chart states can be interpreted as one lifecycle | Define and display a canonical transition map with separate record statuses | Prevents incorrect assumptions about arrival, clinical completion, signing, and billing | Front desk, nurses, clinicians, billing, managers | Critical | Data lineage, status dictionary, route handoffs | Create synthetic appointment; advance through each state; assert visible status and linked IDs | External guidance plus inference |

### High priority

| Problem | Proposed change | Reason | Affected users | Priority | Dependencies | Verification method | Basis |
|---|---|---|---|---|---|---|---|
| Flat navigation exposes too many equal-weight destinations | Add role-based home and grouped domains while preserving permissioned deep links | Reduces cognitive load and competing entry points | Front desk, nurse, clinician, manager, owner | High | Capability matrix, route analytics | Browser walkthrough for each role; measure time to first correct action | Source observation plus opinion |
| The primary patient context can be lost between queues and records | Add persistent patient/encounter/site breadcrumb and a context-change confirmation | Prevents wrong-patient and wrong-site actions | All clinical/operational roles | High | Shared shell/context, record IDs | Switch from Work inbox → Patient Flow → chart → billing; verify context is retained | Inference |
| Schedule needs a coherent month/day workflow | Provide month counts/capacity, day time-grid, resource lanes, conflicts, and explicit open-slot booking | Makes schedule useful for planning while keeping data internally owned | Front desk, clinicians, managers | High | Availability model, current scheduling worktree changes, status map | Browser test month → day → booking → conflict → reschedule; verify persistence | Browser/source observation plus FHIR guidance |
| Configured, simulated, unavailable, and live providers are not uniformly distinguished | Standardize provider/integration status badges and feature gates | Avoids false confidence about SMS, video, email, payments, and external exchange | Staff, admins, owners, patients | High | Provider adapters, settings, audit log | Configure each synthetic provider state and verify copy/actions | Source observation plus opinion |
| Field ownership and editability are not consistently visible | Add field-level help/ownership, required markers, and post-event edit rules | Reduces repeated entry and unsafe edits | Patients, staff, clinicians, billing, inventory | High | Data dictionary, permissions | Test create/edit at each lifecycle boundary and inspect audit history | Inference plus external guidance |
| Browser acceptance evidence is incomplete | Create a short role-based smoke pack covering login, patient, booking, check-in, encounter, billing, reminder, inventory, workforce, and portal | Source coverage is not behavior proof | Product, engineering, reviewers | High | Stable local entry, synthetic fixtures, test data reset | Run in fresh browser contexts and archive screenshots/logs without sensitive data | Evidence gap/opinion |
| AI scribe clinical accountability is undecided | Document eligible roles, review/sign rules, provenance, correction, and failure behavior before live use | UI existence does not establish safe clinical use | Clinicians, reviewers, patients | High | Clinical governance and professional review | Tabletop plus synthetic review cases including wrong patient/no source/stale transcript | External guidance boundary plus opinion |

### Medium priority

| Problem | Proposed change | Reason | Affected users | Priority | Dependencies | Verification method | Basis |
|---|---|---|---|---|---|---|---|
| Reports and exports are fragmented by domain | Add report catalog with freshness, filters, permissions, and export provenance | Managers need trustworthy operational views without stitching screens manually | Owners, managers, billing, operations | Medium | Event history, reporting queries, export policy | Reconcile synthetic counts against source ledgers and test permission boundaries | Source gap plus inference |
| Communications have useful provider states but incomplete lifecycle visibility | Add draft/approval/queued/sent/failed/acknowledged history and cancellation-message choice | Makes reminders and cancellations explainable | Front desk, patients, managers | Medium | Message model, provider callbacks, consent | Simulate verified/unverified/opt-out/provider-failure cases | Source observation plus opinion |
| Corrections and amendments are not consistently visible across domains | Add a shared audit timeline and amendment reason | Protects trust and reduces silent overwrites | Clinical, billing, inventory, workforce admins | Medium | Actor/provenance/version data | Edit synthetic records after downstream actions and verify history | External guidance plus inference |
| Empty and no-match states are strong in some surfaces but inconsistent as a system | Adopt a state contract for loading/empty/stale/error/success/blocked | Makes the app predictable | All users | Medium | Shared UI patterns | Component and browser matrix for each major feature | Source observation plus opinion |
| Schedule route aliasing may weaken deep-link clarity | Choose canonical route semantics and preserve query/context explicitly | Improves history, support, analytics, and sharing | Staff, support, developers | Medium | Router/navigation ownership | Navigate direct and back/forward with patient/site/date filters | Source observation |

### Later enhancement

| Problem | Proposed change | Reason | Affected users | Priority | Dependencies | Verification method | Basis |
|---|---|---|---|---|---|---|---|
| External calendar sync is not currently justified by evidence | Add only after partner/use-case decision; start with export/read-only sync and explicit conflict owner | Avoids a second source of truth and sync ambiguity | Managers, clinicians, patients | Later | Integration requirements, external IDs, conflict policy | Contract test with one approved provider and intentional conflict cases | Opinion |
| Recurring schedules and advanced capacity rules may be needed | Add recurrence/exception/holiday/overbook policy after clinic operating model is known | Avoids prematurely modeling every scheduling variant | Managers, front desk | Later | Schedule/Slot model, timezone policy | Synthetic DST/holiday/absence scenarios | External guidance plus opinion |
| Personalized dashboards and saved views | Add after role-based IA stabilizes | Personalization is useful after canonical workflows are clear | All staff | Later | Metrics, permissions, preference persistence | Save/change/reset view and verify no hidden work | Opinion |
| Multi-clinic aggregate reporting | Add aggregate-only metrics across clinics where authorized | Supports organization owners without mixing record domains | Owners, operators | Later | Tenant isolation, reporting policy | Cross-clinic synthetic fixture and permission test | Memory/product boundary plus opinion |

## 16. Recommended implementation sequence

This is a future sequence, not work performed in this review.

1. Address selected-patient scheduling clarity, then verify fresh local entry and isolate remaining relevant failures; preserve existing sessions during source edits.
2. Apply the accepted Patient Flow → Schedule → Tracking Board terminology; map remaining record/status ownership without replacing existing domain states.
3. Prove the paid-member front-desk journey: Patient Flow initial contact → booked appointment → Schedule → arrival/check-in → Tracking Board. Role-based shell changes remain a separate increment.
4. Configure the intended clinician and capacity and verify the implemented month/day/resource workflow, conflict handling and persistence in the browser.
5. Add persistent patient/encounter/site context and cross-domain audit history.
6. Validate clinical, billing, messaging, inventory, workforce, telehealth, and scribe handoffs one vertical slice at a time.
7. Run browser accessibility/responsive/error-state acceptance and targeted regression tests.
8. Decide provider integrations and only then design external sync, live messaging/video/payment, or exchange mapping.

## 17. Open product decisions

1. Settled for the current reference journey: cash-pay weight-loss membership, within configurable Meta Clinic. Exact clinic resource and launch policies still require configuration; this does not hardcode the product to weight loss.
2. Which roles must be supported at launch, and what may each role view, edit, approve, sign, refund, export, or configure?
3. Settled for this implementation: Meta Clinic owns appointment and availability truth; no external scheduling API. Future exchange needs require a separately approved scope and conflict policy.
4. What is the minimum patient identity and clinical data set for the first real workflow, and which fields are explicitly out of scope?
5. Which communications, payments, telehealth, clinical exchange, and AI-scribe capabilities are simulated, configured, or intended for live use?
6. What U.S. jurisdictions, services, clinical professionals, and laboratory/immunization workflows will determine the applicable professional and regulatory review?
7. What is the correction policy after a note is signed, a payment is settled, a reminder is sent, or inventory is consumed?
8. Which reports must reconcile to immutable ledgers, and who may export them?

## 18. Evidence appendix

### Repository and source evidence

- `apps/web/src/App.tsx` contains the public, clinic, portal, workforce, owner, telehealth, scribe, inventory, billing, membership, and launch route switch. The clinic route block includes work inbox, waitlist, recalls, refills, operations, setup/facilities, patients, inventory, workforce, front desk, billing, subscriptions, growth, reminders, messages, scribe, and settings surfaces.
- `apps/web/src/features/clinic/clinicNavigation.tsx` centralizes clinic route normalization, capability-aware navigation, clinic landing destinations, and the Schedule alias behavior.
- `apps/web/src/features/clinic/Workspace.tsx` loads clinic context, persists selected practice/site server-side, and renders Tracking Board/Schedule home surfaces with retry/error behavior.
- `apps/web/src/features/clinic/TrackingBoardPage.tsx` and `trackingBoardData.ts` support Tracking Board stages, filters, assignment, elapsed/waiting/duration values, and explicit empty/no-match states.
- `apps/web/src/features/clinic/WorkInbox.tsx` supports work status columns, ownership tabs, overdue filtering, work-type filtering, scheduled-visit handoff, and retry/error display.
- `apps/web/src/features/clinic/FrontDesk.tsx` supports appointment date/site/search, schedule, reschedule, cancellation, and reminder linkage.
- `apps/web/src/features/clinic/Reminders*`, `BillingDashboard*`, telehealth, scribe, inventory, and workforce feature families contain the domain-specific workflows described above.
- `apps/api/config/routes.rb` exposes the corresponding API domains for auth/CSRF/session/dev access, membership/account/payment, clinic context, scheduling, tracking board, encounters/notes/clinical workflows, telehealth/scribe, reminders/messaging, billing/subscriptions, inventory, patients, workforce, portal, and staff messaging.
- `docs/development/us-healthcare-reference-map.md` records the repository’s U.S.-oriented routing for FHIR, US Core, FDA, CDC, CMS/CLIA, RxNorm, UCUM, clinical notes, DocumentReference, Provenance, CarePlan, Goal, Procedure, and QuestionnaireResponse.

### Commands and observed results

| Check | Result | Interpretation |
|---|---|---|
| `git status --short` | Existing/concurrent changes present in `.codex`, scheduling/tracking-board/API routes, WorkInbox/CareFlow, tests, and untracked scheduling files | User-owned work preserved; not included in this review’s implementation scope |
| `graft map` and `graft ask ... --source` | Repository graph returned feature/source mapping | Used for orientation before source inspection |
| `Invoke-WebRequest http://127.0.0.1:3000/clinic` | HTTP 200 | Frontend route served locally |
| `Invoke-WebRequest http://127.0.0.1:3001/up` | HTTP 200, green response | API health endpoint responded locally |
| `Invoke-WebRequest http://127.0.0.1:3000/api/public/membership_storefronts` | HTTP 200 | Public membership API responded with synthetic/local storefront data |
| `Invoke-WebRequest http://127.0.0.1:3000/api/csrf` | HTTP 200 | CSRF endpoint responded; token value intentionally not recorded |
| `pnpm --dir apps/web typecheck` | Passed on the later current worktree state | Does not prove runtime/browser behavior; earlier in-run state reported a missing scheduling module before concurrent files appeared |
| `pnpm --dir apps/web test -- --reporter=dot` | Current run reported one failing `clinic-navigation.test.ts` test and one failing `schedule-pagination.test.tsx` test, then stalled and was stopped | Not a passing suite; failures need ownership/reproduction |
| `git diff --check` | Exit 0 with line-ending warnings on existing changed files | No whitespace error identified; warnings were not changed by this review |

### Browser walkthrough

The local in-app browser and an existing local Chrome tab were used. The observed synthetic sign-in selector showed Meta Clinic branding, local development tools, destination options, organization/clinic/location/account controls, a date, and a Log in action. After synthetic context selection, the button changed to `ENTERING…` and did not complete. A second attempt reproduced the same behavior; no further retries were made.

An already authenticated local tab displayed the Schedule surface. Browser-observed elements included the clinic context/sidebar, Schedule heading, appointment booking form, patient search/select, start/end times, duration shortcuts, timezone note, visit format, unavailable-video warning, site, room, clinician, visit type, visit reason, and an empty scheduled-visits state explicitly warning that no returned visits is not evidence of no active visits. Navigating away from that tab returned to the local sign-in selector, so deeper browser workflows were not claimed as verified.

No browser screenshot file was available through the active browser-control surface for attachment to this repository document. The states above are recorded as direct walkthrough evidence, with the limitation that screenshot-based visual comparison and a full responsive/device matrix remain outstanding.

### Capability status

| Status | Capabilities |
|---|---|
| **Implemented in source** | Clinic context/capability projection; broad route/domain coverage; Patient Flow and Tracking Board model; schedule form; billing and inventory domain surfaces; workforce; telehealth and scribe review boundaries; public membership routes; retry/empty/unavailable patterns in reviewed components. |
| **Partially implemented** | End-to-end appointment → arrival → encounter → billing journey; cross-domain lineage/audit timeline; reporting/export catalog; integration-state presentation; role-specific information architecture; schedule month/day/resource experience. |
| **Browser-unverified** | Login completion for all roles; patient creation/search; full Patient Flow movement; encounters/charting; billing/payment/refund; reminders/messages; workforce; inventory; portal; telehealth; scribe; responsive/accessibility journeys. |
| **Missing or not established by evidence** | A reliable local sign-in recovery path; a single accepted canonical status/ownership dictionary; five data elements listed in Section 11; a verified full regression signal; any claim of regulatory, clinical, security, or production readiness. |

### Current status reconciliation — 2026-09-16

The historical appendix above predates the authorized implementation follow-through and is retained as dated evidence. Current source and verification supersede its stale “browser-unverified” labels for the bounded slices actually exercised: local entry recovery, grouped clinic navigation, Patient Flow → Schedule → Tracking Board semantics, selected-patient context, populated scheduling/check-in, local recurring and one-time membership payment simulation, patient activity provenance, provider/report state presentation, cancellation-message boundaries, launch checklist, duplicate-match labeling, and Tracking Board visit context. The full frontend suite currently passes 51 files / 379 tests, and the latest pushed commit is `1bf18db` plus the follow-up UI commits. The remaining rows are not all implemented or browser-proved: encounter/intake/lab detail, telehealth session, billing/refund edge cases, inventory/workforce walkthroughs, complete role/device/accessibility acceptance, and every external, clinical, legal, tax, export/retention or production gate remain open. This reconciliation does not convert source inspection or local synthetic evidence into launch readiness.

### Ten most important changes

1. Make local sign-in complete or fail with a usable recovery state.
2. Isolate the remaining navigation failure and relevant deterministic test gaps; the calendar tests now pass.
3. Approve the canonical appointment/visit/encounter/chart/billing status map.
4. Provide a role-based home and grouped navigation.
5. Preserve patient, encounter, site, and date context across routes.
6. Verify the implemented calendar using configured resources and populated browser bookings.
7. Make provider states consistently configured, simulated, unavailable, or live.
8. Add actor, provenance, approval, signature, and correction history.
9. Define the membership/account/payment/patient lineage and delayed-event states.
10. Establish browser, keyboard, responsive, and failure-state acceptance evidence.

### Five data areas requiring gap classification

1. Canonical cross-domain record lineage.
2. Actor/resource availability and overbook policy.
3. Field-level ownership and provenance.
4. Communication consent, verification, and delivery lifecycle.
5. Correction, amendment, and version history.

### Five most important product decisions

1. Weight-loss membership is the selected reference journey; configure its intended services/resources without hardcoding the product.
2. Role/action permission matrix.
3. Internal appointment and availability ownership is settled for this work; external sync is not in scope.
4. Minimum patient/clinical data set and out-of-scope fields.
5. Which providers and AI/clinical capabilities are simulated, configured, or approved for live use.

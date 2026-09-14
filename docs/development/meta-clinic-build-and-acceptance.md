# Meta Clinic Engineering Build and Acceptance Guide

Direction: [Product strategy](../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md). Work status: [Implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md). Architecture: [Software architecture](../architecture/software-architecture.md).

## Build complete journeys

Start each change with an observable patient or employee outcome. Identify the entry point, durable records, responsible role, handoffs, completion evidence and recovery action. Follow the existing [code-change workflow](../../agent-harness/workflows/code-change.md) and scoped repository instructions.

Use the React/Rails/PostgreSQL modular architecture and source-owned records. Under [D-078](../architecture/clinic-capability-architecture.md), reuse, refactor or replace development mechanisms on merit; do not create parallel patient, balance, stock or workflow truths or retain weak structures solely for fixture compatibility. For substantive healthcare workflow design, use the [standards procedure](healthcare-standards.md); standards inform data and behavior without automatically adding license-verification product features.

## Shared behavior

| Area | Required behavior |
| --- | --- |
| Patient entry | Online prospects, accounts, patients and encounters remain distinguishable. Preserve existing membership conversion rules; do not require every walk-in or appointment to purchase a membership. |
| Hybrid care | Walk-ins, scheduled visits and telehealth share the appropriate patient history and staff work. Preserve modality, location and encounter context; avoid duplicate registration. |
| Front desk | Arrival, waiting, room assignment, intake, handoff, clinician work and checkout reflect their actual owning records. Opening a chart does not complete a handoff. |
| Roles | Enforce organization-assigned privileges on the server. Test wrong-role and wrong-organization denial. Do not infer licensing checks from role names or add jurisdiction blocks without explicit feature scope. |
| Cash-pay | Connect delivered services, invoices, cash/card payments, credits, refunds and receipts. Distinguish subscriptions, purchased packages and remaining service entitlements. Preserve the core when insurance is disabled. |
| Medication and pharmacy | Link requests, review, stock movement, dispensing, fulfillment and delivery where applicable. Recorded, transmitted, accepted and fulfilled are separate states. |
| Inventory | Preserve units, quantities, lots, expiration, receiving and adjustment history. Retries must not double-decrement stock or duplicate receipts. |
| Follow-up | Give unresolved work a responsible role and an actionable destination. Preserve failed delivery and retry state; do not equate queued messages with delivery. |
| Configuration | Keep specialty, payment model, modality, location and services configurable without copying the entire workflow. |

## Configurable capability contract

The strategy's [shared-core and clinic capability map](../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md#shared-core-and-composable-capabilities--d-076) owns product composition. The [D-078 architecture contract](../architecture/clinic-capability-architecture.md) owns shared core and clinic/team/FDE change tiers. Implement capabilities against source-owned records, not scattered specialty-name checks. Presets initialize reviewed choices; effective configuration, service, modality and current privileges determine actions. Existing practice-feature versions are a reuse candidate, not a mandated structure or proof that composition exists.

For every new or materially changed configurable capability, deliver together:

| Contract element | Required design/delivery |
| --- | --- |
| Identity and ownership | Stable capability key/version; owning existing domain/model/API; supported scope (practice, location or service) and explicit override precedence. Do not introduce per-site overrides until required. |
| Setup | Applicable presets, reviewable defaults, dependencies/conflicts and effective preview; explicit finalization. Classify each later change as clinic-managed, Meta Clinic-managed or FDE-assisted and show its allowed control/request route. Avoid silent activation on preset/software changes. |
| UI and backend | One effective capability result shared by screens and server checks; component variant/entry points; permission checks independent of visibility; disconnected vendor distinct from disabled service. |
| Lifecycle | Existing records readable, unfinished work actionable under its own rules, edits versioned, apply/retry idempotent. Disable new use without erasing history. Show conflicts and authorized resolution; do not silently cascade-disable required capabilities. |
| Composition | State what it reuses and what varies; cash/insurance and virtual/physical independent of specialty. No mandatory room/chair for telehealth-only workflows. Integrity, tenant isolation and source-owned completion are not optional modules. |
| Acceptance and maintenance | Update strategy map, Clinic Setup, matrix IDs and tracker row. Prove permitted setting changes, tier/role denial and independent work, persistence and relevant combinations. Historical interpretation uses fresh synthetic records; migrating all old fixtures is not required. No exponential preset matrix. |

Unavailable dependencies prevent only the dependent enable/action transition. Keep drafts and resolution links. A component that swaps rendering must retain owning IDs and transition semantics. Configuration is not a replacement for assigned authorization, clinical review or provider confirmation.

### Capability lifecycle and complexity acceptance

D-078 supersedes the earlier unrestricted-switching interpretation of D-077. Shared core is non-switchable. Clinics change permitted settings; Meta Clinic staff handle supported higher-impact changes through scoped, audited application operations; forward-deployed engineers handle unsupported transitions under separate assignments. Finalized setup is protected from ordinary clinic edits, not permanently immutable. No universal engine, generic administrator bypass or routine direct database intervention is selected.

For each changed operation, specify change tier and applicable configure/use/change/disable/open-work semantics; enable and disable may require different authority. Bind published forms/plans/transactions to the required revision and record explicit actual use where applicable. Historical interpretation never grants obsolete permissions. Draft, approved/current and actually used revisions are distinct; current operational rules do not silently rewrite completed history.

Before applying a change, inspect affected records and dependencies and display the consequences. Preserve drafts, original IDs, completed history and unfinished-task ownership. Incompatible open work requires a visible, action-specific reconciliation path under CF-01–03 and OP-05/10/12, not deletion, a global hold or automatic custom migration. Re-enable without duplicating existing records or silently replaying vendor requests. Rollback is only offered where semantics allow it; irreversible external or completed business effects need their own correction process.

Complexity review for a changed capability must identify:

- Its authoritative domain owner and narrow public contract; do not scatter specialty-name checks through unrelated UI, models and integrations.
- Which variation is configuration and which needs a distinct implementation; support explicit combinations rather than arbitrary interchangeable behavior.
- The persisted record/version compatibility contract and exact existing-work transition; avoid a giant untyped payload or duplicate specialty schemas as the default escape hatch.
- Its dependency direction, transaction boundary and relevant asynchronous effects. Do not select new event infrastructure, services or frameworks merely to achieve modularity.
- How Clinic Setup and the backend resolve the same effective capability, with independently enforced permissions.

Add one bounded proof to the weight-loss slice: finalize setup; reject a clinic-unauthorized protected change; permit an eligible clinic-managed setting change; preserve interpretation and owned work created within that proof. Show team/FDE routing without claiming unimplemented transitions work. Exercise version-used history for the touched form/plan/note rather than building every treatment-plan feature. Reuse valid paired checks; do not replay all specialty combinations or add a launch audit.

The [research report](../../records/research/2026-09-14-meta-clinic-capability-architecture.md) supports the adopted contract. Existing development structures and data are not design constraints; clean replacements are allowed within a scoped implementation, while resets need explicit target/authority. These criteria describe future product behavior, not a requirement for legacy fixture compatibility or a claim of implementation.

### Future recurring-service projection contract

This is bounded design direction under D-076, not an additional task list or ready implementation. Before implementation, inspect existing care-plan, appointment/resource, stock and insurance owners; extend them, not a parallel forecasting ledger. Do not infer this capability from the presence of a generic care-plan screen.

| Input / purpose | Owner, controls and provenance | Prerequisite and recovery |
| --- | --- | --- |
| Plan version, intended service, recurrence and horizon | Existing clinical-plan/service owners; authorized clinician records intent. Integer frequency, bounded period unit, actual start/end dates, timezone and selected days/windows when known; preserve source/version. | Draft may be incomplete. Exact occurrences require resolved recurrence/dates; “Choose dates and a recurrence before calculating sessions.” No clinical frequency or duration default. |
| Session duration and resources | Existing service/resource scheduling owners; admin configures typed minutes, compatible resource references, actual capacity, operating/maintenance intervals and staff availability; turnover only when specified. | Unknown duration/resource mapping prevents confident availability, not other care. “Add the session duration and required resources.” Check all necessary resources when reserving, atomically. |
| Material requirements and outlook | Existing plan/order and inventory owners; authorized recorded quantities with typed units/catalog refs; stock, reservations and known inbound evidence inherited with timestamps. | Missing quantity/unit mapping makes demand unknown, not zero. “Resolve the material quantity or unit mapping.” No inferred clinical dose/conversion, automatic stock movement or purchasing. |
| Coverage versus service authorization | Existing insurance/request-response owners; staff-recorded evidence with source/date or future vendor response. Separate coverage period, authorization reference, service/provider/site scope, validity dates, approved quantities and units, use/reversal evidence. Typed dates/numbers, searchable references, original response preserved. | Unknown approval/limits stay unknown. An affected future service creates review according to configured policy, not an automatic patient-wide hold or claim of approval. “Review coverage or authorization for this visit.” Actual vendor mapping remains unverified. |
| Projection and owned exception | Derived view with source versions, calculated time, horizon, assumptions and affected occurrence IDs; underlying tasks remain in existing queues. | Mark stale when inputs change; recompute/reconcile, do not silently overwrite confirmed appointments or completed treatments. Team reviews conflict; no invented contact deadline. |

Distinguish forecast, tentative hold, confirmed reservation, delivered treatment and actual stock movement. Deduplicate review work by source/service and reason; one new estimate must not create another outreach task. On plan changes/cancellation, release only relevant holds under existing rules, preserve completed events and recompute remaining demand. Coverage expiry, unknown eligibility, authorization validity and remaining authorized units are distinct. Evaluate affected scheduled care even without a recurring plan; no affected future care means no automatic expiration-driven patient outreach by default. Clinic-defined alternatives or exceptions remain action-scoped.

Source review, 2026-09-14:

- [FHIR R4 Schedule 4.0.1](https://hl7.org/fhir/R4/schedule.html), trial-use resource, sections 12.12.1 and 12.12.1.1–3: resource availability and appointments are separate; multiple required resources may need coordinated checks. Maps to resource inputs and SC-04. This global foundation is considered for the U.S. workflow on the same R4 base used by the reviewed U.S. guide below, not adoption of a standalone U.S. scheduling profile or prescribed scheduling algorithm.
- [FHIR R4 CarePlan 4.0.1](https://hl7.org/fhir/R4/careplan.html), trial-use resource, scope/resource definition: care intent over time is distinct from performed work. Maps to plan/version and projection inputs. Same documented U.S./R4 applicability; no FHIR-native schema mandate or clinical recurrence rule.
- [U.S. Da Vinci PAS Claim Response 2.2.1 / STU 2.2](https://hl7.org/fhir/us/davinci-pas/2.2.1/en/StructureDefinition-profile-claimresponse.html), published trial-use, active 2026-03-27, FHIR R4; profile/formal views including `preAuthPeriod`, item preauthorization period and authorization reference. Maps to separate service authorization evidence and OP-13. This is structural source guidance, not an assertion that a payer accepts this version or a default contact/blocking policy. Do not mix this guide's dependencies with another US Core version without explicit mapping.

Projection logic, component composition, notification policy and no-unrelated-block behavior are product decisions. Exact payer rules, approved units interpretation, treatment protocols, resource restrictions and partner transaction mapping need scoped source/clinic review before implementation. No blanket requirement or insurer approval is inferred from these references.

## Ownership, dependencies and attention

Every workflow must distinguish recorded status, responsibility, action prerequisites and urgency. Waiting is not automatically blocked; urgent work does not automatically block unrelated care. Do not implement a global patient-blocked flag from an unfinished task or earlier stage.

Distinguish an optional operational patient coordinator, responsibility for the current encounter, and ownership of each task. A shared team queue is valid ownership without a named individual. Assignment does not grant permissions or professional authority. Reuse existing work records and queues before adding a separate task system.

For every action document: authorized actor; responsible person/team; exact prerequisite and its owning record; blocked action; parallel actions still available; resolution action; due/attention rule; escalation recipient; completion evidence; and reassignment or coverage behavior. Clinical dependencies and urgency thresholds must come from an explicit clinician decision or defined clinic policy, with applicable source review. Do not invent blanket lab or treatment prerequisites.

### Workflow dependency and ownership matrix

This is the shared build matrix. Extend it for each feature; the rows define software behavior, not new clinical protocols or a claim that these controls are implemented.

Use the six columns below without combining **Action affected** with **What is blocked**. The former names the workflow operation; the latter states the precise prohibited transition. IDs are stable acceptance references, not a second task register. These are engineering planning cases; clinic-specific clinical prerequisites remain conditional until sourced and configured. Responsible parties name queues/roles to map to actual clinic configuration, not invented staff assignments.

#### Specialty configuration and existing work

CF-01–03 are product requirements under D-075, not clinical prerequisites. Reuse OP-05 for missing eligible owners, OP-10 for general stale/retry behavior and OP-12 for outstanding work; do not add global setup holds.

CF-04 and CV-10 add D-078 product requirements: change authority and exact revision use. Their classifications are not HL7 clinical gates. CF-04 maps to MC-01/13/15; CV-10 maps to MC-05/06/12. The field contracts below and revision 4 of the weight-loss brief define paired proof, not passed evidence.

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |
| CF-01: Specialty setup lacks a required scoped service, visit type, offer or location reference | Applying configuration or starting its dependent action | Applying invalid references; publishing an incomplete offer or confirming an unconfigured visit, as applicable | Save recoverable setup, configure missing reference, unrelated services and existing patient work | Authorized clinic configuration team | Identify exact missing reference and setup action; optional services are not mandatory clinic-wide |
| CF-02: Preset application retried or based on stale configuration | Applying specialty starter records/settings | Duplicate generated records, silent overwrite of clinic customization or stale application | Read current settings, preview differences, reconcile and retry with preserved request identity; existing care | Authorized configuration team | Show known application outcome and affected records; no automatic replacement or repeated partial creation |
| CF-03: Specialty/service/form configuration changes with existing responses or unfinished work | Resolving new forms/services and revisiting prior work | Reinterpreting historical answers under a new form, erasing unfinished tasks, or starting a newly disabled service contrary to effective configuration | Read historical versions, finish/reconcile existing work under its own permissions, unrelated services and new applicable forms | Configuration team and existing domain task owners | Preserve effective versions and history; show changed setup without creating a global patient hold |
| CF-04: Requested post-finalization change exceeds clinic authority or has no supported transition | Changing configured capability/profile | Applying a protected change through ordinary clinic settings, a generic admin bypass or an unsupported transition | Permitted clinic settings, existing authorized care, impact review and team/FDE request or documented handoff | Authorized clinic requester; scoped Meta Clinic configuration team; assigned FDE only for an authorized engineering task | Show change tier, exact reason and supported next action. Team access does not imply patient-data access. No invented owner, immediate-response promise or automatic migration |

#### Enrollment, membership and scheduling

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |
| EN-01: Under 18 at membership account creation | Public membership signup | Creating that account through UI or API | Staff-managed patient records; other workflows have no new age gate in this scope | Enrollment support | Explain restriction; no guardian-account workaround in this increment |
| EN-02: DOB is future, invalid, or implies age 150 or older | Saving DOB | Saving the invalid value, not all chart work | Correcting DOB and unrelated work; today's DOB is valid | Person entering data | Inline correction; calculate age from DOB using a defined date basis |
| EN-03: Account setup incomplete, expired verification, changed terms or review-required offer | Account/checkout continuation | Activation without valid verification; payment before applicable review/acceptance or against superseded offer terms | Saved interest, matching-account setup recovery, current terms review and staff contact | Enrollment support | Preserve the original relationship and show the exact missing step; T01 |
| EN-04: Possible duplicate identity | Linking an account or record | Automatic ambiguous linking or merging | Identity resolution and unrelated records | Registration team | Preserve both records and draft; no name-only merge |
| EN-05: Payment pending or outcome unknown | Membership activation | Claiming payment success or activating without verified evidence; unsafe repeat charge | Saved account, Growth follow-up, payment reconciliation | Billing team | Distinguish pending from failure; reconcile server evidence |
| EN-06: Payment failed, canceled or abandoned | Membership purchase | Activating the unpaid purchase | Resume eligible purchase, staff assistance, saved lead | Billing/Growth team | Visible follow-up according to clinic policy; no fabricated patient conversion |
| EN-07: Never-member prospect unpaid | Online appointment booking | Patient self-scheduling | Contact request and staff-assisted assessment; staff scheduling evaluated separately | Front desk/Growth | Explain membership requirement, not a patient-wide hold |
| EN-08: Former member without active membership | Online appointment booking | Patient self-scheduling | Request a call, renewal assistance, outstanding follow-up | Front desk/billing | Route callback to an owned queue |
| EN-09: Renewal failure or cancellation pending | Recurring membership status | Claiming renewal paid; restrictions only under effective membership policy, never premature loss merely from pending cancellation | Billing recovery, callback, staff booking, outstanding clinical follow-up and record access | Billing team | Preserve paid-through/effective dates; no invented grace periods; T02/T08 |
| SC-01: Slot taken, provider unavailable or capacity exceeded | Appointment confirmation | Confirming the conflicting reservation | Alternate slots, request/callback, permitted staff work | Scheduling team | Explain conflict; recheck capacity atomically on save |
| SC-02: Cancellation or no-show | Appointment/encounter progression | Claiming attendance or completion that did not occur | Rebooking, outreach, unrelated tasks | Scheduling team | Track disposition and next contact; do not close clinical tasks automatically |
| SC-03: Walk-in waiting or no room assigned | Rooming/handoff | Claiming room assignment or accepted handoff without evidence | Registration, eligible intake, queue management | Front desk/nursing queue | Show waiting duration; escalation thresholds are configurable |
| SC-04: Required chair, room, staff or equipment unavailable for a planned session | Resource reservation/confirmation | Confirming the conflicting resource/time allocation or claiming a projection reserves capacity | Alternative resources/times, forecast revision, draft planning and unrelated visits/tasks | Scheduling/resource team | Show exact conflicting resource and affected session; resolve availability under configured constraints, not clinical guesses |

#### Intake, visits and documentation

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |
| CV-01: Intake draft, incomplete, unknown or declined | Submission and action requiring a particular answer | Labeling an unattested draft submitted; only a downstream action with an explicit unmet prerequisite | Draft saving, other questions, scheduling and unrelated visit work | Intake team; clinical reviewer for clinical dependencies | Distinguish unanswered, unknown, declined, not applicable and negative; identify exact resolver; T03 |
| CV-02: Conflicting or corrected intake information | Review of affected information | Treating conflicting data as reconciled | Preserve versions, clarification, unrelated documentation | Clinical review team | Reopen affected review only; record source and correction |
| CV-03: Patient/encounter identity mismatch | Writes to selected clinical context | Attaching clinical data to unresolved context | Safe draft recovery, identity correction, other patients' work | Current operator/support | Immediate correction; never silently relink |
| CV-04: Handoff awaiting acceptance | Transfer of encounter responsibility | Marking transfer accepted or dropping prior coverage prematurely | Sending/accepting handoff and independently authorized work | Current owner and receiving team | Display both parties and pending acceptance |
| CV-05: Required consent for a specific action absent or withdrawn | The consent-dependent action | That action under the established consent contract | Explanation, documenting decision, unrelated permitted work | Encounter team | Inspect existing consent/version process; no universal visit lock |
| CV-06: Telehealth disconnected or join/media failure | Remote encounter connection | Actual room/token while disconnected; claiming attendance or completed encounter without evidence | Save local video intent, rejoin, staff contact, authorized rescheduling and documentation | Encounter team/support | Show connection readiness separately from patient attendance; T05 |
| CV-07: Scribe permission absent, withdrawn or stale after participant/policy change | Recording/transcription | Starting or continuing capture under obsolete permission, including late callbacks | Manual notes and the visit itself where otherwise permitted | Encounter clinician | Reuse purpose/participant/policy-specific consent and retention; no new child/guardian flow; T05 |
| CV-08: Scribe unavailable, processing failed or draft unreviewed | Scribe-assisted documentation | Treating generated text as reviewed/signed documentation | Manual charting, visit, retry where appropriate | Note author/reviewer | Keep recoverable draft and source; failure must not stall the visit |
| CV-09: Note unsigned or changed after review | Signing/finalizing note | Claiming signature for an unreviewed version | Draft correction and independent orders/tasks under their own rules | Authorized signing role | Bind signature to reviewed version; retain correction history |
| CV-10: Required plan/form/note revision-use reference is missing, mismatched or changed since review | Recording an action that depends on that reviewed content | Claiming use/review of an unresolved version; silently substituting latest content or rewriting prior use | Resolve/review the applicable revision, save drafts, view earlier history and perform unrelated scheduling/visit/tasks | Owning author/reviewer team | Show intended versus actually used revision and affected action. A structured plan is not mandatory for every clinic or encounter; source/applicable policy defines the dependency |

#### Prescriptions, labs and fulfillment

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |
| RX-01: Required prescription data or destination missing | Prescription preparation/transmission | Marking ready or sending the incomplete prescription | Draft, destination selection, visits, labs and scheduling | Prescription support/prescriber | Identify exact missing field; detailed requirements need U.S./vendor mapping |
| RX-02: Review/signature missing or reviewed version changed | Prescription release | Releasing an unapproved/currently unreviewed version | Draft correction, renewed review, unrelated work | Authorized prescriber queue | Review applies to exact version; role does not validate licensure |
| RX-03: Prescription rejected, outcome unknown or destination/route change pending | Prescription lifecycle | Claiming acceptance/cancellation or sending a replacement before reconciling possible prior transmission | Reconcile original identifiers, correct and renew review, patient contact and unrelated care | Prescriber/support queue | Preserve original and subsequent requests; avoid duplicate fulfillment; T06/T09 |
| LB-01: Lab order draft or collection not completed | Lab order/collection | Claiming submission/collection or fabricating report values/dates for a pending order | Prepare the owning ServiceRequest, arrange collection, scheduling and visits | Ordering/collection team | Separate order, specimen and report evidence; T07 |
| LB-02: Specimen rejected or recollection requested | Result-dependent work | Treating rejected specimen as a valid completed result | Recollection coordination, visits and unrelated work | Lab coordination/clinical team | Record source reason and owner; clinician defines affected decisions |
| LB-03: Results pending or only partially received | Lab-dependent decision | Only a decision explicitly requiring missing results | Scheduling, visits, notes, review of available results and unrelated orders | Ordering team; receipt-follow-up queue | Track expected items and due dates without inventing universal turnaround |
| LB-04: Results received, review pending | Result review | Marking review complete without review evidence | Scheduling and unrelated work | Assigned reviewer/clinical queue | Receipt is not review; retain source priority |
| LB-05: Critical result reported | Clinical handling | Only decisions explicitly dependent on handling; acknowledgment alone cannot complete review, handling or patient communication | Acknowledge receipt, review available data and other work unless specifically restricted | Responsible clinician and coverage team | Preserve actual critical-review escalation/due safeguards; each action has separate version-bound evidence; T07 |
| LB-06: Corrected result or overdue missing result | Result reconciliation/follow-up | Treating superseded results or missing items as final/complete | Review correction, chase receipt, other patient work | Clinical/lab coordination queue | Reopen affected work; preserve versions, source and escalation rule |
| LB-07: Review done, patient communication outstanding | Result follow-up | Marking patient communication completed without evidence | Further outreach, scheduling and unrelated care | Designated follow-up team | Track attempts, response and defined completion separately |
| IN-01: Insufficient stock or conflicting reservation | In-house fulfillment | Completing unavailable quantity or double-consuming stock | Visit, external-pharmacy planning and authorized alternatives | Inventory/medication team | Resolve quantity against source ledger; no automatic clinical substitution |
| IN-02: Lot expired/held or units incompatible | Stock selection/use | Consuming the affected lot or unsupported conversion | Select suitable stock, clarify units, unrelated care | Inventory team; clinician where needed | Visible reason; no inferred dose conversion |
| IN-03: Partial fulfillment, delivery or receiving | Order/fulfillment completion | Marking remaining quantity complete; equating take-home handover, administration, carrier delivery and clinic receipt | Record distinct partial events, investigate remainder, reverse the original event where authorized and follow up | Fulfillment/receiving team | Preserve exact remaining balance, original event and ownership; T06 |

#### Billing, follow-up, ownership and external connections

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |
| OP-01: Invoice draft or payment/refund unconfirmed | Financial posting/receipt | Claiming a posted balance, paid receipt or refund without owning evidence | Correct draft, reconcile payment and continue unrelated care | Billing team | Preserve amount/version and retry identity; do not duplicate money movement |
| OP-02: Follow-up required but unscheduled/unassigned | Follow-up completion | Claiming follow-up arranged/completed | Scheduling, outreach, assignment and other tasks | Follow-up team or assignment-exception queue | Encounter closure must leave task visible |
| OP-03: Outreach failed or patient has not responded | Patient communication | Treating queued/sent as delivered or patient-confirmed | Further permitted outreach, contact correction, other work | Owning outreach team | Track attempts and clinic-defined escalation; no invented contact cadence |
| OP-04: Individual task unclaimed but team assigned | Task ownership | Nothing solely because an individual has not claimed it | Authorized team claim, completion and other work | Responsible team queue | Escalate overdue work under configured policy |
| OP-05: No eligible team, owner unavailable or privileges revoked | Assignment/coverage | Unauthorized action, silently discarding responsibility or replacing current coverage before required transfer acceptance | Eligible team claim, authorized reassignment, exception handling and unrelated work | Existing responsible team and configured eligible coverage | Show a configuration exception if no eligible destination exists; never invent a fallback owner or grant privileges through assignment; T10 |
| OP-06: Missing vendor connection | External execution | Actual external transmission and claims of external success | Persist, review, prepare and source-labeled manual records | Owning operations team | Show disconnected; connection must not auto-send backlog |
| OP-07: Timeout after possible submission; outcome unknown | Retry/reconciliation | Blind duplicate submission or claiming definite failure/success | Reconcile identifiers/status, contact support, unrelated local work | Owning operations team | Outcome unknown is distinct from disconnected and rejected |
| OP-08: Vendor rejects request or source changed after preparation | External request correction | Resending invalid/stale request as though unchanged approval applies | Correct, remap and obtain applicable renewed review | Domain owner/integration team | Preserve error/source/version; confirm actual vendor contract |
| OP-09: Coverage saved but eligibility/authorization unverified | Insurance workflow | Claiming verified coverage/authorization or external acceptance | Data collection, request preparation, cash-pay core and unrelated care | Insurance/billing team | Payment expectations and service-specific policies remain explicit, not universal visit gates |
| OP-10: Save failure, stale edit, duplicate/out-of-order event | Record transition | False saved/completed state, silent overwrite or duplicate side effects | Draft recovery, refresh/reconcile and independent work | Current operator; support for persistent failure | Display known outcome and next action; preserve history |
| OP-11: Dependency cycle or missing source record | Dependency evaluation | Accepting a cycle or treating unresolved prerequisite as satisfied | Correct configuration, restore valid reference, unrelated tasks | Configuration/domain owner | Visible exception; never strand work behind an invisible dependency |
| OP-12: Encounter closed with outstanding work | Encounter/task lifecycle | Auto-completing child labs, prescriptions, billing or follow-ups | Owned tasks, permitted corrections and future visits | Each task's existing team | Closed encounter must remain discoverable from open tasks |
| OP-13: Future service falls outside recorded coverage/authorization period, exceeds recorded authorized units, or lacks applicable evidence | Service-linked coverage/authorization review | Claiming verified approval or sufficient authorization; any additional action block requires explicit applicable policy | Local preparation, review, permitted scheduling and unrelated care; no automatic patient contact merely from an expiration date | Insurance/authorization team or visible assignment exception | Distinguish the exact reason and affected visit(s); dates/units/source drive review. No affected future care means no default expiration outreach; ordinary scheduled visits qualify even without a treatment plan |

### D-078 configuration and revision field contract

These are architecture/product fields, not new clinical questions. Change-tier classification belongs to the reviewed capability definition, not an editable clinic dropdown that lets someone promote their own authority. The exact schema is selected during scoped implementation.

| Field / control | Owner and origin | Required for action / recovery and paired proof |
| --- | --- | --- |
| Setup state, effective profile revision, applied preset/version | Configuration owner; computed/read-only summary plus explicit authorized Finalize action; preserve actor/time and source | Finalization requires valid scoped dependencies. Protected stale or unauthorized change denied; an independent permitted setting still saves. CF-01/02/04; MC-01/13 |
| Requested change, affected service/module and reason | Scoped searchable references, bounded supported operation choice and optional explanatory text; clinic requester cannot select elevated authority | Team-owned operation required for protected supported change; FDE handoff for unsupported transition. No live support queue claimed unless implemented. Existing care remains available. CF-04; MC-01/15 |
| Relevant impact and source versions | Derived preview from owning records/open tasks; show known conflicts/unknowns, not a clinic-entered success flag | Revalidate on apply; reject stale assumptions and keep draft/request context. Current task owners remain visible. CF-02/03/04, OP-10/12 |
| Intended/actually used content revision, actor and time | Typed scoped source reference; approved-version selection when needed, then recorded action usage; historical view is read-only with explicit amendment | Deny mismatched/review-invalid use; allow draft/re-review and independent work. New content leaves earlier use readable; don't copy signatures. CV-09/10; MC-05/06/12 |

### Action and field contract before implementation

For each changed feature, map applicable matrix IDs into its owning tracker row. Expand each action into a field contract: question/label; purpose; owning record; value source (entered, inherited, calculated or vendor); type/control; permitted values/units; required-for-draft versus required-for-action; conditional visibility; validation message; provenance; authorized writer; and test evidence. Use selects for bounded choices, searchable references for patients/products/destinations, typed date/number inputs for dates/quantities, and free text for explanations. Do not turn every exchange field into a new question. Preserve unknown/declined separately from negative answers.

Record the origin of every prerequisite: explicit product decision, established source requirement with U.S. applicability/version, clinic policy, clinician decision, or unresolved vendor mapping. An unresolved mapping is not a newly invented hard gate. This matrix organizes operational failure cases; it does not replace feature-specific standards review or prescribe medication, lab panels, clinical thresholds or consent language.

Each blocked action needs a stable reason, dependency/source reference, resolution link and responsible queue. Attention needs its own source, due time if defined, acknowledgment, escalation destination and resolution evidence. Never infer urgency solely from a disabled button. Test multiple simultaneous tasks and reevaluate only affected dependencies when one resolves.

### Task persistence and handoffs

Maintain task identity, patient and relevant source/encounter links, responsible team and optional assignee, state, creation/updated times, due time when applicable, dependency references, waiting reason, priority source, completion evidence and history. Do not require arbitrary due dates or invent owners. Work lacking an eligible destination must surface in a visible assignment-exception queue; do not silently lose it.

A transfer must preserve responsibility: define whether assignment is direct or requires acceptance, retain coverage while acceptance is pending, and record transfer history. Deactivation, leave or loss of privileges must route open work to authorized coverage or an explicit exception. Claiming work never grants additional privileges. Completion of an encounter must not automatically complete its labs, prescriptions, billing exceptions or follow-up tasks.

Dependency changes must update the owning task without duplication. Receiving results can make review actionable but cannot mark review complete. Handle repeated and out-of-order events and stale claims; a reopened or corrected source must surface relevant renewed work. Reject circular dependency configuration rather than strand tasks.

### Visible parallel work and verification

Patient Flow, patient detail and employee/team work views must expose permitted parallel work: membership, intake, appointment, note, prescriptions, labs and follow-up. Show owner/team, waiting reason, due/attention status and a direct next action. A blocked control must explain its exact prerequisite and resolution. Prior-stage incompleteness must not hide unrelated actions. Use text and icons as well as color; restrict details by existing permissions.

For every changed dependency verify both sides: the dependent action is correctly blocked and an unrelated action still succeeds. Include pending labs with scheduling available, received results creating review work, team claim/transfer and unavailable-owner recovery, wrong-role denial, duplicate events and encounter closure with outstanding tasks. Verify immediate-attention items remain visible to the responsible team without imposing a patient-wide lock. Record only checks actually performed.

## Vendor-independent workflow preparation

Build complete local behavior while vendor access is unavailable. Use existing domain records and narrowly scoped integration interfaces; do not create a generic integration framework or duplicate ledger merely to prepare for hypothetical vendors. Insurance remains an optional clinic module, with useful local preparation available before a clearinghouse or payer connection.

| Workflow | Build and verify locally | Connected operation |
| --- | --- | --- |
| Supplier prices | Product/supplier identifiers, pack size and units, quantities, quote requests, and manual quotes with source, date, currency and known fees; preserve unknown values | Retrieve vendor prices, availability and quote responses |
| Supplier orders | Purchase-order preparation, configured review, ship-to details, submission history, partial receiving and reconciliation | Submit an order and ingest supplier acknowledgment, changes or cancellation responses |
| Shipment tracking | Shipment/order linkage, carrier and tracking identifiers, timestamped manual events and receiving status | Retrieve carrier tracking events; distinguish delivery from clinic receiving |
| Insurance | Coverage/policyholder/payer information and prepared eligibility requests; support local authorization, claim preparation and response/reconciliation records within the clinic's configured scope | Exchange eligibility, authorization, claim and remittance transactions with the selected service |
| Prescriptions | Patient/encounter-linked preparation, pharmacy destination, organization-assigned review, versioned transmission request and outcome history | Submit through the prescribing network and ingest acknowledgments, failures and subsequent responses |

Before choosing detailed fields, review applicable current U.S. standards and accessible official interface documentation under the [healthcare standards procedure](healthcare-standards.md). Record source/version, field meaning, units or terminology, conditional requirements and mapping uncertainties. Do not invent inaccessible vendor fields or collect speculative data. A local completeness check is not external acceptance.

Keep domain status separate from delivery attempts. Each integration should distinguish disconnected, prepared, ready, submitted, acknowledged, failed and outcome-unconfirmed as applicable; domain-specific events retain their own meaning. Store durable request/version identity, actor, attempt time, correlation identifiers and source-tagged responses. Preserve unsent work without silently queuing it for automatic submission when credentials become available.

Adapters map existing records to the selected vendor contract and map responses back. Test adapters through a backend simulator with independently created synthetic fixtures. Exercise success, rejection, unavailable service, timeout after possible acceptance, duplicate/out-of-order responses and stale prepared data. Use idempotency or explicit reconciliation where supported; do not blindly retry consequential orders or prescriptions. Provider credentials remain outside source and workflow payloads.

In ordinary UI, show the affected action's connection status and a useful next step. Staff can still save, review and resume local work. Manual external records require provenance and stay distinguishable from vendor-confirmed events. A mock price is not a live quote, saved coverage is not verified eligibility, and a prepared prescription or purchase order has not been sent.

For each capability track local workflow completion, simulator/contract evidence and live connection acceptance separately. When access arrives, finish actual field mapping, onboarding and provider-specific tests, then explicitly enable sending. No automatic replay of the prepared backlog.

## Completion evidence for a workflow

Before closing a tracker item, demonstrate the main journey and its material failure paths with independently created synthetic data. Select meaningful checks proportional to the change:

- API persistence and correct patient/organization/encounter linkage.
- Assigned-role enforcement and relevant isolation boundaries.
- Interrupted requests, retries, stale changes, cancellations and recovery.
- Browser proof for the changed patient or employee journey, including appropriate desktop, tablet or mobile use.
- External integration evidence separately from mocks, local tests or a successful redirect.

Keep drafts or recoverable state when work fails. Display the known outcome and one clear next action. Do not place engineering or regulatory disclaimers throughout ordinary product screens.

## Handoff and tracker maintenance

Update the owning tracker row with the scoped change, source/revision, checks actually run, dated evidence link and remaining work. Distinguish implementation, local verification and external operation. Older evidence is a baseline to revalidate, not proof against a changed checkout. Keep detailed results in dated records and changing work status in the tracker.

No new licensing service, legal review workflow, live integration activation or deployment is created by this guide. Existing runtime access controls and repository data boundaries continue to apply.

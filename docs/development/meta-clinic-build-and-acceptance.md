# Meta Clinic Engineering Build and Acceptance Guide

Direction: [Product strategy](../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md). Work status: [Implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md). Architecture: [Software architecture](../architecture/software-architecture.md).

## Build complete journeys

Start each change with an observable patient or employee outcome. Identify the entry point, durable records, responsible role, handoffs, completion evidence and recovery action. Follow the existing [code-change workflow](../../agent-harness/workflows/code-change.md) and scoped repository instructions.

Use existing React frontend, Rails API, tenant boundaries and source-owned records. Extend the owning mechanism rather than creating parallel patient, balance, stock or workflow truths. For substantive healthcare workflow design, use the existing [standards procedure](healthcare-standards.md); standards inform data and behavior without automatically adding license-verification product features.

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

## Ownership, dependencies and attention

Every workflow must distinguish recorded status, responsibility, action prerequisites and urgency. Waiting is not automatically blocked; urgent work does not automatically block unrelated care. Do not implement a global patient-blocked flag from an unfinished task or earlier stage.

Distinguish an optional operational patient coordinator, responsibility for the current encounter, and ownership of each task. A shared team queue is valid ownership without a named individual. Assignment does not grant permissions or professional authority. Reuse existing work records and queues before adding a separate task system.

For every action document: authorized actor; responsible person/team; exact prerequisite and its owning record; blocked action; parallel actions still available; resolution action; due/attention rule; escalation recipient; completion evidence; and reassignment or coverage behavior. Clinical dependencies and urgency thresholds must come from an explicit clinician decision or defined clinic policy, with applicable source review. Do not invent blanket lab or treatment prerequisites.

### Workflow dependency and ownership matrix

This is the shared build matrix. Extend it for each feature; the rows define software behavior, not new clinical protocols or a claim that these controls are implemented.

Use the six columns below without combining **Action affected** with **What is blocked**. The former names the workflow operation; the latter states the precise prohibited transition. IDs are stable acceptance references, not a second task register. These are engineering planning cases; clinic-specific clinical prerequisites remain conditional until sourced and configured. Responsible parties name queues/roles to map to actual clinic configuration, not invented staff assignments.

#### Enrollment, membership and scheduling

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |
| EN-01: Under 18 at membership account creation | Public membership signup | Creating that account through UI or API | Staff-managed patient records; other workflows have no new age gate in this scope | Enrollment support | Explain restriction; no guardian-account workaround in this increment |
| EN-02: DOB is future, invalid, or implies age 150 or older | Saving DOB | Saving the invalid value, not all chart work | Correcting DOB and unrelated work; today's DOB is valid | Person entering data | Inline correction; calculate age from DOB using a defined date basis |
| EN-03: Account setup incomplete or verification pending | Account/checkout continuation | Only transitions requiring the existing account verification contract | Resume setup, verification recovery, staff contact | Enrollment support | Show exact missing step; inspect existing contract before changing it |
| EN-04: Possible duplicate identity | Linking an account or record | Automatic ambiguous linking or merging | Identity resolution and unrelated records | Registration team | Preserve both records and draft; no name-only merge |
| EN-05: Payment pending or outcome unknown | Membership activation | Claiming payment success or activating without verified evidence; unsafe repeat charge | Saved account, Growth follow-up, payment reconciliation | Billing team | Distinguish pending from failure; reconcile server evidence |
| EN-06: Payment failed, canceled or abandoned | Membership purchase | Activating the unpaid purchase | Resume eligible purchase, staff assistance, saved lead | Billing/Growth team | Visible follow-up according to clinic policy; no fabricated patient conversion |
| EN-07: Never-member prospect unpaid | Online appointment booking | Patient self-scheduling | Contact request and staff-assisted assessment; staff scheduling evaluated separately | Front desk/Growth | Explain membership requirement, not a patient-wide hold |
| EN-08: Former member without active membership | Online appointment booking | Patient self-scheduling | Request a call, renewal assistance, outstanding follow-up | Front desk/billing | Route callback to an owned queue |
| EN-09: Renewal failure or cancellation pending | Recurring membership status | Claiming renewal paid; benefits only as defined by effective membership policy | Billing recovery, clinical follow-up, record access under existing permissions | Billing team | Preserve paid-through/effective dates; grace periods remain a clinic/product decision |
| SC-01: Slot taken, provider unavailable or capacity exceeded | Appointment confirmation | Confirming the conflicting reservation | Alternate slots, request/callback, permitted staff work | Scheduling team | Explain conflict; recheck capacity atomically on save |
| SC-02: Cancellation or no-show | Appointment/encounter progression | Claiming attendance or completion that did not occur | Rebooking, outreach, unrelated tasks | Scheduling team | Track disposition and next contact; do not close clinical tasks automatically |
| SC-03: Walk-in waiting or no room assigned | Rooming/handoff | Claiming room assignment or accepted handoff without evidence | Registration, eligible intake, queue management | Front desk/nursing queue | Show waiting duration; escalation thresholds are configurable |

#### Intake, visits and documentation

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |
| CV-01: Intake incomplete, unknown or declined | Action requiring a particular answer | Only the action whose explicit prerequisite is unmet | Draft saving, other questions, scheduling and unrelated visit work | Intake team; clinical reviewer for clinical dependencies | Distinguish unanswered, unknown, declined and negative; identify exact resolver |
| CV-02: Conflicting or corrected intake information | Review of affected information | Treating conflicting data as reconciled | Preserve versions, clarification, unrelated documentation | Clinical review team | Reopen affected review only; record source and correction |
| CV-03: Patient/encounter identity mismatch | Writes to selected clinical context | Attaching clinical data to unresolved context | Safe draft recovery, identity correction, other patients' work | Current operator/support | Immediate correction; never silently relink |
| CV-04: Handoff awaiting acceptance | Transfer of encounter responsibility | Marking transfer accepted or dropping prior coverage prematurely | Sending/accepting handoff and independently authorized work | Current owner and receiving team | Display both parties and pending acceptance |
| CV-05: Required consent for a specific action absent or withdrawn | The consent-dependent action | That action under the established consent contract | Explanation, documenting decision, unrelated permitted work | Encounter team | Inspect existing consent/version process; no universal visit lock |
| CV-06: Telehealth join/media failure | Remote encounter connection | Claiming connected or completed encounter without evidence | Rejoin, staff contact, authorized rescheduling and documentation | Encounter team/support | Show connection failure separately from patient attendance |
| CV-07: Scribe permission absent or withdrawn | Recording/transcription | Starting or continuing capture where permission is required | Manual notes and the visit itself where otherwise permitted | Encounter clinician | Reuse existing consent process; no new child/guardian flow |
| CV-08: Scribe unavailable, processing failed or draft unreviewed | Scribe-assisted documentation | Treating generated text as reviewed/signed documentation | Manual charting, visit, retry where appropriate | Note author/reviewer | Keep recoverable draft and source; failure must not stall the visit |
| CV-09: Note unsigned or changed after review | Signing/finalizing note | Claiming signature for an unreviewed version | Draft correction and independent orders/tasks under their own rules | Authorized signing role | Bind signature to reviewed version; retain correction history |

#### Prescriptions, labs and fulfillment

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |
| RX-01: Required prescription data or destination missing | Prescription preparation/transmission | Marking ready or sending the incomplete prescription | Draft, destination selection, visits, labs and scheduling | Prescription support/prescriber | Identify exact missing field; detailed requirements need U.S./vendor mapping |
| RX-02: Review/signature missing or reviewed version changed | Prescription release | Releasing an unapproved/currently unreviewed version | Draft correction, renewed review, unrelated work | Authorized prescriber queue | Review applies to exact version; role does not validate licensure |
| RX-03: Prescription rejected or cancellation/change pending | Prescription lifecycle | Claiming acceptance, replacement or cancellation without evidence | Reconciliation, correction, patient contact and unrelated care | Prescriber/support queue | Preserve original and subsequent requests; avoid duplicate fulfillment |
| LB-01: Lab order draft or collection not completed | Lab order/collection | Claiming submission or collection without evidence | Prepare order, arrange collection, scheduling and visits | Ordering/collection team | Separate ordered, collected and received states |
| LB-02: Specimen rejected or recollection requested | Result-dependent work | Treating rejected specimen as a valid completed result | Recollection coordination, visits and unrelated work | Lab coordination/clinical team | Record source reason and owner; clinician defines affected decisions |
| LB-03: Results pending or only partially received | Lab-dependent decision | Only a decision explicitly requiring missing results | Scheduling, visits, notes, review of available results and unrelated orders | Ordering team; receipt-follow-up queue | Track expected items and due dates without inventing universal turnaround |
| LB-04: Results received, review pending | Result review | Marking review complete without review evidence | Scheduling and unrelated work | Assigned reviewer/clinical queue | Receipt is not review; retain source priority |
| LB-05: Critical result reported | Clinical handling | Only decisions explicitly dependent on its handling | Other work unless specifically restricted | Responsible clinician and coverage team | Immediate attention under clinic policy; acknowledgment is not completed handling |
| LB-06: Corrected result or overdue missing result | Result reconciliation/follow-up | Treating superseded results or missing items as final/complete | Review correction, chase receipt, other patient work | Clinical/lab coordination queue | Reopen affected work; preserve versions, source and escalation rule |
| LB-07: Review done, patient communication outstanding | Result follow-up | Marking patient communication completed without evidence | Further outreach, scheduling and unrelated care | Designated follow-up team | Track attempts, response and defined completion separately |
| IN-01: Insufficient stock or conflicting reservation | In-house fulfillment | Completing unavailable quantity or double-consuming stock | Visit, external-pharmacy planning and authorized alternatives | Inventory/medication team | Resolve quantity against source ledger; no automatic clinical substitution |
| IN-02: Lot expired/held or units incompatible | Stock selection/use | Consuming the affected lot or unsupported conversion | Select suitable stock, clarify units, unrelated care | Inventory team; clinician where needed | Visible reason; no inferred dose conversion |
| IN-03: Partial fulfillment, delivery or receiving | Order/fulfillment completion | Marking remaining quantity complete; equating carrier delivery with receipt | Record partial quantities, investigate remainder, follow-up | Fulfillment/receiving team | Preserve remaining balance and ownership |

#### Billing, follow-up, ownership and external connections

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |
| OP-01: Invoice draft or payment/refund unconfirmed | Financial posting/receipt | Claiming a posted balance, paid receipt or refund without owning evidence | Correct draft, reconcile payment and continue unrelated care | Billing team | Preserve amount/version and retry identity; do not duplicate money movement |
| OP-02: Follow-up required but unscheduled/unassigned | Follow-up completion | Claiming follow-up arranged/completed | Scheduling, outreach, assignment and other tasks | Follow-up team or assignment-exception queue | Encounter closure must leave task visible |
| OP-03: Outreach failed or patient has not responded | Patient communication | Treating queued/sent as delivered or patient-confirmed | Further permitted outreach, contact correction, other work | Owning outreach team | Track attempts and clinic-defined escalation; no invented contact cadence |
| OP-04: Individual task unclaimed but team assigned | Task ownership | Nothing solely because an individual has not claimed it | Authorized team claim, completion and other work | Responsible team queue | Escalate overdue work under configured policy |
| OP-05: No eligible team, owner unavailable or privileges revoked | Assignment/coverage | Unauthorized action or silently discarding responsibility | Authorized reassignment, exception handling and unrelated work | Configured coverage/assignment-exception queue | Visible exception; no fabricated fallback owner or privilege gain |
| OP-06: Missing vendor connection | External execution | Actual external transmission and claims of external success | Persist, review, prepare and source-labeled manual records | Owning operations team | Show disconnected; connection must not auto-send backlog |
| OP-07: Timeout after possible submission; outcome unknown | Retry/reconciliation | Blind duplicate submission or claiming definite failure/success | Reconcile identifiers/status, contact support, unrelated local work | Owning operations team | Outcome unknown is distinct from disconnected and rejected |
| OP-08: Vendor rejects request or source changed after preparation | External request correction | Resending invalid/stale request as though unchanged approval applies | Correct, remap and obtain applicable renewed review | Domain owner/integration team | Preserve error/source/version; confirm actual vendor contract |
| OP-09: Coverage saved but eligibility/authorization unverified | Insurance workflow | Claiming verified coverage/authorization or external acceptance | Data collection, request preparation, cash-pay core and unrelated care | Insurance/billing team | Payment expectations and service-specific policies remain explicit, not universal visit gates |
| OP-10: Save failure, stale edit, duplicate/out-of-order event | Record transition | False saved/completed state, silent overwrite or duplicate side effects | Draft recovery, refresh/reconcile and independent work | Current operator; support for persistent failure | Display known outcome and next action; preserve history |
| OP-11: Dependency cycle or missing source record | Dependency evaluation | Accepting a cycle or treating unresolved prerequisite as satisfied | Correct configuration, restore valid reference, unrelated tasks | Configuration/domain owner | Visible exception; never strand work behind an invisible dependency |
| OP-12: Encounter closed with outstanding work | Encounter/task lifecycle | Auto-completing child labs, prescriptions, billing or follow-ups | Owned tasks, permitted corrections and future visits | Each task's existing team | Closed encounter must remain discoverable from open tasks |

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

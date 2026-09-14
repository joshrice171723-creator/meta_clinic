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

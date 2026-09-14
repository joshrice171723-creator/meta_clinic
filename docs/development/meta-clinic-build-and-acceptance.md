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

## Completion evidence

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

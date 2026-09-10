# Cash-based ambulatory user-workflow and data-model review

**Reviewed:** 2026-09-10

**Code baseline:** committed `main` at `3713fca` plus the clinic-model selection slice documented separately in this branch.

**Scope:** what front-desk staff, nurses/MAs, clinicians, billing staff, and patients can actually do in Meta Clinic. Hosting, CI, legal review, contracts, and cloud operations are excluded from the score.

## Decision summary

Meta Clinic should be configured around a stable ambulatory core, then shaped to each clinic with optional modules. A cash-based clinic does not become a smaller product: patients, scheduling, encounters, charting, cash prices, estimates, invoices, receipts, card payments, refunds, credits, packages, and memberships remain on. Insurance is optional and defaults off.

The committed application now has unusually broad cash-clinic operations and a meaningful nurse/clinical workflow. Its largest remaining user-facing weakness is fragmentation: refills, cross-role work, digital forms, waitlists, and recall/care-gap work do not yet have equally durable queues and ownership.

## Ten user-workflow scores

| Workflow | Score | What works now | Highest-value gap |
| --- | ---: | --- | --- |
| Registration and patient identity | 75 | Patient creation, identity controls, contact data, registration recovery | Patient-entered forms and reusable intake answers |
| Scheduling, arrival, and room flow | 84 | Appointments, status transitions, requests, facilities, tracking board | Capacity templates, waitlist, cancellation-fill workflow |
| Nurse/MA intake and handoff | 86 | Intake ownership, structured vitals/history, nurse workspace, handoffs, tasks | One role-focused inbox spanning all assigned work |
| Clinician chart and encounter completion | 87 | Longitudinal chart, notes/signing, diagnoses, plans/goals, procedures, follow-up | Tighter exception-driven closure and reusable protocol views |
| Medications, refills, and immunizations | 76 | Medication history/statements, administrations, immunization records | Closed-loop refill request queue with approve/deny/notify states |
| Orders, results, and referrals | 83 | Service requests, lab review/follow-up, referrals and document review | Unified outstanding-order/result/referral worklist |
| Checkout, payment, and follow-up | 86 | Estimates/invoices, card and cash flows, receipts, refunds, credits, follow-up | A single guided checkout checklist for staff |
| Cash services, packages, and memberships | 89 | Service catalog, packages, memberships/subscriptions, billing operations | Better front-desk visibility into package balance and next charge |
| Patient portal, communications, and forms | 77 | Portal access/recovery, billing history, appointment requests, messaging/reminders | Digital forms, consents, education, and refill requests |
| Daily clinic operations | 82 | Tracking, tasks, telehealth, inventory and staff operations | A unified work inbox and workload-aware assignment |
| **Equal-weight application score** | **81/100** | Strong cash-pay ambulatory breadth | Close the five workflow loops below |

Scores reflect code and locally inspectable workflow structure, not a hosted or real-patient acceptance claim.

## What comparable products teach us

- [Hint](https://www.hint.com/) groups membership plans, invoicing, payments, charting, scheduling, tasks, messaging, labs and referrals around direct-care operations. The lesson is that membership billing is part of the core day, not a detached finance product.
- [Elation Direct Primary Care](https://www.elationhealth.com/who-we-serve/primary-care/direct-primary-care/) combines recurring ACH/card membership collection, failed-payment alerts, self-enrollment, charting, referrals, intake, portal and telehealth. The lesson is closed-loop exception handling: staff need to see what failed and what must happen next.
- [Jane](https://jane.app/) combines booking, reminders, forms, charting, messaging, telehealth, payments and memberships. The lesson is continuity between what the patient completes and what the clinic sees at the visit.
- [AHRQ's workflow assessment toolkit](https://digital.ahrq.gov/health-it-tools-and-resources/workflow-assessment-health-it-toolkit) emphasizes examining how work actually moves among people and systems. A feature existing somewhere is not enough when users must reconstruct ownership and status themselves.
- [ONC SAFER Guides](https://www.healthit.gov/topic/safety/safer-guides) frame safe EHR use around organizational responsibilities and operational practices. For this software review, that supports explicit owners, states, acknowledgements, and recoverable handoffs in the product.
- Published nursing research associates interruptions and task switching with documentation burden ([PubMed 33936464](https://pubmed.ncbi.nlm.nih.gov/33936464/)). That matches the main Meta Clinic risk: too many separate destinations for work that should arrive in one prioritized queue.

Vendor pages describe vendor claims and market patterns; they are not independent proof of clinical quality. The Meta Clinic scores above come from repository inspection.

## Data-placement review

Meta Clinic is strongest where a field belongs to a durable object with an owner and lifecycle: appointment state, encounter intake, observations, signed-note revisions, requests/orders, results review, handoffs, tasks, invoice/payment events, package or membership state, and follow-up work.

The rule for every screen should be:

1. Registration stores stable identity and contact facts.
2. Pre-visit forms store patient-authored submissions and provenance.
3. Intake stores encounter-specific answers and structured observations.
4. The longitudinal chart stores reusable conditions, allergies, medication history, immunizations, procedures, goals, and reviewed documents.
5. Orders/referrals own requested, scheduled, completed, resulted, reviewed, and patient-notified states.
6. Checkout owns the estimate-to-payment-to-receipt path and unresolved follow-up.

Avoid storing reusable clinical facts only inside note text. Avoid asking registration to own visit-specific symptoms. Avoid showing a result, refill, referral, or payment exception without an assignee and next state.

## Meta Clinic configuration model

### Always-on core

Patients, scheduling, encounters, clinical chart, cash pricing, estimates, invoices, receipts, card payments, refunds, credits, packages, and memberships.

These capabilities must remain usable regardless of insurance selection.

### Optional insurance module

`insurance_workflows_enabled` defaults to `false` and is selected during clinic setup under Facilities. Turning it on means the clinic expects coverage, eligibility, prior authorization, claim, remittance/EOB/ERA, denial, copay/deductible, and payer-balance workflows. Turning it off must hide those payer-specific workflows without disabling cash billing.

The current slice establishes the versioned tenant-level selection and exposes it in clinic context. Existing payer data objects are not yet comprehensively hidden or rejected by this flag; each future or existing insurance route must enforce the same selection before the module can be called fully gated.

| Clinic type | Core cash features | Insurance workflows |
| --- | --- | --- |
| Cash-only / DPC | On | Off by default |
| Hybrid cash + insurance | On | On |
| Insurance-focused ambulatory | On | On |

## Highest-value next five

1. **Closed-loop refill workflow:** patient/staff request, medication reconciliation, approve/deny/change, pharmacy destination, notification, exception recovery.
2. **Unified clinic work inbox:** tasks, handoffs, unsigned items, results, referrals, refills, messages, failed payments and follow-ups grouped by role, urgency, owner and due time.
3. **Digital forms and education:** versioned form templates, patient submissions, signatures/consent state, chart filing, review acknowledgement and reusable structured answers.
4. **Capacity and waitlist workflow:** provider/site templates, blocked time, waitlist ranking, cancellation offer, acceptance/expiry and slot recovery.
5. **Recall and care-gap workflow:** due-rule projection, outreach attempt, snooze/exclusion reason, completion evidence and population-to-patient drill-down.

Implementing these as durable workflows—not isolated screens—should move the application-only pilot score from roughly 81 toward the high 80s. The refill loop and unified inbox have the highest immediate nurse and clinic-day value.

---
type: strategy
status: proposal-hypotheses-open
updated: 2026-09-11
---
# Pricing Strategy

Home: [[00 Home]] · Offer: [[Customer and Offer]] · Economics: [[Business Model]] · Boundary: [[Entity and Product Boundary]]

## Purpose

This note turns the current product direction into testable pricing hypotheses. It is not an approved rate card, customer quote, financial forecast, clinical-use authorization or legal opinion. All dollar amounts are illustrative U.S. launch hypotheses and must be tested against actual delivery time, support burden, buyer response and the final entity/contracts.

## Recommended commercial model

Use a hybrid model with two clearly separated revenue streams:

1. **Consultancy:** a fixed-scope, high-touch clinic-launch fee with explicit milestones and exclusions.
2. **Software:** a per-clinic recurring subscription with a separately priced implementation/onboarding service.

This matches the value currently being built: the consultancy reduces launch coordination and setup burden, while the software organizes day-to-day clinic operations. Price the initial offer around the clinic and its operating outcome, not around a large number of staff seats.

Do not lead with a percentage of patient-care revenue, a transaction-based charge or an undefined variable fee. The current [[Business Model]] leaves some recurring software mechanics open; those mechanics need their own billing specification, cost model and professional review before becoming customer-facing pricing.

## What the build can support as a value story

Current implementation evidence supports describing a broad ambulatory operations foundation, including:

- patient, appointment, encounter and tracking-board workflows;
- staff and provider workspaces with role-scoped access;
- structured SOAP drafting and revision/signing surfaces;
- lab, refill, recall, reminder and follow-up worklists;
- cash-pay billing foundations, checkout, invoices, receipts, packages and memberships;
- inventory, supplier pricing, receiving, counts, holds and ledger history; and
- clinic configuration, synthetic staging and implementation-specialist boundaries.

The product should not yet be sold as a fully accepted production EHR or as a completed clinical, security, privacy or regulatory solution. Real-data release, professional review, hosted acceptance, broad recovery evidence and some workflow-specific hardening remain separate gates. The first commercial promise should therefore be **configured clinic operations and implementation support**, not an unqualified compliance or care-delivery claim.

## Proposed package ladder

### 1. Launch Readiness Workshop — optional scoping offer

| Item | Hypothesis |
| --- | --- |
| Price | $750–$1,500 one time |
| Buyer | NP/PA founder who needs a bounded launch plan before committing |
| Includes | Structured intake, clinic profile, applicability questions, prioritized launch plan and a written scope for the full build |
| Excludes | Legal, accounting, clinical, filing and purchasing work; guarantees of approval or opening |
| Conversion rule | Credit 100% toward Launch Build if purchased work begins within 30 days |

This is an optional paid scoping step, not the main offer. The main direction remains a done-for-you launch package rather than an assessment-only business.

### 2. Launch Build — core consultancy offer

| Item | Hypothesis |
| --- | --- |
| Price | $8,000–$15,000 fixed fee |
| Includes | Clinic intake, tailored launch packet, agreed administrative setup, starter SharePoint workflow, implementation coordination, handoff, basic training and a defined post-handoff support period |
| Payment idea | 50% at kickoff, 30% at configured-workflow review, 20% at handoff |
| Best fit | One new cash-pay primary-care or concierge-adjacent clinic with a bounded initial scope |
| Must be explicit | Client decisions/signatures, third-party costs, expert responsibilities, change orders, cancellation and what “ready” means |

Attorney, filing, accounting, premises, insurance, equipment, supplies, vendor and other outside charges should be listed separately unless the final contract explicitly says otherwise. Kevin's physician services and mentorship should not be silently bundled until contracting, scope, capacity and backup arrangements are defined.

### 3. Launch Build + Managed Start — higher-touch consultancy offer

| Item | Hypothesis |
| --- | --- |
| Price | $14,000–$25,000 implementation fee plus $1,500–$3,000/month after handoff |
| Adds | First 60–90 days of operating support, scheduled office hours, staff workflow tuning, issue triage, training refresh and a monthly operating review |
| Best fit | Founders who want a launch operator rather than a packet and one-time handoff |
| Boundary | Support hours, response times, channels, escalation and excluded professional decisions must be written into the agreement |

This package is likely the strongest near-term consultancy margin opportunity, but only if delivery hours and rework are measured. Do not promise unlimited support inside a fixed fee.

### 4. Clinic Ops Core — software subscription

| Item | Hypothesis |
| --- | --- |
| Price | $249–$399 per clinic/month plus $1,500–$3,500 onboarding |
| Includes | Clinic workspace, patient and appointment foundation, encounter/tracking board, staff/provider work areas, core permissions, basic cash-pay workflow and standard support |
| Pricing unit | One clinic; include ordinary administrative users; define provider and site limits separately if needed |
| Best fit | A small cash-pay clinic that wants a practical operational system without a large enterprise contract |

The per-clinic unit fits the current one-clinic-per-login implementation boundary better than a complex multi-site plan. It also avoids making front-desk and support staff a pricing penalty when they are essential to the workflow.

### 5. Clinic Ops Plus — software plus implementation depth

| Item | Hypothesis |
| --- | --- |
| Price | $499–$799 per clinic/month plus $3,500–$7,500 onboarding |
| Adds | Billing and checkout configuration, packages/memberships, reminders, lab/refill/recall worklists, inventory workflows, role-specific training and quarterly configuration review |
| Best fit | A clinic with enough operational volume to value one connected workspace and ongoing configuration help |
| Boundary | Each module must be released and accepted for the intended use before it is included in a live plan |

This is the likely flagship software package. It should be sold as a configurable ambulatory operations platform, not as a promise that every selected clinical service is production-ready.

### 6. Founding Clinic Partner — controlled learning offer

| Item | Hypothesis |
| --- | --- |
| Price | $4,500–$7,500 onboarding plus $249–$399/month for a six-month founding term |
| Exchange | Discounted rate for a tightly bounded scope, scheduled feedback, permission to use anonymized outcome/testimonial material only if separately approved, and a defined reference call if the clinic chooses |
| Limit | Cap the cohort at three to five clinics and do not promise custom development inside the subscription |
| Use | Design-partner or controlled pilot pricing; not a substitute for production, professional or real-data acceptance |

This creates early paid evidence without permanently anchoring the product at a discount. The founding rate should have an expiration date and a documented conversion price.

### 7. Custom / multi-site — later, quote only

| Item | Hypothesis |
| --- | --- |
| Price | Custom quote after discovery and cost review |
| Could include | Multiple clinic entities, migration, custom integrations, dedicated training or a negotiated support response |
| Do not sell yet as standard | The current product is not a finished multi-site commercial package, and multi-site data, identity, migration, support and release boundaries need additional evidence |

## Alternative pricing strategies

| Strategy | Advantage | Risk | Recommendation |
| --- | --- | --- | --- |
| Flat per clinic | Simple to explain and aligns with the buyer's operating unit | Can underprice unusually large clinics | Recommended starting point; add clear provider/site bands later |
| Per provider | Familiar to EHR buyers and scales with clinical capacity | Penalizes growth and ignores the staff who run the work | Use only if provider support is the main cost driver |
| Modular add-ons | Lets a small clinic start narrow and expand | Creates packaging confusion and fragmented workflows | Keep to two or three meaningful modules, not feature-by-feature billing |
| Usage-based | Can align price to activity | Forecasting, reconciliation and disputes become harder | Defer until usage data and billing mechanics are proven |
| Managed-service retainer | Monetizes configuration, training and operational help | Support can become unbounded labor | Offer with explicit hour/response limits |
| Annual prepay | Improves cash collection and retention | Too early if the buyer has not seen value | Offer a modest discount only after onboarding is repeatable |

## Pricing guardrails

- Keep consultancy invoices and software invoices distinguishable until the entities, contracts, IP, support and data responsibilities are settled.
- Publish what is included, what is excluded and what requires a change order.
- Pass through outside professional and vendor costs transparently; do not assume markup or reimbursement.
- Never use patient-care revenue as the price basis for the software.
- Do not use “HIPAA-compliant,” “clinically approved,” “ready to prescribe” or similar claims without the applicable evidence and review.
- Set support limits. A reasonable starting hypothesis is two hours/month in Core and five hours/month in Plus, with separately quoted excess work.
- Offer a 10% annual-prepay discount only after monthly support cost, churn risk and cash needs are known.
- Keep implementation pricing separate from future migration, custom integration and professional-service work.

## First pricing experiments

Run three short, scoped tests with actual prospective buyers:

1. Present Launch Build at $9,500 and $14,500 as two scopes; record which deliverables create objections.
2. Present Clinic Ops Core at $299/month and Ops Plus at $599/month, each with a written onboarding fee; ask for a paid pilot or deposit rather than an expression of interest.
3. Present the Founding Clinic Partner offer to no more than five qualified clinics; measure time-to-configure, training hours, support requests, requested exceptions and willingness to renew at the non-founding price.

For every test, record buyer type, clinic stage, scope shown, price, response, objection, commitment, expected delivery hours and outside costs. “Interested” is not a sale; a paid deposit or signed scoped engagement is stronger evidence.

## Decisions still required

- Which entity invoices launch work, software access, implementation and ongoing support?
- Is the starter SharePoint workflow included in every launch package or only in a defined tier?
- What exactly is included in Kevin's physician support and mentorship, and who contracts for it?
- What are the implementation completion criteria and client acceptance steps?
- What are the software support hours, response targets, data-export/exit terms and cancellation rules?
- Which clinical, billing, inventory and integration modules are accepted for live use at the time each package is sold?
- What delivery-hour and infrastructure assumptions make each proposed price profitable?

## External market anchors

These are directional references, not direct competitors or an apples-to-apples valuation. Jane publicly lists U.S. plans at $54, $79 and $99 per month, with higher-tier scheduling, packages/memberships and add-ons. [Jane pricing](https://jane.app/pricing?locale=en-US) CharmHealth lists a free plan, $0.50 per encounter with a $25 monthly minimum, or $200 per provider/month. [CharmHealth pricing](https://www.charmhealth.com/ehr/ehr-pricing-us.html) Tebra publishes a broader range from $49 to $799 per provider/month, with bundles priced by provider type and configuration. [Tebra pricing](https://www.tebra.com/pricing/overview)

The proposed APPly ranges sit above basic scheduling/practice-management pricing because they include implementation and configuration value, while remaining below a large-enterprise positioning. Actual willingness to pay and margin remain unknown until paid discovery and delivery measurement occur.

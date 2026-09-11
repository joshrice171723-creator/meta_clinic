---
type: strategy
status: proposal-hypotheses-open
updated: 2026-09-11
---
# Pricing Strategy

Home: [[00 Home]] · Offer: [[Customer and Offer]] · Economics: [[Business Model]] · Boundary: [[Entity and Product Boundary]]

## Current commercial direction

Meta Clinic is a configurable ambulatory software product for NP- and PA-led cash-pay clinics. The current model does not include a general consultancy or a done-for-you clinic-launch service. A software-led Implementation Specialist, or FDE, is the paid implementation layer: the FDE configures the clinic, leads approved integrations and migration work, validates the result with clinic staff, and hands the workspace to clinic ownership.

This note contains testable U.S. pricing hypotheses, not approved rates, a customer quote, a financial forecast, clinical-use authorization or a legal opinion. Final pricing depends on measured implementation time, support burden, data-migration complexity, buyer response, entity structure and release evidence.

## Recommended model

Use a simple hybrid model:

1. A recurring per-clinic software subscription.
2. A separate fixed-scope onboarding and FDE integration fee.
3. Optional, bounded configuration and support retainers after handoff.

Price around the clinic and its operating outcome rather than a large number of staff seats. Include ordinary administrative users where they are necessary to operate the clinic; define provider, site and integration limits explicitly.

Do not lead with patient-care revenue sharing, transaction-based pricing or an undefined variable fee. Any additional variable software mechanic needs a separate billing specification, cost model and professional review before it becomes customer-facing.

## Value story supported by the current build

Current implementation evidence supports a broad ambulatory operations foundation, including:

- patient, appointment, encounter and tracking-board workflows;
- staff and provider workspaces with role-scoped access;
- structured SOAP drafting and revision/signing surfaces;
- lab, refill, recall, reminder and follow-up worklists;
- cash-pay billing foundations, checkout, invoices, receipts, packages and memberships;
- inventory, supplier pricing, receiving, counts, holds and ledger history; and
- clinic configuration with a bounded implementation-specialist role.

The strongest positioning is not that the product is merely customizable. Tebra is a direct comparator with configurable practice-management, EHR, billing and patient-engagement bundles. Meta Clinic needs to win on a narrower, more concrete experience: a focused cash-pay ambulatory operating model, fast FDE-led configuration and migration, and workflows designed around the way a small NP/PA-led clinic actually operates.

The product should not yet be sold as a fully accepted production EHR or as a completed clinical, security, privacy or regulatory solution. Real-data release, professional review, hosted acceptance, broad recovery evidence and workflow-specific hardening remain separate gates.

## Proposed package ladder

### Clinic Ops Core

| Item | Hypothesis |
| --- | --- |
| Price | $249-$399 per clinic/month plus $1,500-$3,500 onboarding |
| Includes | Patient and appointment foundation, encounters, tracking board, staff/provider work areas, core permissions and basic cash-pay operations |
| Best fit | One small cash-pay clinic with a bounded operating scope |
| Pricing unit | One clinic; ordinary administrative users included |

### Clinic Ops Plus

| Item | Hypothesis |
| --- | --- |
| Price | $499-$799 per clinic/month plus $3,500-$7,500 onboarding |
| Includes | Core plus billing and checkout configuration, packages/memberships, reminders, lab/refill/recall worklists, inventory workflows and role-specific training |
| Best fit | A clinic that wants one connected operating workspace and continuing configuration help |
| Pricing unit | One clinic with explicit provider, site and module limits |

### FDE Integration and Migration

| Item | Hypothesis |
| --- | --- |
| Price | $3,000-$6,000 simple; $7,500-$15,000 standard; complex work quoted after discovery |
| Includes | Source-system discovery, data inventory, field mapping, integration or import setup, dry run, reconciliation, staff validation and handoff |
| Best fit | A clinic moving from an existing EHR, practice-management system or set of operational tools |
| Pricing basis | Source count, data volume, mapping complexity, integration method, validation effort and cutover risk; not patient-care revenue |

### Founding Clinic Partner

| Item | Hypothesis |
| --- | --- |
| Price | $249-$399 per clinic/month for six months plus an agreed onboarding/FDE fee |
| Exchange | Tightly bounded scope, scheduled feedback, measurable workflow outcomes and a documented conversion price |
| Limit | Three to five clinics maximum; no unlimited custom development |
| Use | Paid design-partner evidence, subject to the applicable production and real-data gates |

### Managed Configuration Support

| Item | Hypothesis |
| --- | --- |
| Price | $500-$1,500 per clinic/month as an optional retainer |
| Includes | Scheduled configuration hours, workflow review, release-readiness coordination and support triage |
| Boundary | Publish hours, response targets, channels, escalation and excluded clinical/professional decisions |

### Multi-site and enterprise

Quote only after multi-site identity, data, migration, support, exit and release boundaries are proven. It is not a standard package yet.

## Alternative strategies

| Strategy | Advantage | Risk | Recommendation |
| --- | --- | --- | --- |
| Flat per clinic | Simple and aligned with the buyer's operating unit | Can underprice unusually large clinics | Recommended starting point |
| Per provider | Familiar to EHR buyers | Penalizes growth and ignores operational staff | Use only if provider support drives most cost |
| Modular add-ons | Lets a clinic expand gradually | Can fragment the product and confuse buyers | Keep to two meaningful tiers plus FDE |
| Usage-based | May align to activity | Creates forecasting, reconciliation and dispute work | Defer until usage evidence exists |
| FDE retainer | Monetizes configuration and integration expertise | Can become unbounded labor | Use written hour and response limits |
| Annual prepay | Improves cash collection | Too early before value is demonstrated | Offer a modest discount after onboarding is repeatable |

## Pricing guardrails

- Keep software, onboarding and FDE integration deliverables distinguishable in the customer agreement and invoice.
- State what is included, what is excluded and what requires a change order.
- Treat migration of real patient or clinical data as a gated implementation activity, not a routine import promise.
- Do not use unverified compliance, clinical-approval or prescribing-readiness claims in pricing or sales material.
- Set support limits. A starting hypothesis is two hours/month in Core and five hours/month in Plus, with extra work quoted separately.
- Keep custom integrations, migration beyond the defined tier and professional services outside the base subscription.
- Offer a 10% annual-prepay discount only after support cost, churn risk and cash needs are known.

## First pricing experiments

1. Test Core at $299/month and Plus at $599/month with written onboarding fees.
2. Present simple and standard FDE migration scopes to three qualified clinics and record source systems, mapping effort, validation hours and objections.
3. Offer the founding rate to no more than five clinics and measure renewal interest at the non-founding price.

For each test, record buyer type, clinic stage, scope, price, response, objection, paid commitment, delivery hours, migration complexity and outside costs. Interest is not a sale; a deposit or signed scoped engagement is stronger evidence.

## Decisions still required

- Which legal entity invoices software, onboarding and FDE integration?
- What data sources and import methods are supported in each FDE tier?
- What access, agreements, security controls and release evidence are required before real-data migration?
- What is the FDE's approved access model, and how is migration authority separated from ordinary clinic administration?
- What are support hours, response targets, data export, cancellation and exit terms?
- Which modules are accepted for live use when each package is sold?
- What delivery-hour and infrastructure assumptions make each price profitable?

## External market anchors

These are directional references, not an apples-to-apples valuation. [Jane pricing](https://jane.app/pricing?locale=en-US) publicly lists U.S. plans at $54, $79 and $99 per month. [CharmHealth pricing](https://www.charmhealth.com/ehr/ehr-pricing-us.html) lists a free plan, $0.50 per encounter with a $25 monthly minimum, or $200 per provider/month. [Tebra pricing](https://www.tebra.com/pricing/overview) publishes a broader range from $49 to $799 per provider/month, depending on provider type and platform configuration.

Meta Clinic should not compete by claiming generic configurability. The defensible test is whether a small cash-pay clinic gets to a validated, usable operating workspace faster and with less integration friction than it would using a broader platform.

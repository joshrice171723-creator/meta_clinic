---
type: strategy
status: proposal-hypotheses-open
updated: 2026-09-11
---
# Pricing Strategy

Home: [[00 Home]] · Offer: [[Customer and Offer]] · Economics: [[Business Model]] · Boundary: [[Entity and Product Boundary]]

## Scope of this pricing view

This is the pricing hypothesis for the **fully completed product**, not a recommendation for the current build or an immediate customer quote. The mature product assumed here is a complete ambulatory operating platform for NP- and PA-led cash-pay clinics, including clinical charting, scheduling, patient access, billing and checkout, memberships/packages, retail-pharmacy e-prescribing, supplier purchasing, inventory control and supported third-party integrations.

Examples such as routing prescriptions to Walgreens and connecting to suppliers are future-state capability assumptions for this pricing exercise. They are not current implementation or production-readiness claims. Each pharmacy, prescribing, supplier, data, security and release dependency would still require its own approved integration and acceptance evidence.

The commercial model has no general consultancy or done-for-you clinic-launch service. An FDE is the paid implementation layer: it configures the clinic, leads approved integrations and migration work, validates the result with clinic staff and hands the workspace to clinic ownership.

## Product position at maturity

Tebra is a direct comparator. Its public offering combines configurable practice management, EHR, billing and patient-engagement capabilities. Customizability is therefore table stakes, not the main differentiator. Meta Clinic should earn a premium by combining a focused cash-pay ambulatory workflow with FDE-led migration, retail-pharmacy prescribing, supplier purchasing and inventory operations in one coherent workspace.

The mature value story is time-to-operational-use, reduced system sprawl and a clinic-specific workflow that remains configurable without turning every request into custom development. Pricing should reflect the operational value and implementation burden of a serious ambulatory platform, not anchor on the current prototype or on low-cost scheduling software.

## Recommended mature model

1. A recurring per-clinic platform subscription.
2. Provider and site bands that make scale predictable without charging every staff member a seat fee.
3. A separate fixed-scope FDE integration and migration fee.
4. Optional managed configuration/support after handoff.
5. Vendor pass-through or separately stated charges for regulated or external services when those costs are not controlled by Meta Clinic.

Avoid patient-care revenue sharing and undefined transaction percentages. Keep software, implementation, external vendor charges and optional support distinguishable in the agreement and invoice.

## Mature package ladder

### Practice Core

| Item | Future-state hypothesis |
| --- | --- |
| Price | $799-$1,299 per clinic/month; $5,000-$10,000 one-time FDE onboarding |
| Includes | Scheduling, patient access, encounters, configurable clinical charting, retail-pharmacy e-prescribing where supported, staff/provider workspaces, permissions, cash-pay checkout, invoices, receipts and basic reporting |
| Best fit | One-site clinic with one to two prescribing providers and a focused service scope |
| Limits | Defined provider/site counts, supported pharmacy connection, standard workflows and standard integrations |

### Practice Growth

| Item | Future-state hypothesis |
| --- | --- |
| Price | $1,499-$2,499 per clinic/month; $10,000-$20,000 one-time FDE onboarding |
| Includes | Core plus memberships/packages, patient portal, reminders, refills/recalls, lab coordination, advanced billing/checkout, supplier purchasing, inventory controls, reorder workflows, analytics and broader integration support |
| Best fit | A growing clinic that wants clinical, financial and inventory operations connected |
| Limits | Defined provider/site counts, supplier/API scope, inventory locations and support hours |

### Practice Pro / Multi-site

| Item | Future-state hypothesis |
| --- | --- |
| Price | $2,500-$4,500 per clinic/month or site-group/month; $20,000-$40,000 one-time FDE onboarding |
| Includes | Growth plus multi-site controls, advanced purchasing and inventory, supplier-specific integrations, cross-site reporting, stronger workflow configuration, priority support and implementation governance |
| Best fit | Multi-provider or multi-site operators with meaningful purchasing, inventory and reporting complexity |
| Limits | Contracted sites, providers, integrations, service levels, data retention/export and change-control boundaries |

### Enterprise / network

| Item | Future-state hypothesis |
| --- | --- |
| Price | $5,000+/month, quoted after discovery; implementation generally $40,000+ |
| Includes | Contracted network scale, enterprise identity and reporting, custom rollout governance, dedicated FDE capacity and negotiated service levels |
| Gate | Only after multi-tenant isolation, support economics, security, uptime, integration ownership, exit and release evidence are proven |

### FDE integration and migration

| Scope | Future-state price hypothesis |
| --- | --- |
| Simple | $5,000-$10,000: one source, clean export, standard mapping and one validated import |
| Standard | $10,000-$20,000: multiple sources or custom mapping, reconciliation, staff validation and guided cutover |
| Complex | $20,000-$40,000+: custom APIs, multiple sites, incomplete/high-volume data or difficult rollback requirements |
| Bespoke | Quote after discovery; use a change order for new sources, new data domains, custom transformations or repeated failed exports |

The FDE fee is based on source count, data volume, mapping complexity, integration method, validation effort, cutover risk, vendor coordination and expected FDE hours. It is not based on patient-care revenue.

## Add-ons and commercial mechanics

| Add-on | Mature approach |
| --- | --- |
| Additional provider | $150-$300/provider/month, or include the next provider band in the contracted tier |
| Additional site | $500-$1,000/site/month when the site has independent operations, inventory or reporting needs |
| Managed configuration | $1,000-$3,000/clinic/month for defined hours, release coordination and workflow support |
| Advanced external integration | Fixed implementation fee plus vendor pass-through when applicable; do not hide external cost in an unlimited promise |
| Annual prepay | 8%-12% discount only after churn, support burden and cash needs are measured |

## Why this is not starter-app pricing

If the finished system reliably supports clinical operations, pharmacy prescribing, supplier purchasing, inventory, billing and patient access, the buyer is replacing several operational systems and taking on a high-trust workflow. A price below roughly $800 per clinic/month would risk underpricing the platform, integration ownership and support burden. The actual rate should be set by demonstrated reliability, vendor costs, implementation hours, support demand and customer willingness to pay—not by the current prototype's feature count.

## Pricing guardrails

- Keep software, onboarding and FDE integration deliverables distinct in the agreement and invoice.
- State exactly which pharmacy, prescribing, supplier, inventory, billing, portal and reporting capabilities are included in each tier.
- Treat real patient or clinical data migration as a gated implementation activity, not a routine import promise.
- Do not use unverified compliance, clinical approval, prescribing-readiness or vendor-availability claims in sales material.
- Define provider, site, integration, inventory-location, support-hour, response-time, export and cancellation limits.
- Use change orders for unsupported integrations, new data domains, custom development and additional cutover attempts.
- Keep professional, clinical, legal, accounting and credential decisions outside the FDE role.

## Validation plan before publishing rates

1. Prove the mature feature set with supervised synthetic workflows, including prescribing and purchasing simulations; do not use the price model as evidence that those capabilities are complete.
2. Measure implementation hours and exceptions across representative source systems and clinic sizes.
3. Confirm vendor, pharmacy and supplier fees, credentialing requirements and support obligations.
4. Test the package ladder with qualified clinics using deposits or signed scoped engagements as the strongest commercial evidence.
5. Recalculate gross margin, support capacity, churn sensitivity and payback before publishing a price page.

## External market anchors

These are directional references, not an apples-to-apples valuation. [Jane pricing](https://jane.app/pricing?locale=en-US) publicly lists U.S. plans at $54, $79 and $99 per month. [CharmHealth pricing](https://www.charmhealth.com/ehr/ehr-pricing-us.html) lists a free plan, an encounter plan and a $200 per provider/month plan. [Tebra pricing](https://www.tebra.com/pricing/overview) publishes a broader range from $49 to $799 per provider/month, depending on provider type and platform configuration.

Meta Clinic should not compete by claiming generic configurability. The defensible test is whether a mature product gives a small clinic a reliable, connected operating workspace faster and with less migration friction than a broader platform or a collection of point solutions.

## Decisions still required

- Which legal entity invoices software, onboarding and FDE integration?
- Which pharmacy, prescribing, supplier and inventory integrations are supported and who owns each external contract?
- What access, agreements, security controls and release evidence are required before real-data migration or live prescribing?
- What are support hours, response targets, data export, cancellation, uptime and exit terms?
- What delivery-hour, vendor-cost and infrastructure assumptions make each tier profitable?

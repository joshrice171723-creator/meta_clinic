---
type: business-model
status: software-and-fde-model-rates-open
updated: 2026-09-11
---
# Business Model

Home: [[00 Home]] · Offer: [[Customer and Offer]] · Pricing: [[Pricing Strategy]] · Boundary: [[Entity and Product Boundary]]

## Current business boundary

Meta Clinic is a software product for customer clinics. General consultancy and done-for-you clinic-launch services are not part of the current model. A software-led FDE provides paid onboarding, configuration, approved integration work and data migration as a bounded implementation service.

The software product, FDE work, customer clinic and any professional clinical services must remain distinct responsibilities. Track subscription revenue, implementation revenue, delivery labor, support labor, infrastructure, vendor costs and IP separately.

## Revenue model

- **Software subscription:** recurring per-clinic access to an agreed product tier.
- **FDE onboarding:** one-time fixed-scope fee for configuration, integration and migration work.
- **Managed configuration support:** optional recurring retainer with explicit hours and response limits.
- **Custom integration or complex migration:** separately scoped and quoted; not included in the base subscription.

Rates, billing intervals, minimums, caps, supported sources, data-volume thresholds, change-order rules and exit terms remain open.

Do not use patient-care revenue as the software price basis. Do not treat an integration fee as authorization to access data, make clinical decisions, approve credentials or represent the clinic professionally.

## FDE implementation economics

The FDE fee should be based on source count, data volume, mapping complexity, integration method, dry-run effort, reconciliation, staff validation, cutover risk and required support. Use three starting bands:

| Band | Illustrative fee | Typical scope |
| --- | --- | --- |
| Simple | $3,000-$6,000 | One source, clean export, standard mapping and one validated import |
| Standard | $7,500-$15,000 | Multiple sources or custom mapping, reconciliation and guided cutover |
| Complex | Quote after discovery | Custom API work, multiple sites, incomplete records, high-volume migration or exceptional rollback needs |

These are hypotheses, not quotes. Log actual FDE hours, rework, source-system delays, data defects, validation effort and post-cutover requests for every implementation.

## Cost boundary

Define whether the subscription and FDE fee include hosting, vendor subscriptions, integration accounts, data-export charges, storage, training, travel, migration tools and post-cutover support. Outside professional, filing, legal, accounting and clinical services are not silently included.

## Simple economics to maintain

- Monthly subscription contribution = subscription revenue - infrastructure - vendor costs - attributable support labor.
- FDE contribution = implementation fee - FDE labor - migration tooling - project-specific vendor costs.
- Customer acquisition cost = attributable sales expense and labor divided by new paying clinics in the measured cohort.
- Retention value = collected subscription revenue less attributable support and infrastructure over the observed customer lifetime.

These are planning definitions, not forecasts. Do not enter unknown inputs as zero.

## Commercial decision gates

Before selling a live-data integration, define the source-system authority, customer authorization, data domains, mapping contract, access model, audit evidence, rollback path, acceptance test and support handoff. The current FDE role is intentionally narrow; real-data migration may require a separately approved migration identity or role and must not be solved by granting ordinary administrator access.

Before scaling, measure at least three implementations or obtain equivalent paid evidence. Review package profitability, support load, migration failure modes, renewal intent and customer willingness to pay at the non-founding price.

The current product remains subject to professional, privacy/security, hosted, accessibility, operational and real-data release gates. A software build or local synthetic test is not customer acceptance.

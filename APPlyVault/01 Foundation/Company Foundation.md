---
type: strategy
status: draft
updated: 2026-08-31
---
# Company Foundation

Home: [[00 Home]] · Choices: [[Decisions]] · Discussion: [[Foundation Questions]]

## Intent, as provided

Execute clinic launches for both NPs and PAs in Sherman and North Texas, with minimal provider input, from startup through readiness to see the first patient. Focus on cash-pay primary-care / concierge-adjacent PLLC clinics. The consultancy's launch package includes an applicant packet, starter SharePoint EHR, and ongoing support; exact scope, prices, and terms remain open.

Kevin is a cofounder who recently went through cash-pay PLLC setup with help from his attorney and documented the steps taken so far. He will provide physician support/arrangements and mentorship; capacity and operating terms are explicitly TBD. He also wants to create a video knowledge bank with mentorship as another service.

The consultancy is formed and owned 51% by Kevin and 49% by the founder. The founder reports documented direction-setting authority and a “veto concern”; the holder, scope, and implications of that veto are not yet specified. The senior-developer friend will be an employee of the consultancy and an owner of the software business, with amounts/terms TBD.

The EHR/inventory entity is not yet formed and will have different ownership. Its model is an implementation fee plus recurring fees based on a percentage of ordered inventory value. The percentage, eligible order-value definition, payer, billing trigger, and treatment of adjustments are undecided. An eventual bespoke SharePoint replacement remains intended. D-027/D-030 separately selected private EC2 bootstrap hosting; D-031/D-033 delivered synthetic PostgreSQL and the frontend/API split. Future clinical architecture, SharePoint migration and S3 use remain open; see [[Software Architecture]] and [[CICD]].

“PLLC clinic” describes the founder's intended customer journey, not a conclusion about the appropriate entity or ownership arrangement for every customer. See [[Texas Diligence]].

## Known from the founder's brief

| Item | What is known | What is not established |
| --- | --- | --- |
| Market | Both NPs and PAs in Sherman/North Texas; cash-pay primary-care / concierge-adjacent clinics; local demand reported | Exact client stage/services, named leads, and paid commitments; first-applicant count explicitly unsure |
| Consultancy | Formed; done-for-you launch package with minimal provider input, starter EHR, and ongoing support | Legal name/type/documents, exclusions, third-party costs, support terms, price amounts, and budget |
| Leadership / team | Kevin 51% / founder 49%; direction-setting authority documented per founder; friend will be consultancy employee and software owner | Exact veto concern/governance terms, software equity amount/cap table, employment/IP details, and capacity |
| Kevin / attorney | MD cofounder provides physician support/arrangements and mentorship; his attorney helped his setup | Contracting/billing, capacity/backup, specific legal review scope, APP packet adaptation, IP rights |
| Reference clinic | Public site identifies Kevin Stacks, MD, PLLC, general adult medicine, Sherman | Internal ownership records, exact services, first-patient status, remaining approvals |
| Software entity | Not formed; different ownership with senior developer as an owner; implementation fee plus percentage-of-ordered-inventory-value recurring fees | Other owners/percentages, rates/order-value rules, payer, contracts/support, IP, architecture, migration timing |
| Knowledge bank / mentorship | Kevin wants videos plus mentorship as another service | Selling entity, audience, packaging, content inventory, pricing, reviewer/update process, live mentorship capacity |
| Patient workflow | SharePoint-based starter EHR; described as simple and HIPAA-compliant | Deployment, evidence of controls, clinical completeness, or reuse rights |
| Materials / timing | A substantial existing collection is reported; access was expected on 2026-08-31 morning, with receipt still unrecorded; no deadline pressure | Actual files, budget, team availability, or delivery commitments |
| Vault | Shared planning and progress record | Human review cadence and access/backup practices |

Sources: founder brief and follow-up answers, 2026-08-30; [clinic homepage](https://stacksadultmedicine.com/) and [provider profile](https://stacksadultmedicine.com/provider), read in the browser the same day. The website identifies the practice and provider; cash-pay setup history and demand are founder-reported. No internal clinic documents or customer interviews have been reviewed.

## Service thesis — confirmed direction, delivery details open

Provide a done-for-you path from the applicant's clinic concept to documented first-patient readiness: collect essential inputs once, adapt the existing process for NP/PA and locality, execute the agreed setup work, arrange physician support and mentorship through Kevin, and hand off the starter system with ongoing support. [[Clinic Launch Packet]] is the proposed delivery backbone. Minimal input is a design objective; identify applicant decisions, factual attestations, approvals, signatures, and clinical responsibilities that cannot be assumed away.

Potential advantage to test: a practical packet and launch process based on a cofounder's actual setup experience, adapted to profession and locality. The founder reports strong local demand; repeatability, pricing, conversion, and defensibility still need concrete evidence. Botox/aesthetics was mentioned as an adjacent example, not a decision to include those services in the first package.

## Distinct businesses and roles

| Subject | Purpose | Open boundary |
| --- | --- | --- |
| Consultancy | Execute clinic setup and initial systems implementation; provide ongoing support | Scope, applicant approvals, contracts, third-party expenses, handoff, PHI access |
| Separate software entity | Provide EHR and inventory-management offering; eventually replace SharePoint | Software IP, licensing, customer/vendor contracts, support, data responsibilities |
| Kevin / his clinic | Physician support and mentorship through Kevin; reference-clinic learning from his practice | Which party contracts/bills for physician work, capacity, backup, IP, and clinical accountability |
| Video knowledge bank / mentorship service | Reusable education and a mentorship offering proposed by Kevin | Which existing or future business sells it; no additional entity inferred |
| APP customer clinics | Customer-owned or otherwise lawfully structured care businesses | Profession-specific ownership, delegation, permits, operations |

See [[Entity and Product Boundary]]. Consultancy formation is founder-reported; documents have not been reviewed. Software formation is future work. Kevin's physician support is in scope, but the contracting structure is not established. Do not infer that the consultancy owns clinics, employs their clinicians, itself exercises clinical authority, or is an MSO merely from its execution role.

See [[Knowledge Bank and Mentorship]] for the new service concept. Educational videos are not counted as evidence of available physician coverage or completed patient-specific oversight. Support scope, package costs, and physician-service capacity have been explicitly left TBD; do not press for invented numbers to make the planning scaffold look complete.

## Proposed initial boundaries

- Confirmed focus: both NPs and PAs, Sherman/North Texas, cash-pay primary care / concierge-adjacent; maintain profession/locality-specific packet variants.
- Sell an explicit, bounded deliverable rather than a guarantee that a clinic can open or pass review.
- Coordinate legal, accounting, privacy/security, and clinical expertise; do not substitute a checklist for professional judgment.
- Keep initial discovery and prototypes free of patient data.
- Include the SharePoint starter system in the intended launch offering; validate its scope and delivery responsibilities before deployment. The future custom replacement belongs to the separate software workstream, with architecture and timing open.

The market and delivery direction are founder-confirmed. Detailed boundaries and review procedures are proposed pending the existing documents and scope decisions; immediate safe handling of this planning vault remains in effect.

## What a solid foundation means

We can describe and record:

- The first buyer, profession, clinic type, location, and purchase trigger.
- The outcome purchased, included deliverables, exclusions, and accountable reviewers.
- The founders' and MD's roles, capacity, IP permissions, and decision authority.
- A first price hypothesis, cost assumptions, and budget/time constraints.
- The company's data-access boundary and the evidence required before any patient-data service.
- A small validation plan with owners, dates, and go / revise / stop criteria.

The foundation can be coherent before all hypotheses are validated. Legal diligence, clinical readiness, and product-market fit have separate evidence gates in [[Roadmap and Tasks]].

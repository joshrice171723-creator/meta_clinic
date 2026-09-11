---
type: business-boundary
status: software-and-fde-boundary-details-open
updated: 2026-09-11
---
# Entity and Product Boundary

Home: [[00 Home]] · Offer: [[Customer and Offer]] · Economics: [[Business Model]] · Pricing: [[Pricing Strategy]]

## Current direction

Meta Clinic is being documented as a software product rather than a consultancy. It sells clinic software, paid onboarding and FDE-led integration/migration work. The FDE configures the software and moves approved data through a controlled implementation process; the FDE does not become the clinic's administrator, clinician, legal adviser or record custodian.

The customer clinic remains responsible for its operations, professional obligations, user authorization and records. Any clinical, legal, accounting or other regulated service is outside the software product unless a separately identified qualified party contracts for it.

## Responsibility map

| Subject | Intended purpose | Details to settle |
| --- | --- | --- |
| Meta Clinic software entity | Own and operate the application, subscriptions, product IP and software support | Legal entity, ownership, IP assignments, hosting, support and contracts |
| FDE implementation role | Configure clinic settings, map approved sources, execute integrations/imports, reconcile results and guide handoff | Employment/contracting, rate, access, source authorization, audit, rollback and acceptance |
| Customer clinic | Own clinic operations, records, users and professional responsibilities | Data custody, user approvals, acceptance, clinical accountability and exit |
| Source-system vendors | Supply exports or integration access under the customer's authority | Export rights, API terms, rate limits, retention and vendor support |
| Professional service providers | Provide clinical, legal, accounting or other regulated expertise when separately engaged | Qualified party, scope, contract, fees and responsibility |

## FDE data and access boundary

FDE work may include discovery, source export review, field mapping, transformation, dry runs, reconciliation, cutover support and staff validation. Real patient or clinical data may be accessed or moved only after documented customer authorization, applicable agreements, data-flow/security review, approved credentials, auditability, rollback planning and release approval.

The current implementation-specialist role is intentionally limited to facilities configuration. It does not grant patient, encounter, note, medication, billing, inventory or role-management authority. If real-data migration needs additional access, define a separate migration role or controlled process with least privilege, time bounds, audit and revocation. Do not expand the ordinary FDE role by assumption.

## Commercial boundaries

1. Invoice software subscription, onboarding and FDE integration work as distinct deliverables.
2. Define what is included in each migration tier and what becomes a change order.
3. Keep custom integration, complex migration, professional services, vendor fees and travel outside the base subscription unless explicitly contracted.
4. Define data export, retention, deletion, cancellation, rollback and post-handoff support before live migration.
5. Do not use the integration fee to imply clinical approval, credential verification, professional coverage or regulatory acceptance.

## Decisions before live migration

- Which legal entity contracts with the clinic and invoices each deliverable?
- Which source systems, data domains and import methods are supported?
- Who authorizes export and access, and how is that authority evidenced?
- What mapping, validation, reconciliation, rollback and acceptance evidence is required?
- Which staff members can view, correct or approve migration results?
- What happens when source data is incomplete, duplicated, misidentified or not portable?
- What support and exit obligations survive the FDE handoff?

The repository's synthetic clinic implementation and local tests do not close these decisions or authorize real-data use.

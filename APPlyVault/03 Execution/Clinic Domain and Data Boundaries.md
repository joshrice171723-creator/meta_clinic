---
type: domain-boundary
status: active
updated: 2026-09-03
lifecycle: active
canonical_for: clinic-domain-and-data-boundaries
---
# Clinic Domain and Data Boundaries

Home: [[00 Home]] · Product: [[Clinic Workspace]] · Developer architecture: [software architecture](../../docs/architecture/software-architecture.md) · Target design: [clinic ERD](../../docs/architecture/clinic-target-state-erd.md) · Status: [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap)

## Purpose and authority

This is the concise vault authority for what the clinic data model means. It does not replace executable source, tests, migrations, professional review or release evidence. All examples and fixtures remain synthetic.

## Custody and identity

- `practice_id` is the clinical custody/tenant boundary.
- An optional organization groups business metadata only; it never grants chart, inventory or clinical access.
- Each clinical login has one developer-assigned clinic. There is no clinic picker, self-assignment or global patient merge/search.
- A patient treated at two clinics has two practice-local records unless a separately reviewed transfer/import workflow is accepted.
- Consultancy, software company, physician services and customer clinics remain distinct authorities.

## Durable integrity invariants

- Patient-owned records carry independent practice and patient relationships; encounter links never replace the patient boundary.
- Cross-practice and same-practice wrong-patient references fail at the relational/service boundary.
- Signed clinical content is immutable; corrections append attributable history.
- Observations retain explicit representation, unit, provenance and missingness; diagnoses, allergies and medication statements remain distinct concepts.
- Inventory has one authoritative append-only ledger with exact units, holds, counts, receipts, retries and attributable history. Prescription or patient references do not silently post stock.
- Documents use explicit patient ownership, opaque private object/version references and scan-state gates; addresses and messages use typed same-owner/practice relationships.
- Audit requires actor, tenant, correlation, outcome and failure/rollback evidence. PaperTrail metadata is not a substitute for read/denial/download or independently durable audit.

## Current implementation boundary

The detailed schema and API contracts live in [developer architecture](../../docs/architecture/clinic-target-state-erd.md) and [frontend/backend mapping](../../docs/architecture/clinic-frontend-backend-contract.md). Rails migrations, `apps/api/db/structure.sql`, models, services, controllers and tests are executable truth. The dated [backend verification](../../records/verification/2026-08-31-backend-verification.md) must not be treated as current after later source changes without revalidation.

## Open gates

Clinical fields/terminology/states/signature roles, identity/MFA/recovery, protected-value and field-visibility policy, independent audit/storage, worker attribution, retention/legal holds, migration parity, external object/message/payment services, billing rules, professional review and real-data release remain unresolved where recorded. No design note closes L-05, E1–E3, T-13, T-23 or T-34.5.

## Historical records

- [Original data-model proposal](../../records/proposals/2026-08-30-data-modeling.md)
- [Adversarial ERD review](../../records/design-reviews/2026-08-31-multi-clinic-erd-review.md)
- [Consumed implementation prompt](../../records/prompts/2026-08-31-erd-implementation-prompt-revision-5.md)
- [Dated backend verification](../../records/verification/2026-08-31-backend-verification.md)

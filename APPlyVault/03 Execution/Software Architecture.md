---
type: architecture-pointer
status: current-pointer
updated: 2026-09-13
lifecycle: active
canonical_for: software-boundary-pointer
---
# Software Architecture

Home: [[00 Home]] · Developer document: [current software architecture](../../docs/architecture/software-architecture.md) · Status: [Meta Clinic Implementation Tracker](Meta%20Clinic%20Implementation%20Tracker.md)

## Purpose and authority

The full developer-facing architecture, domain ownership, transport rules, dependency boundaries, PaperTrail contract and backend-replacement direction now live in [docs/architecture/software-architecture.md](../../docs/architecture/software-architecture.md). This vault note remains the stable Obsidian stem for existing links and records only the current authority boundary.

Source, migrations, generated `apps/api/db/structure.sql`, tests and runbooks are executable truth. This note does not authorize a database reset, migration-history rewrite, deployment, real-data access or clinical release.

## Domain ownership

The browser owns presentation; Rails owns authentication, authorization, tenancy, workflows and persistence. Launch, Identity, Care, Inventory and Staff remain distinct domains. Practice is the clinical custody boundary; one clinic is assigned per login. See [[Clinic Domain and Data Boundaries]] and the developer architecture document for implementation detail.

## PaperTrail audit contract

The selected PaperTrail and complementary access-audit requirements remain active, but implementation coverage is evidence-dependent. See [the developer audit contract](../../docs/architecture/software-architecture.md) and the dated [backend verification record](../../records/verification/2026-08-31-backend-verification.md). A passing historical check is not current release acceptance.

## Callback-driven mutation coverage

Every auditable mutation path—including callbacks, jobs, association writes and guarded bypasses—requires explicit tenant/actor attribution and evidence. The full matrix is maintained in the developer architecture document and the dated implementation prompt record.

## Historical records

- [Architecture source](../../docs/architecture/software-architecture.md)
- [ERD replacement prompt](../../records/prompts/2026-08-31-erd-implementation-prompt-revision-5.md)
- [Backend verification](../../records/verification/2026-08-31-backend-verification.md)

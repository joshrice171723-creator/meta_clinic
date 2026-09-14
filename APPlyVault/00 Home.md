---
type: dashboard
status: active
updated: 2026-09-13
lifecycle: active
canonical_for: vault-orientation
---
# APPly — Home

**[[01 Table of Contents|Vault table of contents]] · [Product definition](../PRODUCT.md) · [[Design|Clinic design system]] · [Developer handbook](../docs/README.md)**

Our shared workspace for **Meta Clinic**, a configurable ambulatory software product for NPs and PAs in Sherman and North Texas, focused on cash-pay primary-care / concierge-adjacent clinics. The product uses a software-led Implementation Specialist (FDE) for configuration, approved integrations and data migration. **APPly remains a working name until the product's legal/brand name is confirmed.**

## Developers — start with the handbook

Use the [developer handbook](../docs/README.md) for setup, local commands, branches, checks and current architecture. The active task context owns scope, acceptance, claims and status; then select only the relevant product context, decisions, risks and evidence from this vault. `AGENTS.md`, `agent-harness/` and `.agents/skills/` govern agents; `records/` retains detailed dated evidence outside the default context.

| Current source | Hosted state |
| --- | --- |
| `apps/web`: React/TypeScript/Vite; `apps/api`: Rails JSON + PostgreSQL. Local frontend/API split complete. | New founder-selected Lightsail synthetic demo has verified HTTPS login, access checks, restart and PostgreSQL restore; see [[CICD]]. No current production acceptance is claimed. |
| Six CI jobs—including vault/agent-document validation—and manual API/web image publication are defined in source. | The former AWS environments are retired. New image publication passes; pre-existing full CI failures remain separate from demo availability. |

The retired `reference/` folder was removed by the founder after its useful behavior was mapped into the app. Use Rails migrations and `apps/api/db/structure.sql`, not the old reference SQL. Shared `.gitignore` rules now protect local artifacts; the vault and source remain tracked. All development stays synthetic; no clinical/confidential release is implied.

**Backend verification (2026-08-31):** source commits `600976f`/`5436764` implement the ERD schema, domain workflows and API. [[Backend Verification Report]] records the subsequent full validation, guarded synthetic seeds, corrections and all 68 entities/103 relationships. Structural coverage is present; access auditing, protected-value handling and several clinical workflows remain incomplete. D-044's historical prompt and pending amendment record do not establish clinical approval, database-reset permission or deployment readiness.

## Current position

- **Platform strategy:** [[Meta Clinic Product Strategy and Scope]] connects the digital front door and physical front desk across specialties, explicitly including cash-based clinics, walk-ins, telehealth, pharmacy and inventory. Organizations assign employee privileges; independent license verification is not a default platform requirement.
- **Current implementation tracking:** [[Meta Clinic Implementation Tracker]] consolidates workflow status and remaining proof. The [engineering guide](../docs/development/meta-clinic-build-and-acceptance.md) defines completion criteria. Former external-tracker requirements are retired under D-071.

- **Offer:** provide configurable ambulatory software with FDE-led onboarding, approved integrations and data migration. Subscription tiers, onboarding fees, support limits and acceptance terms remain to define.
- **Leadership / entity:** product ownership, governance, employment, IP and commercial entity terms remain to be documented. No consultancy launch business is assumed in the current model.
- **Implementation:** an FDE configures clinic type, services, payment model, visit types, sites and operating hours, then leads authorized integration and migration work. Professional clinical services remain separate and are not implied by the FDE role.
- **Additional service concept:** Kevin wants a video knowledge bank with mentorship. [[Knowledge Bank and Mentorship]] tracks this separately from physician coverage; the selling entity, packaging, audience, and pricing remain open.
- **Reference clinic:** Kevin Stacks, MD, PLLC, general adult medicine in Sherman, verified on the public website. The founder reports the MD has recently gone through cash-pay PLLC setup and documented the legal steps taken so far.
- **Starting assets:** Kevin's attorney helped with his setup process. The founder will gather Kevin's documents/legal materials for authorized ingestion; receipt, reuse permission and review are still not recorded here. The earlier expected availability was not proof of receipt.
- **Commercial structure:** per-clinic software subscription plus separate onboarding/FDE integration fees and optional bounded configuration support. Rates, supported sources, billing terms and data-migration mechanics remain open.
- **Product direction:** Meta Clinic software with FDE-led onboarding, approved integrations and data migration; SharePoint mapping and the eventual custom EHR/inventory backend remain implementation paths rather than a consultancy offer. The former AWS environments and OIDC delivery path are retired. Current source publishes commit-tagged containers to the founder-owned GitHub registry and retains provider-neutral packaging. The founder selected a new Lightsail synthetic demo with verified HTTPS access; [[CICD]] distinguishes historical evidence, current operations and remaining release limits.
- **Database implementation:** D-031 selects PostgreSQL throughout Rails, tests and prepared deployment tooling. [[PostgreSQL and Inventory Foundation]] records the tested shared ledger, units, receipts, holds and counts. Staging's verified maintenance cutover preserves its synthetic records/keys and includes independent PostgreSQL restore evidence; production cutover remains pending.
- **Source structure:** D-033 separates browser UI (`apps/web`) and Rails API (`apps/api`), retaining D-032's domain ownership. [Architecture](../docs/architecture/software-architecture.md) and [development docs](../docs/development/README.md) define the two build/runtime boundaries and commands; [[Software Architecture]] and [[CICD]] remain vault compatibility pointers. The temporary link is retired; staging now runs the split release and production remains unchanged. The local `apply_test` cleanup issue was resolved by authorized recreation; [[Progress Log]] retains the incident and corrected cleanup checks.
- **Pharmacy scope:** D-028 sets broad configurability: clinics should be able to choose and combine pharmacy setups. [[Pharmacy Inventory Data Requirements]] covers the shared inventory foundation and proposed capability extensions; individual clinic activation and real-data release still need their own evidence.
- **Demand:** substantial local demand is founder-reported; founder is currently unsure how many first applicants are available. No pipeline count or paid commitment is assumed.
- **Timing:** no deadline pressure was expressed. Budget and actual team capacity are still unknown; no 90-day deadline is imposed.
- **Product boundary and near-term objective:** the mentoring/guidance portal and clinic software are unrelated products that currently share a frontend/API repository. [[Website MVP]] / [[Client Portal]] own responsive mentoring, knowledge and training; [[Clinic Workspace]] owns the separately offered synthetic clinic package. [[Design]] makes the tracking board the clinic's first visual authority and prioritizes desktop/tablet use. Shared infrastructure does not require shared product identity. No real patient data or released EHR; public release and actual packet/content remain pending. Business-decision interviews stay deferred.

## Start here

1. For development, start with [development](../docs/development/README.md) and [architecture](../docs/architecture/README.md). Keep task scope, dependencies and acceptance in the active task context. Agents use the [failure-first workflow](../agent-harness/workflows/failure-first.md); the human agreement remains [[Working Agreement]]. Existing professional and release gates remain in force.
2. Use [[Customer and Offer]], [[Pricing Strategy]] and [[Texas Diligence]] to define the software offer, FDE integration scope and real-data migration gates.
3. Use [[Meta Clinic Implementation Tracker]] for workstreams, individual tasks for execution, [[Decisions]] for agreed choices, and [[Progress Log]] for material dated outcomes.

## Workspace map

| Area | Notes |
| --- | --- |
| Strategy | [[Company Foundation]], [[Customer and Offer]], [[Business Model]], [[Entity and Product Boundary]], [[Foundation Questions]] |
| Delivery | [[Clinic Launch Packet]], [[Knowledge Bank and Mentorship]] |
| Learning | [[MD Pilot]], [[Customer Discovery]], [[Texas Diligence]], [[SharePoint and EMR]], [[Source Register]] |
| Developer handoff | [Developer handbook](../docs/README.md), [[CICD]], [[Software Architecture]], [[PostgreSQL and Inventory Foundation]] |
| Execution | Active task context, [[Website MVP]], [[Client Portal]], [[Clinic Workspace]], [[Design]], [[Data Modeling]], [[Decisions]], [[Risks and Assumptions]], [[Working Agreement]], [[Progress Log]] |
| Reusable notes | [[Evidence Note Template]], [[Weekly Review Template]] |

## Next three moves

- Finish remaining engineering/release acceptance: browser/account journeys, image advisories and operations/recovery. Select and provision a founder-controlled host before any new hosted acceptance; historical AWS evidence does not transfer to it.
- Build toward operator onboarding, FDE integration runbooks and versioned migration/validation procedures. Source-system permissions, data mapping, real-data handling and customer acceptance remain separate dependencies.
- Finish inventory configuration/permission acceptance and prepare the synthetic clinic workflow walkthrough alongside it; field/layout/clinical acceptance and real-data gates remain open.

Current workflow status lives in [[Meta Clinic Implementation Tracker]]; this page is a direction summary, not a second task list.

## Reading the notes

**Reported** = supplied by the founder or collaborator, not independently verified. **Sourced background** = a limited statement supported by a dated source, not case-specific approval. **Hypothesis / proposed** = something to test or approve. **Decided** = explicitly agreed and recorded in [[Decisions]]. Unknown means unknown, not zero or not applicable.

This is a business-planning vault, **not a patient-record system**. Do not put patient information, credentials, or unreviewed patient screenshots here. Use synthetic examples. The planning documents are not legal advice or a compliance certification.

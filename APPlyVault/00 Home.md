---
type: dashboard
status: active
updated: 2026-08-31
---
# APPly — Home

**[[01 Table of Contents|Vault table of contents]] · [[CICD|Developer CI/CD guide]]**

Our shared workspace for a done-for-you clinic-launch consultancy serving **NPs and PAs in Sherman and North Texas**, focused on cash-pay primary-care / concierge-adjacent clinics. The consultancy is formed; the EHR and inventory-management entity is not yet formed and will have different ownership. **APPly remains a working name until the consultancy's legal/brand name is confirmed.**

## Developers — start with CI/CD

**[[CICD|Open the CI/CD and two-developer guide]]** for first-time setup, local commands, branches/PRs, required checks and the staging-to-production release process. Then read [[Software Architecture]] for code ownership and [[Roadmap and Tasks#Current task register]] for remaining work.

| Current source — reviewed 2026-08-31 | Hosted state — staging verified 2026-08-31 |
| --- | --- |
| `apps/web`: React/TypeScript/Vite; `apps/api`: Rails JSON + PostgreSQL. Local frontend/API split complete. | Staging runs the separate API/frontend with PostgreSQL; production retains the older Rails/SQLite bootstrap (last verified 2026-08-30). |
| Five CI jobs and matched API/web image delivery are defined in source. | Staging cutover/recovery and scoped GitHub OIDC are verified. Production cutover and activation remain separately pending. |

The retired `reference/` folder was removed by the founder after its useful behavior was mapped into the app. Use Rails migrations and `apps/api/db/structure.sql`, not the old reference SQL. Shared `.gitignore` rules now protect local artifacts; the vault and source remain tracked. All development stays synthetic; no clinical/confidential release is implied.

**Backend verification (2026-08-31):** source commits `600976f`/`5436764` implement the ERD schema, domain workflows and API. [[Backend Verification Report]] records the subsequent full validation, guarded synthetic seeds, corrections and all 68 entities/103 relationships. Structural coverage is present; access auditing, protected-value handling and several clinical workflows remain incomplete. D-044's historical prompt and pending amendment record do not establish clinical approval, database-reset permission or deployment readiness.

## Current position

- **Offer:** execute the clinic launch with minimal provider input, through first-patient readiness, including the packet and starter SharePoint EHR; ongoing support is part of the model. Exact deliverables, exceptions, fees, and support terms remain to define.
- **Leadership:** consultancy ownership is Kevin 51% / founder 49%. Founder reports documented direction-setting authority and raises a “veto concern”; whose veto and its scope remain to clarify. Governing documents have not yet been reviewed here.
- **Team / physician services:** Kevin supplies physician support/arrangements and mentorship. The senior-developer friend will be a consultancy employee and a software-company owner; equity amount and employment/IP terms are TBD.
- **Additional service concept:** Kevin wants a video knowledge bank with mentorship. [[Knowledge Bank and Mentorship]] tracks this separately from physician coverage; the selling entity, packaging, audience, and pricing remain open.
- **Reference clinic:** Kevin Stacks, MD, PLLC, general adult medicine in Sherman, verified on the public website. The founder reports the MD has recently gone through cash-pay PLLC setup and documented the legal steps taken so far.
- **Starting assets:** Kevin's attorney helped with his setup process. The founder will gather Kevin's documents/legal materials for authorized ingestion; receipt, reuse permission and review are still not recorded here. The earlier expected availability was not proof of receipt.
- **Commercial structure:** consultancy launch package with ongoing support; support and package-cost details explicitly TBD. Software implementation fee plus recurring fees calculated as a percentage of ordered inventory value; rate, eligible value, billing trigger, and terms remain open. This is not a selected percentage of patient-care revenue.
- **Product direction:** SharePoint initially; eventual custom EHR/inventory backend. D-027/D-030 established small paid private EC2 staging/production environments, with 10 GiB encrypted storage each and independent secrets. Staging now uses PostgreSQL; production retains its SQLite bootstrap with demos disabled. [[CICD]] distinguishes that hosted evidence from current source and pending activation. Future clinical architecture and S3 use remain open.
- **Database implementation:** D-031 selects PostgreSQL throughout Rails, tests and prepared deployment tooling. [[PostgreSQL and Inventory Foundation]] records the tested shared ledger, units, receipts, holds and counts. Staging's verified maintenance cutover preserves its synthetic records/keys and includes independent PostgreSQL restore evidence; production cutover remains pending.
- **Source structure:** D-033 separates browser UI (`apps/web`) and Rails API (`apps/api`), retaining D-032's domain ownership. [[Software Architecture]] and [[CICD]] define the two build/runtime boundaries and development commands. The temporary link is retired; staging now runs the split release and production remains unchanged. The local `apply_test` cleanup issue was resolved by authorized recreation; [[Progress Log]] retains the incident and corrected cleanup checks.
- **Pharmacy scope:** D-028 sets broad configurability: clinics should be able to choose and combine pharmacy setups. [[Pharmacy Inventory Data Requirements]] covers the shared inventory foundation and proposed capability extensions; individual clinic activation and real-data release still need their own evidence.
- **Demand:** substantial local demand is founder-reported; founder is currently unsure how many first applicants are available. No pipeline count or paid commitment is assumed.
- **Timing:** no deadline pressure was expressed. Budget and actual team capacity are still unknown; no 90-day deadline is imposed.
- **Near-term objective:** build both experiences through a separate frontend and Rails API: [[Website MVP]] / [[Client Portal]] for selling, Contact, paperwork and training; [[Clinic Workspace]] for synthetic clinic operations. Separate layouts/navigation and clinic permissions, not a separate-domain requirement. No real patient data or released EHR; public release and actual packet/content remain pending. Business-decision interviews stay deferred.

## Start here

1. For development, start with [[CICD]], then [[Software Architecture]] and [[Roadmap and Tasks#Five-step implementation plan|the five-step implementation plan]]. Its 27 chunks carry dependencies, failure scenarios and exit evidence; [[Roadmap and Tasks#Current task register]] rolls up status. Use [[Working Agreement#Failure-first planning and review|failure-first review]] before starting or accepting work. Existing milestone gates remain in force.
2. Use [[MD Pilot]] and [[Texas Diligence]] to turn the existing materials into the [[Clinic Launch Packet]].
3. Use [[Roadmap and Tasks]] for commitments, [[Decisions]] for agreed choices, and [[Progress Log]] for what changed.

## Workspace map

| Area | Notes |
| --- | --- |
| Strategy | [[Company Foundation]], [[Customer and Offer]], [[Business Model]], [[Entity and Product Boundary]], [[Foundation Questions]] |
| Delivery | [[Clinic Launch Packet]], [[Knowledge Bank and Mentorship]] |
| Learning | [[MD Pilot]], [[Customer Discovery]], [[Texas Diligence]], [[SharePoint and EMR]], [[Source Register]] |
| Developer handoff | [[CICD]], [[Software Architecture]], [[PostgreSQL and Inventory Foundation]] |
| Execution | [[Website MVP]], [[Client Portal]], [[Clinic Workspace]], [[Data Modeling]], [[Roadmap and Tasks]], [[Decisions]], [[Risks and Assumptions]], [[Working Agreement]], [[Progress Log]] |
| Reusable notes | [[Evidence Note Template]], [[Weekly Review Template]] |

## Next three moves

- Finish [[Roadmap and Tasks#Step 1 — Engineering and release foundation|remaining engineering/release acceptance]]: browser/account journeys, image advisories and operations/recovery. Preserve completed CI/staging evidence; production cutover needs separate authorization, not a repeat of staging setup.
- Build toward [[Roadmap and Tasks#Step 2 — Client onboarding and operator workflow|operator onboarding]] and [[Roadmap and Tasks#Step 3 — Synthetic packet and training infrastructure|versioned synthetic packet/training management]]. The founder will gather Kevin's materials; actual content/reuse review is a separate dependency, and real applicant documents/signing remain M4-gated.
- Finish [[Roadmap and Tasks#Step 4 — Configurable inventory foundation|inventory configuration/permission acceptance]]. Prepare [[Roadmap and Tasks#Step 5 — Define the first clinic workflow|the synthetic clinic workflow walkthrough]] alongside it; field/layout/clinical acceptance and real-data gates remain open.

Task status lives in [[Roadmap and Tasks]]; this page is a summary, not a second task list.

## Reading the notes

**Reported** = supplied by the founder or collaborator, not independently verified. **Sourced background** = a limited statement supported by a dated source, not case-specific approval. **Hypothesis / proposed** = something to test or approve. **Decided** = explicitly agreed and recorded in [[Decisions]]. Unknown means unknown, not zero or not applicable.

This is a business-planning vault, **not a patient-record system**. Do not put patient information, credentials, or unreviewed patient screenshots here. Use synthetic examples. The planning documents are not legal advice or a compliance certification.

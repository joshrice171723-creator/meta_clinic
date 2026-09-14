---
type: index
status: active
updated: 2026-09-13
lifecycle: active
canonical_for: vault-context-routing
---
# Table of Contents

Home: [[00 Home]] · Product: [PRODUCT.md](../PRODUCT.md) · Clinic design: [[Design]] · **Developers: [start with the handbook](../docs/README.md)** · Code ownership: [architecture](../docs/architecture/software-architecture.md)

Use this index to select the relevant notes and sections for a Story; **do not read the entire vault by default**. Read selected notes' scope/limits and the decisions, risks and evidence needed to interpret them. Follow dependencies only as needed. Root [AGENTS.md](../AGENTS.md) defines repository-wide boundaries; [vault instructions](AGENTS.md), nested application/operations instructions and the [agent harness](../agent-harness/README.md) provide scoped procedure. The harness owns agent behavior; this vault owns software knowledge and evidence.

This is navigation, not a backlog. [[Meta Clinic Implementation Tracker]] owns current Meta Clinic work status and acceptance gaps; individual tasks execute its bounded work. Explicit choices live in [[Decisions]], risks in [[Risks and Assumptions]], and dated outcomes in [[Progress Log]]. Historical paths and test results are not current setup instructions.

## Meta Clinic planning and delivery

- [[Meta Clinic Product Strategy and Scope]] defines customers, business models, shared-core/ten-clinic capability mapping, composable specialty/modality settings, infusion planning direction and organization-assigned roles.
- [Engineering build and acceptance guide](../docs/development/meta-clinic-build-and-acceptance.md) defines connected workflow behavior and completion evidence.
- [[Meta Clinic Implementation Tracker]] consolidates existing plans and dated evidence into one current workflow inventory.

## Choose a reading route

Read Home and this index for orientation, then relevant sections along one or more routes:

| Task | Start here | Supporting context when needed |
| --- | --- | --- |
| Product or visual-system design | [PRODUCT.md](../PRODUCT.md), [[Design]] | [[Clinic Workspace Design]] for implementation history and workflow boundaries; D-036/D-039/D-041/D-049/D-051/D-052 |
| Implementation planning or failure review | [failure-first workflow](../agent-harness/workflows/failure-first.md) | Active task context; human agreement in [[Working Agreement]]; relevant requirements, [[Risks and Assumptions]], evidence and existing gates remain |
| Developer onboarding, Git, local setup or CI | [Developer handbook](../docs/README.md), [software architecture](../docs/architecture/software-architecture.md) | [[CICD]] and [[Software Architecture]] preserve vault context/links; D-033 owns the architecture direction |
| Hosting, releases or database cutover | [[CICD#Finish activation]], [[PostgreSQL and Inventory Foundation]] | [portable deployment](../ops/portable/README.md); dated historical hosted entries in [[Progress Log]]; applicable release gates |
| Marketing, Contact, login, paperwork or training | [[Website MVP]], [[Client Portal]]; [[Client Access Workflow]] for access lifecycle/operator design | [[Software Architecture#Domain ownership]]; relevant criteria and Stories; D-021/D-022/D-033 |
| Clinic UI, care or staff prototype | [[Design]], [[Clinic Workspace]], [[Clinic Workspace Design]], [[Clinic Domain and Data Boundaries]] | [Software architecture](../docs/architecture/software-architecture.md); relevant decisions, risks and release limits |
| ERD-to-frontend integration planning | [[Clinic Domain and Data Boundaries]], [frontend/backend contract](../docs/architecture/clinic-frontend-backend-contract.md), [target-state ERD](../docs/architecture/clinic-target-state-erd.md) | Pointer notes below preserve historical titles; detailed proposal/review/prompt/verification evidence is under [records](../records/README.md) |
| Inventory schema, receiving, units, holds or counts | [[PostgreSQL and Inventory Foundation]], [[Clinic Workspace#Current PostgreSQL inventory implementation]] | [[Pharmacy Inventory Data Requirements]]; [[Data Modeling#Inventory and commercial boundary]]; current implementation tracker items |
| Supplier prices, procurement or billing | [[Inventory Price Comparison Sources]], [[Business Model]] | D-029 deferral; unresolved fee mechanics; entity/professional questions. Reading is not permission to resume integration |
| Offer, ownership, support or business planning | [[Company Foundation]], [[Customer and Offer]], [[Entity and Product Boundary]] | [[Business Model]], relevant [[Decisions]] and [[Foundation Questions]] answers; do not reopen deliberately deferred questions |
| MD materials, applicant packet or research | [[MD Pilot]], [[Clinic Launch Packet]], [[Source Register]] | [[Customer Discovery]], relevant [[Texas Diligence]] issues and source permissions |
| Pharmacy professional review | [[Pharmacy Provider and Counsel Questions]], [[Texas Diligence]] | Relevant [[Pharmacy Inventory Data Requirements]] sections and dated sources; actual clinic facts remain required |
| SharePoint, clinical architecture or data safeguards | [[SharePoint and EMR]], relevant [[Data Modeling]] sections | L-05 and applicable E1–E3 gates; [[Entity and Product Boundary]]; qualified review remains separate |
| Vault documentation or agent-harness rules | [[Working Agreement]], this index, [vault agent instructions](AGENTS.md) | Relevant current-state notes, decisions, risks and progress entries; [agent workflow playbooks](../agent-harness/workflows/README.md); [harness map](../agent-harness/README.md); configuration only if the Story concerns it |

## Current execution notes and compatibility pointers — 03 Execution

Superseded billing and encounter plans have been removed from the active vault and preserved in the [plan archive](../records/superseded-plans/README.md). Read them only for a specific historical question; their ideas are not current requirements. Use the three Meta Clinic planning and delivery documents above for current direction and work.

| Note | What it owns / how to use it |
| --- | --- |
| **[[CICD]]** | Stable vault pointer for delivery state and legacy anchors; current mechanics are in [development docs](../docs/development/README.md) |
| [[Software Architecture]] | Stable vault pointer for ownership/audit context; current mechanics are in [architecture docs](../docs/architecture/README.md) |
| [[Clinic Domain and Data Boundaries]] | Compact current clinic-domain, custody, identity, audit and release boundaries |
| [[PostgreSQL and Inventory Foundation]] | Implemented database/inventory controls, verified staging cutover/recovery and pending production cutover |
| [[Inventory Integration Handoff]] | Compatibility pointer to the [developer inventory handoff](../docs/development/inventory-integration.md) |
| [[Website MVP]] | Current selling-site scope and source-versus-hosted distinction |
| [[Client Portal]] | Provisioned access, Contact, synthetic paperwork/signing, training and confidential-release limits |
| [[Client Access Workflow]] | Accepted client-access structure, 12-hour session maximum, reusable local test personas and operator runbook; activation/recovery implementation and production role assignments remain separate |
| [[Design]] | Canonical clinic-only visual system: Clinical Wayfinding Ledger, desktop/tablet targets, tokens, hierarchy, components and failure-first acceptance |
| [[Clinic Workspace]] | Synthetic clinic/inventory scope, permissions and labeled earlier implementation history |
| [[Clinic Workspace Design]] | Clinic design and implementation history, workflow proposals, account-owned themes and verified versus unimplemented boundaries; current visual authority is [[Design]] |
| [[Clinic Frontend Backend Mapping]] | Compatibility pointer to the current [frontend/backend contract](../docs/architecture/clinic-frontend-backend-contract.md) |
| [[Data Modeling]] | Compatibility pointer to the dated proposal; executable schema remains source truth |
| [[Multi-Clinic ERD Adversarial Review]] | Compatibility pointer to the dated review and preserved adverse cases |
| [[ERD Implementation Prompt]] | Compatibility pointer to the dated full-replacement prompt |
| [[Backend Verification Report]] | Compatibility pointer to the dated verification snapshot and its limits |
| [[Target-State Clinic ERD]] | Compatibility pointer to the detailed [target-state ERD](../docs/architecture/clinic-target-state-erd.md) |
| [[Progress Log]] | Thin current-window index of dated outcomes; one-record-per-outcome evidence is in [records/progress/2026/09](../records/progress/2026/09/) and older monthly archives in [records/progress](../records/progress/INDEX.md) |
| [[Decisions]] | Explicit direction and supersession. Read relevant decisions and later refinements |
| [[Risks and Assumptions]] | Open risks/hypotheses, failure signals and required evidence; plans are not closure |
| [[Working Agreement]] | Human operating agreement, evidence distinctions, ownership and information handling; agent procedure stays in the harness |

## Company and delivery — 01 Foundation

| Note | What it covers |
| --- | --- |
| [[Company Foundation]] | Confirmed market/model/team direction and unresolved business details |
| [[Customer and Offer]] | NP/PA customer, software offer, FDE onboarding and migration scope |
| [[Pricing Strategy]] | Proposed software tiers, FDE integration pricing hypotheses and validation tests |
| [[Business Model]] | Software subscription, FDE implementation economics and unresolved mechanics |
| [[Entity and Product Boundary]] | Software, FDE, source-system and customer-clinic responsibilities; IP/contracts/data |
| [[Clinic Launch Packet]] | Source-to-packet outline, applicant actions, review and handoff evidence; actual packet absent |
| [[Knowledge Bank and Mentorship]] | Deferred video/mentorship concept; not a released library or physician coverage |
| [[Foundation Questions]] | Historical founder answers and deferred questions; later refinements supersede older unknowns |

## Research and evidence — 02 Research

| Note | What it covers |
| --- | --- |
| [[MD Pilot]] | Reference clinic, expected source materials, reuse permissions and synthetic walkthrough agenda |
| [[Customer Discovery]] | Reported demand versus prospective interviews, leads and paid evidence |
| [[Texas Diligence]] | Open L-01–L-08 questions and scoped professional-review requirements |
| [[SharePoint and EMR]] | Unreviewed starter workflow, discovery and migration/data-boundary questions |
| [[Pharmacy Inventory Data Requirements]] | Broader field/capability specification; delivered core distinguished from future extensions |
| [[Pharmacy Provider and Counsel Questions]] | 60 open professional/operational questions, routed by clinic activity |
| [[Inventory Price Comparison Sources]] | Dated supplier/benchmark research and deferred integration design; not live quotes or approved access |
| [[Source Register]] | Dated public-source scope/limits and founder evidence; links do not mean current legal or service approval |

## Templates — 90 Templates

| Note | Use |
| --- | --- |
| [[Evidence Note Template]] | Record actual observation/source or bounded failure-test results, applicability, limits and follow-up |
| [[Weekly Review Template]] | Record an agreed review and next-chunk failure challenge; does not schedule a meeting or create commitments |

## Navigation and configuration

[[00 Home]] is the current-position dashboard; this note is the full note index. Durable Obsidian configuration is local UI state, not business evidence: [app](.obsidian/app.json), [appearance](.obsidian/appearance.json), [core plugins](.obsidian/core-plugins.json), and [graph](.obsidian/graph.json). The workspace layout is intentionally untracked local state. Read configuration only for relevant work and preserve it unless changes are requested. Sync being enabled does not establish approved synchronization.

The founder removed retired `reference/` on 2026-08-31. Runtime source remains in `apps/`, provider-neutral packaging in `ops/portable/`, and the canonical schema in `apps/api/db/structure.sql` with its migrations. Historical reference and AWS files are recoverable from Git, not required reading or active dependencies.

## Keep this index useful

When adding/removing a note or changing its purpose, update this index and affected links. Verify selected paths exist; use targeted file/search inspection if an entry is missing or stale. Missing relevant sources block dependent conclusions, not unrelated work. Do not upload the vault or open patient records to fill a context gap.

---
type: index
status: active
updated: 2026-08-31
---
# Table of Contents

Home: [[00 Home]] · **Developers: [[CICD|start with CI/CD]]** · Code ownership: [[Software Architecture]] · Status: [[Roadmap and Tasks#Current task register]]

Use this index to select the relevant notes and sections for a task; **do not read the entire vault by default**. Read selected notes' scope/limits and the decisions, tasks and evidence needed to interpret them. Follow dependencies only as needed. Root [AGENTS.md](../AGENTS.md) defines repository-wide boundaries; [vault instructions](AGENTS.md), nested application/operations instructions and [on-demand playbooks](../agent-workflows/README.md) provide scoped procedure.

This is navigation, not a second backlog. Current status lives in [[Roadmap and Tasks]], explicit choices in [[Decisions]], and dated outcomes in [[Progress Log]]. Historical paths and test results are not current setup instructions.

## Choose a reading route

Read Home and this index for orientation, then relevant sections along one or more routes:

| Task | Start here | Supporting context when needed |
| --- | --- | --- |
| Implementation planning or failure review | [[Roadmap and Tasks#Five-step implementation plan]], [[Working Agreement#Failure-first planning and review]] | Chunk entry/exit evidence, [[Risks and Assumptions]], [[Weekly Review Template]], [[Evidence Note Template]]; D-037; existing M/E/professional gates remain |
| Developer onboarding, Git, local setup or CI | [[CICD#Developer quick start]], [[Software Architecture]] | T-22/T-40 in [[Roadmap and Tasks#Current task register]]; D-033 in [[Decisions#Frontend and backend separation]] |
| Hosting, releases or database cutover | [[CICD#Finish activation]], [[PostgreSQL and Inventory Foundation]] | T-20/T-38; [staging owner-review access](../ops/aws/ec2/review-access.md); linked operator runbooks; dated hosted entries in [[Progress Log]]; applicable release gates |
| Marketing, Contact, login, paperwork or training | [[Website MVP]], [[Client Portal]]; [[Client Access Workflow]] for access lifecycle/operator design | [[Software Architecture#Domain ownership]]; relevant M0–M6 criteria/tasks; D-021/D-022/D-033 |
| Clinic UI, care or staff prototype | [[Clinic Workspace]], [[Clinic Workspace Design]], [[Software Architecture]] | D-025/D-026/D-033/D-036/D-039/D-041; T-13/T-29/T-40/T-41/T-43/T-44; relevant [[Data Modeling]] proposal and release limits |
| ERD-to-frontend integration planning | [[Clinic Frontend Backend Mapping]], [[Backend Verification Report]], [[Target-State Clinic ERD]], [[ERD Implementation Prompt]] | Current browser-to-API readiness, user-flow diagrams, source-versus-gap boundaries and staged acceptance; D-043/D-044; retain existing clinic design and canonical T-13/T-34/T-44 status |
| Inventory schema, receiving, units, holds or counts | [[PostgreSQL and Inventory Foundation]], [[Clinic Workspace#Current PostgreSQL inventory implementation]] | [[Pharmacy Inventory Data Requirements]]; [[Data Modeling#Inventory and commercial boundary]]; T-13/T-34/T-38 |
| Supplier prices, procurement or billing | [[Inventory Price Comparison Sources]], [[Business Model]] | D-029/T-37 deferral; T-14 mechanics; entity/professional questions. Reading is not permission to resume integration |
| Offer, ownership, support or business planning | [[Company Foundation]], [[Customer and Offer]], [[Entity and Product Boundary]] | [[Business Model]], relevant [[Decisions]] and [[Foundation Questions]] answers; do not reopen deliberately deferred questions |
| MD materials, applicant packet or research | [[MD Pilot]], [[Clinic Launch Packet]], [[Source Register]] | [[Customer Discovery]], relevant [[Texas Diligence]] issues and source permissions |
| Pharmacy professional review | [[Pharmacy Provider and Counsel Questions]], [[Texas Diligence]] | Relevant [[Pharmacy Inventory Data Requirements]] sections and dated sources; actual clinic facts remain required |
| SharePoint, clinical architecture or data safeguards | [[SharePoint and EMR]], relevant [[Data Modeling]] sections | L-05 and applicable E1–E3 gates; [[Entity and Product Boundary]]; qualified review remains separate |
| Vault documentation or workflow rules | [[Working Agreement]], this index, [vault agent instructions](AGENTS.md) | Relevant current-state notes, decisions/tasks and progress entries; [agent workflow playbooks](../agent-workflows/README.md); configuration only if the task concerns it |

## Developer and execution notes — 03 Execution

| Note | What it owns / how to use it |
| --- | --- |
| **[[CICD]]** | First developer handoff: local commands, two-developer branches/PRs, six CI jobs, active staging delivery and pending production activation |
| [[Software Architecture]] | Current frontend/API ownership, planned backend-replacement boundary, PaperTrail coverage and transport rules |
| [[PostgreSQL and Inventory Foundation]] | Implemented database/inventory controls, verified staging cutover/recovery and pending production cutover |
| [[Website MVP]] | Current selling-site scope and source-versus-hosted distinction |
| [[Client Portal]] | Provisioned access, Contact, synthetic paperwork/signing, training and confidential-release limits |
| [[Client Access Workflow]] | Accepted client-access structure, 12-hour session maximum, reusable local test personas and operator runbook; activation/recovery implementation and production role assignments remain separate |
| [[Clinic Workspace]] | Synthetic clinic/inventory scope, permissions and labeled earlier implementation history |
| [[Clinic Workspace Design]] | Workload-board example, Operations and chart-tab navigation; account-owned themes, workflow proposals and verified versus unimplemented boundaries |
| [[Clinic Frontend Backend Mapping]] | Current frontend-to-implemented-backend readiness map, five user-flow diagrams, minimum read-only context/schedule/patient/encounter implementation, full target-entity coverage, remaining contracts and phased acceptance |
| [[Data Modeling]] | Broader proposed clinical/security model, illustrative SQL and acceptance scenarios; not the executable schema |
| [[Multi-Clinic ERD Adversarial Review]] | Original image findings, revision-2 integrity recommendations and adverse-path cases; D-044 supersedes its former hardening-only scope, not its safety invariants |
| [[ERD Implementation Prompt]] | Revision-5 full backend/schema replacement handoff: final ERD amendments, complete module mapping, PaperTrail callback/job coverage, API/data transition and adversarial acceptance |
| [[Backend Verification Report]] | Final source audit: 68-entity/103-edge matrices, tests/seeds, corrections, security findings and open release gaps |
| [[Target-State Clinic ERD]] | Corrected design baseline with historical origin labels; use Backend Verification Report for observed table/model/API coverage and remaining gaps |
| [[Roadmap and Tasks]] | Canonical parent tasks and 27 smaller chunks across five workstreams, with dependencies, failure scenarios, exit evidence and unchanged milestone gates |
| [[Decisions]] | Explicit direction and supersession. Read relevant decisions and later refinements |
| [[Progress Log]] | Dated actual outcomes, failures and checks. Read relevant entries; earlier statements retain their event-date scope |
| [[Risks and Assumptions]] | Open risks/hypotheses, failure signals and required evidence; plans are not closure |
| [[Working Agreement]] | Session workflow, failure-first planning/acceptance, evidence distinctions, editing and information handling |

## Company and delivery — 01 Foundation

| Note | What it covers |
| --- | --- |
| [[Company Foundation]] | Confirmed market/model/team direction and unresolved business details |
| [[Customer and Offer]] | NP/PA customer, done-for-you offer, scope and packaging |
| [[Business Model]] | Launch/support economics, ordered-inventory-value fee basis and unresolved mechanics |
| [[Entity and Product Boundary]] | Consultancy, software company, physician services and clinic responsibilities; IP/contracts/data |
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

[[00 Home]] is the current-position dashboard; this note is the full note index. Obsidian configuration is local UI state, not business evidence: [app](.obsidian/app.json), [appearance](.obsidian/appearance.json), [core plugins](.obsidian/core-plugins.json), [graph](.obsidian/graph.json), [workspace](.obsidian/workspace.json). Read it only for relevant configuration work and preserve it unless changes are requested. Sync being enabled does not establish approved synchronization.

The founder removed retired `reference/` on 2026-08-31. Runtime source remains in `apps/`, delivery in `ops/aws/`, and the canonical schema in `apps/api/db/structure.sql` with its migrations. Historical reference files are recoverable from Git, not required reading or active dependencies.

## Keep this index useful

When adding/removing a note or changing its purpose, update this index and affected links. Verify selected paths exist; use targeted file/search inspection if an entry is missing or stale. Missing relevant sources block dependent conclusions, not unrelated work. Do not upload the vault or open patient records to fill a context gap.

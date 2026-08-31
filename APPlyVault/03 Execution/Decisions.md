---
type: decision-log
status: active
updated: 2026-08-31
---
# Decisions

Home: [[00 Home]] · Context: [[Company Foundation]] · Uncertainty: [[Risks and Assumptions]]

Record what was explicitly agreed, by whom, when, and why. Do not promote assistant recommendations or unverified legal statements into decisions. Decisions can be reopened; preserve the original and link the replacement.

## Confirmed direction and subsequent clarifications

| ID | Date / authority | Direction | Limits |
| --- | --- | --- | --- |
| D-001 | 2026-08-30 / founder brief | Help APPs start clinics in Texas; initial consultancy + SaaS concept | Original premise preserved; operating model refined by D-005 and D-011 below |
| D-002 | 2026-08-30 / founder brief | Use the MD's clinic-startup experience and SharePoint workflow as starting inputs | Refined by D-006 and D-012; does not itself establish generalizability, compliance, or commercialization rights |
| D-003 | 2026-08-30 / founder request | Use this Obsidian vault for planning, documentation, shared direction, and progress tracking | Cadence and human responsibilities still to agree |
| D-004 | 2026-08-30 / founder follow-ups | Both NPs and PAs; Sherman and North Texas; cash-pay primary-care / concierge-adjacent PLLC clinics | Exact clinical services, county coverage, and buyer stage remain open; aesthetics is adjacency only |
| D-005 | 2026-08-30 / founder follow-ups | Done-for-you clinic launch with minimal provider input, through first-patient readiness, including starter SharePoint EHR and ongoing support | Exact deliverables, required client approvals, price amounts, support terms, and completion criteria remain open |
| D-006 | 2026-08-30 / founder follow-ups | Kevin is a cofounder; two engineers previously mentioned; founder is bringing on a senior-developer friend | Friend's relationship to previous count, entity affiliation, compensation/equity, capacity, and IP terms unconfirmed; leadership refined by D-016 |
| D-007 | 2026-08-30 / founder follow-up | SharePoint initially, with an eventual bespoke replacement | Architecture, features, rollout, and data responsibilities remain open; EC2/S3 were examples, not a selection |
| D-009 | 2026-08-30 / founder latest answers | Consultancy launch package with ongoing support; separate software implementation fee plus recurring fees based on transactional value | Dollar amounts, billable metric/formula, payment intervals, inclusions, and review of actual fee arrangements remain open |
| D-011 | 2026-08-30 / founder follow-ups | Consultancy formed; EHR/inventory entity not formed; different ownership | Legal names/documents, software owner details, contracts, IP, bundling, and support split remain open |
| D-012 | 2026-08-30 / founder follow-up | Convert MD's existing documented legal/setup process into a packet applicants complete | Source materials expected tomorrow morning; scope, applicability, reuse rights, and review remain to assess |
| D-013 | 2026-08-30 / founder follow-up | No deadline pressure expressed | Do not impose a 90-day deadline or interpret this as unlimited budget or staffing |
| D-014 | 2026-08-30 / founder latest answers | Consultancy executes everything within the agreed launch scope with minimal provider input | Not assumed to authorize client signatures, clinical decisions, or unlimited spending; exact exceptions and deliverables to document |
| D-016 | 2026-08-30 / founder latest answers | Founder reports 49% consultancy ownership and sole direction-setting responsibility | Remaining 51% ownership unspecified; governing documents and formal voting/signature rights not reviewed; no software-entity authority inferred |
| D-017 | 2026-08-30 / founder latest answers | Kevin provides physician collaboration/delegation support, help with physician arrangements, and mentorship | Contracts, fees, oversight cadence, capacity, backup, and applicable professional requirements remain to document |

## Latest refinements

| ID | Date / authority | Direction | Limits |
| --- | --- | --- | --- |
| D-019 | 2026-08-30 / founder's six numbered answers | Refines D-006, D-009, and D-016: Kevin 51% / founder 49%; direction-setting documented per founder; senior developer is consultancy employee and software owner; recurring software fee based on percentage of ordered inventory value; Kevin proposes video knowledge bank with mentorship | Veto concern remains ambiguous; equity percentages for software, rates/mechanics, employment/IP terms, support/cost coverage, mentorship capacity and selling entity remain TBD. No documents reviewed or new legal conclusions made |
| D-020 | 2026-08-30 / founder's explicit redirect | Bootstrap the consultancy website and move implementation forward now; stop treating remaining business-decision questions as prerequisites | Marketing website only. No patient-data system, EHR architecture commitment, public-launch approval, filings, outreach, or invented business terms. See [[Website MVP]] |
| D-021 | 2026-08-30 / founder's website revision | Remove the entire clinic brief; add a Ruby on Rails backend, login for future material, and Contact page | Extends D-020 to a non-clinical client portal. No Ruby hosting target or public-launch approval supplied |
| D-022 | 2026-08-30 / founder's portal clarification | Provision and send client logins after payment; no public signup. After login show Paperwork with progress/signing, and Onboarding & Training with written guides and later Kevin videos. Keep EHR out | PDF generation/submission and institutional feedback are future work. SharePoint mapping is later; separately sold EHR/inventory remains separate. Actual packet/approved signing workflow absent; current signing is a synthetic demo, not a legal or institutional completion |
| D-023 | 2026-08-30 / founder's Git-layout clarification | Track `site/` as ordinary files in the APPly repository; it should not have its own Git history | Preserve current files and existing edits. Former nested metadata retained only as a local recovery backup; no history rewrite or submodule. Keep website publication limited to site-only source/build, never the vault |

Earlier table entries preserve what was known then; D-019 supplies the later answers. Remaining business questions are deferred, not silently resolved.

## Rails and clinic-workspace clarification

| ID | Date / authority | Direction | Limits |
| --- | --- | --- | --- |
| D-024 | 2026-08-30 / founder's hosting/frontend direction | Drop the JavaScript frontend and use Rails; prepare an AWS/EC2 path without a new paid hosting/authentication dependency or GitHub deployment requirement | No AWS resources/spending approved. US East supplied, exact region unresolved. BAA not in place; wholly synthetic development, with real-data gates unchanged |
| D-025 | 2026-08-30 / founder's latest clarification | Build both experiences in the same Rails website with front-facing separation: selling/onboarding/information versus clinic EHR, inventory, employee management and operations | Supersedes the intermediate external-site/link suggestion. Distinct layouts/navigation and explicit clinic access, not a separate domain. Software ownership remains separate. No approval for real records, shared production data infrastructure or clinical release. See [[Clinic Workspace]] |

**D-026 — 2026-08-30 / founder's navigation and development-clinic requests:** Each login has one developer-assigned clinic; people working at multiple clinics use separate logins. Clinic Workspace opens the associated clinic directly, without a picker or self-service creation. Use a generic **Test Clinic** for local development. Login remains explicit; navigation must not create demo sessions. Refines D-025 and supersedes the earlier multi-membership-per-login proposal in [[Data Modeling]]. Synthetic-only and production-denial boundaries remain unchanged.

## EC2 hosting request

**D-027 — 2026-08-30 / founder's EC2 setup request:** Set up EC2 to host the current application and database. This selects the hosting workstream previously prepared under D-024; it does not select the future clinical production architecture or authorize real records. The implementation keeps the existing SQLite adapter for private synthetic staging. **Later same-session clarifications:** use the current root session until further notice; then reduce storage and start free. After the account's introductory EC2 allowance was found expired, the founder explicitly instructed launch and accepted paying. The revised `us-east-1` setup is t3.micro with 8 GiB root plus 2 GiB data, about $14/month before image storage, snapshots, extra usage and tax. This replaces the larger unapproved $25 proposal and supersedes the earlier non-root prerequisite for this task; individual least-privilege access remains recommended. No MFA assessment, other-user access, unlimited spending, public release or real-data approval is implied. See T-20 and [[Progress Log]].

## Pharmacy scope clarification

**D-028 — 2026-08-30 / founder's pharmacy-scope clarification:** Assume clinics will want the option of any pharmacy setup and develop the product from that broad scope. Do not require choosing one operating model before designing the shared pharmacy foundation. [[Pharmacy Inventory Data Requirements#Configurable pharmacy capabilities]] translates this into a proposed configurable model; exact schema, capability combinations and delivery sequence remain implementation details. This is a product planning assumption, not validated customer demand, professional authority for every clinic, a claim of universal implemented coverage, or permission for APPly to distribute drugs. Real-data/professional gates and the separate consultancy/software/clinic boundaries remain unchanged. Refines the earlier DD's model-selection dependency without superseding its applicability findings.

## Supplier pricing integration deferred

**D-029 — 2026-08-30 / founder's explicit deferral:** put supplier product/price integration work on hold and preserve the current findings and necessary future work in the vault. [[Inventory Price Comparison Sources]] holds the source baseline, advertised API/network capabilities and proposed design; T-37 in [[Roadmap and Tasks]] holds the deferred task. Resume only when the founder reprioritizes it; no date or automatic follow-up is set. This accepts the deferral, not a supplier, commercial agreement, architecture, implementation scope or purchasing/billing workflow. D-028's broad pharmacy direction, T-13/T-34 inventory work, T-14 pricing mechanics, existing hosting work and all professional/real-data gates remain unchanged.

## Separate staging and production

**D-030 — 2026-08-30 / founder request:** establish separate production and staging containers as the project's release structure, and remove or disable the demo in production. Implemented as two small private EC2 environments with independent SQLite storage, secrets and instance roles, preserving the existing staging records. The existing payment/root authorization continues; estimated combined baseline is about $28/month before extras. The release design builds on successful main CI, deploys staging, then explicitly promotes the same digest to production. GitHub activation and public domain/DNS configuration remain outstanding. This does not authorize PHI, confidential applicant records, real signatures or removal of clinic-production denial; broader security/operational gates remain open. See [[CICD]] and T-20/T-22.

## Pending choices

| ID | Decision | Options / input needed |
| --- | --- | --- |
| D-008 | Validation commitments | Interview batch, offer tests, criteria, owners, dates |
| D-010 | Working name and operating cadence | Confirm APPly name; shared access, backup, weekly review |
| D-015 | Intercompany and patient-data responsibilities | Different ownership and formation status known; resolve IP, contracts/billing, initial SharePoint supplier, support, access, and migration |
| D-018 | Package, support, and pricing specification | Rates, transactional-value definition, outside-cost treatment, support limits, and Kevin's service economics |

Open implementation details do not negate confirmed direction. Kevin's prior attorney involvement is recorded as supporting context in [[MD Pilot]] and [[Source Register]], not as approval of the consultancy's entire client packet. Record amendments here without repeatedly reopening settled market, execution, or entity-stage decisions.

## Repository and vault handoff maintenance

**D-034 — 2026-08-31 / founder's removal and documentation requests:** the founder removed the retired `reference/` folder after mapping the generic app into the current implementation. Keep it removed and reconcile active documentation; prior source remains in Git history. This supersedes D-032's retention of imported reference files, not its domain boundaries. Rails migrations and `apps/api/db/structure.sql` remain authoritative. No application feature, runtime data or hosted release is removed by this documentation work.

**D-035 — 2026-08-31 / founder's explicit review-protocol request:** add [[01 Table of Contents]] and change root `AGENTS.md` to require relevant-section review selected through that index instead of a full-vault read. Keep CI/CD prominent for developer onboarding. This changes reading/navigation scope only; synthetic-only, secret-handling, source/evidence, preservation and professional/release safeguards remain unchanged. The preceding full-review records stay historical, not future requirements.

## Decision entry format

- ID and title:
- Status: proposed / accepted / rejected / superseded.
- Decision date and decision-maker(s):
- Question and relevant evidence:
- Options considered, including defer/do nothing:
- Decision and rationale:
- Scope, tradeoffs, and unresolved risks:
- Needed professional review, if any:
- Owner, follow-up tasks, and review trigger:
- Supersedes / superseded by:

## PostgreSQL and inventory foundation

**D-031 — 2026-08-30 / founder's database implementation request:** Switch everything to PostgreSQL because SQLite is unsuitable for the intended scope, and work through the identified gaps using engineering recommendations. This authorizes the synthetic runtime/schema/inventory-foundation implementation recorded in [[PostgreSQL and Inventory Foundation]], superseding the SQLite starter choice for future application releases. Preserve existing history and verify conversion/recovery; do not conflate prepared code with a completed hosted cutover. D-028 broad optionality, D-029 supplier-pricing deferral and D-030 environment/demo separation remain. This request does not approve clinical capability activation, PHI, public release, new supplier integrations or bypass of existing security/release gates.

## Software structure and incremental refactor

**D-032 — 2026-08-30 / founder's approval to begin the recommended refactor:** Keep one Rails application with explicit launch, clinic-care, inventory, staff, shared identity/HTML and external-integration ownership. Place the complete app in `apps/apply/`, AWS tooling in `ops/aws/`, and imported pharmacy designs in `reference/pharmacy/`; keep the vault canonical for requirements, decisions and tasks. [[Software Architecture]] records the contract and incremental implementation. Preserve current behavior, data/history, dependencies, existing work and historical Sites metadata; no microservice/engine/new frontend is selected. The first increment retained a temporary local compatibility link to protect existing runtime paths. This authorizes source refactoring, not Git publication, deployment, hosted PostgreSQL cutover, new integrations or removal of any clinical/confidential-data gate.

**D-032 continuation — 2026-08-30 / founder follow-up:** proceed through the full recommended refactor unless an issue requires escalation. The cohesive domain/query/workflow/presentation changes and verified local path transition are now complete; the temporary link was retired without resetting storage or credentials. This extends source implementation scope only; the release, integration and real-data exclusions above remain. See [[Progress Log#2026-08-30 — Full software-structure refactor completed]].

## Frontend and backend separation

**D-033 — 2026-08-30 / founder's frontend/backend request and approval:** separate browser presentation from backend responsibilities. The founder accepted the proposed independent frontend and Rails API, superseding D-024's JavaScript removal and the single Rails-rendered runtime aspect of D-025/D-032. Keep one repository and the established launch/care/inventory/staff/identity domain ownership. Implementation uses `apps/web` for React/TypeScript screens and `apps/api` for Rails JSON, sessions/CSRF, authorization, workflows and PostgreSQL. Preserve browser URLs, data history, encryption derivation, clinic permissions and production clinic/demo denial. Source/build/local-tooling changes are authorized; Git publication, hosted cutover, new integrations and real-data use are not. Implementation initially paused under T-40 for the verification-cleanup issue recorded in [[Progress Log#2026-08-30 — Frontend API split paused after verification cleanup issue]].

**D-033 continuation — 2026-08-31:** after disclosure of the verifier cleanup issue, the founder confirmed `apply_test` was disposable test/development data and explicitly authorized recreating it. Recreated from current migrations; no original test-data recovery claimed. The corrected scratch cleanup preserves the recreated database identity. The authorized frontend/API refactor is now complete locally under T-40; see [[Progress Log#2026-08-31 — Frontend and API separation completed; test database recreated]]. Deployment and real-data exclusions remain unchanged.

## Selectable clinic themes

**D-036 — 2026-08-31 / founder's design follow-up (U-27):** staff will use both desktop and tablet; implement all three presented clinic themes and let users choose. Sage & ivory, Mineral blue and Warm graphite each support Light, Dark and Follow system. Browser-local persistence and Sage / Follow system as the initial default are bounded implementation choices, not a request for cross-device account sync. [[Clinic Workspace Design]] records behavior and T-41 local delivery. This accepts theme choice, not the proposed intake/clinician layouts, clinical authority, intake/triage/signing/prescription implementation, deployment or real-data use.

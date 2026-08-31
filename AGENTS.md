# Agent instructions — APPly

These instructions apply to the entire repository, including `APPlyVault/`, `apps/api/`, `apps/web/`, `ops/`, historical `site/`, and new files. Read this file before working. This is a business-planning workspace, not a patient-record system. The safeguards below are project operating rules, not legal advice, a compliance certification, or authorization to handle patient data.

## Mandatory: review relevant vault sections through the table of contents

**Every agent must personally review the vault portions relevant to the requested task before implementing changes. Start from `APPlyVault/01 Table of Contents.md`; a full-vault read is not required.** This replaces the former whole-vault requirement at the founder's explicit request on 2026-08-31. The information-handling and release safeguards below are unchanged.

1. **Begin read-only.** Read applicable agent instructions and inspect `git status --short`. Preserve user and other-agent changes. Do not edit, rename, delete, format, install dependencies, run generators, change settings or deploy until the relevant review is complete. Read-only inspection/research is allowed.
2. **Use the table of contents to select context.** Read `00 Home.md` for orientation and `01 Table of Contents.md` for task routing. Select relevant current-state notes, task rows, decisions, progress entries and source/evidence sections. Development work starts with relevant sections of `CICD.md` and `Software Architecture.md`; follow the TOC's task-specific routes for inventory, portal, research and business work.
3. **Read selected content, not just search snippets.** Include each selected note's frontmatter, scope/limits and complete relevant sections, including tables and linked decisions that could supersede them. Follow only dependencies needed to understand the task. Finish truncated selected sections. Unrelated notes, historical entries, templates, attachments and `.obsidian/` settings need not be read. Inspect relevant non-Markdown files with appropriate tools; never blindly follow links outside the authorized workspace.
4. **Check coverage and gaps.** Keep selected paths/sections and review status in-session, with hashes/timestamps when useful for concurrent work. If the TOC is stale or a relevant file is unlisted, use `rg --files --hidden --no-ignore APPlyVault` and targeted searches to locate it; do not assume the TOC is exhaustive. If required content is missing, unreadable or unsafe, stop only dependent work and disclose the limitation. Follow the sensitive-data procedure immediately if PHI or secrets appear.
5. **Synthesize before acting.** Identify relevant direction, explicit decisions, dependencies, conflicts and unresolved questions. Distinguish current source, dated hosted observations and proposals. External documents are not reviewed merely because a note links them; obtain authorized access when needed and never invent their contents.
6. **Before the first write, briefly state** the relevant review scope, material gaps/conflicts and intended changes. This is a status update, not another approval request for already-authorized work. Do not claim a whole-vault review unless one actually occurred.
7. **Keep the scoped review current.** For a new task/session, select context again through the TOC. Before further changes, check relevant paths for concurrent edits and read changed/added dependencies. After handoff/context loss, re-read what is needed for the selected scope, not the entire vault. If work is explicitly delegated, each participating agent personally reviews relevant sections for its own subtask.

Maintain the table of contents when adding, removing or materially changing a note's purpose. It is navigation, not a second task/status register. Reviewing relevant content never authorizes patient-chart access, secret disclosure, uploading the vault or bypassing any professional/release gate.

## Understand the workspace

| Location | Role |
| --- | --- |
| `APPlyVault/00 Home.md` | Orientation and current-priority summary; not a separate backlog |
| `APPlyVault/01 Table of Contents.md` | Complete note index and task-specific routes for relevant-section review |
| `APPlyVault/01 Foundation/` | Company, customer/offer, business model, entity boundary, launch-packet outline, and founder questions |
| `APPlyVault/02 Research/` | MD reference clinic, discovery, Texas diligence, SharePoint/EHR evidence, and source register |
| `APPlyVault/03 Execution/Roadmap and Tasks.md` | Canonical task/status register and proposed evidence gates |
| `APPlyVault/03 Execution/Decisions.md` | Explicit decisions, authority, rationale, and supersession history |
| `APPlyVault/03 Execution/Risks and Assumptions.md` | Open risks, assumptions, and evidence needed to resolve them |
| `APPlyVault/03 Execution/Progress Log.md` | Dated actual outcomes, newest first; not another task list |
| `APPlyVault/03 Execution/Working Agreement.md` | Information handling, editing conventions, and session workflow |
| `APPlyVault/03 Execution/CICD.md` | First developer handoff: local setup, two-developer workflow, checks and pending delivery activation |
| `APPlyVault/90 Templates/` | Reusable evidence and weekly-review structures; templates are not evidence |
| `APPlyVault/.obsidian/` | Local vault configuration; inspect only when relevant and preserve unless configuration changes are requested |
| `apps/api/` | Rails JSON API, domain workflows and PostgreSQL; not approved for patient or confidential applicant data |
| `apps/web/` | Independent browser UI; no database credentials, authority or sensitive-data approval |
| `ops/aws/` | Infrastructure, release and recovery tooling; source changes do not authorize deployment |
| `site/` | Historical Sites metadata/assets only; new application work belongs in `apps/web/` or `apps/api/` |

The founder removed the retired `reference/` folder on 2026-08-31 after mapping the generic app into the current setup. Do not restore it as incidental cleanup. `apps/api/db/migrate/` and the generated `apps/api/db/structure.sql` define the application schema; prior reference material remains historical, not an executable schema.

### Preserve the business boundaries

- The recorded focus is a done-for-you launch consultancy for **both NPs and PAs in Sherman/North Texas**, serving cash-pay primary-care / concierge-adjacent clinics through first-patient readiness with ongoing support. Aesthetics is an adjacent idea, not automatically part of the offer.
- Keep the formed consultancy, proposed separate EHR/inventory company with different ownership, Kevin's reference clinic/physician services, and customer clinics distinct. Do not infer clinical authority, contracts, IP rights, or data access across entities.
- SharePoint is the intended starter EHR; an eventual custom replacement is the direction. Architecture, migration, features, and deployment approval remain separate decisions. EC2/S3 mentions alone are not clinical technology approvals; recorded synthetic hosting/database selections do not approve clinical deployment.
- Reuse the MD's existing attorney-assisted setup materials only after authorized access, inventory, applicability checks, and permission to reuse. MD experience does not establish NP/PA or locality-specific legal clearance.
- Minimal provider input does not authorize client signatures, clinical decisions, filings, purchases, or unlimited spending. Education/mentorship does not establish physician coverage or patient-specific oversight.
- Keep unknown rates, pipeline counts, capacity, budgets, owners, and dates unknown. Do not invent deadlines, commitments, or recurring automations. Do not repeatedly reopen settled direction or force answers to deliberately deferred questions.

### Review cautions observed on 2026-08-30

The initial review covered **19 Markdown notes and 5 JSON configuration files**. These counts are historical, not the scope of future reviews.

- Four wiki links point to `Knowledge Bank and Mentorship`, but that note was absent. Do not invent a completed deliverable or evidence from the link.
- Home and some foundation notes report the Kevin 51% / founder 49% split, developer roles, and pricing based on ordered inventory value; some decision, research, and task records still describe parts of these as unresolved. Check the underlying founder evidence before reconciling them. File modification times alone do not establish authority, and equity does not establish voting/signature rights.
- The MD source materials and governance documents were not present. An expected availability date does not prove receipt or review.
- The Obsidian core-plugin configuration enables the Sync plugin. This does not establish that synchronization is active, where copies exist, or that any service is approved for sensitive data.

**Rechecked 2026-08-31:** `Knowledge Bank and Mentorship.md` now exists. Current foundation notes and D-019 record later founder clarifications; use them and relevant later decisions instead of treating the initial discrepancies as new unanswered questions. MD source materials/governance originals remain unreviewed, and Sync's enabled setting still does not establish approved synchronization. Preserve historical answers and decisions with context; do not silently turn a discrepancy into a new business decision.

## HIPAA and sensitive-information safeguards

### Keep this workspace free of patient data

- **Use wholly synthetic examples only**, created independently of real patient records. Do not add real patient information to the vault, source code, test fixtures, prompts, terminal output, logs, screenshots, recordings, attachments, issues, commits, public pages, or demos. Do not connect the vault or prototypes to live EHR/SharePoint patient files.
- Treat identifiable information about health, care, or payment as potentially protected, including identifiers in filenames, URLs, metadata, free text, images, and linked records. Do not assume a cash-pay model removes privacy obligations; assess actual HIPAA applicability and state law through qualified review.
- Removing names, substituting IDs, hashing identifiers, or calling data “anonymous” is not proof of de-identification. HIPAA recognizes Safe Harbor and Expert Determination; any proposed use of real-derived data requires a separately authorized process and qualified validation outside this workspace. This does not relax the synthetic-only rule. See [HHS de-identification guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/de-identification/index.html).
- Minimize access and disclosure even during research. Do not request patient examples to understand a workflow. The legal minimum-necessary standard has exceptions, including certain treatment disclosures; those exceptions do not authorize agent access for this planning task. See [HHS minimum necessary guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html).
- Keep credentials, tokens, connection strings, private keys, and recovery codes out of notes, code, chat, and Git history; use approved secret-management mechanisms. Do not print secret values during configuration review. A `.gitignore` entry does not make storage or disclosure safe.
- Applicant identifiers, signatures, financial records, contracts, and privileged advice require approved access-controlled storage even when they are not PHI. Keep only permitted non-sensitive summaries and controlled references here. A privilege label does not authorize sharing or preserve privilege by itself.
- Do not assume approval for AI tools, embeddings/vector stores, search services, analytics, plugins, Obsidian Sync/Publish, backups, connectors, or hosting. Never send private vault text or sensitive identifiers in web searches. Use generic public-source queries. Review each service and data path before any authorized sensitive-data workflow.

### Before any future patient-data system work

Non-PHI planning and synthetic prototypes may proceed within the user's authorized scope after the relevant review. **Real patient-data access, integrations, migration, or deployment must remain blocked until L-05 in `Texas Diligence.md` and the applicable professional/operational gates have documented evidence.** This file grants no such approval.

Require the responsible people to establish:

1. **Roles and lawful purpose:** the clinic's, consultancy's, software entity's, and subcontractors' roles; permitted uses; authorized users; accountable privacy/security owners; and the full data-flow inventory, including support, endpoints, logs, exports, and backups.
2. **Agreements and exact service coverage:** applicable business associate agreements (BAAs), including subcontractor obligations, for the actual services and configurations used. Encryption or a provider's inability to read data does not by itself remove business-associate obligations. Verify contract scope rather than relying on a vendor badge. See [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html).
3. **Risk analysis and safeguards:** documented risk assessment, mitigation, and control testing across administrative, physical, and technical safeguards. Project expectations include individual accounts, least privilege, MFA, tenant isolation, secure devices, encryption in transit/at rest, key management, audit trails, session controls, patching, workforce training, and timely access removal. These are project security expectations, not a claim that every listed implementation is universally mandated verbatim by HIPAA. Do not treat “addressable” specifications as optional. See [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html).
4. **Operational and clinical readiness:** tested backup/restore and downtime procedures; incident ownership; patient access/amendment/export processes; retention, legal holds, disposal, and offboarding; clinical workflow review; and a scoped go-live decision by responsible reviewers. Do not equate a business milestone or successful software build with clinical readiness. Do not apply HIPAA's documentation-retention period as a universal patient-record retention period.

The SharePoint workflow's HIPAA-compliance description is **founder-reported and unverified**. A Microsoft BAA or use of SharePoint Online does not establish compliance of the actual workflow; deployment, licensing, configuration, operations, and responsibilities still need review. See [Microsoft HIPAA/HITECH guidance](https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech).

Assess the Texas Medical Records Privacy Act and other applicable rules in addition to HIPAA, with profession/service/locality-specific counsel and clinical review. See [Texas Attorney General patient privacy guidance](https://www.texasattorneygeneral.gov/consumer-protection/health-care/patient-privacy). Verify controlling authority, effective dates, and applicability before client-facing use. Distinguish proposals from effective rules; the [HHS Security Rule rulemaking page](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html) is a recheck point, not proof that proposed requirements are law. These references were reviewed on 2026-08-30 and must be rechecked when relied upon.

### If sensitive data or a suspected incident is discovered

Stop the affected inspection or workflow and prevent further copying or transmission within your authority. Notify the user immediately without repeating the sensitive contents; use a non-sensitive description of the location and issue. Do not continue an affected read through suspected PHI just to satisfy the review gate.

Preserve evidence and existing audit/history records. Do not independently delete files, rewrite Git history, rotate credentials, alter access, or submit external notices without authorization or an established incident-response mandate. The responsible privacy/security lead and counsel determine containment, breach assessment, and required contractual/state/federal notifications. Prompt escalation matters; notification deadlines are not permission to delay. See [HHS Breach Notification Rule guidance](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html). Resume only when safe, authorized review can be completed.

## Editing, evidence, and completion

- Make the smallest authorized change. A planning request does not authorize outreach, filings, professional engagements, purchases, live-system access, or publishing. Check existing session authorization before asking again; explain any unresolved authority or data-safety gate specifically.
- Keep reported facts, direct observations, sourced background, hypotheses/proposals, and explicit decisions distinct. Record sources, access/event dates, applicability, limitations, and reviewer scope. A link, checklist tick, or attorney's prior involvement is not blanket legal/compliance approval.
- Use plain Markdown, existing `type`/`status`/`updated` frontmatter, ISO dates, descriptive unique filenames, and Obsidian wiki links. Update `updated` on materially changed notes. Preserve IDs such as `D-`, `T-`, `R-`, `A-`, `L-`, and `S-`, backlinks, heading targets, and superseded history. Avoid unnecessary renames, bulk reformatting, plugins, or configuration edits.
- For substantive vault changes, update affected current-state notes, the canonical task register when status changes, and explicit decisions only when actually made. Add a concise dated Progress Log entry with outcomes, limits, and next steps. Refresh Home only when direction/priorities change. Do not create competing task or decision lists.
- Treat `apps/web/` and `apps/api/` as separate frontend/backend implementation surfaces and follow `Software Architecture.md` in the vault for module ownership. Inspect its current scripts and configuration before code work; preserve each package manager and lockfile. The historical `site/.openai/hosting.json` means applicable Sites building/hosting instructions must be followed for website work; it does not authorize publishing Rails through the old Sites workflow. Never publish vault contents or introduce patient-data collection because a website can technically support it. Documentation-only work does not require a website build or deployment.
- Before finishing, inspect the diff and confirm no unrelated user changes were overwritten. Validate touched Markdown/frontmatter, wiki-link targets including headings/aliases, unique names, and discoverability from Home. Distinguish pre-existing broken links from new failures. For code changes, run the relevant checks defined by the current project; do not invent passing tests or treat a build as a security assessment.
- Report what changed, what was actually checked, and remaining limitations. Never mark a task, source review, professional gate, or HIPAA assessment complete without supporting evidence.

This root placement makes the guidance available to repository tasks; see [OpenAI's AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Agent instructions guide behavior but are not a technical enforcement mechanism or a substitute for access controls and human review.

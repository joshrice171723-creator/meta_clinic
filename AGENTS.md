# Agent instructions — APPly

These instructions apply to the entire repository, including `APPlyVault/`, `site/`, and new files. Read this file before working. This is a business-planning workspace, not a patient-record system. The safeguards below are project operating rules, not legal advice, a compliance certification, or authorization to handle patient data.

## Mandatory: review the entire vault before any changes

**Every agent must personally review the relevant portions of the current vault in before implementing any change anywhere in this repository.** Reading only Home, search matches, relevant notes, a previous summary, or another agent's report does not satisfy this requirement. This strengthens the shorter startup protocol in `APPlyVault/03 Execution/Working Agreement.md`.

1. **Begin read-only.** Read applicable agent instructions and inspect `git status --short`. Preserve existing user and other-agent changes. Do not create, edit, rename, move, delete, format, install dependencies, run generators, change settings, or deploy until the review is complete. Read-only inspection and research are allowed.
2. **Inventory the whole vault**, including ignored, hidden, untracked, and newly added files. From the repository root, use `rg --files --hidden --no-ignore APPlyVault` and inspect directory/symlink entries as needed. Do not rely on Git-tracked files, the Home map, or a fixed file count. Do not follow links outside the authorized workspace blindly.
3. **Read all content.** Start with `00 Home.md`, `03 Execution/Working Agreement.md`, `03 Execution/Decisions.md`, and `03 Execution/Progress Log.md`; then read every remaining note in every folder. Include templates, frontmatter, tables, historical entries, and all `.obsidian/` configuration. Review attachments, canvases, PDFs, images, or other formats with appropriate tools if present. A filename listing, metadata check, or truncated tool response is not a content review; use bounded batches and finish omitted portions.
4. **Track coverage in the session**, without creating a review file before this gate passes. Record each path and review status, with hashes or timestamps to detect changes. Account for every inventoried file. If anything is inaccessible, unreadable, or unsafe to review, identify the limitation and stop before implementation; do not silently exclude it or claim full review. Follow the sensitive-data procedure below if PHI or secrets appear.
5. **Synthesize before acting.** Identify established direction, unresolved questions, explicit decisions, task dependencies, conflicting records, broken links, and the implications for the requested change. Referenced external documents are not automatically reviewed: distinguish available local content from missing or restricted originals. Obtain authorized source access when the task depends on those originals; never invent their contents.
6. **Before the first write, tell the user** that the whole-vault review is complete, give the file/type counts, disclose relevant gaps or conflicts, and state the intended files and scope of change. This is a status statement, not an extra approval request for already-authorized work. An incomplete local review blocks changes; a missing external source blocks conclusions or actions that depend on it.
7. **Keep the review current.** Repeat the full review for each new task/session. During a task, re-inventory before implementing changes and read any added or changed files; account for removals and concurrent edits. After a handoff or context loss, re-read whatever is necessary to establish complete coverage. If work is delegated, each participating agent has the same full-review obligation; delegation does not satisfy it for another agent.

Do not weaken this gate or the information-handling rules to finish a task faster. Reviewing the entire vault never authorizes opening patient charts, exposing secrets, or uploading the vault to another service.

## Understand the workspace

| Location | Role |
| --- | --- |
| `APPlyVault/00 Home.md` | Orientation and current-priority summary; not a separate backlog |
| `APPlyVault/01 Foundation/` | Company, customer/offer, business model, entity boundary, launch-packet outline, and founder questions |
| `APPlyVault/02 Research/` | MD reference clinic, discovery, Texas diligence, SharePoint/EHR evidence, and source register |
| `APPlyVault/03 Execution/Roadmap and Tasks.md` | Canonical task/status register and proposed evidence gates |
| `APPlyVault/03 Execution/Decisions.md` | Explicit decisions, authority, rationale, and supersession history |
| `APPlyVault/03 Execution/Risks and Assumptions.md` | Open risks, assumptions, and evidence needed to resolve them |
| `APPlyVault/03 Execution/Progress Log.md` | Dated actual outcomes, newest first; not another task list |
| `APPlyVault/03 Execution/Working Agreement.md` | Information handling, editing conventions, and session workflow |
| `APPlyVault/90 Templates/` | Reusable evidence and weekly-review structures; templates are not evidence |
| `APPlyVault/.obsidian/` | Local vault configuration; inspect but preserve unless configuration changes are requested |
| `site/` | Separate website surface; never assume it is approved for patient or confidential applicant data |

### Preserve the business boundaries

- The recorded focus is a done-for-you launch consultancy for **both NPs and PAs in Sherman/North Texas**, serving cash-pay primary-care / concierge-adjacent clinics through first-patient readiness with ongoing support. Aesthetics is an adjacent idea, not automatically part of the offer.
- Keep the formed consultancy, proposed separate EHR/inventory company with different ownership, Kevin's reference clinic/physician services, and customer clinics distinct. Do not infer clinical authority, contracts, IP rights, or data access across entities.
- SharePoint is the intended starter EHR; an eventual custom replacement is the direction. Architecture, migration, features, and deployment approval remain separate decisions. EC2/S3 mentions are not technology selections.
- Reuse the MD's existing attorney-assisted setup materials only after authorized access, inventory, applicability checks, and permission to reuse. MD experience does not establish NP/PA or locality-specific legal clearance.
- Minimal provider input does not authorize client signatures, clinical decisions, filings, purchases, or unlimited spending. Education/mentorship does not establish physician coverage or patient-specific oversight.
- Keep unknown rates, pipeline counts, capacity, budgets, owners, and dates unknown. Do not invent deadlines, commitments, or recurring automations. Do not repeatedly reopen settled direction or force answers to deliberately deferred questions.

### Review cautions observed on 2026-08-30

The initial review covered **19 Markdown notes and 5 JSON configuration files**. These counts are historical, not the scope of future reviews.

- Four wiki links point to `Knowledge Bank and Mentorship`, but that note was absent. Do not invent a completed deliverable or evidence from the link.
- Home and some foundation notes report the Kevin 51% / founder 49% split, developer roles, and pricing based on ordered inventory value; some decision, research, and task records still describe parts of these as unresolved. Check the underlying founder evidence before reconciling them. File modification times alone do not establish authority, and equity does not establish voting/signature rights.
- The MD source materials and governance documents were not present. An expected availability date does not prove receipt or review.
- The Obsidian core-plugin configuration enables the Sync plugin. This does not establish that synchronization is active, where copies exist, or that any service is approved for sensitive data.

Recheck these observations. Preserve historical answers and decisions with context; do not silently turn a discrepancy into a new business decision.

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

Non-PHI planning and synthetic prototypes may proceed within the user's authorized scope after the full review. **Real patient-data access, integrations, migration, or deployment must remain blocked until L-05 in `Texas Diligence.md` and the applicable professional/operational gates have documented evidence.** This file grants no such approval.

Require the responsible people to establish:

1. **Roles and lawful purpose:** the clinic's, consultancy's, software entity's, and subcontractors' roles; permitted uses; authorized users; accountable privacy/security owners; and the full data-flow inventory, including support, endpoints, logs, exports, and backups.
2. **Agreements and exact service coverage:** applicable business associate agreements (BAAs), including subcontractor obligations, for the actual services and configurations used. Encryption or a provider's inability to read data does not by itself remove business-associate obligations. Verify contract scope rather than relying on a vendor badge. See [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html).
3. **Risk analysis and safeguards:** documented risk assessment, mitigation, and control testing across administrative, physical, and technical safeguards. Project expectations include individual accounts, least privilege, MFA, tenant isolation, secure devices, encryption in transit/at rest, key management, audit trails, session controls, patching, workforce training, and timely access removal. These are project security expectations, not a claim that every listed implementation is universally mandated verbatim by HIPAA. Do not treat “addressable” specifications as optional. See [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html).
4. **Operational and clinical readiness:** tested backup/restore and downtime procedures; incident ownership; patient access/amendment/export processes; retention, legal holds, disposal, and offboarding; clinical workflow review; and a scoped go-live decision by responsible reviewers. Do not equate a business milestone or successful software build with clinical readiness. Do not apply HIPAA's documentation-retention period as a universal patient-record retention period.

The SharePoint workflow's HIPAA-compliance description is **founder-reported and unverified**. A Microsoft BAA or use of SharePoint Online does not establish compliance of the actual workflow; deployment, licensing, configuration, operations, and responsibilities still need review. See [Microsoft HIPAA/HITECH guidance](https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech).

Assess the Texas Medical Records Privacy Act and other applicable rules in addition to HIPAA, with profession/service/locality-specific counsel and clinical review. See [Texas Attorney General patient privacy guidance](https://www.texasattorneygeneral.gov/consumer-protection/health-care/patient-privacy). Verify controlling authority, effective dates, and applicability before client-facing use. Distinguish proposals from effective rules; the [HHS Security Rule rulemaking page](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html) is a recheck point, not proof that proposed requirements are law. These references were reviewed on 2026-08-30 and must be rechecked when relied upon.

### If sensitive data or a suspected incident is discovered

Stop the affected inspection or workflow and prevent further copying or transmission within your authority. Notify the user immediately without repeating the sensitive contents; use a non-sensitive description of the location and issue. Do not continue a full-vault read through suspected PHI just to satisfy the review gate.

Preserve evidence and existing audit/history records. Do not independently delete files, rewrite Git history, rotate credentials, alter access, or submit external notices without authorization or an established incident-response mandate. The responsible privacy/security lead and counsel determine containment, breach assessment, and required contractual/state/federal notifications. Prompt escalation matters; notification deadlines are not permission to delay. See [HHS Breach Notification Rule guidance](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html). Resume only when safe, authorized review can be completed.

## Editing, evidence, and completion

- Make the smallest authorized change. A planning request does not authorize outreach, filings, professional engagements, purchases, live-system access, or publishing. Check existing session authorization before asking again; explain any unresolved authority or data-safety gate specifically.
- Keep reported facts, direct observations, sourced background, hypotheses/proposals, and explicit decisions distinct. Record sources, access/event dates, applicability, limitations, and reviewer scope. A link, checklist tick, or attorney's prior involvement is not blanket legal/compliance approval.
- Use plain Markdown, existing `type`/`status`/`updated` frontmatter, ISO dates, descriptive unique filenames, and Obsidian wiki links. Update `updated` on materially changed notes. Preserve IDs such as `D-`, `T-`, `R-`, `A-`, `L-`, and `S-`, backlinks, heading targets, and superseded history. Avoid unnecessary renames, bulk reformatting, plugins, or configuration edits.
- For substantive vault changes, update affected current-state notes, the canonical task register when status changes, and explicit decisions only when actually made. Add a concise dated Progress Log entry with outcomes, limits, and next steps. Refresh Home only when direction/priorities change. Do not create competing task or decision lists.
- Treat `site/` as a separate implementation surface. Inspect its current scripts and configuration before code work; preserve its package manager and lockfile. The existing `.openai/hosting.json` means applicable Sites building/hosting instructions must be followed for website work. Never publish vault contents or introduce patient-data collection because a website can technically support it. Documentation-only work does not require a website build or deployment.
- Before finishing, inspect the diff and confirm no unrelated user changes were overwritten. Validate touched Markdown/frontmatter, wiki-link targets including headings/aliases, unique names, and discoverability from Home. Distinguish pre-existing broken links from new failures. For code changes, run the relevant checks defined by the current project; do not invent passing tests or treat a build as a security assessment.
- Report what changed, what was actually checked, and remaining limitations. Never mark a task, source review, professional gate, or HIPAA assessment complete without supporting evidence.

This root placement makes the guidance available to repository tasks; see [OpenAI's AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Agent instructions guide behavior but are not a technical enforcement mechanism or a substitute for access controls and human review.

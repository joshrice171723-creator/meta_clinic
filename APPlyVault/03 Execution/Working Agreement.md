---
type: operating-guide
status: proposed
updated: 2026-08-31
---
# Working Agreement

Home: [[00 Home]] · Execution: [[Roadmap and Tasks]] · History: [[Progress Log]]

## Purpose

Keep direction, evidence, decisions, and next actions understandable to anyone joining the conversation. These conventions support the founder's request for a shared record; team roles and cadence remain to be agreed.

## Where things belong

- [[00 Home]]: orientation and a short current-priority summary.
- [[01 Table of Contents]]: complete note index and task-specific reading routes; maintain it when notes are added, removed or change purpose.
- Foundation notes: the latest coherent view of customer, offer, model, and unanswered questions.
- [[Clinic Launch Packet]]: internal plan for turning existing source materials into the applicant packet and delivery process; not a live applicant database.
- [[Entity and Product Boundary]]: consultancy versus separate EHR/inventory responsibilities, with unresolved contracts, IP, support, and data questions.
- [[Roadmap and Tasks]]: the single canonical task/status list.
- [[Decisions]]: explicit choices and their rationale.
- [[Risks and Assumptions]]: uncertainties and tests, not hidden conclusions.
- Research notes and evidence notes: observations, sources, applicability, and reviews.
- [[Progress Log]]: dated changes, outcomes, and links; not a second backlog.
- [[CICD]]: the first developer handoff, prominently linked from Home and the repository README; local frontend/API setup, two-developer Git/PR instructions, verified CI/staging delivery and pending production activation. Scope and dates of actual acceptance remain explicit.
- [[Software Architecture]]: repository responsibilities and module/dependency rules; independent frontend/Rails API with domain ownership, not a second task or decision register.

## Working session protocol

1. Read Home and [[01 Table of Contents]], then review only the notes/sections relevant to the task, including applicable decisions, task rows and progress evidence. Development starts with relevant [[CICD]] and [[Software Architecture]] sections. Root `AGENTS.md` defines this scoped review; a full-vault read is no longer required.
2. Separate reported facts, observed evidence, sourced background, proposals, and decisions.
3. Challenge the next increment using [[Working Agreement#Failure-first planning and review]], then capture actual evidence with a source/date and scope using [[Evidence Note Template]].
4. Update affected current-state notes and the task register; link an explicit decision if one was made.
5. Add a short progress entry: changed, learned, blocked, and next.
6. Refresh Home only if the overall position or priorities changed.

When the founder answers questions, summarize faithfully, mark unanswered parts, record explicit choices, and identify the next highest-value questions. Do not turn an exploratory preference into a commitment or silently override a prior decision.

The founder reports sole responsibility for consultancy direction, documented direction-setting, and a 49% interest; Kevin holds 51%. The senior developer will be a consultancy employee and software-company owner, with amounts/terms TBD. Keep ownership, voting, signature, and formal governance distinct; the veto concern is unresolved. Required applicant approvals and professional judgments remain explicit in the done-for-you workflow. The latest request prioritizes [[Website MVP]]; do not force further business answers before safe marketing-site implementation.

Reuse the MD's existing documented work once available; index it before creating replacements. Do not treat inaccessible materials as nonexistent. The founder has expressed no deadline pressure, so agree milestones and actual commitments without imposing an arbitrary launch calendar.

## Proposed cadence

A weekly 20–30 minute founder/MD review: progress, new field evidence, blockers, decisions, and the next three priorities. Use [[Weekly Review Template]]. Confirm participants and timing before treating this as scheduled.

No reminder, automation, background monitoring, or automatic synchronization has been set up by this work. Human owners and backup/access practices remain open under T-11.

## Failure-first planning and review

D-037 makes **“How is this going to fail?”** a required planning question, not a claim that a failure has occurred. Apply it to software, source ingestion, service delivery and business assumptions. Challenge the mechanism and evidence, not the person. Do not reopen settled direction without material contrary evidence or force deferred commercial decisions before they are needed.

Before starting a substantive chunk, record in its canonical task or linked evidence note:

1. **Outcome and boundary:** one observable result, entry dependencies, exclusions, permitted environment/data and accountable owner. Name the smallest independently reviewable change; separate design, implementation, verification and release where they have different gates.
2. **Failure hypothesis:** an assumption that could be wrong, a concrete trigger, and the resulting user, data, operational or business harm. Consider ordinary mistakes as well as deliberate misuse.
3. **Detection and prevention:** what signal would reveal the failure, who notices it, and what guard prevents an unsafe or misleading outcome. “We will be careful” is not a control.
4. **Disproof and recovery:** a bounded synthetic negative test or authorized tabletop, expected result, stop condition and safe recovery/manual fallback. Define what evidence would make us revise or reject the plan, not only what would confirm it.
5. **Exit record:** actual versus expected outcome, code/content version and environment, evidence reference, reviewer/date, unresolved risks and next action. Untested means untested; a plan, screenshot or passing happy path is not complete acceptance.

For each chunk, consider missing/wrong/stale input; wrong account/clinic or excess authority; concurrent/repeated actions; interrupted sessions and partial/out-of-order failures; unavailable people/services; and falsely reported completion. Cover applicable cases with tests; mark others not applicable with a reason. For business work also challenge scope, demand, cost, capacity, reuse rights and reliance on one person. Link existing R-/A-/L- items instead of creating duplicate registers.

Testing must stay within authorized systems and wholly synthetic data. This method does not authorize live penetration testing, destructive failure injection, patient access, external messages, purchases or deployments. Start with local tests/mocks or a tabletop; hosted exercises need their own approved targets and recovery scope. Do not remove guards to make a test pass.

Do not accept a chunk with unresolved unauthorized access, silent loss/alteration, duplicate external action, false completion, or missing required audit/recovery evidence. Stop only the affected path; keep independent safe work moving. Lesser residual risks require an explicit disposition, accountable owner and review trigger, not a silent waiver. Product acceptance, professional review and real-data release remain separate.

The five workstreams and smaller chunks live in [[Roadmap and Tasks#Five-step implementation plan]]. Other notes describe their domain and link there; they do not maintain another status list.

## Owners and completion

One accountable owner per accepted task; contributors may be listed separately. Due dates are agreed commitments, not generated estimates. A task is done when its stated evidence exists. A decision requires a decision-maker and date. Professional-review gates require an appropriate reviewer, not merely a checked box.

## Information handling

- Keep this vault free of patient information and system credentials. Use synthetic data for examples and demonstrations.
- Do not place patient screenshots or real records in attachments, chat excerpts, logs, or linked public pages.
- Store legal advice, contracts, and sensitive business records only in an approved access-controlled location; reference non-sensitive summaries here when appropriate. A privilege label alone does not resolve access or disclosure concerns.
- Do not assume that Obsidian plugins, sync, publishing, shared links, AI services, or backups are approved for sensitive data. No settings were changed during initialization.
- Agree vault access, backup/restore ownership, and sharing rules before adding sensitive company material.

## Editing conventions

Use plain Markdown and Obsidian wiki links; no community plugins required. Use unique descriptive note names, ISO dates, and the simple frontmatter fields already present. Update `updated` when the note materially changes. Templates can be copied manually; no template-plugin configuration is required.

Current implementation notes should describe the current source and separately date the last hosted observation. Keep superseded runtime paths/test results in dated history, not as present-day startup instructions. Root and app-specific `.gitignore` files protect local artifacts; shared vault notes/configuration, source, migrations and lockfiles remain tracked. Do not restore the founder-removed `reference/` folder as incidental cleanup.

Preserve conflicting evidence and superseded decisions with context. Avoid copying the same task or legal conclusion into multiple lists. Never claim a source is reviewed, a task complete, or a fact verified unless the record supports it.

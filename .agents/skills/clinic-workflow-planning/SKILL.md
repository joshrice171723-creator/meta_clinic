---
name: clinic-workflow-planning
description: Plan or revise Meta Clinic patient and staff workflows using authoritative U.S. references, field-level data design, and the existing ownership and dependency matrix. Every writable run creates or updates one assignment plan in docs/development/clinic-workflow-plans/. Use for connected clinic journeys, workflow prerequisites, parallel progress, vendor-independent preparation, or matrix changes. Not for general brainstorming, cosmetic UI work, or automatically starting implementation.
---

# Clinic workflow planning

Produce a reviewable, evidence-backed plan for a complete patient and staff journey. Preserve this planning method, not the particular clinic, age rules, medications or brainstorming that originally motivated it.

## Scope and current truth

Start from the latest user request. Separate accepted scope, proposals, deferred ideas and unresolved decisions. Do not promote brainstorming into requirements. Ask only about choices that materially change the journey; investigate answerable implementation questions yourself.

Read repository instructions and retrieve relevant current vault context. In Meta Clinic, the canonical owners are:

- `PRODUCT.md` and `APPlyVault/01 Foundation/Meta Clinic Product Strategy and Scope.md`: product direction.
- `docs/development/meta-clinic-build-and-acceptance.md`: shared behavior, field/action contract and the existing dependency matrix.
- `APPlyVault/03 Execution/Meta Clinic Implementation Tracker.md`: current work and acceptance gaps.
- `APPlyVault/03 Execution/Decisions.md`: accepted decisions and supersession.

Inspect relevant current code, tests and configuration using the repository's discovery procedure before claiming what exists or is missing. Dated evidence is not fresh verification. Archived proposals are not current requirements. Reuse owning records, queues, consent processes and controls; identify actual gaps rather than planning a duplicate system.

Planning does not authorize implementation, deployment, external submissions, purchases, task dispatch or overnight execution. The founder's standing instruction authorizes saving this skill's plan output on every run unless the current request explicitly requires read-only work or a repository safety stop applies. A read-only run must present the proposed file content and state that no file was saved. Do not change product scope merely to finish a plan.

## Required output on every writable run

This skill owns exactly one new or updated Markdown file per assignment: `docs/development/clinic-workflow-plans/<assignment-slug>.md`. Create the directory when needed. Use a short, stable, lowercase hyphenated slug from the accepted assignment or tracker row; find and reuse its existing file on later runs. Do not create a new file for each turn or a second project-wide status register. Do not put skill-created briefs, source maps, checkpoints, or handoff files elsewhere. Do not silently move or overwrite plans that predate this convention; link them from the new assignment file when relevant.

After the required preflight and before planning, run `python .agents/skills/clinic-workflow-planning/scripts/ensure_plan.py <assignment-slug>` from the repository root. The helper creates the fixed-section file or refreshes only its **Last run** section with an in-progress marker; it never overwrites the other sections. Finish the plan and replace that marker with the date, inspected revision, outcome, changed canonical paths, checks actually performed, and next action. Every writable invocation must actually create or update the file, including a scoped review that finds no substantive plan change. In that case, record what was checked and the no-change finding. Verify the saved file on disk and link its exact path in the final answer. Do not use a plan update to claim implementation, acceptance, or release.

Keep the file's sections in this fixed order: **Assignment and authority**, **Current sources and decisions**, **Connected journey**, **Fields and action rules**, **Ownership and dependency matrix references**, **Implementation and acceptance**, **Checkpoint**, and **Last run**. Use the requirements below to fill them; state a justified `Not applicable` where a section has no applicable content. Keep the assignment-specific detail in this file and link, rather than duplicate, the canonical tracker, matrix, decisions, and dated evidence. Existing canonical files remain at their owning paths and may be updated in place when required by repository instructions. If another repository rule requires creating a canonical record outside this folder, follow that rule, list the exception in the plan and handoff, and do not describe the folder as an exhaustive inventory of repository changes.

## Establish the journey

Select or confirm the reference clinic type, business model, entry points, visit modalities and intended outcome. Distinguish shared platform behavior from specialty-specific configuration. Map patient actions and staff actions together, including branches, handoffs and work after the encounter ends. Include only applicable stages: acquisition, account/payment, intake, scheduling or walk-in, visit, documentation, orders/results, fulfillment, billing and follow-up.

Describe concurrent work, not just a linear list of screens. For each action identify the actor, owning record, entry condition, successful transition, completion evidence and recovery path. Surface independent work while a prerequisite for another action is pending.

## Research before choosing data and gates

Read `docs/development/healthcare-standards.md` and use `docs/development/us-healthcare-reference-map.md` to select relevant sources. Inspect available browsing/documentation capabilities; use an available official-source connector or web access. Do not assume a named MCP tool exists or install a provider just to research.

Open applicable primary sources rather than citing search snippets or treating a remembered link as reviewed. Use published U.S. implementation guides, relevant U.S. authorities, official terminology and accessible vendor documentation. Global standards require a documented U.S. application. Verify publication status, version, exact section, access date and jurisdiction; do not mix incompatible versions. Vendor-required versions may differ from the newest publication.

For each material requirement, record source/link/section/version, applicability, interpretation and its mapped action/data/test. Distinguish:

- Established source requirements within their actual scope.
- Recommendations or examples, not mandatory rules.
- Explicit product decisions.
- Configurable clinic policy or clinician decisions.
- Unresolved jurisdiction, source or vendor mapping.

Do not convert exchange cardinality or Must Support into universally mandatory form questions. Do not infer clinical protocols, lab panels, dosing, professional eligibility checks or blanket visit holds from a data standard. If no relevant guide applies, record the search scope and rationale. If access or applicability is unresolved, name the gap and continue independent planning; do not fabricate a requirement or claim standards compliance.

## Define questions, fields and action prerequisites

For each step specify the question/label, purpose, owning backend record, value origin (entered, inherited, calculated or vendor), type/control, allowed values or units, conditional visibility, authorized writer and provenance. Identify what can be saved as a draft versus what is required for a particular action, when the value becomes stale, and the exact validation/recovery message.

Use bounded selects for finite choices, searchable references for linked entities or catalogs, typed numeric/date inputs for quantities and dates, and free text for explanations. Reuse existing data instead of asking twice. Preserve unanswered, unknown, declined, not applicable and negative as distinct when relevant. Do not collect speculative sensitive data merely because a future vendor might ask for it.

## Maintain the existing matrix

Read the complete applicable existing matrix before proposing changes. Extend or correct it in place; do not create a competing matrix for each feature. Preserve exactly these six columns:

| Condition | Action affected | What is blocked | What remains available | Responsible party | Attention |
| --- | --- | --- | --- | --- | --- |

Keep **Action affected** (the operation) separate from **What is blocked** (the exact prohibited transition). An attention item need not block anything. A missing prerequisite blocks its dependent action, not the whole patient or every later stage.

For each affected condition:

- Check missing branches, failures, cancellations, partial outcomes, corrections and recovery, not just the happy path.
- Explicitly name permitted parallel actions and the action that resolves the condition.
- Identify responsible team/role and optional assignee, coverage, transfer/acceptance and escalation destination. Team ownership is valid; no individual claim need not block work. Missing eligible ownership must stay visible in an exception path, not receive an invented owner.
- Separate patient coordination, encounter responsibility and individual task ownership. Assignment never grants privileges. Encounter closure never silently completes outstanding work.
- Identify the rule source and attention basis; do not invent deadlines, clinical thresholds or universal urgency. Preserve waiting, blocked, overdue, acknowledged and resolved as different concepts.
- Examine stale or revoked ownership, duplicate/out-of-order events, uncertain saves/submissions and dependency cycles where relevant.
- Preserve stable IDs. Explain additions, changes and retirements, their rationale and downstream test/field/plan effects. Check references before retiring a row; retain history in the normal decision/evidence record rather than silently reusing its ID.

Review whether old gates have become unnecessary after a new decision. Do not only accumulate restrictions. Report coverage limits; a large matrix is not proof that every specialty or failure is covered.

## Prepare for unavailable vendors

Plan durable local data collection, review, request preparation, owned work, history and recovery using existing domain mechanisms and narrowly scoped adapters. Separate local readiness from external transmission, acceptance and fulfillment. Distinguish disconnected, rejected and outcome unknown; the last may require reconciliation rather than retry.

Capture available contract mappings and unresolved partner-specific fields. Keep manual, simulated and vendor-confirmed evidence distinct. Use backend synthetic simulation for future verification, not frontend-only dummy data. Preserve request/version identity, correlation and idempotency where supported. Connecting credentials must not automatically transmit a prepared backlog. Missing vendor access blocks the external action, not independent local work.

## Required plan content and drift prevention

The required assignment file is the durable implementation brief even for a small matrix correction. Link it from the owning tracker item when the work is accepted and the tracker is being updated. Do not replace the tracker or shared matrix with this brief.

The brief must contain:

- Assignment identity, revision/date, planning versus implementation authorization, approved outcome, scope and explicit exclusions. Label proposals and unknowns separately from accepted requirements.
- Links to the canonical plan, decisions, source-to-data mappings and applicable stable matrix IDs. Do not copy the shared matrix or maintain competing versions of product rules.
- Current implementation baseline and inspected revision, owning records/screens/files to reuse, planned changes and dependency order, including independent work that may proceed in parallel.
- Assignment-specific data/question/control requirements or links to their canonical mapping; action prerequisites, responsible queues, handoffs and recovery requirements referenced by matrix ID.
- Acceptance criteria and intended checks, with local API, browser, simulator and live-provider evidence distinguished; remaining decisions, blockers and stop conditions.
- A concise checkpoint: completed work with evidence, in-progress or unverified work, affected paths/revisions, checks actually run and their results, the next unfinished action and any dependencies needed to resume it.
- A Last run entry for the current invocation: date, inspected revision, outcome, changed canonical paths, source/check results actually obtained, and the next action. Replace the previous Last run entry; retain material history in the normal canonical records rather than building a transcript here.

Include these execution instructions in the brief so a building agent receives them even without loading this skill: read the brief and its relevant canonical references before starting, resuming after a context reset, or accepting a handoff. Compare its recorded baseline and decisions against the current checkout and newer user direction. Reconcile stale assumptions before dependent edits; do not silently change scope, reinstate deferred ideas or repeat completed work solely because conversational context was lost.

Require checkpoint updates at meaningful completed slices, new blockers, material plan changes and before a handoff or pause. Keep checkpoints compact and evidence-backed, not a transcript or a second project-wide status register. The tracker remains the current work inventory; the brief supplies assignment detail and resume context. Update linked records consistently when requirements change, preserving the reason and supersession history. Unresolved scope changes stop only dependent work pending user direction; continue independent authorized work.

The brief is continuity guidance, not authority to execute or proof of completion. Do not mark a criterion complete from a plan, code change or attempted check alone. Finish with remaining gaps and a precise resume point; archive completed assignment detail only under repository retention rules.

## Acceptance and durable handoff

For every changed dependency, define paired checks: the exact dependent action is blocked and an independent action still succeeds. Include multiple simultaneous open tasks, ownership transfer/coverage, source corrections, denied privileges, interruptions/retries and persistence after encounter closure where applicable. Define browser proof for visible owner, reason, attention and next action without hidden parallel work or color-only meaning.

Map each affected matrix ID to its owning tracker item, source/field requirements, current implementation evidence, planned changes and remaining proof. Keep local API, browser, simulator and live-provider acceptance separate. A written test case is not a passed test.

On writable runs, save the required assignment file and maintain the existing guide and tracker when their requirements or status actually change; record only actual new decisions and material dated outcomes in the vault. Keep reusable procedure here, not duplicated as product knowledge. Follow the repository's validation and Git handoff requirements for changed files.

Finish with the scoped journey, sources actually reviewed, material matrix changes, unresolved decisions, exact document links and next verification step. Leave the result ready for review or an explicitly authorized implementation task; do not launch one automatically.

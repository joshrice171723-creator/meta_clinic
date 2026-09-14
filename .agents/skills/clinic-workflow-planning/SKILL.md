---
name: clinic-workflow-planning
description: Plan or revise Meta Clinic patient and staff workflows using authoritative U.S. references, field-level data design, and the existing ownership and dependency matrix. Use for connected clinic journeys, workflow prerequisites, parallel progress, vendor-independent preparation, or additions and changes to the workflow matrix. Not for general brainstorming, cosmetic UI work, or automatically starting implementation.
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

Planning does not authorize implementation, deployment, external submissions, purchases, task dispatch or overnight execution. When asked to discuss or remain read-only, present the plan without edits. When asked to save or update planning documents, update their canonical owners under repository procedures. Do not change product scope merely to finish a plan.

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

## Acceptance and durable handoff

For every changed dependency, define paired checks: the exact dependent action is blocked and an independent action still succeeds. Include multiple simultaneous open tasks, ownership transfer/coverage, source corrections, denied privileges, interruptions/retries and persistence after encounter closure where applicable. Define browser proof for visible owner, reason, attention and next action without hidden parallel work or color-only meaning.

Map each affected matrix ID to its owning tracker item, source/field requirements, current implementation evidence, planned changes and remaining proof. Keep local API, browser, simulator and live-provider acceptance separate. A written test case is not a passed test.

When document updates are authorized, maintain the existing guide and tracker; record only actual new decisions and material dated outcomes in the vault. Keep reusable procedure here, not duplicated as product knowledge. Follow the repository's validation and Git handoff requirements for changed files.

Finish with the scoped journey, sources actually reviewed, material matrix changes, unresolved decisions, exact document links and next verification step. Leave the result ready for review or an explicitly authorized implementation task; do not launch one automatically.

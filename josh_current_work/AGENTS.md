# Roadmap coordination contract

This directory is a living roadmap workspace for APPly-related capabilities. Its contents are intentionally fluid: capabilities, phases, build plans, audit plans, evidence, and handoffs may be added, revised, superseded, or removed over time.

## Scope and authority

- `ROADMAP_INDEX.md` is the current navigation map. It is not a permanent list of capabilities and must be rediscovered on every task.
- Each capability's `ROADMAP.md` owns its sequencing and completion criteria.
- Each capability's `*_BUILD_PLAN.md` describes proposed implementation slices.
- Each capability's `*_AUDIT_PLAN.md` describes evidence and negative checks required for acceptance.
- `AGENT_*_HANDOFF.md` and `AGENT_*_EVIDENCE.md` record agent results; they are not acceptance by themselves.
- Actual implementation belongs in the owning application repository, especially `C:\Users\joshr\Desktop\Work\APPly` when the work is APPly work.
- The owning application repository's `AGENTS.md`, source, tests, migrations, and runbooks are authoritative for implementation behavior and repository operations.

## Required discovery on every task

1. Read this file and inspect the current directory tree; do not assume yesterday's files, capability list, or plan still exists.
2. Read `ROADMAP_INDEX.md` if present, then verify every referenced path exists.
3. Discover newly added capability folders and documents with the filesystem rather than relying only on the index.
4. Identify removed, renamed, superseded, duplicate, or orphaned roadmap documents and report them explicitly.
5. Read the relevant capability `ROADMAP.md`, build plan, audit plan, evidence, and handoff files that actually exist.
6. If implementation is requested, inspect the owning application repository and its nearest `AGENTS.md` before making changes.
7. Re-scan the workspace immediately before writing when concurrent edits are possible.

## Adding and removing roadmap material

- Adding a capability is normal. Give it a clear folder and roadmap identity, add the documents that are applicable, and update `ROADMAP_INDEX.md` in the same change.
- Removing or retiring a capability is normal. Update the index and mark or relocate historical material as superseded when practical; do not silently erase evidence or rewrite historical claims.
- Renaming or moving a capability requires repairing links and recording what changed.
- An absent document is not evidence that a capability is complete, cancelled, or approved. Record the missing artifact and its effect on conclusions.
- Do not maintain a second hidden task register or copy changing product status into this contract.
- Preserve unknowns as unknowns. Do not invent owners, dates, approvals, requirements, costs, sources, or completion.

## Parallel-agent rules

- First produce a read-only execution matrix before dispatching work.
- Select no more than three independent slices at once unless a later review proves more parallelism is safe.
- Give each agent one bounded roadmap task, an isolated branch/worktree in the owning code repository, explicit file ownership, exclusions, dependencies, and acceptance checks.
- Never parallelize agents that modify the same files, migrations, shared contracts, shared roadmap/status documents, or the same mutable database/runtime.
- Do not let parallel agents edit `ROADMAP_INDEX.md`, shared status, decisions, or progress records simultaneously. A coordinator updates those after reviewing evidence.
- Use the owning repository's harness, workflows, skills, tests, and commit rules. This folder does not grant implementation, deployment, production, clinical, professional, financial, or external-communication authority.
- Use synthetic/local data only. Do not use real patient or confidential applicant data, production access, external messages, purchases, or destructive operations without explicit authorization.

## Completion vocabulary

Keep these states distinct:

- `done`: required deliverable and evidence are complete.
- `done locally`: implementation works locally, but broader acceptance remains.
- `in progress`: bounded work remains.
- `awaiting input`: blocked on a named person, source, decision, or approval.
- `blocked`: cannot proceed safely until a named dependency changes.
- `backlog`: intentionally not started.
- `superseded` or `retired`: no longer current; preserve the historical record where appropriate.

Code completion, local verification, audit evidence, professional review, release approval, and production acceptance are separate events. Do not promote one into another.

## Handoff and change discipline

Every agent handoff should state:

- requested outcome and explicit exclusions;
- current roadmap/task identity and owning repository;
- files and behavior changed or documents added/removed;
- dependencies, human decisions, and remaining gates;
- commands and checks actually run, including checks not run;
- branch/worktree, commit, and working-tree state;
- evidence supporting the claimed status and the safest next action.

After changing roadmap documents, inspect links, diff, and concurrent changes. Keep index updates, status changes, evidence links, and archival moves coherent. Do not claim completion from a plan, link, screenshot, build result, or agent summary alone.

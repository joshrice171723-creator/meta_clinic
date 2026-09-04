# Roadmap coordination contract

This directory is the living capability-roadmap workspace inside the APPly Git repository at `josh_current_work/`. Capabilities, phases, build plans, audit plans, evidence, and handoffs may be added, revised, superseded, renamed, or removed over time.

## What lives where

- `ROADMAP_INDEX.md` is the current navigation map for this workspace. It is not a permanent list; rediscover the directory contents on every task.
- Each capability's `ROADMAP.md` owns its sequencing, scope, dependencies, and completion criteria.
- Each capability's `*_BUILD_PLAN.md` describes proposed implementation slices and boundaries.
- Each capability's `*_AUDIT_PLAN.md` describes evidence, negative tests, and release gates.
- `AGENT_*_HANDOFF.md` and `AGENT_*_EVIDENCE.md` record agent results. They are not acceptance by themselves.
- The top-level `C:\Users\joshr\Desktop\Work\APPly\ROADMAP_PROGRESS.md` is the concise estimate view for developers. It is not a second task register and does not replace evidence.
- APPlyVault owns durable APPly status, decisions, risks, and dated progress. Use `APPlyVault/03 Execution/Roadmap and Tasks.md` for task status, `Decisions.md` for explicit decisions, `Risks and Assumptions.md` for open uncertainty, and `Progress Log.md` for meaningful dated outcomes.
- Actual implementation belongs in the owning application repository: `C:\Users\joshr\Desktop\Work\APPly`. The owning repository's source, tests, migrations, runbooks, root `AGENTS.md`, and nearest nested `AGENTS.md` are authoritative for implementation behavior.

## Required workflow

1. Read this file and the APPly root `AGENTS.md`.
2. Inspect the current directory tree and read `ROADMAP_INDEX.md` if present. Do not assume the capability list or any referenced file is unchanged.
3. Verify index links and discover newly added, removed, renamed, superseded, duplicate, or orphaned documents.
4. Read the relevant capability `ROADMAP.md`, build plan, audit plan, evidence, and handoff files that actually exist.
5. If implementation is requested, run from the APPly repository root:

   ```powershell
   python3 -B bin/agent-preflight --path josh_current_work/<capability>
   ```

6. Inspect the actual source and tests in the owning repository before trusting a planning path or agent claim.
7. Before any write, check `git status --short`, preserve unrelated/concurrent changes, and re-scan when concurrent edits are possible.
8. Use the owning APPly workflow and skill: `$plan` for read-only investigation and `$act` for an authorized implementation slice.
9. Before handoff, run `python3 -B bin/agent-check` to list applicable checks, then run the selected checks with `python3 -B bin/agent-check --run`. Inspect `git diff --check` and the final diff.

## Adding, removing, and changing roadmaps

- Adding a capability is expected. Create the applicable roadmap/build/audit artifacts and update `ROADMAP_INDEX.md` in the same change.
- Removing or retiring a capability is expected. Update the index and mark or relocate historical material as `superseded` or `retired` when practical; do not silently erase evidence.
- Renaming or moving a capability requires repairing links and recording what changed.
- An absent document is not evidence of completion, cancellation, or approval. Report the missing artifact and its effect on the conclusion.
- Update `ROADMAP_PROGRESS.md` after meaningful evidence or status changes, not after every wording or file-list change.
- Update APPlyVault only when a roadmap change materially changes an APPly task status, decision, risk, or verified dated outcome. Do not duplicate the detailed roadmap set in the vault.
- Keep changing status out of this `AGENTS.md`; this file should remain stable operating guidance.
- Preserve unknowns as unknowns. Do not invent owners, dates, approvals, requirements, costs, sources, or completion.

## Parallel-agent rules

- First produce a read-only execution matrix before dispatching implementation work.
- Select no more than three independent slices at once unless a later review proves more parallelism is safe.
- Give each agent one bounded roadmap task, an isolated APPly branch/worktree, explicit file ownership, exclusions, dependencies, and acceptance checks.
- Never parallelize agents that modify the same files, migrations, shared contracts, shared roadmap/status documents, or the same mutable database/runtime.
- The coordinator owns `ROADMAP_INDEX.md`, top-level `ROADMAP_PROGRESS.md`, APPlyVault status/decision/progress updates, and integration of agent branches. Parallel agents must not edit those shared records simultaneously.
- Use the owning repository's harness, workflows, skills, tests, and commit rules. This directory does not grant deployment, production, clinical, professional, financial, release, or external-communication authority.
- Use synthetic/local data only. No real patient or confidential applicant data, production access, external messages, purchases, or destructive database actions without explicit authorization.

## Completion vocabulary

Keep these states distinct:

- `done`: required deliverable and evidence are complete.
- `done locally`: implementation works locally, but broader acceptance remains.
- `in progress`: bounded work remains.
- `awaiting input`: blocked on a named person, source, decision, or approval.
- `blocked`: cannot proceed safely until a named dependency changes.
- `backlog`: intentionally not started.
- `superseded` or `retired`: no longer current; preserve the historical record where appropriate.

Code completion, local verification, audit evidence, professional review, release approval, and production acceptance are separate events. Do not promote one into another. The percentage estimates in `ROADMAP_PROGRESS.md` are coordination estimates, not acceptance decisions.

## Handoff and change discipline

Every agent handoff should state:

- requested outcome and explicit exclusions;
- roadmap/task identity and owning repository;
- files and behavior changed or documents added/removed;
- dependencies, human decisions, and remaining gates;
- commands and checks actually run, including checks not run;
- branch/worktree, commit, and working-tree state;
- evidence supporting the claimed status and the safest next action.

After changing roadmap documents, inspect links, `git diff --check`, the final diff, and concurrent changes. Keep index updates, status estimates, evidence links, and archival moves coherent. Do not claim completion from a plan, link, screenshot, build result, or agent summary alone.

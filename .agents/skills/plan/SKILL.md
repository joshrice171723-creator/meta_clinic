---
name: plan
description: Create an evidence-backed implementation plan without modifying repository or external state. Use only when the user explicitly invokes plan, $plan, or /plan, or explicitly asks to stay read-only and plan.
---

# Plan

Use read-only investigation to reach an implementation-ready plan. This skill is prompt guidance; it does not change the host's tools, sandbox, approvals or active runtime mode. When the host has a native Plan mode, use that mode for an enforced write boundary.

## Contract

- Explore, analyze and align. Do not implement.
- Read files, search source, inspect Git state/history/diffs and gather current context.
- Shell commands must be inspection-only. Do not create, modify, rename or delete files; install dependencies; run migrations; mutate databases or containers; change Git state; deploy; publish; message externally; or perform another state-changing action.
- Treat the newest user message as the current mode request. Earlier implementation authority does not override a later plan request.
- If a requested check could mutate state, describe it as an Act step instead of running it.

## APPly planning sequence

1. Read root and nearest nested `AGENTS.md`, then run `bin/agent-preflight --path <target>` for every major area.
2. Inspect the Shortcut Roadmap and Agent Workspace read-only for the relevant Epic/Stories, current state and overlapping claims. Do not create, claim, comment on or update a Story while planning.
3. Use `APPlyVault/01 Table of Contents.md` to select only the current product knowledge, decisions, risks and evidence needed. Do not load the full vault by default or create a Vault task list.
4. Inspect the current source and tests so dated notes are not mistaken for executable truth.
5. Resolve the observable outcome, boundaries, dependencies, principal failure and meaningful alternatives. Ask only for a choice that would materially alter the solution or authority.
6. Present a concise, ordered plan with affected areas, verification, stop conditions and any remaining human decision.

End after presenting the plan. Do not switch modes or begin implementation in the same turn. Implementation starts only after a later explicit Act request or normal implementation instruction. An original request to plan is not approval to act.

Adapted from Cline's Plan/Act mode concepts; provenance and differences are recorded in `agent-harness/THIRD_PARTY_NOTICES.md`.

---
name: act
description: Execute a clear, authorized repository change and verify the outcome. Use only when the user explicitly invokes act, $act, or /act, or explicitly asks to implement an already understood plan.
---

# Act

Implement the current scoped request or the most recently approved plan. This skill is prompt guidance; it does not grant tools, bypass approvals, or expand repository or external authority.

## Contract

- Treat invocation as permission to perform ordinary in-scope local implementation, not as blanket authorization for deployment, production access, purchases, messages, destructive recovery, real/confidential data use or another separately gated action.
- Confirm that any earlier plan still matches the newest user request and current repository state. If no plan exists and the change is clear, perform the bounded preflight and proceed.
- Preserve unrelated and concurrent work. Do not reset, discard, blindly stash or silently absorb it.
- Follow root and nearest nested `AGENTS.md`, the matching `agent-harness/workflows/` playbook and the minimum context selected through the vault table of contents.
- Make the smallest coherent change, verify it in proportion to risk and inspect the final diff.
- If implementation reveals a material ambiguity, unsafe premise, incompatible concurrent edit or missing authority, stop only that path and return to planning rather than improvising a broader solution.

## APPly execution sequence

1. Run `git status --short` and `bin/agent-preflight --path <target>`, then state the reviewed scope, gaps, intended change and principal failure.
2. Implement within the accepted boundary, using only synthetic data and local or explicitly authorized targets.
3. Run `bin/agent-check`, the selected checks and any focused negative/recovery check the risk requires.
4. Update canonical vault state only when direction, requirements, risks, evidence or a decision actually changed.
5. Report changed behavior, checks and outcomes, unrun checks, remaining gates and required decisions.

Adapted from Cline's Plan/Act mode concepts; provenance and differences are recorded in `agent-harness/THIRD_PARTY_NOTICES.md`.

# Code change workflow

## When to use

Use for local application, test, build-tool or repository-script changes that are not themselves a database transition or hosted release.

## Procedure

1. Run `bin/agent-preflight --path <target>` for each area in scope and read the applicable nested instructions.
2. Use the vault TOC to review the relevant architecture, requirements, decisions, risks, acceptance contracts and evidence. Inspect current source/tests rather than relying on dated notes alone.
   In a fresh isolated worktree with missing dependencies, run `ruby bin/dev prewarm` once after this review; do not repeat it while the lockfiles are unchanged.
3. Define one observable outcome, explicit exclusions and the smallest reviewable diff.
   For direct Codex work, use the lowest reasoning effort likely to succeed: low for mechanical edits and inventory, medium for contained wiring, and high for cross-boundary clinical, authorization, migration or transactional work. Do not restart a coherent task merely to change models.
4. Name the principal changed-behavior failure and a focused check. In active development, keep this brief in the task; use the complete [failure-first procedure](failure-first.md) for an explicitly selected stable milestone, release or comprehensive audit.
5. Implement without broad formatting, unrelated cleanup, new external authority or hidden fallbacks. For frontend UI, load the `frontend-ui` skill and follow the composition-first Material UI hierarchy in `apps/web/AGENTS.md`: prefer existing APPly components, MUI primitives and supported composition; use semantic HTML with scoped CSS when it is clearer; reserve dependency patches/forks for confirmed reusable upstream limitations.
6. Add or update tests for success, ownership, denial, validation, retry/concurrency and recovery cases that apply. While implementation is active, run only `bin/agent-check --phase build --path <target> --level focused --run` when a focused signal is useful.
7. After the cohesive requested slice is integrated, freeze its owned files and stage the exact candidate without incorporating other agents' work. Run one scoped selection with `bin/agent-check --phase final --staged --path <target> --level component --run`. Keep targeted ownership, money, stock and persistence checks for affected behavior; use named tests when automatic selection cannot identify them. Reserve `integration` for an explicitly selected broad milestone, not merely because a route/model or both applications changed. Existing CI can run broad checks in the background; do not duplicate them locally. Inspect the scoped diff.
8. Batch failures into one repair list. Rerun only failed or invalidated checks with `bin/agent-check --phase repair --path <target> --level <level> --check "<selected check name>" --run`. Repeat the final set only when a repair changed a shared contract or mandatory final gate.
9. Update canonical vault records only when direction, requirements, risks, durable evidence or a decision actually changed.
10. Hand off using [`handoff.md`](handoff.md). Do not repeat an unchanged passing check or reopen discovery after handoff.

Apply the root active-development verification policy: a 10-minute reassessment checkpoint, a single short changed-journey walkthrough, bounded browser retries, reuse of valid evidence, and deferral of unrelated historical failures. `--budget-minutes` controls the runner's between-command checkpoint; an extension above 10 requires `--budget-reason`. Do not bypass the checkpoint through repeated fresh runs. A deferred check remains unverified; report implementation, focused verification and launch verification separately.

Count browser, reviewer and repair time toward the same checkpoint. Extend only for a named current-workflow defect or necessary changed-behavior check with a bounded next step; do not abandon required correctness checks or label missing evidence as passing. An active command is allowed to finish. After one failed browser/tool attempt, diagnose once and make at most one justified retry before using a different approach or recording the gap. Reviewers inspect the changed journey rather than launching another broad audit. Reuse evidence only while relevant source, dependencies, configuration and environment remain valid. Unrelated historical CI failures do not block ordinary development unless they prevent the requested workflow or its focused verification.

For a local runtime check, use the managed lifecycle documented in `APPlyVault/03 Execution/CICD.md`. Keep servers detached when the repository provides a managed background path, wait for the relevant readiness endpoint and preserve consequential startup failures instead of reporting an unverified workaround as success.

## Economical execution and handoffs

- Define one bounded acceptance checklist before dispatch. Finish that checklist rather than repeatedly reopening an entire milestone program. Added scope gets an explicit checklist delta, not another full audit.
- The user freely selects and switches the main model and reasoning effort. Never change or constrain that selection to enforce savings. Economical routing governs assistant-chosen delegation only: Terra medium (`tm`) for ordinary implementation; Luna medium (`lm`) for small mechanical, documentation and check-running slices. Escalate assistant-chosen workers only for a named unresolved difficulty; choosing an Astra worker requires an explicit user request. A user's model/effort selection always takes precedence, and a user-selected Astra main task is allowed. These local rules override older skill model defaults. Aliases combine model (`l`, `t`, `s`, `a`) and effort (`l`, `m`, `h`), for example `th` means Terra high. Name unavailable/inherited settings honestly.
- Keep zero workers for tiny edits and usually one or two for useful independent work. Assign one owner per file/slice, including shared contracts and browser state. Do not create a reviewer after every handoff.
- Dispatch only the objective, exact allowed paths, integration base, known findings, exclusions and acceptance/check owner. Prefer a fresh bounded worker context instead of copying the conversation when supported. Handoffs normally fit within 250 words: changed files, result, concrete gaps, checks and relevant revision/environment.
- The coordinator is the sole Git writer by default. Workers return changes and evidence without staging, committing, merging or pushing. Explicitly delegated Git operations must name the owner and exact action; stop other writers before integration.
- Integrate once, then run one proportionate verification pass. Reuse passing worker evidence only when source, dependencies, configuration and environment still match; inspect its result and scope rather than rerunning by habit. Repair concrete failures and rerun failed or invalidated checks only. Keep required permission, persistence and recovery checks.
- Maintain one compact checkpoint with commits, ownership, passed checks and remaining acceptance. At a major completed boundary, offer a fresh task with that handoff if context has become unwieldy; do not create tasks automatically or restart coherent work just to switch models.
- Keep tool output and progress reports short; retrieve additional detail only to resolve a specific question. Do not trim required instruction files or failure evidence. Account usage changes are not reliable per-agent attribution and no fixed percentage saving is promised.

Worker defaults live in `.codex/config.toml`; this project does not set the main model or reasoning effort. Explicit user selections take precedence over economical recommendations. Agent concurrency settings are runtime limits, while file ownership, Git ownership and escalation rules are instructions, not technical access controls. Configuration keys were checked against the [official Codex configuration reference](https://developers.openai.com/codex/config-reference) on 2026-09-19. User-level settings for other projects are unchanged.

## Safety stop conditions

Stop the affected path for suspected sensitive data, unclear destructive scope, missing authority, incompatible concurrent edits, unexplained data loss, a bypassed permission boundary or falsely reported success. Continue independent safe work.

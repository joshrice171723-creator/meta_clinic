# Meta Clinic engineering loop

This pilot uses Codex Goals for bounded continuation, the existing resource queue
for heavy commands, and a shared checkpoint for recovery between turns. Follow
[the persistent-engineering procedure](../../agent-harness/workflows/persistent-engineering.md)
and [root policy](../../AGENTS.md). Existing Muse QA and release automations remain
separate; development and QA retain their own branches until Joshua invokes publish.

## First guided pass

The starting task is build-health triage on current remote main. Its finish line is
one evidence-backed disposition, not an obligation to edit code when CI is blocked.
The current selected budget is 200,000 tokens per cycle, with five-minute follow-ups in the
same Codex chat. Scheduling and Goal budgets are host configuration, not enabled by
reading this file. Keep the user's selected main model and reasoning effort.

1. Read `python bin/engineering-loop status`. Inspect the current native Goal and
   active work ownership. Use a clean owned worktree; preserve a dirty shared root.
2. Fetch main for awareness without merging it into either loop branch. Capture its
   SHA and branch drift. Read existing CI without triggering
   another run:

   ```powershell
   git status --short
   git fetch origin
   git rev-parse HEAD origin/main
   gh run list --branch main --workflow CI --limit 5 --json databaseId,headSha,status,conclusion,url
   ```

3. For the matching run ID, use `gh run view RUN_ID --json headSha,jobs,url`.
   For a selected check-run ID, inspect annotations with
   `gh api repos/joshrice171723-creator/meta_clinic/check-runs/CHECK_ID/annotations`.
   Replace the ID arguments with observed IDs. Do not dump environment values or
   unrelated logs. No run for the SHA means remote verification is unavailable.
4. Activate a native Goal with a 200,000-token budget: produce one verified build-health
   disposition; repair only the selected cause; no tests, deployments, billing changes
   or changes to existing QA/release schedules. If native budget enforcement is
   unavailable, stop unattended work and report it. A normal prompt alone is not a cap.
5. Start the durable pass and use the returned `pass_id` for subsequent commands:

   ```powershell
   python bin/engineering-loop start --objective "Triage current main CI and produce one evidence-backed disposition" --token-budget 200000 --scope .github/workflows/ci.yml
   python bin/engineering-loop checkpoint --pass-id PASS_ID --hypothesis "Determine whether jobs executed before diagnosing code" --evidence RUN_URL --next-action "Read selected check annotations"
   ```

6. If a code failure is established, inspect its exact scope and requirements before
   one bounded repair. `pnpm run typecheck` and `pnpm run build` are non-test web
   checks, run from `apps/web` through the resource queue after required dependency
   preparation. `python bin/verify-agent-harness` checks this tooling structurally.
   Do not use `pnpm test`, Rails tests, browser test scripts, or broad `agent-check
   --run` selections without explicit test authorization. Never weaken checks.
7. When Actions cannot start because of account billing, continue local verification.
   From `apps/web`, after one root `ruby bin/dev prewarm`, run:

   ```powershell
   python ../../bin/agent-resources run -- pnpm.cmd run build
   ```

   The build includes TypeScript and Vite, not tests. Bind its result to the exact
   source revision and record remote CI as unavailable. On other operating systems
   use `pnpm` instead of `pnpm.cmd`. A passing build does not prove browser behavior.
   Do not repeatedly request account changes when local work can proceed.

8. Finish with observed evidence. For a genuine local environment blocker:

   ```powershell
   python bin/engineering-loop finish --pass-id PASS_ID --verdict blocked --evidence RUN_URL --next-action "Record the local blocker and choose independent feasible tracker work"
   ```

   A blocked disposition finishes the investigation, not the build repair. Complete
   its native Goal only when the report and checkpoint exist. Review the diff and
   actual evidence before accepting any subsequent repair.

## How to steer the next pass

In the same chat, say: "Run one engineering cycle on the owned branch with 200,000 tokens;
follow the persistent-engineering workflow and keep the no-tests rule." To target a
known issue, name its tracker ID, observed failure and allowed paths. Request tests
explicitly if the pass needs them. Ask to pause five-minute follow-ups to stop scheduling;
ask to pause the Goal to stop a currently continuing Goal. These are separate controls.

The five-minute follow-up resumes saved unfinished work first, then selects a feasible
unfinished tracker slice when the previous task is done. Use local verification while
Actions is unavailable. A wake checks for work; it does not interrupt active work,
grant another 200,000 tokens to an active Goal, or guarantee token throughput.
Joshua authorized subsequent cycles for unfinished tasks, with saved evidence,
cycle boundaries and cumulative usage. Native Goal usage is the accounting source;
the local helper only stores the requested cap. A budget-limited unfinished native
Goal requires host extension/resume. Never fake completion or replace it to bypass
that control. Remain quiet on unchanged blockers after the initial notification.

## Two loops, explicit publication

Development implements independent tracker slices on its owned branch. The existing
QA loop processes only Muse findings and repairs/reviews their associated work on a separate
branch. Both wake every five minutes; neither duplicates an active pass, merges into
main, publishes, or merges the other's work each cycle. Fetch for awareness and
record drift for the publishing handoff.

An open PR or pending QA review is a handoff, not a stop condition. Development
continues independent tracker slices on its branch and records each completed
commit. Muse repair reviews identify exact SHAs; later changes require affected evidence to be
refreshed when Joshua freezes the final publishing candidate. Neither loop waits
for the other to merge work after each cycle.

Development PRs carry `engineering-loop` plus the outcome, owned files, revision and
actual non-test evidence for the explicit publish review. The QA loop does not
review those development PRs, select tracker features or perform general audits.
It stays idle when there is no actionable Muse feedback. Never invent Muse issue
markers or use the Muse approval helper on unrelated development PRs.
The existing Muse monitor owns independent browser QA and exact-build retesting.
Read its active state before publishing; never interrupt its current browser run.

Joshua invokes [publish](../../.agents/skills/publish/SKILL.md) to freeze both loops,
collect exact branch/base/head and verification handoffs, review their combined
candidate, and use the existing exclusive release lock and
[Lightsail procedure](../../ops/lightsail/README.md). Incomplete work is explicitly
excluded. A frozen loop waits for explicit publisher resume after release or abort;
pausing its schedule alone does not stop an active Goal or command. The separate
scheduled publisher remains paused. Local-image release does not depend on Actions
or GHCR, but clean pushed main, matched images, encrypted recovery and live checks
remain required. Documentation-only setup does not need deployment.

## Checkpoint mechanics and recovery

`bin/engineering-loop` supports `status`, `start`, `checkpoint` and `finish`; use
`--help` on any action. It reuses the resource helper's kernel lock and atomic JSON
writes. State lives under the Git common directory's
`development-resources/engineering-loop/checkpoint.json`, with a JSON record for
each finished pass. Linked worktrees share it; unrelated clones do not.

An active persisted marker rejects a second start even between processes/turns.
Updates require the matching pass ID and owning worktree. This is cooperative
coordination, not an access-control boundary against arbitrary filesystem edits.
The helper never runs models, tests, repairs, Git writes, deployments or schedulers.
Scope and budget fields are recorded contracts, not tool restrictions.

Store only synthetic-safe metadata and evidence references, never raw logs,
credentials or record contents. Native Goal state and token enforcement belong to
the host. The helper does not impose command timeouts; reassess at ten minutes and
let an already-running owned check finish under the existing code-change policy.

If interrupted, inspect `status`, the native Goal, owning chat and worktree. Resume
only with established ownership and remaining budget. With owner authorization,
finish an abandoned pass from its original worktree using its exact pass ID and a
blocked disposition. Never delete an active marker or take over another worker.

Product status remains in the [implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md).
Copy material, dated outcomes to `records/` at handoff rather than turning this guide
or local checkpoint into a second product register.

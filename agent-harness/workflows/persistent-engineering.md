# Bounded persistent engineering

Use when the user requests continuing or recurring engineering work. This procedure
extends [code change](code-change.md), not deployment authority. Developer mechanics
and the guided example live in [the engineering-loop guide](../../docs/development/engineering-loop.md).

## Pass contract

Choose one observable outcome and allowed paths. State its evidence source,
constraints, exclusions, next action and escalation triggers. Keep product priorities
in the [canonical tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md).
Local pass checkpoints are execution state, not another roadmap or completion score.

Create a native host Goal with the user-selected token budget before starting a pass.
Its objective is to produce a verified disposition for one scoped investigation or
repair: passed, blocked with evidence, needs review, or no actionable change.
If the host cannot enforce the budget, report that limitation and do not start an
unattended repair. The checkpoint helper records budgets; it does not enforce tokens.

## Execute

1. Inspect Git status, shared checkpoint, active chats and existing automation ownership.
   Fetch main. Pull only in an owned checkout where existing edits can be preserved;
   use a clean isolated worktree when the shared root cannot safely advance. Inspect
   remote master only if it exists and applies; never invent that branch.
2. Inspect exact-SHA CI metadata first. Read selected job annotations before logs.
   Pending CI is pending. Missing logs or zero executed steps are not code failures.
   Separate application, check/harness, environment and account/infrastructure causes.
3. Start the local pass marker from the clean owned worktree. It prevents cooperative
   overlapping passes across linked worktrees. Read the latest checkpoint before
   every continuation. Never replace an active marker because its timestamp is old.
4. Use graft, applicable preflight and minimum vault/architecture context before edits.
   Record each meaningful hypothesis, evidence reference and next action. Save a
   checkpoint before repairs and before the ten-minute verification reassessment.
5. Repair only the selected cause. Preserve guards and check expectations. Do not
   add/run tests without explicit user authorization. For non-test checks inspect
   commands first; the general check selector can include tests. Queue heavy work
   through the existing resource runner. One failed approach gets one diagnosis and
   at most one justified retry; broaden scope only with an explicit checklist delta.
6. Default to no subagents. When explicitly delegated, give each one bounded owned
   paths and count all workers against the pass budget. One coordinator integrates.
7. Freeze and review owned changes. Run necessary non-test checks and diff review.
   Synchronize current remote main in the isolated branch, commit only owned work,
   and push without force when authorized. Concurrent changes invalidate affected
   evidence. Never merge unrelated root edits or claim branch delivery is deployment.
8. Finish the local marker with a disposition, evidence and next action. Complete the
   native Goal only after its disposition contract is satisfied. A blocked report can
   complete the investigation, but never label the underlying build repaired.

## Repetition and escalation

At each scheduled wake, inspect the prior Goal and checkpoint before creating a
new Goal. Skip overlapping work. If a previous pass was interrupted or exhausted
its budget, report the preserved checkpoint for owner review; do not clear it silently
or automatically grant another budget to continue the same unresolved repair.

While an external blocker is unchanged, perform only a cheap metadata observation;
do not repeat failed checks or reopen the same investigation. A new SHA with the
same account-level blocker does not justify another repair attempt. Notify only on
meaningful change, completion, failure or required human action.

Escalate uncertain intended behavior, conflicting ownership, two failed repair
attempts, lack of new evidence, missing permissions, account/billing blockers,
suspected sensitive data, or a necessary action outside the pass contract. Do not
change billing, permissions, release gates or check expectations to obtain a pass.

Distinguish recorded budget, actual native Goal usage, local checks, remote CI,
runtime/browser evidence and deployment status in the handoff.

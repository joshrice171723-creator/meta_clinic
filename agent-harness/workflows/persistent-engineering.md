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
   If annotations confirm Actions did not start because of account billing, record
   remote CI as unavailable and continue authorized local non-test verification.
   This does not grant a passing CI status or bypass branch protections. Inspect the
   owning app commands, prepare locked dependencies once, and queue local builds.
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

Do not repeatedly investigate an unchanged external blocker. GitHub Actions billing
does not block independent local implementation or builds; use local evidence and
leave remote CI explicitly unavailable. Other blocked paths remain parked while
independent work continues. Notify only on meaningful changes or required action.

## Development and independent QA coordination

The development loop selects one feasible unfinished slice from the canonical
tracker, checks active ownership, implements and verifies locally, then pushes an
independently reviewable branch. Build health supports delivery. Preserve separate
Build, Validation and external/human acceptance measures; source changes do not
close browser findings.

The existing QA reviewer/publisher loop owns eligible Muse repair batches, review,
integration, the single release lock and exact-build retest handoff. Both loops wake
every five minutes; existing Muse browser monitoring remains separately owned.
Do not create duplicate QA runs, repairs or publishers. QA first checks issue IDs,
PR reservations and current Muse activity; development chooses independent work
when its tracker slice overlaps a QA batch.

Development PRs use the `engineering-loop` label and state outcome, owned paths and
local evidence. They form a separately reviewed owner-authorized integration lane;
never invent Muse markers or defect IDs to make them eligible for automatic QA
approval. QA handles their scoped review and ordinary Git integration explicitly.
After integration, application changes may use the existing authorized publisher;
documentation-only pilot changes do not require a deployment.

For `aimetaclinic.com`, use the existing [Lightsail runbook](../../ops/lightsail/README.md)
and `release.ps1 -BuildWebOnHost`: clean pushed main, exact revision, matched images,
encrypted recovery round trip and live verification. Actions/GHCR are not required
for its local-image mode. Keep release gates, permissions and rollback boundaries.
The QA loop owns immediate publication; keep the separate scheduled publisher
paused to avoid competition. A five-minute wake never interrupts an active release
or active Muse run. Let a stale-build QA run finish, classify it as stale, and request
current-build retest through the existing owner.

Escalate uncertain intended behavior, conflicting ownership, two failed repair
attempts, lack of new evidence, missing permissions, account/billing blockers,
suspected sensitive data, or a necessary action outside the pass contract. Do not
change billing, permissions, release gates or check expectations to obtain a pass.

Distinguish recorded budget, actual native Goal usage, local checks, remote CI,
runtime/browser evidence and deployment status in the handoff.

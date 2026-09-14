# Shared development resources

Use `python bin/agent-resources run -- <command>` for heavy installs/builds/tests outside `bin/agent-check`. The check runner automatically serializes app-directory checks across worktrees sharing the Git common directory. This is a bounded waiting queue, not strict FIFO. Different clones and commands run directly without these entry points are outside its scope. Keep one writer per checkout and one runtime/database owner.

The kernel lock allows one heavy job at a time and releases when its owner exits. Metadata under the Git common directory's `development-resources` retains owner/child PIDs and timings, not command arguments or environment secrets. A surviving child blocks another job; a dead recorded child permits recovery. An interrupted launch with unknown child identity fails closed: inspect the local process state before repairing its metadata. Never kill an unrelated process or delete a live lock. Queue waiting stops at ten minutes with an error; it does not kill the current owner.

Rails workers are bounded to one; selected Vitest commands explicitly use one worker. Raw commands must supply their framework's worker limit if it does not honor these defaults.

## Two prepared slots

Prepare sequentially with `python bin/agent-resources prepare --slot 1` and `--slot 2`. New detached worktrees are siblings named `meta_clinic_prepared_1` and `meta_clinic_prepared_2`. Existing checkouts are never reset, deleted or advanced. Preparation invokes the existing locked-dependency prewarm through the heavy queue; services/databases are not started.

Claim with `python bin/agent-resources claim --slot 1 --owner TASK_ID`. Run commands through `python bin/agent-resources exec --slot 1 --owner TASK_ID -- ruby bin/dev start` so the slot environment is applied. Slot 1 uses web/API 3210/3211 and databases `apply_prepared_1_development` / `apply_prepared_1_test`; slot 2 uses 3220/3221 and corresponding `_2_` databases. Lifecycle startup checks port ownership; a collision is an error, not permission to take over. Database names are reservations until explicitly prepared through the normal synthetic lifecycle.

Use `status` to inspect readiness and assigned owner. Release requires the matching owner and a clean checkout. Stop owned services and preserve commits before release; the helper never resets or removes unfinished work. Claims are persistent and are not expired merely because a task is slow. To update a clean slot, claim it, deliberately choose a Git revision/branch, prewarm if lockfiles changed, then release when finished. Do not treat a ready slot as necessarily current main.

## Passing evidence

`bin/agent-check --reuse-evidence` can reuse passing frontend test evidence only. It fingerprints actual tracked/nonignored source, lockfiles, local `.env*`, dependency metadata, command, working-directory role, environment and Node/Ruby/Python versions. A changed source snapshot during execution prevents recording a pass. Matching environment is conservative: different paths/settings may prevent cross-worktree reuse. Secrets are hashed, not stored in evidence.

Evidence reuse assumes locked dependencies have not been manually patched inside ignored `node_modules`; after such a change run without `--reuse-evidence` and reinstall from the lockfile before using reuse again. Database/browser/provider/network checks, audits, builds and their generated outputs are never substituted with cached passes. A cache miss runs the check; a hit is printed explicitly with the original measured duration. Existing evidence does not imply launch or clinical acceptance.

For scoped tool changes run `python -B -m unittest discover -s agent-harness -p "test_*.py"` and `python bin/verify-agent-harness`. Do not run application regression merely to validate this resource wrapper.

## Initial local proof — 2026-09-14

- 23 harness tests passed, including single-owner contention, dead-child recovery, surviving-child denial, failed-launch recovery, source/environment invalidation and no database-test reuse. Harness structure and scoped diff checks passed.
- Both slots were created and prewarmed at application revision `cfff237`: 171.4 seconds and 200.5 seconds respectively, using 165 reused packages and zero downloads. Claim/competing-owner denial/release and both isolated environment mappings were exercised without starting services or creating databases.
- One selected two-case frontend test passed. An initial run included queue waiting and was invalidated by concurrent tooling edits, correctly preventing reuse. After the source froze, a normal pass took 8.12 seconds end-to-end and a matching reuse took 1.22 seconds (about 6.9 seconds avoided for this small check, not a whole-project speed forecast).
- No full application regression, live browser/database isolation run or launch audit was performed. Reserved distinct names/ports are not proof of running database isolation. Direct commands and other clones remain outside the cooperative queue.

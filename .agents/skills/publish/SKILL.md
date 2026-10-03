---
name: publish
description: Publish Meta Clinic to aimetaclinic.com only when Joshua explicitly invokes $publish or directly requests this publication. Freeze the development and QA loops, collect branch handoffs, review and verify their combined candidate, then use the existing Lightsail release gates. Never select this skill from a heartbeat or ordinary implementation request.
---

# User-controlled Meta Clinic publication

The development and QA loops keep separate owned branches. Neither advances main
or deploys. Joshua chooses when to integrate and publish. This skill is procedure,
not a tool permission or a promise that all defects can be detected.

## Invocation and boundaries

An explicit `$publish` invocation selects `https://aimetaclinic.com`, the existing
synthetic Lightsail environment, and authorizes preparation, reviewed integration
and publication of the two ready branch handoffs. `$publish prepare only` ends with
the verified candidate and does not push main or deploy. If Joshua names narrower
branches or exclusions, honor them. Do not ask for redundant approval within that
scope; ask only for unresolved choices that materially change included work.

Read root/nested instructions, `agent-harness/workflows/release.md`,
`ops/lightsail/README.md`, current `release.ps1`, `ops/qa/README.md` and the applicable
architecture and tracker context. Confirm actual current branch/runbook state.
Use only synthetic data; preserve credentials, recovery archives and unrelated work.
Do not add or run tests without explicit user authorization. Necessary non-test
build/type/source checks remain required; disclose test/browser evidence gaps.

## Freeze and collect

1. Read the existing automation configuration and both owning chats. Save prior
   schedule/status/prompt/notification fields for `meta-clinic-five-minute-engineering-loop`
   and `meta-clinic-muse-qa-review-2`; keep the separate scheduled publisher paused.
2. Pause both heartbeats using the Codex app automation-update capability. Pausing
   a schedule does not interrupt a running turn. Send a freeze-and-handoff request
   to development chat `01a0ef9f-3873-78e3-9618-7ef839f6aac4` and QA chat
   `01a0e70d-c6db-7c10-b353-98a8904db7b7` when they are other chats. The calling chat
   checkpoints itself. Invocation authorizes these coordination messages.
3. Require each owner to stop accepting work, finish or safely checkpoint owned
   operations, and report branch, base/full head SHA, complete owned files,
   committed/pushed state, checks, unresolved defects, incomplete exclusions and
   readiness. Never blindly commit their dirty work or interrupt a release midway.
4. Wait for actual quiescent handoffs, including native Goals. Do not treat an idle
   chat with an active continuing Goal as frozen. Ask its owner to pause that Goal;
   budget-limited Goals stay budget-limited. Missing ownership/readiness blocks
   inclusion; do not silently publish an incomplete branch.
5. Read available Muse run/build observations via its existing monitor without
   cancelling browser work. Missing monitor or pin confirmation is not a release
   coordination blocker. QA observes build.json automatically per finding/evidence
   and continues across deployments, recording revision boundaries and scoped
   follow-up. Keep actual owner handoffs and technical release checks distinct.

## Integrate and verify once

6. Fetch remote main and the exact handoff refs. Use a clean isolated integration
   checkout/branch, never the dirty shared root. Record current main SHA and the two
   frozen heads. Review each diff and ownership before merging; unrelated repair
   PRs are not automatically included. Do not fabricate Muse markers or use its
   auto-approve/merge helper on a development branch.
7. Merge the ready development and QA commits into the integration candidate. Review
   conflicts with both domains in view; request an owner decision for ambiguous
   behavior. Do not use blanket ours/theirs, reset, force-push or discard edits.
8. Review the combined diff for contracts, permissions, persistence, money, stock,
   recovery, incomplete changes and secrets. Prepare locked dependencies once and
   run necessary scoped non-test checks through `bin/agent-resources`. Run the web
   TypeScript/Vite build on the combined candidate, not just separately on each branch.
   Record actual results and known/browser gaps. Actions billing is unavailable CI,
   not a pass; never bypass GitHub branch protections. Failed necessary checks or
   known critical defects block release; return findings to the owners.
9. Recheck remote main and both frozen heads. Any drift invalidates affected evidence;
   reconcile and reverify the changed surface before publication. In prepare-only
   mode, report the exact candidate and leave both loops paused for Joshua's decision.

## Publish and resume

10. For an authorized publish, integrate the exact reviewed candidate into main via
    the repository's permitted review/merge path, without force or protection bypass.
    Verify pushed main equals the candidate. Use a separate clean local main release
    checkout at that same SHA; do not switch/reset the shared root's main.
11. Acquire the existing `Global\MetaClinicReleaseRunner` lock across fetch, build,
    recovery, switch and verification. Run current `release.ps1 -BuildWebOnHost` with
    the existing owner key privately. Keep all matched-image, clean/pushed-main,
    encrypted recovery round-trip and hosted verification gates. Do not create an
    alternate publisher. Failure before switching leaves the prior site; afterward
    follow documented image rollback and report database recovery separately.
12. Verify public `/build.json` exact SHA/version, `/up` and documented routes. Send
    that observed revision and per-change handoff to the existing Muse monitor for
    independent QA without manual pin approval or campaign-wide exact-build gates.
    Keep historical evidence on its original revision; record mixed/unavailable
    build observations and scope follow-up. A release pass is not browser QA acceptance.
13. After success, align each clean owned loop branch to released main through its
    owner's reviewed merge, once per publication. Preserve unfinished excluded work
    and never reset it. Save the release record in the canonical progress location.
    Restore only the two heartbeats that were active before the freeze and explicitly
    tell owners to resume; do not renew exhausted Goal budgets or activate the separate
    publisher. On failed verification or uncertain state, keep loops paused and give
    Joshua the precise failure, saved candidate/recovery state and next action.

## Tool availability

Use available Codex app tools for automation updates, chat messages/status and
artifact attachment, and normal Git/file/terminal tools for integration. If those
coordination capabilities are unavailable, stop before integration/publication and
report the missing freeze evidence. Never edit scheduler TOML directly as a substitute.
Long commands may finish under runbook gates; report budget/checkpoint boundaries
honestly instead of silently starting a fresh Goal for unfinished release work.

Report publication yes/no, exact SHA, included/excluded heads, combined checks,
recovery/live evidence, QA pending status and whether each loop resumed.

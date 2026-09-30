# APPly repository agent contract

These instructions apply to the whole repository. APPly combines business planning with wholly synthetic application development; it is not an approved patient-record or confidential-applicant workspace.

## Instruction layers

1. This file supplies repository-wide invariants. Read the nearest nested `AGENTS.md` before changing its paths.
2. Load only the applicable procedure from [`agent-harness/workflows/`](agent-harness/workflows/README.md) and matching skill from [`.agents/skills/`](.agents/skills/).
3. Use the vault for durable direction, decisions, risks and evidence; keep active coordination in the current task.

More-specific instructions may add safeguards or commands; they may not weaken the boundaries in this file. Each explicitly delegated agent reviews the instructions and vault context relevant to its own bounded subtask.

## Harness and knowledge boundary

- `AGENTS.md` routes stable policy, workflows hold procedures, skills are on demand, and `bin/agent-*` provides deterministic checks.
- `APPlyVault/` holds product knowledge; source, tests, migrations and runbooks remain executable truth. Prompt text never grants runtime, deployment or approval authority.

See [`agent-harness/README.md`](agent-harness/README.md) for the component map and skill catalog.

## Non-negotiable boundaries

- Use independently created synthetic data only. Never access, request, copy, upload, log, screenshot or commit patient information or real-derived examples.
- Keep credentials, tokens, connection strings, private keys and recovery material out of notes, source, prompts, logs and Git.
- Keep the consultancy, proposed software company, physician services and customer clinics distinct. Software work does not grant clinical, contractual, purchasing, filing, signing or data-access authority.
- A source change does not authorize deployment, publication, external communication, spending, production access, live integration or real/confidential-data use.
- Unknown facts remain unknown. Do not invent owners, dates, approvals, budgets, requirements, rates or completed reviews.
- A build or test result is not security, legal, clinical, operational, HIPAA or release acceptance.

If potentially sensitive information or a suspected incident appears, stop the affected inspection, avoid repeating the contents, preserve existing evidence and notify the user. Do not independently delete evidence, rewrite history, rotate credentials, change access or send external notices. Follow [`agent-harness/workflows/incident.md`](agent-harness/workflows/incident.md).

## Task modes and authority

- All subagents default to GPT-6.1 Sol (`gpt-6.1-sol`). Choose reasoning effort for the task; explicit user model instructions take precedence.

- **Testing preference:** Do not add tests or run tests unless Joshua explicitly requests them. This instruction overrides test recommendations in general workflows and skills. Prefer scoped source and diff review; run only non-test checks that are necessary for the requested change, and avoid broad verification overhead.

- **Review, explain or diagnose:** inspect and report. Do not edit unless the user also requests a change.
- **Implement:** make the smallest local change within the requested scope and run proportionate checks.
- **Release or external action:** require explicit authorization for the exact target and action; follow the applicable runbook.
- **Destructive or difficult-to-recover action:** resolve exact targets and authority first and prefer recoverable alternatives.

When a missing choice would materially change the result or expand authority, stop and ask. Otherwise make bounded, reversible assumptions and state them.

Follow [economical execution](agent-harness/workflows/code-change.md#economical-execution-and-handoffs); it overrides older skill model defaults.

## Start read-only

Before the first write:

1. Run `git status --short`; preserve existing work and check for overlapping ownership.
2. Run `bin/agent-preflight --path <target>` for each major area and read its nested instructions/workflow.
3. For implementation or vault changes, use the vault table of contents to select only relevant current context.
4. Read the relevant development and architecture sections, then state scope, conflicts and intended changes.

Use [shared development resources](docs/development/development-resources.md): claim a prepared worktree; queue heavy commands through `python bin/agent-resources run -- <command>` (app checks queue automatically). Prewarm fresh dependencies once; preserve claimed/dirty slots and isolated runtime state. Reuse only valid source-test evidence with intact locked dependencies.

Do not edit, rename, delete, format broadly, install dependencies, run generators, change settings or deploy until the review is complete. External links are not reviewed merely because a vault note references them.

## Canonical records

| Information | Canonical location |
| --- | --- |
| Durable product definition | `PRODUCT.md` |
| Orientation and priorities | `APPlyVault/00 Home.md` |
| Context routes | `APPlyVault/01 Table of Contents.md` |
| Clinic visual system | `APPlyVault/03 Execution/Design.md` |
| Explicit decisions and authority | `APPlyVault/03 Execution/Decisions.md` |
| Risks and assumptions | `APPlyVault/03 Execution/Risks and Assumptions.md` |
| Recent dated outcomes | `APPlyVault/03 Execution/Progress Log.md` |
| Detailed historical evidence | `records/` |
| Development and CI workflow | `docs/development/` |
| Code ownership and architecture | `docs/architecture/software-architecture.md` |

Preserve reported facts, observations, sourced background, proposals and decisions as distinct evidence types. Follow later decisions and current evidence without erasing superseded history.

## Change discipline

Healthcare reference review is U.S.-only: use U.S. guides and applicable federal/state authorities. Exclude other countries' profiles, regulations and examples. Use global standards such as FHIR and UCUM only with documented U.S. applicability; unknown jurisdiction is not U.S. approval.

For healthcare workflow, page, data-model and integration design, authoritative healthcare standards are a primary design input. Before choosing fields or behavior, follow [Standards-guided healthcare development](docs/development/healthcare-standards.md): review applicable FHIR implementation guides and relevant terminology or operational sources, record version and applicability, and map requirements to backend data, UI behavior and verification. Explain when no relevant guide applies. This applies to new work and substantive revisions, not every cosmetic edit; it does not mandate a FHIR-native database or a field on screen for every resource element.

Use the current commands and ownership rules in `docs/development/`, `docs/architecture/`, application READMEs and the nearest nested instructions. Do not copy changing versions, ports, hosted state or implementation details into this root contract.

- Work within the existing package, architecture, migration and lockfile boundaries described by the nearest instructions.
- Keep changes independently reviewable. Do not overwrite, reformat or silently incorporate unrelated work.
- Keep ordinary development screens focused on the task. Do not add persistent banners or repetitive UI copy that merely restates the synthetic/development or non-production status; record that context in repository documentation and agent guidance instead. This presentation rule never authorizes removing runtime access controls, real-data restrictions, release gates, or security checks.
- Apply failure-first review proportionately:
  - For an ordinary local edit, identify the principal failure and inspect the changed behavior and diff; do not run tests unless explicitly requested.
  - Follow `agent-harness/workflows/failure-first.md` proportionately; active-development checks target changed behavior, while complete reviews belong to explicit milestones or release work.
- Preserve local tests, mocks, synthetic fixtures and guards. Do not add or run tests unless explicitly requested. Do not remove guards to make a test pass.
- Stop only the blocked or unsafe path; continue independent safe work.

Follow [this workflow](agent-harness/workflows/code-change.md).

## Verification and handoff

### Active development default

Meta Clinic has no production users. Prioritize working journeys with scoped source review, applicable non-test build/type checks when needed and one short walkthrough. Check affected permissions, money, stock, persistence and lost-work behavior. Add or run tests only when Joshua explicitly requests them. Defer broad regression, device matrices, restore rehearsals and operational hardening to explicit milestones or prelaunch; model/route/schema edits alone do not trigger them.

Apply the [code-change workflow](agent-harness/workflows/code-change.md): reassess verification at 10 minutes, reuse valid evidence, bound retries and defer unrelated historical failures. Preserve runtime protections. Report implementation, focused verification and pending launch verification separately. This default supersedes generic launch-depth requirements; explicit user-requested acceptance checks still apply.

Before finishing:

1. Inspect the scoped diff and working-tree state.
2. Review checks required by the nearest `AGENTS.md`; use `bin/agent-check` only for non-test checks needed by the requested change. Do not add or run tests unless Joshua explicitly requests them. Harness changes use `bin/verify-agent-harness`; vault changes use `bin/verify-vault` only when requested or necessary for the requested outcome.
3. Verify that no unrelated work, secret or sensitive material was included.
4. Update canonical vault records only when direction, requirements, risks, evidence or a decision actually changed. Refresh Home only when overall direction or priorities changed.
6. Report what changed, checks actually run and their outcomes, checks not run, remaining risks/gates and required human decisions.

Never mark a source review, professional gate, incident response, release or HIPAA assessment complete without the required evidence.

<!-- graft:start -->
## Graft — repo context graph

Use the indexed `graft/` graph before opening source or searching. Start with
`graft map` for an unfamiliar area. Reuse known symbols, errors or filenames.

- `graft ask "<question>" --source` ranks relevant code spans; use `--full`
  when the short span is insufficient. Cite its `covers:` file:line evidence.
- `graft grep "<literal>"` finds every indexed occurrence; use raw grep only
  for unindexed files.
- `graft skeleton <file>` lists every definition and span.
- `graft callers <symbol>` traces callers; add `--direction out` for callees
  or `--depth N` for the wider impact. Use this before structural changes.
- `graft/INDEX.md` lists nodes. Narrow monorepo queries with `--in <scope>/`.

Open source at an exact span only when the graph lacks needed detail or marks
it truncated. Refresh after major changes with `graft build` (local, no key).
<!-- graft:end -->

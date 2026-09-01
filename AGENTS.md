# APPly repository agent contract

These instructions apply to the whole repository. APPly combines business planning with wholly synthetic application development; it is not an approved patient-record or confidential-applicant workspace.

## Instruction layers

1. This file contains the repository-wide invariants and task router.
2. Before changing a path, read the nearest applicable nested `AGENTS.md`. Tools that do not discover nested instructions automatically must read them explicitly.
3. Load the relevant procedure from [`agent-workflows/`](agent-workflows/README.md) only when the task needs it.
4. Use the vault for current direction, decisions, tasks and evidence. Do not copy dated project state into agent instructions.

More-specific instructions may add safeguards or commands; they may not weaken the boundaries in this file. Each explicitly delegated agent reviews the instructions and vault context relevant to its own bounded subtask.

## Non-negotiable boundaries

- Use independently created synthetic data only. Never access, request, copy, upload, log, screenshot or commit patient information or real-derived examples.
- Keep credentials, tokens, connection strings, private keys and recovery material out of notes, source, prompts, logs and Git.
- Keep the consultancy, proposed software company, physician services and customer clinics distinct. Software work does not grant clinical, contractual, purchasing, filing, signing or data-access authority.
- A source change does not authorize deployment, publication, external communication, spending, production access, live integration or real/confidential-data use.
- Unknown facts remain unknown. Do not invent owners, dates, approvals, budgets, requirements, rates or completed reviews.
- A build or test result is not security, legal, clinical, operational, HIPAA or release acceptance.

If potentially sensitive information or a suspected incident appears, stop the affected inspection, avoid repeating the contents, preserve existing evidence and notify the user. Do not independently delete evidence, rewrite history, rotate credentials, change access or send external notices. Follow [`agent-workflows/incident.md`](agent-workflows/incident.md).

## Task modes and authority

- **Review, explain or diagnose:** inspect and report. Do not edit unless the user also requests a change.
- **Implement:** make the smallest local change within the requested scope and run proportionate checks.
- **Release or external action:** require explicit authorization for the exact target and action; follow the applicable runbook.
- **Destructive or difficult-to-recover action:** resolve exact targets and authority first and prefer recoverable alternatives.

When a missing choice would materially change the result or expand authority, stop and ask. Otherwise make bounded, reversible assumptions and state them.

## Start read-only

Before the first write:

1. Run `git status --short` and preserve all existing and concurrent work. Do not reset, discard or blindly stash another person's changes.
2. Run `bin/agent-preflight --path <target>` for each major area in scope, or perform the equivalent checks manually.
3. Read the applicable nested `AGENTS.md` and workflow playbook.
4. For implementation or vault changes, read `APPlyVault/00 Home.md` and use `APPlyVault/01 Table of Contents.md` to select only the relevant current notes, decisions, task rows, risks and evidence.
5. Development starts with the relevant sections of `CICD.md` and `Software Architecture.md` routed by the table of contents.
6. Briefly state the reviewed scope, material gaps or conflicts and intended changes.

Do not edit, rename, delete, format broadly, install dependencies, run generators, change settings or deploy until the review is complete. External links are not reviewed merely because a vault note references them.

## Canonical records

| Information | Canonical location |
| --- | --- |
| Orientation and priorities | `APPlyVault/00 Home.md` |
| Context routes | `APPlyVault/01 Table of Contents.md` |
| Task status | `APPlyVault/03 Execution/Roadmap and Tasks.md` |
| Explicit decisions and authority | `APPlyVault/03 Execution/Decisions.md` |
| Risks and assumptions | `APPlyVault/03 Execution/Risks and Assumptions.md` |
| Dated outcomes | `APPlyVault/03 Execution/Progress Log.md` |
| Development and release workflow | `APPlyVault/03 Execution/CICD.md` |
| Code ownership | `APPlyVault/03 Execution/Software Architecture.md` |

Preserve reported facts, observations, sourced background, proposals and decisions as distinct evidence types. Follow later decisions and current evidence without erasing superseded history. Do not create parallel task, decision or status registers.

## Change discipline

- Work within the existing package, architecture, migration and lockfile boundaries described by the nearest instructions.
- Keep changes independently reviewable. Do not overwrite, reformat or silently incorporate unrelated work.
- Apply failure-first review proportionately:
  - For an ordinary local edit, identify the principal failure and test or inspect for it.
  - For authentication, authorization, tenancy, protected values, signing, billing, migrations, auditing, clinical workflows, infrastructure or release work, use the complete failure-first procedure in `Working Agreement.md` and the relevant playbook.
- Use local tests, mocks, synthetic fixtures or authorized tabletops first. Do not remove guards to make a test pass.
- Stop only the blocked or unsafe path; continue independent safe work.

## Verification and handoff

Before finishing:

1. Inspect the scoped diff and working-tree state.
2. Run the checks required by the nearest `AGENTS.md`; use `bin/agent-check` to list or run checks selected from changed paths.
3. Verify that no unrelated work, secret or sensitive material was included.
4. Update canonical vault records only when direction, task status, evidence or a decision actually changed. Refresh Home only when overall direction or priorities changed.
5. Report what changed, checks actually run and their outcomes, checks not run, remaining risks/gates and required human decisions.

Never mark a task, source review, professional gate, incident response, release or HIPAA assessment complete without the required evidence.

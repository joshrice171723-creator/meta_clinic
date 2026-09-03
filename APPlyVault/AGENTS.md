# APPlyVault agent instructions

These instructions apply to `APPlyVault/` and extend the repository root contract.

## Select context before editing

1. Read `00 Home.md` and `01 Table of Contents.md`.
2. Use the table's task route to select complete relevant sections, including frontmatter, scope/limits, linked decisions, task rows, risks and dated evidence.
3. Follow only dependencies needed to understand the task. A full-vault read is not required.
4. If the table is stale, use targeted `rg` searches and `rg --files --hidden --no-ignore APPlyVault`; do not assume missing evidence exists.
5. Recheck selected files before writing when concurrent edits are possible.

Keep a short in-session record of selected paths/sections and material gaps. Missing evidence blocks only conclusions or changes that depend on it.

## Evidence and authority

- Keep reported facts, direct observations, sourced background, hypotheses/proposals and explicit decisions distinct.
- Record source or event date, applicability, limits and reviewer scope. A link or checklist is not proof of review or approval.
- Preserve decision/task IDs, backlinks, heading targets and superseded history. Do not silently turn a discrepancy into a new decision.
- Never infer the contents of unavailable MD, governance, contract, SharePoint or other external materials.
- Research uses generic public queries only; never send private vault text or identifiers to a search service.

## Where changes belong

- Current coherent state: the relevant foundation, research or implementation note.
- Status: `03 Execution/Roadmap and Tasks.md` only.
- Explicit founder/team decision: `03 Execution/Decisions.md` only.
- Open uncertainty: `03 Execution/Risks and Assumptions.md`.
- Dated actual outcome: `03 Execution/Progress Log.md`.
- Navigation and task routing: `01 Table of Contents.md`.
- Overall direction/priority summary: `00 Home.md`, only when it actually changed.

For a substantive vault change, update affected current-state notes, change the task register only when status changed, record a decision only when one was made, and add one concise progress entry. Do not maintain competing lists.

## Editing conventions

- Use plain Markdown, existing `type`/`status`/`updated` frontmatter, ISO dates, unique descriptive filenames and Obsidian wiki links.
- Update `updated` on materially changed notes.
- Maintain the table of contents when a note is added, removed or changes purpose.
- Preserve shared `.obsidian/` configuration unless the task specifically concerns it; workspace UI state may be concurrently modified.
- Templates are reusable structures, not evidence of an actual review or outcome.
- Do not restore the founder-removed `reference/` directory.

## Validation

Run `bin/verify-vault` after vault changes. It checks required frontmatter, dates, fences, note names, wiki/heading targets, relative links and Home reachability. Run `bin/verify-agent-harness` after agent-instruction, workflow, skill or adapter changes. Also run `git diff --check` and inspect the final diff.

Use [`../agent-harness/workflows/vault-change.md`](../agent-harness/workflows/vault-change.md) for the complete change procedure and [`../agent-harness/workflows/research.md`](../agent-harness/workflows/research.md) for sourced work.

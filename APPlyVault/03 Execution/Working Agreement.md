---
type: operating-agreement
status: active
updated: 2026-09-03
lifecycle: active
canonical_for: team-operating-agreement
---
# Working Agreement

Home: [[00 Home]] · Roadmap: [Shortcut](https://app.shortcut.com/apply-1/roadmap) · Decisions: [[Decisions]] · Risks: [[Risks and Assumptions]] · History: [[Progress Log]]

## Purpose

Keep direction, evidence, decisions and next actions understandable to the founder, developers and future collaborators. This note owns the human operating agreement for maintaining the shared record. Agent behavior belongs in root and nested `AGENTS.md`, reusable procedure belongs in `agent-harness/workflows/`, and developer mechanics belong in `docs/`, application READMEs and operational runbooks.

## Canonical record ownership

- [[00 Home]] is a short orientation and current-priority summary, not a task register.
- [[01 Table of Contents]] is the vault navigation and context index.
- Foundation and product notes own the latest coherent business and product state.
- The [Shortcut Roadmap and Agent Workspace](../../docs/development/shortcut.md) own Epics, Stories, task scope/acceptance, claims, owners and status. The vault contains no task register or task briefs.
- [[Decisions]] is the only explicit decision and authority register.
- [[Risks and Assumptions]] owns uncertainties, hypotheses and evidence needed to resolve them.
- Research notes and [[Source Register]] own source applicability, review dates and limitations.
- [[Progress Log]] is a compact index of dated outcomes; detailed historical records live under `records/`.
- New material progress evidence gets one dated Markdown record under `records/progress/YYYY/MM/`; the active Progress Log contains navigation and a concise outcome row, not a duplicate body. Existing monthly snapshots remain preserved.
- [Developer documentation](../../docs/README.md) owns current setup, architecture, testing and CI guidance.

Do not maintain competing lists. Link to the canonical record instead of copying its status or conclusion.

## Evidence and authority

Keep these evidence types distinct:

- **Reported:** supplied by the founder or another collaborator and not independently verified.
- **Observed:** directly inspected behavior, source or bounded test evidence with a date and scope.
- **Sourced background:** a statement supported by a cited source, not case-specific approval.
- **Proposed or hypothetical:** a design, assumption or option awaiting selection or evidence.
- **Decided:** an explicit choice by the identified decision-maker, recorded with its date and limits.

Unknown facts remain unknown. An unavailable source is not evidence that it does not exist. A passing check, screenshot, implementation or completed plan is not professional, security, operational, clinical, HIPAA or release acceptance.

Preserve conflicting evidence and superseded decisions with context. Do not silently convert a discrepancy into a new decision, reopen settled direction without material contrary evidence, or turn an exploratory preference into a commitment.

## Planning and review

Every accepted Shortcut Story has one observable outcome, explicit scope and exclusions, an accountable owner, dependencies and required exit evidence. Due dates are agreed commitments rather than generated estimates. A Story is Done only when its stated evidence exists.

The repository's [failure-first procedure](../../agent-harness/workflows/failure-first.md) provides the reusable implementation and review method. The Shortcut Story contains the task-specific failure hypothesis and acceptance; durable evidence records contain the observed controls, recovery and result—not a copy of the procedure.

Professional-review gates require an appropriate reviewer. Hosted work, destructive recovery, external communication, spending, real/confidential data and production changes require their own explicit authority and evidence.

## Failure-first planning and review

This compatibility heading preserves existing vault links. Agents follow the repository's [failure-first workflow](../../agent-harness/workflows/failure-first.md); this agreement records only the human acceptance and evidence expectations above.

## Human review cadence

A weekly 20–30 minute founder/MD review remains a proposal: progress, new field evidence, blockers, decisions and the next three priorities. Record selected priorities on the Shortcut Roadmap and use [[Weekly Review Template]] only after participants and timing are agreed. No reminder, automation or background monitoring is established by this proposal.

## Owners and completion

Assign one accountable owner per accepted Story; list contributors separately. Record an explicit decision with the decision-maker and date. When work slips, preserve the reason in Shortcut and agree a new date rather than silently rolling it forward.

At review:

1. Reconcile the affected current-state note.
2. Update the claimed Shortcut Story's scope, owner, blockers, evidence and state; update its Epic when the broad Roadmap changed.
3. Add to [[Decisions]] only when a decision was actually made.
4. Add or update [[Risks and Assumptions]] when uncertainty changed.
5. Add one concise dated outcome to [[Progress Log]] with a pointer to detailed evidence when the result is material.
6. Refresh Home only when overall direction or priorities changed.

## Information handling

- Keep the vault free of patient information, confidential applicant material and system credentials.
- Use independently created synthetic data for examples and demonstrations.
- Do not place patient screenshots or real records in notes, attachments, prompts, logs or linked public pages.
- Store legal advice, contracts and sensitive business records only in an approved access-controlled location; a non-sensitive summary may be referenced here.
- Do not assume Obsidian plugins, sync, publishing, shared links, AI services or backups are approved for sensitive information.
- Agree vault access, backup/restore ownership and sharing rules before adding sensitive company material.

## Editing and lifecycle

Use plain Markdown, unique descriptive names, ISO dates and the established frontmatter. Update `updated` for material changes. Add `lifecycle` and `canonical_for` when a note is reviewed during the cleanup.

Current notes describe coherent current state. Historical implementation transcripts, changing test totals and superseded mechanics belong in `records/`; application source, migrations, tests and runbooks remain executable truth. Preserve unique release, incident, migration, recovery, security and professional-review evidence even when it leaves active vault context.

Templates are reusable structures, not evidence that a review occurred. Git history is recoverability, not a substitute for an accessible material evidence record.

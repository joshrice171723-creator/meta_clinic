# Vault architecture cleanup — 2026-09-03

## Scope and authority

The founder approved a feature-branch reorganization separating agent information, developer information, current product knowledge and detailed historical evidence. Three Luna Medium subagents audited and implemented bounded developer, technical and history slices. No application runtime, hosted environment, real data or release gate was in scope.

## Disposition

| Former active material | Current owner | Retained vault role |
| --- | --- | --- |
| Setup, contribution and CI manual in `CICD.md` | `docs/development/` and ops runbooks | Compact delivery-state pointer and stable headings |
| Architecture, ERD and frontend/backend implementation detail | `docs/architecture/` | Compact current-boundary/pointer notes |
| Dated proposal, adversarial review, prompt and verification report | `records/proposals`, `records/design-reviews`, `records/prompts`, `records/verification` | Stable titles, current limits and links |
| Older progress bodies | `records/progress/` by month | Recent active window plus compatibility headings |
| Verbose completed task rows | `records/tasks/` | Canonical IDs/statuses and concise live rows |
| Agent failure-first and cleanup procedure | `agent-harness/workflows/` | Human evidence/acceptance summary only |

## Preservation checks

- All 50 pre-cleanup roadmap task IDs and exact status strings were retained before T-51 was added; no source row was removed.
- All 116 pre-cleanup progress entries are preserved in monthly records; compatibility headings maintain vault backlinks.
- The eight technical vault notes moved in full to developer or dated-record destinations before compaction.
- Failures, unresolved gaps, sensitive-data boundaries and professional/release limits remain in the retained records.
- `.obsidian/workspace.json` changed concurrently as UI state and was not incorporated into this cleanup.

## Measurements

Baseline active vault: 46 Markdown notes and 1,375,517 bytes. The final audit reports 42 active notes / 722,828 bytes plus four archived compatibility notes, or 46 total notes / 728,405 bytes—a 47% reduction in the default active corpus while retaining the moved text in `docs/` and `records/`. `CICD.md` fell from 47,645 to 3,392 bytes, the eight technical notes from 368,304 to 10,725 bytes, and `Progress Log.md` from 281,539 to 43,269 bytes. The 84,300-byte live roadmap remains the sole hard-budget candidate because its active prospective plan was deliberately preserved; later cleanup should classify that plan before splitting it.

## Continuing procedure

Use `agent-harness/workflows/knowledge-maintenance.md`. Run `bin/vault-audit` before classification; preserve IDs/backlinks/unique evidence; use Markdown links across the vault/docs/records boundary; and run the vault, harness and whitespace checks afterward. Audit findings are review prompts, never automatic deletion authority.

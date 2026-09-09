# Vault change workflow

## When to use

Use for any edit under `APPlyVault/`, including evidence, planning, status, decisions or navigation.
For cleanup, archival or cross-boundary moves, also load [`knowledge-maintenance.md`](knowledge-maintenance.md).

## Procedure

1. Read `APPlyVault/AGENTS.md`, Home and the TOC. Select the complete relevant sections, decisions, risks and dated evidence.
2. State the review scope and any missing, stale, contradictory or inaccessible sources before writing.
3. Decide the correct record type:
   - coherent current state → the owning note;
   - explicit decision/authority → Decisions;
   - uncertainty → Risks and Assumptions;
   - dated outcome → Progress Log;
   - navigation → TOC;
   - overall priority change → Home.
4. Preserve evidence labels, IDs, frontmatter, backlinks, heading targets and superseded history. Do not duplicate status or decisions.
5. Update `updated` on materially changed notes. Maintain the TOC only when note membership/purpose or routing changed.
6. Add one concise progress entry for a substantive vault change: request/outcome, scope/evidence, checks/limits and next action.
7. Run `bin/verify-vault`, `bin/vault-audit` and `git diff --check`; inspect the complete Markdown diff.

## Evidence rules

Never label a source reviewed, a task done or a professional/release gate passed without supporting evidence. External links are references, not reviewed contents. Templates and plans are not actual outcomes.

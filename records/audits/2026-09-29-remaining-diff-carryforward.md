# Remaining diff carryforward — 2026-09-29

Base: main `769fc07d4fda43acf93a16ecd9affa3950662d53`. Candidate version: 0.2.2. This record describes source integration, not deployment or browser acceptance.

## Carried forward

- Anonymous navigation tour: reuse the existing read-only tour and registration form. Both controller and shared service require registration for other lessons. Anonymous tour restart compares optional visitor IDs safely. Its catalog exposes only the tour; leaving it returns to registration.
- Scribe: confirmed HTTP client rejections no longer incorrectly lock the workspace as an unknown mutation outcome. Timeouts, transport failures, server errors and unconfirmed outcomes retain the reconciliation lock. In the demo frame, Start session without a linked encounter uses the existing sample-encounter endpoint; the duplicate sample button is removed. Real workspace session creation is unchanged.
- Original dirty worktree files remain untouched. This candidate contains selected changes, not a wholesale replacement from an older checkout.

## Still preserved separately

- CareFlow clinic-timezone rewrite: the draft predates current site timezone overrides, walk-in timing, clinician assignment and draft recovery. It does not cover all those paths; do not apply the old file wholesale. Current device-time entry and clinic-time preview remain intact pending a focused conversion/recovery review.
- Root clinic setup draft mostly duplicates shipped recovery. Its workforce query expansion requires separate permission review. Root tests and original edits remain preserved.
- Local model configuration, generated render/output directories, unreviewed marketing assets and temporary release helpers remain outside Git integration.
- Historical PR #3 and conflicting operations PR #4 remain separate, as recorded in the release reconciliation receipt.

## Verification

TypeScript typecheck and syntax checks for both changed Ruby files passed. DemoJourney formatting and scoped diff checks passed. The scribe file has existing formatting drift; broad formatting was not included. Tests were not added or run, per repository policy. Browser acceptance, hosted publication and Muse exact-build retest remain pending. Atlas percentages are unchanged because this carryforward does not establish new implementation-row acceptance.

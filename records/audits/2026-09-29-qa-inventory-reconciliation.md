# QA inventory reconciliation — 2026-09-29

Joshua authorized fixing every listed Meta Clinic defect and clarified that the remembered larger board must not be replaced by the 70-item Muse retest. This checkpoint reconciles available inventories; it does not claim application defects are all fixed.

| Inventory | Verified scope | Meaning |
| --- | --- | --- |
| Implementation Atlas | 81 unique named rows: 16 core, 12 intake, 2 behavioral health, 10 application review, 10 hardening, 10 journey, 21 sandbox | Overlapping requirements and acceptance work, not 81 unique defects. Current linked-source parsing was used, not the HTML's dated fallback. |
| Atlas percentage dashboard | Build 73.2%, local Validation 46.3%, external/human acceptance 0% | Equal-weight MC-01–15 recorded estimates. Optional MC-16 is excluded. No score changed in this checkpoint. |
| Muse full hand retest | 70 historical findings in the imported run | Separate from Atlas requirements. Original revisions and incomplete evidence remain intact. |
| GitHub `muse-qa` | 8 open issues observed on 2026-09-29 | Current issue tracker state, not a count of all historical defects or proof of reproduction on this local build. |
| Older 140-case UI audit | Historical references located; original case ledger unavailable | The recorded Desktop Astra-Reviews folder contains only scratch/stage-3 directories, not the referenced verdict/findings/disposition files. Its cases are not imported, marked passed, or counted as unique open defects. Recover its export and reconcile against current source and Muse IDs before reporting a combined total. |
| Muse workflow catalog | Expected 116; full coverage export absent | Workflow definitions/coverage are neither extra bugs nor acceptance evidence. Missing records remain unassessed. |

## Delivered local slice

The owner/service-token-gated `/qa?view=atlas` page now exposes all 81 Atlas work rows with search, recorded state/evidence, remaining work, source names and independent percentage dimensions. `/api/qa/atlas.json` provides the same data. The Markdown tracker remains authoritative. The deployment snapshot is derived using the existing Atlas JavaScript parsers; source digests detect stale local snapshots, and packaged snapshots are labeled separately. No new library or replacement tracker was added.

Historical failures and older review/inbox tasks show their revision in Mission control rather than appearing to be current-build failures. The status endpoint labels completed task counts as `current_build_completed_tasks`, not defect passes.

An exact-build QA bug was repaired: uncommitted local source formerly retained the previous SHA while allowing pin/queue/run/approval actions. The API now rejects dirty-source pinning, task creation, claims/verdicts, baseline preparation and positive approval. A claimed run returns to the queue with an abort event on dirty source or build change. Positive human approval also requires the confirmed pin to match. UI controls reflect the dirty-source pause. No human approval was submitted.

## Evidence and next work

Scoped Ruby lint, route syntax, TypeScript, the full web production build, vault/harness checks, and the rollback-only runnable workspace check passed. That check covers invalid Atlas percentages, 81 unique rows, current source digests (normalized across Windows/Linux line endings), private access, and seven clean/dirty exact-build request assertions. Browser inspection confirmed all 81 rendered rows, the displayed percentages, the separate 70/8 counts, and disabled QA actions while source was dirty. No application-wide browser acceptance, recovered 140-case audit, or completion of every Meta Clinic defect is claimed.

Recover the original 140-case ledger, retain its provenance, map overlap against the historical Muse and GitHub identifiers, then repair and retest current reproducible defects in bounded domain batches. Do not close historical findings merely because a source patch exists. Product decisions and missing reproduction evidence remain explicit; keep independent executable fixes moving when their evidence is available.

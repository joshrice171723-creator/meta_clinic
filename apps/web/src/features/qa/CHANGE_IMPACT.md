# Read-only publish impact

`change-impact.json` is a source-controlled, public-safe annotation artifact bundled by the existing web and Office-widget builds. It is independent of both QA ledgers. No API, importer, actor identity, permission, scheduling, build pin, retest action or verdict changes are made.

The shipped artifact is intentionally empty. Muse's canonical WORKFLOWS.md / COVERAGE_STATE catalog is unavailable in this checkout. Never derive mappings or titles from `tools/workflow-properties/workflows.json` (a different catalog), numbered position, or filename guesses. Dot's actual release mapping and Muse's bridge remain separate inputs for the sole integrator.

## Artifact contract

Root: `{ "schemaVersion": 1, "scopes": [] }`. Each scope has exactly:

- `baselineSHA`, `targetSHA`: distinct full lowercase 40-character Git SHAs of **already existing** revisions.
- `evidenceRefs`: at least one public-safe provenance/reference string for the reviewed scope.
- `workflows`: zero to 116 explicit rows, unique canonical IDs. Each row has exactly `workflowId` (`WF-001` through `WF-116`), `status` (`affected`, `untouched`, `unknown`), nonblank `reason`, `sourcePaths` (string array), `evidenceRefs` (nonempty string array), and `claimedFixIds` (positive integer Muse defect IDs; empty when no claim).

References and paths are shown as inert text, never fetched or interpreted as authority. Include no credentials, private source contents or sensitive evidence. Structural validation does not establish that a mapping is correct: the integrator must check it against the actual canonical catalog and diff. Unknown titles are never filled in.

Only affected rows plus rows with claimed fixes enter the displayed re-QA scope. Missing rows stay unknown; an incomplete map cannot imply the other workflows are untouched. Explicit untouched rows retain historical verdicts as **stale untouched**. A claimed fix never establishes a pass or clears an unresolved impact classification. Invalid artifacts, duplicate pairs/IDs and extra fields fail closed. Existing current-build ledger counters retain their independent exact-revision semantics.

## Delivery and selection

Commit a reviewed comparison of two existing releases in a **later independent QA-page change**, through the existing source/build path. Its `targetSHA` is the release under comparison, not the commit containing this artifact. This avoids a self-referential commit hash. Users explicitly select the full SHA pair; no pair is inferred from a pin, version, shortened hash or latest-array position. A selected target differing from the observed build is labeled a separate comparison and never changes current-build action scope.

The Office workflow grid (also used by the Office widget) exposes impact in each cell's accessible label/tooltip and workflow detail. The legacy coverage table uses the same detail projection and retains its own empty or populated ledger. Both views show full-pair selection, counts and re-QA IDs. No partial import or fabricated ledger rows are needed.

Updating the artifact at runtime without a normal separately authorized source release is **not implemented**. If same-release runtime delivery is required, the integrator must select an already-supported release-artifact channel or obtain a separate process decision; do not add an authenticated impact-write endpoint or new auth here.

## Bounded next stage (pending Muse input)

Expand the grid's workflow detail into a workflow center: canonical title only from Muse's verified catalog; selected-pair impact/reason; explicit scoped retest queue with existing actor and pin checks; fix claims separate from outcomes; immutable evidence history by exact revision; recorded ownership and blockers. Define with Muse who can request/claim/run each scope, when unknown impact blocks dispatch, what proves completion, and how retries/build changes stop work. This foundation neither authorizes nor implements autonomous runs.

## Muse workflow-center brief and implementation sequence

Muse reports no usable QA write path, polling-only coordination, trapped sessions, missing fixtures and a grid dependent on another import. These are requirements input, not verified diagnoses or an authority grant. Existing source already has evidence, task transition, defect and retest routes; reconcile capabilities and transport with the bridge before duplicating them.

| Stage                             | Owned files / contract                                                                                                                       | Acceptance                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Canonical catalog and impact   | This QA frontend module; a separately reviewed catalog projection under `apps/api/app/services/qa/` if authenticated delivery is required    | Obtain Muse's full 116-ID bridge with provenance. Preserve the ledger; no partial replacement. Catalog content supplies ordered machine-checkable steps (route/selector/action), required roles, prerequisites, named synthetic fixtures, per-step expected text/element/URL, dependencies/services/flags, evidence specification and explicit owner policy. Keep append-only verdict history distinct from executable definitions. |
| 2. Exact evidence binding         | `apps/api/app/controllers/qa/workspace_controller.rb`, QA evidence/task models and a focused QA service; forward migration only if necessary | Inspect/reuse `POST /api/qa/evidence` before designing an extension. Bind each observation to run ID, canonical workflow/step, exact pin, authenticated principal and server-verified synthetic tenant/fixture. Add idempotent append-only receipts. Preserve old-pin partial evidence after a deployment; it cannot become a new-pin pass.                                                                                         |
| 3. Ownership and scoped queue     | QA task/Office work services and controller; existing `POST /api/qa/tasks/:id/transition`, Office work transition and retest routes          | Atomic claim lease and idempotency; one owner per scoped workflow/run. Recheck actor, lease, exact pin and synthetic tenancy on protected actions. Manifest-derived affected plus claimed-fix scope only. Unknown scope requires resolution, never blanket clearance. Display recorded owner, blockers and lease state in the grid detail.                                                                                          |
| 4. Fix claims and triage          | `apps/api/app/services/qa/office_qa.rb` plus focused claim/evidence service; `QaOfficeQa.tsx` and shared projection                          | Claim includes exact revision, PR/commit, change, original repro, precise expected result and canonical workflow IDs. Accept/reject with exact-pin evidence; rejection preserves counterevidence. Defect filing reuses `POST /api/qa/office/qa/defects`; no fabricated Muse ledger verdicts.                                                                                                                                        |
| 5. Controlled synthetic execution | Existing QA baseline/fixture mechanisms, separate run service, QA UI and transport adapters                                                  | Read-only default. Server-authoritative fixture/tenant identity, never name-prefix authorization. Named non-destructive fixture preparation/account selection only within approved capabilities. No shared reset or permission-denial bypass through another role. Stage and review contracts before any live activation.                                                                                                           |

Implement source contracts in API priority order: **record_evidence → claim_workflow → file_defect → prepare_test_data / select_synthetic_account → request_retest**. UI and MCP transports must call the same authenticated services; reuse existing actor bindings with narrow action checks. A browser label, catalog owner name or request-supplied actor never grants authority. The bridge must establish which actions are already available; no broad QA token is proposed.

Impact mapping must connect actual routes/components/endpoints/migrations/config flags to canonical IDs with reasons and evidence. Broaden scope only for demonstrated shared chrome/auth/layout, data-layer/contracts, migrations, pipeline changes or systemic failure risk. Do not equate a shared filename with all 116 workflows being affected without supporting analysis.

On a mid-run deployment: halt actions, seal partial evidence under the old pin, mark the run interrupted, then require a newly pinned, scoped run. Keep claim lease expiry/recovery separate from completion. Triage in order: data → permissions → service health → test/harness → product defect. A manual non-reproduction is inconclusive; retain race/flakiness analysis and counterevidence.

First end-to-end validation slice: one explicitly synthetic workflow demonstrates release impact → atomic claim → synthetic run → exact-pin evidence/verdict → fix-claim verification or rejection. Include duplicate submission, competing claims, denied actor/tenant, deploy boundary, stale evidence and unknown mapping. This is separate from broad 116-workflow QA.

No new credentials, grants, expanded persistent access, reset, synthetic-data writes or live activation are authorized by this brief. Source-only API/data/UI work can be isolated next. Any necessary activation or authority expansion must go to Josh with the exact action and scope. Current application publication remains independent; the sole integrator owns any later QA-page integration/publication.

## Local acceptance evidence

Base: `0a5cf060884640c28d4e0aa865aa532b9fdd9062` on isolated branch `qa/change-impact-projection`. Frozen candidate `c32bdac77e266648deac4432bd463ba26e829730` is not present in this checkout and was not changed or fetched.

- Narrow synthetic Vitest suite: 13 passing cases (schema failure, duplicate scope/ID rejection, unknown defaults, exact-ID join, affected/claimed-fix selection, preserved historical data and shared rendered detail).
- TypeScript check and both production bundles (web + Office widget): passed. Existing marketing static/dynamic-import warning remains unrelated.
- Locked dependency install used `--frozen-lockfile --ignore-scripts`; package manifest and lockfile unchanged.
- No Rails tests or live browser/Office checks: Ruby is unavailable and Office transport is offline. No visual claim is based on the screenshot; it was not materialized or used for image-based implementation. The source-render test exercises the shared MUI display, not a live end-to-end journey.
- MUI MCP is unavailable; existing components, installed v9.4 types, and the official [Select documentation](https://mui.com/material-ui/react-select/) informed the standard TextField/MenuItem composition. No new dependency or custom interaction primitive.

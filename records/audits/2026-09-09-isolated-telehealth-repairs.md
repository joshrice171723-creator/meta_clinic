# Isolated telehealth repair batch — 2026-09-09

APPly only. Continuation authorized alongside the independent clinic-visit agent. Work started from `03c13d7` on `codex/isolated-performance-followup` in `C:\Users\joshr\Desktop\Worktrees\APPly-isolated-performance`. The other agent's checkout, source files, services and databases were not modified. No provider calls or external messages were sent.

## Five slices

1. `3d87954`: Queue visibility now checks the specific telehealth permission for each site. An unrelated permission at another site no longer includes that site's visits. Practice-wide and synthetic Omni visibility remain supported.
2. `bb7e162`: Visit detail no longer eagerly loads the room's entire provider-event history before querying its latest event. Site and staff-profile associations used by serialization are preloaded.
3. `bac175d`: Queue serialization builds its existing ten-field response directly, preserving shared action rules while skipping eligible-staff, Scribe, wrap-up options and other discarded detail work. Removed ignored historical check-in/consent preloads; added needed site/wrap-up preloads.
4. `324031a`: The patient response reuses its preparation result for actions and access state instead of evaluating the same preparation three times.
5. `9677b2e`: Media presence and disconnection history are scoped to the current room. Old-room joins/leaves no longer label a restarted visit connected or disconnected.

## Focused verification

- PostgreSQL container `apply-isolated-performance-postgres`, port `54419`, database `apply_isolated_performance_test`; credentials remain in ignored local storage. Optional web/API ports `3340`/`3341` are reserved but no web runtime was started for this batch.
- Five changed Ruby files passed scoped RuboCop. Scoped diff whitespace check passed.
- Exactly three new high-value regression examples: site permission separation/revocation/pagination/Omni access; queue/detail response parity with at least three fewer SELECT queries during queue serialization; old/current-room media state including the patient response.
- Initial focused run: 3 runs, 12 assertions, one passed and two fixture errors. The errors were a clinician booking overlap and two live room attempts. Both fixture setups were corrected once; only the two affected examples were rerun: 2 runs, 20 assertions, zero failures/errors/skips. No known focused failure remains. The passing parity example was not repeated.
- No broad backend/frontend suite, browser, live media-provider or production-readiness certification. The query assertion measures serialization SELECT count for its synthetic example, not end-to-end latency or constant-query scaling.

## Remaining evidence and scope

- Queue preparation, permission calculations and provider-event reads still perform per-visit work. This batch reduces avoidable work without claiming all fanout removed.
- A separate follow-up is warranted for stale participant-session leave events: ingestion can ignore them for workflow state while display projections still consider the stored events.
- The first batch's patient-ledger/encounter-note findings overlap the other agent's clinic journey and were left for coordinated follow-up. No claim that every application bug or UI issue is resolved.
- Integration uses fetch/merge inside this isolated checkout and a fast-forward push to `main`; it does not switch or merge the other agent's working tree. There is no remote `master` branch.

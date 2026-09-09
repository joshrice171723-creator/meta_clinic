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

## Second five-slice batch

1. `1f7dd90`: Staff/patient detail queries no longer preload unused, unbounded check-in/consent histories. Patient participants preload the staff memberships/profiles they display; preparation reuses preloaded participants.
2. `e11951d`: A single presence projection per response identifies active participant sessions. A delayed leave for an older session does not disconnect the current session, and one participant leaving does not mark the entire room disconnected while someone remains connected. This resolves the first batch's stale-session display finding.
3. `f923357`: Waiting-room entry cannot downgrade an admitted participant, resurrect a removed/revoked participant, or mutate an ending/terminal visit. Rejection happens before new consent records; patient actions reflect the same entry conditions.
4. `d9888e3`: Clinician route resolution is scoped synchronously to the requested visit or exact patient/encounter. Previous-patient controls are not rendered while the new route resolves.
5. `3d71c2a`: Device selectors retain confirmed choices until a serialized switch succeeds, show errors, and remain dismissible while hardware/browser permission is pending. Final integration also fences completion by a visit generation and clears old pending state on a visit change, including returning to a previously visited call.

Verification: five focused backend examples, 99 assertions, zero failures/errors/skips in 5.84 seconds on the isolated test database. These exercise room/session event history, queue response parity/query savings, preparation/admission/removal/ending transitions, and patient HTTP preparation recovery. Eight changed Ruby files passed scoped RuboCop. The frontend production build/typecheck passed; after the final device-generation correction only the affected frontend build was repeated and passed. No new frontend test was added because the existing mocked-hook harness does not meaningfully exercise those two component transitions. Browser and real-device behavior remain unverified. Dependencies were installed only in this checkout, with zero audit vulnerabilities.

Read-only follow-up found consequential host-command lifecycle gaps: room preparation lacks a terminal-visit guard, admission can revive a stale terminal visit, and ending an ending/cancelled/no-show visit can duplicate a command or overwrite its terminal state. Patient receipt matching also omits visit identity, allowing a reused key on another visit to reach the wrong result resolver. These remain queued for the next isolated batch; they are not covered by the completion claims above.

## Third five-slice batch

1. `0723f30`: Patient retry receipts must match the requested visit as well as operation and payload. Cross-visit reuse produces a conflict before result lookup or mutation; same-visit retries still replay correctly.
2. `00844ab`: Repeated pending room-extension requests reuse the existing provider command under the visit lock. Terminal visits cannot request an extension.
3. `0b41085`: Room preparation, admission and ending reject incompatible visit states before side effects. Terminal/ending responses suppress incompatible host actions. The focused check also exposed a real StartEncounter failure: canonical encounter creation already binds the video visit, making its second write stale. `ad7bbe4` reloads that canonical binding and only repairs a missing link.
4. `bdfef75`: Consent withdrawal remains owned by the patient workspace after the call child unmounts, stops local media first, and retains a visible same-request retry on failure. Rapid patient mutation/join requests are fenced. `1bc36b9` scopes the workspace to the exact visit, suppresses late effects after unmount, and refreshes after an explicit stale-record rejection so a new attempt can succeed.
5. `a57ad14`: Settings operations use a synchronous pending guard and stable request keys for identical retries; double confirmation cannot race publish/disable requests with different keys.

Verification: the first focused backend run had 4 examples, 50 assertions, three passing and one real StartEncounter stale-write error. After one code repair, only the affected lifecycle example was rerun: 1 example, 28 assertions, zero failures/errors/skips. Eight changed Ruby files passed scoped RuboCop. The final frontend production build/typecheck passed once after both UI slices and their context correction were frozen. Changed frontend files passed scoped Prettier. No browser or actual media-provider/device test was run, and no low-value UI harness test was added.

The prior host-command and receipt findings are resolved by this batch. The next pass is examining live-session admission loss and server-side treatment-consent withdrawal: existing grant issuance checks preparation, but an already-connected client currently treats only removed/left participants as revoked, while material preparation changes can move them to waiting. Generic treatment-consent recording also needs review against existing grant/capture invalidation and durable ejection patterns. These remain open; this record is not a claim that all APPly issues are resolved.

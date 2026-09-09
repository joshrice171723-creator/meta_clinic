# APPly independent bug, UI and performance pass

Date: 2026-09-09. Repository: `Fibrodysplasia/APPly`, branch `main`.
Baseline: `175a97e`. Independent source and browser review preceded consultation of existing audits.
The user requested a stop and commit/push after the first ten implementation slices and their audit. This record does not claim that all APPly defects have been found or fixed.

## Delivered slices

| Commit | Result |
| --- | --- |
| `187e723` | Corrected MUI/CSS toolbar layout and redundant tablet padding. |
| `f110a95` | Associated workforce select labels with their controls across four pages. |
| `221c626` | Removed conflicting native/MUI tracking-status tooltips. |
| `0e2f1be` | Reminder date ranges now resolve inclusive calendar days in the clinic timezone, including DST. Invalid ranges fail instead of widening the search. |
| `c145ad8` | Removed duplicate authenticated session heartbeat/focus polling. |
| `a657e24` | Reset Scribe chart/lab selection between sessions, represented existing visit bindings outside the recent list, and aligned the session rail with the selected session. |
| `d9205ed` | Removed client-injected appointment rows and totals from paginated schedule results. |
| `0a7a173` | Made message read receipts, cursor and audit transactional; moved conversation visibility/filtering and summary projection into bounded SQL queries. |
| `a7ccb96` | Batched inventory lot-history queries while preserving per-lot limits and order. |
| `dbbdc75` | Deferred the video SDK until a join grant and coordinated visible-page/provider authorization polling; avoided unchanged context updates. |

The ten-slice audit additionally preserved the existing Omni visibility override and closed the delayed video-adapter/unmount race. Recovery regressions assert disposal of the old adapter and use of a fresh adapter. No new features, hosted deployment, external messages, or production data were used.

## Verification

- Baseline frontend: 286 tests passed; production build passed.
- Integrated frontend run: 291 tests, 288 passed and three video-recovery assertions failed. These expected reuse of a disposed adapter. Updated those behavioral assertions and reran only the affected suite: 3/3 passed. The full suite was not repeated.
- Focused telehealth session/provider suites: 18 tests passed, including delayed loading after leave/unmount, polling ownership, hidden-page fallback, stale authorization disconnect and unchanged snapshot identity.
- Schedule pagination regression: 1 test passed.
- Isolated Rails run: 17 tests, 198 assertions, zero failures/errors/skips. Used only `apply_bugfix_20260909_test`. Covered messaging visibility/filter parity, Omni scope, audit rollback, query growth, inventory detail caps and DST date boundaries/tenant isolation.
- Production build passed. The always-mounted telehealth provider chunk fell from 392.44 kB to 49.03 kB; the deferred adapter is a separate 344.76 kB chunk. These are build sizes, not a measured end-user latency claim.
- `bin/verify-web` passed: frontend proxy, Rails session/CSRF/origin, role isolation, account settings/conflict, clinic access, exact-decimal receipt/retry, portal and logout. Its scratch database and child processes were cleaned by the helper.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Scoped Ruby lint passed after removing an empty private section. The repository-wide frontend formatter reported 131 files; unrelated formatting was not rewritten. Changed frontend files were formatted.
- Browser: authenticated clinic modules loaded; tablet toolbar height reduced from about 284 to 186 CSS pixels; tablet/390px phone containment checked; workforce Access role accessible name verified; Scribe Past selection, manual Today selection, session switching and missing-recent-visit option checked. Existing session timeout/continue-working flow remained operable.
- The Impeccable detector returned no findings for changed UI targets. Its stale comp-build notice was not applicable to these repairs of existing screens. MUI MCP was unavailable; installed components and official Select/Tooltip documentation were used.

Local command artifacts are under ignored `tmp/bug-pass-*`; backend test output was reported by the bounded verification agent. Existing audit checkpoints were treated as dated evidence and rechecked against current source.

## Remaining findings at the requested stop

- Patient ledger/context loads still return unbounded financial history. Fixing this requires coordinated pagination and balance-total contracts across clinic and patient portal consumers.
- Encounter-note lists remain unbounded and their serializers can query per note.
- Telehealth queue summaries still perform avoidable full-detail/per-row work.
- The hidden tracking board remains mounted and can render during unrelated home-panel updates; its inactive fetching is already stopped.
- Repository-wide formatting is not green. Full backend, provider/media, concurrency-load, accessibility and release acceptance were not claimed by this focused pass.

Further discovery and implementation stopped at the user's request. These findings were documented rather than silently treated as resolved.

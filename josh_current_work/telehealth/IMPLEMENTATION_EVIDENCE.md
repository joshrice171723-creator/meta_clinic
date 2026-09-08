# Telehealth implementation evidence — sc-504

## 2026-09-08 Twilio migration and provider checks

**User-requested stopping point:** implementation checkpoint, pending verification. The founder requested commit and push before further checks. All source writers stopped. This is not live-video, transcription, security or release acceptance.

- Implemented connection recovery, clinician wrap-up and patient completion; Twilio server/browser adapters replace Daily for new calls. Server SDK resolves to `twilio-ruby 7.11.1`; browser SDK resolves to `twilio-video 2.35.0`.
- Before the Twilio switch, 26 selected web behaviors passed across the initial run and affected rerun. That evidence is historical and does not verify the new adapter. The earlier production build also passed before the provider switch.
- Both new development migrations and isolated test database preparation passed. The Twilio migration preserves provider history and adds Room SID persistence, provider constraints and the new-settings default. The token-digest index is nonunique because the provider SDK can issue equal tokens for the same participant and second; the existing request-digest uniqueness still fences application mutation replay.
- The new production build failed on data-track cleanup typing and two test-file issues. Those source/test issues were repaired, but the build was not rerun before the stopping request.
- The combined Rails run exposed two repaired issues in its test doubles/fixture key. Subsequent affected verification was interrupted after prolonged silence; Rails and wrap-up results remain inconclusive. Zeitwerk, backend/PostgreSQL verifiers, RuboCop and dependency audits were not completed for this candidate.
- Brakeman returned exit 3 with zero analysis errors and the unchanged six warnings (five SQL injection, one HTTP verb confusion) in existing non-telehealth files. No new Twilio/Scribe warning was reported. This does not establish security acceptance.
- Vault validation, vault audit and agent-harness checks passed. The cross-app verifier was stopped without a result. Updated Twilio web tests and Scribe tests did not execute before the stopping request because dependency reconciliation was incomplete.
- The isolated app services were stopped through the lifecycle ownership checks; PostgreSQL remains running and preserved. A partially installed web dependency tree was moved to ignored `tmp/telehealth-node-modules-interrupted` for recovery, followed by one clean install. Runtime restart and browser checks remain pending; do not assume the preview is running.

Resume with dependency installation status, then rerun the repaired production build and focused web/Rails/Scribe tests before restarting only the isolated preview. Confirm the generated scratch database from the interrupted cross-app verifier before any cleanup; never drop databases by prefix or touch the audit database.

The founder selected Twilio Video to reuse the existing Twilio account, superseding the assistant-selected Daily transport. Source remains in the isolated `APPly-telehealth` checkout. No Daily account was created, and the existing messaging sandbox was not changed.

An authorized OpenRouter adapter check used independently generated fictional speech encoded as WebM/Opus, matching the browser recording format. The existing configured model/key returned HTTP 402 (`provider_payment_required`); no transcript or generated note was produced. No human audio or patient data was sent. This is a provider blocker, not successful transcription evidence.

Chrome browser discovery/navigation and Windows Computer Use discovery both timed out, including after the user closed Chrome. The Twilio dashboard, live Video credentials, public callback delivery and two-party media could not be verified through those attempts.

## Initial implementation baseline

Local implementation in `C:/Users/joshr/Desktop/Work/APPly-telehealth`, branch `codex/sc-504/telehealth-scribe`, from committed base `88af72e0567056707cc71a8ad37b752054d343e4`. This is an independent clone. The original APPly checkout, its dirty work, registered worktrees, Stage 1 audit, databases and evidence were not implementation targets. At this initial baseline, no merge, push, deployment, real patient message, live provider call or clinical acceptance had occurred. Later checks are recorded above.

## Delivered source

- Twelve telehealth tables, appointment/request modality and Scribe provenance/ownership fields; composite tenant relations, immutable evidence, constrained states and seven explicit permissions.
- Existing scheduling and appointment requests feed a policy-bound video visit. Reschedule/cancel/no-show invalidate access; encounter creation binds the exact existing appointment and patient.
- Patient preparation, device results, separate treatment and Scribe consent, waiting room, staff verification, admission, eligible care-team participation and role/site-scoped projections.
- Daily room/token adapter, durable provider commands, signed webhook receipt, reconnection, participant removal, room ending and reconciliation with unknown outcomes retained.
- Clinic queue and settings, patient call workspace, persistent clinician video dock, device/video/screen-share controls and explicit leave/end/rejoin.
- In-call Scribe combines cloned authorized local and remote audio. Capture ownership uses a token, epoch and lease. Consent changes fence writers. Segments retain ordered provenance through generation, review, approval and export to the exact encounter.
- Session/account/practice/patient changes terminate capture before media. The dock continues bounded server authorization polling after navigation.
- Production static delivery enables media only on clinic/patient-portal documents, with explicit Daily CSP sources and no provider keys in browser configuration.

## Isolated verification environment

PostgreSQL container/volume `apply-telehealth-sc504`, port `55441`; development database `apply_telehealth_sc504_development`, test database `apply_telehealth_sc504_test`. API `3105`, web `3104`. All records are test fixtures created locally. The original ports were not stopped or reused. Runtime helpers were verified against their own process ownership.

The existing npm development script overrode `APPLY_WEB_PORT` with port 3000. Its failed bind did not displace the existing listener. The script now delegates port selection to the existing validated Vite configuration; the subsequent isolated startup passed readiness and process-ownership checks.

## Checks and limits

| Check | Observed result |
| --- | --- |
| Development/test database preparation | New migration applied successfully |
| `bin/verify-postgres` | Passed legacy upgrade, fresh migrations, concurrency and backup/restore on generated scratch databases |
| `bin/verify-backend` | Passed existing backend race, tenant, authorization and immutable-history checks; removed only its generated scratch database |
| Rails Zeitwerk | Passed again after the collected backend repairs |
| RuboCop | 809 files, no offenses after the collected backend repairs |
| npm dependency audit | Zero vulnerabilities |
| Bundler audit with updated advisory database | No vulnerabilities; advisory revision `e7179ad21701894b75796c5ddd72e5fbfc446165` |
| Brakeman | Final backend scan: zero analysis errors; six warnings in unchanged inventory, billing and workforce source; no telehealth warning. This is not a clean global security gate |
| Frontend tests | Initial 234/235 passed; the failing formatting-sensitive test was replaced with route behavior assertions, affected file 6/6 passed |
| Frontend production build | Passed after TypeScript integration and initial-settings-state repairs |
| Formatting | Global check found pre-existing issues; changed telehealth and shared implementation files were formatted. No unrelated file cleanup |
| Nginx | Pinned image syntax check passed as UID101 with read-only config/build mounts; HTTP200 plus intended CSP/Permissions-Policy verified for clinic and patient-portal routes, media denied on login; temporary proof container stopped |
| Rails suite | Broad run stopped after collecting failures (at least398 progress markers); no full-suite pass claimed. Targeted affected checks follow the repair pass |
| Telehealth workflow regression | 15 runs, 204 assertions, zero failures/errors/skips after repairs |
| Shared Scribe and patient booking regressions | 32 cases passed, 407 assertions; scoped template fixtures allow the existing recorder, processor and chart-workspace checks to run |
| In-call Scribe regression | 4 runs, 66 assertions, zero failures/errors/skips after supplying the scoped template fixture; includes ownership takeover, consent/permission revocation and exact encounter export |
| Scribe plus background worker final affected run | 6 runs, 88 assertions, zero failures/errors/skips; seed45768 |
| Root web verifier | Failed at named/default local-account contract. Same failure reproduced from exported committed base; both verifiers cleaned only their generated scratch databases/processes |
| Browser | Separate in-app browser on3104: authenticated clinic navigation, waiting-list empty state, settings draft save/reload and missing-provider feedback verified. Tablet834px had no horizontal overflow. Video booking retains its selected modality and reports unavailable provider configuration. No two-party media or narrow patient-preparation proof claimed |

## Collected repairs

Initial verification found and repaired MUI9/TypeScript compatibility, an icon import, a Rails enum method collision, UUID assignment before model validation, stale provider-event room/session projection and Scribe source-set provenance. HTTP preparation fields are explicitly filtered from request logs.

Further repaired findings: policy `version` collision with PaperTrail, backward-compatible nullable appointment-request modality, editable policy content after publication, strict provider presence parsing, stale provider command/reconciliation fencing, preservation of ended rooms on late snapshots, and Ruby 3 keyword argument handling in one-use join-request digests. The focused telehealth regression passed after these repairs.

The background-worker test used a fixed September 7 processing time but created its grants and outboxes at the real September 8 time. The test fixture now pins creation to its declared processing time, preserving production authorization and scheduling behavior. Both worker cases passed in the final affected run.

The generated `structure.sql` includes the migration and PostgreSQL's reordering/deparsing of existing schema objects. It was produced from the migrated isolated database, not manually rewritten to remove existing constraints. Fresh-migration and restore checks passed.

Committed-base comparison ran only the existing pharmacy workspace and recording capture test files in `apply_telehealth_sc504_baseline_test`:15 runs,56 assertions,3 failures,7 errors. Pharmacy receipt tests omit required `input_unit`, causing two400 failures and two nil-batch cascades; manual product NDC assertion also fails. All five recording-capture cases lack an active template fixture. The latter test prerequisite is repaired only in this clone to obtain meaningful shared-Scribe regression evidence. Inventory behavior is left to its existing scope.

Other observed broad-suite failures in architecture allowlists, development login/fixtures, workforce and follow-up remain recorded in the isolated test log; they are not all independently baseline-classified. Do not infer that unclassified failures are pre-existing or that the global regression gate is accepted.

## External dependencies and release status

Daily and Scribe runtime credentials are unavailable in this clone. Automated provider responses are stubs using fake credentials; they do not prove live two-party video/audio, Daily ejection/expiry, webhook delivery, remote audio transcription or account eligibility. No provider account or contract was created. Existing clinic/patient release gates remain authoritative.

Individual Daily ejection uses the authorized host SDK after a server-side removal decision. There is no invented REST ejection endpoint; absent-host/unknown provider outcomes remain visible and require live acceptance evidence. Room ending waits for signed meeting end or authenticated empty presence; API acceptance alone is not media termination.

The initial Shortcut claim succeeded. A subsequent progress update failed with OAuth `invalid_grant`; authentication was not repeatedly changed during the separate audit. The tracker must not be marked Done based on source or simulated-provider tests.

## Final results

All implementation writers froze again after the collected repairs. Focused telehealth, shared Scribe, appointment-request and background-worker checks passed across the affected runs. Frontend build, repaired frontend tests, schema helpers, dependency checks and the documented browser/Nginx checks also passed as described above. No broad-suite rerun or live-provider acceptance is implied.

The separate clone is the reviewable handoff. Preview: `http://127.0.0.1:3104/clinic/telehealth`; settings: `http://127.0.0.1:3104/clinic/settings/telehealth`. Local fixture authentication is required. No source, database, runtime, branch or evidence was merged into the original checkout or independent audit. See [local operation](LOCAL_OPERATION.md) for configuration and live-proof steps.

## Follow-up completion and polish — 2026-09-08

The user reopened this scope after commit `13fe272`. The Stage 1 audit remains active and this work stays in the same independent clone and runtime. The existing sc-504 claim remains the coordination reference; Shortcut tools are unavailable in this resumed session. Prior passing checks are retained as historical evidence, not relabeled as proof of the new revision.

This pass addresses concrete patient API/UI gaps, refresh and sign-in recovery, preservation of preparation edits, device-preview cleanup, clinician call controls and the integrated Scribe workflow. Patient appointment projections now include the identity required to join; policy requirements and resumable preparation stages come from Rails. Material preparation changes advance the visit version and revoke previous admission, grants and recording ownership. The login form remains available alongside a separate development utility section and preserves the requested destination.

MUI documentation tooling is unavailable in this session. Existing components and installed types, the canonical clinic design record, and the [official Accordion documentation](https://mui.com/material-ui/react-accordion/) guide the bounded UI refinement. No component library or dependency was added.

The follow-up source includes visible Scribe permission, capture and review stages; explicit consent withdrawal; context conflict recovery; capture-owner and audio availability states; consecutive segment provenance; deduplicated audio sources; and exact-encounter review/export. Call controls preserve the session through clinic navigation and expose errors before removing participants locally. Patient preparation follows configured requirements, preserves typed edits during refreshes, and stops late-arriving preview streams after cleanup. Polling pauses while hidden, retries failures and rejects stale or unauthorized projections.

Verification after the implementation freeze:

- Web lifecycle regressions: 9/9 passed cleanly after fixing an unhandled polling rejection. Existing session-provider cases: 4/4 passed.
- Scribe web regression: 6 files, 23 tests passed. A subsequent TypeScript-only fixture repair passed its affected rollover test again.
- Patient HTTP subset: 3 runs, 60 assertions passed, including optional preparation requirements, actual waiting-room entry and clinician-name projection. These tests repaired an incorrect service return value and nil optional-location normalization.
- Final production TypeScript/Vite build passed after all source repairs, including the clinician-label projection. Changed web files were formatted and `git diff --check` passed. Build log: `tmp/telehealth-polish-build-final.log`.
- Impeccable static scan found no issues in the changed interface files. Ruby style checks passed on the initial three changed backend files. Brakeman completed sequentially on Windows with zero analysis errors and the same six warnings as the prior scan; this is not a zero-warning security acceptance.
- The shared web HTTP verifier failed during development fixtures and cleaned its generated scratch database/processes. Its global gate remains unaccepted; the prior named-account failure is historical evidence, not a classification of this new failure.
- The consolidated full web suite and combined telehealth Rails run became inconclusive under confirmed host saturation: even trivial shell probes stalled, and the runners produced no useful buffered test results. Only their owned sessions were stopped; no audit processes were terminated. No further broad retry or backend HTTP verifier was launched. The 36 focused web passes and 3-run/60-assertion HTTP subset remain the current verified results; prior broad checks are historical.

Browser evidence: email/password remains visible, development sign-in preserves the exact telehealth destination, the waiting-room queue renders and refreshes persisted appointment data, unavailable booking explains configuration, and settings remains directly reachable. A fictional local appointment was provisioned in the isolated development database with the video provider disabled. Its clinician-name fallback exposed and prompted the shared projection repair. The clinician route then failed to fetch its dynamic module in the in-app browser even though the local server returned HTTP 200 JavaScript and the production build passed. Browser control subsequently timed out on three bounded recovery attempts; no successful clinician/patient/Scribe browser walkthrough or narrow-layout acceptance is claimed for this follow-up.

Live-provider configuration remains pending. No live Daily call, remote audio transcription, webhook, ejection or room-ending acceptance is claimed. No provider account was created, no real media was captured, and no source was merged or pushed into the audit lane.

The follow-up implementation is committed locally as `c96b5f7`. The isolated clone was clean after the source commit; this evidence update records the final completed build. The preview remains on port 3104. A later optional fixture-label cleanup runner was stopped during host saturation and is not counted as a completed data change.

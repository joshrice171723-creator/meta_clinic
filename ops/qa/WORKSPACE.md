# QA workspace protocol

`/qa` provides public read access, build-pin confirmation, retest requests for this synthetic QA desk. Historical coverage import requires an active platform-owner session or QA-only bearer service token. Browser writes retain session and CSRF protection. Agent state, evidence, claims and verdicts require an owner session or QA-only bearer service token, checked against a database SHA-256 digest and an active platform owner. This token grants no clinical API access.

The Workflow coverage tab accepts an expanded `COVERAGE_STATE.json` export up to 1 MB. Its `coverage` or `workflows` must be a map or array of unique `WF-001`–`WF-116` records. The import retains supplied results, timestamps, versions, full revisions and evidence references as historical records, plus the source digest and import receipt. It changes only the coverage ledger and pointer; importing never arms a batch or changes the live pin. Missing records remain unassessed.

GitHub reads require an operator-managed `QA_GITHUB_TOKEN` with access to this private repository. An unavailable or invalid token leaves a visibly unavailable/stale mirror; the safe upstream HTTP status appears in the desk. A GitHub 404 can indicate missing private-repository access. Provisioning credentials and confirming a deployed refresh are separate from source changes.

For an authorized host carrier, generate a `qa_` prefix plus 32 random bytes encoded as unpadded URL-safe base64 using secure operator tooling and retain the raw token in approved secret storage. Never put it in chat, source, notes or logs. Register only its SHA-256 digest with `QA_OWNER_EMAIL`, `QA_RECIPIENT=muse`, and `QA_TOKEN_SHA256`, then run `bundle exec rake qa:provision_token`. The operator must securely supply `QA_SERVICE_TOKEN` to that host process. Muse's current Vault does not generate secrets or inject environment variables into its cron jobs; browser QA continues through the existing GitHub handoff without this bridge. Revoke through the token record's `revoked_at`.

The existing owner/service-authenticated state sync accepts `scheduler` with `source`, `status` (`active`, `paused`, `unavailable`), timezone-qualified `observed_at`, optional `next_run_at`, optional `schedule_id`, and optional `interval_minutes`. `bridge.py sync` imports an actual `QA_SCHEDULER_STATE.json` receipt with those fields. Mission control labels its source and observation time; receipts older than two intervals (at least 15 minutes) are stale. This mirrors scheduler observations and does not create a schedule, claim a task, or prove browser execution. Keep the separately paused local review monitor paused until explicitly resumed.

## Carrier loop

1. Read cache-busted `/build.json` and `/qa/status.json`; compare the full live revision with the confirmed QA pin. Explicitly re-pin after deployment. Versions are display labels; revisions identify builds.
2. Read `/api/qa/tasks`, choose at most one queued task, then `claim <id> --run-id <unique-run-id>`. The server atomically changes queued → claimed and returns 409 for competing claims or a second task in the same run. Pickup appears as run id, claim time, and an append-only `run_started` event.
3. Prepare the dedicated QA baseline before claiming if needed. The baseline creates a new isolated synthetic clinic, preserving public demo state and old QA evidence. Use the returned practice id in clinic selection. The service token cannot authenticate clinical browser actions; use the QA browser identity separately.
4. Execute the browser workflow. Persist PNG/JPEG evidence with `evidence --issue <GitHub-number> --file <image> --phase before|after|observation --caption <positive-readback> --context <json>`. Context requires `steps`, `expected`, `actual`, `viewport`, `timezone`, and ISO8601 `observed_at` with a timezone. Server attaches tester identity and validates image bytes. Fix passes require before evidence (retaining its original build SHA) and after evidence on the current revision. Never relabel an old screenshot as the new build.
5. Fetch the build again before posting a verdict. `complete` and `fail` require `--run-id` and `--result <json>`. Result is `{ "summary": "observed facts", "defects": [{ "id": 123, "verdict": "passed|failed|blocked|expected-config", "observed": "positive readback", "evidence_refs": [1,2] }] }`. Every completed item must pass. Failed/mixed runs use `fail`. Server rejects missing screenshots, changed revisions, and other runs' claims. On revision change, `abort` releases the claim, leaves an event, and requires a new pin/run id.
6. Use `event` for progress and `sync` for the complete QA export. The page shows human review controls after a real agent verdict; human approval cannot be submitted with a service token.

```powershell
python ops/qa/bridge.py status
python ops/qa/bridge.py inbox
python ops/qa/bridge.py pin --reason "New deployed revision observed twice"
python ops/qa/bridge.py baseline
python ops/qa/bridge.py claim 12 --run-id muse-2026-09-29-001
python ops/qa/bridge.py event --kind agent_heartbeat --summary "carrier awake"
python ops/qa/bridge.py context --output work/qa_context.md
```

All `/qa/status.json`, `/qa/issues.json`, `/qa/retest.json`, and `/qa/batches.json` endpoints are private. GitHub is the defect source of truth, refreshed on demand with a one-minute cache. Imported Muse running-list/retest data is historical and retains its original revision. Collapsed or missing exports stay unassessed.

### Atlas and distinct inventories

`/qa?view=atlas` displays all 81 named Atlas work rows, separately from defect evidence. `/api/qa/atlas.json` is private under the same owner/service-token gate. The Markdown implementation tracker remains the percentage authority; the Atlas's existing parsers supply the linked plan rows. These are overlapping work requirements, not 81 unique bugs.

The sources below are separate and must not be summed as a unique-defect count:

- The recovered `Meta-Clinic-QA-Handoff-2026-09-28.pdf` records a 100-workflow sweep on build `0.1.8` at revision `25a23e4bd47d5200a3f9ef51a9925aeca064f49c`: 188 defect entries (including 7 marked stricken in that audit), 6 pending verification, 28 marked fixed/verified, and 54 improvement ideas explicitly identified as not bugs. This is historical evidence, not a current-build verdict or a complete import into the current ledger.
- `apps/api/config/qa_state.json` contains 272 imported historical records: 229 open, 37 passed, and 6 awaiting retest. Most lack a preserved numeric Muse ID; they are not a verified unique count or current-build result.
- The separate Muse retest export contains 70 historical findings. Their build/revision and evidence remain attached to that run; do not represent them as a new retest of the current build.
- GitHub currently contains 9 open `muse-qa` issues (checked 2026-09-29). This is the actionable issue queue, not the total historical inventory.

Identifier-level reconciliation among the PDF, imported records, retest export, Atlas requirements, and GitHub issues remains open. Do not invent missing IDs, mark historical items passed, or claim current-build retest coverage from these totals.

After changing an Atlas input, run `node ops/qa/export_atlas.mjs` from the repository root and refresh `apps/api/config/qa_atlas.json` with its output. This is a derived deployment artifact. Local source digest differences display an outdated-inventory warning; packaged deployments explicitly label their snapshot. To check the parser, private access and dirty-build gate, run `bundle exec rails runner ../../ops/qa/check_workspace.rb` from `apps/api` with the isolated development database environment. Probe records roll back.

Uncommitted source is not an exact revision: pinning, task creation/claim/verdict, baseline preparation and human approval are paused while `build.json` reports `dirty`. A claimed run returns to the queue if the build becomes dirty, just as it does on a SHA change. `status.json` uses `current_build_completed_tasks`, not a defect-pass count; individual verdicts remain in each task's result.

Report-defect submissions are pending-triage tasks. Ask-Codex creates an inbox task; when `QA_GITHUB_TOKEN` is configured, it also posts a `qa-question` comment and label and retains the comment receipt. A queued task does not prove the portal carrier dispatched or executed it.

Events and evidence are append-only in PostgreSQL. The timeline and endpoint payload are shared receipts. External phone/chat pings require a configured notification carrier. No external notification or portal scheduler is fabricated by the application.

The baseline preserves previous isolated clinics instead of deleting them. Archive old QA clinics through a separately scoped cleanup workflow when storage warrants it.

Notification delivery uses a persisted outbox derived from urgent append-only events (`retest_failed`, `deploy_finished`, `defect_found`, `task_blocked`, `run_aborted`) and database delivery receipts. `bridge.py notify` sends at most ten pending events through configured HTTPS `QA_NTFY_URL`/optional Vault-injected `QA_NTFY_TOKEN`, or Vault-injected `QA_TELEGRAM_BOT_TOKEN` and `QA_TELEGRAM_CHAT_ID`. It acknowledges only confirmed HTTP deliveries through `/api/qa/notifications/:id/receipt`. Unconfigured or failed delivery remains pending. Carrier execution and phone destinations are deployment configuration; no outbound delivery is performed while building this page.

For retests, `claim ... --prepare-baseline` creates the isolated QA baseline before atomically claiming one task. The server includes `qa_baseline` practice id and route in the claimed task payload. It refuses baseline preparation while another task is claimed.

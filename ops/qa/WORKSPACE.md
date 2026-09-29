# QA workspace protocol

`/qa` is a private operations workspace. Owner browser sessions retain session and CSRF protection. Agents use a QA-only bearer service token, checked against a database SHA-256 digest and an active platform owner. This token grants no clinical API access.

Generate a `qa_` prefix plus 32 random bytes encoded as unpadded URL-safe base64 in Secure Vault. Keep the raw token there: never put it in chat, files, source, or logs. Register only its SHA-256 digest with `QA_OWNER_EMAIL`, `QA_RECIPIENT=muse`, and `QA_TOKEN_SHA256`, then run `bundle exec rake qa:provision_token`. Secure Vault injects `QA_SERVICE_TOKEN` into the scheduled carrier process. Revoke through the token record's `revoked_at`.

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

Report-defect submissions are pending-triage tasks. Ask-Codex creates an inbox task; when `QA_GITHUB_TOKEN` is configured, it also posts a `qa-question` comment and label and retains the comment receipt. A queued task does not prove the portal carrier dispatched or executed it.

Events and evidence are append-only in PostgreSQL. The timeline and endpoint payload are shared receipts. External phone/chat pings require a configured notification carrier. No external notification or portal scheduler is fabricated by the application.

The baseline preserves previous isolated clinics instead of deleting them. Archive old QA clinics through a separately scoped cleanup workflow when storage warrants it.

Notification delivery uses a persisted outbox derived from urgent append-only events (`retest_failed`, `deploy_finished`, `defect_found`, `task_blocked`, `run_aborted`) and database delivery receipts. `bridge.py notify` sends at most ten pending events through configured HTTPS `QA_NTFY_URL`/optional Vault-injected `QA_NTFY_TOKEN`, or Vault-injected `QA_TELEGRAM_BOT_TOKEN` and `QA_TELEGRAM_CHAT_ID`. It acknowledges only confirmed HTTP deliveries through `/api/qa/notifications/:id/receipt`. Unconfigured or failed delivery remains pending. Carrier execution and phone destinations are deployment configuration; no outbound delivery is performed while building this page.

For retests, `claim ... --prepare-baseline` creates the isolated QA baseline before atomically claiming one task. The server includes `qa_baseline` practice id and route in the claimed task payload. It refuses baseline preparation while another task is claimed.

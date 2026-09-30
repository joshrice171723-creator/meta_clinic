# QA agent context

Generate a current handoff before an agent works:

```powershell
python ops/qa/bridge.py context --output work/qa_context.md
```

The generated file records the live application QA payload and the revision from `/build.json`. It is generated context, not fixture data and not proof that any task passed.

Use the mailbox in this order:

```powershell
python ops/qa/bridge.py inbox
python ops/qa/bridge.py claim TASK-ID --run-id UNIQUE-RUN-ID --prepare-baseline
# perform the explicitly assigned work; do not open a browser or portal implicitly
python ops/qa/bridge.py complete TASK-ID --run-id UNIQUE-RUN-ID --result work/result.json
```

`claim` captures `/build.json` before and after the transition. `complete` and `fail` pin their transition to the live build revision. A queued task is not a dispatch receipt, and a claim is not an authorization to auto-complete it. Result files must describe observed work and remaining gaps.

For a cron carrier, first record a heartbeat, then read the inbox:

```powershell
python ops/qa/bridge.py event --kind agent_heartbeat --summary "carrier awake"
python ops/qa/bridge.py inbox
```

The server derives the actor from the Vault-injected QA service token. It grants no clinical browser session and cannot submit human approval. Events deduplicate on their stable event key; do not use dedupe as evidence that an external agent received work. Notification delivery requires a separately configured carrier and confirmed delivery receipts.

Attach browser evidence only after it exists:

```powershell
python ops/qa/bridge.py evidence --issue 123 --file work/observed.jpg --phase after --caption "Observed persisted result" --context work/browser-context.json
```

PNG and JPEG only, maximum 4 MB. Import external QA snapshots without manufacturing counts or IDs:

```powershell
python ops/qa/bridge.py sync --state-dir C:\path\to\qa-state
```

The importer redacts credentials, records source hashes, normalizes supplied issue/retest/coverage/batch exports, and preserves existing state when an export is absent. GitHub snapshots are handled by the backend; `--github-file` is intentionally not needed. The committed initial import is historical: the tally has no verdict for #5, #9 and #28, and expanded coverage and active fix-batch exports were not supplied. A queue is not dispatch, a claim is not a pass, and an agent verdict is not human approval. Compare the full live SHA with the confirmed pin before work; see WORKSPACE.md for the contract.

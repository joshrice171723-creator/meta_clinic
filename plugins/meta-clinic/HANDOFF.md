# STOP checkpoint — October 4, 2026

> **Resumed by explicit owner instruction on October 4, 2026.** The owner
> canceled the subsequent embedded-assistant request and restored work on the
> ChatGPT-hosted plugin. No Phase 2 application code was written. The original
> stop snapshot below remains historical evidence; its external archive is
> untouched. Current implementation resumes audit/metering, reminder-due Events
> and the researched intake/handoff slice. Main was pulled again: up to date.

**Owner explicitly stopped implementation and requested this handoff. Do not
resume, discard, reset, clean, rewrite or replace the work without a new request.**
All three active implementation workers were interrupted and returned final
read-only status. No source repairs or additional checks were performed after
STOP. This file and the preservation snapshot are handoff artifacts only.

## Exact Git and source state

- Worktree: `C:\Users\joshr\.codex\worktrees\meta-clinic-codex\meta_clinic`
- Branch: `codex/meta-clinic-codex`
- HEAD: `292a16f0632e28ce2b2e068ee87e1eecabc8264f` (committed 0.2.0 checkpoint)
- Tracking: `origin/codex/meta-clinic-codex`; recorded comparison is 0 ahead / 0 behind.
- Last `git pull --no-rebase origin main`: already up to date, before these edits.
- Recorded `origin/main`: `74c5b15abbecd7ff9b44340fce251039492a2668`.
- No `origin/master` was found during the preceding implementation.
- Before adding this handoff: 21 modified tracked files and 29 untracked files.
  Nothing staged. The 0.3.0 work is **uncommitted and unpushed**, not in HEAD.
- The primary checkout at `C:\Users\joshr\Desktop\meta_clinic` contains unrelated
  work and was not edited, reset or merged by this task.
- A local preservation archive, binary Git diff, exact status and SHA-256 file
  inventory are recorded beside this checkpoint's external snapshot. They contain
  only the changed plugin source/assets and three backend event paths, not private
  runtime state or credentials. See the final handoff message for the path.

## Authoritative handoff index

| Need | Artifact |
| --- | --- |
| All 116 canonical criteria and workflow-to-tool mapping | [WORKFLOW-116.md](WORKFLOW-116.md) and [workflow-116.json](workflow-116.json) |
| Exact live tool schemas, methods, paths, required fields | [server/catalog.mjs](server/catalog.mjs), [server/care-operations.mjs](server/care-operations.mjs) |
| Domain-level gaps | [WORKFLOW-COVERAGE.md](WORKFLOW-COVERAGE.md), [CAPABILITIES.md](CAPABILITIES.md) |
| Primary host, identity/data-path decisions | [PLATFORM.md](PLATFORM.md), [CONNECTIONS.md](CONNECTIONS.md) |
| Selected executed checks, limits, screenshots | [VERIFICATION.md](VERIFICATION.md), [tutorial/tutorial.html](tutorial/tutorial.html) |
| Prior delivery chronology | [DELIVERY.md](DELIVERY.md); some active-phase text predates STOP |
| Demo and care contracts | [DEMO.md](DEMO.md), [CARE-WORKFLOWS.md](CARE-WORKFLOWS.md) |
| Events and distribution | [EVENTS.md](EVENTS.md), [SUBMISSION.md](SUBMISSION.md) |

The owner's appended report claims 95 PASS, 8 FAIL, 13 BLOCKED. The import
preserves those as website observations, not current integration acceptance.
**19 workflow IDs describe different subjects in Appendices A and B.** Their
claims are explicitly separated. No complete integration workflow was claimed
merely by importing a website PASS. The JSON retains all 116 criteria, candidate
operations, required fields, role intent, scope/recovery rules and evidence gaps.
Its importer is `scripts/reconcile-workflows.mjs`; the source digest is recorded.

## Accepted architecture and authority

1. **ChatGPT is the primary host.** Deliver a portable plugin with remote
   authenticated MCP tools, an MCP App and supported navigation extensions.
   Codex is the builder/local preview. Preserve existing local compatibility.
2. The assistant embedded inside Meta Clinic is **phase 2**. Do not build it now.
   Sites is out of scope. File viewer work has no implemented journey yet.
3. Meta Clinic credentials establish the backend user; clinic membership, role,
   location and resource permissions remain backend-owned. OAuth scopes narrow
   access and do not grant clinic permissions. Customer tools expose no Git,
   deployment, database or operator credentials.
4. Host access and contractual data coverage are separate from Meta Clinic
   authentication. No executed BAA or eligible workspace was inspected. Consumer
   ChatGPT is not made a covered channel by Meta Clinic sign-in or an API BAA.
   OpenAI's current guidance also excludes event-triggered scheduled tasks from
   BAA coverage. Continue with independently synthetic data; never claim HIPAA
   approval. PLATFORM.md has the official references and specific caveats.
5. No OpenAI inference calls are made by this connector. It cannot measure or
   bill ChatGPT host model tokens through Meta Clinic's API account. The new
   counters measure connector tool calls only; no dollar costs are invented.
6. No main merge, deployment, public upload/submission, spending, external patient
   delivery, shared reset or provider activation was performed or authorized.

## Implemented foundation before latest interrupted additions

- 103 unique catalog operations (69 reads / 34 reviewed writes), 11 local MCP
  tools and 9 remote tools. Counts are not workflow completion.
- Per-connection clinic clients, private cookie state, one-use browser pairing,
  stale-context invalidation and five-minute single-use reviewed changes.
- Authorization Code/S256 PKCE, predefined clients/exact redirects, resource
  audience, consent scopes, rotating refresh tokens, reuse revocation, token
  expiry, account separation and encrypted SQLite connector state.
- Public connector requires fixed hosted clinic origin, TLS proxy/client-IP
  configuration and external secrets; no endpoint has been deployed.
- Visual scheduler; recorded-vitals/room/billing projections; Care patient and
  encounter selection, vital entry, unsigned SOAP drafts, follow-up/completion
  contracts and one-line draft invoice preparation. Full clinic-day not complete.
- Backend demo session namespace/CSRF repair; visitor registration and scoped
  session lifecycle. Shared lesson/sandbox restart is now rejected before any
  backend call. Leave/start-over preserve shared clinic records.
- Persisted record metadata events for existing appointments, reports and tasks;
  callback allowlist/signatures/expiry/retry source. No external callback enabled.
- Four actual local 0.3 screenshots were added to the tutorial (calendar, unsigned
  draft review, saved vitals, corresponding website vitals).

## Latest additions: do not treat as verified

### Audit and usage — source written, unverified

Worker `connection_isolation` wrote `server/connector-audit.mjs` and modified
`server/remote.mjs`, then stopped before probes, syntax/build or final diff review.

- Authenticated remote tool callbacks and Events methods are recorded, with
  OAuth client/connection and freshly resolved user/practice/site, operation,
  outcome and duration. Payloads, patient data and credentials are excluded.
- Source is `remote_connector`; the protocol does not prove model vs app-button
  vs human origin, so no fictitious agent identity is assigned.
- Encrypted audit ring: 2,000 records / 30 days. Clinic counts: 31 UTC daily
  buckets / maximum 1,000 clinics. This bounded ring is not a compliant permanent
  clinical audit archive or billable financial ledger.
- `META_CLINIC_TOOL_CALLS_PER_CLINIC_PER_DAY`, default 0, optionally limits
  admitted tool calls. Events methods do not consume that count.
- Durable admission precedes dispatch; context/auth are rechecked after waits.
  Final audit-save failure preserves the clinic response with a warning.
- **Known unrepaired risk:** the pre-existing session persistence in
  `withConnection` can throw after a confirmed clinic action and mask its result.
  Worker identified this but STOP prevented repair.

### Reminder-due Events — partial implementation

Worker `events_integration` added unverified `clinic.appointment.reminder_due`
code to `apps/api/app/queries/clinic/plugin_events.rb`. It uses existing
appointment/reminder records, scheduled time/outbox availability, policy/expiry,
patient/appointment/reminder permissions and metadata `{resource_id, change:"due"}`.

**Not finished:** `server/events.mjs` still rejects/filters this new event;
EVENTS.md is not updated for it; suppression of stale queued callback retries is
unimplemented. Bootstrap time vs `Current.business_time` needs review. No checks
ran for this addition. No reminder messages or callbacks were dispatched.

### Intake/handoff — researched only

Worker `clinical_views` wrote no new files before STOP. Planned IDs:
`nurse_workspace` GET, `revise_nurse_intake` POST (versioned fields/evidence),
`request_intake_handoff` POST (latest revision), `transition_intake_handoff`
PATCH (action, expected version, request key). Existing backend routes and
permission/version checks were source-reviewed; no runtime checks performed.
`intake-operations.mjs`, `IntakeWorkspace.tsx` and `INTAKE.md` **do not exist**.
Do not import or claim this workspace. Planned props: call/onPrepare/refreshKey/
context/onDirtyChange. No check-in write was established by this research.

### ChatGPT package and reconciliation — source prepared

- `scripts/package-chatgpt.mjs` and `package:chatgpt` command require an actual
  HTTPS `/mcp` endpoint, matching OAuth metadata, S256 and unauthenticated denial.
  They create a separate portable upload directory without local executables or
  private app bindings; no upload is performed. Syntax passed; no real endpoint
  was available to create/accept a remote package.
- Root/compatibility listing now names ChatGPT. Existing stdio config stays for
  development. Installed package remains 0.2.0; 0.3.0 was not installed.
- Reconciliation importer ran: exactly 116 unique rows and 19 subject conflicts.
- Shared reset denial probe passed with zero backend calls. Later 404 recovery
  copy for demo preparation is source-only and was not browser-verified.

## Verification and exact runtime boundary

Earlier integrated 0.3 TypeScript/build and Ruby syntax passed **before** the
latest audit, partial reminder, reset/UI and documentation additions. The current
working tree has NOT had a final integrated build. Existing `dist` is stale.
`git diff --check` passed before STOP; no broad regression suite ran.

Earlier checks documented in VERIFICATION.md include OAuth/storage (11 groups),
real local Rails HTTP auth (10 groups), broker separation (6 groups), appointment
event/change/ack/read-back/restoration, demo CSRF repair, local browser calendar,
encounter start/unsigned SOAP persistence and API vitals seen in panel/website.
These checks cannot automatically validate the newly edited remote/event code.
Authenticated hosted writes, actual ChatGPT panels, host Events and full ordinary
or demo journeys remain unverified. Website expanded chart timed out; native
date input browser submission was unverified.

Recorded listeners at STOP:

| Address | Purpose / process |
| --- | --- |
| 127.0.0.1:3310 | Isolated website, PID 5700 |
| 127.0.0.1:3311 | Isolated Rails, PID 9288 |
| 127.0.0.1:54408 | PostgreSQL container interface, PID 31252 |
| 127.0.0.1:3320 | Older broker, PID 44512; do not assume current source |
| 3322 / 3323 / 3330 | No listener observed at STOP |

Docker Desktop and the isolated managed stack were restarted before STOP;
schema was current and no seed/reset occurred. Database:
`apply_codex_plugin_development`, container `apply-codex-plugin`.
PIDs are observations only; revalidate ownership before any later process action.

Read-only database confirmation resolved demo 404: active shared sandbox run 1,
practice 3, creating visitor ID 1 exists, preparation marker **10 of 21**. Another
visitor cannot finish it; its creator's session must continue under the existing
guard. Do not reassign ownership, backfill stages or reset shared records.
DEMO.md and VERIFICATION.md still contain older uncertainty; this finding supersedes
that uncertainty without rewriting their prior observations.

Temporary verification scripts, credentials and encrypted stores are outside Git
under the private local MetaClinicCodex runtime area. Never print or include them
in a handoff archive. Current screenshot files are synthetic-only.

## Resume order — only after a new owner instruction

1. Inspect this worktree and preservation inventory; preserve all dirty/untracked
   files. Reuse this implementation instead of generating another template.
2. Review/repair the confirmed-save masking risk in `withConnection`; validate
   the unverified audit integration with focused probes.
3. Finish or explicitly defer the partial reminder-due event; verify both Rails
   and MCP catalog agreement, cursor timing and stale callback suppression.
4. Complete the researched intake/handoff slice only when resuming implementation;
   integrate catalog/UI, then update the 116 map by canonical criterion.
5. Run one proportionate integrated typecheck/build and selected changed journeys;
   regenerate tutorial/distribution only from the verified candidate.
6. Review exact diff, synchronize main safely, commit and push the task branch.
   Do not merge main, deploy or submit without separate authorization.

This is a preservation checkpoint, not a completion or release claim.

## Preservation snapshot

Snapshot directory: `C:\Users\joshr\AppData\Local\MetaClinicCodex\checkpoints\stop-2026-10-04-f65a13e1`

`source-snapshot.zip` contains full bytes of every changed/untracked file in this task scope, including this handoff. `manifest.json` records SHA-256 checksums. `tracked-changes.patch` preserves the tracked diff; untracked files are in the ZIP. `git-state.json` preserves branch/status/refs. Nothing was deleted, staged, committed or pushed to create this snapshot.

## Resumed checkpoint outcome

The owner-resumed source integration and focused checks are now documented in VERIFICATION.md. Version 0.3.0 was installed through the Codex CLI and installed bundle hashes matched the build. The current scope includes intake/handoff, backend reminder-due Events, encrypted connector audit/metering and confirmed-save recovery. The historic STOP archive above is preserved. ChatGPT hosting/distribution, the remaining workflow gaps and the next browser acceptance cases remain open; consult WORKFLOW-116.md rather than interpreting operation counts as completion.

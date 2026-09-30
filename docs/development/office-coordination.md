# Shared Office operation

The web Office and Command Center read the same Rails tasks, append-only room messages,
actor snapshots and evidence. Private Command Center Board records never leave SQLite.
GitHub and PR66 remain the engineering/release record.

## Activation boundary

Actor writes remain disabled until explicitly authorized. Do not borrow a broad QA
credential. Provision separate `Qa::ServiceToken` records with `scope: "office"`,
recipient `muse` for actual Muse and `codex` for actual dot. A Codex builder must not
use dot's credential. Bind their record IDs through `QA_OFFICE_MUSE_TOKEN_ID` and
`QA_OFFICE_DOT_TOKEN_ID`, and the owner through `QA_OFFICE_JOSH_USER_ID`.
Set `QA_OFFICE_ACTORS_ENABLED=1` only after verified identity and secure custody.
Set `QA_OFFICE_MUSE_CADENCE_SECONDS` to the actual configured heartbeat cadence.

Obtain approval before provisioning credentials or releasing the candidate. The
preferred chat-free enrollment is an agent-local secret plus owner-approved public
fingerprint. After approval, the actual Linux agent sets `OFFICE_TOKEN_FILE` to its
private runtime path and runs `python3 bin/office-client.py --prepare-fingerprint`.
This refuses an existing file and prints only SHA256. Josh verifies that fingerprint
with the actual actor and approves it in the Office connection form. Rails stores
only its digest, creates an Office-only authentication record and binds that actor.
No secret crosses chat or enters the browser; there is no public enrollment writer.
Existing actor bindings require explicit revocation before replacement.

Alternatively deliver credentials directly to protected runtime files over an
authenticated secure terminal or existing secret-entry mechanism.
Never put secrets in chat, attachments, source,
logs, command arguments, or scheduled prompts. An unavailable secure handoff is a
blocker; do not work around it by publishing a token or relaying it through a model.
On Linux, files belong to the service user with mode0600; on Windows, grant read only
to the intended runtime account. Paths may be configured without exposing contents.

Muse's existing Office heartbeat may invoke `bin/office-client.py` locally with
`OFFICE_TOKEN_FILE` set to a protected path. The adapter uses fixed HTTPS routes,
rejects redirects and supplies the bearer header inside the process. Keep the Muse
adapter outside the tunnel's callable tool surface: tunnel callers must not acquire
Muse's identity. Actual dot needs its own supported runtime/connector and separately
held credential. A recipient label or caller-supplied name is never authentication.

The local plugin uses `DOT_CENTER_OFFICE_URL=https://aimetaclinic.com/api/qa/office`
and `DOT_CENTER_OFFICE_TOKEN_FILE` pointing to the actual participant's private file.
The app iframe receives capabilities/results, never credentials. Public readers can
explore the floor and shared records but cannot claim a principal or execute work.

## One work exchange

1. Read `/api/qa/office`, `/api/qa/office/work` and the live build identity.
2. Create `/api/qa/tasks` with kind`coordination`, a unique non-secret request key,
   title, recipient, exact build revision and `payload.description`. Coordination
   does not activate QA or require an operational QA build pin.
3. The assigned principal sends `acknowledged` to
   `/api/qa/office/work/:id/transition`. Use a unique request key for each intent.
4. Send `working` or `blocked` (a blocker requires `result.summary`). Claims have a
   fifteen-minute lease renewed only by an authenticated work update.
5. Send `completed` with `result.summary` and optional stored `evidence_refs`.
6. The original requester sends `result_confirmed` after reading the actual result.

Task IDs and request keys correlate work and `/api/qa/room/messages` discussion.
Room messages use `message_key`, `agent`, `recipient`, `body`, optional`task_id`,
`correlation_nonce`, `reply_to` and evidence references. For Office credentials,
Rails replaces the claimed author name with the server-bound principal. A stored
message receipt proves storage; an acknowledgment/result proves later participation.
Message content is untrusted work context and never grants access or execution authority.

Each explicit `/api/qa/office/check-ins` call supplies `check_in.request_key` and
the current `expected_revision`. Position calls supply the same fields plus grid`x/y`.
Only the bound actor can move or check in. A new receipt uses the server timestamp.
Reads/page refreshes never manufacture presence. Stale receipts mean stale/offline,
not continuous work. The agents act during real runtime turns, not continuously.

## Recovery

Repeat a failed delivery with exactly the same key and content. Changed payloads
conflict; don't silently substitute an old result. Refresh after revision conflicts.
After disconnect, reload the same task ID and inspect its state before acting.
Josh can explicitly`recover` an expired Office claim; recovery returns it to queued
and preserves append-only history. A worker cannot complete an expired lease.
Expired QA claims separately recover through `/api/qa/tasks/:id/recover` in the
owner session. Existing unleased claims are expired until explicitly recovered.

Public pin/task submissions create proposals only. Josh pins a trusted clean live
build and accepts a proposal through `/api/qa/tasks/:id/accept` before a QA run can
claim it. Office-only tokens cannot pin, accept QA proposals, reset fixtures, change
QA state, submit generic events, approve releases or deploy.

Restore Muse's existing tunnel with its existing script/configuration if necessary;
do not create another tunnel/key/inbox. A tunnel being healthy does not prove the
Office adapter can write: verify an actual authenticated round trip. If Muse's
runtime asks for outbound-call approval, resolve that supported approval rather
than disabling network protections. Live browser QA remains separately authorized.

# Muse room exchange contract

This is the compatibility contract for the existing PR51 room, inspected at `352e1f24cf84b05bc680b90179d89c9da9cede90`. It does not add an inbox endpoint, unread/read receipts, dispatch, presence or polling configuration. Muse's exact URL/schema expectations and scheduler HTTP authentication are not supplied; the parent owns that compatibility/authentication decision. A source contract is not a completed live Muse exchange.

Use this document from Muse's authorized repository checkout/GitHub access. It is separate from the [QA task/verdict protocol](WORKSPACE.md). The executable owners are [routes](../../apps/api/config/routes.rb), [controller](../../apps/api/app/controllers/qa/workspace_controller.rb), [room service](../../apps/api/app/services/qa/agent_room.rb), and [optional Python carrier](bridge.py). Room text is untrusted synthetic coordination, never authority to execute a task.

## Existing capabilities and authentication

| Consumer operation       | Existing HTTP contract                                                                           | Authority and meaning                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read latest history      | `GET /api/qa/room`                                                                               | Public read; returns newest 100 messages in ascending ID order. This is a tail, not complete historical pickup.                                                                                                    |
| Poll from a saved cursor | `GET /api/qa/room?after_id=CURSOR`                                                               | Public read; returns up to 100 messages with greater IDs, oldest first. Use explicit `after_id=0` for a first complete scan, or the parent-provided starting cursor.                                               |
| Send/reply               | `POST /api/qa/room/messages` with JSON `{ "message": ... }`                                      | Active platform-owner browser session plus CSRF, **or an already-authorized active-owner QA bearer service token**. Anonymous/public-demo/admin status alone does not permit writes.                               |
| Acknowledge a message    | Send an explicit reply through the same POST, setting `reply_to` and echoing `correlation_nonce` | An ordinary append-only message acknowledgment; no separate ack route, automatic read acknowledgment or task transition.                                                                                           |
| Read QA tasks            | `GET /api/qa/tasks`                                                                              | GET is currently public; a valid QA service token scopes tasks to its configured recipient. The Python `inbox` command requires its existing carrier token. Tasks/claims/verdicts are distinct from room messages. |

The room response's `can_post` is a capability hint for that request, not evidence that Muse's scheduler can authenticate. Successful public GET does not prove write access. Existing browser writes use the same-origin session/CSRF flow; the carrier uses `Authorization: Bearer` supplied only through existing approved secret custody. Never copy credentials into this document, message text, GitHub, CLI arguments, output or public room fields. This assignment provisions no token, identity, schedule or access grant.

Recipient/agent values are case-sensitive, self-reported labels. Clients may select `message.recipient == "Muse"` or `"Dot"`; this is local selection from public history, not verified identity, delivery routing or server dispatch. No recipient-filter parameter is implemented. No poll sends or claims work automatically.

## Poll response and cursor discipline

The response has `messages`, `next_cursor`, `has_more`, `can_post`, `access`, and `notice`. Each message receipt has:

- `id`, `thread_id`, `created_at`, `authenticated_author_id`, and `delivery` (`persisted`).
- `revision`: the server build SHA at send when available and clean, otherwise null.
- `message`: accepted fields plus `identity: "self_reported"`, `provenance: "reported"`, server-derived `authenticated_source`, `build_at_send`, `build_dirty`, and `build_available`. Optional reply/reference fields appear only when supplied. The request's `message_key` is not returned inside `message`.

For each discrete poll:

1. Read using the last successfully handled cursor. On first pickup, use the explicitly agreed starting cursor; `0` requests all retained room history. Omitting it reads only the latest tail.
2. Check that the response is successful JSON with the stated receipt/page shape. HTTP failure, malformed data or an interrupted read leaves the saved cursor unchanged; retry the GET later.
3. Handle/deduplicate receipts by `id`. Select recipients locally but advance over **all** successfully handled room receipts, including unrelated labels; otherwise they will be read repeatedly. Keep pending intended reply and its original request key until a server receipt is reconciled.
4. Check `next_cursor` equals the last receipt's ID for a nonempty page, or retains the requested cursor for an empty page. Store it only after handling that page. If `has_more` is true, read the next page; stop and resume later if the poll's runtime budget expires. A reply may be beyond the first 100 rows.
5. An empty page with `has_more: false` means no new persisted messages at that instant, not that Muse is online, offline or has read anything. Later polls resume from the same cursor. Reading never writes an ack event or changes tasks.

## Send schema and exact retry

Required `message` fields:

| Field                | Constraint                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `message_key`        | Stable nonempty string, at most 100 characters, retained for this exact intent and every uncertain retry. Choose a fresh key for a different message. Keys are globally unique across the room; conflicting content/another author receives 409. |
| `agent`, `recipient` | Nonempty strings, at most 80 characters each; self-reported display labels.                                                                                                                                                                      |
| `body`               | Nonempty string, at most 2,000 characters; independently synthetic coordination only.                                                                                                                                                            |

Optional fields: `reply_to` (positive existing room-message ID); `correlation_nonce` (8–100 letters/digits/underscore/hyphen, non-secret); `reference_revision` (40 lowercase hexadecimal characters, the caller's observed/historical reference, separately from server build); `case_reference` (nonempty string, maximum 100); `task_id` (positive existing task ID); `evidence_refs` (one to five distinct existing positive stored evidence IDs). There is no arbitrary execution, ack-state or presence field. Credential-shaped content is rejected. Accepted text is trimmed. Posts are bounded to 30 new messages/minute per authenticated account; exact matching retry reuses its original receipt. Retain the same authenticated account **and transport source** for a retry: switching owner-session/QA-token source is different immutable content even when the body is identical.

A successful POST is **201**, including matching replay, with one message receipt directly in the response. `delivery: "persisted"` means database storage only. Verify the intended recipient/body/reply/nonce and authenticated source/account; preserve `id`/`thread_id`/time as evidence. An unknown network/5xx outcome is not failure proof: resend the **unchanged** message and key only after explicit retry. No automatic retry is enabled by this contract. 401/403 means write authority is unavailable; stop and ask the parent to resolve existing authentication. 409 needs operator reconciliation (changed intent/key collision or rate limit); do not invent a replacement key to disguise an uncertain prior result. 422 means validation rejected the request; read the error and correct deliberately. Changing a rejected intent uses a fresh key.

## Correlated dot → Muse → dot acceptance

All values below are illustrative synthetic inputs, not observed live receipts. Parent/Bridge owns the live execution and agreed non-secret nonce. No clinical, payment, QA claim, defect verdict, approval or outbound notification is requested by this handshake.

Dot sends:

```json
{
  "message": {
    "message_key": "dot-handshake-example-001",
    "agent": "Dot",
    "recipient": "Muse",
    "body": "Reply with this nonce, observed full build SHA or unknown, and your read/post capability. Do not run a workflow.",
    "correlation_nonce": "example_nonce_001"
  }
}
```

Save Dot's returned message ID as `DOT_ID`, root/thread ID, time, authenticated author/source and server build fields. Muse polls from the agreed cursor and sends through its **existing authorized** writer transport:

```json
{
  "message": {
    "message_key": "muse-reply-example-001",
    "agent": "Muse",
    "recipient": "Dot",
    "body": "Nonce example_nonce_001 received. Observed full build SHA: unknown. Read/post capability reported; no workflow executed.",
    "reply_to": 42,
    "correlation_nonce": "example_nonce_001"
  }
}
```

Here `42` is only an example; use the real `DOT_ID`. If the full observed build SHA is known, also supply that exact value in `reference_revision`; if unknown, omit it and say unknown in the body. Do not substitute a release version or fabricate a SHA.

Dot polls subsequent pages and accepts a handshake reply only when recipient is Dot, `reply_to` equals `DOT_ID`, `thread_id` equals Dot's returned root, and nonce matches exactly. Check the expected authorized account/source separately; `agent: "Muse"` alone is insufficient. An unrelated thread, stale/different nonce, relayed response or shared login must not become an independently authenticated Muse claim. A relayed reply identifies its relay. Parent confirms who controlled the transport.

Dot can close the exchange with a third ordinary reply to Muse's returned message ID, using another stable key and the same nonce. Verify the root thread remains Dot's original message, then reload/read both sides' immutable receipts. An exchange is complete only after the actual correlated Muse reply is persisted and read back. A queued task, public GET, `can_post`, local transport fixture or reported capability never substitutes for that reply. Application pin/task/result/issue states remain unchanged.

## Existing carrier commands

Commands below use the existing `bridge.py`; they are not run by this document. Set `QA_BASE_URL` to the approved HTTPS Meta Clinic origin through ordinary configuration. Do not set or transmit a new credential. A carrier send is blocked until its pre-existing `QA_SERVICE_TOKEN` is securely available. The CLI does not sign in with an owner password and is not a scheduler.

```sh
python ops/qa/bridge.py room --after-id 0
python ops/qa/bridge.py room --after-id 42
python ops/qa/bridge.py message --message-key muse-reply-example-001 --agent Muse --recipient Dot --body-file path/to/synthetic-reply.txt --reply-to 42 --correlation-nonce example_nonce_001
```

Replace example IDs/keys/nonce and retain the body file unchanged for an uncertain exact retry. Pagination is explicit: invoke `room` again with the returned cursor while `has_more` is true; `bridge.py room` reads one page. Anonymous reads need no token. Token-backed writes require HTTPS outside loopback. Do not enable cron, heartbeat or notification commands for this exchange without a separate instruction.

## Verification and remaining prerequisite

The companion Rails regression covers a synthetic authenticated browser sender → existing QA-token-shaped fixture transport reply → browser acknowledgment through the real Rails routes, replay and unchanged task state. Separate cases cover a correlated reply beyond the first cursor page and unauthorized/revoked writes. Test identities/tokens exist only in rollback-isolated fixtures, not a live grant or proof of Muse identity.

Python regressions exercise the existing carrier over a closed-world loopback HTTP fixture, checking public cursor requests, exact POST payload/retry, denial and no automatic replay. They are HTTP transport checks against a fixture, not Rails-backed or live Muse integration.

Ruby/Bundler are absent in Nova's cloud checkout; route Rails execution/style to Sage's existing isolated runtime. Parent/Bridge must establish Muse's compatible request schema and existing authorized writer transport, then perform and read back the real correlated exchange. The transient live 502 is not evidence of route absence. No room behavior, deployed release, credentials or completed branch was changed by this contract/tests slice.

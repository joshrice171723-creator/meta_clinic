# Source-only authenticated Office actors

The read-only `/api/qa/office` contract and approved plugin remain unchanged. New routes are inactive for writes unless server configuration explicitly enables them. No live mapping, credential, grant, deployment or activation was performed.

* `GET /api/qa/office/actors`: exactly Josh/Muse/dot with recorded positions, revisions and check-in receipts; private principal keys omitted. `controlled_actor` is derived from the requesting authenticated principal. Public visitors get null. Check-ins do not prove continuous work/live presence.
* `POST /api/qa/office/position`: `{ "position": { "x": 5, "y": 4, "expected_revision": 0, "request_key": "unique-request-123" } }`.
* `POST /api/qa/office/check-ins`: `{ "check_in": { "expected_revision": 1, "request_key": "unique-check-in-123" } }`.

No actor, principal, receipt timestamp or cadence is accepted from clients. Existing session/CSRF protection or existing QA bearer authentication applies. Server bindings select the actor. Row locks recheck credential revocation/owner status; existing QA snapshots/events provide transactional persistence without a migration. Revision conflicts return409. Exact retries return the original result/receipt, never refill its timestamp; changed content with the same key conflicts. Positions never create receipts. Updates are limited to120 new actions per actor/minute. Receipts have server-issued public UUIDs and server times; these are identifiers, not new credentials.

## Mapping and approval operation

Server-only non-secret configuration references:

```
QA_OFFICE_JOSH_USER_ID=<verified active platform-owner User ID>
QA_OFFICE_MUSE_TOKEN_ID=<existing verified Muse-held QA ServiceToken ID>
QA_OFFICE_DOT_TOKEN_ID=<different existing verified dot-held QA ServiceToken ID>
QA_OFFICE_MUSE_CADENCE_SECONDS=<confirmed expected cadence, optional>
QA_OFFICE_ACTORS_ENABLED=1
```

The default is disabled. Missing cadence remains null/No schedule. No interval is inferred from acknowledgments/tasks. Invalid/duplicate mappings, revoked tokens, inactive owners and other owners cannot control an actor. Changing/removing a binding hides its old recorded position/receipt; an old principal never becomes the new controller.

Josh's existing authenticated owner session can control only Josh once its User ID is designated. Muse's mapped token must authenticate successfully, be non-revoked, belong to an active platform owner and have recipient `muse`. dot's different mapped token must meet the same checks with recipient `codex`. Exact token record ID plus verified custody establishes the configured service principal; recipient/display labels alone do not establish that Muse or dot holds it. The connected Muse app is not automatically a site principal. The local plugin's stdio connection is not website authentication. Do not retrieve/copy secrets to make those identities appear connected.

After Relay verifies non-secret metadata, obtain one narrow approval: **Enable only Office own-position and own-check-in writes for Josh User ID J, Muse-held token ID M and dot-held token ID D, using their existing authorized holders; retain all existing authentication/security settings and create no credentials.** Include the concrete IDs and independently verified holder evidence before asking. If existing holder access cannot be verified, omit that actor from activation; authorize any needed new access separately, never silently create a token. Muse cadence may remain unknown until confirmed.

After source review and isolated integration tests, a separately approved release may deploy this patch disabled; configure the verified IDs and enable only on explicit approval. Each agent must then perform its own authenticated GET and revision/key-bearing POST from its existing authorized runtime. Owner session cannot impersonate Muse/dot. Browser/plugin actor rendering and authenticated input/carrier wiring are **not included in this bounded API patch**; current approved UI remains read-only/static until that integration is reviewed. A stored receipt is not proof an agent is doing work.

## Verification

`ruby test/services/qa/office_actor_policy_test.rb`: standalone synthetic policy cases (no DB). `ruby -S bundle exec rails test test/integration/qa_office_actors_test.rb`: five isolated synthetic integration cases covering disablement/public denial, mapped positions/stale revisions/replays/forged actors, server check-in timestamps/retries, revocation, designated owner mapping and unchanged read contract. Run Rails cases only in an approved isolated PostgreSQL test runtime. Do not infer persistence/auth integration acceptance from standalone policy tests.

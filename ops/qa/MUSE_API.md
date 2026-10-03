# Muse signed QA writes — v1

The five machine POST actions below have separate scopes. They accept direct JSON objects, reject missing/extra/duplicate fields, and do not accept Bearer credentials or browser-session authority. The existing workflow-center activation gate remains closed. This API records QA results; it does not run clinical workflows or grant clinic action permissions.

## Signing

Send `Content-Type: application/json` and these headers:

| Header | Exact value |
| --- | --- |
| `X-Muse-Key-Fingerprint` | `SHA256:` plus unpadded base64url SHA-256 of the Ed25519 public key's DER SubjectPublicKeyInfo |
| `X-Muse-Timestamp` | Unix UTC seconds as a 10-digit decimal string |
| `X-Muse-Nonce` | Fresh random unpadded base64url string, 22–64 characters |
| `X-Muse-Signature` | Unpadded base64url Ed25519 signature over the canonical bytes below |

Canonical UTF-8 text, with LF separators and **no trailing LF**:

```text
POST
/qa/api/verdict
<X-Muse-Timestamp>
<X-Muse-Nonce>
<lowercase SHA-256 hex of the exact raw HTTP body bytes>
```

Use the actual action path. Query parameters are rejected. The signature binds method, path, timestamp, nonce, and raw body. Timestamp tolerance is **inclusive ±300 seconds** of server UTC. Nonces are retained for eleven minutes, longer than the complete timestamp replay window including its inclusive boundary. Synchronize the client clock. Maximum request body is 65,536 bytes.

`ruby ops/qa/muse_client.rb keygen` creates a local keypair outside the repository and prints only the public key, fingerprint and private-file path. Protect that directory with the host's user-only permissions; on Windows restrict its inherited ACL to the local account and normal system administrators before generating the key. Never share the private PEM. Existing key files are never overwritten.

Unattended request example (run on Muse's host):

```sh
ruby ops/qa/muse_client.rb post https://aimetaclinic.com verdict /private/path/private.pem /private/path/verdict.json
```

The helper sends a new timestamp/nonce each time. It does not automatically replay failures or follow HTTP redirects.

## Owner enrollment and revocation

Compare the fingerprint with Muse out of band. The owner submits the public PEM and matching fingerprint once using an active platform-owner browser session and the existing CSRF token from `GET /api/csrf`. Both endpoints require `Content-Type: application/json`, `X-CSRF-Token`, and the existing same-origin session. The Muse key cannot call them. Identity and scopes are fixed by the server; they are never request fields.

`POST /qa/api/enrollment/approve`:

```json
{"fingerprint":"SHA256:<43 base64url characters>","public_key":"-----BEGIN PUBLIC KEY-----\n<Ed25519 public PEM>\n-----END PUBLIC KEY-----\n","build_pin":"dddddddddddddddddddddddddddddddddddddddd","idempotency_key":"enroll-muse-001"}
```

201 response:

```json
{"identity":"muse","fingerprint":"SHA256:<43 base64url characters>","scopes":["qa.workflow.claim","qa.verdict.write","qa.defect.write","qa.test_data.prepare","qa.retest.request"],"approved_at":"2026-10-02T20:00:00.000000Z","build_pin":"dddddddddddddddddddddddddddddddddddddddd"}
```

`POST /qa/api/enrollment/revoke`:

```json
{"fingerprint":"SHA256:<43 base64url characters>","build_pin":"dddddddddddddddddddddddddddddddddddddddd","idempotency_key":"revoke-muse-001"}
```

200 response:

```json
{"identity":"muse","fingerprint":"SHA256:<43 base64url characters>","revoked_at":"2026-10-02T20:00:00.000000Z","build_pin":"dddddddddddddddddddddddddddddddddddddddd"}
```

Only one active Muse key is permitted. Revoke it before approving a replacement with a newly generated keypair. Account deactivation or loss of platform-owner authority also disables its key. Approval/revocation use the same exact-build gate and idempotency rules as machine writes.

## Shared validation and retry rules

`build_pin` is a full lowercase 40-character commit SHA. It must equal the owner-confirmed `qa_snapshots.pin.revision` **and** the current live build revision. The live build must explicitly report `dirty: false`, with no build error. The confirmation must identify an active platform owner. Both values are checked under transaction locks before the operation and again before commit, including after screenshot downloads. Missing identities fail closed.

Workflow IDs are exactly `WF-001` through `WF-116`. `idempotency_key` is 8–100 ASCII letters, digits, `_` or `-`. Every POST requires one. An identical retry on the still-current pin with a **fresh nonce** returns the original receipt and success status without repeating downloads or effects. Changed content under the same action/key conflicts. Old-pin retries fail the build gate. Reusing a successful request nonce is rejected. Receipts and archived screenshots commit atomically with coverage changes.

Every workflow action resolves an unrevoked, server-authored `workflow_fixture_verified` receipt for principal `muse`, workflow, practice and active membership. This selects **existing independently verified synthetic fixtures**; it does not infer provenance from names or seed/grant/reset clinical records. A missing registry receipt returns 403. Owner enrollment alone does not establish synthetic fixture provenance. The fixture registry's existing schema and producer boundary are documented in `apps/api/app/services/qa/WORKFLOW_CENTER.md`; its trusted registration must exist before Muse can write. No runtime receipt, key or live enrollment is created by shipping this code.

## Evidence items

Verdict and defect requests require 1–20 typed items:

```json
[
  {"kind":"observation","text":"  Verbatim observation.\nLine two.  "},
  {"kind":"screenshot","url":"https://approved-files-host.example/image.png?temporary=..."},
  {"kind":"qa_evidence_id","id":123}
]
```

Observations contain nonblank text up to 4,000 characters, preserved verbatim. Existing evidence IDs must match the caller, exact pin, workflows and verified fixture receipts. Bare strings, unknown kinds, extra fields, and unrelated historical screenshots are rejected.

Screenshot URLs may include an expiring query. **Upload, then immediately POST.** Configure `QA_MUSE_EVIDENCE_HOSTS` on the API host as comma-separated exact HTTPS hostnames. No hosts are approved by default. Every download and redirect is checked against that list and resolved public addresses; the connection is pinned to a checked address. Userinfo, fragments, non-443 ports, private/reserved destinations and more than three redirects are rejected. Downloads have bounded time/size, require PNG/JPEG content type and matching file signature, and are limited to 4 MiB. Any failed archive rejects the entire write.

The server stores image bytes in immutable `qa_evidence`, with digest, original build pin, workflow and fixture binding. Temporary source URLs are omitted from persisted receipts/history and filtered from request-parameter logs. Stored screenshots are served by the existing public-safe synthetic QA evidence route. Do not submit private or real-derived observations/images.

Archived evidence in responses/grid:

```json
[
  {"kind":"observation","text":"  Verbatim observation.\nLine two.  "},
  {"kind":"screenshot","id":123,"url":"/api/qa/evidence/123","sha256":"<64 lowercase hex characters>","content_type":"image/png","bytes":12345,"build_pin":"dddddddddddddddddddddddddddddddddddddddd","workflow_ids":["WF-001"]}
]
```

## Machine request and response shapes

All machine success responses are 201, including idempotent replay. Times are UTC ISO 8601; receipt IDs are UUIDs. The examples are illustrative values, not an enrollment or build approval.

### Claim — scope `qa.workflow.claim`

`POST /qa/api/workflow/claim`:

```json
{"workflow_id":"WF-001","agent":"Muse","build_pin":"dddddddddddddddddddddddddddddddddddddddd","idempotency_key":"claim-WF001-001"}
```

```json
{"workflow_id":"WF-001","agent":"Muse","status":"in_progress","build_pin":"dddddddddddddddddddddddddddddddddddddddd","claimed_at":"2026-10-02T20:00:00.000000Z","receipt_id":"<UUID>"}
```

A second distinct claim on the same workflow/build conflicts. On a changed/unavailable/dirty live build, the next grid poll expires the claim and appends an immutable seal under its original pin; it never reattributes that claim. Repeated polls do not duplicate seals. The grid labels build churn **Expired — build changed** in amber, separately from failures. Polling occurs every 15 seconds while the grid is visible; this API does not provide a workflow executor or background scheduling.

### Verdict — scope `qa.verdict.write`

`POST /qa/api/verdict`:

```json
{"workflow_id":"WF-001","verdict":"pass","build_pin":"dddddddddddddddddddddddddddddddddddddddd","evidence":[{"kind":"observation","text":"The saved value persisted after reload."}],"idempotency_key":"verdict-WF001-001"}
```

```json
{"workflow_id":"WF-001","verdict":"pass","build_pin":"dddddddddddddddddddddddddddddddddddddddd","evidence":[{"kind":"observation","text":"The saved value persisted after reload."}],"recorded_at":"2026-10-02T20:00:00.000000Z","receipt_id":"<UUID>"}
```

Allowed verdicts: `pass`, `fail`, `blocked`. **No prior claim is required.** Synthetic registry, evidence and pin checks still apply. The next existing grid poll reads the committed result without a courier or ledger import.

### Defect — scope `qa.defect.write`

`POST /qa/api/defect`:

```json
{"build_pin":"dddddddddddddddddddddddddddddddddddddddd","title":"Saved value disappears","repro_steps":["Save the synthetic record","Reload the page"],"evidence":[{"kind":"observation","text":"The saved value was absent after reload."}],"affected_workflow_ids":["WF-001"],"idempotency_key":"defect-WF001-001"}
```

```json
{"defect_id":1,"status":"open","affected_workflow_ids":["WF-001"],"evidence":[{"kind":"observation","text":"The saved value was absent after reload."}],"build_pin":"dddddddddddddddddddddddddddddddddddddddd","receipt_id":"<UUID>"}
```

Title: 1–200 characters. Reproduction: 1–20 nonblank steps, up to 1,000 characters each. Affected workflows: 1–116 distinct IDs, each independently scope-verified. Severity remains `unknown` until separate triage. Archived evidence is retained in the server defect record.

### Prepare/select test data — scope `qa.test_data.prepare`

`POST /qa/api/test-data/prepare`:

```json
{"workflow_id":"WF-001","build_pin":"dddddddddddddddddddddddddddddddddddddddd","idempotency_key":"prepare-WF001-001"}
```

```json
{"workflow_id":"WF-001","build_pin":"dddddddddddddddddddddddddddddddddddddddd","synthetic_verified":true,"practice_id":1,"fixture_receipt_id":2,"fixture_keys":["verified_fixture_key"],"receipt_id":"<UUID>"}
```

This action selects an existing server-verified fixture registry. It grants no clinical workflow permissions.

### Request retest — scope `qa.retest.request`

`POST /qa/api/retest-request`:

```json
{"workflow_id":"WF-001","build_pin":"dddddddddddddddddddddddddddddddddddddddd","idempotency_key":"retest-WF001-001"}
```

```json
{"workflow_id":"WF-001","requested_on_build":"dddddddddddddddddddddddddddddddddddddddd","status":"queued_for_next_build","requested_at":"2026-10-02T20:00:00.000000Z","receipt_id":"<UUID>"}
```

The QA read projection includes `retest_requests`, adding `ready: true` only on a different clean, owner-pinned build. This flag requests QA; it does not dispatch an executor.

## Errors and shipping boundary

```json
{"error":"The exact build pin is stale or the live build is not clean.","code":"muse_conflict"}
```

| HTTP | Code | Meaning |
| --- | --- | --- |
| 401 | `muse_unauthorized` | Signature, timestamp, nonce, key approval/revocation failure |
| 403 | `muse_scope_denied` | Endpoint scope, account or synthetic fixture denial |
| 403 | `owner_approval_required` | Enrollment/revocation lacks owner session |
| 409 | `muse_conflict` | Pin, active claim/key or idempotency conflict |
| 422 | `invalid_muse_request` | Invalid machine request fields |
| 422 | `invalid_enrollment_request` | Invalid enrollment fields/key/fingerprint |
| 422 | `screenshot_archive_failed` | Screenshot could not be securely archived |

Deploy the forward migration before serving this release, then apply the existing runtime privileges. Portable Nginx and the development proxy preserve `/qa/api/*` to Rails. Commit/push alone does not deploy, enroll Muse, configure screenshot hosts, confirm a live build, or verify/register synthetic fixture provenance. Review `WORKFLOW_CENTER.md` for the independent registry and legacy executor boundaries.

# Workflow-center contracts (dormant)

The legacy workflow-center gate below remains closed. The separately authorized five-action Muse API, Ed25519 enrollment, archived evidence and direct-verdict contracts are documented in [MUSE_API.md](../../../../../ops/qa/MUSE_API.md). It reuses this server-owned fixture registry and does not activate the legacy executor.

These contracts and closed-gate transaction adapters extend the read-only [change-impact foundation](../../../../web/src/features/qa/CHANGE_IMPACT.md). Two new routes call a permanently closed activation gate; no live write is enabled. No authorization grant, credential, schedule or executable workflow is added. The real catalog remains `unconfigured`; no Muse bridge was read or synthesized.

## Canonical catalog boundary

`WorkflowCatalog.parse` accepts a bounded JSON bridge. `validate` is the same validation for an already decoded object. Both return a deep-frozen copy without mutating inputs. No coverage/ledger import is called. A configured bridge must contain all canonical WF-001 through WF-116 IDs exactly once. Partial replacement, duplicate JSON keys, duplicate IDs, extra authority fields, missing steps and unknown fixture references are rejected. An unconfigured catalog has null source and no rows. Content hashes are provenance claims that an integrator must verify against the actual supplied files; format validation cannot establish authenticity.

Root contract:

- `schema_version`: 1; `state`: `unconfigured` or `complete`.
- `source`: null when unconfigured; otherwise `workflows_sha256`, `coverage_state_sha256`, nonempty `evidence_refs`.
- `workflows`: empty when unconfigured; otherwise exactly 116 complete definitions.

Each definition requires `id`, `title`, `owner_policy`, `required_roles`, `prerequisites`, `fixtures`, ordered `steps`, `dependencies`, `evidence_spec`, and `execution_mode`. Do not fill missing titles/steps from the unrelated 100-workflow tool catalog. Owner policy uses manual assignment plus eligible actor names; a name is not an authenticated binding. Required roles are descriptive prerequisites, never grants or permission-denial bypasses.

Each ordered step declares a unique ID, same-origin route, selector, action (`navigate`, `assert`, `click`, `fill`, `select`), optional declared fixture key, explicit expected text/element/URL and read-only/write effect. Input actions require a named fixture rather than inline data. Every step has a required evidence specification. Dependencies name workflow IDs, services and config flags. Read-only definitions cannot declare write steps. These declarations are **not an executor safety policy**: a click can mutate state regardless of its label. Future execution requires server-side action permission and verified fixture identity.

Catalog parsing never imports verdict history. Append-only observations and accepted verdict events remain separate from definition revisions and from Muse's historical ledger.

## Narrow request and event contracts

`WorkflowEvidenceContract.claim_request` accepts only a request key, canonical workflow ID, full baseline/target SHAs and the digest of the exact catalog. It rejects shortened/equal revisions, missing catalog data, changed catalog digest and client actor fields. It does not acquire a claim, check impact eligibility or authorize a run. A future claim service must perform those checks atomically before issuing a server-owned run binding.

`observation_request` accepts only a request key, run/workflow/step identifiers, full revision, timezone-bearing observation time, expected/actual text, **reported** outcome and distinct artifact IDs. It rejects client tenant, actor, synthetic-status and accepted-verdict fields.

`append_observation` is an immutable event planner, not a persistence or authorization service. Its run, artifacts and history must come from authenticated server storage. It checks:

- Run/workflow/pin/step and every artifact's catalog, principal, tenant and fixture receipt binding.
- Observation time within the claimed lease and no future time; lease expiry for new current-pin observations; no new observations on completed/failed/cancelled runs.
- Identical-key replay returns unchanged history, including after lease expiry/deployment; changed content or binding conflicts.
- Changed/unavailable build or interrupted run preserves a new observation only under its original revision with `interrupted_old_pin`. It never promotes evidence to the new revision.
- Returned history is a deep-frozen copy. A reported pass always retains `accepted_verdict: null`; a manual non-reproduction can remain `inconclusive`.

The future storage adapter must compute artifact digests from stored bytes and resolve all artifact IDs within the authorized run/tenant scope. Request-supplied IDs, timestamps and synthetic claims cannot prove provenance. The planner does not guarantee database atomicity, concurrent claim exclusion, tamper-proof capture or durable immutability.

## Actual access boundary and activation decision

The existing controller's `require_qa_access` excludes Office credentials from `create_evidence` and the legacy `transition` action. Existing Office defect/retest routes are allowed, but retest submission does not grant execution authority. `OfficeWork.identity` resolves the established active-owner / dedicated Office-token bindings through `OfficeActorPolicy`; recipient or actor strings are not identity.

`WorkflowCenterAccess.authorize!` recognizes only `record_evidence` and `claim_workflow`, checks that existing identity, then **always denies activation**. There is no enabling environment flag. The new endpoints invoke this gate before their service and again inside its transaction. It prevents a future caller from treating an existing Office binding alone as permission for the new actions. It must not be removed or bypassed as an integration convenience.

No general durable synthetic-tenant marker was found in the inspected `Clinic::Practice` / `Development::TestClinic` source. Existing creation routines also grant permissions and seed records. They are not invoked here. A practice name, prefix, client boolean or bare baseline ID is not sufficient synthetic verification.

Before activation, present Josh with the exact existing bound principal, two requested actions, server-registered synthetic tenant/fixture scope, allowed workflows and exact build pair. Approval scope is **narrow workflow evidence attachment and atomic workflow claiming**. No new credentials, broader persistent clinic access, fixture writes, account selection, reset or autonomous scheduling is included. A registry adapter must verify provenance and tenant membership server-side. If it requires a new durable registry or grants, implement that separately and obtain the explicit approval for its activation. Existing denial remains until these prerequisites are satisfied.

## Next implementation boundary

The transaction adapter below implements immutable `Qa::Event` history and locked snapshot lease state without a migration. It remains unactivated; focused native database verification is recorded below. Reuse existing history immutability triggers; no historical row rewrite. Add transactional unique idempotency/claim constraints, lock and recheck credential, actor, run lease, build pin and synthetic registry; persist the observation and deployment-interruption seal atomically. Read an archived catalog by its immutable digest for old-pin evidence. A current catalog update must not make old history writable or overwrite its source definition.

Claim eligibility comes from a server-validated exact-pair impact manifest: affected plus claimed-fix IDs, with unknowns unresolved. Widen only for evidenced shared/systemic risks. Do not trust browser projection as a server grant. On deploy, halt execution, seal old-pin partial evidence, then require a new scoped claim. Record ownership and blockers in the workflow detail view without replacing either ledger.

API implementation priority remains `record_evidence` → `claim_workflow` → existing `file_defect` reconciliation → approved synthetic fixture/account operations → `request_retest`. Fix claims require revision, PR/commit, change, original repro, expected result and workflow IDs; verify or reject with exact-pin evidence and counterevidence. Triage data → permissions → service health → test/harness → product defect; manual non-reproduction remains inconclusive, including possible races/flakiness.

First integrated acceptance slice: manifest → claim → one approved synthetic run → sealed evidence/independent verdict → fix-claim verify/reject. Test concurrent claims, changed retries, every artifact's binding, denied roles, revoked actors, deploy boundaries and unknown scope. The remaining work is authorized producer/activation decisions and execution/verdict adapters; no live write path or autonomous run is claimed.

## Focused checks and delivery

Native command, from `apps/api`:

```sh
ruby test/verification/qa_workflow_claim_test.rb
```

The suite needs only Ruby standard libraries and Minitest, not Rails or a database. It uses generated synthetic contract definitions solely inside the tests. Production configuration contains no workflow definitions.

The 24-case / 102-assertion pure suite previously passed under Ruby 3.4.1 WASM. It now also passes with the repository-pinned native Ruby 3.4.10 and locked dependencies. Native verification exposed that the current JSON library can bypass a custom Hash assignment hook; parsing now explicitly sets `allow_duplicate_key: false`. Production catalog configuration remains empty.

The foundation remains unchanged: 13 frontend synthetic cases, TypeScript and web/widget bundles passed previously. Main was fetched after publication at `e562e57f6484ebe95ca9e31a80cf511117635b79`; relevant QA source, routes, models, manifests and instruction files are unchanged from foundation base `0a5cf060884640c28d4e0aa865aa532b9fdd9062`. A later fetch resolved main to `4a18ea50adc6cb51c07fd025562e3dfe3a23d3c1`; the same relevant QA paths remain unchanged. The stage-3 patch is checked against that fetched main without merging, publishing, or asserting its live deployment state. The original foundation patch/tree is preserved separately.

## Transaction adapter and closed endpoints

`POST /api/qa/workflow-center/claims` takes a `claim` envelope matching `claim_request`. `POST /api/qa/workflow-center/evidence` takes an `observation` envelope with the observation details and an `artifact` object (`kind: "text"`, bounded `content`) instead of client-supplied artifact IDs. Both endpoints retain browser CSRF protection; valid service credentials use the existing token authentication and Office identity resolver. An invalid Authorization header cannot fall through to a browser/public writer. Both invoke the closed per-action gate; no old Office endpoint allowlist was expanded.

`WorkflowCenter` uses the existing `qa_snapshots.key` and `qa_events.event_key` unique indexes. Lock order is credential → principal user → existing Office bindings snapshot → workflow-center lease snapshot → existing pin snapshot. Claims then validate registry membership under practice/membership row locks. These are actual ActiveRecord transaction/row-lock calls, not an in-memory persistence substitute. Catalog, prior-run seals, claim receipts and lease changes commit together or roll back together. A second active workflow-center claim conflicts; after lease expiry or a build change, the prior run receives an immutable seal and a new run gets a server-generated ID and 15-minute lease.

Evidence requires the original bound claimant and archived catalog, a still-valid fixture registration, declared text evidence for the step, exact run/workflow/revision and observation time. The service creates the text artifact, computes its digest from stored content, appends the observation and idempotency receipt, and updates any deployment seal in one transaction. Same-key/same-content replay returns its original receipt; changed intent conflicts. Build/pin reads around capture are conservative: missing/dirty/changed observations are preserved only under the original revision as interrupted. Neither a persisted claim nor a reported pass authorizes execution or becomes an accepted verdict. Pin polling cannot prove a deploy did not occur between observations; an execution adapter must still monitor and halt at deploy boundaries.

The existing event-table immutability trigger protects all new history kinds. No historical ledger, image evidence or verdict is rewritten. Text content lives in the existing QA event stream, which already has public read projections: **only public-safe, independently synthetic evidence belongs here**. Protected/private evidence needs a separately reviewed storage/read-access contract before activation. Existing screenshot records require positive defect IDs; this slice does not invent one or change that table. Screenshot storage is a separate design decision.

## Server-owned registry and impact producer boundaries

`WorkflowFixtureRegistry` resolves only `workflow_fixture_verified` events with an explicit schema: practice ID, canonical workflow IDs, principal keys, named fixture keys and a verification reference. It checks the server receipt kind and issuer, revocation events, current practice and active membership, and exact scope. Client booleans/prefixes do not qualify. No verification/revocation writer or fixture creator was added; no live registry receipt was created. A missing receipt is unconfigured and denies access.

Claims also require a server-recorded `workflow_impact_published` event keyed by the exact baseline/target pair. Its payload uses the foundation manifest schema and is validated again before claiming. There is deliberately no authenticated impact-write endpoint. No such real event was created. The approved producer must reconcile this server artifact and the UI artifact by exact digest; until then, runtime delivery remains unconfigured. The archived catalog is saved by the claim transaction to preserve old-run definitions.

Before opening the gate, the integrator must approve/implement the trusted registry and impact producer. Future registration/revocation writers must participate in the same lease lock so verification cannot race their changes. Synthetic status must derive from inspected server-owned fixture provenance, not a naming convention or an unreviewed assertion. No supplied workflow/practice/actor ID becomes a grant.

The lease serializes **this workflow-center's claims only**. Legacy task transitions do not participate. Before enabling an executor, choose a single queue authority or add reviewed arbitration with legacy runs; do not claim global one-browser execution safety yet. No terminal verdict, automatic lease renewal, background worker, fixture reset or executor was added.

## Native validation and remaining boundaries

Run from `apps/api` against an existing local PostgreSQL installation:

```sh
bin/verify-qa-workflow-center
```

The verifier requires loopback PostgreSQL or a private Unix socket owned by the current OS user. It creates a uniquely named scratch database, loads the tracked schema, verifies test metadata and pending migrations, runs only these QA checks, then removes only its generated database. It does not create database credentials, change authentication or touch an existing application database. Run heavy commands through the repository resource wrapper.

Validated on native Ruby **3.4.10**, Rails **8.1.3.1**, PostgreSQL **18.6**, using the exact locked gems. The task-owned container had no network, ports or host mounts; PostgreSQL used peer authentication on a private Unix socket, rejected host authentication and listened on no TCP address. Source was the tracked API at `4a18ea50adc6cb51c07fd025562e3dfe3a23d3c1` plus this isolated patch.

- Pure catalog/evidence/claim policy: **24 tests, 102 assertions**, zero failures/errors/skips.
- Real Rails service and HTTP boundary tests: **10 tests, 61 assertions**, zero failures/errors/skips. Includes closed endpoint denial, invalid credential denial, rollback after artifact insertion, identical/changed retries, immutable-history trigger enforcement, expiry, deployment/pin interruption and registry/principal revocation.
- PostgreSQL runner uses two distinct backend PIDs and real bound Office-token principals under the database's single platform owner. It verifies exclusive claims, concurrent idempotent replay and exclusive expired-lease takeover with immutable seals.
- Lock probes confirm actual blocking via `pg_blocking_pids`, then release and assert results: pin row, existing user-to-bindings path, token revocation during wait and membership removal during wait. An independently mismatched confirmed pin seals original-pin evidence without an accepted verdict.
- Test-only method substitution retains actual Office identity checks; the shipped gate remains permanently closed. Queries used for race assertions bypass the calling thread's query cache so committed results from other connections are observed.

These checks do not establish execution safety across legacy queues, a future registry producer, a full browser journey, protected evidence storage or live activation. Producer writes must share the lease lock before activation. The real Muse catalog, exact release mapping and producer/activation decisions remain absent. No ledger import, historical verdict rewrite, runtime grant, new credential or publication occurred.

The two new route entries were added to the architecture route contract using native Rails route output. The pre-existing contract omits the older QA routes; broad contract regeneration is outside this patch. No broad backend/browser audit was run.

Native contention exposed a practice-row/audit-FK lock inversion during membership removal. The registry now uses `FOR NO KEY UPDATE` for the practice, retaining deletion exclusion while allowing audit FK key-share locks, and requires active membership. The removal-contention and inactive-membership denial checks pass. No global lock order or existing membership writer was changed.

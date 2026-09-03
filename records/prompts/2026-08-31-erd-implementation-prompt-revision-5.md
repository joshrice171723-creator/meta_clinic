---
type: implementation-prompt
status: replacement-pass-awaiting-erd-amendments
updated: 2026-08-31
---
# ERD Implementation Prompt

Home: [[00 Home]] · Target: [[Target-State Clinic ERD]] · Review: [[Multi-Clinic ERD Adversarial Review]] · Ownership: [[Software Architecture]] · Direction: [[Decisions#ERD-driven backend replacement]] · Tasks: [[Roadmap and Tasks]]

## How to use

**Revision 5 — 2026-08-31:** D-044 changes the next implementation pass to a **full replacement of the current backend structure using the corrected ERDs, after the founder's minor amendments**. This supersedes revisions 1–4's foundation-hardening-only scope and their requirement to stop before later pictured modules. Existing implementation is evidence to map and migrate, not the architecture the agent must keep. PaperTrail is required throughout the replacement's auditable workflows, including callback and job side effects.

This turn prepares the handoff; it does not execute the replacement. The minor ERD amendments have not yet been supplied. Confirm and record them before implementing the target. No database reset, history deletion, live integration, deployment or clinical release follows from choosing a replacement architecture.

The diagrams show selected attributes, not complete DDL. Their E/E+/P labels describe origin/current implementation, not a command to preserve old code or defer all P entities. The implementation agent must reconcile every target entity, complete the relational contract and add tenant-bound PaperTrail storage. [[Software Architecture#PaperTrail audit contract]] and [[Software Architecture#Callback-driven mutation coverage]] remain required acceptance contracts.

## Inputs to settle before structural implementation

| Input | Current state / required disposition |
| --- | --- |
| Final ERD amendments | Not supplied. Obtain the founder's additions/removals/renames/cardinality changes, or explicit confirmation that the current corrected ERDs are final. Record the approved delta and baseline; do not assume an empty change list. |
| Existing data and migration history | No disposal authorization. Default to preservation and an isolated target database; choose a tested transition strategy. Replacing source structure is not permission to reset shared databases, remove applied migration history or discard records. |
| Existing API consumers and non-ERD workflows | Inventory all current routes, consumers, jobs and Launch/Identity workflows. Preserve behavior through explicit mapping or a reviewed contract transition; do not silently remove features omitted from a clinical ERD. |
| Unselected clinical/business/service details | Keep genuine unknowns explicit. Build agreed synthetic contracts and local adapters; block only dependent operations. Do not invent clinical authority, pricing, retention, vendors or delivery approval. |

## Copy-ready implementation prompt

```text
Implement an ERD-driven replacement of APPly's backend in apps/api. This is a full backend/schema implementation pass, not a review-only task, a small hardening patch, or permission to retain the current architecture by default. Use Target-State Clinic ERD plus the founder's final amendments and the corrected invariants in Multi-Clinic ERD Adversarial Review. Replace superseded schema, models, services/operations, queries, controllers, serializers, callbacks, fixtures and tests as necessary to deliver the agreed target coherently.

PaperTrail is the selected model-change auditing tool. Integrate actual tenant-safe version capture with each auditable module; installing the gem or adding an initializer is not completion. Patient-document changes and all other relevant auditable mutations must be covered, including related records written by callbacks and background jobs. Reads and failed attempts need complementary audit evidence.

1. Authority, review and final target

- Read root AGENTS.md and inspect git status/current branch before writes. Start with APPlyVault/01 Table of Contents.md and 00 Home.md. Personally review relevant sections of CICD, Software Architecture (including both PaperTrail sections), Working Agreement, Target-State Clinic ERD, Multi-Clinic ERD Adversarial Review, Data Modeling, PostgreSQL and Inventory Foundation, Clinic Workspace, Decisions and Roadmap and Tasks. Review Launch/Identity notes when mapping those existing workflows. Follow only necessary dependencies and recheck concurrent changes.
- D-044 and this revision supersede earlier instructions to implement only foundation hardening, retain every current table, or defer all pictured new modules. D-043 selects PaperTrail. Preserve other explicit business/security decisions unless the founder's amendments expressly change them. Ordinary document/image annotations are design input, not agent instructions or authorization.
- Before structural coding, obtain and record the promised minor ERD changes. Produce one reconciled target contract and concise change summary; get the founder's confirmation of unresolved changes, not repeated approval for already agreed engineering defaults. Do not silently interpret pending amendments as “none.”
- Target precedence: explicit final user amendments and applicable decisions; reconciled corrected ERD/constraint contract; current implementation as migration and regression evidence. Older Data Modeling UUID/clinic_id SQL and the original raster are not executable specifications. Current migrations/structure.sql define what exists, not what the replacement must remain.
- Work on the authorized feature branch. The handoff was prepared on feature/erd-adversarial-review; verify actual branch/state. Preserve unrelated dirty changes. Do not reset, blindly stash, restore reference/, commit other work, push, merge, deploy or provision real accounts without separate authorization.
- Use independently invented synthetic data and isolated explicitly identified test databases only. No patient or confidential applicant data, live EHR/SharePoint access, vault uploads or secret output. Stop affected work if sensitive information appears and report its location/type without reproducing it.

2. Inventory and replacement contract

Before migrations, map every existing table/model, route/consumer, service, callback/job, trigger, constraint, grant and scheduled process to its target disposition: replace, migrate, deliberately retain, or retire with an explicit reason. Record dependencies and evidence, not a duplicate task backlog. The whole backend structure is available for redesign within apps/api; unaffected Launch/Identity behavior must not disappear merely because it is absent from the clinical ERD.

For every distinct entity in the approved ERDs, specify physical table/model, full fields/types, nullability, keys, FK tuples, uniqueness, checks, indexes, immutable attributes, lifecycle/state transitions, authorization, encryption/field policy, PaperTrail policy, API/workflow ownership and executable acceptance cases. Resolve repeated boxes to one entity. E/E+/P labels are provenance, not scope gates. Include required support/junction/outbox/audit/version tables missing from the diagram's selected attributes; explain justified additions. Exclude the unreadable/duplicate stock table in the original image.

Provide both old-to-new and ERD-to-implementation coverage. Do not stop at creating tables or generic CRUD scaffolding. Build the approved validations, transactional workflows, query boundaries, serializers and endpoints. Do not expose update/delete merely because a model exists.

3. Implementation sequence and completion scope

Execute the agreed target in dependency-ordered, reviewable stages:
A. Final amendments, complete schema/API/audit contract, migration strategy and synthetic evidence plan.
B. Tenancy/identity/authorization, foundational catalogs, PaperTrail storage/context and complementary audit interfaces.
C. Facilities/clinicians/settings; patients/appointments/encounters/clinical history; inventory; documents/addresses/communications; patient billing/coverage, according to the approved target.
D. Existing workflow migration, API consumer compatibility, removal of superseded paths and final schema regeneration.
E. Full integration/adversarial tests, fresh-build/transition/restore rehearsals and implementation report.

These are stages of one replacement pass, not optional later features requiring automatic re-selection. Continue through the entire agreed target while safe and authorized; do not stop after foundation tests. If a real missing decision blocks a dependent workflow, name it, keep that path unavailable and continue independent agreed work. Never report the replacement complete with an unimplemented required module, an audit TODO, or an unresolved transition.

Keep Rails/PostgreSQL and the independent apps/web boundary unless explicitly amended. Use clear domain-owned Rails layers; structure may change to fit the target. Preserve browser/server authority separation, same-origin transport, session/CSRF/Origin protections, 12-hour absolute sessions, protected no-store responses and packaged clinic denial. Existing frontend example board data is not clinical source data. No UI redesign is included; necessary API consumer/type/test changes must be coordinated and limited to compatibility.

4. Tenancy, identities, facilities and authorization

- Practice/practice_id is the non-null clinical custody boundary; optional organizations are business grouping only. Keep bigint identity conventions unless the final amendments select otherwise. One developer-assigned clinic membership per login; portal-only users may have none. No clinic picker/self-assignment, global patient merge, organization chart grants or directory-derived authority.
- Enforce tenant-qualified FKs with referenced composite unique keys. Every patient-owned row has an independent non-null (practice_id, patient_id) FK. An optional encounter adds (practice_id, patient_id, encounter_id), never replaces the patient FK. Define all nullable tuple patterns; reject cross-practice and same-practice wrong-patient links in the database.
- Separate physical sites/rooms from practice departments and stock locations/bins. Room references bind (practice_id, site_id, room_id), plus an independent site FK and room-requires-site check. Catalog codes have the agreed scope; departments may span sites, clinicians may have multiple same-practice assignments, and credential evidence is not a permission grant.
- Implement the approved versioned RBAC model with immutable role versions/permission sets, explicit practice/site grant scope, null-aware unique grant identity, append-only lifecycle events, grantor ceilings and no self-elevation. Map existing capabilities to the new permissions. At cutover there must be one effective evaluator, not old OR new authorization or a forgotten bypass.
- Server-authenticated identity supplies actor/tenant context. Posted IDs, caller-set headers or PostgreSQL settings are not independent proof of identity. Define and test trusted identity/runtime grants/RLS enforcement at its actual boundary; no owner-only test or cosmetic RLS policy proves isolation. Reauthorize active account/membership, action, scope, expiry and revocation at the documented request/transaction/release boundaries.
- Define stable attribution across record/account lifecycle changes. Restrict ordinary tenant/patient/author/parent reassignment, including before children exist. No cascading deletion of clinical/audit history. Cosmetic account preferences remain owner-scoped and allowlisted. Operational settings are typed/versioned, with explicit field-specific site-to-practice fallback, never arbitrary organization overrides.

5. Care, scheduling and immutable clinical history

- Patients remain practice-local with scoped references and encrypted sensitive fields. A booking and encounter each concern one patient. Encounters may be walk-ins; an appointment links to at most one encounter. Constrain same-practice/patient linkage and distinguish booked clinician from actual participants and their reassignment history.
- Persist timezone-aware instants and IANA display zones. Reject unresolved ambiguous local time, nonpositive intervals and overlapping active reservations for the same provider/room using a transactionally enforced rule. Half-open intervals permit adjacency. No hidden overbooking/emergency override.
- Implement note headers, append-only revisions and exact-revision signatures as the approved synthetic contract. Same-note predecessor FKs, unique revision numbers, authenticated authors, expected-version checks and serialization prevent save/sign races. Signed content is immutable; corrections append. Signature/attestation semantics require the accepted contract, not a boolean or assumed clinical validity.
- Preserve existing draft history through an explicit legacy mapping/archive disposition. Never fabricate encounters, actors, times or signatures to force old records into the new schema. A replacement implementation may change physical structure, but cannot upgrade synthetic drafts into signed clinical evidence.
- Observations carry code/system/version, source/author/time, units and explicit numeric/text/coded/missing representation. Value-bearing observations have exactly one compatible representation, finite numeric values or a missing reason. Group-only observations have an explicit group kind, no scalar/missing value and typed child components; prevent cycles and cross-patient grouping. Group separate blood-pressure components; retain immutable formula/version/source references for derived values. Conditions, allergies and medication statements are distinct. Do not invent clinical ranges, treatment rules, prescriptions, labs, administrations or dispensing workflows not included in the final target.

6. Inventory replacement

- Deliver one authoritative ledger/posting path across the approved office/pharmacy model. Preserve the behavior and evidence of existing exact units/conversions, lot/location positions, independent repeated receipts, holds/releases, counts/approvals and versioned configuration. Existing code/tables may be replaced where the approved target requires; their invariants must not regress.
- Post ledger entries and guarded balances atomically; forbid direct balance edits/negative stock. Idempotency binds key plus payload, rejects changed-payload reuse and prevents duplicate receipts/postings under concurrent connections. Keep distinct same-lot receipts distinct.
- One hold release cannot bypass another hold. Reject stale count cutoffs, stale/suspended configuration and unsupported conversions. Preserve provenance and attributable legacy exceptions. No second stock source, implicit prescription deduction, unapproved patient-use link, supplier purchase or fee formula.
- Update callbacks, database triggers and bulk paths consistently with the new audit contract; do not leave a hidden legacy write path around the replacement service.

7. Patient documents, addresses and communications

- Implement the agreed patient-document/category/version/attachment model with explicit patient ownership and optional same-patient encounter binding. Use opaque private object/version references, immutable content identity, checksum/size/type and scan status, not public URLs. Reauthorize the actual version at download; reject quarantined, pending, rejected or substituted objects.
- Define each permitted upload/new-version/metadata/category/scan/relationship/lifecycle operation. Preserve required history and legal-hold hooks; no generic deletion of immutable versions or guessed retention. Body/object storage is separate from audit metadata. Use a local synthetic adapter until an external service is explicitly selected; exercise failure and object/metadata reconciliation without claiming real storage acceptance.
- Audit permitted CRUD mutations on documents and their related/version/attachment rows even when callbacks, services, jobs or association operations cause them. Reads/downloads/exports/denials receive separate events. A parent PaperTrail version does not prove a child or external object mutation occurred or was audited.
- Keep patients, staff and suppliers distinct. Typed address owner links and immutable address versions prevent polymorphic ownership ambiguity. The nullable primary pointer must reference the same owner; duplicate street text is legal.
- Communications persist immutable recipient/purpose intent and an outbox atomically, with same-practice/patient attachment FKs. Deduplicate request/provider events and reconcile uncertain delivery before retry. No claim of exactly-once external delivery; no real email/SMS/patient communication or new vendor selection.

8. Patient billing and coverage

Implement the approved ERD's invoice/line/payment/allocation/credit/refund/coverage/claim structure and agreed synthetic workflows as part of the replacement, not an automatic deferral from the old prompt. Do not invent the still-unselected business rules.

Use bounded exact decimals, explicit currency, accepted versioned rounding/posting rules and immutable posted line snapshots. Typed source links and allocations/claims must match practice and patient. Serialize posting/allocation/reversal so concurrent requests cannot over-apply, double-credit, over-refund or mix currencies. Corrections append; do not reprice history. Provider-scoped event deduplication and reconciliation are required for any modeled external event. Use synthetic adapters and disable unagreed posting/submission operations. No card/bank credentials, real payment processing or payer submission. APPly ordered-inventory-value fees (T-14) and deferred supplier pricing (D-029/T-37) remain separate and unresolved.

9. PaperTrail and complementary audit — required from the start

Current source has paper_trail ~> 17.0 locked to 17.0.0, request_store 1.7.0, and PaperTrail.config.version_error_behavior = :exception. It has no model version tables/opt-ins yet. Inspect actual state, retain the selected tool/configuration and implement the missing coverage; do not stop at dependency verification or leave the temporary “models remain unversioned” tests as the final acceptance contract.

- For each module, create a coverage matrix: entry point -> operation/callback/job -> every mutated model/table -> tenant/actor -> allowed event -> PaperTrail or explicit bypass evidence -> transaction boundary -> test. Account for direct writes, association autosave/dependent behavior, nested callbacks, before/after-save, after-commit, jobs, bulk APIs, raw SQL and triggers. Classify every path as implemented/tested, prohibited, explicitly non-auditable with rationale, or unresolved. Unresolved required paths block completion.
- Opt in each auditable model explicitly, not a blanket ApplicationRecord hook. Cover permitted create/update/destroy/touch; append-only records generally allow audited creates and deny edits/deletes. Audit child/related targets as well as the initiating parent. Do not turn callback execution without an auditable persisted change into a successful mutation.
- Use custom tenant-bound PaperTrail storage. Prefer model-specific version tables/fixed subject type with enforceable same-practice subject references. Where hard deletion is genuinely allowed, design evidence-preserving identity/tombstone binding so a live-parent FK does not prevent the permitted operation or cascade away history. Any alternative mixed-subject binding needs equivalent database-enforced integrity tests. Keep platform/Launch evidence separate; no unscoped global versions endpoint or nullable tenant wildcard.
- Allowlist metadata such as authenticated actor, subject, event, changed-field names, operation/request/causal/job identifiers and server time. Omit object/object_changes snapshots for sensitive models by default; never log names, document/note bodies, clinical values, passwords/digests, tokens or secrets. Test actual serialization, exceptions and diagnostics. only/ignore are not redaction controls; skip/exclusions must not suppress the fact of a sensitive-field-only change. If a supplemental explicit metadata event is needed, bind and test it with the mutation.
- Derive whodunnit and actor/tenant context from authenticated server state. Distinguish initiating user from executing job/system actor, validate authority at execution, propagate correlation across nested writes and reset context on every request/job including exceptions. Never inherit another tenant's thread/request state or accept client-supplied attribution.
- Keep :exception and prove a required version-write failure rolls back its business mutation and related same-transaction changes. Test callback ordering and final persisted values. A before-validation side effect can outlive a failed parent unless the operation encloses it: either make the operation atomic or explicitly model/audit that outcome; do not assume automatic rollback.
- after_commit/job mutations run in separate transactions. Use durable intent, correlation, idempotent execution and reconciliation; their failure cannot roll back an already committed parent. Distinguish “accepted/pending” from “all side effects completed.”
- PaperTrail model callbacks do not observe delete_all/update_all/update_columns/insert_all/upserts/raw SQL or database-trigger effects automatically. Refactor relevant bypass paths into audited operations, prohibit them, or implement transactionally bound protected evidence with tests. Session revocation must remain reliable when changing its write path. Never silently exclude a callback side effect because the parent has a version.
- Specifically map current User#revoke_sessions -> member_sessions.delete_all, Practice -> initial inventory profile, PharmacyBatch#resolve_position -> lot/location creation, and Launch::Paperwork digest/review/sign operations. Their replacement implementations may differ; preserve intended security/workflow behavior and audit every auditable resulting change.
- PaperTrail mutation history supplements immutable note revisions/signatures, inventory ledgers and posted financial history; it does not replace those sources of truth. Protect version/event tables from ordinary update/delete/truncate, avoid recursive audit of audit bookkeeping, and disable automatic pruning and generic reify/restore endpoints.
- Add explicit operation events, resource manifests and delivery receipts for reads/searches/downloads/exports, denials, rollback and external object outcomes. Do not use after_find as an access audit. Required failed-attempt evidence must survive the failed business transaction; a same-transaction outbox/PaperTrail row cannot do that.
- Implement and test a separate durable audit interface/local synthetic adapter, including outages and rollback survival. Independently controlled production sink, trusted identity, retention/recovery and privileged-admin evidence need their actual accepted service/operating design. Do not claim the local adapter is owner-proof or operationally approved. Required audit unavailability must prevent unauthorized release or false success; deferred receipt delivery is not proof of independent capture.

10. Data/schema transition and retirement

Produce and follow an explicit replacement strategy, distinguishing:
- Fresh isolated target database: build from migrations; generate structure.sql through Rails/PostgreSQL, never hand-edit it.
- Existing installations: preserve current data, encryption keys/ciphertext, identifiers or explicit ID mappings, units, ledger totals, history, actor provenance and audit evidence through a tested forward migration or separate-database importer/cutover.
- Existing applied migrations: do not edit/squash/remove shared migration history without an explicit reviewed baseline/transition decision. A new target baseline is acceptable only with a clear existing-installation path; “replace structure” alone is not permission to delete it.
- Disposable data: reset only an exact, separately confirmed disposable target; never infer development/staging data is disposable. Do not run unqualified db:drop, db:reset or broad cleanup.

Preflight legacy incompatibilities and stop with non-sensitive diagnostics rather than deleting, reassigning or inventing records. Define bounded locks/batches, restartability, partial-failure handling and old/new code compatibility. Rehearse row/key/history/count/balance parity and independent restore. A failed migration cannot be recovered merely by redeploying an old image; document the actual rollback/forward-fix and restore boundary.

Remove obsolete active models/routes/services/callbacks/SQL only after their intended successors and regression evidence exist. Preserve required legacy history in the selected disposition. End with one schema and one authoritative write path/evaluator, not permanent dual-write or old OR new access. Do not retain unused duplicate domain structures just to avoid replacing them. Cleanup targets must be exact and within the approved mapping.

11. API and operational compatibility

Inventory every current API consumer and specify retained, adapted and intentionally retired contracts. Update serializers, apps/web/src/api/contracts.ts, necessary consumers, route-contract fixtures and integration tests together for an approved breaking change. Preserve Launch account/paperwork/training behavior and ownership or explicitly resolve its replacement; no silent feature deletion. Preserve named synthetic personas, no automatic provisioning on navigation, cosmetic preference isolation, login/logout/session expiry, CSRF and foreign-Origin denial.

Do not couple UI demonstration rows to patient-directory records or move business authority into the browser. Update local setup, CI/schema fixtures and verification tooling as needed for the new source; no hosted change, deployment, credential rotation or service purchase is authorized by this implementation prompt.

12. Adversarial acceptance and handoff

For each invariant, state failure trigger, expected safe result, test, actual outcome and recovery behavior. Cover at least:
- Two synthetic practices and multiple patients: forged tenant/actor, wrong-practice references, same-practice wrong patient, null-encounter FK bypass, wrong-site room and unauthorized history/read access.
- Duplicate/null-scope grants, role-version escalation, self-elevation, revoked/expired authority, disabled sessions and connection/thread/job context reuse. Prove intended runtime-role behavior, not only schema-owner success.
- Walk-ins, duplicate booking links, overlap versus adjacency, ambiguous time, invalid observations/units, stale note revision, save/sign races, signed/history mutation attempts and legacy provenance preservation.
- Concurrent inventory posting/receipt retries, changed-payload reuse, negative balance, repeated lot receipts, overlapping holds, stale count/profile and rollback parity of ledger/balance/evidence.
- Foreign primary address, quarantined/substituted document, immutable object versions, wrong-patient attachment, object-store failure/reconciliation, duplicate/out-of-order/uncertain message or financial events and concurrent allocations/refunds.
- Audited direct and parent->callback->child changes; allowed create/update/destroy/touch; abort/validation failure; later callback writes; version insertion failure; business rollback; after-commit/job failure; bulk/SQL/trigger bypasses; sensitive-field-only changes with no value leakage; cross-tenant context reuse; retries with exact per-record event counts. Assert final state AND evidence, not just “a version exists.”
- Complementary read/denial/rollback evidence, audit outages and controlled release; restore with database/object/key/audit consistency; migration/consumer compatibility and retirement of old write paths.

Run true race cases with independent connections and synchronization barriers, not sequential calls labeled concurrency. Inspect current scripts before execution: CICD, apps/api/test/test_helper.rb, bin/postgres, apps/api/bin/verify-postgres and root bin/verify-web. Use verified isolated targets, no inherited hosted connection settings, no secret output, and exact safe cleanup.

Run applicable Rails tests, zeitwerk:check, RuboCop, Brakeman, Bundler Audit and PostgreSQL fresh/transition/concurrency/restore/runtime-role checks. Changed shared contracts require frontend tests, format checks, build/typecheck, current security checks and root bin/verify-web; browser checks when behavior changes. Do not duplicate historical test counts as new results. Replace obsolete architecture assertions with target assertions; preserve behavioral/security tests or explain their legitimate successors.

Deliver:
1. Final approved ERD delta, complete schema contract, old-to-new and ERD-to-code coverage, and updated diagrams derived from the implemented schema.
2. Working replacement migrations/schema/models/workflows/API and PaperTrail/complementary-audit integration with no unexplained target omissions.
3. Executable adverse-path tests and actual check results, including audit failure and data transition/restore evidence.
4. Migration/cutover/rollback runbook, compatible consumer contracts and exact retired-path list.
5. Accurate current-state documentation, canonical task updates only where evidence supports them, dated Progress Log and final reviewed diff preserving unrelated changes.
6. Clear remaining decisions, unavailable dependent paths and release limits. If any required implementation is blocked or unverified, report the pass as incomplete rather than “done.”

Do not claim HIPAA compliance, clinical signature validity, professional gate completion, production readiness or real-data authority. L-05 and applicable clinical/confidential/operational gates remain open until their actual evidence is accepted. Complete the agreed synthetic backend replacement; deployment is a separate authorization.
```

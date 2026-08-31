---
type: architecture
status: implemented-frontend-api-split
updated: 2026-08-31
---
# Software Architecture

Home: [[00 Home]] · Direction: [[Decisions]] · Delivery: [[CICD]] · Database: [[PostgreSQL and Inventory Foundation]] · Status: [[Roadmap and Tasks]]

## Direction and scope

D-033/U-23 supersede the Rails-rendered-UI aspect of D-024/D-025/D-032: **one repository, independent frontend and Rails API**. D-032's launch/care/inventory/staff/identity domain organization remains. T-40 owns implementation status; this note owns the software-organization contract, not another backlog.

This does not merge consultancy, software-company or clinic authority. UI/API separation is not complete security isolation or a clinical release. Production clinic denial, one developer-assigned clinic per login, synthetic-only work, demo-signing limits and professional/real-data gates remain. Supplier pricing stays deferred under D-029/T-37.

### Planned backend replacement

**D-044 — 2026-08-31:** the founder now wants a full backend-structure replacement based on [[Target-State Clinic ERD]], after minor amendments, with PaperTrail integrated into all relevant auditable mutations. [[ERD Implementation Prompt]] revision 5 supersedes the prior hardening-only handoff. Existing schema/models/services/controllers/callbacks may be replaced; their business/security contracts, data and history require explicit mapping and tested transition. This is not an instruction to preserve old physical structure or defer every proposed ERD entity.

The amendments are still pending and this is prompt preparation, not runtime implementation. The current-source descriptions below remain observations of the existing app. Keep the separate frontend/API boundary, compatible consumer contracts and non-ERD Launch/Identity behavior unless explicitly transitioned. No database reset, applied-history rewrite, service selection or deployment is authorized. Implement the approved target in reviewable stages, with auditing in each stage rather than postponed to a later rollout.

## Repository responsibilities

```text
APPly/
  README.md                    Startup and navigation
  AGENTS.md                    TOC-routed relevant review and safety rules
  APPlyVault/                  Canonical requirements, evidence, decisions and tasks
  apps/web/                    Independent React/TypeScript browser application
    src/features/              Launch, identity, clinic and inventory UI
    src/api/                   Same-origin HTTP client and response types
    src/shared/                Neutral controls, loading and errors
    public/                    Brand assets and shared/experience styles
    test/                      Frontend transport and presentation tests
  apps/api/                    Rails JSON backend and its Docker context
    app/                       Controllers, serializers, queries, services and models
    config/                    Session, security, runtime and API routes
    db/                        Canonical migrations, structure and runtime grants
    test/                      Domain units, HTTP journeys and architecture contracts
    bin/                       API, PostgreSQL and migration-verification commands
  bin/                         Two-process local startup and synthetic HTTP rehearsal
  ops/aws/                     Infrastructure, paired release and recovery tools
  .github/workflows/           Frontend/API CI and prepared delivery workflows
  site/                        Historical Sites metadata/assets only
```

No compatibility symlink or active app remains at `apps/apply` or `site/backend`. Rails' local credential bind path is `apps/api/tmp/postgres-password`; the existing persistent PostgreSQL volume, storage identity and credential file were preserved. Historical Sites metadata/caches and dormant generated Dependabot configuration remain untouched.

`apps/api/db/structure.sql` is the only application schema, derived from the existing migrations. The founder removed the retired `reference/` folder on 2026-08-31 after its useful behavior was mapped into the app; no application, CI or release script depends on it. Its prior SQL and illustrative SQL in [[Data Modeling]] are not executable alternatives. Table/database identities, session cookie, encryption derivation and `Backend::Application` are unchanged. Frontend dependencies and build output never enter the API image, and backend/database credentials never enter the web image.

Root `.gitignore` provides shared artifact/secret-file exclusions; app-specific rules remain. Source, lockfiles, schema/migrations and vault configuration are deliberately tracked. Ignore rules are not access controls or removal of already tracked data.

## Domain ownership

| Domain | Frontend responsibility | Backend responsibility |
| --- | --- | --- |
| Launch | Selling copy, Contact, portal, paperwork, training and inbox screens | `Launch` models/operations/queries and `Launch::Api` controllers; ownership, signing and availability rules |
| Care | Fictional patient directory and draft-entry UI | `Clinic::Care` models/controllers; clinic-scoped encrypted records and append-only drafts |
| Inventory | Office/pharmacy catalog, receipt, movement, hold/count and configuration forms | `Clinic::Inventory` models/services/queries/serializers; permissions, exact units, transactions, ledger/history |
| Staff | Fictional staff directory UI | `Clinic::Staff` records/controllers; no login grants |
| Identity/tenancy | Login forms, personal Settings and authorized navigation | `User`, `MemberSession`, `Identity::Preference`, `Identity::Api`, `Clinic::Practice` and `Clinic::Membership` |
| Shared infrastructure | Typed HTTP client and neutral controls | `ApplicationController`, authentication concern and environment policies |
| External integrations | Explicit public-reference search form | `Integrations::Fda::NdcDirectory` transport; authorized `NdcCatalog` import with zero stock |
| Synthetic fixtures | Explicit development shortcut | Guarded `Development` factories; no automatic account creation through navigation |

Use frontend feature folders and Rails layer-then-domain namespaces. Do not create a separate app, database, engine or generic utility collection for each feature.

## Dependency rules

1. **The browser owns presentation, never authority.** Capability/signing flags describe available controls. Every read/write still rechecks active account, ownership, clinic and action permissions on the server.
2. **Controllers translate HTTP.** Read scoped inputs and invoke owned operations/queries; return explicit JSON shapes. Do not call sibling controllers or move domain logic into UI handlers.
3. **Operations own workflows.** Keep transactional receiving, shared ledger, locks, retry keys and immutable history in Rails. No direct browser balance update, dose inference or duplicated stock calculation.
4. **Queries own complex reads.** Catalog filtering/totals/pagination and bounded batch/count/receipt/history composition remain server-side. Serialize only selected fields; exact quantities cross HTTP as decimal strings.
5. **Transport remains same-origin.** Development Vite proxies `/api` to private Rails without changing Host/Origin. The deployed trusted nginx edge routes `/api/*` and `/up` to Rails and page/assets to the web container. Do not add broad CORS or store credentials in browser persistence.
6. **Retain session/CSRF middleware.** `ApplicationController < ActionController::Base` deliberately retains cookies, CSRF and Origin checks despite JSON-only transport. Do not switch blindly to a minimal API stack.
7. **No unsafe browser persistence or replay.** Records/tokens remain in memory, content is rendered as text, protected state is discarded on account changes/logout and history restoration reauthorizes. Failed mutations are not automatically retried; inventory retry keys persist only for the current form until acknowledgement/navigation. D-039 replaces the earlier cosmetic browser-storage exception: appearance is account-owned server state. The frontend no longer reads/writes the old key, and does not import a shared-browser choice into an account.
8. **Adapters do not grant business authority.** FDA requests retain a fixed host, explicit bounded public queries and account/clinic-bound expiring import references. No new supplier integration, patient data, orders or spending.
9. **Keep shared code neutral.** Launch, clinic and identity controllers share transport without inheriting another product. Do not create catch-all `utils`, `common` or `manager` folders.

These boundaries and tests are not complete tenant isolation. Trusted identity/RLS, MFA, independent read audit, operational acceptance and clinical validation remain separately gated.

## Shared workflows and presentation

Browser URLs remain `/`, `/contact`, `/login`, `/portal`, `/paperwork`, `/training`, `/inquiries` and `/clinic/*`. Application-page rendering, native ERB controllers/views and CSS ownership moved out of Rails. The D-033 split preserved the existing green visual language and product copy; that split was not a redesign.

D-036/T-41 subsequently added three clinic palettes and system/light/dark modes. D-039/T-43 move controls to `src/features/identity/Settings.tsx`, initially routed at `/clinic/settings`; `src/features/clinic/Appearance.tsx` owns account-bound loaded theme state, and `appearancePreferences.ts` owns tokens/system appearance. Clinic-scoped CSS preserves public shared CSS and launch styling. [[Clinic Workspace Design]] distinguishes these changes from proposed intake/clinician layouts.

`Identity::Preference` / `identity_preferences` owns allowlisted palette/mode/revision with one unique user foreign key. `Identity::Api::SettingsController` exposes authenticated GET/PATCH/PUT `/api/settings`, never user-ID-targeted routes. Expected-user mismatch and stale revisions fail; user-row locking serializes concurrent first saves. CSRF/session checks remain; no other user fields or clinic permissions are writable. Frontend response ownership must be accepted before success is shown. This account API contains no clinical records and does not bypass production clinic route denial. New settings are loaded on page entry, not pushed live to other tabs. Future settings require separate scoped fields and acceptance, not arbitrary JSON storage.

D-041/T-44 place the Overview example-shift presentation in `TrackingBoardPage.tsx` with isolated, independently invented `trackingBoardData.ts` examples. These are frontend demonstration data, not API contracts or directory-derived visits. `Operations.tsx` consumes existing capability-filtered overview data at `/clinic/operations`. `ClinicFrame.tsx` owns transient navigation collapse/drawer focus behavior; `Appearance.tsx` imports the base theme, frame and board styles in that order. No browser persistence or backend workflow is introduced. Durable visit/triage/membership work needs its own reviewed producer/consumer contract under T-13.

Existing launch JSON endpoints remain, with an authenticated paperwork text-receipt endpoint. Clinic JSON endpoints live under `/api/clinic`. `apps/web/src/api/contracts.ts` and `apps/api/test/architecture/routes_contract.json` define the browser response types and API route contract. Change producers/consumers and their tests together; do not import Ruby/backend code into the web app.

Each app has its own dependency lockfile and Docker context. The web image contains only static assets and nginx, runs unprivileged and receives no application secrets. Rails retains backend secrets and private PostgreSQL access. Packaged clinic UI and API both return 404; staging/production use Rails production mode. Protected frontend shells contain no record data.

The browser transport shares one in-flight CSRF bootstrap and waits for it before parallel session/resource reads. This prevents initial cookie snapshots from racing the CSRF initialization after login. Session rotation invalidates both the cached token and older bootstrap responses; failed mutations are never automatically replayed. The integration checks cover named-client settings persistence/isolation alongside admin and disabled-account denial.

## Adding or changing a feature

For model-change auditing, use the selected [[Software Architecture#PaperTrail audit contract|PaperTrail contract]] below. It complements, not replaces, the separate access/security audit design.

- Select a reviewable chunk from the accepted scope and apply [[Working Agreement#Failure-first planning and review]]. For D-044, stages come from [[ERD Implementation Prompt]] and continue through the agreed replacement, not just existing-foundation hardening. Name how a wrong identity, stale version, repeated write or partial failure crosses the boundary, its detection and safe recovery. The broader historical [[Data Modeling]] catalog is not automatically additional scope.
- Pick the product domain. Add UI under `apps/web/src/features`, HTTP/query/operation/record behavior under the matching Rails domain.
- Update response types/serializers and test success, ownership, denial, validation and retries. API query objects are not independent authorization gates.
- Keep view state local. Do not persist records, signing content, passwords or CSRF in local/session storage.
- Run each app's checks and root `bin/verify-web` for boundary changes. Shared identity/database changes also require the existing migration/concurrency/restore rehearsal.
- Do not add infrastructure, external connections or deployment authority merely because the apps build separately.

## PaperTrail audit contract

**D-043 — selected 2026-08-31:** use the Ruby `paper_trail` gem for application model-change auditing. This is not the similarly named hosted logging service. The API now depends on PaperTrail `~> 17.0`, locked to `17.0.0`; Bundler also adds `request_store` `1.7.0`. Existing dependency versions remain unchanged. The initializer sets `PaperTrail.config.version_error_behavior = :exception`; version-record failures must not be quietly logged as successful writes. The [17.0 upstream configuration guide](https://github.com/paper-trail-gem/paper_trail/blob/v17.0.0/README.md#6e-error-handling) documents this option.

**Current integration is dependency/configuration only.** No version table, migration, model opt-in, audit endpoint or historical backfill is added. The gem loads, but no application model has `has_paper_trail`; no records are being audited by it yet. This avoids introducing unreviewed record snapshots while the tenant/attribute contract is still being implemented. Existing immutable notes, signed-note proposals and inventory ledger/history remain their own authoritative records.

For each auditable module in the D-044 replacement (or another explicitly selected audit increment), the implementation contract is:

- Opt in each auditable model explicitly, not `ApplicationRecord` or all models indiscriminately. Include creation of append-only records when that is an auditable event; their update/destroy prohibitions stay intact. Use custom tenant-owned version storage for clinic records with non-null `practice_id`, bigint identities and indexed tenant/item/time queries; keep launch/platform history separate. Prefer model-specific version tables with a fixed item type and enforceable same-practice item FK where the retained-parent lifecycle allows it. If a mixed-subject version table is necessary, document and test an equally strong database binding; a polymorphic `item_type/item_id` alone is not a tenant FK, permission check or patient ownership guarantee.
- Keep version metadata allowlisted and server-derived: actor identity, request correlation, event, subject and changed-field names. No raw cookies, session tokens, secrets, credentials, names, note bodies or clinical value snapshots. The safe initial design omits `object` and `object_changes` storage for sensitive domains; any later value-history needs its own encrypted payload/field policy and disclosure tests. `only`/`ignore` control version creation, not confidentiality; upstream provides `skip` for excluding values, but skipped-only changes may need explicit metadata events to avoid audit gaps. [Upstream attribute behavior](https://github.com/paper-trail-gem/paper_trail/blob/v17.0.0/README.md#2c-choosing-attributes-to-monitor).
- Populate `whodunnit` and request metadata from authenticated server context, not submitted IDs; define attributable job/system activity and reset context between requests/jobs. Snapshot keys are historical evidence, not new clinical authority. Reauthorize history queries and never expose an unscoped generic versions endpoint.
- Test successful create/update/destroy capture as applicable, then injected version-write failures and business-transaction rollback. Preserve `:exception`; verify the actual mutation rolls back rather than treating this initializer as proof. Reject or separately capture callback-bypassing writes such as direct SQL/bulk updates. Protect version rows from ordinary update/delete/truncate and automatic pruning. Do not enable generic reification/restore endpoints or use PaperTrail to rewrite signed notes or stock history.
- PaperTrail change versions do not cover reads, searches, exports, downloads, denied/rolled-back attempts or privileged database actions. Retain the separate operation events/resource manifests/delivery receipts in [[Target-State Clinic ERD]] and independently durable failure evidence in [[Data Modeling#Auditing design]]. Version tables in the business transaction cannot supply independent rollback evidence. T-34.5, identity/RLS, retention/recovery and clinical/security release gates stay open.

Failure hypothesis for the dependency increment: simply installing an audit gem could be misreported as complete auditing, silently capture sensitive fields through broad model opt-in, or allow unaudited updates when version creation fails. Its dependency/boot tests check loading, the exception setting and no implicit sensitive-model opt-in. The D-044 replacement must replace the temporary unversioned-model assertions with actual tenant/capture/bypass/rollback/concurrency acceptance; passing the old checks is not completed auditing.

### Callback-driven mutation coverage

**D-043 clarification — 2026-08-31:** PaperTrail must cover auditable persisted changes to patient documents and other relevant records, including changes caused by callbacks, services and background jobs. Coverage is about the **record changed**, not merely invoking or tracing a callback method. Tracking a parent does not automatically track its children or other records it writes. A callback that performs no auditable mutation is not itself a successful CRUD event.

For each implemented module, inventory every write path and give it a tested disposition: PaperTrail capture, explicit equivalent protected mutation evidence for a bypass path, prohibited operation, or documented non-auditable exclusion. Explicit model opt-in is a wiring method, **not permission to silently omit an auditable model**. No module's audit coverage is complete while a relevant path is unclassified or untested.

| Required coverage | What the implementing agent must account for |
| --- | --- |
| Patient documents and attachments, when implemented | Creation, new immutable object/version reference, metadata/category/scan-state changes, attachment relationships and permitted lifecycle transitions; audit authorized removal attempts/outcomes without enabling prohibited deletion or logging document contents |
| Patient records and clinical history | Registration/corrections and permitted creates of notes/revisions/signatures; existing immutable rows remain immutable. Rejected changes are denied-attempt evidence, not successful PaperTrail updates |
| Access and identity | Membership/capability/grant changes, account activation/disable, credential-change events and resulting session revocation; record no credential, password digest or raw session token |
| Inventory and operational configuration | Catalog/lot/location/profile changes and auditable receipt/ledger/hold/release/count events; preserve existing posting/history authority and avoid double posting or recursive audit of audit rows |
| Launch paperwork and other approved workflows | Assignment/review/completion and permitted changes, with launch/account ownership separate from clinic/patient ownership. Launch paperwork is not a patient document |
| Reads and external object actions | Reads/searches/downloads/exports/denials need explicit access events; object-store writes or deletion need their own actual outcome evidence correlated with metadata transitions. PaperTrail callbacks alone do not cover them |

Implementation and acceptance rules:

1. For mutable audited models, cover `create`, `update`, `destroy` and `touch` where allowed. PaperTrail installs model lifecycle callbacks; a touch normally appears as an update event. Inspect ordering against existing callbacks and capture the actual persisted change, including normalized/derived attributes and changes to related records. Do not manufacture successful destroy events for records whose deletion is forbidden. [PaperTrail lifecycle and ordering](https://github.com/paper-trail-gem/paper_trail/blob/v17.0.0/README.md#2a-choosing-lifecycle-events-to-monitor).
2. Audit a callback's target models as well as its initiating model. Preserve authenticated actor, correct tenant, root operation/request correlation and a server-defined origin across nested writes. In jobs, separately identify the initiating actor and executing worker; validate execution authority and clear context before the next job. Never trust a client-supplied actor or leak context between requests/tenants.
3. Same-transaction business changes and their required version rows commit or roll back together. A mutation from `after_commit` or a later job is a new transaction: audit that work separately and correlate it to a durable intent. Failure there cannot retroactively roll back an already committed parent. Define retry/reconciliation and do not report all side effects completed merely because the parent committed.
4. Enumerate direct SQL and callback-bypassing APIs, including `delete_all`, `update_all`, `update_columns`, bulk inserts/upserts and trigger-maintained changes. Route a relevant path through an audited operation or supply transactionally bound protected evidence; do not pretend enabling PaperTrail on a model covers these calls. Preserve security semantics when refactoring, especially session revocation. [Rails callback bypasses](https://guides.rubyonrails.org/active_record_callbacks.html#skipping-callbacks).
5. Excluding sensitive values must not suppress the fact of their change. For example, a document-body-only change must leave allowed metadata evidence even when no body snapshot is stored. Test the actual `skip`/`only`/`ignore` and payload configuration; no sensitive value may reach versions, metadata, exceptions or diagnostics. Do not recursively version PaperTrail versions or audit delivery bookkeeping.
6. Required tests include parent → callback → child changes; allowed create/update/destroy/touch; a later callback changing fields; aborted validation/destroy; root rollback; version-write failure; after-commit/job failure; repeated delivery; same-thread cross-tenant context reuse; sensitive-field-only change; and each discovered bypass. Assert per-record event identity/counts and actual final state, not only that a version exists. A repeated no-op must not masquerade as another committed mutation; separate attempt evidence may still be required.

**Current source observations, not completed coverage:** [User](../../apps/api/app/models/user.rb) uses `after_update :revoke_sessions` followed by `member_sessions.delete_all`, which skips session model callbacks. [Clinic::Practice](../../apps/api/app/models/clinic/practice.rb) creates an inventory profile in `after_create`. [Clinic::Inventory::PharmacyBatch](../../apps/api/app/models/clinic/inventory/pharmacy_batch.rb) resolves/creates lot and location records in `before_validation`; those records and the parent outcome need separate accounting, including any persistence when parent validation fails. [Launch::Paperwork](../../apps/api/app/models/launch/paperwork.rb) computes a digest before validation and persists review/signing transitions through explicit methods. These are concrete acceptance paths, not newly introduced defects or proof of live audit capture. No patient-document model/table exists yet; the ERD's document module remains proposed. No runtime wiring or new module is added by this clarification.

## First increment and continuation

D-032/T-39 completed the earlier domain extraction and source relocation, preserving existing workflows and data. Its recorded 83-test/native-HTML results remain historical evidence; D-033 intentionally supersedes those rendering/route-boundary assertions with separate frontend and API checks.

During T-40, a new HTTP verifier mistakenly invoked Rails' development cleanup across both its scratch database and the existing `apply_test`. The founder confirmed that database was disposable and authorized recreation. It was recreated from current migrations; cleanup now uses explicit generated-name PostgreSQL commands, companion-test isolation and an unchanged-default-database identity check. The original issue and resolution remain in [[Progress Log]]; no original test-data recovery is claimed. Development/hosted databases were not reset.

T-38 still owns production PostgreSQL cutover. Staging's 2026-08-31 authorized activation installed the paired API/web release and PostgreSQL, verified recovery and configured GitHub OIDC. Each app remains on its internal network; service post-start hooks refresh validated private-IP nginx upstreams because internal-only Docker networks do not publish host ports. The frontend still receives no app credentials. Production was not changed; no professional/clinical gate is completed by that staging release.

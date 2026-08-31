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

- Select a bounded chunk from [[Roadmap and Tasks#Five-step implementation plan]] and apply [[Working Agreement#Failure-first planning and review]]. Name how a wrong identity, stale version, repeated write or partial failure crosses this feature's boundary, how it is detected, and the safe recovery path before coding. The broader clinical schema remains a proposal, not the implementation backlog.
- Pick the product domain. Add UI under `apps/web/src/features`, HTTP/query/operation/record behavior under the matching Rails domain.
- Update response types/serializers and test success, ownership, denial, validation and retries. API query objects are not independent authorization gates.
- Keep view state local. Do not persist records, signing content, passwords or CSRF in local/session storage.
- Run each app's checks and root `bin/verify-web` for boundary changes. Shared identity/database changes also require the existing migration/concurrency/restore rehearsal.
- Do not add infrastructure, external connections or deployment authority merely because the apps build separately.

## First increment and continuation

D-032/T-39 completed the earlier domain extraction and source relocation, preserving existing workflows and data. Its recorded 83-test/native-HTML results remain historical evidence; D-033 intentionally supersedes those rendering/route-boundary assertions with separate frontend and API checks.

During T-40, a new HTTP verifier mistakenly invoked Rails' development cleanup across both its scratch database and the existing `apply_test`. The founder confirmed that database was disposable and authorized recreation. It was recreated from current migrations; cleanup now uses explicit generated-name PostgreSQL commands, companion-test isolation and an unchanged-default-database identity check. The original issue and resolution remain in [[Progress Log]]; no original test-data recovery is claimed. Development/hosted databases were not reset.

T-38 still owns production PostgreSQL cutover. Staging's 2026-08-31 authorized activation installed the paired API/web release and PostgreSQL, verified recovery and configured GitHub OIDC. Each app remains on its internal network; service post-start hooks refresh validated private-IP nginx upstreams because internal-only Docker networks do not publish host ports. The frontend still receives no app credentials. Production was not changed; no professional/clinical gate is completed by that staging release.

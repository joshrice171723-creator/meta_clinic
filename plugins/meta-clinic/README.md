# Meta Clinic for Codex

A local Codex plugin for reading and proposing changes to a synthetic Meta Clinic development instance. The Rails API remains authoritative for identity, clinic scope, permissions, validation and persistence. The plugin adds a native Codex panel and MCP tools; it does not add a second clinical data model.

## Local setup

Prerequisites: Node.js 24+, the repository's Ruby/PostgreSQL development dependencies, and the Codex CLI.

From this directory in PowerShell:

```powershell
npm ci
npm run build
pwsh ./scripts/runtime.ps1 start
npm run install:codex
```

The runtime helper supports `start`, `stop`, `status`, and `seed`. Use `seed` only when the isolated development database needs synthetic records. The plugin API and web app use ports 3311 and 3310; the panel uses 3320. The helper configures the separate `apply_codex_plugin_development` database. Plugin connections are restricted to loopback; hosted targets are disabled.

Open Meta Clinic in Codex and choose **Sign in to Meta Clinic**. The panel opens the local `/sign-in` page in a browser; enter your own clinic account there, never in chat. Return to the panel, which refreshes the authenticated session. The account's existing clinic membership and backend permissions determine available records and actions. The local development-account picker is disabled by default; enable it only for development work with `META_CLINIC_ENABLE_DEVELOPMENT_ACCOUNTS=1` in the plugin runtime environment. For runtime control, run `pwsh ./scripts/runtime.ps1 status` or `pwsh ./scripts/runtime.ps1 stop` from this directory.

Each local OS installation has its own plugin runtime and account session. Open panels and Codex chats using that same local installation share the session; separate OS installations do not. This is a local development integration, not customer-hosted distribution. Public hosting, remote customer authentication and deployment readiness remain pending. The full clinic application remains available separately at the local web app.

## How it works

- `server/index.mjs` registers the native MCP tools and panel resource.
- The MCP server registers eight tools, including `meta_clinic_panel` for these panel-only projections. The earlier walkthrough's seven-tool discovery is historical evidence for that earlier checkpoint.
- `server/catalog.mjs` defines 95 schema-backed operations mapped to existing Rails endpoints: 66 reads and 29 deliberate writes.
- `server/panels.mjs` builds three bounded display views—recorded vitals, rooms/encounters, and invoices/insurance history—from existing Rails reads. `meta_clinic_panel` exposes these views to the panel; it does not add clinical decisions or backend write models.
- `server/http-api.mjs` adapts four loopback `/api/v1` paths to the existing tools and Rails contracts. The generated local API description is available at `/openapi.json`.
- `server/openapi.mjs` generates that description from the supported local route schemas.
- `server/client.mjs` owns the loopback-only API session and refreshes clinic context.
- `server/service.mjs` validates operation schemas and manages five-minute, single-use change tickets. A prepared write is not saved until separately applied after review.
- `server/broker.mjs` hosts the loopback panel and serializes calls from the panel and Codex tools.
- `ui/app.tsx` and `ui/style.css` implement the panel; `tutorial/tutorial.html` is packaged as its local walkthrough.
- `CAPABILITIES.md` documents operation coverage and omissions.
- `ui/sign-in.html` provides the local browser sign-in form. Passwords are entered there and are not sent in chat.

The local compatibility routes are `POST /api/v1/appointments/schedule` (calendar search, prepare a booking, commit a reviewed change), `GET /api/v1/clinic/layout` (room and encounter list), `GET /api/v1/patients/{id}/telemetry` (recorded vitals), and `POST /api/v1/billing/claims/status` (invoice and stored insurance-history view). These loopback adapters reuse the catalog, session context, review tickets and Rails permissions; they do not create a separate service backend.

The clinical views are projections of existing synthetic records. Vitals are displayed as recorded, without normal/abnormal labeling or triage recommendations. Room cards do not infer occupancy, cleaning or physical availability and cannot edit a floor plan. Insurance history is local, manual or simulated; it is not live payer verification or a payment status feed.

## Use it

Version 0.2.0 retains and extends the workspace around the clinic app's shared cobalt theme. Home now provides task search and direct read shortcuts. Tables show patient identity and readable times; individual sign-in retains authorized clinic and location selection. Use the appearance control to switch the open panel between light and dark. The screenshot tutorial reflects this interface update; the saved staff entry comes from the original local walkthrough, and no duplicate record was created for the new screenshots.

Open a fresh Codex chat, select **Meta Clinic**, and ask **“Open Meta Clinic.”** If the current chat has not refreshed its tools, it cannot discover a plugin installed during that chat. The standalone panel is also available at <http://127.0.0.1:3320/> while the plugin broker is running; `npm run serve` starts it directly.

The [screenshot tutorial](tutorial/tutorial.html) is served at <http://127.0.0.1:3320/tutorial.html>. It covers individual sign-in, schedule/patient/inventory/billing examples, recorded vitals/rooms/insurance views, reviewed changes, and recovery. Follow-up screenshots for the new sign-in, calendar and panel views are pending capture; earlier local panel screenshots remain as dated walkthrough evidence.

The local panel and Codex tools share one account session. Changing the account or clinic affects other open plugin panels/chats. Review the account and location shown before applying a change. Restarting the broker clears its session and pending proposals; saved records remain in the separate database.

## Earlier local panel walkthrough — October 3, 2026

- TypeScript check and production bundle completed successfully.
- MCP protocol discovery returned seven tools and the native panel resource; the opener returned all 90 catalog operations to the panel at that checkpoint.
- Chrome walkthrough connected a backend-provided account and location, loaded appointments and patients, opened record details, reviewed and saved a synthetic staff directory entry, and read that saved entry back from Rails.
- Five actual local-panel screenshots from this walkthrough are included. The earlier walkthrough used a backend-provided development account. All 90 operations in that checkpoint had source mappings; they were not all exercised end to end.
- Native rendering inside Codex remains unverified because this chat's tool inventory did not refresh after installation. The browser walkthrough is distinct evidence.
- No automated tests were run or added. No hosted service was modified. Clinical signing, external integrations and browser telehealth acceptance remain outside this package's verified coverage.

## Follow-up workflow status

Individual browser sign-in, the visual day/week scheduler, the vitals/rooms/billing panels, and local `/api/v1` adapters are implementation additions. Strict TypeScript, bundle build and MCP discovery (eight tools) pass. Browser walkthrough covered sign-in, day/week calendar, reviewed booking/save/read-back, seven recorded vitals with blood-pressure and heart-rate plots, four rooms and five invoices. The tutorial contains actual captures. Patient insurance showed its disabled/empty state; populated claim lifecycles, rescheduling/cancellation and stale-account race walkthroughs remain unverified. The local sign-in flow does not establish remote customer authentication, OAuth, public hosting, or customer deployment readiness. The previous review-change and saved-record screenshots remain evidence from the earlier local panel walkthrough.

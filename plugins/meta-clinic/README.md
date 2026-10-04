# Meta Clinic integration

A ChatGPT-hosted integration for clinic workflows through an authorized Meta Clinic connection. Codex is the development and local preview environment. Rails remains authoritative for identity, clinic scope, permissions, validation and persistence. The plugin combines MCP tools, an interactive workspace and host extensions, with a separate deployable OAuth connector for supported remote hosts. All project data remains independently synthetic.

Version 0.3.0 adds isolated connections, explicitly configured access to the existing hosted backend, a remote Authorization Code/PKCE service, demo lifecycle controls and persisted-record event subscriptions. Read [connections](CONNECTIONS.md), [platform decisions](PLATFORM.md), [workflow coverage](WORKFLOW-COVERAGE.md), and [events](EVENTS.md) for exact scope and remaining acceptance. These source additions do not deploy or publish the connector.

## ChatGPT distribution

The primary deliverable is a portable directory plugin containing an authenticated remote MCP connection, an MCP App and supported navigation extensions. The existing local stdio package remains useful for development. The assistant embedded inside Meta Clinic is phase 2 and is not implemented here.

After an authorized connector deployment, run `npm run package:chatgpt -- <deployed-HTTPS-MCP-URL>`. The packager requires the real `/mcp` endpoint, checks resource/issuer metadata, S256 support and unauthenticated denial, then creates a separate portable upload directory without local executables, private app bindings or credentials. It performs no upload or deployment. Complete [SUBMISSION.md](SUBMISSION.md) before submission. No public endpoint is currently configured or claimed.

Clinic sign-in grants access to clinic records; it does not replace ChatGPT host access or extend an API BAA to a consumer host. See [PLATFORM.md](PLATFORM.md) for the synthetic-data and host eligibility boundary. Host model token costs are not visible to this MCP server.

The canonical 116-workflow map and reported-result conflicts are in [WORKFLOW-116.md](WORKFLOW-116.md).

## Local developer setup

Prerequisites: Node.js 24+, the repository's Ruby/PostgreSQL development dependencies, and the Codex CLI.

From this directory in PowerShell:

```powershell
npm ci
npm run build
pwsh ./scripts/runtime.ps1 start
npm run install:codex
```

The runtime helper supports `start`, `stop`, `status`, and `seed`. Use `seed` only when the isolated development database needs synthetic records. The plugin API and web app use ports 3311 and 3310; the panel uses 3323. The helper configures the separate `apply_codex_plugin_development` database. For an explicitly configured hosted backend connection, follow [CONNECTIONS.md](CONNECTIONS.md) instead of starting a second clinic database.

Open Meta Clinic in Codex and choose **Sign in to Meta Clinic**. The panel opens the local `/sign-in` page in a browser; enter your own clinic account there, never in chat. Return to the panel, which refreshes the authenticated session. The account's existing clinic membership and backend permissions determine available records and actions. The local development-account picker is disabled by default; enable it only for development work with `META_CLINIC_ENABLE_DEVELOPMENT_ACCOUNTS=1` in the plugin runtime environment. For runtime control, run `pwsh ./scripts/runtime.ps1 status` or `pwsh ./scripts/runtime.ps1 stop` from this directory.

Each stdio connection and unlinked browser session has separate account state. A one-time browser link connects sign-in to the intended Codex connection. Browser tabs in the same profile share that browser session. Remote connections use distinct OAuth grants and encrypted backend sessions. Public hosting and native-host acceptance remain separate from implementation.

## How it works

- `server/index.mjs` registers the native MCP tools and panel resource.
- The local MCP server registers eleven tools (nine on the remote connector), including `meta_clinic_panel` for these panel-only projections. The earlier walkthrough's seven-tool discovery is historical evidence for that earlier checkpoint.
- `server/catalog.mjs` defines 103 unique schema-backed operations mapped to existing Rails endpoints: 69 reads and 34 deliberate writes, including the guided Care workspace.
- `server/panels.mjs` builds three bounded display views—recorded vitals, rooms/encounters, and invoices/insurance history—from existing Rails reads. `meta_clinic_panel` exposes these views to the panel; it does not add clinical decisions or backend write models.
- `server/http-api.mjs` adapts four loopback `/api/v1` paths to the existing tools and Rails contracts. The generated local API description is available at `/openapi.json`.
- `server/openapi.mjs` generates that description from the supported local route schemas.
- `server/client.mjs` owns one API session and refreshes clinic context; hosted mode has a fixed HTTPS origin allowlist.
- `server/service.mjs` validates operation schemas and manages five-minute, single-use change tickets. A prepared write is not saved until separately applied after review.
- `server/broker.mjs` hosts the loopback panel with isolated, explicitly paired connections.
- `server/oauth.mjs`, `remote.mjs`, and `storage.mjs` provide remote authentication, scoped MCP requests and encrypted connector persistence.
- `server/demo.mjs` and `ui/DemoWorkspace.tsx` reuse the existing guided-demo and sandbox lifecycle.
- `server/events.mjs` consumes the authorized Rails event feed and delivers configured signed callbacks.
- `ui/app.tsx` and `ui/style.css` implement the panel; `tutorial/tutorial.html` is packaged as its local walkthrough.
- `CAPABILITIES.md` documents operation coverage and omissions.
- `ui/sign-in.html` provides the local browser sign-in form. Passwords are entered there and are not sent in chat.

The local compatibility routes are `POST /api/v1/appointments/schedule` (calendar search, prepare a booking, commit a reviewed change), `GET /api/v1/clinic/layout` (room and encounter list), `GET /api/v1/patients/{id}/telemetry` (recorded vitals), and `POST /api/v1/billing/claims/status` (invoice and stored insurance-history view). These loopback adapters reuse the catalog, session context, review tickets and Rails permissions; they do not create a separate service backend.

The clinical views are projections of existing synthetic records. Vitals are displayed as recorded, without normal/abnormal labeling or triage recommendations. Room cards do not infer occupancy, cleaning or physical availability and cannot edit a floor plan. Insurance history is local, manual or simulated; it is not live payer verification or a payment status feed.

## Use it

Version 0.2.0 retains and extends the workspace around the clinic app's shared cobalt theme. Home now provides task search and direct read shortcuts. Tables show patient identity and readable times; individual sign-in retains authorized clinic and location selection. Use the appearance control to switch the open panel between light and dark. The screenshot tutorial reflects this interface update; the saved staff entry comes from the original local walkthrough, and no duplicate record was created for the new screenshots.

Open a fresh Codex chat, select **Meta Clinic**, and ask **“Open Meta Clinic.”** If the current chat has not refreshed its tools, it cannot discover a plugin installed during that chat. The standalone panel is also available at <http://127.0.0.1:3323/> while the plugin broker is running; `npm run serve` starts it directly.

The [screenshot tutorial](tutorial/tutorial.html) is served at <http://127.0.0.1:3323/tutorial.html>. It covers individual sign-in, schedule/patient/inventory/billing examples, recorded vitals/rooms/insurance views, reviewed changes, and recovery. Current 0.3.0 captures show the calendar, reviewed care changes, recorded vitals and the corresponding local website. Earlier screenshots remain dated. See [verification](VERIFICATION.md) for the exact checks and remaining gaps.

Review the account and location shown before applying a change. Account or clinic changes invalidate that connection's pending proposals. Restarting the local broker clears local connection state; persisted records remain in its selected backend. Encrypted remote sessions survive connector restarts, while pending review tickets deliberately do not.

## Earlier local panel walkthrough — October 3, 2026

- TypeScript check and production bundle completed successfully.
- MCP protocol discovery returned seven tools and the native panel resource; the opener returned all 90 catalog operations to the panel at that checkpoint.
- Chrome walkthrough connected a backend-provided account and location, loaded appointments and patients, opened record details, reviewed and saved a synthetic staff directory entry, and read that saved entry back from Rails.
- Five actual local-panel screenshots from this walkthrough are included. The earlier walkthrough used a backend-provided development account. All 90 operations in that checkpoint had source mappings; they were not all exercised end to end.
- Native rendering inside Codex remains unverified because this chat's tool inventory did not refresh after installation. The browser walkthrough is distinct evidence.
- No automated tests were run or added. No hosted service was modified. Clinical signing, external integrations and browser telehealth acceptance remain outside this package's verified coverage.

## Follow-up workflow status

Individual browser sign-in, the visual day/week scheduler, the vitals/rooms/billing panels, and local `/api/v1` adapters are implementation additions. Strict TypeScript, bundle build and MCP discovery (eight tools) pass. Browser walkthrough covered sign-in, day/week calendar, reviewed booking/save/read-back, seven recorded vitals with blood-pressure and heart-rate plots, four rooms and five invoices. The tutorial contains actual captures. Patient insurance showed its disabled/empty state; populated claim lifecycles, rescheduling/cancellation and stale-account race walkthroughs remain unverified. The local sign-in flow does not establish remote customer authentication, OAuth, public hosting, or customer deployment readiness. The previous review-change and saved-record screenshots remain evidence from the earlier local panel walkthrough.

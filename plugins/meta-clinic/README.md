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

Open Meta Clinic in Codex, then select the available development account, practice and location in the panel. The full clinic application remains available separately at the local web app. For runtime control, run `pwsh ./scripts/runtime.ps1 status` or `pwsh ./scripts/runtime.ps1 stop` from this directory.

## How it works

- `server/index.mjs` registers the native MCP tools and panel resource.
- `server/catalog.mjs` defines 90 schema-backed operations mapped to existing Rails endpoints: 61 reads and 29 deliberate writes.
- `server/client.mjs` owns the loopback-only API session and refreshes clinic context.
- `server/service.mjs` validates operation schemas and manages five-minute, single-use change tickets. A prepared write is not saved until separately applied after review.
- `server/broker.mjs` hosts the loopback panel and serializes calls from the panel and Codex tools.
- `ui/app.tsx` and `ui/style.css` implement the panel; `tutorial/tutorial.html` is packaged as its local walkthrough.
- `CAPABILITIES.md` documents operation coverage and omissions.

## Use it

Open a fresh Codex chat, select **Meta Clinic**, and ask **“Open Meta Clinic.”** If the current chat has not refreshed its tools, it cannot discover a plugin installed during that chat. The standalone panel is also available at <http://127.0.0.1:3320/> while the plugin broker is running; `npm run serve` starts it directly.

The [screenshot tutorial](tutorial/tutorial.html) is served at <http://127.0.0.1:3320/tutorial.html>. It covers connecting, reading records, schedule/patient/inventory/billing examples, reviewing changes, and recovery. Try “Show today's appointments for the selected clinic” or “Find inventory exceptions; do not adjust stock.”

The local panel and Codex tools share one account session. Changing the account or clinic affects other open plugin panels/chats. Review the account and location shown before applying a change. Restarting the broker clears its session and pending proposals; saved records remain in the separate database.

## Evidence status — October 3, 2026

- TypeScript check and production bundle completed successfully.
- MCP protocol discovery returned seven tools and the native panel resource; the opener returned all 90 catalog operations to the panel.
- Chrome walkthrough connected a backend-provided account and location, loaded appointments and patients, opened record details, reviewed and saved a synthetic staff directory entry, and read that saved entry back from Rails.
- Five actual local-panel screenshots are included. All 90 operations have source mappings; they have not all been exercised end to end.
- Native rendering inside Codex remains unverified because this chat's tool inventory did not refresh after installation. The browser walkthrough is distinct evidence.
- No automated tests were run or added. No hosted service was modified. Clinical signing, external integrations and browser telehealth acceptance remain outside this package's verified coverage.

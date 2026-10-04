# Meta Clinic for Codex

## Delivery contract

Build an installable local plugin with a native clinic panel, discoverable operations across existing clinic domains, server-authoritative reads and reviewed writes, account/practice/location context, and a screenshot tutorial. Preserve the hosted website and existing application contracts. The plugin connects only to an isolated loopback development runtime and its own PostgreSQL database.

The Rails API owns identity, permissions, tenancy, validation, transactions and records. The plugin maps named operations to existing API endpoints; it does not create a second clinical model. Existing U.S. healthcare field and terminology mappings remain authoritative; this integration introduces no new clinical fields or clinical decisions.

## Ownership and sequence

- Coordinator: transport/session isolation, MCP package, build/install, runtime, tutorial and integration.
- Catalog worker: `server/catalog.mjs` and `CAPABILITIES.md`, source-backed operation schemas.
- Panel worker: `ui/`, rendering and host bridge.

Build complete source first, then one integrated build and walkthrough. No automated test suite is requested. Tutorial screenshots come from the integrated running UI; screenshots alone do not prove every operation.

## Acceptance

- Local plugin installs with bundled executable and HTML resource; no dependency on the hosted domain.
- Account list comes from Rails. Account and clinic switching clear record state and pending writes.
- Reads use exact named endpoint mappings, constrained parameters and existing API permission checks.
- Changes are reviewed against the current account/clinic, then sent once. Unconfirmed outcomes are never automatically retried.
- Domain navigation, record details, forms, search, loading/empty/error states, selected context and tutorial are usable.
- Tutorial includes actual screenshots, setup, chat examples, operation boundaries and recovery.
- Installation, build, browser and native-host evidence are reported separately.

## Current checkpoint

Implementation built and installed locally on October 3, 2026. Base: `74c5b15abbec`, branch `codex/meta-clinic-codex`. Main fetched and fast-forward checked in isolated worktree. Primary checkout edits preserved. No `origin/master` branch exists.

### Evidence

- Strict TypeScript check and esbuild production bundle passed after correcting MUI 9 props and inline bundle replacement.
- Codex CLI installed `meta-clinic@meta-clinic-local`; MCP client discovered seven tools and `ui://meta-clinic/workspace`. The opener exposes 90 operations to the panel and a compact domain summary to the model.
- Separate runtime: PostgreSQL container `apply-codex-plugin`, database `apply_codex_plugin_development`, database port 54408, Rails 3311, web 3310, broker 3320. Seeded with existing independently synthetic backend samples.
- Chrome: selected the backend's Synthetic Review Admin account and MAIN location; loaded appointment and patient pages; opened a patient record; prepared, reviewed and applied a staff directory entry; retrieved Alex Morgan / Care coordinator / active from Rails afterward.
- Five actual screenshots in `tutorial/screenshots/` document connection, schedule, patients, exact-value review and successful read-back.
- Source review covers strict operation schemas, allowed paths and fields, in-memory session cookies, context generation, consumed-before-send tickets, API permission checks, loopback restriction, and no automatic write retries.

### Remaining acceptance

Native Codex panel rendering requires a refreshed chat with the installed plugin available. This chat's tool inventory did not refresh during installation. Account-switch invalidation, pagination and all 90 individual operations have source review, not complete browser acceptance. No automated tests or broad regression were requested or run. External integrations, clinical signing, hosted deployment, and clinical/legal/release acceptance are not established by this work.

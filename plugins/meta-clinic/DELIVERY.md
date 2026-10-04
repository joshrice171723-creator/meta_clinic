# Meta Clinic for Codex

## Active amendment — October 4, 2026

The original local-only contract below is historical. The accepted amendment
adds explicit hosted-backend connections, per-connection authentication,
deployable OAuth/MCP transport, existing demo lifecycle, a guided care journey,
persisted-record events, and submission preparation. [PLATFORM.md](PLATFORM.md)
records the architecture and official references; [WORKFLOW-COVERAGE.md](WORKFLOW-COVERAGE.md)
tracks implementation versus evidence. No deployment, publication or shared
infrastructure changes are authorized by this implementation pass.

Current phase: ChatGPT-target integration and focused verification. Primary ChatGPT host confirmed October 4; in-app assistant is phase 2. [WORKFLOW-116.md](WORKFLOW-116.md) preserves all 116 criteria and 19 conflicting reported IDs. [VERIFICATION.md](VERIFICATION.md) records selected checks. No complete clinic lifecycle or public host acceptance is claimed. Integration base `292a16f0`; `origin/main` pulled and
already included before implementation. Main checkout unrelated work preserved.
Owned branch remains `codex/meta-clinic-codex`. Coordinator is sole Git writer.

Acceptance queue: build/typecheck; ordinary account OAuth/PKCE and resource/scope
denial; two independent connections and stale tickets; local/demo navigation;
guided care persistence; backend event feed authorization; hosted synthetic API
connection and website read-back where available; actual UI captures. Record
public callback delivery, native-host rendering, deployment and registration as
separate evidence, never inferred from these checks.

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

## Follow-up: calendar and individual sign-in

Joshua requested a proper visual scheduler and accounts that other people can sign into, while retaining the plugin's design. This pass implements day/week calendar navigation, appointment details, availability-based booking/rescheduling, reviewed status changes, and browser-only credential entry for existing Rails accounts. Local development account switching is disabled by default. Hosted customer distribution, OAuth, deployment and commercial acceptance remain separate work; this local package does not create a shared remote service.

Ownership: interface worker owns `ui/Scheduler.tsx` and `ui/scheduler.css`; connection worker owns `server/client.mjs` and `ui/sign-in.html`; documentation worker owns README, capabilities and tutorial; coordinator owns transport, service, host integration and final verification. No automated tests requested. All source changes finish before one integrated typecheck/build and changed-journey walkthrough.

Principal failures and checks: incorrect clinic/date/timezone or invented availability; stale account writes; credentials exposed to chat; unconfirmed saves replayed. Verify login without a development profile, clinic/location selection, calendar dates and details, a reviewed booking and read-back, and stale-context rejection. Preserve failed outcomes and report checks not completed.

Standards basis: existing U.S. scheduling reference map R05/R07, reviewed October 3, 2026: [FHIR Appointment R4 4.0.1](https://hl7.org/fhir/R4/appointment.html), scope/workflow and timing/participants; [FHIR Slot R4 4.0.1](https://hl7.org/fhir/R4/slot.html), available windows versus bookings. These global base resources inform the existing U.S. workflow; no new exchange profile or FHIR conformance claim is introduced. Display backend instants in its supplied clinic timezone, keep appointment and encounter separate, and treat a displayed slot as availability that the backend rechecks on commit.

Follow-up phase: implemented; consolidated typecheck and build pass. Browser walkthrough evidence is recorded below.

### Prototype dashboard scope extension

Joshua clarified that this is a prototype with no real data and asked to follow the technical plan. Continue the local implementation with recorded-vitals graphs, room status, and stored insurance/claims history using existing Rails services. Add an MCP panel projection that keeps detailed measurements and record fields in component metadata and exposes only an administrative summary to the model. This is a visibility boundary, not a HIPAA de-identification claim. Preserve normal account sign-in and backend membership/permission enforcement. Live OpenAI OAuth registration and hosted multi-customer distribution are not part of this local pass.

Clinical reference basis reviewed October 3, 2026: US Core 6.1.0 on FHIR R4 heart-rate and blood-pressure profiles inform code/unit pairing, source times and observation status. The existing observation serializer remains the executable data contract; no FHIR conformance or clinical interpretation is claimed. CMS 276/277 claim status and 270/271 eligibility remain separate; the UI labels existing stored/manual/simulated history according to backend provenance. No new clinical triage engine or persistent spatial layout writer is introduced by rendering these panels.

Additional ownership: clinical-data worker owns `server/panels.mjs` and catalog additions; clinical-interface worker owns `ui/ClinicalViews.tsx` and `ui/clinical-views.css`. Coordinator integrates the MCP projection and view routing. Verify the three views, scope reset and truthful empty/error states in the same final walkthrough.

### Version 0.2.0 integrated evidence (October 3-4, 2026)

- Incorporated the completed styling/task-discovery work from commit `707e800a`; preserved individual sign-in and new calendar/dashboard routing in the combined panel.
- Strict TypeScript and production bundle pass after scoped MUI 9, type, and graph repairs. No automated tests or broad regression were requested or run.
- Browser sign-in with a newly created independently synthetic ordinary account succeeded with development account switching disabled. Selected its authorized MAIN location; current account/location appeared in the panel.
- Week calendar displayed 16 existing appointments with the API's America/Chicago time zone. Day view displayed real available times for October 5. Booking selected Avery Rowan / Alex Rowan / October 5 at 08:00-08:30, prepared exact values, applied once, refreshed the calendar and opened the persisted appointment with its entered reason. Existing backend constraints remained authoritative.
- Rooms loaded four recorded rooms and their open encounter states. Billing overview loaded five invoices with exact decimal strings. Patient insurance read returned its disabled/empty state truthfully; populated payer/claim lifecycle records were not exercised.
- Browser vitals view returned seven measurements and one blood-pressure pair with heart-rate and blood-pressure plots. MCP discovery returned eight tools and the native workspace resource.
- Vitals compatibility recognizes the source-backed development dictionary `synthetic-vitals` version 1 separately from `urn:apply:vital-signs` version 2, preserving original code systems, values, units and times. Older seed values are not relabeled as v2.
- New UI captures document sign-in, calendar, appointment review/read-back, rooms, billing and recorded vitals. Earlier staff-record review/save captures retain their earlier evidence dates.
- Live OpenAI OAuth, remote multi-user sessions, hosted distribution, native Codex renderer acceptance, all-operation coverage, stale-account race walkthroughs, and full rescheduling/cancellation journeys remain unverified. No hosted site deployment occurred.

- Codex CLI installed `meta-clinic@meta-clinic-local` version 0.2.0. The installed server hash matches the built server. A second CLI refresh hit a Windows cache lock; the already-installed executable was retained and the final tutorial-only updates were copied to that verified cache.

### Resumed 0.3.0 integration checkpoint

Owner revoked the stop request and restored ChatGPT-hosted plugin work. The preserved STOP snapshot remains unchanged. Intake/handoff, bounded remote call audit and metering, reminder-due events and connection recovery are now integrated. The 116-ID reconciliation remains explicit about gaps and conflicting reported website results. Current source and focused local check outcomes are recorded in VERIFICATION.md; this is not full workflow or hosted acceptance. No deployment, directory submission or embedded assistant was performed.

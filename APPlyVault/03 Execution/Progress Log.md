---
type: progress-log
status: active
updated: 2026-09-23
lifecycle: active
canonical_for: recent-progress-and-history-index
---
# Progress Log

## 2026-09-23 — Meta Clinic feature marketing pages

The local marketing catalog and Features menu now cover 17 dedicated feature routes, including a new Tracking Board entry. Fourteen newly authored feature stories have two synthetic, default-theme application concept images each; the three earlier Scheduling, Inventory, and Clinical Notes pages remain distinct. The Tracking Board visuals show seven fictional visits across expected, intake, ready-for-provider, provider-assigned, checkout, and waiting-room states, with room, reason, vitals, care task, provider, and timing context. Concept imagery is labeled as illustrative; it is not evidence that every pictured workflow is implemented. A focused frontend test passed 5 cases, the repository component gate passed, a production build passed, and a local browser sweep loaded all 17 routes at 1440, 390, and 320 pixels with images and no document-width overflow. Keyboard operation of the Features menu, including navigation and Escape, passed separately. These are local marketing and rendering checks, not clinical workflow acceptance or publication.

## 2026-09-23 — MC-04 recurrence and overbooking implementation checkpoint

The local MC-04 branch adds selected-site scheduling policy, bounded weekly appointment series with preview and future change/cancel history, and permissioned same-clinician overbooking with an explicit reason and database allocation limit. The Schedule, booking modal and Clinic Setup expose these controls. Focused Rails evidence passed 36 runs/354 assertions; frontend typecheck and 17 existing schedule/booking tests passed before the last small UI edit. In an isolated synthetic site, a policy save persisted and enabled controls rendered. Browser submission/reload of a series or overbook exception and an actual concurrent allocation race remain unverified. The founder stopped further test creation and runs. Site defaults remain off and no live-clinic activation or PR-10 work is claimed. See [[Meta Clinic Implementation Tracker]].

## 2026-09-23 — Prepared worktree startup improved

A third protected worktree slot was dependency-prewarmed and given its own persistent synthetic PostgreSQL database. A subsequent full local start took 42.24 seconds with current schema and the database container already running, then managed stop and slot release passed. Cold API readiness now allows 120 seconds, and Windows managed-stop checks the actual process exit state; the browser smoke can pass the required clinic location choice. The one-time pnpm hard-link step still took 7m46s despite zero downloads, and a faster SQL schema-load path was deferred because its snapshot differs from fresh migrations. This is local development tooling and a clinic Growth route smoke, not completion of T01–T10 patient-journey acceptance. [Timing and limits](../../records/progress/2026/09/2026-09-23-worktree-startup.md).

## 2026-09-23 — Repeatable Lightsail release path prepared

Added a manual PowerShell release command with local Docker build/transfer by default and optional prebuilt GHCR images. Its host script checks the exact API/web revision and Nginx syntax, restore-checks both synthetic databases, requires a verified encrypted off-host recovery copy before migration, deploys matched images, checks hosted login/authorization and Sandbox behavior, and attempts image rollback on failure. The runbook names the one-time registry credential setup and recovery limits. Static script parsing, DPAPI round trip, portable Compose validation, harness verification and the scoped diff check passed. A Linux/amd64 API image for `54a03172` built and carried the matching revision label. The web build was stopped after a prolonged TypeScript step, so the complete local image pair and the new hosted release command remain unverified. GitHub Actions did not start the `9b006747` image-publish jobs because it reported an account payment or spending-limit restriction. The existing hosted `2e866283` application release was not changed by this tooling work.

## 2026-09-23 — Patient-journey plans consolidated and archived

At the founder's request, the [single current patient-journey document](../../PATIENT_JOURNEY_PLAN.md) now reconciles the original T01–T10 contracts with revision 4's locally proved J0–J7 result. Both full originals moved to historical records with their dated detail preserved; the tracker links the consolidated scope and separate evidence owner. This was documentation consolidation only: no application behavior, browser proof, provider acceptance, clinical policy or launch status changed. [Archive and link manifest](../../records/progress/2026/09/2026-09-23-patient-journey-plan-consolidation.md).

## 2026-09-23 — Main integration and Lightsail synthetic release

Integrated the tracker-delivery branch and scoped local workflow edits into `main`; source commit `2e866283e99065a73c0e8a9e1b21f16d5aca19f9` is running on aimetaclinic.com as matched API, worker, guided-demo and web images. The first image rollout exposed an nginx asset-cache regex syntax error. The prior `cc236d46` images were restored while the one-line source correction was committed, checked with nginx, and released. Public HTTPS checks returned 200 for `/login`, `/up`, `/demo`, `/joshua/`, `/clinic` and `/clinic/schedule`.

Before migration, both hosted synthetic databases were dumped and restored into scratch databases with matching user counts (ordinary 3; guided demo 33). The on-host recovery folder is `/opt/meta-clinic/backups/release-42de8649-20260923T174614Z`; its dumps and existing server secrets are also in the DPAPI-encrypted `MetaClinic-recovery-42de8649.tar.gz.dpapi` under the founder's local Secure Files folder. That copy depends on this Windows user profile for decryption. Both databases reached migration `20260923010000`, ordinary runtime privileges were reapplied, and prior images plus the prior release environment remain for recovery. The staging demo account's practice 8 was explicitly added to the host pilot allowlist after its login succeeded but clinic context returned 403; the previous runtime environment was retained as `runtime.env.before-pilot`. Final hosted checks passed password login, anonymous and CSRF denial, development-login denial, authenticated clinic context, concurrent reads and logout denial. A public synthetic Sandbox session passed creation, two-location access, location switch and reset. Local focused verification passed 25 Rails cases/457 assertions, 14 frontend tests, TypeScript and production bundle, vault and harness verification. This is synthetic staging evidence; no full browser matrix, clinical approval, real-data use or production release is claimed.

## 2026-09-23 — Service offering to estimate link

Estimate staff can select a published service offering paired with its billable price. The API rejects draft, retired, wrong-practice and mismatched new links; same-state create replay works, and correction may retain its predecessor's historical offering/price pair. Billing-only staff can read published offerings for the estimate form without managing the catalog. The focused Rails batch passed 13 runs/111 assertions, the estimate frontend file passed 2 tests, and TypeScript passed. Exact create replay after a catalog change remains open under the existing receipt contract. This is source and focused-test evidence only; offering selection, reload and delivery were not exercised in a browser, and no document was sent or payment collected. See [[Meta Clinic Implementation Tracker]].

## 2026-09-23 — Telehealth audio-only join continuity

The patient device check's policy-permitted audio-only choice now carries through the Twilio media join and fresh-grant reconnect, so the browser does not request a camera for that path. Selected microphone and camera preferences also reach join/rejoin with browser fallback if a device disappears. Focused adapter, session and recovery tests passed 25/25; TypeScript passed. This is local source proof, not a connected patient/provider browser visit or two-party Twilio media verification. Provider readiness, credentials, policy and release acceptance remain open in [[Meta Clinic Implementation Tracker]].

## 2026-09-22 — Individual therapy and separate private-note source slice

D-080 selected a separate protected psychotherapy-note feature. The local behavioral-health setup now offers explicit individual therapy, and its encounter has an originator-only encrypted/versioned private-note record and panel separate from ordinary notes. Final focused API proof passed 3 runs/39 assertions; frontend typecheck/build and scoped Ruby lint passed. This is synthetic source proof, not connected browser acceptance or a clinic-approved consent, disclosure, retention, credential or group-therapy policy. BH-01's remaining browser/recovery and instrument/safety gates remain open; see [[Meta Clinic Implementation Tracker]].
## 2026-09-22 — Independent booking, membership recovery, telehealth, and stock reversal

In the isolated synthetic clinic, staff booked independent visit-type-only appointment 46 for September 24 at 11:00 after retiring the service offering; it persisted after a full schedule reload with no offering link or snapshot, while linked appointment 45 retained the retired offering's booking-time snapshot. The merged account-first local simulator API journey passed 1 run / 59 assertions for paid entitlement, wrong-practice denial, renewal failure and fresh-state read, exact replay, and period-end cancellation. Account activation/payment retry and telehealth recovery frontend tests passed 6/6 after merge, and TypeScript passed; an earlier focused telehealth disconnect/rejoin test passed 4/4 with the same visit/encounter retained. In the owned browser, a reasoned reversal of a two-tablet removal from an existing 600-tablet lot posted a linked Adjustment In and restored the balance to 600 after full reload, leaving the original entry intact and removing its reverse action. Focused inventory checks passed 5 API runs / 97 assertions plus 1 / 22, 17 frontend tests, typecheck and scoped Ruby lint. This did not exercise inventory receiving or role denial in the browser; cross-clinic booking denial, connected membership browser recovery, live two-party media and provider/supplier transactions remain open. See [[Meta Clinic Implementation Tracker]] for the scoped evidence and gates.

## 2026-09-22 — Walk-in identity recheck and portal return

Registration now rechecks the identity fields actually submitted after staff review and preserves an uncertain exact retry. The patient record exposes a permission-gated, practice-scoped summary of persisted portal linkage and invite/recovery state. A focused synthetic HTTP journey registered a walk-in, invited and activated portal access, and signed back in to the same patient/practice ID without a duplicate; cross-practice and unauthorized role paths were denied (1 run / 28 assertions). The earlier browser showed only candidate and no-match review. A connected browser walk-in-to-portal return, reload, correction and telehealth return remain open. See [[Meta Clinic Implementation Tracker]].

## 2026-09-22 — Estimate correction browser journey and room-hold conflict repair

In the isolated synthetic clinic, an administrator created a $95 billing service, selected patient Avery Rowan, saved and issued a $95 GFE candidate, then created a linked correction for quantity two with a reason. The browser showed the preserved $95 prior snapshot beside the $190 draft, and after issue it showed the original as superseded and the correction as issued. Both versions explicitly said delivery was not recorded. Patient-scoped estimate read and authorization checks passed 4 runs / 26 assertions; a full browser reload and delivery recording were not exercised. Separately, failure-first calendar tests reproduced a capacity block over an active hold and two clinicians holding the same room. After the serialized guard repairs, the full calendar integration file passed 7 runs / 65 assertions. Actual concurrent requests and browser hold recovery remain open. See [[Meta Clinic Implementation Tracker]].

## 2026-09-22 — Site-scoped daily visits report

Added a clinic-local daily appointment-state aggregate in the API with site/practice scope, a definition revision, source/date-basis metadata, as-of time and freshness. Focused API integration checks passed 3 runs / 32 assertions, including report access and reconciliation cases. Operations now renders a date-selected read-only view without patient rows or export. In the synthetic clinic browser, September 24 returned one scheduled visit and zero in the other states, with source/revision/freshness visible. Reload and denied-role browser checks remain open; this is one bounded MC-14 report, not a general reporting acceptance. See [[Meta Clinic Implementation Tracker]].

## 2026-09-22 — Linked service booking, identity review, hold projection, and estimate correction

In a worktree-owned synthetic clinic, staff created and published a service offering, booked one September 24 appointment with it, and saw the appointment on the schedule. Database inspection confirmed the offering link and booking-time snapshot. A full setup reload retained the offering; retirement then left its catalog row visible without edit/publish actions. The registration page now presents an identity search before registration for authorized roles; the browser showed both an existing candidate and a no-match path, but did not complete a walk-in-to-portal return or bind the reviewed search to final form details. The calendar now subtracts active unexpired schedule holds from clinician and room availability (8 focused tests/26 assertions passed). A reasoned linked cash-pay estimate correction draft has focused service/HTTP proof (6 runs/40 assertions), with browser issue/delivery still open. The remaining gates and precise evidence boundaries are in [[Meta Clinic Implementation Tracker]].

## 2026-09-22 — Public membership contact and account browser checkpoint

On an isolated synthetic stack, the public directory opened two clinic-specific membership catalogs. A contact-first request in clinic 1 persisted as an outreach prospect without a patient link. An adult account-first request in clinic 2 reached email verification and remained unpaid; an underage account attempt was rejected without another prospect. The storefront dialog now states that contact-only does not create an account or start payment. Account activation, local payment/failure recovery, retries, and broader website tools remain open. See the MC-02 checkpoint in [[Meta Clinic Implementation Tracker]] for the evidence boundary.

## 2026-09-22 — Optional-insurance tracker row reconciled

Added MC-16 to the main implementation inventory, where it was missing despite appearing in the existing delivery dashboard and vendor-preparation section. The row restates D-064's optional-insurance boundary and D-072's local-preparation direction; it records no new source implementation, payer connection, policy decision or acceptance evidence. Current source reconciliation and a bounded local workflow remain next.

## 2026-09-22 — Clinic workflow plan tracking audit

Audited repository-visible `clinic-workflow-planning` outputs and related plan references. The earlier weight-loss skill-test material was consolidated into the linked patient-journey plans; the dedicated behavioral-health/therapy assignment file is linked as BH-01/BH-02. The full application review applies the planning method and is already tracked as PR-01–10; it is not identified as a separate skill-produced file. Added a coverage index to the implementation tracker and made future writable skill runs require an owning tracker link and evidence-bounded status. Harness verification now fails if an assignment file in the skill output folder lacks a tracker Markdown link; its positive/negative test passed, all 24 harness tests passed, harness verification reported one tracked plan, and vault verification passed 43 notes/509 links. Vault audit retains existing size/metadata advisories. No clinical workflow, acceptance status or product decision changed.

## 2026-09-22 — Behavioral-health and therapy tracking correction

Linked the existing behavioral-health journey and a focused clinic-workflow assignment brief from the canonical implementation tracker. BH-01 now names the partially implemented, locally evidenced behavioral-health/psychiatry journey and its remaining browser, recovery and clinical-policy proof; BH-02 names the unresolved direct-therapy scope and unavailable dedicated psychotherapy-note capability. These are specialty checkpoints across the existing 16 MC workflows, not additional platform parts or newly measured percentages. The shared dependency matrix, application source and clinical decisions did not change. Vault verification passed 43 notes/509 links; harness verification and 23 harness tests passed. Vault audit reported existing size/metadata advisories. No new browser, clinical, external or release acceptance is claimed.
## 2026-09-22 — Service-offering retirement and published-site guard

Implemented a dedicated idempotent service-offering retirement operation with a recorded `retired_at`, blocked generic status bypass and later editing/republishing, and added a confirmation action to Clinic setup. A focused failure-first test exposed a published-offering site update that raised a database null-constraint error; site links now update atomically and a published offering cannot lose required eligible site/room coverage. The isolated synthetic browser published the existing draft, retired it, and showed the retained retired catalog row after reload without Edit or Publish actions. Focused Rails service-offering tests passed 5 runs/53 assertions; the session suite passed 11 runs/83 assertions; 16 focused client tests and the web production build passed. Appointment linkage, independent-service behavior, browser tenant denial, and professional/release gates remain open; this is not completion of MC-01.

## 2026-09-22 — Isolated clinic browser checkpoint and setup return route

The worktree-owned development stack passed managed readiness on ports 3100/3101 after locked dependency prewarm; the production web build passed before the focused code edits. An initially empty isolated database received guarded synthetic role accounts. In the in-app browser, Clinic Administrator reached Tracking Board and Clinic setup. The first synthetic draft save failed with a sign-in error after an API session-heartbeat CSRF 422 and a service-offering POST 401; a separate sign-in later changed from an authenticated to unauthorized session GET after about a minute. Development session cookies were scoped by web port, keeping test and production names unchanged, and the managed stack restarted. A fresh in-app browser tab then saved synthetic service offering `LOCAL-VAL-01` as a draft and showed the same draft after a full reload. This proves only that local save/reload path, not the exact earlier cookie-collision mechanism or broader session stability. The earlier lock also lost the Clinic setup return path; a narrow allowlist change and focused client regression preserve `/clinic/setup` while retaining unknown-path rejection. Published/retired, denial/isolation, and clinical or release acceptance remain open.

## 2026-09-22 — Per-slice remediation and validation dashboard

Recorded the founder-requested 16-slice delivery dashboard in [[Meta Clinic Implementation Tracker]]. It separates estimated local build coverage, current validation coverage, and external/human acceptance rather than presenting a single platform-completion number. The dashboard links each MC row to its missing evidence, next bounded local work, and completion gate; the existing non-vendor hardening packet remains the detailed field/paired-failure plan. This was a documentation planning change only: no application behavior, browser proof, vendor connection, professional decision, pilot, or release gate was completed.

## 2026-09-22 — Synthetic outpatient psychiatry workflow

Implemented the bounded outpatient psychiatry/medication-management composition in the existing synthetic behavioral-health workflow. The profile reuses intake, tasks, assessment revisions, medication requests, refill replacement, pharmacy destinations, prescription events, and attempts. Assessment revisions now retain explicit item/reviewer state, and a manually owned safety follow-up remains open after encounter closure; no clinical score, policy, or automatic action was added. A configured controlled-test simulator stores fake signer/reviewer snapshots only and covers accepted, rejected, unavailable, revoked, duplicate, and outcome-unknown recovery without a vendor, credential, external transmission, or real signer. Focused isolated API verification passed 18 runs / 355 assertions. Browser acceptance is still unverified because this worktree has no owned web runtime; the shared stack was not reused.

## 2026-09-22 — Assessment-score provenance

Added optional source and recorded time to immutable assessment-score revisions. New score provenance is a complete pair—calculated, clinician-entered, imported, or explicit unknown plus a timestamp—and cannot be recorded without an existing score. Existing scores remain historical rather than being backfilled. The implementation does not calculate a score, select an instrument, assign a reviewer, set a threshold, or create follow-up work. Focused clinical-plan API verification passed 10 runs / 236 assertions; the frontend control contract passed 3 tests, TypeScript/Prettier passed, and PostgreSQL upgrade, concurrency, restore, and fresh-schema verification passed. The broader backend verifier repeated the unrelated appointment-overlap race after its independent invoice/address checks passed.

## 2026-09-22 — Ordinary-note psychotherapy boundary

Added focused API regression proof that the ordinary encounter-note endpoint rejects a `psychotherapy` note kind before creating a note or idempotency receipt. This maintains the product boundary between ordinary SOAP documentation and a separately maintained psychotherapy-note capability; it does not claim that protected-note access, portal/export separation, consent, retention, or state-law policy has been implemented. `clinic_encounter_notes_idempotency_test.rb` passed 17 runs / 163 assertions, scoped RuboCop and vault verification passed, and the change was published in `e0a0c55b`.

## 2026-09-22 — Care-goal outcome provenance

Added optional source and reported/observed time to immutable care-goal outcome revisions. The source/time pair is constrained in PostgreSQL and Rails, survives subsequent revisions, and remains optional so older outcome narratives are preserved as historical rather than backfilled with guessed provenance. The UI exposes the matching Material UI controls and blocks only a partial pair. This is source context, not a scoring system, goal-achievement decision, intervention, safety assessment or billing rule. The focused clinical-plan and frontend control contracts, scoped Ruby lint, TypeScript and Prettier checks passed; the PostgreSQL verifier passed upgrade, concurrency, backup/restore and fresh-schema checks. The broader backend verifier failed a separate appointment-overlap race check and is not represented as passing.

## 2026-09-22 — Actual session-duration capture

Added optional actual session duration in whole minutes to the encrypted, versioned SOAP-note body. It is preserved through creation, revision, signed correction, exact retry and editor working-draft recovery; a legacy request that omits it takes the expected immutable revision's value, while an explicit blank clears it. The frontend labels it as documentation only. The change does not calculate billing time, select a treatment, infer a clinical finding, assign a risk level or alter safety behavior. Focused behavioral-template and note idempotency/correction tests, scoped Ruby lint, TypeScript and Prettier checks passed. Browser mutation remains unexercised; clinic-selected instrument, safety and psychotherapy-note controls remain open.

## 2026-09-22 — Behavioral-health synthetic journey

Created and exercised Cedar Behavioral Health with Ethan Brooks: registration, initial booking/check-in, specialty intake, cross-account handoff, signed notes, care-plan/goal history, encounter closure and return simulation. Added backend-owned behavioral-health starter forms after the browser exposed weight-management intake in this specialty. Focused tests passed; two unfinished tasks persisted across closure. [Evidence and remaining gaps](../../docs/development/behavioral-health-journey.md) separate browser mutations, domain-service execution and unverified paths. Scored instruments, automatic prior-plan visibility and dedicated psychotherapy-note privacy are not declared complete. No deployment or real-data use.

## 2026-09-22 — Behavioral-health continuity and record-boundary repairs

Completed the independent continuation slice for the synthetic behavioral-health journey. Return encounters now receive a bounded, permission-filtered projection of the patient’s latest prior care-plan and goal revisions and link to their owning source visit rather than silently copying care. Clinician display names now flow through the scheduling contract; booking and request-review surfaces use the backend-owned name when available, and Schedule uses neutral booking wording. Added an optional ordinary behavioral-health progress-note template that explicitly distinguishes itself from separately maintained psychotherapy notes and does not prefill findings, an assessment, or a safety protocol. Assessment guidance now says that a category alone is not an instrument, scoring rule, or follow-up protocol.

Focused Rails verification passed: 11 runs / 224 assertions across the clinical-plan workflow, clinician serializer and behavioral-health note-template contracts. Browser inspection confirmed the synthetic October follow-up is scheduled with Avery Morgan and the neutral **Book appointment** action; it also found and corrected stale “first appointment” wording. A subsequent local dev-server reload remained on a loading shell, so the new prior-care panel and corrected guidance copy still require a fresh rendered browser check. No approved instrument, scoring/follow-up protocol, safety protocol, or dedicated psychotherapy-note policy was supplied; those configuration-dependent paths remain unavailable rather than simulated. No deployment or real-data use.

## 2026-09-22 — Assessment response provenance

Added a forward schema change and UI/API contract so a completed assessment must record where its responses or observations came from: patient report, clinician observation, proxy report, imported record, or explicitly unknown. The value is revision-bound and retains existing idempotency, site authorization, correction history and assessment-category controls. This closes a provenance omission without selecting an instrument, calculating a score, assigning a safety outcome, or implying a review policy. Focused clinical-plan proof passed 9 runs / 215 assertions, scoped Ruby lint passed, frontend TypeScript passed, and the PostgreSQL verifier passed upgrade, concurrency, backup/restore and fresh-schema checks. Item-level instrument responses, scorer/reviewer rules and follow-up policy remain unconfigured.

## 2026-09-22 — Prior-care browser verification

Browser inspection of the signed synthetic return encounter now visibly rendered the clinical-plan panel's two prior-care rows: the patient-selected coping goal and daily-functioning plan from visit 71, each with Active status, revision 2 and a link to the owning source visit. Browser network inspection found two local workspace GET requests, each completing with HTTP 200 after an initially visible delay. This verifies the delivered read path only; it does not exercise a browser source-update mutation or resolve unselected assessment, safety, psychotherapy-note, consent, billing or portal boundaries.

## 2026-09-22 — Behavioral-health recovery and disclosure component checks

Ran the three relevant synthetic server component suites independently after an earlier combined command supplied no complete result: note idempotency/correction, patient-portal visit instructions and encounter-completion review. All three managed runs completed successfully. The reviewed coverage includes exact note retry handling, immutable signed-correction history, wrong site/tenant/patient note-write denial, only the owning patient's completed signed instructions in the portal, and atomic closeout that snapshots rather than resolves owned open work. The focused frontend working-draft recovery test also completed successfully, covering committed/retry/conflict reconciliation for an uncertain draft save. Browser mutation, browser permission-denial, consent and billing paths remain unexercised; no live or real-data claim follows from these checks.

## 2026-09-21 — Public-page visitor reporting published

At Joshua's request, released `cc236d46b789f025f1a09ab462b21520970e0d2f` to aimetaclinic.com. The owner dashboard now reports 30-day public views, estimated unique browsers, per-page last visits, daily UTC totals and referring hostnames for `/joshua` and `/demo`. `/Joshua` and `/Joshua/` redirect to `/joshua/` with query strings preserved. The first-party tracker uses the main API even on the isolated demo page, keeps CSRF/Origin and owner authorization, respects DNT/GPC, and does not store names, email addresses, IP addresses or complete referring URLs in analytics. Registered demo lesson reporting remains separate; no historical visits were reconstructed.

Focused verification passed: Rails 4 tests / 27 assertions, eager loading, changed-file RuboCop, frontend type check, 8 related tests plus 2 tracker tests, formatting and production bundle. Both hosted databases were backed up and restored into temporary scratch databases before their additive migration; ordinary runtime privileges were reapplied. Local Docker became unresponsive during the full frontend image build. The release therefore packaged the already-verified bundle on the host and layered the exact committed API source over the previous runtime after byte-comparing unchanged Gemfile and lockfile. Windows executable line endings were normalized before successful migration. API, worker, guided-demo and web now use the matched `cc236d46` tags. Previous images, database backups, `/opt/meta-clinic/backups/release-before-traffic-cc236d46.env`, and `/var/backups/joshua-portfolio/traffic-cc236d46` remain available for recovery; no existing records or credentials were reset.

Live browser verification confirmed the capitalized redirect and owner-only Website visitors panel showing 1 portfolio view plus 2 demo views from 1 browser; these are the verification visits, not organic traffic. HTTPS `/up` returned 200, anonymous command-center access returned 401, and nginx configuration validation passed. The existing Material UI table/stack/paper patterns were reused. Full CI, broad clinical regression, SMTP recovery delivery and a full guided-lesson replay were not part of this analytics verification; no clinical or real-patient acceptance is implied.

## 2026-09-20 — Combined session work published to Meta Clinic

At Joshua's explicit request, inspected all registered worktrees, local and fetched remote branches, stashes and recent application tasks. All branch tips were already ancestors of main; no outstanding tracked changes or stashes required integration. Preserved unrelated attachment and résumé scratch directories. The remote has `main`, not `master`. Released application commit `664f978883430056a46018f8964e5744aef0ebc5` to https://aimetaclinic.com using matched API/web images built from its Git archive. Subsequent portfolio-only commits were published separately at `/joshua/` without changing application source.

Both `apply` and `apply_guided_demo` databases were backed up and successfully restored into scratch databases before migrations. Stopped application writers, migrated both databases, reapplied ordinary runtime privileges, and restarted API, worker, guided-demo and web. All four containers report the exact release revision with zero restarts. Recovery files and previous image references remain at `/opt/meta-clinic/backups/release-664f9788-20260921T040521Z`; rollback was not needed. Existing secrets, database volume and the separately published portfolio nginx configuration were preserved.

Verification passed: 47 focused frontend tests across client, guided-demo, subscriptions and front-desk layout; matched Docker builds including TypeScript and production bundling; public HTTPS `/demo`, `/up` and `/joshua/`; 46-lesson catalog, Sandbox creation, two locations, location switching, non-owner session and reset recreating locations in the same clinic. Anonymous clinic access and ordinary demo entry remain denied, and development login remains disabled. Browser automation timed out twice, so this release establishes direct HTTPS/API behavior rather than a fresh rendered walkthrough of every changed journey. GitHub CI jobs did not start because GitHub reported an account payment/spending restriction; full CI remains unverified. These hosted synthetic checks do not establish clinical, provider-integration or real-patient production acceptance.

## 2026-09-20 — Joshua Rice personal website published

At Joshua's explicit request, published the [personal portfolio](https://aimetaclinic.com/joshua/) from commit `90afe053` as an isolated static route on the existing Lightsail host. It includes project highlights, the Meta Clinic demo link, the corrected GitHub profile, a web résumé without semester counts, and a Word résumé download. Saved `Joshua_Rice_resume_2026.docx` on the Desktop, preserving the newer desktop career details and adding the portfolio and corrected GitHub links. Both rendered Word pages were visually inspected; the public download's SHA-256 matches the Desktop copy.

HTTPS checks passed for both pages, all public assets, the Word download, `/demo`, and `/up`; unpublished README/configuration and nonexistent paths return 404. Browser inspection confirmed the published design and résumé navigation. Nginx configuration passed validation before reload. Static release and rollback instructions are in [the portfolio README](../../sites/joshua-rice/README.md); the saved host configuration is under `/var/backups/joshua-portfolio/20260921T040309Z`. This task did not change application images, containers, credentials, or databases. Portfolio publication is separate from the concurrent Meta Clinic application release and does not establish clinical or production acceptance.

## 2026-09-20 — Local synthetic prescription transmission implemented

Implemented the bounded [prescription transmission brief](../../docs/development/prescription-transmission-plan.md): practice-scoped pharmacy destination entry, immutable destination snapshots and transmission attempts, a backend-owned simulated pharmacy network, and the explicitly labeled **Submit to pharmacy (simulated)** action. The server accepts only bounded simulated outcomes, preserves idempotent replay, and retains the existing unknown/acknowledged reconciliation block; it has no vendor credential, network call, or automatic replay. Staff refill intake can now select a patient’s prior prescription series, and approval creates a linked replacement order that must still pass the existing version-bound review before simulated submission. Focused Rails tests (3 runs / 39 assertions), frontend TypeScript, scoped Prettier, and route-boundary tests passed. This is local synthetic workflow evidence only—not a transmitted prescription, pharmacy response, dispense/fill, clinical/professional review, security assessment, or release acceptance.

## 2026-09-20 — Prescription transmission implementation brief saved

At the founder's request, saved the [prescription transmission implementation brief](../../docs/development/prescription-transmission-plan.md) and linked it from MC-10. The brief documents the inspected medication-request, immutable-event and refill baseline; a vendor-independent pharmacy destination, attempt-history and backend simulation plan; standards references; recovery/refill boundaries; and future vendor gates. It maps to RX-01–03 and OP-06–08/10/12 without adding a competing dependency matrix. This is planning evidence only: no source workflow changed, no provider was contacted, and no pharmacy transmission, clinical/professional review, real-data use, or release acceptance occurred. Next action is a separately authorized bounded implementation slice starting with pharmacy destination and preparation validation.

## 2026-09-20 — Recent agent work and populated Sandbox deployed

At the founder's request, inspected all available worktrees and recent branch commits. Recent completed work was already included in main at `f31a1784f3b4bb13531ac3fce7ef328b096f9501`; no additional recent commits required merging. Preserved the local schema-formatting change and attachment directory. Recovered the prior Lightsail connection from the earlier deployment record and verified the public domain resolves to `174.129.142.201`; the initial runbook address was stale.

Built API and web images from a Git archive of that exact revision on the existing host. Backed up both ordinary and guided-demo databases and restored each into a temporary database successfully before migration. Applied the lesson-outcome migration to both databases, reapplied the ordinary runtime privileges, and restarted API, worker, guided-demo and web with matched `f31a1784` images. All four container revision labels matched the full commit and restart counts were zero. Prior image references and backups remain at `/opt/meta-clinic/backups/release-f31a1784-20260920T081956Z` on the host; rollback was not required.

Public HTTPS verification passed for `/demo` and `/up`. A synthetic visitor verified 46 lessons, Sandbox creation, location switching, a non-owner session, and reset rebuilding new location records within the same Sandbox clinic. After reset, backend counts were 8 patients, 2 sites, 6 appointment dates, 5 products, 4 suppliers, 4 inventory locations, 5 purchase orders and 5 shipments. The ordinary demo API and anonymous clinic-context requests remained denied. Existing focused source evidence included 21 guided-demo integration tests / 587 assertions and 24 frontend tests; the host web build also passed TypeScript and bundling. This release check does not claim a fresh browser walkthrough of every lesson or live provider acceptance.

## 2026-09-19 — Isolated guided lessons published on Lightsail

Published application commit `21018717` from main to https://aimetaclinic.com/demo at the founder's explicit request. The current catalog contains 45 independent lessons, including primary-care and weight-management variants; this supersedes the earlier sequential journey description below. Each lesson reuses its dedicated sample clinic and resets on entry. Visitor details record usage rather than creating personal clinics. Shared Scribe/layout fixes remain in ordinary application code.

Hosted lessons use a separate database, database login, encryption keys and browser-session cookie. A direct PostgreSQL privilege check confirmed the demo login cannot connect to the ordinary application database. Ordinary API demo entry remains unavailable. Sample Scribe encounter creation requires a matching active lesson. Demo receipt delivery is disabled in the dedicated demo process; ordinary mail settings are unchanged. Fixed a hosted session bootstrap that incorrectly called the local-only named-account helper.

Focused verification passed: 30 frontend tests, TypeScript and production build; 5 Rails isolation tests with 25 assertions, plus the hosted-session regression with 5 assertions; changed Ruby lint. Earlier bounded audit evidence remains separate. The host backup was parsed and restored successfully, and candidate migrations were applied to a restored scratch database before regular migration. HTTPS health and dedicated demo routing passed. Public-browser checks verified the catalog, Scribe consent acceptance, and lesson restart returning consent to not recorded with a fresh encounter. Telehealth displayed its prepared patient appointment and the walkthrough completion notice. Simulated checkout reconciled its payment and displayed lesson completion without contacting a payment provider. Live checks do not establish every lesson's end-to-end acceptance or external AI, telehealth, payment or email-provider readiness.

## 2026-09-19 — Guided cash-based clinic demo on an isolated branch

Implemented a local `/demo` walkthrough on `codex/guided-clinic-demo`, based on main after the M1–M12 intake updates. The visitor supplies name, email and company before choosing cash-based primary care or weight management; these are saved as a separate inquiry without a login account. Each journey provisions its own practice. Clinic setup unlocks membership creation and an independent inventory receiving/count/usage path. Publishing unlocks the patient storefront; the existing simulated payment creates the patient before returning to the clinic for scheduling, check-in and the visit. Progress comes from persisted workflow records. Reset retires the old journey and generated accounts, revokes their sessions, and retains the visitor inquiry for a fresh start.

The follow-up adds clinic naming and administrator, patient, front-desk, clinical-team and inventory perspectives, with prerequisite explanations. These are simulated workspaces; actual staff use assigned permissions. An email change retires the previous browser-bound journey and revokes its generated accounts' sessions. Contact details do not authenticate ownership: entering the same email in another browser never grants access to the first environment. Same-email updates retain the current journey. Clinical provisioning includes the existing clinician permissions, inventory starts configured, and front-desk navigation carries the booked appointment date.

Focused API coverage passed all 10 scenarios across the full run and the repaired inventory-only rerun, including real HTTP note signing/visit completion, receiving/count/usage, contact isolation and reset. Focused frontend coverage passed 29 tests; TypeScript, bundle, formatting, Rails eager loading and changed Ruby checks passed. Broad frontend related-test discovery previously stalled; explicit client, membership, front-desk and demo tests were used instead. Browser checks reached 10 of 10 lessons: visitor entry, cash-based choices, clinic setup, membership publication, simulated payment and automatic clinic return with the same patient, appointment booking, date-targeted check-in, signed note/visit completion, inventory receipt, completed count and stock usage (200 to 199 units). Reset was separately verified. Changing the visitor email then returned to clinic selection; the custom name Cedar Demo Clinic persisted in a fresh environment with 0 of 10 lessons and prerequisite-gated roles. This bounded demonstration does not assert completion of every intake field or full clinical acceptance. No deployment, real payment, external email or public visitor collection was performed. Existing development access restrictions remain in force.

## 2026-09-19 — Weight-management intake audit reopened incomplete milestones

Compared M1–M12 with the full supplied brief and published HL7 R4/SDC/US Core references. Corrected the prior blanket completion claim: detailed capture, linked evidence/consents, owned review/support work and shorter follow-up remain incomplete. Hardened normalized chunk confirmation, correction/reconfirmation, stale handoff handling, history-summary detail, independent reproductive responses and group navigation/measurement placement. The [dated audit and verification record](../../records/implementation/2026-09-19-weight-management-intake-audit.md) preserves findings and exact evidence limits. No clinical, live-integration or release acceptance is implied.

## 2026-09-17 — Part 2 acceptance breadth and capacity-fixture repair

Ran the source-owned Part 2 selector across role/site permissions, scheduling,
registration, billing, inventory, workforce, patient portal, reminders, scribe
and the cross-role integrated clinic journey. The first run found one stale
synthetic setup: the waitlist recovery path did not create weekly capacity rules
for its clinician/site. Adding those rules repaired the fixture without changing
runtime authorization or scheduling behavior; the affected journey passed 2
runs / 78 assertions and the full selector was rerun at **135 runs / 1,467
assertions / 0 failures / 0 errors / 0 skips**.

The frontend suite passed **51 files / 383 tests**; TypeScript and production
bundle checks passed. Direct browser-harness runs against `localhost` passed the
seven core clinic routes on desktop, tablet and phone. The package-script tablet
wrapper timed out while enabling the development selector, but the same harness
invoked directly passed; this is recorded as tooling behavior. Full fresh action
denial, populated-resource mutation, screen-reader/zoom/modal/error-state and
elapsed two-hour session acceptance remain open, as do clinical/provider,
privacy, tax, retention, support, pilot and release decisions.

## 2026-09-17 — Closeout Steps 4–7 negative, device and recovery pass

Completed the closeout negative/recovery and browser acceptance pass for the
bounded local clinic journey. The repaired continuity/checkout/workspace
selector now passes **50 runs / 525 assertions / 0 failures / 0 errors / 0
skips**. A paired boundary selector covering appointment idempotency, stale
writes, visit recovery, Tracking Board ownership, invoice/payment retry,
administrative permissions and provider assignment passes **87 runs / 724
assertions / 0 failures / 0 errors / 0 skips**. Repairs were limited to stale
test fixtures: reschedule cases now use future capacity-backed appointments,
and the workspace assertion now matches the practice-scoped multiple-membership
migration. No runtime guard was weakened.

The retained-session browser smoke matrix passed on desktop, tablet and phone
for `/clinic`, `/clinic/schedule`, `/clinic/work`, `/clinic/billing`,
`/clinic/inventory`, `/clinic/workforce` and `/clinic/telehealth` after the
verified `localhost` loopback selector. The fresh synthetic paid-member flow
also remains browser-proven through payment simulation, Patient Flow, Schedule,
Front desk check-in and the post-arrival Tracking Board row. The first smoke
attempt against `127.0.0.1` did not enable the selector; rerunning against the
running stack's `localhost` host passed, so this is recorded as a harness-host
assumption rather than a product failure.

Steps 6–7 remain bounded: schedule recurrence/overbook/DST policy, clinical
governance, Stripe/provider custody, communications, tax, privacy, retention,
release and pilot decisions have no assigned human owner or external evidence
in this sandbox. They remain deferred/open under the existing decisions and
risk register; no approval or production readiness is inferred.

## 2026-09-15 — Review reconciliation and selected-patient scheduling

Reconciled the [application review](../../docs/product-review/meta-clinic-full-application-review.md) against completed calendar work and recorded the founder-approved Patient Flow → Schedule → Tracking Board terminology in [[Decisions]]. The shared booking form now shows the saved patient name with separately labeled identity details, opens one search only when needed, and preserves the original selection when cancelling a patient change. Browser verification confirmed the future-day booking handoff and Change patient / Keep current patient sequence without logout or date/time loss. One inspected synthetic record has a one-character name stored in registration; no replacement identity was invented. The clinic still needs its intended clinician and availability configured before populated booking verification. Focused frontend checks and their final results are reported in the task handoff; no backend, payment, clinical or launch acceptance is implied.

## 2026-09-15 — In-house Schedule calendar

Implemented a month/day calendar over existing appointments and backend capacity rules, with Patient Flow booking prefills and an arrival-only Tracking Board. The [implementation brief](../../docs/development/clinic-schedule-implementation.md) records FHIR R4 mappings, focused passing calendar/booking tests, frontend build checks, pre-existing wider-suite failures and browser limits. The selected local clinic has no clinician/capacity configuration; no provider or appointment was invented to hide that gap. Populated browser and tablet acceptance remain pending; this is not live or clinical readiness.

## 2026-09-14 — Organization, clinic and location switching

At the founder's request, added one grouped workspace selector for Organization → Clinic → Location. Separate clinic memberships preserve the original assignment; ordinary accounts list their authorized clinics, while the explicitly enabled local Omni session can open other synthetic clinics. Switching clears the old location and stale-tab clinic requests are rejected. The desktop/tablet browser journey verified all three selectors and persisted server context. The selected broad Rails suite exposed failures in billing/scheduling and membership enrollment; those are not completion evidence for this change. Focused checks and the local runtime update are reported in the task handoff. No hosted or real-data release is authorized.

## 2026-09-14 — New weight-loss clinic and continuing-patient journey implemented

Revision 4 was implemented and locally browser-proved in new clinic 5/site 4 with continuing patient 40 across J0–J7. Specialty setup drives visits, forms and shared context; the proof covers account-first signed local payment, distinct handoff, exact content versions, stock reversal/post-closure reconciliation, corrected lab work, included-visit checkout and the same patient's return with disconnected video/manual fallback. Open source-owned billing and clinical work remains explicit. See the [dated outcome](../../records/progress/2026/09/2026-09-14-weight-loss-connected-journey.md), [evidence owner](../../docs/development/patient-journey-implementation-evidence.md), and current brief checkpoint. Focused Rails, TypeScript/build and scoped lint/format checks passed; no live-provider or launch acceptance is claimed.

## 2026-09-14 — Architecture and change-authority decision adopted

D-078 adopts one modular application, a shared non-switchable core, setup-time composition and operation-specific clinic-managed, Meta Clinic-managed and FDE-assisted transitions. The [architecture contract](../../docs/architecture/clinic-capability-architecture.md) and [dated research](../../records/research/2026-09-14-meta-clinic-capability-architecture.md) distinguish U.S.-applicable FHIR semantics from our internal design choices and preserve exact revision-used meaning without requiring legacy development compatibility. Updated product/strategy, architecture routing, guide/matrix, tracker and weight-loss brief revision 4. CF-04/CV-10 add change-authority and exact-use prerequisites with permitted independent work. The earlier execution plan now routes to the current brief. No application code, data reset, runtime/browser checks or task dispatch; document verification is reported with the Git handoff. Pending-research statements in earlier entries below are historical, superseded by this adoption.

The final D-078 documentation pass passed scoped diff checks, vault structure/links/Home reachability, harness validation and 14 harness unit tests. Relative Markdown file targets also passed. Vault size/lifecycle advisories remain; no application tests were needed or run for these document changes.

## 2026-09-14 — Capability lifecycle and complexity requirements saved before research

At the founder's request, paused architecture research to update the existing strategy, guide, decision/tracker and weight-loss brief. D-077 records avoiding routine clinic-specific conversion, bounded variation, historical compatibility and supported reconciliation rather than promising every setting is an instant toggle. Revision 3.1 adds one populated-clinic lifecycle proof; researched patterns remain unadopted pending synthesis/review. No application code, fixtures or runtime verification changed in this document-only update.

## 2026-09-14 — Composable clinic capability map adopted

Expanded the existing [[Meta Clinic Product Strategy and Scope]] rather than adding another product document: shared foundations, independent configuration dimensions, ten clinic examples and the founder's future infusion projection scenario. D-076, PRODUCT, Home, routing, tracker and the engineering contract now require Clinic Setup to evolve with configurable features. SC-04/OP-13 distinguish resource conflicts and service-linked authorization review from global holds or automatic expiration outreach. Reviewed published R4 Schedule/CarePlan and U.S. PAS 2.2.1 for bounded structural guidance; no clinical protocol or vendor conformance claim. Weight loss remains the first implementation assignment; no application code, forecasts or other specialties were built in this documentation turn.

## 2026-09-14 — Weight-loss setup and continuous journey gap plan

Saved [revision 3](../../records/superseded-plans/PATIENT_JOURNEY_PROOF_AND_REFINEMENT.md): a new synthetic weight-loss clinic through Clinic Setup, meaningful setting-driven forms/visits/components and one membership-to-return patient demonstration. D-075 records the founder's clarified outcome; tracker MC-01 and shared CF-01–03 capture configuration gaps without duplicating the matrix. Bounded current configuration/intake inspection and U.S. NIDDK/US Core source review inform the plan; measurement-profile lookup remains unresolved. Prior focused evidence is retained, not replayed. Documentation only; no application changes, fixtures, browser tests or execution dispatch.

## 2026-09-14 — Single execution plan strengthened with skill-test evidence

At the founder's request, revision 2 of [the execution plan](../../records/superseded-plans/PATIENT_JOURNEY_EXECUTION_PLAN.md) combines the original scope/questions with selected dated research, code observations, field/action contracts and paired test cases from the seven-file evaluation. It keeps one checkpoint, preserves the shared matrix owner and original sequence, and separates unapproved scope additions. Test artifacts remain evidence, not required instructions. This is document integration, not fresh clinical-source review or application verification; no implementation was launched.

## 2026-09-14 — Detailed patient-journey execution plan saved

Created the founder-requested [execution plan](../../records/superseded-plans/PATIENT_JOURNEY_EXECUTION_PLAN.md) from the supplied research conversation and its final clarifications. It preserves field/question/control detail, links the shared matrix, and adds bounded execution/acceptance and resume instructions. The earlier tracker summary was not the full assignment document; the isolated skill-test draft is not adopted. Exact source citations and current code reconciliation remain explicitly identified work, not newly claimed verification. No application changes or overnight dispatch.

## 2026-09-14 — Full-journey dependency planning expanded

Expanded the engineering matrix into stable acceptance cases across enrollment, visits, prescriptions, labs, inventory, billing, ownership and integrations, using the founder's exact six columns. Added field-contract and blocker-source requirements, recorded D-074's narrow age/booking rules, and connected the reference journey to the existing tracker. Documentation only; no workflow implementation or overnight dispatch. [Dated record](../../records/progress/2026/09/2026-09-14-patient-journey-dependency-planning.md).

## 2026-09-14 — Ownership and parallel progress requirements

Added D-073 and the engineering guide's shared ownership/dependency matrix. Every workflow must identify responsibility, specific blockers, parallel actions, attention and handoff recovery. The implementation tracker now applies this acceptance requirement across features. [Dated record](../../records/progress/2026/09/2026-09-14-workflow-ownership-and-dependencies.md).

## 2026-09-14 — Vendor-independent workflow preparation adopted

D-072 records the founder's direction to build local insurance, supplier pricing/order, shipment and prescription workflows before vendor access is available. Updated product strategy, engineering acceptance, implementation tracking, PRODUCT and Home. [Dated record](../../records/progress/2026/09/2026-09-14-vendor-independent-workflow-direction.md) distinguishes these requirements from implemented capability; no old proposals were imported.

Home: [[00 Home]] · Work: [[Meta Clinic Implementation Tracker]] · Decisions: [[Decisions]] · Risks: [[Risks and Assumptions]]

Records in `records/progress/2026/09/` are the dated evidence index for current-window outcomes. [[Meta Clinic Implementation Tracker]] owns current workflow status; this log is not a competing register. Earlier references to the retired tracking service are historical only.

## 2026-09-13 — Platform strategy and unified implementation tracking

**Consolidation completed:** four superseded billing/encounter planning documents were moved out of the active vault into the [plan archive](../../records/superseded-plans/README.md), removed from the active index, and their incoming links repaired. No old feature ideas were adopted. The tracker now explicitly treats earlier proposals as historical rather than current requirements. See the [archive manifest](../../records/progress/2026/09/2026-09-13-superseded-plan-archive.md).

Adopted the Meta Clinic product strategy, engineering acceptance guide and consolidated tracker under D-071. Explicitly includes cash-based clinics, hybrid visits, pharmacy/inventory and organization-assigned privileges. Retired external tracking references in active documentation. [Consolidation record](../../records/progress/2026/09/2026-09-13-meta-clinic-strategy-and-tracker.md) records scope and verification limits.

## 2026-09-13 — Account-first membership enrollment clarified

**Founder direction:** select membership, create the account, enter Growth, verify email, then pay. Unpaid customers remain in Growth for staff follow-up. Verified payment moves the customer into patient onboarding using the same account, with no second portal invitation. This supersedes earlier descriptions that placed all portal account creation after payment.

**Implementation/evidence:** [Account-first membership Growth record](../../records/progress/2026/09/2026-09-13-account-first-membership-growth.md) records session-owned resumption, separate account/payment stages, paid queue removal, and verification limits.

## 2026-09-13 — Worker-assisted recurring telephone payment implemented locally

**Outcome:** replaced the worker's reuse of consumer Stripe Checkout with a dedicated Stripe Terminal Mail Order/Telephone Order flow. The assigned worker records recurring-authorization evidence, the previous open consumer Checkout is closed, and Stripe Customer, SetupIntent and subscription identities remain bound to the selected prospect. Card values stay on the Stripe reader. The prospect does not become a patient until the initial subscription invoice is verified paid.

**Evidence:** the focused Rails membership-growth file passed 11 runs / 193 assertions, including a 38-assertion caller-specific payment journey; scoped Ruby style, the focused frontend file, TypeScript type checking and the production build passed. The additive development migration installed without resetting data. Browser inspection verified location selection before clinic entry and the worker's exact recurring amount/cancellation attestation with the payment action disabled until attested. [Failure-first and verification record](../../records/progress/2026/09/2026-09-13-worker-assisted-recurring-phone-payment.md).

**Limits:** source and synthetic local verification only; no real or simulated Stripe reader transaction was performed. Stripe MOTO approval, supported reader setup, authorization-language/legal review, Payment Card Industry Data Security Standard review, tax determination, operations/reconciliation, hosted acceptance, real-patient use and release remain separate gates.

## 2026-09-13 — Prospective-patient rule and verified portal handoff implemented locally

**Outcome:** the membership pipeline now presents every person with a name plus an email address or phone number as a prospective patient until server-verified payment creates a patient. Incomplete Checkout activity remains supporting detail instead of turning the person into a patient or removing the lead. A successful Stripe return now waits for signed payment processing and then continues directly to the existing one-time patient portal password setup; the receipt email retains the same setup link as fallback.

**Evidence:** the two focused Rails journeys passed 2 runs / 55 assertions, covering phone-only prospective-patient capture, pre-payment handoff denial, wrong-reference denial, verified payment conversion, matching browser/email activation, and token removal after activation. The focused frontend file passed 5 tests, TypeScript type checking and the production build passed, the dependency audit reported zero vulnerabilities, the scoped Ruby style check reported no offenses, and PostgreSQL upgrade, concurrency, restore and fresh-database verification passed. [Failure-first and verification record](../../records/progress/2026/09/2026-09-13-prospective-patient-and-portal-handoff.md).

**Limits:** the earlier full focused Rails file was interrupted after the local PostgreSQL idle-in-transaction timeout occurred during development test-account setup; that infrastructure failure was not a checkout assertion. The broader backend invariant verifier separately failed an existing appointment-reservation concurrency check after its invoice-allocation and address-version checks passed. Full-suite, browser payment completion, external email delivery, hosted behavior, live Stripe, clinical/legal/privacy review, real-patient use and deployment remain unverified or unauthorized.

## 2026-09-13 — Public membership checkout configuration and anonymous entry corrected locally

**Outcome:** corrected the Stripe test application programming interface version used to create hosted Checkout sessions and now report configuration and authorization failures without suggesting that a buyer create another payment. The public membership directory and each clinic-specific membership page clear an existing application session before they mount. After the saved restricted test key expired, a strictly development/test-only platform-sandbox route was added for current Stripe Command Line Interface temporary sandbox keys; the real connected-clinic route and its immutable history remain unchanged.

**Evidence:** redacted provider probes identified `401 api_key_expired` for the saved key, then confirmed the replacement temporary sandbox key could read Checkout while Accounts v2 remained forbidden. Ruby syntax, diff integrity and scoped agent checks passed. In Chrome, the anonymous Omni storefront created a new $89 test Checkout Session and visibly redirected to `checkout.stripe.com`, where Stripe displayed the synthetic buyer email plus Card and Pay with card controls. The failure-first record is [here](../../records/verification/2026-09-13-public-membership-checkout-and-anonymous-entry.md).

**Limits:** no card details were entered and Pay was not pressed. No payment, webhook, receipt email, patient record or onboarding task is claimed. The initial focused Rails selection exposed two local-configuration isolation regressions, which were corrected; the final rerun hung after beginning and the two test processes were stopped, so a passing test result is not claimed. The browser evidence is an unclaimed local Stripe sandbox only, not connected-clinic, production, financial, security or release acceptance.

## 2026-09-12 — Clinic-specific membership storefront and dual-path onboarding implemented locally

**Outcome:** added a clinic-specific public membership address, a contact-first lead path, and a purchase-now path. A future-patient entry on the login page now opens a public clinic directory, so people without an account select the correct clinic before seeing its membership page. Contact-first submissions remain outside the patient and billing records. Purchase-now opens a Stripe test Checkout Session; only a verified matching payment creates the patient, active agreement, payment allocation, receipt, one-time portal invitation, receipt email and front-desk follow-up task. Payment return and cancellation pages do not activate onboarding.

**Evidence:** the focused membership, Stripe membership and patient-portal lifecycle regression set passed 31 runs / 235 assertions. The storefront tests also proved mismatched, expired and invalid-payment-evidence Checkout Sessions create no patient or onboarding records, and covered both one-time and automatic-renewal purchases. The future-patient directory's four focused frontend tests passed, alongside Ruby syntax and frontend formatting checks. Frontend type checking, 16 membership/subscription tests and the production build passed for the preceding storefront delivery. Ruby formatting, eager loading and vault verification passed; the full static security scan retained one unrelated existing recall-worklist warning.

**Limits:** local synthetic evidence only. Stripe remains test-only and email used the test delivery adapter. This incremental change's full backend integration run, complete frontend suite, type check, build and browser confirmation remain pending because their local runners orphaned high-CPU processes; an unrelated existing development-login copy assertion also fails. No live payment, external email deliverability, hosted browser acceptance, real-patient use, clinical/privacy/legal approval or deployment is claimed.

## 2026-09-11 — Ten workflow-hardening audit priorities completed locally

**Outcome:** completed the ten software Definitions of Done for unified work intake; a cross-role clinic day; refill closure; the confirmed standards defects; nurse-to-clinician handoff recovery; administration-grade immunization evidence; checkout/follow-up closure; connected orders/results/referrals; reusable attested previsit intake; and capacity/waitlist/no-show recovery. The implementation preserves exact patient, encounter, site and source linkage, fail-closed role/context boundaries, durable ownership, stale/replay protection and explicit recovery paths. [DOD and closeout evidence](../../records/implementation/2026-09-11-ten-audit-dod-closeout.md).

**Evidence:** the final backend risk selection passed 7 runs / 271 assertions with no failures or errors; two focused frontend files passed 11 tests; TypeScript typecheck and final Ruby syntax passed; the test and development migrations installed; and the local browser rendered a synthetic Omni tracking-board → work-inbox → exact linked encounter journey. The repository graph was refreshed. No full suite was run.

**Limits:** local synthetic software evidence only. No hosted acceptance, external provider or IIS transmission, interoperability certification, clinical/legal approval, real-patient use or release acceptance is claimed.

## 2026-09-11 — Ambulatory workflow implementation, verification deferred

Implemented durable refill review, a consolidated work inbox, structured reusable intake, portal education acknowledgment, capacity/waitlist offers and booking, recall history, and guided checkout. Three migrations installed locally. No tests were added or run; runtime/browser acceptance and a verified score remain open. [Implementation boundaries and remaining gaps](../../records/implementation/2026-09-11-workflow-loop-delivery.md).

## 2026-09-10 — New Lightsail synthetic demo deployed

**Final operational checks:** automatic certificate renewal and nginx reload passed the Certbot dry-run; twice-daily renewal timer is enabled. Runtime PostgreSQL role has no superuser, database/role creation, schema creation or audit update/delete authority. Worker launch now uses `bundle exec`; repeated work passes remained running with zero restarts. Portable-delivery, vault-link and agent-harness checks passed; vault hygiene retains advisory findings. The restore test removed only its generated scratch database; the source database and backup remain intact.

**Authorization and outcome:** founder selected AWS account ending 9164 and the $12/month `meta-clinic-demo` instance in us-east-1a. New static IP `184.194.129.57` serves the demo over HTTPS. The requested free sslip.io name and alternate nip.io name failed certificate-provider secondary DNS validation; the valid IP-certificate URL is the working fallback. This is unrelated to the retired collaborator delivery credentials.

**Evidence:** application source `dda1d41c37665cfc8b309b48751ed35a0701c550`; separate API `-lf1` packaging layer normalizes Windows executable line endings. HTTPS login rendered in Chrome and returned 200 externally. Password login, managed synthetic clinic context, anonymous denial, CSRF denial, development-login denial, logout and five concurrent context reads passed before and after API/web/worker restart. A PostgreSQL dump restored into an isolated scratch database, which was then removed. No real data or credentials were recorded. [Runbook and verification scripts](../../ops/lightsail/README.md) preserve the bounded recovery procedure.

**CI and limits:** image publication run [34551328098](https://github.com/joshrice171723-creator/meta_clinic/actions/runs/34551328098) passed after adding Buildx. Earlier full CI run 34548238926 remains red (Rails: 31 failures/13 errors; frontend formatting: 33 files). Deployment is manual; five concurrent reads are not a five-person workflow load test. On-server backups do not survive host loss. No full browser workflow, off-host recovery, HIPAA, clinical or real-patient readiness is claimed.

## 2026-09-10 — U.S. healthcare standards product audit completed

**Outcome:** checked all 64 external URLs in the 60-entry U.S. healthcare reference map and compared the current app, focused tests, healthy local runtime and rendered clinic workflows with the applicable HL7/FHIR, NLM, UCUM, FDA, CDC and CMS guidance. The [product gap audit](../../records/audits/2026-09-10-us-healthcare-standards-product-gap-audit.md) preserves the capability matrix and recommends medication-test repair, administration-grade vaccination records, coded/typed lab results, a real cash-pay estimate workflow and Schedule/Slot-like availability as the highest-value next slices. It also records the current strengths that should not be weakened.

**Observed corrections:** the focused backend selection completed 37 runs / 535 assertions with two medication-administration happy paths failing at authorization; five frontend files passed 15 tests and TypeScript typecheck passed. The rendered signed-encounter path emitted a React `patientLabel` DOM-prop warning. These are audit findings, not completed fixes.

**Limits:** U.S.-only software guidance and synthetic local evidence; no full suite, feature implementation, production use, real patient data, external integration, conformance certification, or professional/legal/clinical approval is claimed.

## 2026-09-10 — Standards-guided healthcare development adopted

**Reference-map follow-up:** added a [U.S. healthcare reference map](../../docs/development/us-healthcare-reference-map.md) with 60 source entries, direct URLs, reading targets and current app route/component pointers. At the founder's clarification, supplied links were treated as starting points for broader exploration of HL7, NLM, UCUM, FDA, CDC and CMS, including labeling, terminology services, recalls, barcodes, outpatient precautions and self-pay estimates. Review depth, R4/R5 differences, global-standard applicability, foreign-country exclusions and unreviewed downloads are explicit. This is developer research/navigation, not an implemented-feature or conformance audit.

**Outcome:** D-066 records the founder's direction to make relevant FHIR implementation guides a primary design input. Root agent instructions and the developer entry point now route to a practical source-to-data/UI/verification procedure, with official terminology and operational references for services, medication administration, vaccination and laboratory setup.

**Same-day clarification:** the founder restricted reference review to U.S. applicability. Root instructions and the procedure now require U.S. guide selection, relevant federal/state authority and explicit applicability for global technical standards, excluding other countries' requirements and examples.

**Limits:** documentation and source applicability guidance only; no application behavior changed and no retrospective conformance or clinical review was performed.

## 2026-09-10 — Cash-clinic core separated from optional insurance workflows

**Outcome:** added a tenant-scoped, versioned clinic-model selection that keeps the cash-pay ambulatory core on and lets an administrator opt the clinic into insurance workflows from Facilities. The clinic context now exposes the effective selection. A focused API check passed 2 scenarios and 20 assertions covering default-off behavior, immutable core availability, replay safety and stale-edit rejection. The [cash-based ambulatory workflow review](../../records/audits/2026-09-10-cash-based-ambulatory-user-workflow-gap-review.md) scores ten user journeys and prioritizes refill closure, a unified work inbox, digital forms, waitlist/capacity handling and recall/care-gap work.

**Limits:** this slice establishes the clinic-level selection; existing payer objects and future insurance screens still need consistent route and navigation enforcement before the module is fully gated. Frontend typecheck was blocked by an incomplete local dependency install that omitted Material UI icon declarations; no hosted or real-patient acceptance is claimed.

## 2026-09-10 — External AWS delivery retired

**Outcome:** removed active AWS CLI, CloudFormation, EC2/ECR/SSM operations and the AWS-targeted staging/production workflows. GitHub access inspection showed only the founder as collaborator and no Actions secrets, variables, environments, deploy keys or webhooks. Added manual, commit-tagged API/web publication to the founder-owned GitHub Container Registry and provider-neutral Compose packaging that binds only to loopback by default.

**Limits:** the referenced AWS account is not accessible from this machine, so AWS-side identities, resources, retained data and billing were not inspected or changed. No replacement host, TLS, backup service, deployment, migration, public access or production acceptance is claimed. Historical records and Git history remain intact.

## 2026-09-10 — Hardened clinic behavior paths verified

**Outcome:** five focused database-backed regression paths now cover the security-hardening risk surface: billing draft idempotency and stale-write protection, forbidden patient-write integrity, tenant-safe inventory exception filtering, nested tenant-scoped inventory paths, and workforce `HEAD` sensitive-read auditing. The managed environment was healthy; the four combined clinic scenarios passed 19 assertions, the isolated billing lifecycle passed 10 assertions, and the workforce scenario passed 3 assertions. Focused RuboCop, scoped diff integrity, and CI security/static-analysis completed successfully.

**Limits:** no broad suite or frontend reformatting ran. CI retains separately known formatting drift in unrelated frontend files, which this batch deliberately preserves. No hosted deployment, provider execution, real-patient use, or human clinical/release acceptance occurred. Detailed evidence and scores are in [the ambulatory workflow review](../../records/audits/2026-09-09-ambulatory-market-nurse-workflow-and-data-model-review.md).

## 2026-09-10 — CI security findings repaired

**Outcome:** replaced request-influenced raw SQL construction in inventory location paths and inventory exception counts/results/totals with tenant-scoped Ruby projection or fixed templates plus bound values. Billing balance expressions are immutable and selected only through enumerated sort modes. Workforce sensitive-read classification now treats `HEAD` consistently with `GET`. Brakeman completed with 0 errors / 0 warnings, down from the prior CI result of six warnings; focused RuboCop and Ruby syntax passed over all four changed files.

**Limits:** no broad suite or frontend formatting churn ran. The local test PostgreSQL endpoint remains unavailable, so database-backed behavior is left to the pushed commit’s Linux CI gate and is not claimed locally. No AWS access, hosted deployment, provider execution, real-patient use, or human clinical/release acceptance occurred. Detailed evidence and scores are in [the ambulatory workflow review](../../records/audits/2026-09-09-ambulatory-market-nurse-workflow-and-data-model-review.md).

## 2026-09-10 — Host continuity attestation bound to promotion

**Outcome:** a successful remote release now returns one machine-readable host attestation through SSM. The workflow validates its release generation, exact API/web image URIs, environment, and staging continuity fingerprint before recording success. Staging and production each preserve a non-overwritable per-generation SSM record before updating the latest pointer, and production promotion refuses a staging receipt without matching host continuity evidence. Delivery-role permissions remain constrained to their environment’s exact latest and history paths. The focused release suites passed 11 tests; the standalone gate, Python compilation, normalized shell syntax, and scoped diff integrity passed.

**Limits:** this batch establishes the evidence chain but does not generate hosted evidence by itself. No AWS request, image push, deployment, hosted recovery, provider execution, real-patient use, or human clinical/release acceptance occurred. Detailed evidence and scores are in [the ambulatory workflow review](../../records/audits/2026-09-09-ambulatory-market-nurse-workflow-and-data-model-review.md).

## 2026-09-10 — Staging continuity evidence hardened

**Outcome:** the staging continuity receipt now binds the durable-state fingerprint to the exact API/web digests and release generation, is installed atomically without overwrite, and fails closed when restart readiness times out. PostgreSQL backups must also parse successfully through `pg_restore --list` before release work proceeds. The identity availability response now remains a JSON boolean for accounts without membership, and the staging-demo check distinguishes intentionally granted clinical capabilities from intentionally absent elevated privileges. The five-test offline release gate, standalone source gate, Python compilation, normalized Bash syntax, Rails autoload, focused RuboCop, and scoped diff integrity passed.

**Limits:** the focused staging integration file could not start because the local test PostgreSQL endpoint rejected the configured passwordless connection; no assertions from that file are claimed. No broad suite, AWS access, hosted deployment, provider execution, real-patient use, or human clinical/release acceptance occurred. Detailed evidence and scores are in [the ambulatory workflow review](../../records/audits/2026-09-09-ambulatory-market-nurse-workflow-and-data-model-review.md).

## 2026-09-10 — Staging continuity gate prepared

**Outcome:** the staging release path now runs an image-owned, staging-only clinic-readiness command that verifies the managed reviewer authorization, minimum clinic dataset, PostgreSQL runtime identity and schema without emitting record content. It fingerprints durable record identities, restarts API and clinic worker, requires the same fingerprint after readiness returns, and archives a mode-0600 receipt on the encrypted data volume before acknowledging the release. Missing, changed or unavailable evidence stops the application. Focused receipt checks passed 2 runs / 8 assertions; the five-test offline release gate, standalone source gate, Python compilation, normalized Bash syntax, Rails autoload, RuboCop and scoped diff integrity passed. Detailed limits and scores are in [the ambulatory workflow review](../../records/audits/2026-09-09-ambulatory-market-nurse-workflow-and-data-model-review.md).

**Limits:** no AWS or hosted environment was accessed and no deployment occurred. The complete launcher suite requires Linux symlink/mode behavior and was not executable on this Windows host; CI remains its execution gate. A broader existing production-demo file run also retained two unrelated baseline expectation failures. This is deployable source evidence, not a hosted continuity result, human staff acceptance, real-patient authorization, security/privacy approval, or clinical/release acceptance.

## 2026-09-10 — Shared synthetic visit and managed recovery rehearsed

**Outcome:** local role-account preparation now preserves one shared fictional Morgan Juniper encounter with explicit history reviews and vital-sign evidence. In the rendered app, Clinical Staff completed intake revision 1 and requested handoff; a separately selected Clinician accepted it, recorded and reviewed a critical-low fictional lab result, and left follow-up open. The managed launcher then restarted checkout-owned API, web, worker, and database services successfully; after reload, the signed-in staff session and recorded workflow state remained available. The focused role-account test passed 7 runs / 91 assertions, Rails autoload and changed-file RuboCop passed, and scoped diff integrity passed. Detailed evidence and updated readiness scores are in [the ambulatory workflow review](../../records/audits/2026-09-09-ambulatory-market-nurse-workflow-and-data-model-review.md).

**Limits:** this was a local synthetic rehearsal operated through development role selection, not independent human RN/LVN/MA acceptance or hosted operation. Clinical Staff could see the reviewed lab and open follow-up but could not perform the clinician-only chart action. No broad suite, hosted deployment, production provider execution, real-patient use, or clinical/release approval is claimed.

## 2026-09-10 — Clinical plan lifecycles and nurse handoff expanded

**Outcome:** added tenant-scoped, immutable lifecycles for medication requests, service requests and referrals, encounter diagnoses, procedure outcomes, care plans, care goals, and immunizations. Active orders create durable execution tasks; explicit fulfillment links connect requests to statements, administrations, lab reports, procedures, or documents; append-only referral exchange events preserve the closed loop. The nurse workspace links to the clinical plan workspace, and operations staff can return to the owning encounter with exact focus restoration. Focused backend verification passed through 119 assertions for the completed clinical-plan suite, Rails autoload and changed-file RuboCop passed, frontend typecheck and production build passed, and rendered Omni journeys proved referral activation, source return, immunization capture, and referral exchange.

**Limits:** automated six-role boundaries and Omni workflows are not a human RN/LVN/MA or prescribing-clinician acceptance session. The managed-launcher concern recorded with this earlier batch was closed by the later shared-visit recovery rehearsal; the route contract still has unrelated pre-existing drift, and hosted operation, production provider execution, clinical/release approval, and real-patient use remain unproven. Detailed evidence and updated scores are in [the ambulatory workflow review](../../records/audits/2026-09-09-ambulatory-market-nurse-workflow-and-data-model-review.md).

## 2026-09-09 — Core clinic-journey contract reconciled to current source

**Outcome:** reconciled [Clinic Encounter Workflow Contract](../../records/superseded-plans/Clinic%20Encounter%20Workflow%20Contract.md) with the already-integrated technical journey at commit `60ce937`: registration, appointment/check-in, vitals, SOAP revision/signature, administrative checkout, and encounter follow-up. The updated note identifies the current permission boundary for Front Desk Coordinator, Clinical Staff, Clinician, Billing & Accounting, and follow-up ownership; it also records the server-owned working-copy and exact-retry fallback. Detailed local synthetic implementation and browser evidence remain in [Dependable clinic visit](../../records/audits/2026-09-09-dependable-clinic-visit.md).

**Limits:** this documentation reconciliation adds no clinical policy, credentialing, diagnosis/discharge semantics, provider integration, real payment, hosted operation, privacy/security approval, or real-patient pilot authority. The original proposed route/state material remains preserved as historical planning context where the implemented slice does not supersede it.

## 2026-09-08 — Telehealth provider choice clarified

The founder selected Twilio Video to reuse the existing messaging account and avoid a separate Daily account (D-063). Existing local messaging configuration contains test credentials; that is not evidence of Video activation. Existing OpenRouter configuration remains the selected Scribe route. The change is confined to the isolated telehealth checkout while the APPly audit remains separate. [Local operation](../../josh_current_work/telehealth/LOCAL_OPERATION.md) records configuration and [implementation evidence](../../josh_current_work/telehealth/IMPLEMENTATION_EVIDENCE.md) distinguishes checks from live-provider proof. Account access attempts through Chrome and Windows Computer Use timed out before a dashboard could be inspected; no account was created or live call established by those attempts.

## 2026-09-03 — Shortcut OAuth recovery added to agent coordination

**Request and outcome:** after the configured Shortcut refresh token was rejected, the founder directed `/startdev` and shared coordination to reconnect agents as needed. The current host completed `codex mcp login shortcut`, refreshed the tool catalog in the same task, and verified the authenticated APPly user and Agent Workspace team. The `startdev` skill, Shortcut workflow and developer documentation now permit one bounded login attempt for the exact enabled endpoint and existing `read`, `story-write` and `comment-write` scopes before treating Shortcut as unavailable; harness checks preserve the command contract.

**Verification and limits:** the component-selected harness, vault, audit and diff checks passed before this entry and are rerun after it. Valid credentials may refresh without human input, but a rejected refresh token still requires any OAuth account-consent step imposed by Shortcut, Codex or the active host; no skill may bypass that safeguard. Agents may not widen scopes, handle tokens directly, persist authorization material, accept a changed identity/team or write without a verified Story claim. This recovery adds no deployment, hosted-data, production, workspace-administration or professional authority. Decision: D-057.

## 2026-09-03 — Billing package consolidated to Luna-only execution

**Audit:** reconciled the package and test plan with the current source and recent commits `d0e9923`, `b6c03b6`, and `e490f4b`. The check/OCR slice is accurately limited to a metadata-only, fail-closed adapter boundary; provider execution, image custody and payment handoff remain blocked. The card slice is accurately recorded as a synthetic provider-neutral intent/signature/event boundary only; its focused Rails test passed 8 runs / 41 assertions, but no Stripe account, credentials, webhook route, or APPly ledger application is enabled. Cash receipt HTML remains locally implemented, while the approved production receipt/PDF/version/reissue/delivery contract remains blocked.

**Process correction:** removed stale secondary-agent escalation instructions from the billing package/test plan and aligned them to the current Luna-only rule: Luna owns bounded implementation, repair, audit and acceptance; unresolved failures stop for user direction. No portal, inventory or application source was changed.

## 2026-09-03 — Offline release-readiness gate added

**Implementation:** added `ops/aws/ec2/release_readiness.py`, a credential-free source gate that checks manual main-only staging/production workflows, pinned deployment actions, exact API/web promotion digests, non-root image boundaries, API/web readiness endpoints, PostgreSQL pre-release backup and isolated restore contracts, failed-release stop behavior, and high-confidence secret/key markers. It also verifies that operational command failures carry sanitized-output contracts and that host scripts keep strict mode, restrictive umask and no shell tracing. The CI delivery-contract job now runs this gate and includes only the required Docker/runtime/configuration files in its sparse checkout. No hosted credentials, external services or production state were accessed.

**Verification:** `python3 -B ops/aws/ec2/release_readiness.py` passed; its four regression tests passed directly (`python3 -B -m unittest ops.aws.ec2.test_release_readiness`). The broader offline discovery run is not claimed as green on this Windows host because existing launcher tests require symlink privilege and the review-access test imports Unix-only `grp`; those environment failures are outside this slice. No application, migration, portal, inventory or billing source was changed; a sanitized error path was tightened in `verify-review-edge.py` so captured nginx probe output cannot surface raw diagnostics.

**Limits / next gate:** this is offline source-contract evidence only. It does not inspect AWS/GitHub settings, hosted logs, secret-manager values, image scan findings, backups, restore media, alert delivery, browser behavior, clinical/privacy/security acceptance or production authorization. Run the gate again on the exact release commit, then complete separately authorized staging/production and recovery evidence.

## 2026-09-03 — Check intake/OCR boundary prepared without provider authority

**Implementation:** because no scanner/OCR provider or check-image policy is approved, added only the provider-agnostic `Clinic::Billing::CheckIntake` validation/redaction boundary and fail-closed `Clinic::Billing::CheckOcrAdapter`. It accepts synthetic exact-decimal metadata and bounded opaque references, rejects image/blob/object and unknown fields, and returns only redacted status/field-presence evidence. It adds no route, model, migration, upload, external call, payment event, or stored check image.

**Verification:** dependency-light Ruby/Minitest gate passed 4 tests / 16 assertions; both Ruby syntax checks passed; targeted RuboCop passed 2 files / 0 offenses. The initial Rails test-helper attempt was blocked by the existing local PostgreSQL test connection at `127.0.0.1:54329` with no password, so no Rails integration or browser result is claimed. No real check, bank data, provider credential, or external service was used.

**Limits / next authority:** this is a safe implementation seam, not OCR execution or check-payment acceptance. A future increment needs explicit provider ownership/environment, required fields, image transport/custody, retention/deletion, access/audit, unknown-outcome handling, and payment-ledger handoff decisions. Package/test-plan rows remain blocked for those policy-dependent portions.

## 2026-09-03 — Patient portal request workflow added locally

**Implementation:** added a synthetic-only patient portal request record with Rails-encrypted content, SHA-256 idempotency compatibility, practice/patient/identity foreign keys, pending/in-review/resolved/declined states, and a same-origin `GET/POST /api/patient_portal/requests` contract. The portal now lets the assigned synthetic patient submit a general question or refill request and see request status without exposing message bodies or claiming clinical approval. The shared form helper supports nested idempotency keys for retry-safe patient writes.

**Verification:** the additive migration was applied to the local PostgreSQL development and test databases; `db/structure.sql` includes the table, constraints, indexes, and foreign keys. Ruby syntax, TypeScript typecheck, and Zeitwerk eager loading passed. The focused Rails integration run remains inconclusive under the shared local test database's long-lived transaction/CSRF test-process contention; no endpoint assertion result is claimed. Frontend production build and full Vitest completion remain pending this closeout. No real patient, message, refill, provider, or production data was used.

**Limits / next gates:** this is a request intake queue, not chat delivery, prescribing, or refill approval. Staff triage/outbox integration, attachment policy, response SLA ownership, e-prescribing authority, invitation/step-up/recovery/revocation, Stripe/webhook reconciliation, intake signatures, authoritative booking/inventory holds, clinician release/PDF/superbill workflows, lab authority, browser acceptance, and production privacy/security/accessibility/operations approval remain open.

Home: [[00 Home]] · Roadmap: [Shortcut](https://app.shortcut.com/apply-1/roadmap) · Decisions: [[Decisions]]

Newest entry first. Record actual changes and results, not projected achievements.

## 2026-09-03 — Manager cash-drawer discrepancy reconciliation

**Implementation:** added the additive `20260903000800_add_cash_drawer_reconciliation` migration and Rails-authoritative `POST /api/clinic/cash_drawers/:id/reconcile` operation. Staff may close a short/over drawer; an authorized manager can later record a required resolution note and request key. The server locks the closed session, preserves expected/count/discrepancy exactly, records reconciled status, reviewer identity, and server time, rejects open/tenant/capability/conflicting-replay requests, and returns the same result for an identical replay. The MUI cash workspace retains closed drawers after refresh and presents the manager reconciliation form only with `billing_cash_reconcile`.

**Commits:** `d3ece10` implemented the migration/model/serializer/controller/route/UI and focused administrative integration; `52653b2` allowed reconciliation-only managers to read drawer state without collection authority; `22ed77e` completed the frontend capability contract. Each was pulled safely and pushed to `origin/main`. No portal files were staged.

**Verification:** `npm test -- billing-dashboard.test.ts` passed (1 file / 6 tests); `npm run typecheck` and production build passed with the existing large-bundle warning; `bin\verify-vault` and `git diff --check` passed. The first focused Rails run exposed one real authorization defect: the new capability was not registered in `Ability::PERMISSION_RULES`; Luna fixed it in `3b27ed5` and Ruby syntax passed. A bounded rerun produced no completion output and was stopped safely, so Rails manager assertions remain inconclusive rather than claimed green. No unrelated migration was applied. Live browser acceptance remains blocked by the previously recorded Loading/API-context issue. No external coding-agent testing or real data was used.

## 2026-09-03 — Phase 1.5 final Luna web gate

**Verification:** the existing Phase 1.5 draft-edit and unapplied-allocation UI was rechecked after the shared checkout exposed the complete `8855fa8` surface. `npm test -- billing-dashboard.test.ts` passed 1 file / 6 tests; `npm run typecheck` passed; `npm run build` passed with the existing large-bundle warning. No cash behavior or portal files were staged.

**API limit:** the focused Rails rerun could not start because the shared test database has pending concurrent patient-portal migrations. This is recorded as an environment blocker, not a billing assertion result. The scoped API implementation and synthetic test commits remain `e9149b7` and `ea2ddfc`; unrelated portal edits were preserved.

## 2026-09-03 — Patient portal critic fixes closed

**Repairs:** converted `datetime-local` appointment inputs to offset-bearing ISO timestamps at submission, added structured JSON rescues for patient-portal parameter/record/uniqueness/context failures, split read capabilities from the appointment-request write capability, removed internal message request keys and dispatch state from the patient projection, restricted result projection to completed encounters, added the page main landmark, responsive narrow layouts, and exact string-preserving currency display.

**Verification:** the fresh Impeccable adversarial review found the issues above; all were addressed. Full web tests passed 13 files / 155 tests, typecheck and production build passed, Ruby syntax and Zeitwerk eager loading passed, and Git whitespace checks passed. Rails integration execution remains inconclusive under local concurrent transaction/lock contention.

## 2026-09-03 — Patient appointment-request fallback added

**Implementation:** added a patient-scoped `appointment_requests` record and API under the synthetic portal. Requests carry an idempotency key, preferred time window, optional site/service, pending review state, composite practice/patient/identity foreign keys, overlap protection against scheduled/confirmed appointments, and an audit event. The portal now offers a preferred-window form and shows the latest request without claiming that a booking occurred.

**Limits:** this is the roadmap's staff-confirmation fallback, not real-time booking. Provider calendars, inventory holds, cancellation/reschedule policy, intake signatures, and appointment authority are still required before changing a request into a booked appointment.

## 2026-09-03 — Synthetic patient portal vertical slice implemented

**Implementation:** added the local/test-only patient portal identity binding and a dedicated synthetic patient login. Rails resolves one practice/patient identity from the signed session and returns a narrow projection of upcoming appointments, exact-decimal billing ledger, intake status, released SOAP summaries, encrypted observation results, active medications, and message metadata. The React/MUI portal renders bounded states; payment collection remains disabled pending a processor boundary.

**Limits / blockers:** this is synthetic development evidence only. Invitation/recovery/revocation lifecycle, payment collection, intake signatures, clinician release workflow, outbound messaging/refills/results, real data, and release remain gated.

## 2026-09-03 — Vault control, developer and evidence planes separated

**Implementation:** on `codex/vault-architecture-cleanup`, three Luna Medium subagents split current developer mechanics into `docs/`, detailed dated evidence into `records/`, and compact current product context into the vault. D-058/T-51 add machine-readable routing, nested docs/records policies, a repeatable knowledge-maintenance workflow and a vault hygiene audit. Stable vault titles/headings remain as compatibility pointers; all task and source IDs were preserved.

**Evidence and limits:** the active Markdown vault fell from 1,375,517 to 722,828 bytes (47%), while full moved material remains versioned under `docs/` or `records/`. Vault, harness, ops-contract and whitespace validation pass; the [cleanup manifest](../../records/vault-cleanup-2026-09-03.md) records exact results and the intentionally retained roadmap size candidate. No application behavior, deployment, production data or release authority changed. The unrelated concurrent `.obsidian/workspace.json` UI-state edit was excluded.

## 2026-09-03 — Startdev synchronization streamlined

**Request and implementation:** the founder clarified that `$startdev` exists to synchronize the current development branch with `main`/its configured upstream and start a clean local development environment. D-057 now automatically merges an upstream divergence on a clean checkout, preserving local development commits; only a merge conflict stops reconciliation. The generated `db/structure.sql` was refreshed from the merged migrations, and Bundler's self-checksum normalization remains accepted as metadata rather than a dependency-resolution change.

**Limits and evidence:** no upstream commit was pushed. Dirty working changes and external dependency downloads still require their existing explicit confirmations; detached/no-upstream/fetch/fast-forward/merge-conflict guards remain. Harness/vault/whitespace and bundle checks were run. The broad Rails suite exposed unrelated cash-billing architecture-contract drift after test-database preparation; it was preserved as a failure, not repaired or treated as `startdev` acceptance.

## 2026-09-03 — Startdev locked-dependency recovery added

**Request and implementation:** D-057 now makes `$startdev` pause on a Bundler missing-locked-gem failure, identify the exact dependency/version, configured registry/checksum provenance and application use, then offer a frozen install before resuming the managed refresh. The direct helper remains non-installing. The first observed trigger was `csv 3.3.6`, declared from `https://rubygems.org/` with its lockfile SHA-256 and used because Ruby 3.4 no longer provides CSV as a loadable default gem; APPly uses it for its synthetic bulk-seed CSV loader/generator.

**Limits and evidence:** a registry/checksum match is lockfile provenance, not independent security acceptance. The recovery uses `BUNDLE_FROZEN=true bundle install`, which may download other missing locked gems and requires explicit user confirmation. The observed `csv` install normalized only Bundler's own `4.0.15` checksum entry; `bundle check` passed and `csv 3.3.6` loaded, so D-057 now treats that exact metadata-only diff as expected. Any dependency-resolution change remains a stop condition. The failed refresh did not replant the local development database or start Rails/Vite.

## 2026-09-03 — Cash-pay local boundary hardening completed

**Implementation:** added a practice-scoped `request_key` to cash tenders with a unique index and nonblank/length constraint. Rails now rejects replay attempts that change drawer, tender, change, patient, invoice, or allocation intent. The MUI cash workspace now requires an explicit physical-site drawer selection when multiple open drawers exist; it no longer silently chooses the first drawer.

**Evidence:** focused Rails gate passed 5 tests / 51 assertions / 0 failures for replay mismatch, atomic rollback of payment/allocation/tender/receipt writes, invalid financial input, over-refund and non-cash rejection, one-open-per-site plus separate-site behavior, closed-drawer rejection, and read-only/cross-practice denial. `npm test` passed 13 files / 155 tests; `npm run typecheck` and `npm run build` passed; build retained only the existing large-bundle warning. `bin/verify-vault` and `git diff --check` passed. Commits `40f8549`, `59d10b2`, `3332962`, and `2fec7e6` were pulled safely, committed, and pushed. Adjacent receivables commits `02c06f8`, `869bc4c`, `5bcce08`, `d637a99`, and `04a8515` are now upstream but outside this cash scope. The current checkout still has unrelated patient-portal edits, so the worktree is not claimed globally clean.

**Limits:** the normal Rails schema-dump task still reports the known local `pg_dump` PATH issue; the schema snapshot was regenerated through the running synthetic PostgreSQL container and committed. Live browser acceptance remains blocked by the previously recorded Loading/API-context issue. No escalation was needed because Luna's implementation and audit passed. Check/OCR, production invoice/receipt document rules, superbill, Stripe, portal, real data, and release remain blocked.

## 2026-09-03 — Cash-pay implementation package reconciled

**Documentation:** reconciled the implementation package and its test plan against the actual local cash routes, migrations, models, services, UI controls, and focused evidence. The package now distinguishes shipped local cash behavior from future generalized payment-source, check/OCR, receipt/PDF, processor, portal, and release contracts. It records the local drawer state (`open → closed` with retained count/discrepancy), concrete route map, current schema additions, browser blocker, and the remaining authority gates.

**Workflow rule:** Luna is the sole coding, audit, and testing agent. A bounded coding defect gets up to three Luna repair/test attempts; if it remains unresolved, the slice stops for user direction. No secondary coding agent is used.

**Verification:** vault documents were checked with `bin/verify-vault`, whitespace was checked with `git diff --check`, and only the three cash-pay vault documents are included in this documentation commit. Unrelated patient-portal/receivables work and its local draft-invoice commit were preserved and not staged. The package remains active because later phases require authority that has not been approved; the local cash increment is complete within its stated boundary.

## 2026-09-03 — Luna defect repair and adjacent billing audit

**Defects and repairs:** Luna audited the adjacent billing commits and found two real defects: aging filters did not align with the displayed floored 31/61/91-day buckets, and the cash-tender replay-key migration could fail forward deployment when existing rows were present. Luna repaired both in `bdab67d` (boundary predicates plus legacy-key backfill) and `f4ceb34` (boundary assertion), then pushed them.

**Verification:** the repaired age-boundary test passed 1 test / 9 assertions; web billing tests passed 6 tests; `npm run typecheck` passed. Luna also audited invoice audit history in `e715970`; no coding defect was found. A broader Rails workspace run was inconclusive only because local PostgreSQL setup encountered an unrelated lock timeout before assertions; no escalation was warranted. No patient-portal files were touched or staged.

## 2026-09-03 — Patient portal implementation roadmap prepared

**Request and outcome:** translated the requested concierge/cash-pay patient portal into a preserved proposal record and Shortcut Roadmap Stories. The plan sequences portal identity/lifecycle, ledger/Stripe and unapplied credit, intake/booking/inventory holds, clinician-released visit summaries and financial documents, then bounded messages/refills/results. It gives each slice explicit scope, likely blockers, failure cases, fallback, and exit evidence rather than assuming a 12-week build or a final compliance-polish phase.

**Evidence and limits:** the roadmap is grounded in the current synthetic staff-side clinic, cash-pay ledger, scheduling, inventory, and encounter-draft baseline, plus the existing access, operations, and workflow gates. It adds R-14 for the risk of treating patient portal work as ordinary frontend work. It does not select an identity vendor, processor, scribe/lab/e-prescribing integration, production environment, clinical content policy, payment/tax policy, or accepting reviewer; it neither implements features nor authorizes patient data, charges, clinical content, HIPAA/security acceptance, or release.

**Next action:** obtain the Milestone 0 lifecycle/identity and support-policy inputs, then implement only the synthetic authorization-model slice with its tenant, recovery, revocation, audit, and browser evidence.

## 2026-09-03 — Cash-pay billing test gate and Luna review completed

**Verification:** ran the package-specific [Cash-Pay Billing Test Plan](../../records/superseded-plans/Cash-Pay%20Billing%20Test%20Plan.md) against the local synthetic checkout. The focused Rails administrative/billing integration passed 10 tests / 92 assertions. A prior test-only repair commit `f7584af` addressed two CRLF-sensitive, non-billing web assertions; Luna audited the patch and independently reran the full web suite (13 files / 155 tests), typecheck, diff check, and the cash Rails test (1 test / 19 assertions); all passed and Luna found no defect or scope creep. Production build, high-severity npm audit, `bin/verify-web`, `bin/verify-vault`, `git diff --check`, and the Impeccable detector passed.

**Failures and limits:** the first web suite run failed only in two source-text tests because Windows CRLF did not match LF-only expectations; the test-only repair is now closed by Luna's audit. The repository-wide formatter check still reports pre-existing drift in 58 web files, so no mass-format change was made. The backend race/restore helper produced no output for approximately four minutes and was stopped after no active scratch database remained; it is recorded Inconclusive, not Pass or a coding issue. The local browser stayed at Loading without API context, so UI acceptance is still blocked. Unapproved production document, check/OCR, superbill, Stripe, portal, real-data and release gates remain unchanged.

## 2026-09-03 — Cash-pay billing test plan added

**Request and implementation:** added [Cash-Pay Billing Test Plan](../../records/superseded-plans/Cash-Pay%20Billing%20Test%20Plan.md) as the verification companion to [Cash-Pay Billing Implementation Package](../../records/superseded-plans/Cash-Pay%20Billing%20Implementation%20Package.md). It maps the implemented ledger, cash tender/change, idempotency, refund, drawer close, receipt, authorization, UI and regression surfaces to positive, negative, tenant, replay, transaction, browser and operational checks. It defines Pass, Fail, Blocked and Inconclusive evidence states, a Luna-only bounded repair/review loop for reproducible failures, and explicit local-synthetic exit criteria.

**Limits:** this entry records the plan, not test completion. The plan preserves the known boundary that check scanning/OCR, approved invoice/receipt document rules, superbill, Stripe, portal, real data and release remain blocked. The first gate run will update the matrix with actual commands and results.

## 2026-09-03 — Cash-pay drawer, receipt, and staff workflow implemented

**Implementation:** completed the locally-authorized cash portion of [Cash-Pay Billing Implementation Package](../../records/superseded-plans/Cash-Pay%20Billing%20Implementation%20Package.md). Additive Rails records now preserve per-site cash-drawer sessions, immutable cash tender/change evidence, and immutable cash-payment/cash-refund receipt records beside the established invoice/payment-event/allocation ledger. The internal Billing workspace can open one drawer per site, record cash against a posted invoice, calculate change server-side, open a scoped printable receipt, close with a recorded short/over variance, and show the server-derived expected cash. The patient financial ledger identifies only locally evidenced cash payments and receipt availability, enabling a cash-only refund control without exposing external processor references or assigning a source to historical payment events.

**Evidence:** focused synthetic integration coverage exercised drawer open, cash payment/change, same-request replay, cash refund, printable receipt with `Cache-Control: no-store`, expected cash, and non-blocking discrepant close. The patient-ledger regression passed with its new cash/receipt indicators; TypeScript typecheck, production Vite build, changed-file Prettier, Git whitespace, and Impeccable detector passed. The focused cash test previously passed; a later repeat did not finish inside the local command window despite PostgreSQL showing no lingering `apply_test` activity, so it is not double-counted as new evidence. The local browser page remained at Loading because its API context was unavailable, so no visible browser acceptance is claimed.

**Limits and next authority:** this is synthetic local cash evidence, not permission to operate a real drawer. Receipt HTML is not the approved production receipt/PDF/reprint/delivery design. Check scanning/OCR/image custody, invoice numbering/service-date policy, receipt content/version/delivery, correction/reopen governance, superbill, Stripe, portal, real data, and release remain blocked until accepted separately. The package's whole-milestone table is updated as the source of truth.

## 2026-09-03 — Phase 1 patient financial ledger implemented

**Implementation:** delivered the first bounded cash-pay billing slice from [Cash-Pay Billing Implementation Package](../../records/superseded-plans/Cash-Pay%20Billing%20Implementation%20Package.md). Rails now exposes `GET /api/clinic/patients/:id/billing_ledger`, a `clinic-patient-ledger-v1` projection scoped through the current practice and existing `billing.read`/legacy `patients.read` capability boundary. It reads the current invoice, invoice-line, allocation, credit-note, payment-event, and refund-event records with exact-decimal strings; derives a posted invoice balance from posted lines minus allocations and credits; and does not expose the stored processor reference. The React Patient balances surface now uses that projection for identity-only lookup, selected-patient balance summaries, an invoice ledger/detail, payment allocation history, payment-level refund history, and explicit empty/loading/error states. No financial write path was added.

**Evidence and limits:** TypeScript typecheck and production Vite build pass; changed frontend files pass Prettier; Impeccable mechanical detection returned no findings; local synthetic desktop and 768 px narrow browser checks confirmed selection, loading, empty-ledger, and bounded layout behavior. A focused Rails integration regression was added for permission-scoped projection, exact totals, credits/refunds, and omission of `external_event_reference`; final focused Rails execution/commit/push evidence is pending at the time of this entry. The project-wide Prettier command still reports pre-existing formatting drift outside the changed files. No migration, cash drawer, tender/payment collection, receipt/superbill, Stripe/processor integration, real payment, real/confidential data, deployment, or release approval occurred.

## 2026-09-03 — Cash-pay package reconciled with current local ledger

**Request and outcome:** performed a read-only inspection of the active synthetic `apply_development` PostgreSQL billing tables and current allocation operation before revising [Cash-Pay Billing Implementation Package](../../records/superseded-plans/Cash-Pay%20Billing%20Implementation%20Package.md). The package now records the confirmed bigint/practice/patient/exact-decimal ledger shape, unique `(practice_id, external_event_reference)` payment idempotency, existing locked allocation behavior, separate credit/refund history, and the actual absent records needed for payment sources, drawers/tenders, processor events/intents, receipts, invoice numbering, and service dates.

**Limits:** the database contains synthetic records only; no row content, payment credentials, real data, migrations, application code, payment, receipt, processor configuration, or hosted environment was changed. The selected source-table design deliberately leaves existing payment events source-free rather than inventing historical payment methods; a processor event remains unapplied until verified and reconciled.

## 2026-09-03 — Cash-pay billing implementation package prepared

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-03%20%E2%80%94%20Cash-pay%20billing%20implementation%20package%20prepared>) · IDs: none recorded in heading/body excerpt.

## 2026-09-03 — Startdev dirty-checkout continuation amended

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-03%20%E2%80%94%20Startdev%20dirty-checkout%20continuation%20amended>) · IDs: D-057.

## 2026-09-03 — Startdev refresh skill added

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-03%20%E2%80%94%20Startdev%20refresh%20skill%20added>) · IDs: D-057.

## 2026-09-03 — Material UI-first harness and host correction

## 2026-09-03 — MUI MCP and Vault authority reconciliation

The project-scoped configuration selects the official Material UI MCP as an upstream documentation/example source. Local source, installed types, architecture, tests and executable behavior remain implementation truth; Shortcut remains the roadmap and coordination plane. Read-only verification resolved `@mui/mcp` 0.1.4 with `fetchDocs` and `generateReactCode`; the documented `useMuiDocs` tool was unavailable. Code generation credentials were not configured or requested. Detailed evidence: [record](../../records/progress/2026/09/2026-09-03-mui-mcp-and-vault-authority-reconciliation.md).

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-03%20%E2%80%94%20Material%20UI-first%20harness%20and%20host%20correction>) · IDs: D-054, D-056.

## 2026-09-03 — Agent harness separated from software knowledge base

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-03%20%E2%80%94%20Agent%20harness%20separated%20from%20software%20knowledge%20base>) · IDs: D-054.

## 2026-09-02 — Integrated clinic evidence and schema hardening completed

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Integrated%20clinic%20evidence%20and%20schema%20hardening%20completed>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Latest mainline inventory and billing work integrated with the clinic foundation

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Latest%20mainline%20inventory%20and%20billing%20work%20integrated%20with%20the%20clinic%20foundation>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Tracking-board data and resize hardening implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Tracking-board%20data%20and%20resize%20hardening%20implemented>) · IDs: T-48.

## 2026-09-02 — Administrative staff foundation implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Administrative%20staff%20foundation%20implemented>) · IDs: none recorded in heading/body excerpt.

## Archived entry compatibility headings

Older dated entries remain available in monthly archives. These headings preserve existing Obsidian anchors; use the archive link for full evidence.

## 2026-09-02 — Continuous Ledger clinic foundation implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Continuous%20Ledger%20clinic%20foundation%20implemented>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Schedule-aware provider queue implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Schedule-aware%20provider%20queue%20implemented>) · IDs: D-050.

## 2026-09-02 — Independent-product and clinic design foundation confirmed

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Independent-product%20and%20clinic%20design%20foundation%20confirmed>) · IDs: D-052, T-47.

## 2026-09-02 — Clinic navigation made component-scoped

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Clinic%20navigation%20made%20component-scoped>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Provider-flow review findings integrated

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Provider-flow%20review%20findings%20integrated>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Operation receipt digest versioning hardened

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Operation%20receipt%20digest%20versioning%20hardened>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Observation seed idempotency defect corrected

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Observation%20seed%20idempotency%20defect%20corrected>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Audit and idempotency prerequisite slice implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Audit%20and%20idempotency%20prerequisite%20slice%20implemented>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Observation protected-value transition implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Observation%20protected-value%20transition%20implemented>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Proposed full synthetic encounter workflow contract

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Proposed%20full%20synthetic%20encounter%20workflow%20contract>) · IDs: T-13.2, T-13.3.

## 2026-09-02 — Repeatable varied tracking-board fixtures

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Repeatable%20varied%20tracking-board%20fixtures>) · IDs: T-13, T-44.

## 2026-09-02 — T-13.1 synthetic intake/handoff walkthrough drafted

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20T-13.1%20synthetic%20intake%2Fhandoff%20walkthrough%20drafted>) · IDs: T-13.1, T-13.2, T-13.3.

## 2026-09-02 — Provider-flow UX and synthetic-fixture correction

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Provider-flow%20UX%20and%20synthetic-fixture%20correction>) · IDs: T-13, T-44.

## 2026-09-02 — Provider-flow projection and identity safeguards integrated

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Provider-flow%20projection%20and%20identity%20safeguards%20integrated>) · IDs: D-041, T-13, T-44.

## 2026-09-02 — Care column made exception-only; example concerns added

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Care%20column%20made%20exception-only%3B%20example%20concerns%20added>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Care summary moved to SOAP-chart hover

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Care%20summary%20moved%20to%20SOAP-chart%20hover>) · IDs: none recorded in heading/body excerpt.

## 2026-09-02 — Tracking-board Care indicators implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Tracking-board%20Care%20indicators%20implemented>) · IDs: T-13.

## 2026-09-02 — Patient care-summary backend implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-02%20%E2%80%94%20Patient%20care-summary%20backend%20implemented>) · IDs: none recorded in heading/body excerpt.

## 2026-09-01 — Tracking-board SOAP navigation connected

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20Tracking-board%20SOAP%20navigation%20connected>) · IDs: T-13.

## 2026-09-01 — Tracking board density and controls corrected

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20Tracking%20board%20density%20and%20controls%20corrected>) · IDs: none recorded in heading/body excerpt.

## 2026-09-01 — Omni clinic connected to rich local workflow fixtures

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20Omni%20clinic%20connected%20to%20rich%20local%20workflow%20fixtures>) · IDs: none recorded in heading/body excerpt.

## 2026-09-01 — Staging delivery changed to manual-only

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20Staging%20delivery%20changed%20to%20manual-only>) · IDs: D-048.

## 2026-09-01 — Repository-local development startup fixed

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20Repository-local%20development%20startup%20fixed>) · IDs: none recorded in heading/body excerpt.

## 2026-09-01 — First demo-clinic candidate stayed private; role seeding corrected

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20First%20demo-clinic%20candidate%20stayed%20private%3B%20role%20seeding%20corrected>) · IDs: D-047.

## 2026-09-01 — Staging demo clinic source and release boundary verified

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20Staging%20demo%20clinic%20source%20and%20release%20boundary%20verified>) · IDs: D-047.

## 2026-09-01 — Protected synthetic staging review activated

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20Protected%20synthetic%20staging%20review%20activated>) · IDs: T-20.1, T-20.3.

## 2026-09-01 — StagingDemoUser prepared; current candidate keeps HTTPS closed

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20StagingDemoUser%20prepared%3B%20current%20candidate%20keeps%20HTTPS%20closed>) · IDs: T-20.1.

## 2026-09-01 — Rich synthetic clinic workflow seeds implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20Rich%20synthetic%20clinic%20workflow%20seeds%20implemented>) · IDs: none recorded in heading/body excerpt.

## 2026-09-01 — Basic SOAP-note draft scaffold implemented

Archived: [full dated entry](<../../records/progress/2026-09.md#2026-09-01%20%E2%80%94%20Basic%20SOAP-note%20draft%20scaffold%20implemented>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Action icons made larger and tooltip-driven

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Action%20icons%20made%20larger%20and%20tooltip-driven>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — MUI contextual icons added to the tracking board

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20MUI%20contextual%20icons%20added%20to%20the%20tracking%20board>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Concise appointment context and SOAP affordance

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Concise%20appointment%20context%20and%20SOAP%20affordance>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Wait actions reduced to concise destinations

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Wait%20actions%20reduced%20to%20concise%20destinations>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Stacked vitals and reference-range indicators

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Stacked%20vitals%20and%20reference-range%20indicators>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Board location and vitals columns simplified

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Board%20location%20and%20vitals%20columns%20simplified>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Wait column condensed into a patient-flow timeline

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Wait%20column%20condensed%20into%20a%20patient-flow%20timeline>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Board action and wait ordering refined

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Board%20action%20and%20wait%20ordering%20refined>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Tracking table density and identity labels refined

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Tracking%20table%20density%20and%20identity%20labels%20refined>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Tracking table sorting and column arrangement

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Tracking%20table%20sorting%20and%20column%20arrangement>) · IDs: T-22.2.

## 2026-08-31 — Overview tracking board converted to a Material UI table

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Overview%20tracking%20board%20converted%20to%20a%20Material%20UI%20table>) · IDs: T-22.2.

## 2026-08-31 — Material UI review and local environment restart

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Material%20UI%20review%20and%20local%20environment%20restart>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Patient registration surfaced in the local clinic UI

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Patient%20registration%20surfaced%20in%20the%20local%20clinic%20UI>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Layered agent workflow instructions implemented

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Layered%20agent%20workflow%20instructions%20implemented>) · IDs: D-045, D-046, T-46.

## 2026-08-31 — Omni development identity and view switching

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Omni%20development%20identity%20and%20view%20switching>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Minimum frontend/backend mapping slice implemented

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Minimum%20frontend%2Fbackend%20mapping%20slice%20implemented>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Frontend/backend flow map reconciled before design

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Frontend%2Fbackend%20flow%20map%20reconciled%20before%20design>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Final backend verification and synthetic seeds

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Final%20backend%20verification%20and%20synthetic%20seeds>) · IDs: D-044, T-13, T-34.5, T-45.

## 2026-08-31 — ERD-to-frontend mapping planned

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20ERD-to-frontend%20mapping%20planned>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Full backend-replacement prompt prepared

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Full%20backend-replacement%20prompt%20prepared>) · IDs: D-044.

## 2026-08-31 — PaperTrail callback coverage clarified

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20PaperTrail%20callback%20coverage%20clarified>) · IDs: D-043, T-34.5.

## 2026-08-31 — PaperTrail selected and dependency added

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20PaperTrail%20selected%20and%20dependency%20added>) · IDs: D-043, T-34.5.

## 2026-08-31 — Corrected target-state ERD visualized

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Corrected%20target-state%20ERD%20visualized>) · IDs: L-05.

## 2026-08-31 — ERD concerns addressed in corrected-model prompt

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20ERD%20concerns%20addressed%20in%20corrected-model%20prompt>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Comprehensive ERD adversarial review and agent prompt

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Comprehensive%20ERD%20adversarial%20review%20and%20agent%20prompt>) · IDs: T-13, T-34.

## 2026-08-31 — IP-based staging owner review prepared behind closed HTTPS ingress

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20IP-based%20staging%20owner%20review%20prepared%20behind%20closed%20HTTPS%20ingress>) · IDs: D-042, T-20.1, T-20.3.

## 2026-08-31 — Local test login restored after API stopped

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Local%20test%20login%20restored%20after%20API%20stopped>) · IDs: none recorded in heading/body excerpt.

## 2026-08-31 — Clinic and test-account integration verification

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Clinic%20and%20test-account%20integration%20verification>) · IDs: D-039, D-041, T-23, T-43, T-44.

## 2026-08-31 — Tracking board, Operations and chart-tab navigation

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Tracking%20board%2C%20Operations%20and%20chart-tab%20navigation>) · IDs: D-041, T-13, T-22.2, T-43, T-44.

## 2026-08-31 — Client test-access adversarial review and merge candidate

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Client%20test-access%20adversarial%20review%20and%20merge%20candidate>) · IDs: D-038, D-040, T-23, T-23.1, T-23.4.

## 2026-08-31 — Twelve-hour sessions and reusable local test accounts

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Twelve-hour%20sessions%20and%20reusable%20local%20test%20accounts>) · IDs: D-038, D-040, T-23, T-23.1, T-23.2, T-23.3, T-23.4.

## 2026-08-31 — User settings and responsive container corrections

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20User%20settings%20and%20responsive%20container%20corrections>) · IDs: D-039, T-22.2, T-43.

## 2026-08-31 — Founder assigned initial payment and access approval

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Founder%20assigned%20initial%20payment%20and%20access%20approval>) · IDs: D-038, T-23, T-23.1.

## 2026-08-31 — Client access workflow draft started

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Client%20access%20workflow%20draft%20started>) · IDs: D-021, D-022, R-17, T-23, T-23.1, T-23.2, T-23.4.

## 2026-08-31 — Failure-first planning and five-step breakdown added

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Failure-first%20planning%20and%20five-step%20breakdown%20added>) · IDs: D-037, L-05, R-17, R-19, T-24, T-42.

## 2026-08-31 — Staging delivery activated and PostgreSQL cutover verified

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Staging%20delivery%20activated%20and%20PostgreSQL%20cutover%20verified>) · IDs: L-05, T-38.

## 2026-08-31 — Selectable clinic themes implemented

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Selectable%20clinic%20themes%20implemented>) · IDs: D-036, T-13, T-22, T-41.

## 2026-08-31 — Staff-first clinic design explored

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Staff-first%20clinic%20design%20explored>) · IDs: T-13, T-22.

## 2026-08-31 — Developer handoff, vault index and scoped review aligned

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Developer%20handoff%2C%20vault%20index%20and%20scoped%20review%20aligned>) · IDs: D-034, D-035, T-20, T-22, T-38.

## 2026-08-31 — CI/CD documentation aligned and launcher regression fixed

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20CI%2FCD%20documentation%20aligned%20and%20launcher%20regression%20fixed>) · IDs: D-033, T-22, T-38.

## 2026-08-31 — Frontend and API separation completed; test database recreated

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-31%20%E2%80%94%20Frontend%20and%20API%20separation%20completed%3B%20test%20database%20recreated>) · IDs: D-033, T-38, T-40.

## 2026-08-30 — Frontend API split paused after verification cleanup issue

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Frontend%20API%20split%20paused%20after%20verification%20cleanup%20issue>) · IDs: D-033, T-40.

## 2026-08-30 — Full software-structure refactor completed

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Full%20software-structure%20refactor%20completed>) · IDs: D-032, L-05, T-38, T-39.

## 2026-08-30 — First software-structure refactor verified

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20First%20software-structure%20refactor%20verified>) · IDs: D-032, T-38, T-39.

## 2026-08-30 — PostgreSQL and shared inventory foundation verified locally

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20PostgreSQL%20and%20shared%20inventory%20foundation%20verified%20locally>) · IDs: D-029, D-030, D-031, L-05, T-34, T-37, T-38.

## 2026-08-30 — Separate production and staging installed; delivery activation pending

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Separate%20production%20and%20staging%20installed%3B%20delivery%20activation%20pending>) · IDs: D-030, L-05, R-15, T-20, T-22.

## 2026-08-30 — Supplier pricing integrations researched and deferred

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Supplier%20pricing%20integrations%20researched%20and%20deferred>) · IDs: D-029, T-13, T-14, T-34, T-37.

## 2026-08-30 — CI workflow repaired and developer guide added

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20CI%20workflow%20repaired%20and%20developer%20guide%20added>) · IDs: T-22.

## 2026-08-30 — Pharmacy provider and counsel discussion guide

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Pharmacy%20provider%20and%20counsel%20discussion%20guide>) · IDs: D-028, L-01, L-08, T-05, T-35, T-36.

## 2026-08-30 — Smaller EC2 server launched and recovery verified

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Smaller%20EC2%20server%20launched%20and%20recovery%20verified>) · IDs: D-027, L-05, T-20.

## 2026-08-30 — Pharmacy mapped into the existing EHR layout

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Pharmacy%20mapped%20into%20the%20existing%20EHR%20layout>) · IDs: L-05, T-22.

## 2026-08-30 — Broad pharmacy configurability adopted

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Broad%20pharmacy%20configurability%20adopted>) · IDs: D-027, D-028, R-13, T-13, T-20, T-33, T-34.

## 2026-08-30 — EC2 staging package prepared and locally verified

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20EC2%20staging%20package%20prepared%20and%20locally%20verified>) · IDs: D-027, L-05, T-20.

## 2026-08-30 — Pharmacy background integrated into Rails EHR

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Pharmacy%20background%20integrated%20into%20Rails%20EHR>) · IDs: L-05, T-20, T-22, T-32.

## 2026-08-30 — Pharmacy inventory data-collection diligence

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Pharmacy%20inventory%20data-collection%20diligence>) · IDs: L-02, L-05, L-06, T-13, T-14, T-31.

## 2026-08-30 — Inventory price-comparison source shortlist

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Inventory%20price-comparison%20source%20shortlist>) · IDs: T-13, T-14.

## 2026-08-30 — Assigned Test Clinic and explicit login navigation

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Assigned%20Test%20Clinic%20and%20explicit%20login%20navigation>) · IDs: D-026, T-30.

## 2026-08-30 — Rails migration and two front-facing workspaces

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Rails%20migration%20and%20two%20front-facing%20workspaces>) · IDs: D-024, D-025, T-20, T-22, T-28, T-29.

## 2026-08-30 — Site moved into the main Git repository

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Site%20moved%20into%20the%20main%20Git%20repository>) · IDs: D-023.

## 2026-08-30 — Current-state review and development milestones

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Current-state%20review%20and%20development%20milestones>) · IDs: D-019, T-22, T-27.

## 2026-08-30 — Local development login enabled

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Local%20development%20login%20enabled>) · IDs: T-19, T-20.

## 2026-08-30 — Rails client portal and website revisions implemented

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Rails%20client%20portal%20and%20website%20revisions%20implemented>) · IDs: D-021, D-022, T-20, T-21.

## 2026-08-30 — Multi-clinic data modeling proposal documented

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Multi-clinic%20data%20modeling%20proposal%20documented>) · IDs: L-05, T-13, T-18.

## 2026-08-30 — Consultancy website bootstrapped

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Consultancy%20website%20bootstrapped>) · IDs: D-019, D-020, T-17.

## 2026-08-30 — Execution ownership and commercial model clarified

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Execution%20ownership%20and%20commercial%20model%20clarified>) · IDs: T-14, T-15.

## 2026-08-30 — Offer and entity boundary clarified

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Offer%20and%20entity%20boundary%20clarified>) · IDs: none recorded in heading/body excerpt.

## 2026-08-30 — Vault initialized

Archived: [full dated entry](<../../records/progress/2026-08.md#2026-08-30%20%E2%80%94%20Vault%20initialized>) · IDs: none recorded in heading/body excerpt.
## 2026-09-18 — Browser acceptance and session-boundary follow-up

The browser acceptance runner covered all seeded employee profiles and known
clinic/site boundaries without creating records: 12 profiles, 48 protected
mutation checks, and 129 cross-practice/site attempts passed. A populated
administrator walkthrough rendered the seven core clinic routes and passed
narrow-layout, visible-control-name, and explicit reconnect/error-state checks.
The controlled session-duration test passed 6 runs / 24 assertions for the
two-hour idle and twelve-hour absolute limits. This does not replace human
screen-reader/contrast/zoom review, full domain mutation walkthroughs, or a
wall-clock two-hour observation.

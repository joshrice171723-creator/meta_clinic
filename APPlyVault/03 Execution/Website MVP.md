---
type: implementation
status: private-rails-environments
updated: 2026-08-31
---
# Website MVP

Home: [[00 Home]] · Portal: [[Client Portal]] · Tasks: [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) · Direction: [[Decisions]]


**Current implementation, D-033:** browser screens/styles now live in `apps/web` (React/TypeScript), while Rails JSON, permissions and PostgreSQL live in `apps/api`. Same-origin proxying preserves cookie/CSRF protection. Browser URLs, product copy and historical Sites hosting are retained. The earlier Rails-rendered observations below are historical; current ownership, commands and actual checks are in [[Software Architecture]], [[CICD]] and [[Progress Log]].

## Current scope

**Current direction, D-033:** independent React/Vite browser presentation and a Rails JSON API, preserving D-025's distinct selling/onboarding and [[Clinic Workspace]] experiences. No external clinic URL is required; clinic access is separately assigned. The software business remains separately owned/scoped. The clinic prototype is synthetic and production-disabled. The earlier Rails-only rendering choice is historical.

The product website now leads to Contact and a client login. The founder explicitly removed the clinic brief and requested Ruby on Rails, then defined the paid-client portal as Paperwork plus Onboarding & Training. Meta Clinic's software offer and FDE integration path are documented in [[Customer and Offer]] and [[Pricing Strategy]]. APPly remains a working name.

D-033 places the frontend in `apps/web/` and Rails in `apps/api/`; active provider-neutral packaging now lives in `ops/portable/`; see [[Software Architecture]]. The founder removed retired `reference/` on 2026-08-31; it is not an application dependency. D-023's one-repository rule remains. `site/` retains historical assets/metadata, and compatibility links are retired. Do not initialize a nested repository/submodule or publish the parent repository/vault. The owner-only APPly private preview published on 2026-08-30 does not run the current frontend/API pair and is historical evidence only.

## Implemented

- Existing green-and-cream landing page, positioning, services, process, Kevin's reference-clinic experience, FAQs, favicon and social card preserved as historical website material pending product-positioning updates.
- Entire brief section, generator, download code and brief tests removed; the prior version remains recoverable in the local backup of the former site repository, not imported into APPly history.
- Contact page and Rails-backed encrypted inquiry inbox for administrators.
- Provisioned-account login and the [[Client Portal]] foundation; no public signup or EHR inside the launch portal. Synthetic clinic operations live in the separately permissioned [[Clinic Workspace]].
- Metadata uses an operator-controlled origin; normal full-page navigation avoids client-side protected-page cache reuse.

## Hosting and data boundary

Local development uses Vite on 3000, Rails API on 3001 and PostgreSQL; see [[CICD#Rails can run locally]]. Prepared releases build independent web/API images from one commit and promote the exact pair. The old Sites preview is historical, not the current development or release target.

**Recorded historical AWS state:** D-027/D-030 established two private bootstrap hosts on 2026-08-30. [[Progress Log#2026-08-31 — Staging delivery activated and PostgreSQL cutover verified]] records later staging evidence. The founder retired that delivery path on 2026-09-10; [[CICD]] owns the current boundary, and historical evidence does not establish a current host or access state.

The owner-only hosted preview also requires ChatGPT sign-in at the hosting layer; that is separate from Rails account authentication. For local development, [[Client Portal#Local development access]] provides a guarded password-free demo at [local login](http://localhost:3000/login) while the frontend and API development servers are running. This does not change hosted access or resolve T-20.

The local prototype uses synthetic examples. Applicant names, signatures, contracts and actual legal documents require approved handling before real use; patient data is excluded entirely. Contact collects only a name, email and business message with a no-patient-data notice. No automatic emails, analytics configuration, payment processing, filings or institutional submissions were added.

No invented prices, launch deadlines, testimonials, regulatory approvals, HIPAA certification or released EHR/video-library claims. Public use of the brand, founder story, product pricing, FDE migration claims and notices remains subject to approval.

## Verification

The completed D-033 split recorded 76 Rails tests / 784 assertions, 11 frontend tests, frontend formatting/typecheck/build, native-HTTP integration and both local container configurations passing. See [[Progress Log#2026-08-31 — Frontend and API separation completed; test database recreated]] for scope; the newest progress entry identifies checks actually rerun in this review. Earlier Rails-only and original frontend publication results remain dated history, not the current test baseline.

Full current-frontend browser/visual/accessibility acceptance, production cutover and independent security review remain open. Observed remote CI and staging cutover/recovery are recorded separately above; no clinical/compliance assessment is claimed.

Canonical status/next actions live in [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap). MD ingestion, real packet validation, SharePoint mapping and the future EHR/inventory product remain distinct workstreams.

## Current review and release plan

[[CICD]] is the developer entry point; [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) is the chunked work plan and [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) rolls up status. Steps 1–3 cover website/portal release acceptance, operator access and synthetic content infrastructure; the existing M0–M6 gates remain. Apply [[Working Agreement#Failure-first planning and review]] to misleading public claims, failed/duplicate inquiry submission, wrong-account access, session expiry and unavailable backend paths. This update changes planning only, not application behavior, public audience or hosted services.

The Rails migration corrected “opened the doors” to “worked through the setup,” preserving [[MD Pilot]]'s unknown opening/first-patient status. The 100 removed JavaScript source/config/test files are recoverable from commit 2a25f48. Brand, claims and audience approval remain separate from technical completion.

**Database update (D-031):** current Rails source, CI and deployment tools require PostgreSQL. [[PostgreSQL and Inventory Foundation]] records local and staging conversion/recovery evidence; production conversion remains T-38. Old database/key/image recovery evidence is retained, not silently replaced by this plan.

---
type: implementation
status: private-rails-environments
updated: 2026-08-31
---
# Website MVP

Home: [[00 Home]] · Portal: [[Client Portal]] · Tasks: [[Roadmap and Tasks]] · Direction: [[Decisions]]


**Current implementation, D-033:** browser screens/styles now live in `apps/web` (React/TypeScript), while Rails JSON, permissions and PostgreSQL live in `apps/api`. Same-origin proxying preserves cookie/CSRF protection. Browser URLs, product copy and historical Sites hosting are retained. The earlier Rails-rendered observations below are historical; current ownership, commands and actual checks are in [[Software Architecture]], [[CICD]] and [[Progress Log]].

## Current scope

**Current direction, D-033:** independent React/Vite browser presentation and a Rails JSON API, preserving D-025's distinct selling/onboarding and [[Clinic Workspace]] experiences. No external clinic URL is required; clinic access is separately assigned. The software business remains separately owned/scoped. The clinic prototype is synthetic and production-disabled. The earlier Rails-only rendering choice is historical.

The consultancy website now leads to Contact and a client login. The founder explicitly removed the clinic brief and requested Ruby on Rails, then defined the paid-client portal as Paperwork plus Onboarding & Training. See D-021/D-022 and [[Client Portal]]. APPly remains a working name.

D-033 places the frontend in `apps/web/` and Rails in `apps/api/`, retaining D-032's domain organization and `ops/aws/` tooling; see [[Software Architecture]]. The founder removed retired `reference/` on 2026-08-31; it is not an application dependency. D-023's one-repository rule remains. `site/` retains historical assets/metadata, and compatibility links are retired. Do not initialize a nested repository/submodule or publish the parent repository/vault. The owner-only [APPly private preview](https://apply-clinic-launch.wdmcdonough.chatgpt.site) was published on 2026-08-30; it does not run the current frontend/API pair. That historical publication is not evidence of current public-access/domain settings; private EC2 evidence is below.

## Implemented

- Existing green-and-cream consultancy landing page, positioning, services, process, Kevin's reference-clinic experience, FAQs, favicon and social card preserved.
- Entire brief section, generator, download code and brief tests removed; the prior version remains recoverable in the local backup of the former site repository, not imported into APPly history.
- Contact page and Rails-backed encrypted inquiry inbox for administrators.
- Provisioned-account login and the [[Client Portal]] foundation; no public signup or EHR inside the launch portal. Synthetic clinic operations live in the separately permissioned [[Clinic Workspace]].
- Metadata uses an operator-controlled origin; normal full-page navigation avoids client-side protected-page cache reuse.

## Hosting and data boundary

Local development uses Vite on 3000, Rails API on 3001 and PostgreSQL; see [[CICD#Rails can run locally]]. Prepared releases build independent web/API images from one commit and promote the exact pair. The old Sites preview is historical, not the current development or release target.

**Last recorded EC2 verification, 2026-08-30:** D-027/D-030 established separate private staging and production t3.micro hosts in `us-east-1`, each with 10 GiB encrypted storage and independent SQLite data/managed keys. Production demos were disabled. The combined estimate was roughly $28/month before extras, not repriced here. [[CICD]] and the [environment runbook](../../ops/aws/ec2/environments.md) distinguish that bootstrap from current PostgreSQL source. T-38 cutover, paired host installation, GitHub activation and wider operational/public-domain acceptance remain pending in the record; current hosted state was not inspected. No S3 integration, real-data or clinical release is inferred.

The owner-only hosted preview also requires ChatGPT sign-in at the hosting layer; that is separate from Rails account authentication. For local development, [[Client Portal#Local development access]] provides a guarded password-free demo at [local login](http://localhost:3000/login) while the frontend and API development servers are running. This does not change hosted access or resolve T-20.

The local prototype uses synthetic examples. Applicant names, signatures, contracts and actual legal documents require approved handling before real use; patient data is excluded entirely. Contact collects only a name, email and business message with a no-patient-data notice. No automatic emails, analytics configuration, payment processing, filings or institutional submissions were added.

No invented prices, launch deadlines, testimonials, regulatory approvals, HIPAA certification or released EHR/video-library claims. Public use of the brand, founder story, service copy and notices remains subject to approval.

## Verification

The completed D-033 split recorded 76 Rails tests / 784 assertions, 11 frontend tests, frontend formatting/typecheck/build, native-HTTP integration and both local container configurations passing. See [[Progress Log#2026-08-31 — Frontend and API separation completed; test database recreated]] for scope; the newest progress entry identifies checks actually rerun in this review. Earlier Rails-only and original frontend publication results remain dated history, not the current test baseline.

Full current-frontend browser/visual/accessibility acceptance, observed remote CI, hosted cutover and independent security review remain open. No clinical/compliance assessment is claimed.

Canonical status/next actions live in [[Roadmap and Tasks]]. MD ingestion, real packet validation, SharePoint mapping and the future EHR/inventory product remain distinct workstreams.

## Current review and release plan

[[CICD]] is the developer entry point; [[Roadmap and Tasks#Development plan — proposed 2026-08-30]] defines milestone exit criteria and [[Roadmap and Tasks#Current task register]] holds current status. This review updates documentation and ignore coverage, not application behavior or hosted services.

The Rails migration corrected “opened the doors” to “worked through the setup,” preserving [[MD Pilot]]'s unknown opening/first-patient status. The 100 removed JavaScript source/config/test files are recoverable from commit 2a25f48. Brand, claims and audience approval remain separate from technical completion.

**Database update (D-031):** current Rails source, CI and prepared deployment tools now require PostgreSQL. [[PostgreSQL and Inventory Foundation]] records verified local conversion/inventory/restore behavior. The hosted SQLite observations above remain historical installed-state evidence until T-38 completes the controlled cutover; no old database, key or image was silently replaced.

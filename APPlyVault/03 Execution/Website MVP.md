---
type: implementation
status: local-rails-two-experiences
updated: 2026-08-30
---
# Website MVP

Home: [[00 Home]] · Portal: [[Client Portal]] · Tasks: [[Roadmap and Tasks]] · Direction: [[Decisions]]

## Current scope

**Latest direction, D-024/D-025:** one Rails app with distinct selling/onboarding and [[Clinic Workspace]] experiences. ERB/native forms/CSS replace React/Vinext and the proxy. No external clinic URL is required; clinic access is separately assigned. The software business remains separately owned/scoped. The clinic prototype is synthetic and production-disabled.

The consultancy website now leads to Contact and a client login. The founder explicitly removed the clinic brief and requested Ruby on Rails, then defined the paid-client portal as Paperwork plus Onboarding & Training. See D-021/D-022 and [[Client Portal]]. APPly remains a working name.

The source lives in `site/` as a normal folder tracked by the APPly repository, per D-023 in [[Decisions]]. Keep one Git history; do not initialize a nested repository or submodule in `site/`. Any future Sites source publication must use an isolated site-only export outside this working tree, never push the APPly repository or vault to the website host. The owner-only review address is [APPly private preview](https://apply-clinic-launch.wdmcdonough.chatgpt.site). The revised frontend publication succeeded on 2026-08-30, with the correct hosted canonical origin. No public access or custom domain is configured. The Rails backend is not deployed.

## Implemented

- Existing green-and-cream consultancy landing page, positioning, services, process, Kevin's reference-clinic experience, FAQs, favicon and social card preserved.
- Entire brief section, generator, download code and brief tests removed; the prior version remains recoverable in the local backup of the former site repository, not imported into APPly history.
- Contact page and Rails-backed encrypted inquiry inbox for administrators.
- Provisioned-account login and the [[Client Portal]] foundation; no public signup or EHR.
- Metadata uses an operator-controlled origin; normal full-page navigation avoids client-side protected-page cache reuse.

## Hosting and data boundary

The old Sites deployment remains historical and unchanged. Rails now serves the entire local experience at localhost:3000. AWS staging guidance exists in site/deploy/aws.md; no EC2, S3 connection, deployment or paid subscription was created. Exact US East region remains unconfirmed.

The owner-only hosted preview also requires ChatGPT sign-in at the hosting layer; that is separate from Rails account authentication. For local development, [[Client Portal#Local development access]] provides a guarded password-free demo at [local login](http://localhost:3000/login) while the single Rails development server is running. This does not change hosted access or resolve T-20.

The local prototype uses synthetic examples. Applicant names, signatures, contracts and actual legal documents require approved handling before real use; patient data is excluded entirely. Contact collects only a name, email and business message with a no-patient-data notice. No automatic emails, analytics configuration, payment processing, filings or institutional submissions were added.

No invented prices, launch deadlines, testimonials, regulatory approvals, HIPAA certification or released EHR/video-library claims. Public use of the brand, founder story, service copy and notices remains subject to approval.

## Verification

Current Rails-only results: [[Progress Log#2026-08-30 — Rails migration and two front-facing workspaces]]. Earlier frontend build/publication results below are historical. Browser visual/accessibility QA, container build, cloud release and independent security review remain open.

Frontend build, typecheck/lint and five proxy-helper tests passed; Rails tests, lint and security scans passed, with detail in [[Client Portal]] and [[Progress Log]]. Native HTTP checks verified page responses and website-to-Rails behavior, including the local development shortcut. No browser interaction/visual QA or clinical/compliance assessment was performed.

Canonical status/next actions live in [[Roadmap and Tasks]]. MD ingestion, real packet validation, SharePoint mapping and the future EHR/inventory product remain distinct workstreams.

## Current review and release plan

[[Roadmap and Tasks#Development plan — proposed 2026-08-30]] defines the path from reproducible local demo to private hosted verification and a separately approved client release. The planning review inspected the current uncommitted demo-access changes and reran frontend tests/typecheck/lint; it did not rebuild, retest the browser, inspect live hosting or deploy. Earlier build/HTTP/publication results above remain historical evidence.

The Rails migration corrected “opened the doors” to “worked through the setup,” preserving [[MD Pilot]]'s unknown opening/first-patient status. The 100 removed JavaScript source/config/test files are recoverable from commit 2a25f48. Brand, claims and audience approval remain separate from technical completion.

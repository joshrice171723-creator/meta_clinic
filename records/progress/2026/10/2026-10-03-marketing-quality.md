# Marketing quality review - 2026-10-03

## Scope and scoring

User requested fixing the audited marketing pages, targeting above 9/10, retaining useful pages at 6 or better, and removing lower-scoring pages only after attempting improvement. This record covers the homepage/navigation baseline and 36 retained marketing routes (including the new inquiry notice). Scores are editorial judgments of clarity, evidence/truthfulness, task usefulness, presentation, and navigation, not measured conversion rates or independent acceptance. The target above 9 was not reached on every retained page; no reviewed retained page is below 6.

The larger draft registry was not comprehensively browser-audited. This is not a claim that every possible legacy or deep-link route is above 6. The separate interactive /demo application was not changed or scored anew.

## Route assessment

All paths below are relative to /meta-clinic. Earlier scores preserve the initial audit where available; new means not scored in that baseline.

| Route | Before | After | Assessment / remaining limit |
| --- | ---: | ---: | --- |
| / | 6.5 | 8.8 | Simplified navigation and direct product story; screenshots remain dense. |
| /platform | 7 | 8.8 | One coherent day walkthrough and direct demo. |
| /platform/workflows | 5.5 | 8.5 | Specific handoffs; some shared editorial structure remains. |
| /resources | 8 | 9.1 | Focused grouped tutorials with truthful summaries. |
| /membership-care | 8 | 9.1 | Concrete offer-building walkthrough. |
| /urgent-care | 7 | 8.8 | Operational stages and handoffs made explicit. |
| /primary-care | 5.5 | 8.5 | Distinct intake, encounter, and result sequence; specialty depth bounded. |
| /primary-care/cash-pay | 6.5 | 8.8 | Distinct payment ledger and invoice sequence. |
| /weight-management | 6 | 8.5 | Program and follow-up sequence; longitudinal proof limited. |
| /weight-loss | 5 | 8.5 | Unique program workflow; no invented clinical protocol. |
| /behavioral-health | 5 | 8.2 | Session-centered workflow; specialty-specific coverage remains limited. |
| /ai | 5 | 7.8 | Real Scribe preparation and explicit limits; no generated result available. |
| /pricing | 4 | 8 | Useful cost scope; no approved published rate card. |
| /security | 4 | 8.5 | Source-backed control table; independent deployment evidence unavailable. |
| /integrations | 3 | 8.5 | Specific connection statuses and boundaries; live partner proof limited. |
| /about | 2 | 8.5 | Actual product purpose and operating model; verified team story still absent. |
| /site-map | 2 | 9.1 | Curated real feature and care-model destinations. |
| /contact | 6 | 8.7 | Clear business inquiry, short labels, privacy explanation; receipt not browser-submitted. |
| /book-demo | 6 | 8.7 | Clear request rather than reservation; receipt not browser-submitted. |
| /legal/privacy | new | 8 | Accurate inquiry notice; explicitly not complete service policy. |
| /features/scheduling | 8 | 9.2 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/tracking-board | 7.5 | 9.1 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/intake-forms | 7.5 | 9.1 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/team-workspace | 7 | 8.8 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/inventory | 7 | 8.9 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/clinical-notes | 7 | 9.1 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/labs-results | 7 | 9.1 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/medication-workflows | 7.5 | 9.1 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/care-plans | 7 | 8.8 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/cash-billing | 6 | 8.8 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/memberships-packages | 8 | 9.2 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/invoices | 7.5 | 9.1 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/online-requests | 7 | 8.8 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/patient-portal | 7.5 | 9.1 | Actual app preview, focused steps, direct demo and related workflow. |
| /features/reminders | 6 | 8 | Actual readiness screen; provider delivery evidence limited. |
| /features/telehealth | 5 | 7.5 | Useful setup/readiness page; connected video proof unavailable. |

## Dispositions after attempted improvement

- Optional insurance: initial 4/10. Reviewed the available disabled-configuration capture and whether a useful workflow could be presented. It cannot substantiate insurance delivery; removed from the public feature catalog and consolidated its old URL and insurance leaf variants into cash billing. No application insurance functionality was deleted.
- Marketing demo/sandbox/try: initial demo and sandbox 6/10. Attempted concise evaluation content, then consolidated redundant gateways directly into /demo, retaining the useful destination.
- AI/integration leaf drafts: shared editorial improvement could not supply distinct implemented evidence. Consolidated under the factual AI and integration parent pages.
- Company/founder aliases now use About; security detail and HIPAA/BAA aliases use the bounded Security page. No unavailable legal agreement, biography, certification, vendor acceptance, rate, or customer proof was invented.

## Implementation and evidence

Simplified the homepage; added factual buyer-information pages; curated the sitemap; reduced repetitive feature sections; added distinct specialty and cash-payment tours; clarified AI/reminder/video scope; improved mobile inquiry labels, browser validation and receipt handling; added the narrow inquiry-information notice; added page-specific descriptions/Open Graph titles/canonical links. Existing noindex release protection remains.

Source anchors: PRODUCT.md and company/pricing vault notes; application session/authorization/audit/encryption implementation; Stripe, Twilio and prescription-transmission development runbooks. Screens remain existing independently synthetic app captures with provenance in apps/web/public/marketing/captures/manifest.json.

## Checks and boundaries

- Production TypeScript + Vite web and Office builds passed. Existing ineffective dynamic-import warning remains for the demo/marketing shared import.
- TypeScript recheck passed after preserving existing data-file formatting. No automated tests added or run, per repository preference.
- Browser at local Vite port 3437: all 36 retained marketing routes inspected for main heading, title, canonical URL, image failures, and viewport overflow at desktop and 390px mobile. Exactly one h1 on each; no detected overflow or loaded broken images. Lazy offscreen images are not an exhaustive asset-load check.
- Representative screenshots inspected for homepage, scheduling, AI, About, and mobile request page. Calendar day/month control changed its selected state and image. Insurance URL redirected to cash billing.
- Forms were not submitted; server receipt and email delivery are not established by these checks. Hosted/demo journeys, keyboard/screen-reader audit, every deep draft route, conversion measurement, and deployment acceptance remain outside this bounded review.
- Original dirty checkout preserved. Work prepared in codex/marketing-quality and synchronized with origin/main; origin has no master branch. No deployment authorized or performed.

## Authorized publication - 2026-10-03

Joshua explicitly requested committing/pushing the marketing work to main and publishing to aimetaclinic.com. Revision `3da3ca67355f45d10cf4980ca9c1e492dd393534` was pushed to origin/main and deployed with the canonical `ops/lightsail/release.ps1 -BuildWebOnHost` flow from a clean main checkout. The original dirty checkout was not altered.

Matched API/web images built successfully. Preparation passed revision and Nginx checks, backed up and restore-checked both ordinary and guided-demo databases, and completed the encrypted Windows DPAPI recovery round trip before rollout. The encrypted recovery artifact remains in the owner's Secure Files directory; host recovery and prior-image material remain retained. No rollback was needed.

All 26 hosted verifier checks passed, including HTTPS/API health, anonymous and CSRF denial, password and owner-PIN boundaries, concurrent context reads, organization/location persistence, Sandbox availability, location switching, and second-visitor reuse. Public build.json independently reported the exact revision, version 0.2.6, dirty=false; /up returned HTTP 200. Browser reload showed the new homepage heading, and the old insurance URL redirected to cash billing. These are scoped release/browser observations, not a complete clinical or whole-app acceptance review. The earlier local scoring and deep-route limitations remain unchanged.

---
type: implementation
status: synthetic-local-prototype
updated: 2026-08-31
---
# Clinic Workspace

Home: [[00 Home]] · Launch: [[Client Portal]] · Scope: [[Entity and Product Boundary]] · Design: [[Data Modeling]] · Tasks: [[Roadmap and Tasks]] · Authority: [[Decisions]]


**Frontend/API update, D-033:** the separate clinic interface now renders in `apps/web`, with permission-scoped JSON under `/api/clinic` in `apps/api`. Backend inventory rules, transactions, ledger/history, one-clinic assignment and production denial are unchanged. Static deployed clinic routes also return 404. Earlier Rails-rendered layout/form results below are historical, not current browser acceptance; see [[Software Architecture]] and the latest [[Progress Log]].

## Founder-selected direction

D-025 requests both experiences with front-facing separation; D-033 implements them through the independent frontend and Rails API. Selling/onboarding retains marketing, contact, paperwork and information/training. Clinic operations have their own dashboard, navigation and visual layout. The final clarification supersedes the proposed external-site link; no separate domain is required.

Software entity/ownership, licensing, support and economics remain distinct. Sharing local code does not settle production infrastructure, IP, intercompany access or patient-data responsibilities.

D-026 confirms one clinic per login, provisioned by developers. People working at multiple clinics use separate logins. Clinic Workspace opens the assigned clinic directly; there is no clinic selector or create-clinic action. Test Clinic is the founder-requested generic development fixture.

D-028 sets the pharmacy product direction: allow clinics to choose and combine pharmacy setups rather than design for one operating model. [[Pharmacy Inventory Data Requirements#Configurable pharmacy capabilities]] defines the proposed shared foundation and extensions. This is future capability scope, not a claim that the delivered slice below supports dispensing, compounding or every pharmacy setting. Clinic-specific activation, professional permissions and real-data release remain separate.

## Interface design exploration — 2026-08-31

The founder clarified that staff primarily perform intake/triage, while the physician mainly creates and signs notes/prescriptions. [[Clinic Workspace Design]] proposes a staff-first queue, focused clinician view and supporting inventory layout. The follow-up confirms staff use desktop and tablet and accepts all three palettes as user-selectable themes (D-036/U-27).

T-41 implements clinic-only Appearance controls for Sage & ivory, Mineral blue and Warm graphite, each with Light/Dark/Follow system, plus readable controls and active navigation. Preferences are cosmetic and browser-local, not account-synced; no records or account identifiers are persisted. The launch interface retains its existing styles. This local source change on `feature/clinic-workspace-design` does not implement intake, triage, signing or prescribing, or accept the conceptual workflow layouts. T-13/T-22 retain requirements and browser/accessibility acceptance; clinical release gates are unchanged.

## Current PostgreSQL inventory implementation

D-032's completed source refactor separates `Clinic::Care`, `Clinic::Inventory` and `Clinic::Staff`; clinic tenancy remains `Clinic::Practice`/`Clinic::Membership`. Scoped catalog/detail queries and authorized NDC-import orchestration are separate from HTTP; inventory receiving and the shared ledger are preserved. D-033 puts clinic presentation and shared CSS in `apps/web`, not Rails views. See [[Software Architecture]] and [[Progress Log#2026-08-31 — Frontend and API separation completed; test database recreated]] for current ownership and the latest recorded full-suite/container evidence. Historical paths/results below are not current startup instructions.

D-031 and [[PostgreSQL and Inventory Foundation]] supersede the initial SQLite/whole-package inventory implementation below. Rails now uses PostgreSQL with a shared office/pharmacy ledger, verified typed units, distinct same-lot receipts and optional costs, independent holds/releases, count observation/approval, action permissions and versioned synthetic profiles. Local checks and staging's 2026-08-31 PostgreSQL cutover are recorded; production retains the older SQLite release. Both hosted environments continue to deny clinic routes. All real-data gates remain.

## Initial delivered synthetic slice — historical

| Area | Local behavior | Limits |
| --- | --- | --- |
| Navigation | `/clinic` opens the account's assigned dashboard/sidebar; signed-out visitors return here after login | No clinic picker or creation step; same Rails process, not isolated hosting |
| Access | Active clinic membership with patients/inventory/staff capabilities; consultancy administration grants none | One clinic per user; no invitations, MFA or permission-management interface |
| EHR foundation | Fictional patient creation/directory, encrypted names and append-only encrypted draft entries with author attribution | No clinical signatures, full encounter workflow, diagnoses, prescriptions, orders, labs or decision support |
| Inventory | Office supplies, reason/actor-attributed adjustments, atomic nonnegative stock, retry deduplication and reorder indicators | No purchasing, billing, clinical stock, lots or expiry management |
| EHR pharmacy | `/clinic/pharmacy`: public FDA NDC package search/import, fictional catalog, lot/location receipts, whole-package ledger, stock/expiry worklists, quarantine/recall/release history | Inventory permission required; no patient links, dispensing, prescriptions, orders, valuation, transfers, automated recalls or production use |
| Employees | Fictional directory, job titles, active/inactive state | No payroll, scheduling or HR documents; directory changes do not grant/revoke login access |
| Demo | Explicit demo login comes with an assigned Test Clinic and fictional sample rows; developers can prepare earlier generated demo accounts with `clinics:prepare_test` | Isolated clinic per demo account; no records imported, no membership reassignment/reactivation; old synthetic walkthroughs retained locally |

Clinic reads/writes are scoped to the active membership; module permissions are checked server-side. Composite database constraints reject notes linked to a different clinic's patient. These tests do not establish complete clinical authorization or production multi-tenant security.

## Pharmacy background integration

**Historical increment, 2026-08-30:** this section describes T-32 before D-031's inventory foundation and D-033's frontend/API split. Current capabilities are summarized above. On 2026-08-31 the founder removed retired `reference/`; those artifacts remain in Git history, not as an installed app or schema dependency.

The founder requested reuse of the new pharmacy folder and removal of unnecessary Vite scaffolding, then requested `git pull`. The fast-forward to `f0421ae` supplied `pharmacy-inventory/`; its specification and PostgreSQL schema were retained as background at that time. The standalone React/Vite UI and NDC helper were replaced by a Rails adaptation; the original PostgreSQL proposal was not executed against the application.

**UI correction, 2026-08-30:** the founder clarified that the supplied code should map onto the existing EHR structure. Removed the attempted separate pharmacy layout, sidebar, dashboard and stylesheet. Catalog, FDA lookup, product details and receiving now use the existing clinic layout and EHR tabs; stock alerts and recent movements stay on the catalog page. The browser form failure was traced to `no-referrer` producing a null POST Origin; `same-origin` now permits native same-origin forms while withholding referrers from external destinations. CSRF and Origin validation remain enabled. Invalid forms offer a fresh-page recovery link, and an expired login returns to pharmacy after explicit sign-in without replaying the write. See [[Progress Log#2026-08-30 — Pharmacy mapped into the existing EHR layout]].

That increment used clinic-prefixed products, lot/location batches, movements and batch-status events. Its quantities were whole sealed packages, not doses or fractional dispensing units. Balances derive from movement rows; receipts commit with their batch, repeat submissions do not duplicate stock, and invalid deductions are rejected without clamping an overdraw. Expired, quarantined, recalled and inactive-product stock is excluded from availability. Its SQLite constraints/triggers were then stored at `site/backend/db/structure.sql`. Current PostgreSQL migrations and `apps/api/db/structure.sql` supersede that path. This does not implement the full PostgreSQL/RLS/audit proposal.

FDA lookup sends only an explicitly submitted public name/NDC to the public directory. It expands package options and matches the selected NDC to its own description; authenticated imports use signed, expiring account/clinic-bound results and add no stock. No patient/clinic payload, API key, background ingestion or live EHR connection is used. Labeler-submitted metadata is not FDA approval or medical guidance; S-28 in [[Source Register]] records the recheck. Optional synthetic sample stock never replaces an existing catalog.

Broad pharmacy configurability is confirmed by D-028. T-32 initially lacked verified unit conversions, receipt-level costs and overlapping holds; D-031 now implements those with counts, action permissions and synthetic profile versions. Containers/BUD, transfers, barcode hardware, purchasing, valuation/export, persistent alert acknowledgment, controlled-substance and prescription workflows remain unimplemented. [[PostgreSQL and Inventory Foundation]] owns current foundation detail. T-32 records bounded delivery; [[Progress Log#2026-08-30 — Pharmacy background integrated into Rails EHR]] records checks.

## Supplier pricing integration — deferred

D-029 defers the product/price integration discussion; [[Inventory Price Comparison Sources]] records the source baseline, advertised supplier APIs and purchasing connections, access gaps and proposed extensible design. T-37 holds future implementation. No supplier accounts, negotiated-price feed, price-history/comparison module or procurement connection has been added by this work. Public FDA catalog lookup remains separate from pricing and actual stock. The proposed comparison layer must preserve the current exact-unit ledger and historical package semantics and keep prices, approved orders, receipts and invoices distinct. Broad pharmacy work under T-13/T-34 and all existing release limits remain unchanged.

## Data and release boundary

Wholly synthetic examples only. All clinic routes are disabled in Rails production mode regardless of account or flags. The demo login separately requires development mode, explicit enablement, loopback and matching POST Origin. No S3, SharePoint or live EHR integration is implemented; private EC2 bootstrap hosting does not release clinic functionality.

Clinic-prefixed tables now share PostgreSQL with the launch portal. The complete trusted capabilities, RLS, independent audit and operational design in [[Data Modeling]] remains unimplemented; [[PostgreSQL and Inventory Foundation]] records the bounded controls actually delivered. Front-facing separation is not process/database isolation; production boundaries must be reviewed before either business handles real confidential/clinical information.

BAA absence does not authorize PHI. L-05 and applicable clinical/operational gates remain open. SharePoint remains the intended starter workflow, to be mapped and reviewed. Do not remove production denial merely to expose these screens.

D-030 deploys separate private staging and production containers for the application; it does not release clinic routes. Both use Rails production mode, keep clinic access denied, and hide the unavailable clinic navigation link. Synthetic clinic development remains local; staging tests the hosted launch portal with ordinary synthetic accounts. See [[CICD]] for the environment boundary.

## Verification and next work

Use [[Roadmap and Tasks#Step 4 — Configurable inventory foundation]] for remaining inventory configuration/permission/security chunks and [[Roadmap and Tasks#Step 5 — Define the first clinic workflow]] for the script → observed walkthrough → reviewed contract → synthetic interaction/handoff sequence. These expand T-34/T-13, not the clinical release scope. [[Working Agreement#Failure-first planning and review]] requires wrong-patient/clinic, excess authority, stale intake, interrupted save, missing owner and stock-reconciliation failure cases; a theme or dashboard is not evidence that those workflows work.

Current-split Rails/frontend, native-HTTP and paired-container results are recorded in [[Progress Log#2026-08-31 — Frontend and API separation completed; test database recreated]]. These are not browser interaction acceptance. The checks in the next paragraph exercised earlier Rails-rendered increments, not today's React interface.

Native Rails/HTTP checks cover layouts, explicit login, direct assigned-clinic navigation, fictional drafts, escaped content, other-clinic and per-module denial, revocation, stock invariants/retry behavior, staff-directory isolation and production denial. Historical results and scoped local-browser pharmacy checks: [[Progress Log#2026-08-30 — Pharmacy mapped into the existing EHR layout]]. Earlier navigation results: [[Progress Log#2026-08-30 — Assigned Test Clinic and explicit login navigation]]. Original slice: [[Progress Log#2026-08-30 — Rails migration and two front-facing workspaces]]. Full application browser/accessibility acceptance, hosted clinic verification, independent security assessment and clinical acceptance remain open.

T-29 records this bounded slice, not a completed EHR. Full requirements, clinical record/signing workflows, employee identity/lifecycle, audit, MFA, recovery, production boundaries, migration and qualified review stay open under T-13/T-09 and E2/E3. Canonical status stays in [[Roadmap and Tasks]].

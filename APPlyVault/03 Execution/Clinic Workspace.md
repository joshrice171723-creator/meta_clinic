---
type: implementation
status: synthetic-local-prototype
updated: 2026-08-30
---
# Clinic Workspace

Home: [[00 Home]] · Launch: [[Client Portal]] · Scope: [[Entity and Product Boundary]] · Design: [[Data Modeling]] · Tasks: [[Roadmap and Tasks]] · Authority: [[Decisions]]

## Founder-selected direction

D-025 requests both experiences in the same Rails website with front-facing separation. Selling/onboarding retains marketing, contact, paperwork and information/training. Clinic operations have their own dashboard, navigation and visual layout. The final clarification supersedes the proposed external-site link; no separate domain is required.

Software entity/ownership, licensing, support and economics remain distinct. Sharing local code does not settle production infrastructure, IP, intercompany access or patient-data responsibilities.

D-026 confirms one clinic per login, provisioned by developers. People working at multiple clinics use separate logins. Clinic Workspace opens the assigned clinic directly; there is no clinic selector or create-clinic action. Test Clinic is the founder-requested generic development fixture.

D-028 sets the pharmacy product direction: allow clinics to choose and combine pharmacy setups rather than design for one operating model. [[Pharmacy Inventory Data Requirements#Configurable pharmacy capabilities]] defines the proposed shared foundation and extensions. This is future capability scope, not a claim that the delivered slice below supports dispensing, compounding or every pharmacy setting. Clinic-specific activation, professional permissions and real-data release remain separate.

## Delivered synthetic slice

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

The founder requested reuse of the new pharmacy folder and removal of unnecessary Vite scaffolding, then requested `git pull`. The fast-forward to `f0421ae` supplied `pharmacy-inventory/`; its specification and PostgreSQL schema remain as background. The standalone React/Vite UI and NDC helper were replaced by a Rails adaptation; the original PostgreSQL proposal was not executed against the application.

The implementation uses clinic-prefixed products, lot/location batches, movements and batch-status events. Quantities are whole sealed packages, not doses or fractional dispensing units. Balances derive from movement rows; receipts commit with their batch, repeat submissions do not duplicate stock, and invalid deductions are rejected without clamping an overdraw. Expired, quarantined, recalled and inactive-product stock is excluded from availability. SQLite composite clinic/actor constraints and append-only/stock-range triggers are preserved in `site/backend/db/structure.sql` for fresh databases. This does not implement the full PostgreSQL/RLS/audit proposal.

FDA lookup sends only an explicitly submitted public name/NDC to the public directory. It expands package options and matches the selected NDC to its own description; authenticated imports use signed, expiring account/clinic-bound results and add no stock. No patient/clinic payload, API key, background ingestion or live EHR connection is used. Labeler-submitted metadata is not FDA approval or medical guidance; S-28 in [[Source Register]] records the recheck. Optional synthetic sample stock never replaces an existing catalog.

Broad pharmacy configurability is confirmed by D-028; the detailed specification and implementation sequence in [[Pharmacy Inventory Data Requirements]] remain proposals. Verified unit conversions, receipt-level supplier/cost history, containers/BUD, overlapping holds, transfers, barcode hardware, purchasing, valuation/export, persistent alert acknowledgment, controlled-substance and prescription workflows are not implemented. The prototype has one status per lot/location, not a complete hold/release process. T-32 records bounded delivery; [[Progress Log#2026-08-30 — Pharmacy background integrated into Rails EHR]] records checks.

## Data and release boundary

Wholly synthetic examples only. All clinic routes are disabled in Rails production mode regardless of account or flags. The demo login separately requires development mode, explicit enablement, loopback and matching POST Origin. No AWS, S3, SharePoint or live EHR connection was made.

Clinic-prefixed tables share the local SQLite database with the launch portal. They do not implement the PostgreSQL, trusted capabilities, RLS, independent audit or operational design in [[Data Modeling]]. Front-facing separation is not process/database isolation; production boundaries must be reviewed before either business handles real confidential/clinical information.

BAA absence does not authorize PHI. L-05 and applicable clinical/operational gates remain open. SharePoint remains the intended starter workflow, to be mapped and reviewed. Do not remove production denial merely to expose these screens.

## Verification and next work

Native Rails/HTTP checks cover layouts, explicit login, direct assigned-clinic navigation, fictional drafts, escaped content, other-clinic and per-module denial, revocation, stock invariants/retry behavior, staff-directory isolation and production denial. Latest results: [[Progress Log#2026-08-30 — Assigned Test Clinic and explicit login navigation]]. Original slice: [[Progress Log#2026-08-30 — Rails migration and two front-facing workspaces]]. No browser visual/accessibility QA, cloud deployment, independent security assessment or clinical acceptance performed.

T-29 records this bounded slice, not a completed EHR. Full requirements, clinical record/signing workflows, employee identity/lifecycle, audit, MFA, recovery, production boundaries, migration and qualified review stay open under T-13/T-09 and E2/E3. Canonical status stays in [[Roadmap and Tasks]].

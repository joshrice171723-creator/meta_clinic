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

## Delivered synthetic slice

| Area | Local behavior | Limits |
| --- | --- | --- |
| Navigation | `/clinic` has an operational dashboard/sidebar; switch back to launch/onboarding | Same Rails process and authentication, not isolated hosting |
| Access | Active clinic membership with patients/inventory/staff capabilities; consultancy administration grants none | One clinic per user; no invitations, MFA or permission-management interface |
| EHR foundation | Fictional patient creation/directory, encrypted names and append-only encrypted draft entries with author attribution | No clinical signatures, full encounter workflow, diagnoses, prescriptions, orders, labs or decision support |
| Inventory | Office supplies, reason/actor-attributed adjustments, atomic nonnegative stock, retry deduplication and reorder indicators | No purchasing, billing, clinical stock, lots or expiry management |
| Employees | Fictional directory, job titles, active/inactive state | No payroll, scheduling or HR documents; directory changes do not grant/revoke login access |
| Demo | Explicit local “Create demo clinic” step after demo login; isolated fictional practice and sample rows | No records imported; old synthetic walkthroughs retained locally |

Clinic reads/writes are scoped to the active membership; module permissions are checked server-side. Composite database constraints reject notes linked to a different clinic's patient. These tests do not establish complete clinical authorization or production multi-tenant security.

## Data and release boundary

Wholly synthetic examples only. All clinic routes are disabled in Rails production mode regardless of account or flags. The demo login separately requires development mode, explicit enablement, loopback and matching POST Origin. No AWS, S3, SharePoint or live EHR connection was made.

Clinic-prefixed tables share the local SQLite database with the launch portal. They do not implement the PostgreSQL, trusted capabilities, RLS, independent audit or operational design in [[Data Modeling]]. Front-facing separation is not process/database isolation; production boundaries must be reviewed before either business handles real confidential/clinical information.

BAA absence does not authorize PHI. L-05 and applicable clinical/operational gates remain open. SharePoint remains the intended starter workflow, to be mapped and reviewed. Do not remove production denial merely to expose these screens.

## Verification and next work

Native Rails/HTTP checks cover layouts, login, explicit clinic setup, fictional drafts, escaped content, other-clinic and per-module denial, revocation, stock invariants/retry behavior, staff-directory isolation and production denial. Measured results: [[Progress Log#2026-08-30 — Rails migration and two front-facing workspaces]]. No browser visual/accessibility QA, cloud deployment, independent security assessment or clinical acceptance performed.

T-29 records this bounded slice, not a completed EHR. Full requirements, clinical record/signing workflows, employee identity/lifecycle, audit, MFA, recovery, production boundaries, migration and qualified review stay open under T-13/T-09 and E2/E3. Canonical status stays in [[Roadmap and Tasks]].

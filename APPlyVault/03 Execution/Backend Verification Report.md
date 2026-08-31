---
type: verification-report
status: reviewed-with-open-release-gaps
updated: 2026-08-31
---
# Backend Verification Report

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Target: [[Target-State Clinic ERD]] · Architecture: [[Software Architecture]] · Tasks: [[Roadmap and Tasks]] · Evidence: [[Progress Log]]

## Scope, authority and acceptance

Requested final backend verification was performed in one task on `feature/backend-final-verification`, starting from clean commit `5436764` (schema/domain predecessor `600976f`). The attached `/Users/mcdonough/Downloads/Untitled` supplies 47 review phases and 15 report categories. Its generic examples are not new product decisions: practice is the custody boundary; optional organization grouping grants no access; one clinic per login remains D-026. The 68-entity corrected ERD and its 103 declared edges are the review baseline. Historical vault language about pending amendments is not evidence of an approved new clinical contract; no amendments, pricing, retention, integrations or clinical policy were invented.

**Disposition:** the review/testing/seeding task is complete after the checks recorded below. The backend is still a synthetic development prototype, with material implementation and release gaps. Passing checks do not prove the entire D-044 replacement complete, clinical readiness, HIPAA compliance, or authority to use real patient/confidential applicant data. Open audit, protected-value, lifecycle and business gaps below prevent that stronger conclusion.

Personally reviewed Home/TOC-routed CI/CD, architecture and PaperTrail contracts, Working Agreement, full corrected ERD, implementation handoff, relevant adversarial acceptance, inventory foundation, decisions, task/gate and progress sections; then models, migrations/schema, services, concerns, queries, controllers, serializers, routes, authentication, configuration, tests and seed paths. Existing vault current-state statements lagged source; this report distinguishes code observed now from dated hosted evidence. No hosted systems, real records, external clinical services or credentials were inspected. No deployment, publication, account outreach or existing development-data reset occurred.

Failure hypothesis: happy-path unit tests could hide tenant substitution, stale permission decisions, partial writes, race-induced over-allocation, missing actor attribution or falsely reported saved state. Detection: full route authentication matrix, symmetric practice/organization tests, database bypass tests, actual independent-connection races, audit failure injection, seed reruns, schema introspection and regression tooling. Recovery: transactions reject/roll back unsafe writes; scratch targets alone are discarded. Existing installations need reviewed forward migration and backup/recovery; no shared data is disposable by implication.

## 1. Test results

Final counts and commands are recorded after the final rerun in [[Backend Verification Report#Validation evidence]]. Baseline before corrections: **115 tests, 109 passed, 5 failures, 1 error, 0 skips**. Five new request failures and four model/integrity defects were also reproduced before correction (a separate initial failure was a test-helper API mismatch, corrected without adding a framework); a two-connection race reproduced invoice over-allocation. Stale route/model inventories and strict-parameter expectations were updated to current intended contracts, without relaxing forbidden-field rejection. A date test was moved forward from setup time so granted authority was effective during the expiry test.

Tests use `RAILS_ENV=test`, a task-created `apply_final_verify_20260831`, one worker and existing transactional fixtures. `SCHEMA` was kept consistent during scratch migration/test runs; an initial mismatch caused Rails to report pending migrations, corrected without resetting any pre-existing database. Development seed execution uses a separate task-created development scratch target. Verifiers create uniquely named databases and clean up exactly those names. No `db:reset`, broad `db:drop`, existing development writes or production data were used.

## 2. Test coverage added

| Category | New evidence |
| --- | --- |
| Models/associations/schema | All 68 entities and 103 diagram edges have table/model/FK and both Rails directions; every application association's referenced column exists. Scoped patient reference uniqueness, typed addresses and database ownership immutability are exercised. |
| Validation/enums | Offset-required timestamps, bounded page sizes, invalid clinical representation, blank/unsupported/protected fields, exact monetary precision, wrong currency, stale versions, immutable signed history and invalid workflow transitions. Existing enums/stock states remain covered by the retained suite. |
| Services/transactions | Failed invoice line rolls back header/lines/versions; foreign/wrong-patient attachment rolls back message/outbox; exact message/payment retries do not duplicate; signing requires current revision; address changes serialize. |
| API/serialization | Every clinic route denies unauthenticated requests. Resource lists/shows and synthetic appointment/encounter/note/observation/address/message/invoice/grant workflows verify status, explicit payloads, paging, filtering and error behavior. No destructive chart API was added just to test DELETE. |
| Identity/permissions | Existing session/CSRF/origin/logout/disabled/expiry tests retained; new revoked membership, read-only roles, site writer, self-elevation and grant/revoke checks. No multi-clinic login test because D-026 prohibits such accounts. |
| Cross-organization/practice | Two different organizations/practices/users/patients, both directions for show IDs, nested collection/filter isolation and tenant-only counts. Wrong-practice document and same-practice wrong-patient attachment writes fail. |
| PaperTrail/audit | Session-derived actor, server-generated correlation, context cleanup, sensitive-only metadata capture, business rollback and injected version-write failure. Version/access-event direct update/delete denial, ordinary runtime TRUNCATE/catalog-insert denial. This does not test a nonexistent independent access sink. |
| Concurrency | `bin/verify-backend`: two actual connections synchronized by queues; distinct payments on one invoice, address version allocation, active room overlap and note revision conflict. Existing `bin/verify-postgres` retains stock/retry/settings races and restore rehearsal. |
| Seed safety | Full table counts unchanged on repeat, stable practice IDs, role differences, tenant isolation and revoked grant preserved. Production/ordinary seed paths remain guarded. |

## 3. Synthetic seed data

`Development::BackendSamples`, invoked only by explicit `APP_SYNTHETIC_SEEDS=1` during development `db:seed`, adds two distinctly named synthetic organizations/practices; each has two sites/rooms, four users/memberships (clinic admin, clinician, staff, reader), global versioned role definitions and 21 permission codes. Per practice: 30 patients (enough for two default pages), two appointments/encounters, a clinician profile with two assignments and fictional unverified credential, two notes with two revisions each, two text observations, one primary address, four document metadata rows spanning all scan states, three message intents/outboxes (pending/delivered/unknown), one draft invoice with exact sample arithmetic, active/inactive staff and an office ledger opening. No document objects exist and no messages are transmitted. Draft invoices are examples, not selected pricing/rounding acceptance.

Seeds serialize with a database advisory lock, retain scenario edits and revoked grants, reject an existing account assigned elsewhere, and create no repeated opening stock. Users receive random unprinted passwords; there are no published default credentials or new login shortcuts. For manual access, use the existing local `members:reset_password` task for the desired synthetic identity; existing named personas remain unchanged. Seed service is allowed in test only for controlled fixture verification; `db:seed` returns immediately in test and remains clinic-free in production.

Run from `apps/api`, only after preparing your own local development database:

```sh
APP_SYNTHETIC_SEEDS=1 bin/postgres exec bin/rails db:seed
bin/postgres exec bin/verify-backend
```

This task rehearsed that command twice only in `apply_final_seed_20260831`, not in the user's existing `apply_development`.

## 4. ERD implementation matrix

✓ means the stated structural implementation is present; ⚠ means a specific workflow/coverage gap, not a missing physical table. APIs are summarized by resource below; internal history/junction/audit tables deliberately have no generic CRUD endpoints. Association column counts include inverse/history relations, not proof of every lifecycle business rule.

| Entity/table | Rails model | Associations | API/workflow | Status |
| --- | --- | --- | --- | --- |
| `clinic_allergies` | ✓ `Clinic::Care::Allergy` | ✓ 3 | Patient link placeholder only | ⚠ partial |
| `clinic_appointments` | ✓ `Clinic::Appointment` | ✓ 8 | Index/show/create/transition | ✓ implemented |
| `clinic_audit_delivery_receipts` | ✓ `Clinic::AuditDeliveryReceipt` | ✓ 3 | Unwired evidence model | ⚠ partial |
| `clinic_audit_events` | ✓ `Clinic::AuditEvent` | ✓ 3 | Unwired operation evidence model | ⚠ partial |
| `clinic_audit_resource_manifests` | ✓ `Clinic::AuditResourceManifest` | ✓ 3 | Unwired evidence model | ⚠ partial |
| `clinic_clinician_assignments` | ✓ `Clinic::ClinicianAssignment` | ✓ 5 | Nested clinician read | ✓ implemented |
| `clinic_clinician_credentials` | ✓ `Clinic::ClinicianCredential` | ✓ 3 | Nested clinician read | ✓ implemented |
| `clinic_clinician_profiles` | ✓ `Clinic::ClinicianProfile` | ✓ 6 | GET clinicians | ✓ implemented |
| `clinic_conditions` | ✓ `Clinic::Care::Condition` | ✓ 3 | Patient link placeholder only | ⚠ partial |
| `clinic_coverage_versions` | ✓ `Clinic::CoverageVersion` | ✓ 4 | Model only; no coverage workflow | ⚠ partial |
| `clinic_credit_notes` | ✓ `Clinic::CreditNote` | ✓ 4 | Model only; no credit workflow | ⚠ partial |
| `clinic_departments` | ✓ `Clinic::Department` | ✓ 3 | GET facilities | ✓ implemented |
| `clinic_document_categories` | ✓ `Clinic::DocumentCategory` | ✓ 3 | Index/search | ✓ implemented |
| `clinic_documents` | ✓ `Clinic::Document` | ✓ 6 | Index/show metadata; access predicate, no storage/download API | ⚠ partial |
| `clinic_encounter_note_revisions` | ✓ `Clinic::EncounterNoteRevision` | ✓ 7 | Note revision create/metadata | ⚠ partial |
| `clinic_encounter_note_signatures` | ✓ `Clinic::EncounterNoteSignature` | ✓ 5 | Sign current revision/metadata | ⚠ partial |
| `clinic_encounter_notes` | ✓ `Clinic::EncounterNote` | ✓ 6 | Create/show/revise/sign; metadata read | ⚠ partial |
| `clinic_encounter_participants` | ✓ `Clinic::EncounterParticipant` | ✓ 5 | Nested encounter read; no management API | ⚠ partial |
| `clinic_encounters` | ✓ `Clinic::Encounter` | ✓ 10 | Index/show/create/close | ✓ implemented |
| `clinic_insurance_claims` | ✓ `Clinic::InsuranceClaim` | ✓ 5 | Model only; no submission workflow | ⚠ partial |
| `clinic_inventory_catalog_events` | ✓ `Clinic::Inventory::CatalogEvent` | ✓ 5 | Trigger-owned catalog history | ✓ implemented |
| `clinic_inventory_count_approvals` | ✓ `Clinic::Inventory::CountApproval` | ✓ 6 | Approve count | ✓ implemented |
| `clinic_inventory_counts` | ✓ `Clinic::Inventory::Count` | ✓ 6 | Observe count | ✓ implemented |
| `clinic_inventory_entries` | ✓ `Clinic::Inventory::Entry, Clinic::Inventory::StockMovement, Clinic::Inventory::PharmacyMovement` | ✓ 8 | Single ledger; nested bounded histories | ✓ implemented |
| `clinic_inventory_hold_releases` | ✓ `Clinic::Inventory::HoldRelease` | ✓ 5 | Release workflow | ✓ implemented |
| `clinic_inventory_holds` | ✓ `Clinic::Inventory::Hold` | ✓ 6 | Hold workflow | ✓ implemented |
| `clinic_inventory_locations` | ✓ `Clinic::Inventory::Location` | ✓ 3 | Receiving/position service | ✓ implemented |
| `clinic_inventory_lots` | ✓ `Clinic::Inventory::Lot` | ✓ 4 | Receiving/position service | ✓ implemented |
| `clinic_inventory_profiles` | ✓ `Clinic::Inventory::Profile` | ✓ 4 | Configure synthetic inventory | ✓ implemented |
| `clinic_inventory_receipt_lines` | ✓ `Clinic::Inventory::ReceiptLine` | ✓ 5 | Receive; nested history | ✓ implemented |
| `clinic_inventory_receipts` | ✓ `Clinic::Inventory::Receipt` | ✓ 6 | Receive; nested product history | ✓ implemented |
| `clinic_inventory_suppliers` | ✓ `Clinic::Inventory::Supplier` | ✓ 5 | Receiving; no supplier integration | ✓ implemented |
| `clinic_invoice_lines` | ✓ `Clinic::InvoiceLine` | ✓ 4 | Nested invoice creation/read | ✓ implemented |
| `clinic_invoices` | ✓ `Clinic::Invoice` | ✓ 7 | Index/show/draft/post/allocate | ✓ implemented |
| `clinic_items` | ✓ `Clinic::Inventory::Item` | ✓ 4 | Inventory index/create/adjust | ✓ implemented |
| `clinic_medication_statements` | ✓ `Clinic::Care::MedicationStatement` | ✓ 3 | Patient link placeholder only | ⚠ partial |
| `clinic_memberships` | ✓ `Clinic::Membership` | ✓ 10 | Current context; grant administration | ✓ implemented |
| `clinic_message_attachments` | ✓ `Clinic::MessageAttachment` | ✓ 5 | Created with intent | ✓ implemented |
| `clinic_message_delivery_events` | ✓ `Clinic::MessageDeliveryEvent` | ✓ 3 | Synthetic delivery-event POST | ⚠ partial |
| `clinic_message_intents` | ✓ `Clinic::MessageIntent` | ✓ 6 | Index/show/create; no external transport | ⚠ partial |
| `clinic_message_outbox` | ✓ `Clinic::MessageOutbox` | ✓ 3 | Internal atomic enqueue/state | ⚠ partial |
| `clinic_notes` | ✓ `Clinic::Care::Note` | ✓ 5 | Legacy append/read via patients | ✓ implemented |
| `clinic_observation_sources` | ✓ `Clinic::Care::ObservationSource` | ✓ 5 | Model only; no derivation workflow | ⚠ partial |
| `clinic_observations` | ✓ `Clinic::Care::Observation` | ✓ 9 | Patient index/create; filters | ✓ implemented |
| `clinic_patient_address_versions` | ✓ `Clinic::Care::PatientAddressVersion` | ✓ 3 | Index/create; primary pointer | ✓ implemented |
| `clinic_patients` | ✓ `Clinic::Care::Patient` | ✓ 17 | Index/show/create; reference search | ✓ implemented |
| `clinic_payment_allocations` | ✓ `Clinic::PaymentAllocation` | ✓ 5 | Allocation service/API | ✓ implemented |
| `clinic_payment_events` | ✓ `Clinic::PaymentEvent` | ✓ 5 | Created/reused by allocation | ✓ implemented |
| `clinic_pharmacy_batches` | ✓ `Clinic::Inventory::PharmacyBatch` | ✓ 10 | Receive/movement/hold/count | ✓ implemented |
| `clinic_pharmacy_products` | ✓ `Clinic::Inventory::PharmacyProduct` | ✓ 5 | Pharmacy index/show/create/update/lookup/import | ✓ implemented |
| `clinic_practices` | ✓ `Clinic::Practice` | ✓ 27 | GET context/dashboard | ✓ implemented |
| `clinic_refund_events` | ✓ `Clinic::RefundEvent` | ✓ 4 | Model only; no refund workflow | ⚠ partial |
| `clinic_role_grant_events` | ✓ `Clinic::RoleGrantEvent` | ✓ 4 | Nested grant history | ✓ implemented |
| `clinic_role_grants` | ✓ `Clinic::RoleGrant` | ✓ 6 | Index/create/revoke | ✓ implemented |
| `clinic_rooms` | ✓ `Clinic::Room` | ✓ 5 | GET facilities | ✓ implemented |
| `clinic_sites` | ✓ `Clinic::Site` | ✓ 7 | GET facilities/context | ✓ implemented |
| `clinic_staff_address_versions` | ✓ `Clinic::Staff::AddressVersion` | ✓ 3 | Model/pointer only | ⚠ partial |
| `clinic_staff_members` | ✓ `Clinic::Staff::Member` | ✓ 4 | Index/create/status update | ✓ implemented |
| `clinic_supplier_address_versions` | ✓ `Clinic::Inventory::SupplierAddressVersion` | ✓ 3 | Model/pointer only | ⚠ partial |
| `clinic_visit_types` | ✓ `Clinic::VisitType` | ✓ 3 | GET facilities | ✓ implemented |
| `identity_preferences` | ✓ `Identity::Preference` | ✓ 1 | GET/PATCH settings | ✓ implemented |
| `member_sessions` | ✓ `MemberSession` | ✓ 1 | Session create/read/logout | ✓ implemented |
| `organizations` | ✓ `Organization` | ✓ 1 | Internal business grouping only | ✓ implemented |
| `permissions` | ✓ `Permission` | ✓ 2 | Nested catalog; no direct edit | ✓ implemented |
| `platform_audit_events` | ✓ `PlatformAuditEvent` | ✓ 0 | Unwired platform evidence model | ⚠ partial |
| `role_version_permissions` | ✓ `RoleVersionPermission` | ✓ 2 | Internal immutable join | ✓ implemented |
| `role_versions` | ✓ `RoleVersion` | ✓ 3 | GET versioned catalog | ✓ implemented |
| `users` | ✓ `User` | ✓ 5 | Session login/logout; provisioned identity | ✓ implemented |

## 5. Relationship, cardinality and nullability review

Every declared diagram edge is retained, including repeated overview/detail edges. FK ✓ denotes the physical tenant-qualified link where applicable; “user attribution” links intentionally reference membership `user_id`, not membership PK. Index ✓ denotes an index covering the referencing tuple or a unique subset sufficient for lookup. ⚠ denotes a limited prefix/absent exact supporting index. Association ✓ requires both directions to resolve; column existence is separately tested. Cardinality notes distinguish SQL structure from service-only “must exist on successful completion” rules. All tenant columns are non-null; optional organization/site/room/appointment/encounter/primary-address columns remain optional.

| # | Parent → child (meaning) | FK | Index | Rails | Cardinality/nullability |
| --- | --- | --- | --- | --- | --- |
| 1 | `organizations` → `clinic_practices` (business grouping only) | ✓ `organization_id` | ✓ | ✓ | ✓ many; optional organization_id |
| 2 | `users` → `clinic_memberships` (at most one clinic) | ✓ `user_id` | ✓ | ✓ | ✓ at most one; required parent |
| 3 | `clinic_practices` → `clinic_memberships` (authorizes) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 4 | `clinic_practices` → `clinic_sites` (operates) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 5 | `clinic_practices` → `clinic_patients` (owns) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 6 | `clinic_practices` → `clinic_items` (stocks) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 7 | `clinic_practices` → `clinic_pharmacy_products` (catalogs) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 8 | `clinic_practices` → `clinic_audit_events` (scopes) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 9 | `clinic_patients` → `clinic_appointments` (books) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 10 | `clinic_patients` → `clinic_encounters` (receives) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 11 | `clinic_appointments` → `clinic_encounters` (optional booking) | ✓ `practice_id,patient_id,appointment_id` | ✓ | ✓ | ✓ at most one; optional appointment_id |
| 12 | `clinic_encounters` → `clinic_encounter_notes` (documents) | ✓ `practice_id,patient_id,encounter_id` | ✓ | ✓ | ✓ many; required parent |
| 13 | `clinic_patients` → `clinic_documents` (owns) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 14 | `organizations` → `clinic_practices` (groups) | ✓ `organization_id` | ✓ | ✓ | ✓ many; optional organization_id |
| 15 | `users` → `clinic_memberships` (has) | ✓ `user_id` | ✓ | ✓ | ✓ at most one; required parent |
| 16 | `users` → `identity_preferences` (customizes) | ✓ `user_id` | ✓ | ✓ | ✓ at most one; required parent |
| 17 | `users` → `member_sessions` (authenticates) | ✓ `user_id` | ✓ | ✓ | ✓ many; required parent |
| 18 | `clinic_practices` → `clinic_memberships` (assigns) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 19 | `clinic_practices` → `clinic_sites` (operates) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 20 | `clinic_sites` → `clinic_rooms` (contains) | ✓ `practice_id,site_id` | ✓ | ✓ | ✓ many; required parent |
| 21 | `clinic_practices` → `clinic_departments` (organizes) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 22 | `clinic_practices` → `clinic_visit_types` (defines) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 23 | `clinic_memberships` → `clinic_clinician_profiles` (describes) | ✓ `practice_id,membership_id` | ✓ | ✓ | ✓ at most one; required parent |
| 24 | `clinic_clinician_profiles` → `clinic_clinician_assignments` (serves) | ✓ `practice_id,clinician_profile_id` | ✓ | ✓ | ✓ many; required parent |
| 25 | `clinic_sites` → `clinic_clinician_assignments` (hosts) | ✓ `practice_id,site_id` | ✓ | ✓ | ✓ many; required parent |
| 26 | `clinic_departments` → `clinic_clinician_assignments` (organizes) | ✓ `practice_id,department_id` | ✓ | ✓ | ✓ many; required parent |
| 27 | `clinic_clinician_profiles` → `clinic_clinician_credentials` (records) | ✓ `practice_id,clinician_profile_id` | ✓ | ✓ | ✓ many; required parent |
| 28 | `clinic_patients` → `clinic_appointments` (books) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 29 | `clinic_patients` → `clinic_encounters` (receives) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 30 | `clinic_appointments` → `clinic_encounters` (zero or one each) | ✓ `practice_id,patient_id,appointment_id` | ✓ | ✓ | ✓ at most one; optional appointment_id |
| 31 | `clinic_sites` → `clinic_appointments` (hosts) | ✓ `practice_id,site_id` | ✓ | ✓ | ✓ many; optional site_id |
| 32 | `clinic_sites` → `clinic_encounters` (hosts) | ✓ `practice_id,site_id` | ✓ | ✓ | ✓ many; optional site_id |
| 33 | `clinic_rooms` → `clinic_appointments` (reserves) | ✓ `practice_id,site_id,room_id` | ✓ | ✓ | ✓ many; optional site_id,room_id |
| 34 | `clinic_rooms` → `clinic_encounters` (locates) | ✓ `practice_id,site_id,room_id` | ✓ | ✓ | ✓ many; optional site_id,room_id |
| 35 | `clinic_clinician_profiles` → `clinic_appointments` (booked clinician) | ✓ `practice_id,booked_clinician_id` | ✓ | ✓ | ✓ many; optional booked_clinician_id |
| 36 | `clinic_visit_types` → `clinic_appointments` (classifies) | ✓ `practice_id,visit_type_id` | ✓ | ✓ | ✓ many; optional visit_type_id |
| 37 | `clinic_encounters` → `clinic_encounter_participants` (actual participants) | ✓ `practice_id,patient_id,encounter_id` | ✓ | ✓ | ✓ many; required parent |
| 38 | `clinic_memberships` → `clinic_encounter_participants` (participates) | ✓ `practice_id,membership_id` | ✓ | ✓ | ✓ many; required parent |
| 39 | `clinic_patients` → `clinic_notes` (legacy drafts only) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 40 | `clinic_memberships` → `clinic_notes` (attribution via user_id) | ✓ `practice_id,author_id` | ⚠ | ✓ | ✓ many; required parent |
| 41 | `clinic_patients` → `clinic_encounter_notes` (owns) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 42 | `clinic_encounters` → `clinic_encounter_notes` (documents) | ✓ `practice_id,patient_id,encounter_id` | ✓ | ✓ | ✓ many; required parent |
| 43 | `clinic_encounter_notes` → `clinic_encounter_note_revisions` (versions) | ✓ `practice_id,note_id` | ✓ | ✓ | ✓ many; required parent |
| 44 | `clinic_encounter_note_revisions` → `clinic_encounter_note_revisions` (predecessor) | ✓ `practice_id,note_id,prior_revision_id` | ✓ | ✓ | ✓ many; optional prior_revision_id |
| 45 | `clinic_encounter_note_revisions` → `clinic_encounter_note_signatures` (attests) | ✓ `practice_id,note_id,revision_id` | ✓ | ✓ | ✓ many; required parent |
| 46 | `clinic_memberships` → `clinic_encounter_note_revisions` (authors) | ✓ `practice_id,author_membership_id` | ✓ | ✓ | ✓ many; required parent |
| 47 | `clinic_memberships` → `clinic_encounter_note_signatures` (signs) | ✓ `practice_id,signer_membership_id` | ✓ | ✓ | ✓ many; required parent |
| 48 | `clinic_patients` → `clinic_observations` (owns) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 49 | `clinic_encounters` → `clinic_observations` (contextualizes) | ✓ `practice_id,patient_id,encounter_id` | ✓ | ✓ | ✓ many; optional encounter_id |
| 50 | `clinic_observations` → `clinic_observations` (groups) | ✓ `practice_id,patient_id,parent_observation_id` | ✓ | ✓ | ✓ many; optional parent_observation_id |
| 51 | `clinic_observations` → `clinic_observation_sources` (derived output) | ✓ `practice_id,patient_id,derived_observation_id` | ✓ | ✓ | ✓ many; required parent |
| 52 | `clinic_observations` → `clinic_observation_sources` (source input) | ✓ `practice_id,patient_id,source_observation_id` | ✓ | ✓ | ✓ many; required parent |
| 53 | `clinic_patients` → `clinic_conditions` (records) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 54 | `clinic_patients` → `clinic_allergies` (records) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 55 | `clinic_patients` → `clinic_medication_statements` (records) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 56 | `clinic_pharmacy_products` → `clinic_inventory_lots` (identifies) | ✓ `practice_id,product_id` | ✓ | ✓ | ✓ many; required parent |
| 57 | `clinic_inventory_lots` → `clinic_pharmacy_batches` (positions) | ✓ `practice_id,lot_id` | ✓ | ✓ | ✓ many; required parent |
| 58 | `clinic_inventory_locations` → `clinic_pharmacy_batches` (stores) | ✓ `practice_id,location_id` | ⚠ | ✓ | ✓ many; required parent |
| 59 | `clinic_inventory_suppliers` → `clinic_inventory_receipts` (supplies) | ✓ `practice_id,supplier_id` | ⚠ | ✓ | ✓ many; optional supplier_id |
| 60 | `clinic_inventory_receipts` → `clinic_inventory_receipt_lines` (contains) | ✓ `practice_id,receipt_id` | ⚠ | ✓ | ✓ many; required parent |
| 61 | `clinic_pharmacy_batches` → `clinic_inventory_receipt_lines` (receives) | ✓ `practice_id,batch_id` | ⚠ | ✓ | ✓ many; required parent |
| 62 | `clinic_inventory_receipt_lines` → `clinic_inventory_entries` (receipt posting) | ✓ `practice_id,receipt_line_id` | ✓ | ✓ | ✓ at most one; required receipt posting via trigger; optional receipt_line_id |
| 63 | `clinic_pharmacy_batches` → `clinic_inventory_entries` (pharmacy target) | ✓ `practice_id,batch_id` | ⚠ | ✓ | ✓ many; optional batch_id |
| 64 | `clinic_items` → `clinic_inventory_entries` (office target) | ✓ `practice_id,item_id` | ⚠ | ✓ | ✓ many; optional item_id |
| 65 | `clinic_pharmacy_batches` → `clinic_inventory_holds` (holds) | ✓ `practice_id,batch_id` | ⚠ | ✓ | ✓ many; required parent |
| 66 | `clinic_inventory_holds` → `clinic_inventory_hold_releases` (releases) | ✓ `practice_id,hold_id` | ✓ | ✓ | ✓ at most one; required parent |
| 67 | `clinic_pharmacy_batches` → `clinic_inventory_counts` (counted) | ✓ `practice_id,batch_id` | ⚠ | ✓ | ✓ many; required parent |
| 68 | `clinic_inventory_counts` → `clinic_inventory_count_approvals` (approved) | ✓ `practice_id,count_id` | ✓ | ✓ | ✓ at most one; required parent |
| 69 | `clinic_inventory_entries` → `clinic_inventory_count_approvals` (variance posting) | ✓ `practice_id,entry_id` | ⚠ | ✓ | ⚠ one not SQL-enforced; optional entry_id |
| 70 | `clinic_inventory_profiles` → `clinic_inventory_receipts` (governs) | ✓ `practice_id,profile_id` | ⚠ | ✓ | ✓ many; required parent |
| 71 | `clinic_inventory_profiles` → `clinic_inventory_counts` (governs) | ✓ `practice_id,profile_id` | ⚠ | ✓ | ✓ many; required parent |
| 72 | `clinic_inventory_profiles` → `clinic_inventory_entries` (posting provenance) | ✓ `practice_id,profile_id` | ⚠ | ✓ | ✓ many; optional profile_id |
| 73 | `clinic_pharmacy_products` → `clinic_inventory_catalog_events` (changes) | ✓ `practice_id,product_id` | ⚠ | ✓ | ✓ many; required parent |
| 74 | `role_versions` → `role_version_permissions` (contains) | ✓ `role_version_id` | ✓ | ✓ | ✓ many; required parent |
| 75 | `permissions` → `role_version_permissions` (defines) | ✓ `permission_id` | ✓ | ✓ | ✓ many; required parent |
| 76 | `role_versions` → `clinic_role_grants` (pins) | ✓ `role_version_id` | ✓ | ✓ | ✓ many; required parent |
| 77 | `clinic_memberships` → `clinic_role_grants` (receives) | ✓ `practice_id,membership_id` | ✓ | ✓ | ✓ many; required parent |
| 78 | `clinic_sites` → `clinic_role_grants` (narrows) | ✓ `practice_id,site_id` | ✓ | ✓ | ✓ many; optional site_id |
| 79 | `clinic_role_grants` → `clinic_role_grant_events` (preserves) | ✓ `practice_id,grant_id` | ✓ | ✓ | ✓ many; required parent |
| 80 | `clinic_practices` → `clinic_audit_events` (scopes) | ✓ `practice_id` | ✓ | ✓ | ✓ many; required parent |
| 81 | `clinic_audit_events` → `clinic_audit_resource_manifests` (records) | ✓ `practice_id,audit_event_id` | ✓ | ✓ | ✓ many; required parent |
| 82 | `clinic_audit_events` → `clinic_audit_delivery_receipts` (acknowledges) | ✓ `practice_id,audit_event_id` | ✓ | ✓ | ✓ many; required parent |
| 83 | `clinic_patients` → `clinic_patient_address_versions` (owns) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 84 | `clinic_staff_members` → `clinic_staff_address_versions` (owns) | ✓ `practice_id,staff_member_id` | ✓ | ✓ | ✓ many; required parent |
| 85 | `clinic_inventory_suppliers` → `clinic_supplier_address_versions` (owns) | ✓ `practice_id,supplier_id` | ✓ | ✓ | ✓ many; required parent |
| 86 | `clinic_patients` → `clinic_documents` (owns) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 87 | `clinic_encounters` → `clinic_documents` (contextualizes) | ✓ `practice_id,patient_id,encounter_id` | ✓ | ✓ | ✓ many; optional encounter_id |
| 88 | `clinic_document_categories` → `clinic_documents` (classifies) | ✓ `practice_id,category_id` | ✓ | ✓ | ✓ many; required parent |
| 89 | `clinic_patients` → `clinic_message_intents` (concerns) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 90 | `clinic_message_intents` → `clinic_message_attachments` (includes) | ✓ `practice_id,patient_id,message_intent_id` | ✓ | ✓ | ✓ many; required parent |
| 91 | `clinic_documents` → `clinic_message_attachments` (attaches) | ✓ `practice_id,patient_id,document_id` | ✓ | ✓ | ✓ many; required parent |
| 92 | `clinic_message_intents` → `clinic_message_outbox` (atomic enqueue) | ✓ `practice_id,message_intent_id` | ✓ | ✓ | ✓ at most one; exactly one on service commit; required parent |
| 93 | `clinic_message_intents` → `clinic_message_delivery_events` (records) | ✓ `practice_id,message_intent_id` | ✓ | ✓ | ✓ many; required parent |
| 94 | `clinic_patients` → `clinic_invoices` (owes) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 95 | `clinic_invoices` → `clinic_invoice_lines` (snapshots) | ✓ `practice_id,patient_id,invoice_id` | ✓ | ✓ | ✓ many; required parent |
| 96 | `clinic_patients` → `clinic_payment_events` (records) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 97 | `clinic_payment_events` → `clinic_payment_allocations` (allocates) | ✓ `practice_id,patient_id,payment_event_id` | ⚠ | ✓ | ✓ many; required parent |
| 98 | `clinic_invoices` → `clinic_payment_allocations` (settles) | ✓ `practice_id,patient_id,invoice_id` | ⚠ | ✓ | ✓ many; required parent |
| 99 | `clinic_invoices` → `clinic_credit_notes` (credits) | ✓ `practice_id,patient_id,invoice_id` | ✓ | ✓ | ✓ many; required parent |
| 100 | `clinic_payment_events` → `clinic_refund_events` (refunds) | ✓ `practice_id,patient_id,payment_event_id` | ✓ | ✓ | ✓ many; required parent |
| 101 | `clinic_patients` → `clinic_coverage_versions` (holds) | ✓ `practice_id,patient_id` | ✓ | ✓ | ✓ many; required parent |
| 102 | `clinic_invoices` → `clinic_insurance_claims` (claims) | ✓ `practice_id,patient_id,invoice_id` | ✓ | ✓ | ✓ many; required parent |
| 103 | `clinic_coverage_versions` → `clinic_insurance_claims` (supports) | ✓ `practice_id,patient_id,coverage_version_id` | ✓ | ✓ | ✓ many; required parent |

## 6. Database issues

**Fixed:** a forward migration preserves immutable ownership/parent/author identities on mutable target tables; prevents changing a granted role's permission set (including a role-row lock shared with grant creation); protects previously unguarded append-only message/line/claim tables; releases cancelled/no-show/completed bookings from active overlap constraints; adds indexes for actual ERD foreign-key lookup tuples. Existing applied migrations were not edited. Model-level staff-address/document-category FK mismatches and missing inverse associations were repaired. New ordinary runtime grants prohibit catalog inserts and history update/delete/truncate; schema-owner authority is deliberately not claimed to be constrained.

**Retained and verified:** tenant-qualified foreign keys, independent patient FK when encounter is null, same-owner primary addresses, one encounter per appointment, one profile per membership, unique note revision and exact signature revision, unique outbox, scoped patient reference/SKU, unique permission code/role version and null-aware grant identities. Nullable inventory actors/profiles in legacy rows remain documented exceptions; no provenance was fabricated.

**Remaining issues and limits:**

- `clinic_model_versions` has a practice FK but its polymorphic subject is not database-bound to that practice/item. A direct insert can invent a subject or claim a different tenant. No generic history API exposes it, but the D-043 database-binding contract remains unmet.
- Appointments/encounters/invoices/outbox use application transition maps while several database status checks accept any nonblank string. Observation value-shape and document scan-state enums are database-constrained; these should not be conflated with transition enforcement. Do not add a clinical state policy without accepted requirements.
- Observation group/source graphs do not fully reject indirect cycles. New immutable parent linkage blocks reparenting existing observations, but source-link graph cycles require a serialized graph invariant. No derived-observation workflow/API is provided; do not activate one before this is addressed.
- Invoice posting/allocations are protected through services, but direct SQL can still append invoice lines after posting or bypass payment totals/currency rules. Credits/refunds/claims have structural tables, not complete posting, reversal, reconciliation or deduplication services. Current synthetic arithmetic policy is implemented source behavior, not founder acceptance of billing policy.
- Legacy flag migration to effective versioned grants is not implemented for arbitrary existing installations. Fresh `Development::TestClinic` fixtures get grants; preserved legacy rows can retain flags without effective abilities. The historical conversion verifier proves IDs/bytes/ledger parity and new-fixture behavior, not complete old-account capability parity. Existing cutover must fail its access-equivalence review until an explicit backfill is designed/tested; do not auto-grant legacy flags during this audit.
- Relation rows marked ⚠ under Index identify composite tuples not covered in exact order/unique subset. Most retained inventory paths already have useful child-ID or reversed-order indexes, so adding all duplicate composite indexes would be speculative. Specific remaining tuple review includes note authors, inventory location/supplier/receipt/batch/item/profile references and allocation patient-qualified links. These are performance/index-contract observations, not missing FKs or demonstrated disclosure. Revisit with production-scale query plans before extra indexes.
- Direct SQL bypass can omit PaperTrail for ordinary mutable records. Current PostgreSQL guards protect selected ownership/history/stock invariants but do not supply universal mutation auditing or isolation from compromised runtime credentials.

## 7. API review

All meaningful clinic routes were inventoried and every route was exercised unauthenticated. Explicit serializers and strong parameter allowlists are retained. Protected ownership/role fields in structured input reject with 400; 404 conceals foreign resource identity, 403 handles service authorization denial, 409 handles stale/unique conflicts and 422 handles invalid relationships/business transitions. New tests cover the complete available synthetic care, message, invoice and grant lifecycle; existing tests retain inventory, staff, Launch and Identity behavior.

Fixed: site-specific write authorization now occurs in the service using the actual target site; authorization exceptions are safely rendered; timestamps require offsets; signing time comes from the server; invoice posting returns an invoice; address-primary response reloads persisted state; unauthorized address creation stops after the denial response. Request audit correlation is generated server-side. Clinical observation values and invoice description/search inputs now receive parameter filtering. Clinician and role catalog serializers use already-preloaded collections; revision signature flags preload associations.

Missing/limited endpoints are not automatically new CRUD requirements. Clinical note show returns revision metadata but no protected body; there is no complete browser note read/edit/sign contract yet. Conditions/allergies/medication statements have no clinical content or API. Participant assignment, clinician/facility/catalog maintenance, staff/supplier address management, protected document upload/download/scanning and coverage/credit/refund/claim workflows remain partial or absent. No actual message provider or patient billing gateway exists. No audit/version infrastructure table has a generic edit/delete endpoint.

Most clinic index APIs are bounded (25 default, 100 maximum; existing pharmacy uses its own 25-product/10-position contract). Patient show still returns an unbounded legacy-note array; detailed note histories/encounter participants/message delivery history, context sites and dashboard low-stock lists also need explicit bounds before scale acceptance. Existing Launch material/paperwork arrays are unpaginated. These are not silently rewritten because existing consumers rely on their shapes. Nested collection routes sometimes return an empty authorized set rather than 404 for a foreign patient; tests verify zero records/counts, never another tenant's data. No arbitrary SQL/order parameters are accepted.

Remaining query concerns: detailed invoice/grant serializers can execute additional association queries despite some preloading; globally encrypted staff names are not a meaningful database alphabetical sort. Site-only users can perform authorized mutation services but context/facility discoverability remains practice-oriented and may hide capabilities. These require a coordinated frontend contract, not a new broad permission rule.

## 8. Authorization review

`Ability` is the single Rails evaluator; active user + active practice membership + effective nonrevoked role grant is required. Legacy capability flags are not ORed into access. Global roles/permissions are definitions; they do not grant organization-wide chart access. Consultancy `User.admin` does not grant clinic access. No `can :manage, :all` exists. `accessible_by` is used for patient/dashboard collections and tested directly; other controllers scope through `current_practice` before resolving IDs. Both directions of cross-organization/practice access were exercised.

Services authorize independently for scheduling, note changes, observations, addresses, billing, inventory and grants; delivery-recording now also requires an actor and `messages.write`. Grant administration rejects self-elevation and checks the grantor can delegate every requested action. Site writers are authorized against the resource site, not a false practice-wide gate. Revocation is visible on subsequent requests; expiry/disabled-session tests are retained.

Residual boundaries: new services generally authorize before acquiring transaction locks, so all action/revocation races have not been proved. Some methods trust an actor model loaded earlier; existing runtime SQL permits broad tenant reads and does not establish independently trusted identity/RLS. Direct model access is not an authorization API. No job workflow exists beyond the base job, and no independent worker identity/reauthorization policy has been implemented. These remain security-proof work under T-34.5, not passing claims from controller tests.

## 9. PaperTrail and history review

Explicitly versioned models observed in source (metadata only):

- `Clinic::Care::Allergy` (`clinic_allergies`).
- `Clinic::Appointment` (`clinic_appointments`).
- `Clinic::AuditDeliveryReceipt` (`clinic_audit_delivery_receipts`).
- `Clinic::AuditResourceManifest` (`clinic_audit_resource_manifests`).
- `Clinic::ClinicianAssignment` (`clinic_clinician_assignments`).
- `Clinic::ClinicianCredential` (`clinic_clinician_credentials`).
- `Clinic::ClinicianProfile` (`clinic_clinician_profiles`).
- `Clinic::Care::Condition` (`clinic_conditions`).
- `Clinic::CoverageVersion` (`clinic_coverage_versions`).
- `Clinic::CreditNote` (`clinic_credit_notes`).
- `Clinic::Department` (`clinic_departments`).
- `Clinic::DocumentCategory` (`clinic_document_categories`).
- `Clinic::Document` (`clinic_documents`).
- `Clinic::EncounterNoteRevision` (`clinic_encounter_note_revisions`).
- `Clinic::EncounterNoteSignature` (`clinic_encounter_note_signatures`).
- `Clinic::EncounterNote` (`clinic_encounter_notes`).
- `Clinic::EncounterParticipant` (`clinic_encounter_participants`).
- `Clinic::Encounter` (`clinic_encounters`).
- `Clinic::InsuranceClaim` (`clinic_insurance_claims`).
- `Clinic::Inventory::CatalogEvent` (`clinic_inventory_catalog_events`).
- `Clinic::Inventory::CountApproval` (`clinic_inventory_count_approvals`).
- `Clinic::Inventory::Count` (`clinic_inventory_counts`).
- `Clinic::Inventory::HoldRelease` (`clinic_inventory_hold_releases`).
- `Clinic::Inventory::Hold` (`clinic_inventory_holds`).
- `Clinic::Inventory::Location` (`clinic_inventory_locations`).
- `Clinic::Inventory::Lot` (`clinic_inventory_lots`).
- `Clinic::Inventory::ReceiptLine` (`clinic_inventory_receipt_lines`).
- `Clinic::Inventory::Receipt` (`clinic_inventory_receipts`).
- `Clinic::Inventory::Supplier` (`clinic_inventory_suppliers`).
- `Clinic::InvoiceLine` (`clinic_invoice_lines`).
- `Clinic::Invoice` (`clinic_invoices`).
- `Clinic::Inventory::Item` (`clinic_items`).
- `Clinic::Care::MedicationStatement` (`clinic_medication_statements`).
- `Clinic::Membership` (`clinic_memberships`).
- `Clinic::MessageAttachment` (`clinic_message_attachments`).
- `Clinic::MessageDeliveryEvent` (`clinic_message_delivery_events`).
- `Clinic::MessageIntent` (`clinic_message_intents`).
- `Clinic::MessageOutbox` (`clinic_message_outbox`).
- `Clinic::Care::Note` (`clinic_notes`).
- `Clinic::Care::ObservationSource` (`clinic_observation_sources`).
- `Clinic::Care::Observation` (`clinic_observations`).
- `Clinic::Care::PatientAddressVersion` (`clinic_patient_address_versions`).
- `Clinic::Care::Patient` (`clinic_patients`).
- `Clinic::PaymentAllocation` (`clinic_payment_allocations`).
- `Clinic::PaymentEvent` (`clinic_payment_events`).
- `Clinic::Inventory::PharmacyBatchEvent` (`clinic_pharmacy_batch_events`).
- `Clinic::Inventory::PharmacyBatch` (`clinic_pharmacy_batches`).
- `Clinic::Inventory::PharmacyProduct` (`clinic_pharmacy_products`).
- `Clinic::RefundEvent` (`clinic_refund_events`).
- `Clinic::RoleGrantEvent` (`clinic_role_grant_events`).
- `Clinic::RoleGrant` (`clinic_role_grants`).
- `Clinic::Room` (`clinic_rooms`).
- `Clinic::Site` (`clinic_sites`).
- `Clinic::Staff::AddressVersion` (`clinic_staff_address_versions`).
- `Clinic::Staff::Member` (`clinic_staff_members`).
- `Clinic::Inventory::SupplierAddressVersion` (`clinic_supplier_address_versions`).
- `Clinic::VisitType` (`clinic_visit_types`).

No `object` or `object_changes` columns exist. Prior field values cannot be reified from PaperTrail by design; exact note revisions, address versions and inventory ledger rows are separate history. Tests verify patient sensitive-only update metadata, authenticated actor/correlation, rollback and actual version-insert failure. Allowed creates are versioned for append-only models; prohibited updates/deletes are not presented as successful mutation events. No versions endpoint or automatic pruning is provided.

Remaining coverage: `Clinic::Practice`, `Clinic::Inventory::Profile`, inventory `Entry` subclasses and global role/permission/account/session/Launch records are not PaperTrail-versioned. Inventory ledger/catalog triggers retain distinct attributable evidence but do not prove every required callback event. `User#revoke_sessions` still uses `delete_all`, with no session-event audit; practice→profile creation is unversioned; batch `before_validation` can create lot/location while a later validation fails, requiring an explicit operation outcome review. Launch paperwork digest/signing has its own snapshot semantics but not the specified mutation event coverage. These are classified as unmet auditable-path requirements, not blanket exclusions.

Audit events themselves should not be recursively versioned. Manifest/receipt models currently include `AppendOnly`, which also opts into PaperTrail; that is unnecessary audit-bookkeeping versioning and should be separated in a dedicated audit implementation. Cosmetic preferences do not need clinical value history; security/account changes do need an approved separate platform policy. Request context is now scoped/restored; manually invoked services must supply a `PaperTrail.request` context to get actor metadata, and worker/system attribution is not complete.

## 10. Access audit review

Currently captured: opted-in model mutation metadata; immutable note/address/financial event rows; inventory posting actor/profile and trigger catalog metadata; explicit role-grant lifecycle events. Ordinary API users cannot edit/delete version/access-event rows via routes; PostgreSQL triggers and tested restricted runtime grants protect mutation of those tables.

**Not captured by an operational audit pipeline:** VIEW/search, successful/failed LOGIN, DOWNLOAD/export, denied access, rolled-back attempts, external object outcomes and privileged database activity. `AuditEvent`, manifests, delivery receipts and platform events exist but are not wired to controllers/services or an independently durable sink. No sink outage/fail-closed/rollback-survival claim can be made. Same-transaction PaperTrail cannot retain evidence of a rolled-back attempt. No new audit vendor, distributed log or infrastructure was introduced during this review. This is a high-priority implementation gap before any real-data release.

## 11. Actual sensitive fields and exposure review

| Actual resource/fields | Current handling and limitation |
| --- | --- |
| `users.email_address`, `password_digest`; member session IDs/cookies; CSRF tokens | Password hashes are not serialized; session API returns only id/email/admin and explicit demo status. Parameter filtering, cookie/session/CSRF/origin protections exist. Session IDs are authentication secrets; no logging/dumping of actual credentials was performed. |
| Patient `display_name`, `reference`; staff `display_name`, `job_title` | Names use Active Record encryption; reference/title remain plaintext. Explicit authorized directory serializers include these intended fields. No DOB, SSN or insurance identifier column was found; generic filter entries are not evidence those fields exist. |
| Legacy note `body` | Active Record encryption; authorized patient detail returns text. Unbounded history and missing read audit remain. |
| New revision `encrypted_body`; typed address `encrypted_address`; message `encrypted_recipient_snapshot`/`encrypted_content`; coverage `encrypted_coverage_evidence` | Despite their names, these columns have no Active Record `encrypts` declaration or actual encryption adapter. They currently store supplied values as text. Metadata serializers omit these payloads. This is a confirmed protected-value design gap, not protection established by naming. No encryption system or retroactive data conversion was invented here. |
| Observation `numeric_value`, `text_value`, `coded_value`, `code`/system/version/unit/missing reason/times | Explicit patient-scoped observation API returns clinical values; parameter value filtering improved. Values/provenance are plaintext in storage and no qualified field-level visibility policy is implemented. |
| Document `object_key`, `object_version`, `checksum`, size/type/scan state | Object key omitted by serializer; version/checksum metadata exposed to authorized document readers. No real objects, upload service, public URLs or download transport. Metadata itself can be sensitive; no read audit. |
| Invoice `description_snapshot`, quantity/unit/post amount/currency; payment external references; coverage evidence | Patient-scoped synthetic API; exact decimals and filtering. Financial metadata can be sensitive; no real payment credentials or gateway. |
| Clinician `issuer_reference`, credential type/jurisdiction/review status; immutable actor/resource IDs | Issuer reference omitted from clinician serializer; ID/provenance metadata still requires access control. Credential strings do not establish authority. |
| Launch contact `name`, `email`, `message`; paperwork `body`, `signature_name`, digests/signing times | Existing encryption for contact/body/signature values, owner/admin-scoped serializers and synthetic signing gate. No new disclosure pathway added; lack of protected access/mutation audit remains. |

No actual patient or confidential applicant information was used. Error handling now avoids raw FK/authorization failures for reviewed expected cases; production retains generic error pages and limited model inspection. Other database exceptions can still log SQL/bind details, especially in development. Filtering HTTP parameters does not automatically sanitize SQL, URLs, free-form field names or every exception. Client search values should not carry patient text in URLs; current GET reference search remains a documented exposure concern. PaperTrail values are omitted, but subject IDs and changed-field names are still protected metadata. No clinical export/report feature exists; Launch's owner-scoped synthetic text receipt lacks download audit.

## 12. Deletion and historical preservation review

| Entity family | Classification and observed enforcement |
| --- | --- |
| Sessions | Hard deletion is appropriate to invalidate active credentials, but preserve separate security-event evidence when implemented. User disable/password change reliably revoke sessions. |
| Cosmetic preferences | Hard deletion acceptable for current nonclinical settings; no clinical authority derived. |
| Practices/memberships/patients/staff/catalog owners | Restrict deletion; child FKs and Rails `restrict_with_error` prevent many cascades. Unreferenced mutable rows can still be deleted via model/SQL; archive/retention policy requires business review. No delete API added. |
| Note revisions/signatures, address versions, ledger/receipt/hold/count/profiles | Restrict deletion, preserve immutable history; database triggers/FKs plus runtime revocations protect ordinary mutation. Some legacy evidence is intentionally nullable rather than backfilled. |
| Messages/attachments/delivery rows, invoice lines, payment/credit/refund/coverage/claims | Restrict historical deletion; previously missing database append-only protections added. No external data-retention or reversal policy selected. |
| Documents/clinical observations/encounter headers | Restrict clinical deletion; document model refuses destroy, references constrain children; full SQL-level deletion and retention/legal-hold coverage remains incomplete. No storage deletion service exists. |
| Audit/version evidence | Restrict edits/deletes/truncate under ordinary runtime role. Schema owner can still alter/drop/truncate; independent durability is absent. |
| Launch materials/learning progress | `Material -> learning_progresses` and `User -> learning_progresses` use `dependent: :destroy`; potentially dangerous if training completion becomes contractual evidence. Requires retention/business decision before real-client use. Paperwork itself restricts deletion. |

No organization→patient→encounter→document→audit cascade was found. Rails guards alone do not enforce every direct SQL lifecycle. Soft deletion was not introduced indiscriminately.

## 13. Security findings

Severity is relative to this local synthetic prototype and the risk if later enabled for healthcare data. No CRITICAL active exposure was found or alleged. “Fixed” is bounded to the stated test/evidence, not a security certification.

| Severity | Issue/risk | Affected code | Smallest disposition | Fixed here? |
| --- | --- | --- | --- | --- |
| HIGH | Raw runtime writes could change encounter/patient/author identity and rewrite historical meaning | New ERD mutable tables; migration `20260831000800` | Preserve selected ownership attributes at database boundary | Yes; direct bypass test |
| HIGH | Granted role permission set could grow without new version/grant review | `RoleVersionPermission`, `clinic_role_grants` | Serialize on role and prohibit insert once granted; runtime catalog writes denied | Yes; DB test; no universal compromised-runtime claim |
| HIGH | Concurrent independent payments over-allocate invoice | `Billing::AllocatePayment` | Lock stable patient then invoice/payment; exact retry returns existing allocation | Yes; reproduced and three race trials pass |
| HIGH | “encrypted_*” clinical/message/address/coverage fields store plaintext | Relevant models listed above | Accept explicit protected-value policy and migrate using reviewed existing encryption facilities | No; broader policy/data transition, no real-data release |
| HIGH | Access/denial/login/download/rollback audit not wired or independently durable | Audit models, controllers/services | Implement approved bounded audit interface and failure/outage/rollback tests | No; no audit infrastructure redesign authorized |
| HIGH | Version subject binding and callback/SQL/global identity coverage incomplete | `Clinic::ModelVersion`, version migration, account/Launch/inventory write paths | Enforce subject tenancy and classify/test every required mutation path | Partial: request actor context fixed; binding/full coverage open |
| MEDIUM | Signed note could target older revision; client could supply signing timestamp | `SignEncounterNote`, notes controller | Require latest revision, derive timestamp server-side | Yes; stale-sign/forged-time tests |
| MEDIUM | Cancellation does not free reservation | Appointment exclusion constraints | Restrict overlap predicate to active scheduled/confirmed states | Yes; overlap/adjacency/cancellation tests |
| MEDIUM | Site-granted writer blocked; service denials crash API | Scheduling/note controllers, clinic base controller | Authorize actual site in service, return generic 403 | Yes; site/foreign-site tests |
| MEDIUM | Ambiguous local timestamps silently interpreted | Request parameter concern | Require explicit ISO offset | Yes |
| MEDIUM | Invoice post serialized boolean; address primary flag stale | `PostInvoice`, addresses controller | Return record/reload persisted pointer and stop after denial | Yes; lifecycle tests |
| MEDIUM | Delivery service callable without actor | `Messaging::RecordDelivery` | Require actor and messages permission | Yes; API/direct-call boundary updated |
| MEDIUM | Missing actual SQL immutability on message intent/attachment/event and line/claim models | ERD migration guards | Add append-only triggers/runtime restrictions | Yes; runtime/schema inspection; not full financial posting invariant |
| MEDIUM | Legacy authorization transition lacks arbitrary-account capability parity | Migration `20260831000700`, deployment transition | Reviewed explicit backfill and old/new ability equivalence before cutover | No; no silent broad regrant |
| MEDIUM | Clinical graph cycles, direct-SQL financial rules, role-revocation race proof incomplete | Observations/sources, financial services, authorization | Keep dependent clinical/financial paths synthetic; bounded invariant work before activation | No; larger than safe review patch |
| LOW | Missing inverse/wrong association FKs and version helper collisions | Document category, staff/supplier address and inverse models | Explicit FK/column access and bidirectional mapping tests | Yes |
| LOW | New sensitive request fields not filtered, obvious preload bypasses | Filter initializer and serializers | Extend actual field filters and consume preloaded collections | Yes; SQL/URL policy remains open |
| LOW | Unbounded nested collections and incomplete site capability discovery | Patient/note/context/dashboard and Launch payloads | Coordinated paginated consumer contract | No; preserved current consumer shape |
| INFORMATIONAL | Diagram/proposal notes lag implementation; 68 tables do not imply 68 completed workflows | Vault current-state notes | Link this observed matrix and retain dated proposal provenance | Yes |

## 14. ERD and business requirement gaps

**Confirmed defects:** findings marked fixed above were reproduced by tests/source/schema evidence. Remaining confirmed implementation gaps include raw-text protected payloads, absent operation audit pipeline, unbound PaperTrail subjects, audit callback/bypass omissions, clinical placeholder tables and incomplete migration permission parity. They must not be described as a completed EHR backend.

**Likely design gaps:** no usable signed-note correction/addendum workflow despite the error text advising one; no complete derivation-cycle model; direct SQL posting/financial immutability incomplete; document metadata and scan-lifecycle reconciliation lack an object adapter; source/provider namespace for financial/message deduplication is incomplete; nested history pagination and field-level chart disclosure need accepted consumer contracts.

**Product/business decisions:** exact clinical fields/terminology/states/signature/attestation roles, effective credential evidence, billing rounding/eligibility/credit/refund/claim rules, retention/legal holds and any external object/message/payment/audit service remain unselected. The baseline amendment history remains a documentation gap; this task did not invent final founder amendments. Multiple organizations per login are not a missing feature: D-026 explicitly selects separate logins per clinic. Global role names are also intentional catalog identity, not erroneously unscoped tenant-owned roles.

**Future enhancements:** typed intake/check-in/handoff/commercial patient membership, prescribing/results/dispensing, approved clinical exports, richer site discoverability and scale/accessibility review belong to existing planned work. Supplier prices remain D-029/T-37 deferred. No new RLS, event sourcing, microservices, queues, search engine, authentication vendor or encryption system was introduced.

## 15. HIPAA-oriented architecture assessment

**Technical safeguards actually present:** unique provisioned logins, password hashes, active-account/session expiry/revocation, same-origin cookie/CSRF protection, explicit Rails abilities, practice-scoped resource lookup, tenant-qualified FKs, selected immutable ownership/history/stock guards, exact ledger arithmetic, bounded collection APIs, no-store responses, selective encrypted legacy fields, metadata-only versions, server-derived request actors, ordinary runtime history/catalog restrictions and packaged clinic denial.

**Technical gaps discovered:** incomplete protected-value encryption/field visibility, absent independent access/security audit, incomplete audit subject/bypass/worker coverage, no MFA, no independently trusted database tenant identity, no full revocation-race proof, partial deletion/retention/clinical lifecycle, incomplete external adapter/recovery contracts and unimplemented clinical content. Tests establish only the exercised local safeguards.

**Outside this code review:** responsible entity roles/lawful purposes, exact service/BAA coverage, documented risk analysis, workforce/device/access procedures, clinical/professional validation, retention/legal holds, incident response, backup/restore/key/object/audit operating evidence and scoped go-live approval. Existing L-05/E2/E3 and confidential/operational gates remain open. No legal applicability assessment or compliance certification was performed.

**Future hardening:** resolve the highest-risk gaps through the existing T-13/T-23/T-34.5 work, with accepted threat model and service boundaries; keep clinic production denial and synthetic-only use until actual evidence is accepted. Prefer bounded fixes/tests and operational evidence over replacing the current architecture.

## Validation evidence

All checks below ran locally on 2026-08-31. Application data was wholly synthetic. No GitHub run, hosted deployment or production migration was performed.

| Check | Actual outcome |
| --- | --- |
| Full Rails Minitest suite | **144 total, 144 passed, 0 failed, 0 errors, 0 skipped**; 2,887 assertions. Includes ERD contract, routes, permissions, both tenant directions, lifecycle, seed rerun, PaperTrail and existing regressions. |
| `bin/rails zeitwerk:check` | Application eager loading passes. |
| Schema consistency | Fresh migration/upgrade acceptance passes; a separate `db:schema:dump` matches canonical `db/structure.sql` exactly after stripping surrounding whitespace. |
| Development seeds | Explicit opt-in `db:seed` succeeds twice in the task-owned development scratch DB; 2 synthetic practices, 60 patients, 8 scenario users, 21 permissions. Test additionally compares every table count and preserves a revoked grant on rerun. |
| `bin/verify-backend` | All 5 groups pass: independent-payment races (3 trials), address versions, appointment overlap, stale note revision and actual restricted runtime grants. Unique database and no-login role removed. |
| `bin/verify-postgres` | All 4 groups pass: legacy IDs/values/ciphertext/history/ledger upgrade; stock/retry/settings races; separate backup/restore; fresh migrations. This does not establish legacy effective-role parity. |
| Root `bin/verify-web` | Real Vite proxy → Rails session/CSRF/origin, named roles/isolation, settings conflict, demo, clinic/inventory receipt retry, portal and logout pass. Child processes and own DB removed. |
| Frontend | 69/69 tests in 5 files pass; format check and TypeScript/Vite build pass; npm audit reports 0 vulnerabilities. |
| Ruby style/security | RuboCop: 238 files, no offenses. Brakeman: 0 warnings/0 errors. Bundler Audit: no vulnerabilities, refreshed advisory commit `0a02e5f06a8a7d02f2e067ee6489e511b67c06f7` (1,237 advisories). Static scans are not comprehensive security proof. |
| Offline operations/CI | 25 unittest cases pass; all host Bash files parse; `actionlint .github/workflows/ci.yml` passes. CI now invokes the backend race/runtime verifier. |

The Rails commands used `RAILS_ENV=test APPLY_TEST_DATABASE=apply_final_verify_20260831` through `bin/postgres exec`, with inherited `DATABASE_URL` removed. Development seed commands used `RAILS_ENV=development APPLY_DEVELOPMENT_DATABASE=apply_final_seed_20260831 APP_SYNTHETIC_SEEDS=1`. No existing development or test database was reset. Forward migration `20260831000800` is checked in source only for existing environments: back up, review role-transition gaps, apply the migration and reapply runtime grants through the normal release procedure before any future cutover.

Phase coverage: 1–2 inventory/plan → scope and matrices; 3–11 tests → sections 1–2 and suite; 12–14 seeds → section 3; 15–24 ERD/schema/API/domain → sections 4–8/14; 25–28 history/audit → sections 9–10; 29–33 sensitive data/security → sections 8/11/13; 34–37 deletion/integrity → sections 6/12; 38–43 parameters/errors/query/pagination/filter/export → section 7/11; 44–46 healthcare scope/safe fixes → sections 13–15; 47 → this verification table. Larger gaps are documented as the attached prompt directs, not silently redesigned or marked resolved.

Final repository/documentation checks: `git diff --check` passes; 790 wiki/heading links resolve across 38 uniquely named notes reachable from Home; eight touched notes pass frontmatter/fence validation, with 21 valid relative links. Exactly `apply_final_verify_20260831` and `apply_final_seed_20260831` were removed after verification. Catalog inspection confirms no task-owned backend-verifier database or temporary role remains. Existing development/test contents and concurrent Obsidian workspace state were preserved. Changes remain uncommitted on the requested new branch.

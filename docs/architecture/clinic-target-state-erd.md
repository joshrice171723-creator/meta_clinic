---
type: architecture-diagram
status: design-baseline-with-implementation-review
updated: 2026-09-13
---
# Target-State Clinic ERD

Home: [00 Home](<../../APPlyVault/00%20Home.md>) · Index: [01 Table of Contents](<../../APPlyVault/01%20Table%20of%20Contents.md>) · Rationale: [Multi-Clinic ERD Adversarial Review](<../../records/design-reviews/2026-08-31-multi-clinic-erd-review.md#Engineering%20resolutions%20%E2%80%94%20revision%202>) · Agent handoff: [ERD Implementation Prompt](<../../records/prompts/2026-08-31-erd-implementation-prompt-revision-5.md>) · Broader proposal: [Data Modeling](<../../records/proposals/2026-08-30-data-modeling.md>)

## Scope and reading key

**Observed implementation update — 2026-08-31:** [Backend Verification Report](<../../records/verification/2026-08-31-backend-verification.md>) maps all 68 entities and 103 diagram relationships to the current Rails/PostgreSQL schema, models and APIs. Historical E/E+/P labels below retain their design-time origin; P no longer means the table is absent from current source. The report distinguishes structural implementation from incomplete clinical/audit/storage workflows. The final amendment record remains unresolved; no new founder approval or clinical release is inferred. Migrations and generated `structure.sql` remain runtime truth.

**D-044 scope update — 2026-08-31:** this corrected ERD is the baseline for the requested **full backend replacement**, pending the founder's minor amendments. [ERD Implementation Prompt](<../../records/prompts/2026-08-31-erd-implementation-prompt-revision-5.md>) revision 5 supersedes the former existing-foundation-only first run. Reconcile the complete target before structural implementation; pictured modules are not automatically deferred because they were originally proposed. This note is not the current database or evidence that the replacement has run. No migrations or source-system imports accompany this scope update.

`E` = existing table in the original retained baseline; `E+` = existing table with a proposed extension; `P` = proposed table at the original diagram review. These historical labels describe design-time origin, **not current implementation status or a requirement to retain old implementation shape or exclude P entities**. Final names, fields and constraints must follow the approved amendments and complete schema contract. More detailed decompositions below are recommendations, not recovered raster text. [structure.sql](../../apps/api/db/structure.sql) and its migrations remain current runtime truth, not the replacement's design limit. Existing behavior/history needs an explicit transition; identity, clinical, service, retention, billing and release choices remain at their applicable gates. Work stays synthetic-only.

Each box uses the physical table name. Repeated boxes in different panels are the **same entity**, not duplicate tables. Common timestamps and most payload fields are omitted. Existing attributes shown retain their actual names; proposed `encrypted_*` attributes describe protected payloads, not a selected encryption/storage implementation. No invented patient examples are needed.

Crow's-foot endpoints: `||` exactly one, `o|` zero or one, `o{` zero or many. Dashed connectors are non-identifying relationships, **not** optional permissions or unimplemented status; endpoint symbols determine optionality. `PK`/`FK`/`UK` are key labels, with composite keys specified below rather than misleadingly marking each component unique on its own. Syntax follows the [Mermaid ER notation](https://mermaid.js.org/syntax/entityRelationshipDiagram.html).

## 1. Overall ownership

Organization grouping is optional business metadata. **The practice is the custody/tenant boundary.** Every clinic-owned entity in the detailed panels carries non-null `practice_id`, even where that column or the repeated practice connector is omitted for readability. No arrow represents inherited chart permission.

```mermaid
erDiagram
    organizations["P - organizations"]
    clinic_practices["E+ - clinic_practices"]
    users["E - users"]
    clinic_memberships["E - clinic_memberships"]
    clinic_sites["P - clinic_sites"]
    clinic_patients["E - clinic_patients"]
    clinic_appointments["P - clinic_appointments"]
    clinic_encounters["P - clinic_encounters"]
    clinic_encounter_notes["P - clinic_encounter_notes"]
    clinic_documents["P - clinic_documents"]
    clinic_items["E - clinic_items"]
    clinic_pharmacy_products["E - clinic_pharmacy_products"]
    clinic_audit_events["P - clinic_audit_events"]
    organizations |o..o{ clinic_practices : "business grouping only"
    users ||..o| clinic_memberships : "at most one clinic"
    clinic_practices ||..o{ clinic_memberships : authorizes
    clinic_practices ||..o{ clinic_sites : operates
    clinic_practices ||..o{ clinic_patients : owns
    clinic_practices ||..o{ clinic_items : stocks
    clinic_practices ||..o{ clinic_pharmacy_products : catalogs
    clinic_practices ||..o{ clinic_audit_events : scopes
    clinic_patients ||..o{ clinic_appointments : books
    clinic_patients ||..o{ clinic_encounters : receives
    clinic_appointments |o..o| clinic_encounters : "optional booking"
    clinic_encounters ||..o{ clinic_encounter_notes : documents
    clinic_patients ||..o{ clinic_documents : owns
```

Detailed panels separate facilities from stock bins, directory identity from authorization, booked clinicians from actual participants, and draft history from signed revisions. Patient billing is a separate target domain, not the basis for APPly software fees.

## 2. Accounts, facilities and clinician identity

### Accounts and facility structure

```mermaid
erDiagram
    organizations["P - organizations"] {
        bigint id PK
        text name
    }
    clinic_practices["E+ - clinic_practices"] {
        bigint id PK
        bigint organization_id FK "proposed; nullable"
        text name
        text timezone
    }
    users["E - users"] {
        bigint id PK
        text email_address UK
        boolean active
    }
    clinic_memberships["E - clinic_memberships"] {
        bigint id PK
        bigint practice_id FK
        bigint user_id FK, UK
        boolean active
        boolean patients_access
        boolean inventory_access
        boolean staff_access
    }
    identity_preferences["E - identity_preferences"] {
        bigint id PK
        bigint user_id FK, UK
        text palette
        text mode
        integer revision
    }
    member_sessions["E - member_sessions"] {
        bigint id PK
        bigint user_id FK
        datetime expires_at
    }
    clinic_sites["P - clinic_sites"] {
        bigint id PK
        bigint practice_id FK
        text code
        text timezone_override "nullable; practice fallback"
    }
    clinic_rooms["P - clinic_rooms"] {
        bigint id PK
        bigint practice_id FK
        bigint site_id FK
        text code
    }
    clinic_departments["P - clinic_departments"] {
        bigint id PK
        bigint practice_id FK
        text code
    }
    clinic_visit_types["P - clinic_visit_types"] {
        bigint id PK
        bigint practice_id FK
        text code
        datetime retired_at "nullable"
    }
    organizations |o..o{ clinic_practices : groups
    users ||..o| clinic_memberships : has
    users ||..o| identity_preferences : customizes
    users ||..o{ member_sessions : authenticates
    clinic_practices ||..o{ clinic_memberships : assigns
    clinic_practices ||..o{ clinic_sites : operates
    clinic_sites ||..o{ clinic_rooms : contains
    clinic_practices ||..o{ clinic_departments : organizes
    clinic_practices ||..o{ clinic_visit_types : defines
```

The account panel shows the existing flag-based baseline; the replacement must map every current inventory/action capability into the versioned authorization contract below, with one effective evaluator at cutover. Keeping parallel flag and grant authority is not required or permitted by these origin labels. Session expiry retains the 12-hour absolute maximum; no new MFA mechanism is inferred. No clinic picker, self-assignment or organization-wide clinical grant. A portal-only user has no clinic membership. Department may span sites; room belongs to one site, not necessarily a department. Codes are unique within practice, except room code is unique within `(practice_id, site_id)`. Human names and street text are not globally unique.

Operational settings remain typed/versioned at the practice or site that owns them, with explicit fallback only for named fields. The diagram shows the existing practice timezone and proposed site override, not an unrestricted settings JSON hierarchy.

### Clinician identity and assignments

```mermaid
erDiagram
    clinic_memberships["E - clinic_memberships"]
    clinic_sites["P - clinic_sites"]
    clinic_departments["P - clinic_departments"]
    clinic_clinician_profiles["P - clinic_clinician_profiles"] {
        bigint id PK
        bigint practice_id FK
        bigint membership_id FK "one profile per membership"
    }
    clinic_clinician_assignments["P - clinic_clinician_assignments"] {
        bigint id PK
        bigint practice_id FK
        bigint clinician_profile_id FK
        bigint department_id FK
        bigint site_id FK
        datetime effective_from
        datetime effective_until "nullable"
    }
    clinic_clinician_credentials["P - clinic_clinician_credentials"] {
        bigint id PK
        bigint practice_id FK
        bigint clinician_profile_id FK
        text credential_type
        text jurisdiction
        text issuer_reference
        text review_status
        datetime valid_until "nullable"
    }
    clinic_memberships ||..o| clinic_clinician_profiles : describes
    clinic_clinician_profiles ||..o{ clinic_clinician_assignments : serves
    clinic_sites ||..o{ clinic_clinician_assignments : hosts
    clinic_departments ||..o{ clinic_clinician_assignments : organizes
    clinic_clinician_profiles ||..o{ clinic_clinician_credentials : records
```

The proposed assignment tuple is unique within practice and lifecycle changes retain history; all linked entities must be in the same practice. A credential or assignment does not grant access or establish clinical authority. Existing `clinic_staff_members` remains a separate directory with no automatic user/profile linkage. Directory-only external clinicians must not be made login users just to appear in a directory. Reassignment/review history and provenance are required even though their event attributes are not expanded here.

## 3. Appointments, actual care and immutable notes

### Patient and encounter relationships

```mermaid
erDiagram
    clinic_patients["E - clinic_patients"] {
        bigint id PK
        bigint practice_id FK
        text reference "unique within practice"
        text display_name "existing encrypted field"
    }
    clinic_appointments["P - clinic_appointments"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint site_id FK "nullable"
        bigint room_id FK "nullable; requires site"
        bigint booked_clinician_id FK "nullable; profile"
        bigint visit_type_id FK "nullable"
        timestamptz starts_at
        timestamptz ends_at
        text status
    }
    clinic_encounters["P - clinic_encounters"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint appointment_id FK "nullable; unique when present"
        bigint site_id FK "nullable"
        bigint room_id FK "nullable; requires site"
        timestamptz started_at
        timestamptz ended_at "nullable until completed"
        text status
    }
    clinic_encounter_participants["P - clinic_encounter_participants"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint encounter_id FK
        bigint membership_id FK
        text participation_role
        timestamptz effective_from
        timestamptz effective_until "nullable"
    }
    clinic_memberships["E - clinic_memberships"]
    clinic_sites["P - clinic_sites"]
    clinic_rooms["P - clinic_rooms"]
    clinic_clinician_profiles["P - clinic_clinician_profiles"]
    clinic_visit_types["P - clinic_visit_types"]
    clinic_patients ||..o{ clinic_appointments : books
    clinic_patients ||..o{ clinic_encounters : receives
    clinic_appointments |o..o| clinic_encounters : "zero or one each"
    clinic_sites |o..o{ clinic_appointments : hosts
    clinic_sites |o..o{ clinic_encounters : hosts
    clinic_rooms |o..o{ clinic_appointments : reserves
    clinic_rooms |o..o{ clinic_encounters : locates
    clinic_clinician_profiles |o..o{ clinic_appointments : "booked clinician"
    clinic_visit_types |o..o{ clinic_appointments : classifies
    clinic_encounters ||..o{ clinic_encounter_participants : "actual participants"
    clinic_memberships ||..o{ clinic_encounter_participants : participates
```

Walk-ins have no appointment. An appointment cannot be reused by multiple encounters. Both records own their patient link; encounter history is not inferred from mutable booking data. Actual participants include authorized clinical/staff memberships; their roles and event history require the accepted workflow. Optional site/room is a proposed baseline allowing unassigned/remote care; accepted workflows can require them. Room references must match both practice and site. Positive, half-open booking intervals need transactional same-resource overlap protection; clinical states and override policy are not selected by this diagram.

### Legacy drafts and future note lifecycle

```mermaid
erDiagram
    clinic_patients["E - clinic_patients"]
    clinic_memberships["E - clinic_memberships"]
    clinic_encounters["P - clinic_encounters"]
    clinic_notes["E - clinic_notes"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint author_id FK "membership user_id; not membership id"
        text body "existing encrypted append-only draft"
    }
    clinic_encounter_notes["P - clinic_encounter_notes"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint encounter_id FK
        integer lock_version
    }
    clinic_encounter_note_revisions["P - clinic_encounter_note_revisions"] {
        bigint id PK
        bigint practice_id FK
        bigint note_id FK
        integer revision_no
        bigint prior_revision_id FK "nullable; same note"
        bigint author_membership_id FK
        text encrypted_body
        integer payload_version
    }
    clinic_encounter_note_signatures["P - clinic_encounter_note_signatures"] {
        bigint id PK
        bigint practice_id FK
        bigint note_id FK
        bigint revision_id FK "exact revision of this note"
        bigint signer_membership_id FK
        text content_digest
        text attestation_version
        timestamptz signed_at
    }
    clinic_patients ||..o{ clinic_notes : "legacy drafts only"
    clinic_memberships ||..o{ clinic_notes : "attribution via user_id"
    clinic_patients ||..o{ clinic_encounter_notes : owns
    clinic_encounters ||..o{ clinic_encounter_notes : documents
    clinic_encounter_notes ||..o{ clinic_encounter_note_revisions : versions
    clinic_encounter_note_revisions |o..o{ clinic_encounter_note_revisions : predecessor
    clinic_encounter_note_revisions ||..o{ clinic_encounter_note_signatures : attests
    clinic_memberships ||..o{ clinic_encounter_note_revisions : authors
    clinic_memberships ||..o{ clinic_encounter_note_signatures : signs
```

Header identity is immutable. Unique `(practice_id, note_id, revision_no)` and same-note predecessor/signature FKs bind history. Revision and signature rows inherit patient/encounter through the immutable note header; they do not duplicate independent patient IDs. Atomic creation should produce the initial revision; the diagram permits a header with no revision at the relational level, not a completed clinical note. Save/sign lock the header and reject stale expected versions; signed revisions never mutate. Addenda/corrections append with attribution and reason. Signer counts, co-signing and attestation rules remain clinically gated; `0..many` signatures is structural capacity, not a selected signing policy. No automatic migration of legacy drafts into encounters or signatures.

### Typed clinical values — later accepted fields only

```mermaid
erDiagram
    clinic_patients["E - clinic_patients"]
    clinic_encounters["P - clinic_encounters"]
    clinic_observations["P - clinic_observations"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint encounter_id FK "nullable"
        bigint author_membership_id FK
        bigint parent_observation_id FK "nullable; same patient"
        text code
        text code_system
        text code_version
        text value_kind
        numeric numeric_value "nullable"
        text text_value "nullable; protected"
        text coded_value "nullable; with code provenance"
        text unit_code "required for numeric value"
        text missing_reason "nullable"
        timestamptz observed_at
        timestamptz recorded_at
    }
    clinic_observation_sources["P - clinic_observation_sources"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint derived_observation_id FK
        bigint source_observation_id FK
        text formula_version
    }
    clinic_conditions["P - clinic_conditions"]
    clinic_allergies["P - clinic_allergies"]
    clinic_medication_statements["P - clinic_medication_statements"]
    clinic_patients ||..o{ clinic_observations : owns
    clinic_encounters |o..o{ clinic_observations : contextualizes
    clinic_observations |o..o{ clinic_observations : groups
    clinic_observations ||..o{ clinic_observation_sources : "derived output"
    clinic_observations ||..o{ clinic_observation_sources : "source input"
    clinic_patients ||..o{ clinic_conditions : records
    clinic_patients ||..o{ clinic_allergies : records
    clinic_patients ||..o{ clinic_medication_statements : records
```

Each value-bearing observation has exactly one matching value representation or a missing reason with no value. A group-only observation (for example, a blood-pressure panel) has an explicit group kind, no scalar value/missing reason, and separately typed child components; reject cycles and cross-patient grouping. Systolic/diastolic are separate numeric observations. Source links are same-patient, immutable and acyclic; derived values preserve their formula and source versions rather than being silently recalculated. Clinical terminology, units, ranges and interpretation still require review. Conditions, allergies and medication statements need their own accepted typed history, not one generic clinical blob. Orders, results, procedures, administrations and dispensing are distinct later concepts, not automatically implemented by this panel or coupled to stock deductions.

## 4. Inventory — preserve the implemented single ledger

### Catalogs, positions and receiving

All entities in the next two diagrams already exist. Selected attributes/connectors omit legacy compatibility columns. In the replacement, preserve their required behavior, evidence and data through an explicit tested mapping; old columns/code need not remain active solely for shape compatibility. No legacy history is disposable by implication.

```mermaid
erDiagram
    clinic_items["E - clinic_items"] {
        bigint id PK
        bigint practice_id FK
        text sku
        integer quantity "guarded cached balance"
    }
    clinic_pharmacy_products["E - clinic_pharmacy_products"] {
        bigint id PK
        bigint practice_id FK
        text sku
        text stock_unit
        integer quantity_scale
        numeric package_size
    }
    clinic_inventory_lots["E - clinic_inventory_lots"] {
        bigint id PK
        bigint practice_id FK
        bigint product_id FK
        text number
        date expires_on
    }
    clinic_inventory_locations["E - clinic_inventory_locations"] {
        bigint id PK
        bigint practice_id FK
        text name "stock bin; not a clinical room"
    }
    clinic_pharmacy_batches["E - clinic_pharmacy_batches"] {
        bigint id PK
        bigint practice_id FK
        bigint product_id FK
        bigint lot_id FK
        bigint location_id FK
        numeric on_hand "guarded cached balance"
    }
    clinic_inventory_suppliers["E - clinic_inventory_suppliers"]
    clinic_inventory_receipts["E - clinic_inventory_receipts"] {
        bigint id PK
        bigint practice_id FK
        bigint supplier_id FK "nullable"
        bigint actor_id FK "membership user_id"
        bigint profile_id FK
        text request_key
        text payload_digest
    }
    clinic_inventory_receipt_lines["E - clinic_inventory_receipt_lines"] {
        bigint id PK
        bigint practice_id FK
        bigint receipt_id FK
        bigint batch_id FK
        numeric input_quantity
        numeric conversion_factor
        numeric quantity
        text input_unit
        text stock_unit
    }
    clinic_inventory_entries["E - clinic_inventory_entries"] {
        bigint id PK
        bigint practice_id FK
        bigint item_id FK "nullable; XOR batch_id"
        bigint batch_id FK "nullable; XOR item_id"
        bigint receipt_line_id FK "nullable"
        bigint count_id FK "nullable"
        bigint actor_id FK "legacy exception retained"
        bigint profile_id FK "required for posted origin"
        text request_key
        text stock_unit
        numeric quantity "signed nonzero delta"
    }
    clinic_pharmacy_products ||..o{ clinic_inventory_lots : identifies
    clinic_inventory_lots ||..o{ clinic_pharmacy_batches : positions
    clinic_inventory_locations ||..o{ clinic_pharmacy_batches : stores
    clinic_inventory_suppliers |o..o{ clinic_inventory_receipts : supplies
    clinic_inventory_receipts ||..o{ clinic_inventory_receipt_lines : contains
    clinic_pharmacy_batches ||..o{ clinic_inventory_receipt_lines : receives
    clinic_inventory_receipt_lines |o..o| clinic_inventory_entries : "receipt posting"
    clinic_pharmacy_batches |o..o{ clinic_inventory_entries : "pharmacy target"
    clinic_items |o..o{ clinic_inventory_entries : "office target"
```

Each ledger row has exactly one target: office item **or** pharmacy position. Optional endpoints alone do not express that XOR. Product/lot/position tuples and clinic-scoped SKUs/positions remain constrained by the existing schema. Receipt posting requires one matching ledger entry by successful transaction completion; the optional diagram edge describes the nullable reference/relational maximum, not permission to leave a completed receipt unposted. Receipt line quantity is the exact input quantity × evidenced conversion. Retain optional receipt costs/currency and attribution; no supplier-price integration, valuation or billing formula is added.

### Holds, counts, provenance and audit metadata

```mermaid
erDiagram
    clinic_pharmacy_batches["E - clinic_pharmacy_batches"]
    clinic_inventory_entries["E - clinic_inventory_entries"]
    clinic_inventory_receipts["E - clinic_inventory_receipts"]
    clinic_pharmacy_products["E - clinic_pharmacy_products"]
    clinic_inventory_holds["E - clinic_inventory_holds"] {
        bigint id PK
        bigint practice_id FK
        bigint batch_id FK
        text kind
        text request_key
    }
    clinic_inventory_hold_releases["E - clinic_inventory_hold_releases"] {
        bigint id PK
        bigint practice_id FK
        bigint hold_id FK "one release per hold"
        bigint actor_id FK
        text reason
    }
    clinic_inventory_counts["E - clinic_inventory_counts"] {
        bigint id PK
        bigint practice_id FK
        bigint batch_id FK
        bigint profile_id FK
        bigint cutoff_entry_id "nullable ledger cutoff; not a FK"
        numeric expected_quantity
        numeric observed_quantity
    }
    clinic_inventory_count_approvals["E - clinic_inventory_count_approvals"] {
        bigint id PK
        bigint practice_id FK
        bigint count_id FK "one approval per count"
        bigint entry_id FK "nullable if no variance"
        bigint actor_id FK
    }
    clinic_inventory_profiles["E - clinic_inventory_profiles"] {
        bigint id PK
        bigint practice_id FK
        integer version
        text status
        text_array capabilities
    }
    clinic_inventory_catalog_events["E - clinic_inventory_catalog_events"] {
        bigint id PK
        bigint practice_id FK
        bigint product_id FK
        bigint actor_id FK
        text_array changed_fields
    }
    clinic_pharmacy_batches ||..o{ clinic_inventory_holds : holds
    clinic_inventory_holds ||..o| clinic_inventory_hold_releases : releases
    clinic_pharmacy_batches ||..o{ clinic_inventory_counts : counted
    clinic_inventory_counts ||..o| clinic_inventory_count_approvals : approved
    clinic_inventory_entries |o..o| clinic_inventory_count_approvals : "variance posting"
    clinic_inventory_profiles ||..o{ clinic_inventory_receipts : governs
    clinic_inventory_profiles ||..o{ clinic_inventory_counts : governs
    clinic_inventory_profiles |o..o{ clinic_inventory_entries : "posting provenance"
    clinic_pharmacy_products ||..o{ clinic_inventory_catalog_events : changes
```

Existing actor references generally use `(practice_id, actor_id)` → membership `(practice_id, user_id)`, not membership PK. Preserve documented legacy nullable actor/profile exceptions. Profiles and relevant history are append-only; all applicable profile/actor FKs remain even where their lines are omitted. Holds may overlap; releasing one cannot clear another. Counts retain a ledger cutoff, stale-count checks and exact variance posting. Database-managed balances and the single ledger remain authoritative. Frozen legacy movement/batch-event history stays preserved; no duplicate `inventory_stock`, second ledger, patient-use, reservation or transfer model is introduced.

## 5. Later authorization and independently durable audit

### Versioned grants — not a second active evaluator

```mermaid
erDiagram
    clinic_memberships["E - clinic_memberships"]
    clinic_sites["P - clinic_sites"]
    role_versions["P - role_versions"] {
        bigint id PK
        text role_code
        integer version
    }
    permissions["P - permissions"] {
        bigint id PK
        text action_code UK
    }
    role_version_permissions["P - role_version_permissions"] {
        bigint id PK
        bigint role_version_id FK
        bigint permission_id FK
    }
    clinic_role_grants["P - clinic_role_grants"] {
        bigint id PK
        bigint practice_id FK
        bigint membership_id FK
        bigint role_version_id FK
        text scope_kind "practice or site"
        bigint site_id FK "nullable only for practice scope"
        integer revision
        timestamptz effective_from
        timestamptz effective_until "nullable"
        timestamptz revoked_at "nullable"
    }
    clinic_role_grant_events["P - clinic_role_grant_events"] {
        bigint id PK
        bigint practice_id FK
        bigint grant_id FK
        bigint grantor_membership_id FK
        integer grant_revision
        text event_kind
    }
    role_versions ||..o{ role_version_permissions : contains
    permissions ||..o{ role_version_permissions : defines
    role_versions ||..o{ clinic_role_grants : pins
    clinic_memberships ||..o{ clinic_role_grants : receives
    clinic_sites |o..o{ clinic_role_grants : narrows
    clinic_role_grants ||..o{ clinic_role_grant_events : preserves
```

Role/permission definitions are controlled global catalogs, **not global clinical grants**. Role versions and their permission sets are immutable. Grant identity is null-aware unique across `(practice_id, membership_id, role_version_id, scope_kind, site_id)`; scope-kind/site checks remove null ambiguity. Stable grant rows retain all lifecycle events. Active membership, effective windows, action/scope and grantor ceilings are rechecked; no self-elevation. The current booleans remain the only evaluator until an accepted migration supplies a capability-equivalence matrix and single replacement evaluator. Identity issuer, MFA, RLS and operator roles are not selected here.

### Audit event, released-resource manifest and delivery receipt

**D-043/D-044 update — 2026-08-31:** PaperTrail is selected for application model-change auditing; see [Software Architecture](<../../APPlyVault/03%20Execution/Software%20Architecture.md#PaperTrail%20audit%20contract>). The gem and exception-on-version-error configuration are installed, but no version table or model opt-in exists yet. The panel below is the complementary operation/read/security evidence model, not PaperTrail's generated schema. The replacement's complete schema contract must add custom tenant-bound PaperTrail version storage and model coverage, then update the diagrams from actual implementation. These omitted version tables are a known diagram gap, not a deferred audit feature. Do not substitute a stock global `versions` table for operation events or claim the gem captures reads/denials. Note revisions/signatures and inventory history remain distinct authoritative evidence.

**Coverage clarification:** every implemented auditable patient-document or other domain mutation must have evidence, including child/related records written by callbacks and jobs; versioning a parent alone is insufficient. [Software Architecture](<../../APPlyVault/03%20Execution/Software%20Architecture.md#Callback-driven%20mutation%20coverage>) defines the required path matrix, create/update/destroy/touch handling, callback bypasses, transaction/after-commit boundaries and adverse-path tests. Document CRUD here means permitted mutations plus separately audited reads; it does not introduce permission to delete immutable objects or chart history. No diagram relationship grants authorization or implies that this wiring already exists.

```mermaid
erDiagram
    clinic_practices["E - clinic_practices"]
    clinic_audit_events["P - clinic_audit_events"] {
        bigint id PK
        bigint practice_id FK
        text actor_session_reference
        text action_code
        text outcome
        text policy_version
        timestamptz occurred_at
    }
    clinic_audit_resource_manifests["P - clinic_audit_resource_manifests"] {
        bigint id PK
        bigint practice_id FK
        bigint audit_event_id FK
        text protected_resource_version_ref
    }
    clinic_audit_delivery_receipts["P - clinic_audit_delivery_receipts"] {
        bigint id PK
        bigint practice_id FK
        bigint audit_event_id FK
        text sink_receipt_reference
        timestamptz acknowledged_at
    }
    platform_audit_events["P - platform_audit_events"] {
        bigint id PK
        text actor_session_reference
        text action_code
        text outcome
        timestamptz occurred_at
    }
    clinic_practices ||..o{ clinic_audit_events : scopes
    clinic_audit_events ||..o{ clinic_audit_resource_manifests : records
    clinic_audit_events ||..o{ clinic_audit_delivery_receipts : acknowledges
```

This is a logical evidence model, **not a decision to colocate the audit sink in the application database**. Resource manifests are protected evidence, not generic polymorphic domain FKs or authorization lookups. No sensitive payloads/search text/secrets in metadata. Unknown-tenant/platform failures use separate events, never a nullable wildcard clinic. Mutation evidence commits atomically; denial/rollback evidence must survive outside the failed transaction. Required capture failure blocks success/release. These relationships do not solve independent durability, trusted identity, runtime permissions, retention or restore; those remain T-34.5 and operational acceptance work.

## 6. Later addresses, private documents and messaging

### Explicit address ownership

```mermaid
erDiagram
    clinic_patients["E+ - clinic_patients"] {
        bigint id PK
        bigint practice_id FK
        bigint primary_address_version_id FK "proposed; nullable; same owner"
    }
    clinic_patient_address_versions["P - clinic_patient_address_versions"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        integer version
        text encrypted_address
    }
    clinic_staff_members["E+ - clinic_staff_members"] {
        bigint id PK
        bigint practice_id FK
        bigint primary_address_version_id FK "proposed; nullable; same owner"
    }
    clinic_staff_address_versions["P - clinic_staff_address_versions"] {
        bigint id PK
        bigint practice_id FK
        bigint staff_member_id FK
        integer version
        text encrypted_address
    }
    clinic_inventory_suppliers["E+ - clinic_inventory_suppliers"] {
        bigint id PK
        bigint practice_id FK
        bigint primary_address_version_id FK "proposed; nullable; same owner"
    }
    clinic_supplier_address_versions["P - clinic_supplier_address_versions"] {
        bigint id PK
        bigint practice_id FK
        bigint supplier_id FK
        integer version
        text encrypted_address
    }
    clinic_patients ||..o{ clinic_patient_address_versions : owns
    clinic_staff_members ||..o{ clinic_staff_address_versions : owns
    clinic_inventory_suppliers ||..o{ clinic_supplier_address_versions : owns
```

Each owner has one nullable primary pointer with a same-owner composite FK; not multiple `is_primary` flags. Owner → primary pointers are attributes rather than reverse lines to avoid obscuring the ownership relationships. Address rows are immutable, independently owned and may share street text. Pointer changes append attributable history. These typed address tables are illustrative decompositions; introduce only the address owners required by a selected workflow. No global contacts/address pool or person merge.

### Patient documents and delivery intents

```mermaid
erDiagram
    clinic_patients["E - clinic_patients"]
    clinic_encounters["P - clinic_encounters"]
    clinic_document_categories["P - clinic_document_categories"] {
        bigint id PK
        bigint practice_id FK
        text code
        text name
    }
    clinic_documents["P - clinic_documents"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint encounter_id FK "nullable"
        bigint category_id FK
        text object_key "private opaque reference"
        text object_version
        text checksum
        bigint byte_size
        text media_type
        text scan_state
    }
    clinic_message_intents["P - clinic_message_intents"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        text request_key
        text purpose_code
        text encrypted_recipient_snapshot
        text encrypted_content
    }
    clinic_message_attachments["P - clinic_message_attachments"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint message_intent_id FK
        bigint document_id FK "exact immutable document version"
    }
    clinic_message_outbox["P - clinic_message_outbox"] {
        bigint id PK
        bigint practice_id FK
        bigint message_intent_id FK "one outbox row per intent"
        text dispatch_state
        integer lock_version
    }
    clinic_message_delivery_events["P - clinic_message_delivery_events"] {
        bigint id PK
        bigint practice_id FK
        bigint message_intent_id FK
        text provider_event_reference "deduplicate by provider scope"
        text outcome
    }
    clinic_patients ||..o{ clinic_documents : owns
    clinic_encounters |o..o{ clinic_documents : contextualizes
    clinic_document_categories ||..o{ clinic_documents : classifies
    clinic_patients ||..o{ clinic_message_intents : concerns
    clinic_message_intents ||..o{ clinic_message_attachments : includes
    clinic_documents ||..o{ clinic_message_attachments : attaches
    clinic_message_intents ||..|| clinic_message_outbox : "atomic enqueue"
    clinic_message_intents ||..o{ clinic_message_delivery_events : records
```

Each document row represents immutable object-version metadata; a future logical-document/version grouping must be explicit, not an object overwrite. Independent patient FK remains mandatory when encounter is null; encounter and category references are clinic-consistent. Attachment links additionally match the message's patient. Quarantined/pending/rejected files cannot download; each actual object/version requires reauthorization. Record immutable recipient/purpose evidence, atomically commit intent/outbox, and reconcile uncertain dispatch before retry; do not claim exactly-once external delivery. No public file URLs, upload/send service, inbound-message workflow or live credentials are selected.

## 7. Later patient billing — separate from APPly fees

```mermaid
erDiagram
    clinic_patients["E - clinic_patients"]
    clinic_invoices["P - clinic_invoices"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        text currency
        text status
        text rounding_policy_version
    }
    clinic_invoice_lines["P - clinic_invoice_lines"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint invoice_id FK
        numeric quantity
        numeric unit_amount
        numeric posted_amount
        text description_snapshot
    }
    clinic_payment_events["P - clinic_payment_events"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        text currency
        numeric amount
        text external_event_reference
    }
    clinic_payment_allocations["P - clinic_payment_allocations"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint payment_event_id FK
        bigint invoice_id FK
        numeric amount
    }
    clinic_credit_notes["P - clinic_credit_notes"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint invoice_id FK
        text currency
        numeric amount
    }
    clinic_refund_events["P - clinic_refund_events"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint payment_event_id FK
        text currency
        numeric amount
    }
    clinic_coverage_versions["P - clinic_coverage_versions"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        integer version
        text encrypted_coverage_evidence
    }
    clinic_insurance_claims["P - clinic_insurance_claims"] {
        bigint id PK
        bigint practice_id FK
        bigint patient_id FK
        bigint invoice_id FK
        bigint coverage_version_id FK
    }
    clinic_patients ||..o{ clinic_invoices : owes
    clinic_invoices ||..o{ clinic_invoice_lines : snapshots
    clinic_patients ||..o{ clinic_payment_events : records
    clinic_payment_events ||..o{ clinic_payment_allocations : allocates
    clinic_invoices ||..o{ clinic_payment_allocations : settles
    clinic_invoices ||..o{ clinic_credit_notes : credits
    clinic_payment_events ||..o{ clinic_refund_events : refunds
    clinic_patients ||..o{ clinic_coverage_versions : holds
    clinic_invoices ||..o{ clinic_insurance_claims : claims
    clinic_coverage_versions ||..o{ clinic_insurance_claims : supports
```

These structures are in the D-044 replacement baseline pending final amendments; their synthetic behavioral contract still needs the unresolved billing details, not invented defaults. Posted lines and financial events are immutable; corrections/reversals append. Posted invoices require lines. Source links are typed, same-practice/same-patient links, not `item_type/item_id`; no source catalog is invented here. Transactional allocation/refund/credit rules must prevent over-application, double-credit and currency mixing. External identifiers require provider-scoped deduplication and reconciliation. Exact bounded decimals and approved posting-rounding policy are mandatory design constraints; precision, eligibility, rates, tax, payer/remittance workflow and claim submission remain unselected. Unagreed dependent operations remain unavailable; do not defer the whole target module by quoting the superseded first-run scope. No card/bank credentials. APPly's ordered-inventory-value software fee and T-14 mechanics are outside this patient-billing diagram; D-029/T-37 supplier deferral remains.

## Relational constraints that connectors cannot express

For proposed tenant tables, retain bigint PK `id` and expose `UNIQUE (practice_id, id)` when referenced; do not replace existing IDs. Do not retrofit fictitious provenance into retained history.

| Relationship | Required target constraint |
| --- | --- |
| Patient-owned row | Independent `(practice_id, patient_id)` → patient `(practice_id, id)`; both non-null |
| Optional patient/encounter link | Also `(practice_id, patient_id, encounter_id)` → encounter `(practice_id, patient_id, id)`; only encounter component optional; never substitute this for the independent patient FK |
| Encounter/appointment | Same practice/patient composite FK; unique non-null appointment link; no silent reparenting |
| Room-bearing record | Independent site FK plus `(practice_id, site_id, room_id)` → room `(practice_id, site_id, id)`; room requires site |
| Note revision/signature | Tenant-qualified note FK; revision number unique per note; predecessor and signature target reference an exact revision in the same note |
| Membership/profile/participants | Same-practice composite FKs; profile unique per membership; existing legacy author/actor references continue to use membership `user_id` |
| Address primary pointer | Owner `(practice_id, id, primary_address_version_id)` → address `(practice_id, owner_id, id)`; nullable pointer, independent address-to-owner FK, immutable versions and pointer history |
| File/message attachment | Independent patient owner plus same-practice/same-patient message and document references; unique attachment tuple |
| Grants | Explicit scope/site null pattern; null-aware unique grant tuple; versioned immutable permission set and append-only grant events |
| Billing/coverage | Same-practice/same-patient invoice/payment/coverage links; immutable posting snapshots; transactional totals, currency, reversal and replay invariants |

History uses RESTRICT/NO ACTION semantics rather than cascading chart/audit deletion. Reject ordinary tenant/patient/author/parent changes, including before a record acquires children. Index referencing tuples and bounded query paths. Actual request authorization, field visibility, lock ordering, concurrency tests, encryption, external durability, retention and recovery cannot be proved by an ERD. Use the review's [adverse-path cases](<../../records/design-reviews/2026-08-31-multi-clinic-erd-review.md#Acceptance%20cases%20added%20by%20the%20corrections>) and revision 5 of [ERD Implementation Prompt](<../../records/prompts/2026-08-31-erd-implementation-prompt-revision-5.md>) across the full approved replacement.

## Evidence and exclusions

Source: local revision-2 review/prompt and selected canonical schema definitions inspected on 2026-08-31, on `feature/erd-adversarial-review`. Existing source hash: `9bac2cbf1a5597bef60dbfa29908063d2e7b642a5f67f2011b00c5028bb9c9ef`. The source image's instructions are not agent authority. No patient records, MD/SharePoint/governance originals, live databases, service configurations or hosting were accessed to make these diagrams.

Excluded rather than invented: full demographic/intake dictionaries, emergency contacts and directives, clinical transition/signature/terminology policies, scheduling overrides, patient-record transfer/merge, prescribing/labs/dispensing, inventory extensions, external integrations, approved audit/storage services and retention/offboarding durations. See the [Meta Clinic Implementation Tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) and [Texas Diligence](<../../APPlyVault/02%20Research/Texas%20Diligence.md>) for current work and existing professional gates. Appearance preferences and clinic production-mode denial are unchanged. No Story or professional gate is completed by this visualization.

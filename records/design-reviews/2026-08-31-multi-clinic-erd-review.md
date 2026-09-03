---
type: architecture-review
status: proposed-not-for-implementation
updated: 2026-08-31
---
# Multi-Clinic ERD Adversarial Review

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Model: [[Data Modeling]] · Handoff: [[ERD Implementation Prompt]] · Status: [[Roadmap and Tasks]]

## Verdict and scope

**Current scope — D-044 / 2026-08-31:** the founder subsequently selected a full backend replacement from the corrected [[Target-State Clinic ERD]], pending minor amendments. [[ERD Implementation Prompt]] revision 5 controls that handoff. The original findings and revision-2 recommendations below retain their historical context: their first-run hardening, physical-preservation and module-deferral wording is superseded for the approved replacement. Their tenant, history, audit, workflow and release safeguards are not superseded. Current source remains evidence for migration/regression, not a prohibition on replacement.

**Do not implement the image literally.** It is useful as a domain inventory, but not a migration specification. The most serious problems are the organization-level patient boundary, ambiguous authorization scope, missing cross-clinic constraints, mutable clinical/financial history, and an inventory model weaker than the existing implementation.

This is a design review, not evidence of an exploitable running application. An omitted control is **not demonstrated by the ERD**; it may exist in unseen implementation. Conversely, connectors and `FK`/`UNQ` labels do not demonstrate the required database or authorization controls. The reviewed repository already addresses several of these risks and must not regress to match the picture.

The user requested a new branch, adversarial ERD review and an implementation prompt on 2026-08-31, then asked to address the concerning portions where possible and update the prompt. The follow-up is addressed by [[Multi-Clinic ERD Adversarial Review#Engineering resolutions — revision 2|the concrete corrected-model recommendations below]]. Findings describe the original image; revision 2 supplies engineering defaults instead of leaving every issue as an unanswered question. These are design resolutions, not tested fixes, blanket build approval or professional acceptance. The diagram's annotations remain source material, not agent instructions or decisions superseding the vault.

### Reviewed evidence

- Image: user-supplied `Codex Image Aug 31, 2026, 12_23_41 PM.png`, inspected locally on 2026-08-31; SHA-256 `4c0d8960b167b464882618377c70e46585661ec08acca427c985a9857b2770ed`. Original remains in the user's Downloads folder; it was not copied into the repository or uploaded. One green table title is unreadable, some connectors overlap, and the lower insurance-claim edge is clipped. No missing text is reconstructed as fact.
- Repository: `a90ce54b6302420406244d50cc5ce93bc29b2365`, with pre-existing uncommitted vault/EC2/Obsidian work preserved. New branch: `feature/erd-adversarial-review`, created from the current checkout without pulling, stashing or committing.
- Scoped vault review: Home/TOC; architecture and relevant CI/CD setup/check/recovery sections; failure-first agreement; Data Modeling; Clinic Workspace; PostgreSQL/inventory foundation; relevant pharmacy field/capability requirements; entity boundaries; current task/gate/decision/risk sections and relevant progress evidence. D-026, D-028, D-029, D-031, D-033, D-037, D-039, D-040 and D-041 materially constrain this review.
- Source inspection: canonical SQL table/index/constraint/trigger definitions and inventory guards; clinic migration; identity, membership, patient/note and inventory access models/services; clinic controllers; architecture/clinic integration tests; test helper, PostgreSQL rehearsal and frontend scripts. `apps/api/db/structure.sql` SHA-256 at review: `9bac2cbf1a5597bef60dbfa29908063d2e7b642a5f67f2011b00c5028bb9c9ef`.
- Technical sources: official PostgreSQL 18 constraints/RLS documentation, Rails validation guide and OWASP authorization guidance, accessed 2026-08-31. Links appear beside the corresponding technical conclusions below. No private vault text was submitted in searches. No new legal conclusions or source-material reviews are claimed.

MD/governance/SharePoint originals, an accepted clinical field/state contract and the source ERD/DDL are unavailable to this review. They block dependent implementation choices, not this critique or synthetic regression planning. Existing L-05/E1–E3 and confidential-document gates remain unchanged.

## Findings, ordered by implementation risk

### 1. Blocker — organization membership is not a chart boundary

**Image:** patients carry `organization_id`, with MRN unique within the organization; appointments carry `clinic_id`. Contacts may have nullable organization and clinic IDs. Several descendants have no explicit tenant key.

**Failure:** an organization-wide patient lookup exposes a sibling clinic's records; an appointment links one clinic to another clinic's patient/provider; a corporate account gains clinical access by inheritance. A patient treated at two independent clinics becomes a silently shared chart.

**Required disposition:** retain `Clinic::Practice` / `practice_id` as the current tenant boundary. An optional future organization groups business metadata only. Keep patient records and identifiers clinic-local; no automatic cross-clinic merge/search. Model physical sites beneath the authorized custody boundary, rather than assuming every building is a tenant. The meaning of organization/clinic/site must be settled before new hierarchy migrations. This follows D-026 and [[Data Modeling#Tenant boundary and architecture proposal]], not a new custody/legal determination.

### 2. Blocker — single-column foreign keys do not establish relational consistency

**Image:** appointment has independent patient/provider/department/room references; provider has clinic/department/contact references; invoice/document has independently optional patient/visit references. The picture does not specify constraints tying these identities together.

**Failure:** each ID exists, yet the tuple belongs to different clinics, or a document names Patient A and Patient B's visit within the same clinic. A later parent reassignment can invalidate previously sound history.

**Required disposition:** retain bigint primary keys in the current app; add or preserve tenant-qualified unique keys and foreign keys where needed. Use `(practice_id, patient_id)` and, for a future encounter-linked record, a reference matching `(practice_id, patient_id, encounter_id)`. Enforce clinic/department/location compatibility and immutable custody/attribution keys. Specify optional combinations rather than treating `NULL` as a wildcard. Cross-row rules need appropriate FKs, unique/exclusion constraints or carefully designed transactional guards, not cross-table `CHECK` expressions. [PostgreSQL constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).

**Current source:** composite note-to-patient and note-author-to-membership FKs already exist, as do many inventory composite FKs. Do not replace them with the image's simpler references. Full privileged-path isolation is not established by those constraints.

### 3. Blocker — role grants have ambiguous scope and lifecycle

**Image:** `user_roles` has nullable organization and clinic IDs; `roles.scope` includes organization, clinic and system. No grant expiry/revocation state, membership lifecycle or explicit scope-consistency rule is visible. `assigned_by` records an ID, not permission to grant. CRUD-only permission labels do not distinguish signing, export, receiving, hold release or granting access.

**Failure:** both scope IDs are null and interpreted as global access; both are set but disagree; duplicate nullable grants accumulate; a user assigns a more powerful role to themselves; a disabled membership retains grants. A staff/provider directory entry is mistaken for a login or clinical credential.

**Required disposition:** preserve one developer-assigned clinic per login, the unique membership user key and action permissions. Do not install the image's RBAC model or a clinic picker. A later approved grant design needs explicit non-ambiguous scope, lifecycle, grantor ceilings, revocation behavior and protected history. Separate platform operations from chart access; no organization/admin override. Validate authorization on every server request and return only permitted fields. [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

`mfa_enabled` is not an MFA implementation. Preserve existing password/session behavior, including the 12-hour absolute maximum and revocation. MFA, operator role administration and trusted capability/RLS work remain separately scoped. RLS itself has privileged-role bypasses and does not govern `TRUNCATE`; do not test only as table owner or equate a caller-set SQL tenant variable with trusted identity. [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

### 4. High — the clinical record can be rewritten after signing

**Image:** `clinical_notes` has mutable content, `is_signed`, `signed_at`, provider and timestamps; no revision/signature target, signer identity, amendment or stale-write rule is shown.

**Failure:** two writers overwrite one another; an administrator changes signed content while leaving `is_signed = true`; a provider ID supplied by the client becomes attribution. Appointment reassignment moves the apparent author/patient context of historical care.

**Required disposition:** preserve existing append-only encrypted `clinic_notes` as synthetic drafts. Do not convert them into signed records or invent past encounters. A later accepted workflow needs stable note identity, immutable revisions, a signature bound to an exact revision and authenticated authorized signer, explicit addenda/entered-in-error history, and conflict handling. Preserve both authorship and the patient/encounter relationship. No clinical or legal signature sufficiency is inferred from a timestamp or digest.

### 5. High — inventory would lose important controls already implemented

**Image:** organization-owned items/suppliers/categories feed clinic-owned locations; stock has mutable on-hand/reserved quantities and a generic transaction type/quantity/reference. An unreadable green table repeats stock-position-like fields. No clear lot, expiry, receipt-line conversion, hold-release, count-cutoff or retry model is visible.

**Failure:** two deductions oversell stock; a lost response and retry post twice; released recall stock remains under a temperature hold but becomes available; a stock quantity changes without history; a transfer credits one side without debiting the other; a prescription and its fulfillment both consume stock.

**Required disposition:** retain `clinic_inventory_entries` as the shared append-only posting path, existing catalogs, lot/location positions, distinct receipts/lines, exact units, overlapping holds/releases, versioned profiles, counts/approvals and protected balances. Reconcile changes against [[PostgreSQL and Inventory Foundation]], not the image. Do not create a competing `inventory_stock`/transaction ledger or generic patient-bearing reference in inventory. Cross-entity transfers, reservations, purchasing, clinical usage and dispensing require separately accepted workflows; do not claim they already exist.

### 6. High — the picture is internally incomplete and appears mislabeled

**Observed defects:** `room_id` and `default_room_id` reference no visible room table; `visit_type_id` / `default_visit_type_id` reference no visible visit-type table. The blue box titled `audit_logs` contains document-like fields, while `document_categories` contains audit-like action/auditable fields. A separate `documents` box overlaps those responsibilities. The extra green stock-like table cannot be confidently named from this raster. Several connectors do not provide unambiguous cardinality.

**Failure:** an agent invents absent entities, implements duplicate tables, or treats mislabeled audit metadata as document categorization. Generated schema looks comprehensive but has unusable joins and no real audit record.

**Required disposition:** maintain an explicit image-to-current-to-proposed mapping. Resolve every entity/reference before adding it; mark unreadable/absent information unknown. Keep documents, document categories, attachment links and audit events distinct if those domains are later approved. Do not use an image-to-migration generator as the source of truth.

### 7. High — appointment, encounter and clinician identity are too tightly coupled

**Image:** visit has a unique appointment FK and check-in/out fields, with patient/provider apparently inherited through appointment. Provider is unique per contact and assigned to one clinic/department. No visible visit participants, reassignment history, walk-in model or state-transition contract exists.

**Failure:** a walk-in requires a fake appointment; rescheduling or replacing the booked provider rewrites who actually treated the patient; department defaults point at a provider/room outside their scope; concurrent bookings violate a room/provider schedule. A unique contact blocks legitimate department assignments, while sharing that contact across clinics creates unintended identity coupling.

**Required disposition:** before runtime clinical work, accept T-13's patient → encounter → intake → handoff contract. Decide walk-ins, appointment-to-encounter cardinality, participant roles and scheduling conflicts explicitly. Keep actual encounter patient/actors stable rather than deriving history from mutable bookings. Use timezone-aware instants and clinic display zones; test ambiguous daylight-saving times. A later appointment link may be optional if the accepted workflow needs walk-ins. Do not implement scheduling or clinical scope from these recommendations alone.

### 8. High — clinical values lack units, provenance and semantics

**Image:** vitals include a single blood-pressure field, height/weight/BMI and other values without visible units, source or validation states. Medication name/dose/route/frequency are generic fields; diagnoses/procedures have codes without explicit coding-system/version provenance. Allergies and longitudinal problem/medication status are not shown.

**Failure:** pounds are read as kilograms, unknown becomes zero, a stale computed BMI looks current, medication history is confused with an order/administration, or a code changes meaning. An encounter-only model loses longitudinal context.

**Required disposition:** keep these as requirements gaps, not permission to build a complete EHR. An accepted field dictionary must define typed values/units, effective and recorded times, actor/source, unknown/error states and correction history. Separate medication statements, orders, administrations and dispensing. No inferred dosing, triage scoring, prescribing or automatic inventory posting. D-041's board remains an explicitly labeled frontend simulation until a reviewed producer/consumer contract exists.

### 9. High — file URLs and generic contacts create secondary disclosure paths

**Image:** documents and communication attachments use `file_url`; addresses are both polymorphic and junction-linked; contacts include patients alongside staff/vendors. Communications have free-text subject/body and patient/contact references.

**Failure:** a guessed URL bypasses authorization; a valid document belongs to another patient; a shared address edit changes unrelated records; a vendor contact list exposes patient details; retries send the same message twice. A polymorphic type/ID pair points at a nonexistent or unauthorized resource.

**Required disposition:** no new uploads, external messaging or generic CRM/patient merge. If later authorized, use explicit ownership links, private opaque versioned object references, quarantine and per-download authorization. Contact, clinical and supplier projections must remain separate. Specify address history and one-primary semantics. Message delivery needs recipient/purpose rules, a durable outbox, deduplication and delivery-state reconciliation, with sensitive content excluded from logs.

### 10. High — audit, deletion and recovery are not modeled as durable workflows

**Image:** the audit-like fields are generic action/type/id/metadata/IP/time; key notes suggest soft deletes and timestamps. No durable read/denial audit, revision linkage, protected writer, retention hold or recovery contract is visible.

**Failure:** a rolled-back write also erases its attempted-access log; searches/downloads are unaudited; free-form metadata copies sensitive payloads; ordinary application credentials alter audit evidence; deletion cascades destroy attribution. A backup restores SQL but not the matching encrypted content or object versions.

**Required disposition:** distinguish mutation history, resource-release audit and independently durable denial/failure evidence. Define fail-closed behavior and recovery for required audit failures before sensitive features exist. Retain lifecycle history; no generic `deleted_at` rollout or cascading chart/audit deletion. Retention/offboarding needs its own accepted policy, not a guessed time period. Existing metadata-only inventory events are not a complete read-audit system. Full trusted identity/RLS/read-audit design remains T-34.5/E2 work.

### 11. Medium — uniqueness and settings ownership are inconsistent

**Image:** organization, clinic and department names appear globally unique; `addresses.address_line1` is marked unique. Role-permission, address junction and stock-position tuples lack visible uniqueness rules. User preferences lacks a visible unique user key. One-primary address/insurance semantics are unspecified.

**Failure:** two clinics cannot use the same department name or street address; duplicate join rows multiply results; two concurrent settings writes create competing “one-to-one” rows; nullable scope fields allow duplicates despite a nominal unique key.

**Required disposition:** choose scoped stable codes where identity is needed, not globally unique human names/addresses. Define each junction's complete unique tuple and distinguish “at most one primary” from “must have one.” A partial unique index can enforce the former, not the latter. PostgreSQL normally treats nulls as distinct in unique constraints. [PostgreSQL uniqueness](https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS).

Keep the already-implemented unique `identity_preferences.user_id`, allowlisted fields and conflict/version checks; do not replace it with arbitrary JSON. Rails uniqueness validation is not a database uniqueness guarantee under concurrent connections. [Rails validation guide](https://guides.rubyonrails.org/active_record_validations.html#uniqueness).

### 12. Medium / scope blocker — billing is both underspecified and outside the accepted slice

**Image:** invoices, polymorphic invoice items, payments, insurance and claims include mutable totals/statuses and optional visit/insurance links. There is no visible transaction currency, immutable posted-line snapshot, allocation/refund/credit lifecycle or external-event deduplication. The invoice belongs to an organization while its care sources are clinic-specific.

**Failure:** two payment retries double-credit an invoice; one payment cannot safely settle several invoices; changing a source procedure alters historical charges; a claim's insurance belongs to another patient. Software fees accidentally become a percentage of patient billing.

**Required disposition:** defer patient billing, insurance and claims. Their presence in the image is not validated demand or implementation authority. If later selected, use exact monetary representation/currency, explicit patient/payer/encounter consistency, immutable posted snapshots, reconciled allocations, credits/refunds and retry-safe external events. T-14's software fee remains based on ordered inventory value with unresolved mechanics; T-37 supplier pricing remains deferred. No rate, reimbursement, tax, membership entitlement or purchasing authority is invented.

## Preserve, change in design, defer

This table records the original review's disposition before D-044. For the replacement, map these existing behaviors/data to the final ERD rather than treating this earlier defer/retain column as current implementation scope.

| Image family | Current implementation / recommended disposition |
| --- | --- |
| Organizations, clinics, settings | Keep `clinic_practices`; optional business grouping/location hierarchy only in a separately selected slice. No data-access inheritance or forced renaming. |
| Users, roles, preferences | Keep `users`, `member_sessions`, unique `clinic_memberships`, action checks and `identity_preferences`. Design future grants separately. |
| Contacts, providers, addresses, departments | Keep `clinic_staff_members` distinct from accounts. Additional entities need explicit ownership/cardinality and a selected purpose. |
| Patients, notes | Keep `clinic_patients`, clinic-local references, encrypted fields and append-only `clinic_notes`. No synthetic history promoted to signed clinical evidence. |
| Appointments, visits, clinical details | Not current backend features. T-13 contract and accepted E1/E2 scope precede runtime work. Board example rows are not migration input. |
| Inventory | Preserve current catalog/lot/receipt/ledger/hold/count/profile model. Extend only with explicit invariants; do not introduce a second balance source. |
| Documents, communications, audit | Distinct protected future domains, not one generic attachment/activity table. No new service or live-data approval. |
| Invoices, insurance, claims | Deferred clinical/commercial scope. Keep consultancy, software fees and clinic patient billing separate. |

## Recommended handoff

**D-043/D-044 handoff — 2026-08-31:** use PaperTrail for application model-change auditing under [[Software Architecture#PaperTrail audit contract]], including [[Software Architecture#Callback-driven mutation coverage|callback-driven changes to patient documents and other auditable records]]. The dependency/configuration is installed, without model or schema activation. Revision 5 of [[ERD Implementation Prompt]] requires actual coverage throughout the full replacement. Findings and revision-2 audit invariants remain applicable: PaperTrail is not a read/denial/independent audit sink and does not replace clinical revisions or the stock ledger.

[[Target-State Clinic ERD]] is the corrected replacement baseline, pending the founder's minor amendments. Its E/E+/P labels identify origin/current state, not implementation limits. The implementing agent must complete the field/constraint/API contract, add tenant-bound PaperTrail storage and map every entity and existing workflow. Diagrams do not prove runtime integrity or supply every migration detail.

The earlier hardening-only first run is superseded. The agent should implement the complete approved target in reviewable stages, including schema/models/workflows/APIs/auditing, preserving necessary behavior/history through explicit migration rather than retaining old shape by default. Do not stop after mapping/tests or blanket-defer proposed modules. Finalize the promised minor amendments before structural implementation; do not invent their contents.

Actual clinical/signature/business rules, external services, data disposition and release gates remain explicit point-of-use decisions. Resolve only the genuinely missing dependent contract; no live-data, deployment or destructive database authority is implied. T-13/T-34 and other task statuses require actual evidence and are not promoted by this handoff.

## Engineering resolutions — revision 2

**Historical design response to the earlier 2026-08-31 follow-up.** Each numbered item answers its original finding. D-044/revision 5 now supersede this section's earlier first-slice deferrals and physical-preservation defaults; preserve the stated invariants and evidence through the approved replacement mapping. Proposed names remain subject to the final minor amendments. Nothing recorded here alone creates tables, proves custody/clinical authority or changes task status.

### Corrected ownership and supporting records

1. **Tenant boundary:** keep `clinic_practices` as the independently authorized clinic tenant and `practice_id` as its key. A future `organizations` record may group practices for business metadata, but patient, stock and clinical authorization never inherit from it. Keep `clinic_patients.reference` unique within practice; do not reinterpret it as an organization MRN or merge patient identities. A clinical account has exactly one assigned practice; a portal-only account may have none. Actual custody evidence is needed when provisioning a real clinic, not to choose this synthetic schema convention.

2. **Relationship contract:** retain bigint PKs; tenant tables expose `UNIQUE (practice_id, id)` for composite references. Every new tenant child has non-null `practice_id`. Patient-owned rows also have non-null `patient_id` and an independent FK to `(practice_id, id)` on patients. A future encounter exposes `UNIQUE (practice_id, patient_id, id)`; encounter-linked children reference that triple. For a patient document with optional `encounter_id`, retain the independent patient FK and make only the encounter triple optional. A partial-null composite FK must never become the only patient validation. Required links are all non-null; optional multi-part links need an explicit null-pattern rule. Use RESTRICT/NO ACTION for historical parents and reject ordinary changes to practice/patient/author/parent identity, including when no child yet exists. Index referencing tuples and bounded query paths. These are design choices using PostgreSQL's composite-FK/null rules, not executed DDL. [PostgreSQL foreign keys](https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-FK).

3. **Access grants:** retain the current membership booleans/action permissions for the first slice; no second authorization engine. If RBAC is later selected, use practice-scoped `clinic_role_grants` referencing the existing membership, an immutable role version and an explicit `scope_kind` of `practice` or `site`. `practice` requires null `site_id`; `site` requires a same-practice site. `practice_id` is never null and there is no organization/global chart grant. One stable grant row per membership/role-version/scope/site, including a null-aware uniqueness rule, gets a revision counter plus append-only grant/change/revoke events; do not delete/recreate it to hide reactivation. Check effective intervals at use, not with a time-dependent index predicate. Role-permission pairs are unique and versioned; a role edit cannot silently enlarge old grants. Granting requires a permitted ceiling and no self-elevation; revocation is checked on subsequent requests and at the defined transaction/release boundary. Preserve historical attribution after revocation. Migrate existing flags only with an explicit capability-equivalence matrix and one effective evaluator, never `old grants OR new grants`. Platform operations remain separate; administrator assignments and factor/issuer mechanisms remain unselected.

4. **Note history:** retain today's `clinic_notes` untouched as legacy synthetic append-only drafts. For a later encounter workflow, use a new `clinic_encounter_notes` header with immutable practice/patient/encounter and `lock_version`; `clinic_encounter_note_revisions` holds encrypted body, author membership, revision number, predecessor and payload version. Enforce unique note/revision and a same-note predecessor. Future `clinic_encounter_note_signatures` references one exact revision, authenticated signer, canonical-content digest and attestation version. Serialize revision/sign operations on the note header, recheck the expected version and authorization, and commit history/audit together. Stale writes return a conflict, not a merge or silent overwrite. Signed revisions cannot change; corrections append an attributable addendum/new revision with a reason. No mutable `is_signed` flag is the source of truth. Do not backfill encounters/signatures for old drafts. Clinical signer/attestation acceptance remains a gate. [Rails optimistic locking](https://api.rubyonrails.org/classes/ActiveRecord/Locking/Optimistic.html).

5. **Inventory:** keep the existing office/pharmacy catalogs, `clinic_inventory_lots`, lot/location positions, receipts/lines, `clinic_inventory_entries`, holds/releases, counts/approvals and profiles. Remove the diagram's proposed duplicate stock table and generic second transaction path from the implementation target. Existing position/receipt/ledger constraints and exact unit conversions are the source of truth. No new reservation balance, transfer endpoint or patient-bearing inventory reference is introduced. If transfers are later selected, use an attributable transfer with two balanced ledger legs in one transaction for internal relocation; an in-transit/cross-entity shipment is a different reviewed workflow. A prescription alone never posts stock. Design resolution here is preservation plus tests, not a ledger rebuild.

6. **Missing and mislabeled entities:** explicitly replace the ambiguous image concepts with the following proposed supporting model when that slice is selected. These names are engineering recommendations, not recovered text from the image:

| Proposed record | Ownership and cardinality | Integrity rule |
| --- | --- | --- |
| `clinic_sites` | Practice has many physical sites; each site has one practice | Stable code unique within practice; timezone override is typed/validated, with practice fallback |
| `clinic_departments` | Organizational department belongs to one practice; it may serve multiple sites | Code unique within practice; department is not a tenant or an access grant |
| `clinic_rooms` | Room belongs to exactly one site and practice | Code unique within site; composite site FK plus `UNIQUE (practice_id, site_id, id)` supports site-qualified room references |
| `clinic_visit_types` | Practice-owned scheduling/workflow classification | Code unique within practice; retiring a type cannot invalidate existing history |
| `clinic_clinician_profiles` | At most one clinician profile per existing clinic membership | Composite membership FK, no automatic account/grant creation; directory-only external people stay separate |
| `clinic_clinician_assignments` | Profile may serve multiple same-practice departments/sites | Explicit profile/department/site tuple; lifecycle/history retained; assignment is not credential or prescribing approval |
| `clinic_clinician_credentials` | Profile has separately reviewed credential records | Type, jurisdiction, issuer/reference, validity, review provenance and status; no permission derived solely from a license-number string |
| `clinic_documents` / `clinic_document_categories` | Protected patient document/version metadata versus a practice-owned category catalog | Category has code/name, not audit fields; document/category relationship stays in practice |
| `clinic_audit_events` / separate platform events | Attributable operation evidence, not a document catalog | Non-null practice on clinic events; unknown-tenant/platform failures do not use null as a wildcard |

Do not reuse `clinic_inventory_locations` as rooms/sites: existing labels/bins and their stock identities remain intact. A future mapping may link an inventory location to a same-practice site without rewriting prior stock provenance. When a future appointment/encounter specifies a room, enforce `(practice_id, site_id, room_id)` against the room tuple, in addition to its independent site FK; room presence requires site presence. Defaults such as room/provider/visit type are optional suggestions validated for the current site/action at use; they do not grant access. Shared rooms do not have to belong to one department. Add a department/site applicability junction only if the accepted workflow requires that additional restriction.

### Corrected workflow and value contracts

7. **Appointments and encounters:** proposed baseline is one patient per appointment and per encounter; an encounter may have no appointment (walk-in), and an appointment may link to zero or one encounter. The optional appointment reference is unique when present and constrained to the encounter's practice/patient. Patient linkage becomes immutable once referenced; corrections use explicit history, not ID substitution. Group appointments and reuse of an appointment for multiple encounters are excluded from this first design and require an explicit extension. Encounter participants record actual clinician/staff assignments independently of the booked provider, with event history for reassignment. Persist start/end instants and the relevant IANA display zone; reject ambiguous local-time input without an offset/disambiguation. Do not derive actual attendance, handoff or clinical completion from appointment status. Proposed scheduling guards use half-open `[start, end)` intervals with `end > start`; overlapping active room/provider reservations fail transactionally while adjacent reservations are allowed. PostgreSQL exclusion constraints can support this; verify extension/runtime support before selecting an implementation. [PostgreSQL range constraints](https://www.postgresql.org/docs/18/rangetypes.html#RANGETYPES-CONSTRAINT). Clinical state transitions, availability and emergency/overbooking policy still require T-13 acceptance; unsupported overrides stay disabled.

8. **Clinical values:** keep observations separate from diagnoses, allergies, medication statements, orders and administration/dispensing. Each future observation has a versioned code/system, observed/recorded times, author/source and explicit value kind. A present value has exactly one matching numeric/text/coded representation; a missing/not-collected value has a reason and no fabricated value. Numeric values require a compatible unit; reject non-finite values and invalid representation combinations. Blood pressure uses separate systolic/diastolic components grouped as one observation, not a free-text scalar. Derived values retain formula/version and source observations; do not silently recompute historical values. Reviewed clinical units, ranges, terminology and decision support remain unselected; the schema contract does not choose treatments or diagnoses.

9. **Contacts, addresses, files and messages:** keep clinic patients, staff and inventory suppliers separate; do not introduce a global patient/contact table. Use explicit typed owner links for address versions, not `addressable_type/id`. Shared text does not imply shared identity; duplicate street addresses are allowed. Keep address versions immutable and a single nullable primary-address pointer on each supported owner with a same-owner composite FK; null means no primary selected. Repointing appends history, never edits another person's shared address. Clinical documents require patient ownership and may optionally name a same-patient encounter. Store opaque private object key/version, checksum, size, media type and scan state; no public `file_url`. Pending/quarantined/rejected content cannot download; authorization is rechecked for the actual object/version. Messages and their attachments use explicit same-practice/patient links, immutable send intent and recipient/purpose evidence. Commit intent/outbox atomically; deduplicate local requests/provider events and reconcile uncertain delivery before any retry. No claim of exactly-once external delivery and no sending/uploading service selected here.

10. **Audit, lifecycle and recovery:** adopt separate records for operation events, released-resource manifests and delivery receipts, with server-derived actor/session correlation, action, outcome, policy version and trusted time. Allowlisted metadata contains no bodies, search text, secrets or clinical values. Clinical event references may themselves be sensitive. Mutation evidence commits with the mutation; denied/rolled-back attempt evidence needs durable capture outside that transaction. If required capture fails, fail the operation/release rather than acknowledge success. Transactional outbox alone is insufficient for rollback evidence. A separate local synthetic adapter can test the contract but cannot stand in for an accepted independently controlled sink. Protect event/history update/delete/truncate under the ordinary runtime role; privileged administrators remain a separate threat requiring independent evidence. No generic hard-delete endpoints, cascade deletion of history or guessed retention interval. Keep holds, offboarding and key/object/database restore in the later accepted lifecycle design. RLS/issuer/audit infrastructure remains a separately accepted T-34.5 proof; no raw caller-set tenant variable is promoted into trusted identity. [PostgreSQL row security limits](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

11. **Uniqueness and settings:** names/addresses are not global identifiers. Retain unique clinic patient reference, clinic SKU and existing unique user preference/membership keys. New catalog codes are scoped as above; each junction has a complete unique tuple. A nullable scope component uses explicit null-aware uniqueness or distinct partial indexes; no `now()`-based uniqueness predicate. Preserve current account-owned cosmetic preferences. New operational settings are typed and versioned at their owning practice/site, with explicit site → practice fallback only for named fields such as display timezone. Organization/user cosmetic settings cannot override custody, inventory conversion, clinical rules or grants. Missing safety-critical settings block only their affected operation, not default to approval.

12. **Financial records:** do not implement patient billing/insurance/claims in the first slice. For a future accepted billing module, separate invoice headers and immutable posted line snapshots from source clinical records; typed source links must match practice/patient. Use explicit currency, exact bounded decimal quantities/rates/amounts and a versioned rounding policy at posting; no binary floats or historical repricing. Payment events, invoice allocations, credits/refunds and external-event deduplication are distinct; allocation totals and currency compatibility are transactional invariants. Claims bind to the same patient's versioned coverage/evidence, not an arbitrary insurance ID. No card/bank credentials enter this model. This resolves structural risks without choosing rates, tax treatment, coverage, claim submission, membership entitlements or APPly's fee formula. T-14 remains a prerequisite before implementing software metering, not a reason to tie it to patient invoices.

### Acceptance cases added by the corrections

These supplement existing tests, not claim a pass. Run a case only when its associated slice is authorized and implemented.

| Case | Required safe result |
| --- | --- |
| Same patient reference/SKU in two practices; duplicate within one | Cross-practice duplicates allowed; same-practice duplicate rejected |
| Patient document without encounter; cross-practice patient with null encounter; same-practice wrong-patient encounter | Valid patient-only document accepted; both mismatches rejected by independent/composite FKs |
| Room from another site; same room code at another site; provider assigned to two departments | Wrong-site reference rejected; correctly scoped duplicates and same-practice assignments allowed |
| Duplicate practice-wide role grant with null site; mismatched scope kind/site; edit role definition | Duplicate/invalid scope rejected; existing grants do not silently gain new permissions |
| Walk-in; appointment linked twice; appointment's patient changed after encounter | Walk-in needs no fake booking; duplicate association and identity mutation rejected |
| Two note writers at one version; signing races revision save; signed-content update | One valid transition wins; stale action conflicts; immutable signed revision remains unchanged |
| Concurrent overlapping reservations versus exactly adjacent intervals | Overlap rejected for the same room/provider; adjacency and distinct resources accepted |
| Zero versus unknown observation; wrong unit; non-finite numeric input | Valid zero retained where its reviewed field permits; missing reason distinct; invalid representations rejected |
| Update shared-looking street text; choose another patient's primary address | Other owners/history unchanged; foreign primary-address pointer rejected |
| Quarantined object; substituted object version; rollback after audit write; audit outage | No unauthorized download or false success; required failure evidence survives outside the rollback |
| Lost send/payment response; duplicate callback; two concurrent allocations | No automatic duplicate external action; reconciliation/deduplication; no over-allocation or currency mixing |
| New migration against legacy drafts/stock and separate restore | Existing IDs/ciphertext/units/history preserved; no fabricated encounter, signer or conversion evidence |

### What remains genuinely unresolved

The basic tenant, relationship, history, null/uniqueness and module-separation recommendations above no longer require another open-ended ERD design discussion. They still need implementation tests and review of the selected slice. These remaining choices cannot be answered from the picture:

- Actual clinic custody, clinical role/field/state/signature requirements and source-system migration evidence: T-09/T-13 and E1/E2; no real-record access here.
- Identity issuer/MFA/recovery, independent audit/storage services, operators and accepted revocation/downtime/recovery targets: T-23/T-34.5 and applicable operational/release gates. No service or budget is selected by this note.
- Clinical/document/audit retention and disposal rules, agreements and real-data release: L-05 and applicable professional gates; no universal retention period.
- Billing eligibility/rates/rounding acceptance, patient financial workflows and any supplier integration: T-14 and separate feature scope; D-029/T-37 remains deferred.

Engineering defaults do not close these gates. They allow the implementing agent to proceed with the accepted synthetic slice without re-asking questions whose answer is already the safer compatible schema.

## Verification and limits

This review inspected source and documentation; it did not run the application, execute SQL/migrations, connect to existing databases, perform penetration tests or access hosted systems. Documentation validation and preservation checks are recorded in the accompanying Progress Log entry. Prior test results are evidence of their dated runs, not new passes here. No patient records, secrets, clinical release, commits, pushes or deployments are included.

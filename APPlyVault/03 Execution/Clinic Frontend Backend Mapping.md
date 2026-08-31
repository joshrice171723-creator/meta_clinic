---
type: implementation-plan
status: proposed-contract-and-layout-mapping
updated: 2026-08-31
---
# Clinic Frontend Backend Mapping

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Design: [[Clinic Workspace Design]] · Target: [[Target-State Clinic ERD]] · Backend handoff: [[ERD Implementation Prompt]] · Canonical status: [[Roadmap and Tasks]]

## Outcome and boundary

**Request, 2026-08-31:** map the new backend comprehensively onto the current frontend, adding or modifying the interface where necessary while retaining its structure, feel and flow. This is the frontend integration plan, not an executed backend replacement or a new task register. Proposed endpoints, fields and layouts below are explicitly proposals unless identified as observed source.

Keep the workload-first Overview, patient directory, Pharmacy, Operations, Office inventory, Employees and account-owned Settings. Add depth inside those destinations rather than a sidebar entry per database table. Staff do intake/triage and explicit handoff; clinicians get a focused note/review workspace. Preserve Sage & ivory, Mineral blue and Warm graphite, system/light/dark modes, the viewport-height chart-tab sidebar, desktop/tablet support and the separate launch experience.

The corrected ERD and revision-5 handoff are the target, not proof that their workflows are available. D-044 supersedes older blanket deferrals of pictured modules; it does not supply the still-unrecorded minor ERD amendments, clinical definitions, patient membership terms or prescribing model. This plan includes all target families and marks missing dependent contracts individually. No database reset, code implementation, account provisioning, external delivery, commit/push, deployment or real-data access is performed by this mapping. Clinical/confidential/security/operational gates remain open.

**Failure-first entry:** an attractive screen could report a live queue from example rows, treat access membership as a paid patient membership, sign the wrong revision, restore revoked access through legacy flags, or report success before an external action is known. Prevention is explicit source/provenance, workflow-specific commands, one authorization evaluator and visible pending/conflict/unknown states. The synthetic tests in [[Clinic Frontend Backend Mapping#Acceptance and recovery]] must disprove these failure hypotheses before the corresponding feature is accepted. Codex owns this planning deliverable; implementation/review owners and dates remain unassigned.

## Review baseline and source status

Reviewed through Home/TOC: ERD and full implementation handoff; adversarial review and D-043/D-044 supersession; architecture and audit/callback requirements; relevant CI/CD checks; failure-first agreement; clinic design/workspace, current PostgreSQL inventory foundation, relevant Data Modeling sections, tasks, decisions and dated progress. Inspected frontend routing/contracts/components/client and current backend routes/controllers plus selected new migrations/models/services. MD/SharePoint originals, final ERD amendments and clinical workflow evidence remain unavailable, not assumed reviewed. No live database, patient chart or hosted system was inspected.

Snapshot: `feature/erd-adversarial-review`, HEAD `a90ce54b6302420406244d50cc5ce93bc29b2365`, with concurrent uncommitted backend and infrastructure work. Findings below refer to that changing working tree, not a released version. Recheck them at implementation handoff; a filename such as “approved” in a migration is not independent evidence of approval.

**End-of-review consistency check:** concurrent work committed the backend as `600976f` and moved the shared checkout to `feature/clinic-api-layer`. This planning task did not switch branches or create that commit. The inspected ERD/handoff, schema, route and frontend-contract hashes remain unchanged at this check, so the mapping still describes that source. New API work on the next branch must be reconciled against the proposed contracts; neither a commit nor this check proves runtime acceptance.

| Source, at review | SHA-256 |
| --- | --- |
| `Target-State Clinic ERD.md` | `a9558c4b4813c8e2f413243c229475e7385b15132bbf1bb5cb4f83dea7374499` |
| `ERD Implementation Prompt.md` | `6b167c9b56826dd1ae87b3469dc2088bebbe42b3ac9d873175ffb0c25550cb7c` |
| `apps/api/config/routes.rb` | `1093ac14c0b8a2a6399828948fd02184f7bcaa82cb2f501f5f7fdd06d419f5d5` |
| `apps/api/db/structure.sql` | `50e13da6c6db7ff11149ad91fe4ea57088661afbb69905e7cc1d0d3d29edc6eb` |
| `apps/web/src/api/contracts.ts` | `edace9a00ed1e5c3ced9d97b6e4fcf6cbd8825046d335065872226054c9b5d40` |

Primary code: [frontend routes](../../apps/web/src/App.tsx), [current response types](../../apps/web/src/api/contracts.ts), [request client](../../apps/web/src/api/client.ts), [clinic shell](../../apps/web/src/features/clinic/Workspace.tsx), [board examples](../../apps/web/src/features/clinic/trackingBoardData.ts), [Patients](../../apps/web/src/features/clinic/Patients.tsx), [API routes](../../apps/api/config/routes.rb), [new schema candidate](../../apps/api/db/migrate/20260831000200_implement_approved_clinic_erd_schema.rb).

| Area | Direct observation | Integration consequence |
| --- | --- | --- |
| Current browser | Existing directory/draft, inventory, staff and appearance contracts only; Overview imports `EXAMPLE_VISITS` with a fixed clock | Do not switch the board to directory records or fabricate visit state. Keep examples isolated until an accepted visit projection exists |
| Backend schema/model work | New ERD tables/models, tenant-bound PaperTrail storage/opt-ins and scheduling/note/observation/message/billing/grant services are present as uncommitted source | Some documentation still says dependency-only/no models. That is a dated baseline, not the current checkout; source presence is not route availability or tested completeness |
| HTTP boundary | Current routes still expose the old clinic modules; no board, appointment, encounter, revision/signature, document, message, billing or grant routes | New controllers, authorized queries, serializers and contract tests are needed; do not wire forms directly to model fields or private Ruby service arguments |
| Authorization | `BaseController` now invokes a new evaluator, while dashboard capabilities/counts still use old membership flags | A single server-derived permission projection must drive both navigation and data release. Test counts as well as mutations |
| Authorization transition risk | Evaluator uses grants when any active grant exists, otherwise legacy flags; new `notes.sign`, `messages.write` and `billing.write` can fall back to `patients_access?` | Last-grant expiry/revocation must not restore old access. Existing patient access must not silently become signing/billing authority. Resolve before exposing new commands; these are source-derived risks, not runtime exploit findings |
| Clinical history | Conditions/allergies/medication statements currently have patient ownership but no clinical value fields in the candidate migration | Tables are scaffolding, not complete intake/reconciliation APIs. Define clinical dictionary and revision/correction rules before forms |
| Note services | Create/revise/sign services exist. Revise rejects a signed latest revision; sign locates the supplied revision and hashes a field named `encrypted_body` | No accepted correction path or browser review-token contract yet. Prove encryption, latest-revision policy, exact reviewed content and save/sign races before calling this a signing workflow |
| Patient identity | API/model provides `display_name` and clinic-local `reference`, no structured given/family name or birth-date contract | Initial/surname abbreviation and age cannot be reliably populated by splitting names or guessing dates |

## Navigation and layout

The following paths are proposed additions; current paths stay valid. Keep the current plain-language labels and account Settings location. Do not add a clinic selector; a site filter is a narrower location within the assigned clinic, not another tenant.

| Destination | Retain | Add or change |
| --- | --- | --- |
| `/clinic` — Overview | Tracking-board rows/cards, stage filters, current-wait/arrival sorting, disclosure details, unique reference | Server-backed active encounters, freshness indicator, permitted site/owner filters, check-in, actionable next step. Add a separate Scheduled subview at `/clinic/schedule`; scheduled people do not count as waiting |
| `/clinic/patients` | Directory and explicit patient selection; return to board | Bounded server search/pagination, identity disambiguation and deliberate registration action; no automatic creation on no results |
| `/clinic/patients/:patientId` | Persistent patient context | Summary, Encounters, Documents, Messages and Billing sections; history, addresses and membership in Summary. Load each permitted section on demand, not one full-chart response |
| `/clinic/patients/:patientId/encounters/:encounterId` | Same clinic shell and board-return link | Focused Intake / Clinical note / Visit history workspace. Identity, site/room, owner and stage stay visible. Detail URL must reauthorize both patient and encounter |
| `/clinic/pharmacy` and `/:productId` | Catalog, stock/availability, product/lot/location detail, receipts, holds, counts and ledger | Align permission projection and stale/retry responses; clarify stock-location versus patient room. Keep exact-unit summaries and current pagination |
| `/clinic/inventory` | Office-stock adjustments and reorder information | Reuse improved action/error primitives; no clinical stock-use or procurement inference |
| `/clinic/operations` | Reorder work, directory totals, module shortcuts | Nested work areas: Facilities, Team access, Billing work, Message delivery, Suppliers and Activity. Show only implemented and authorized entries; do not show empty placeholder tabs for every target table |
| `/clinic/staff` | Employees directory, job title and active status | Staff detail/address history; separate link to authorized account/access management. Directory active status never grants or revokes a login |
| `/clinic/settings` | Signed-in user, palette/brightness, explicit versioned save | Keep personal preferences only. No clinic policy, patient membership pricing, global role editing or facility configuration here |

Patient subroutes may use `/documents`, `/messages`, `/billing` and `/encounters`; Operations subroutes use `/facilities`, `/access`, `/billing`, `/messages`, `/suppliers`, `/activity`. Extend the existing route registry deliberately; do not introduce a new routing library just for this plan. Shared identity/encounter context needs an unsaved-change navigation guard for links, Back/Forward, reload and patient switching. If router adoption is selected later, isolate it as a tested infrastructure change preserving current URLs.

**Encounter layout:** on wide screens place a compact read-only intake/history context column beside the main task. Staff enter short grouped intake sections; clinicians land on a single note composer with review context, revision status and explicit review/sign action. On tablet portrait/phone use one column and a wrapping section selector; keep the patient/encounter heading before the editor and the action area visible without covering the virtual keyboard. Use a full task page for long intake/note work, not a cramped modal. Board row expansion is a quick read; “Open encounter” starts work. Provide an explicit controlled transition, not drag-and-drop as the only way to move stages.

Use existing tokens, system font stacks, 16px inputs/body, readable secondary text, tabular quantities/times and restrained cards. Preserve 44px chart-tab/touch controls, text-plus-color statuses, native form semantics and no decorative dashboard metrics. Status meaning is identical in every theme. Reuse the current sidebar, rather than creating an encounter-specific second shell. See [[Clinic Workspace Design#Accessibility and ease-of-access targets]] for the existing acceptance target; this plan does not claim conformance.

## Tracking-board field contract

Proposed `GET /api/clinic/board` returns a minimal authorized `BoardPage`, not all patients with browser-side joins. Suggested envelope: `schema_version`, `context` (expected user/practice, policy version), `as_of`, `timezone`, filter scope, server totals, bounded rows/cursor, permitted actions and explicit source mode. Separate “all authorized current encounters” totals from filtered/page totals; never count only the first page or include unauthorized sites in aggregates. Business-day boundaries and cross-midnight open encounters must be explicit; open overnight work must not disappear at midnight.

| UI field | Target source | Required contract or missing piece |
| --- | --- | --- |
| Short patient label | `clinic_patients` | Server-produced label using approved structured given/family names, including Unicode, hyphens, short names and mononyms. Current `display_name` is insufficient; display full authorized identity only in selection/work context |
| Stable row/reference | `clinic_encounters` + clinic-local patient reference | One row per encounter, not per patient; separate patient and encounter IDs/references. Abbreviations can collide and are not de-identification or signing identity confirmation |
| Age / identifying context | Proposed demographics extension | Derive age on the server for an explicit date from a verified birth date; absent remains unknown. Do not ship birth date just to draw an age badge |
| Reason / visit type | Appointment visit type; encounter reason extension for walk-ins | Catalog code/label is not a chief complaint. The ERD has no reason field or walk-in visit-type relationship; define encrypted typed payload and minimal role-filtered summary |
| Stage | Encounter plus proposed flow events | Existing `open/completed` is not the board's five stages. Do not map arbitrary status strings to clinical readiness |
| Site / room | `clinic_sites`, `clinic_rooms`, encounter links | Room belongs to selected site. “Waiting area”/“Unassigned” is a display state unless explicitly modeled, not a pharmacy storage bin |
| Responsible person / next step | `clinic_encounter_participants` + handoff/action contract | Booked clinician is not necessarily actual responsible participant. Define ownership/acceptance, missing-owner handling and permitted next action; job titles alone confer no authority |
| Arrival / elapsed | Explicit arrival event proposed; encounter start only if accepted as arrival | Scheduled time is not arrival. Decide whether clinical encounter creation happens at check-in; otherwise an independently durable arrival record is required |
| Current-stage wait | Proposed `stage_entered_at`/flow event history | Current wait only for a waiting stage; total elapsed separately. Never derive it from `updated_at`, note timestamps or latest observation |
| Triage availability | Typed observations, history-review evidence and intake state | Distinguish not recorded, in progress, recorded and reviewed. No rows does not mean normal or no allergies. Show units, author, observed/recorded times and encounter association |
| Patient membership | Proposed patient commercial-membership history | Not `clinic_memberships` and not insurance `clinic_coverage_versions`. Unknown/not verified stays unknown; no balance or payment-card information on board |
| Freshness | Server `as_of`, encounter version and request generation | Show last updated/stale/offline. An example shift never replaces an error from a real endpoint. Freeze/label timers when data is stale rather than appearing freshly verified |
| Row action | Server `allowed_actions` for current state/resource | Action descriptor is UX guidance; server reauthorizes and compares expected version on execution. Missing/stale permission is not retried automatically |

Use a discriminated field state such as `known`, `not_recorded`, `not_applicable`, `restricted`, `not_supported` where safe. Do not put restricted raw values in JSON and hide them with CSS. Do not disclose that a restricted resource exists merely to explain a hidden field. Search terms/clinical reasons stay out of URLs, analytics and access-log query strings; propose a POST search endpoint with a minimal body and redacted diagnostics. Board presentation-only filter codes can use URL state; patient names cannot.

Recommended refresh: bounded conditional/background reads while visible, refresh on focus and after acknowledged actions, with request cancellation and backoff. Choose cadence after load testing, not a promised real-time service. Keep the selected row/focus stable when rows change; announce a concise update without reading every timer tick. No websockets, offline chart cache or browser record persistence are required for the first slice.

## Encounter workflow and clinical work

The five-stage presentation remains familiar, but the backend needs an explicit transition contract. The following is a proposed synthetic walkthrough, not approved clinical policy:

| Transition | Deliberate action and responsible role | Evidence and safe failure |
| --- | --- | --- |
| Scheduled/walk-in → Awaiting intake | Authorized staff select and confirm patient, then check in | Atomic encounter/arrival creation, optional same-patient appointment, current server time, request key. Duplicate check-in returns the existing result; no duplicate encounter |
| Awaiting intake → In intake | Staff accept intake ownership | Expected encounter version, participant/flow event; room optional until workflow requires it. Someone already owning work produces a conflict, not silent takeover |
| In intake → Ready for clinician | Staff save intake and request handoff | Persist completeness/review state and source versions; unresolved items remain visible. “Ready” means staff handoff requested, not clinician acceptance or a clinical safety score |
| Ready → With clinician | Authorized clinician accepts handoff | Explicit acceptance and responsible participant event. Merely opening the note does not change responsibility |
| With clinician → Awaiting checkout | Clinician deliberately hands off completion work | Note status and outstanding work shown independently. Signing alone does not close encounter, finish checkout or imply a prescription was transmitted |
| Awaiting checkout → Completed | Authorized staff complete approved checkout checklist | Server validates required work or accepted exception; completed timestamp/flow event. Billing status remains separate, not a condition invented to deny care |
| Correction, return to intake, abandonment or cancellation | Explicit reasoned command under accepted policy | Preserve earlier stages/times/owners. No generic destructive status overwrite, accidental encounter deletion or backdated fabricated history |

Appointment lifecycle is separate. Current source proposes `scheduled → confirmed/cancelled/no_show`, `confirmed → cancelled/completed/no_show`; encounter service creates `open` and closes to `completed`. These are implementation observations, not approval of the five-stage mapping. Scheduled-list actions need booking/reschedule/cancel/no-show validation, version checking, half-open room/provider conflict handling and a recoverable alternative slot; no implicit overbooking. A walk-in may have no appointment. At most one encounter per appointment; patient/context cannot be reassigned to repair a mistake.

**Intake:** group identity/contact, reason, history review and approved observations into short sections. Define a typed dictionary with units, permissible value shape and correction semantics, not a JSON blob or free-text vitals string. Numeric values remain exact strings when necessary; BP is grouped components; derived observations retain source versions/formula. Missing, declined, not asked and not applicable must be distinguishable where the approved dictionary supports them. Do not invent clinical thresholds, scores, default “normal” or automatic reassurance. Separate observing, recording and reviewing authors/times. Review attestation/version is missing from the pictured history tables; a current allergy row alone does not prove today's review.

**Clinical note:** save creates an immutable revision under a stable note header. Send `body`/typed content through an authorized API; encryption, trusted author, payload version validation and digest computation belong to Rails, not a browser field named `encrypted_body`. Show unsaved, saving, saved revision, conflict, failed/unknown outcome and signed states. Initially prefer explicit Save draft to unverified autosave. Preserve author provenance when displaying staff context; importing text into a clinician note is explicit and does not silently make it clinician-authored evidence.

**Review/sign:** open an exact persisted revision in a read-only preview showing patient identity, encounter, author, revision and attestation. Server supplies a review token/version/digest bound to that content and actor context. Confirm/sign is separate from Save, submits expected header version plus revision/token and an idempotency key; server validates active authority and accepted latest-revision policy under the same lock as save. A concurrent revision invalidates review and requires re-review, not signing an older draft by accident. Return the committed signature reference and revision, never just a green toast. Signed content cannot be edited in place; a separate correction/addendum command requires reason and links the predecessor, preserving prior signatures. Co-signing, attestations and correction authority remain point-of-use clinical decisions.

**Legacy drafts:** keep `clinic_notes` visible as “Legacy unsigned drafts” with original author/time. Do not manufacture encounters, revisions, signatures, reviewed status or recovered authors. Disable the old draft-write action only when its replacement is accepted and an explicit transition is available. Do not redirect old `POST /patients/:id/note` silently into an arbitrary current encounter.

**Prescriptions:** the target contains medication history, not a prescription/order model. Preserve space in the encounter workflow, but explain “Prescribing not available” rather than a working-looking Sign/send button. Medication statements cannot carry prescription intent or cause stock deductions. A separate amendment must define orders/revisions, signer authority, medication/dose/instructions/recipient validation, cancellation and transmission/acknowledgment/failure reconciliation; no vendor is selected. Note signing, prescription authorization, transmission and pharmacy acknowledgment are separate events. This gap does not block patient/encounter/unsigned-note integration.

## Complete target-entity mapping

Every one of the ERD's 68 named entities is assigned below. Backend-only and history-only entities intentionally have no CRUD screen. The additional PaperTrail table and frozen legacy stock tables are accounted for separately. An entity-to-screen map is not evidence of implemented workflow/constraint coverage.

| Target entities | Frontend home / role | Required behavior |
| --- | --- | --- |
| `organizations`, `clinic_practices` | Shell clinic identity; restricted Operations practice metadata if needed | Organization grouping is metadata only. No organization-wide charts, clinic creation/switcher or inherited access |
| `users`, `member_sessions`, `clinic_memberships` | Login/session banner; assigned clinic; authorized Team access summary | One assigned practice per clinical account; active/session checks. Show “Clinic access” to avoid confusion with patient membership. No session tokens or shared-account UI |
| `identity_preferences` | Existing personal Settings | Unique current user; allowlisted appearance and version conflict handling. Preserve expected-user guard and account remount behavior |
| `clinic_sites`, `clinic_rooms`, `clinic_departments`, `clinic_visit_types` | Operations → Facilities; scoped selectors in scheduling/encounters | Site timezone fallback; room/site validation, retired catalogs remain in history, department is not a location or stock bin. Add safe labels if codes are not human-readable |
| `clinic_clinician_profiles`, `clinic_clinician_assignments`, `clinic_clinician_credentials` | Operations → Team access/clinician detail; booked clinician picker | Distinguish profile, effective assignment and credential review from current permission. No “licensed/authorized” badge inferred merely from a profile or issuer text |
| `clinic_patients` | Directory, Summary, identity heading, board projection | Clinic-local reference; minimal search result; typed demographic extension needed. Cross-clinic matching/merge not proposed |
| `clinic_appointments` | Overview → Scheduled; patient upcoming visits | Booking/transition commands; conflicts; optional room/site/clinician; date/time and time-zone disambiguation |
| `clinic_encounters`, `clinic_encounter_participants` | Board and focused encounter | Actual visit, optional appointment, current participants and history; flow/arrival/ownership additions as above |
| `clinic_notes` | Patient → legacy history | Read-only preserved unsigned entries after accepted write-path retirement; no fabricated signed history |
| `clinic_encounter_notes`, `clinic_encounter_note_revisions`, `clinic_encounter_note_signatures` | Encounter → Clinical note / Visit history | Revision-specific save/review/sign/correction; no general update/delete for immutable revisions/signatures |
| `clinic_observations`, `clinic_observation_sources` | Intake, triage detail and clinician context | Typed values/groups/units, provenance and derived-source detail; no arbitrary formulas in browser or silent overwrite |
| `clinic_conditions`, `clinic_allergies`, `clinic_medication_statements` | Patient Summary; encounter history review | Actual typed clinical content/state and reviewed-version contract still needed. Unknown ≠ negative history; statements ≠ prescriptions |
| `clinic_items` | Office inventory | Preserve integer unit/stock controls and shared ledger; no independent mutable stock source |
| `clinic_pharmacy_products`, `clinic_inventory_lots`, `clinic_inventory_locations`, `clinic_pharmacy_batches` | Pharmacy catalog/product/position | Product versus lot versus bin, exact on-hand/available by unit, expiry/active/hold exclusion; barcode/dispensing not inferred |
| `clinic_inventory_suppliers`, `clinic_supplier_address_versions` | Operations → Suppliers; receipt supplier selector | Same-practice immutable address history; no price-feed connection, purchasing or supplier-account credentials |
| `clinic_inventory_receipts`, `clinic_inventory_receipt_lines`, `clinic_inventory_entries` | Receive and read-only product/office history | Atomic posting, exact input/conversion/stock units, original cost/currency, actor/profile. Receipt is not supplier invoice or patient invoice |
| `clinic_inventory_holds`, `clinic_inventory_hold_releases` | Product position → Holds | Distinct overlapping holds, explicit individual release, reason and authority; releasing one must not make still-held stock available |
| `clinic_inventory_counts`, `clinic_inventory_count_approvals` | Product position → Count/review | Frozen cutoff/profile and variance; separate approval, stale rejection. Don't replace current stock with the observed count |
| `clinic_inventory_profiles`, `clinic_inventory_catalog_events` | Existing Pharmacy configuration/history; Operations shortcut | Versioned synthetic operating profile versus user permission; no implied clinical activation. Metadata-only catalog history, not arbitrary audit restore |
| `clinic_staff_members`, `clinic_staff_address_versions` | Employees directory/detail | Human directory with typed owned address versions, separate from identity accounts; no automatic access grant from title/active field |
| `clinic_patient_address_versions` | Patient Summary → Contact/address | Immutable versions and same-owner primary pointer, reauthorized details. Distinct from staff/supplier records even if address text matches |
| `role_versions`, `permissions`, `role_version_permissions` | Backend policy catalog; read-only role descriptions in Team access | Immutable global definitions with versions; no customer-editable arbitrary permission strings |
| `clinic_role_grants`, `clinic_role_grant_events` | Operations → Team access | Authorized practice/site-scoped grant/revoke with effective interval, grantor ceiling and revision. No self-elevation; history remains after revocation |
| `clinic_document_categories`, `clinic_documents` | Patient Documents; encounter attachments; restricted category configuration | File is an immutable private object version, same patient/encounter, categorized and scanned; no public object links or generic storage browser |
| `clinic_message_intents`, `clinic_message_attachments`, `clinic_message_outbox`, `clinic_message_delivery_events` | Patient Messages; Operations → Message delivery | Immutable recipient/purpose/content/attachment versions; atomic queue and reconciliation. Outbound-only target; not an inbound inbox or staff chat |
| `clinic_invoices`, `clinic_invoice_lines` | Patient Billing; Operations → Billing work | Draft/review/post with exact amounts/currency/rounding-policy version; immutable posted descriptions/amounts. No approved rates/default membership charges exist |
| `clinic_payment_events`, `clinic_payment_allocations`, `clinic_credit_notes`, `clinic_refund_events` | Patient Billing timeline and authorized reconciliation | Explicit payment/allocation/credit/refund commands, same patient/currency, bounded amounts and duplicate-event handling. Recording a payment ≠ charging a card |
| `clinic_coverage_versions`, `clinic_insurance_claims` | Capability-gated patient Billing → Coverage/claims | Preserve full target coverage without making insurance the cash-pay clinic's primary flow. Coverage evidence/version and patient/invoice consistency; no insurer transmission implied |
| `clinic_audit_events`, `clinic_audit_resource_manifests`, `clinic_audit_delivery_receipts` | Backend capture; restricted Operations → Activity if accepted | Metadata-only authorized history and delivery health; no general patient-history export, raw payloads or generic version reification. Record reads/denials/failed actions separately from model changes |
| `platform_audit_events` | Restricted platform/operator evidence, not clinic screen | Authentication/unknown-tenant events remain separately scoped; never expose cross-clinic/platform history to clinic administrators |

Additional source/transition records: `clinic_model_versions` is the in-progress tenant-bound PaperTrail store, not a general browser endpoint or clinical revision history. Preserve frozen `clinic_pharmacy_movements`, `clinic_stock_movements` and `clinic_pharmacy_batch_events` as historical evidence where present; show provenance through authorized inventory history, not new posting forms. Launch paperwork, learning progress, materials, inquiries/contact and their identity relationships are outside the ERD but remain supported; their routes and own authorization do not disappear in a clinic replacement.

## Proposed API and frontend implementation boundary

Keep Rails authoritative for tenancy, actors, permissions, validation, transitions, exact arithmetic, encryption and audit. Queries return authorized screen projections; commands express user intent. Do not expose one CRUD controller for each table. IDs identify a candidate resource, never grant access; Rails resolves every submitted link through the current practice and same-patient/site constraints.

### Existing consumer transition

All routes below exist in the inspected source. Proposed replacement modules should preserve these contracts until their consumers switch together and compatibility tests pass.

| Current routes | Consumer | Disposition |
| --- | --- | --- |
| `GET /api/clinic` | `Workspace`, `Operations`, navigation/action visibility | Retain compatibility initially, but derive flags/actions and aggregates from the same authoritative evaluator. Then split lightweight `/api/clinic/context` from `/api/clinic/operations` so every patient screen does not fetch inventory/staff totals |
| `GET/POST /api/clinic/patients`; `GET /api/clinic/patients/:id`; `POST /api/clinic/patients/:id/note` | `Patients.tsx` | Retain IDs and legacy-history reads, add bounded search/summary. Replace old draft write only with explicit encounter selection and accepted note API; preserve archived entries |
| `GET/POST /api/clinic/pharmacy`; `GET/PATCH/PUT /api/clinic/pharmacy/:id` | `Catalog`, `NewProduct`, `Product` | Preserve projection, filters/paging, `Decimal` strings, stock semantics and profile history; adapt action visibility from common policy |
| `POST /api/clinic/pharmacy/lookup`, `/import`, `/demo`; `POST /api/clinic/pharmacy/:id/receive` | NDC search/import/demo and receiving | Preserve explicit public lookup, bound import token and no-stock import, guarded synthetic demo, retry-safe receipt. No automatic external lookups from chart fields |
| `POST /api/clinic/pharmacy_batches/:id/movement`, `/status`, `/count`; `POST /api/clinic/inventory_counts/:id/approve`; `POST /api/clinic/inventory_configuration` | Product controls/configuration | Keep command authority, ledger and audit; add structured conflict/reconciliation results without double posting. Profile configuration remains separate from account permissions |
| `GET/POST /api/clinic/inventory`; `POST /api/clinic/inventory/:id/adjust` | `Office.tsx` | Retain existing single-ledger office behavior; no balance-mutation endpoint |
| `GET/POST /api/clinic/staff`; `PATCH/PUT /api/clinic/staff/:id` | `Staff.tsx` | Retain directory behavior; new address/access flows are separate, scoped commands |
| `GET /api/csrf`; `GET/POST/DELETE /api/session`; `POST /api/development_session`; `GET/PATCH/PUT /api/settings` | App, Login, Appearance, Settings | Retain CSRF bootstrap serialization, explicit login, 12-hour absolute session, demo/environment guards and current-user preferences. No automatic test login, new role granted by persona name, or mutation replay |
| `/api/materials` list/detail/start/complete, `/api/paperworks` list/detail/start/sign/receipt, `/api/contact_messages`, `/api/inquiries` | Launch components | Preserve all current methods and account/admin restrictions. Launch signing is not reusable clinical authority. Verify the route manifest and non-ERD data/history explicitly |

### New screen-oriented contracts

**All routes in this table are proposed, not implemented HTTP APIs.** Prefix `/api/clinic` is omitted. Command names may change when the final contract is accepted; maintain a single documented route/DTO source and producer-consumer fixtures. Use separate action checks for reads/writes/sign/review/admin rather than broad module grants.

| Query / command family | Minimal response and mutations | Consumer / missing work |
| --- | --- | --- |
| `GET /context`; `GET /operations` | Assigned practice, expected user, policy version, authorized sites/modules; separately permission-filtered operational counts/links | `Workspace`/navigation and Operations; shared evaluator migration prerequisite |
| `GET /board`; `POST /patients/search` | `BoardPage`; bounded patient matches/cursor with minimal identity | Extract example provider from `TrackingBoardPage`; separate API adapter. Add explicit empty/loading/stale/denied views |
| `GET/POST /appointments`; `POST /appointments/:id/reschedule` and `/transition` | Zoned instant range, local display zone, version, authorized transitions; errors for room/provider conflict | Scheduled list and booking form, not a new calendar dependency initially |
| `POST /patients/:patientId/encounters`; `GET /patients/:patientId/encounters`; `GET /encounters/:id` | Create/return actual encounter; minimal list and detailed `EncounterWorkspace`; actor/time/version from server | Check-in and patient visit history. Patient route ID must agree with encounter projection |
| `POST /encounters/:id/transitions`; `POST /encounters/:id/handoffs` | Expected encounter/flow version, target action, permitted reason, request key; acknowledged owner/stage history | Requires accepted arrival/flow/handoff amendment; no generic status PATCH |
| `GET /patients/:id/summary`; `PATCH /patients/:id`; `POST /patients/:id/address_versions` | Typed demographic/version payload; same-owner primary address command | Registration/correction and Summary. No names/search bodies in diagnostic logs |
| `GET /encounters/:id/intake`; `POST /encounters/:id/observations`; typed patient history/review commands | Typed value/source versions, author/times and review completeness; append/correct under accepted policy | Grouped Intake; history entities need actual clinical content and correction/attestation schema |
| `POST /encounters/:id/notes`; `GET /notes/:id`; `POST /notes/:id/revisions`, `/review`, `/signatures`, `/corrections` | Note header version, exact revision, safe review token, immutable signature/correction links | Dedicated `NoteEditor` + `NoteReview`; signed correction and exact reviewed-content contract missing |
| `GET /patients/:id/documents`; upload-intent/finalize commands; authorized document download | Metadata-only list, pending/quarantined/clean/rejected state, immutable version reference; reauthorized streamed download | Dedicated binary transport; `formBody` currently rejects files. Upload size/type/checksum/version/scan validation and failure cleanup needed |
| `GET/POST /patients/:id/messages`; `GET /messages/:id` | Minimal delivery summary; immutable intent, exact recipient/document versions, purpose, key; operation status | Composer + outbound history; local adapter only until separately selected delivery service and authority |
| `GET /patients/:id/billing`; invoice draft/line/review/post, payment recording/allocation, credit/refund commands | Server exact totals/currency, policy version, immutable posting/event references, outstanding balance and unknown payment state | Billing section and work queue; point-of-use rates/rounding/refund/eligibility decisions required |
| Patient coverage version / invoice claim commands | Same-patient version/invoice binding and explicit local status | Optional cash-pay UI capability; no claims vendor or filing commitment |
| `GET /facilities`; scoped catalog commands; `GET /team`; grant/revoke commands | Catalog versions/effective assignments, role descriptions, permitted scope/ceiling and grant history | Operations pages; scoped same-site membership constraints, no account self-grant or arbitrary role editor |
| `GET /suppliers`; owned supplier/staff address commands | Minimal directory and versioned owned address projection | Supplier/employee detail; no generic contact graph |
| `GET /activity`; `GET /operations/:requestKey` | Narrow audited event projection; authenticated, authorized operation receipt for uncertain result | Restricted activity/reconciliation. Request key is not a bearer secret; never expose raw audit snapshots/session identifiers |

Patient membership and prescribing endpoints deliberately remain undefined pending the amendments below; this is a named model gap, not permission to repurpose another entity. Generic operation-status lookup is also a proposed contract, not an existing table; implement with a protected per-domain receipt or approved shared record, not an audit-log scrape.

### Shared frontend changes

| Source area | Planned change | Preserve / verify |
| --- | --- | --- |
| `src/api/contracts.ts` | Split domain DTOs as they grow; add discriminated clinical states, `AllowedActions`, page envelopes, expected resource versions and safe structured errors | Browser-facing DTOs only, no Active Record model mirroring. Define opaque string IDs for new bigint contracts or prove safe-number bounds and adapt existing IDs explicitly |
| `src/api/client.ts` | Parse `{code,message,field_errors,request_id,current_version?}` without sensitive exception details; separate JSON and approved binary upload/download transport | Same-origin credentials, no-store, redirects denied, CSRF generation/serialization, no automatic write replay. Distinguish validation from stale CSRF rather than clearing context for every new domain validation error |
| `src/shared/ui.tsx` | Accessible field-error summary; request lifecycle and unsaved/conflict guards; dedicated typed forms for observations/line arrays | Current generic Form has only shallow field grouping and cannot represent all clinical/billing structures. Do not squeeze arrays/files into bracket-name hacks |
| `Workspace` / navigation | Versioned session/practice/policy context, resource-aware actions; context invalidation on account change/revocation | Existing `key={user.id}`, current-user Settings, chart-tab/focus behavior, no clinic picker or broad admin bypass |
| `TrackingBoardPage` / `trackingBoardData` | Keep visual presentation; introduce explicit example/API providers and a tested DTO adapter; make row links use real encounter context only in API mode | Never mix example IDs with API records or fall back to invented examples after a fetch failure |
| `Patients.tsx` | Separate Directory, PatientWorkspace, EncounterWorkspace, IntakePanel, NoteEditor/Review and LegacyDraftHistory components | Stable current routes, safe identity confirmation, read-only historical provenance and no patient switch with unnoticed unsaved content |
| `Operations.tsx`, `Staff.tsx` | Authorized nested operations sections and detail pages; action-specific controls | Reorder/directory counts stay off clinical workload metrics; employee identity remains distinct from account identity |
| Inventory components | Update policy/error/version adapters, retaining current domain forms and exact quantities | No inventory rewrite to resemble clinical encounters; keep existing product/bin/ledger semantics and isolated external FDA lookup |
| Clinic CSS | Add scoped patient/encounter layouts and form primitives to existing theme tokens | Remove accidental dependence on `pharmacy-page` for non-pharmacy layout when extracting shared primitives; no launch-style/global CSS regression |

Fresh page, Back/Forward and login-return behavior must work for new nested routes. Extend the existing exact allowlist with parsed safe internal route patterns; no open redirects, free-form URL targets or record content in `next`. Revalidate access/identity on return, do not resume signing automatically. Clear uncommitted sensitive state at expiry/account change; safe in-memory editing is not offline persistence. Any future encrypted server draft recovery is a separately specified feature, not localStorage/IndexedDB or service-worker caching.

## Documents, messages, billing and operations details

**Documents:** UI owns file selection/progress; server validates size, type, checksum and actual private object version. Scan state is visible, download disabled while pending/quarantined/rejected. Reauthorize download and message attachment at execution; don't rely on a once-authorized URL. A metadata row is not proof an object exists or scanning succeeded. The ERD lacks a logical-document version-chain/retention-hold model: do not invent replacement/delete/version-history actions until those links and disposition rules are accepted. Use a local synthetic storage adapter first; no chosen cloud bucket/vendor. Preserve failed/orphan upload reconciliation without deleting held evidence.

**Messages:** compose under one patient, show recipient snapshot and purpose, explicitly choose permitted clean document versions, review then enqueue. An accepted intent is “Queued,” not “Sent.” Show delivered/failed/unknown with meaningful next steps; an ambiguous delivery must be reconciled before another send. Different payload with the same key is rejected even under concurrent requests. Callback events are server/vendor-adapter inputs, never user-editable delivery status. No inbound inbox, real SMS/email, consent inference or automatic appointment reminders are added by this plan; recipient/contact preferences and disclosure authority need their own contract.

**Cash-pay billing:** Patient Billing prioritizes draft charges, posted invoices, recorded payments and outstanding amounts, with receipt/history detail. A worklist in Operations serves authorized reconciliation staff. Monetary precision, rounding and totals are server-owned; JavaScript must not calculate invoice truth using floating point. Posting locks immutable line snapshots; corrections use credit/refund workflows rather than editing paid history. Currency mismatches, over-allocation/refund, repeated external event IDs and uncertain external outcomes are rejected/reconciled. Member badge never sets clinical queue priority, implies paid-in-full, or silently discounts a line. Coverage/claims are target features but remain out of the primary cash-pay flow unless enabled and specified. APPly fees based on ordered inventory value and deferred supplier pricing are separate from patient charges.

**Team access / facilities:** catalog administration and grant administration are different permissions. Preserve all historical memberships/authors even when inactive. A practice/site grant is evaluated for the actual resource site; an unspecified site cannot widen a site-only grant. Resources without a site need an explicit policy. Catalog setup must not expose all patient names or billing histories. No clinic account invitation, password/reset/MFA provisioning flow is invented; [[Client Access Workflow]] and T-23 retain those responsibilities.

**Audit:** PaperTrail model versions, clinical note revisions, stock entries and operation/read evidence have different purposes. A browser click is not durable evidence. Required mutation audit commits atomically; denied/rolled-back/read evidence follows the independent durability contract in [[Software Architecture#PaperTrail audit contract]] and [[Data Modeling#Auditing design]]. UI reports a write complete only after its transaction/receipt; downstream scan/delivery remains pending. Audit outage blocks the affected protected release with a recoverable error, never a silent bypass. Restrict Activity viewers and audit their queries; no generic reify/restore/delete versions UI.

## ERD amendments and contract decisions to reconcile

These are specific gaps to reconcile with the founder's promised minor amendments, not a claim those amendments were received. Engineering can proceed on independent approved slices while a dependent point is unresolved.

| Gap | Recommended design amendment or decision | What waits |
| --- | --- | --- |
| Demographics/board identity | Typed encrypted given/family/display-name and optional birth-date/contact schema with reviewed handling of names; server short-label/age projection | Exact initial/three-surname and age; directory integration can retain existing name/reference meantime |
| Arrival and board flow | Durable arrival plus append-only stage/ownership/handoff events, current projection/version and trusted event times; decide arrival versus encounter-start semantics | Live five-stage board/check-in/wait clocks; do not use generic audit versions as the flow ledger |
| Triage and history review | Approved observation dictionary, meaningful condition/allergy/medication fields, review attestations/source versions and correction rules | Actual triage/history forms and “reviewed/ready” claims; no clinical thresholds invented |
| Patient commercial membership | Separate patient membership/plan reference, versioned effective history and explicit verification provenance; define allowed statuses and manual verification first if accepted | Member badge from backend, enrollment/renewal/benefits/fees. No subscription/payment vendor or automatic rules assumed |
| Prescriptions | Separate authorized order/revision/signature/transmission model with clinical/service review | Prescribing, not medication history or unsigned notes |
| Note correction/signature | Accepted attestation and correction semantics, exact review token, current-revision/version locking and typed encrypted content | Sign/correct controls; draft/read context can be delivered earlier |
| Document grouping/lifecycle and communication authority | Logical document/version links, scan/object adapter, hold/retention contract; recipient/contact preferences and lawful-purpose checks | Replace/delete/send actions; no external service or retention duration guessed |
| Authorization migration | Explicit activation/version marker and deterministic grant migration; no fallback after cutover even with zero active grants. Define action catalog and site-less record policy | Grant-enabled UI, restricted aggregates and all new high-impact commands |
| Billing policy | Accepted line dictionary, currency/precision/rounding, posting/payment/refund/claim rules and membership eligibility if used | Charge calculation/posting/settlement; not basic planned screens. Current numeric columns alone do not choose policy |

These additions should be reconciled in the ERD/implementation handoff by the backend owner before structural changes; this plan does not modify the concurrent migration or assert its approval. Do not turn gaps into indefinite deferral of all 68 target entities: every dependent feature remains assigned in the coverage table and delivery sequence.

## Delivery sequence and migration

This is a dependency sequence linked to canonical tasks, not a duplicate status list or new deadline. Align it to stages A–E of [[ERD Implementation Prompt]]. Run focused tests per slice and full regression/upgrade/restore before accepted integration. Work on a feature branch or dedicated worktree from the agreed candidate; this planning turn makes no branch changes and preserves concurrent edits, including the branch advance recorded above.

| Order / handoff stage | Independently reviewable slice | Entry / exit evidence; canonical ownership |
| --- | --- | --- |
| 1 / A | Freeze final ERD delta, old/new route and data disposition, DTO/error/version/action catalog and rollout plan | Reconcile this map with actual backend source; synthetic fixture dictionary and named reviewers. T-13.1–T-13.3 own workflow/field review; no claim that this mapping alone completes them |
| 2 / B | One authorization evaluator, clinic context/Operations projections and transport/audit contract | Test no-grant/revoked/site scope, counts, account/session changes and rollback/read evidence. Explicitly migrate old capabilities and remove fallback at activation. T-23/T-34.3/T-34.5 and E2, without inheriting clinical signing from `patients_access` |
| 3 / C–D | Patient search/identity and facilities-backed scheduling; read-only encounter history | Preserve directory IDs/legacy drafts; new minimal queries and paged UI; same-patient/site/timezone/conflict tests. Safe prerequisite for actual check-in |
| 4 / C–D | Check-in → flow/ownership → live synthetic board | Accepted flow amendment, atomic duplicate-safe arrival, authorized board aggregates, fresh/stale/empty modes and timers. T-13/T-44; remove example dependency only from API mode, keep labeled preview separately |
| 5 / C–D | Staff intake/history review → explicit handoff → clinician draft | Accepted typed dictionary and provenance; wrong-patient, incomplete, absent-owner, stale/save-error and expiry tests. T-13.3/T-13.4; unsigned notes remain visibly unsigned |
| 6 / C–D | Exact-revision review/sign/correction and encounter checkout | Independent signing policy, version/race/idempotency/audit evidence; no auto-prescription or auto-checkout. Rx remains a separately specified amendment and later vertical slice |
| 7 / C–D | Documents/typed addresses, then outbound messages | Private-object/version/scan/read audit acceptance before attachments; unknown-delivery reconciliation and controlled local adapter. No real delivery or browser cache |
| 8 / C–D | Patient billing/payment reconciliation and optional coverage/claims; membership integration when its model is accepted | Explicit rules and exact arithmetic; recorded versus executed payment distinction; preserve cash-pay default. No supplier/APPly-fee coupling |
| Alongside 3–8 / C–D | Inventory adapter regression, Suppliers, Employees/access/facility configuration and restricted Activity | Preserve shared ledger/history/profile invariants and directory/access distinction; full ERD coverage. T-34 and relevant T-23/T-13 dependencies |
| 9 / D–E | Consumer cutover, legacy write retirement, migration/restore and responsive/accessibility acceptance | Version-pinned API/web pair; old clients get explicit incompatibility for unsafe commands. Reconciled data, routes, audit/history and all tests below; T-22/E2/E3 remain evidence gates, not automatic approval |

Start the next implementation with **context/authorization projection and patient/encounter read contracts**, not the whole UI at once. This exposes backend gaps without committing users to unsafe mutation flows and gives a stable base for check-in and the board.

Migration rules:

1. Inventory every current route/consumer, non-ERD workflow, table/model, service/callback/job and database guard before retirement; this note maps UI-facing behavior, while the backend handoff still requires a complete executable-path matrix.
2. Preserve IDs or an explicit reversible ID map, original ciphertext, authorship/time, stock units/conversions, sessions/preferences, launch records and immutable history. Never convert example board rows into backend patients/encounters. Never fabricate historical signatures or visit dates for old drafts.
3. Use additive compatibility readers/serializers during transition where safe, but one authoritative command path and one policy evaluator. No dual stock posting, old/new permission OR, silent client coercion or generic shadow-write success.
4. A versioned route/DTO capability handshake prevents a frontend from exposing commands a backend cannot handle. Unsupported/disabled is explicit, not an empty clinical result. Keep the synthetic banner and production clinic denial; integration does not authorize hosted clinic rollout.
5. Rehearse from a preserved synthetic old-schema dataset into an isolated target, reconcile counts/relationships/amounts/history and decrypt with the appropriate keys. Restore independently. After new writes, an old binary may not understand new state; rollback is not permission to discard it. Define forward recovery or a verified reverse transition before cutover.

## Acceptance and recovery

Use the commands and isolated-data boundaries in [[CICD#2. Develop and check locally]]: frontend tests/typecheck/build/format; Rails tests/eager-load/lint/static checks; independent PostgreSQL upgrade/concurrency/restore; native HTTP verifier. Add producer-consumer fixtures for every new projection and command, not just snapshots of successful pages. Those checks have **not** been run for this documentation-only plan, and current in-progress backend behavior has not been accepted here.

| Layer / scenario | Observable expected result |
| --- | --- |
| Route/DTO completeness | Each existing consumer has retain/migrate/retire evidence; each target family has a query/command or explicit backend/history-only disposition. Every UI command has server authorization, validation, audit and error tests |
| Accounts and tenancy | Test Client A/B remain isolated; Test Admin has no clinic by virtue of consultancy admin; disabled/expired accounts fail. Add narrowly scoped intake, clinician, inventory-only, billing-only and site-only synthetic personas after the action matrix is accepted, not full-access defaults |
| Grant cutover/revocation | Old flags true + zero effective grants after activation stays denied; revoking/expiring last grant does not restore permissions. UI, summaries, search, deep links, writes and object downloads agree with the evaluator |
| Site / patient / encounter mismatch | Forged related IDs, mismatched nested URLs, different-site rooms and site-less access fail before release/write; error does not disclose the foreign record. Organization metadata never broadens scope |
| Wrong patient and abbreviations | Colliding initials/surnames show distinct reference; full identity confirmed before work/signing; mononyms and Unicode don't produce guesses. Account/patient navigation cannot retain another person's editor state |
| Board truth and time | Empty clinic ≠ failed load ≠ restricted data ≠ example shift; counts include authorized pages only under explicit scope. Scheduled time ≠ arrival; stage wait ≠ total time. Test DST ambiguity, midnight carryover, future/absent timestamps and stale clock |
| Scheduling/check-in | Provider/room overlaps rejected; adjacent half-open slots accepted; cancelled/no-show/completed appointments handled by accepted policy. Concurrent duplicate check-in creates one encounter/arrival and a recoverable receipt |
| Intake/provenance | Missing values aren't zero/normal; BP components/units and derived sources remain linked. Unreviewed history stays unreviewed; staff provenance persists when clinician views/uses it |
| Handoff | Opening a row doesn't accept ownership. Missing/unavailable owner and simultaneous acceptance produce clear unresolved/conflict state. Corrections preserve prior transition times and actor |
| Notes | Save A versus save B, save versus sign and repeated sign don't lose work or sign unintended revision. Signed correction appends reason/link; legacy draft never becomes signed evidence. Failure/expiry cannot yield “Saved” or auto-replay |
| Uncertain mutations | Dropped response after commit produces “Outcome not confirmed” and explicit receipt lookup. Retry uses the same key only after reconciliation; changed payload is rejected under sequential and concurrent retries |
| Inventory regression | Exact strings/unit totals; no extra ledger source; duplicate receipts, stale counts, overlapping holds, profile changes and legacy attribution reconcile. Clinical note/prescription actions never change stock |
| Documents/messages | Oversized/bad checksum/quarantined/foreign-version upload/download/attachment rejected; access revoked after enqueue is rechecked. Queue ≠ delivery; unknown transport outcome is reconciled before resending |
| Billing | No float rounding, missing-policy posting, cross-patient/currency allocation, overpayment allocation/refund, duplicate external event or mutation of posted history. Member/coverage/clinic-access statuses never substitute for one another |
| Audit and failures | Sensitive-field-only change and callback child are captured without content; actor context resets across requests/jobs. Inject capture failure and prove transaction rollback/read denial plus independent attempt/failure evidence; no false success or missing side-effect state |
| Responsive/accessibility | 320/390px phone; 768/834px portrait tablet; 959/1024px intermediate/landscape; 1280/1440px desktop. All themes/modes with populated, empty, long-label, error and conflict states. Check keyboard, focus return, screen reader, 200% text/400% zoom, touch and virtual keyboard; no whole-page horizontal overflow or hidden sign-out |
| Restoration and release | Fresh/upgrade/restore with synthetic history preserves exact values, foreign keys, authors and expected permissions; restricted runtime protections pass. Current and new paired frontend/API HTTP flows pass; production clinic denial and local-only test login remain |

On affected-path failure: stop the action, retain truthful pending/unsaved/error state within the approved session boundary, reconcile via protected server receipt and allow authorized reload/re-review. Do not auto-reset the database, clear history, disable CSRF/audit, store chart drafts in the browser or quietly relabel failure as completion. Full clinical workflow, independent security/operational acceptance and L-05 remain separate from successful synthetic tests.

## Planning deliverables and remaining limits

Delivered by this planning pass: source-versus-target baseline, navigation/encounter layout, board field mapping, all-entity coverage, current route transition matrix, proposed APIs/components, missing-contract amendments, dependency sequence and failure/acceptance cases. The accompanying inline layout study is presentation-only, with independently invented examples and no API, persistence, signing, billing or sending actions.

Planning validation: all 68 named ERD entities occur in the mapping; 37 vault notes have valid frontmatter, unique names and Home reachability; all 774 wiki/heading links and 19 relative links in touched notes resolve. Existing content in the four edited notes is preserved by a remove-only-our-insertions hash comparison. Whitespace checks pass. The layout fragment passes static safety checks and both view-switch interactions in a Node DOM stub; it has not undergone browser-rendered, responsive or assistive-technology acceptance. These checks validate this handoff, not application behavior.

Next: reconcile the specific ERD amendments with the backend owner, accept the context/action/encounter read contracts and implement that bounded first slice. No runtime, browser, clinical, audit-durability or deployment acceptance is claimed by this note. [[Roadmap and Tasks]] remains the only task/status register.

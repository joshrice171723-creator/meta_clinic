# Meta Clinic capability architecture

Adopted direction: D-078 in [Decisions](../../APPlyVault/03%20Execution/Decisions.md), 2026-09-14. Rationale and reviewed sources: [architecture research](../../records/research/2026-09-14-meta-clinic-capability-architecture.md). Product composition: [strategy](../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md). Action blockers/owners: the sole matrix in the [engineering guide](../development/meta-clinic-build-and-acceptance.md). Work status belongs only in the [tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md).

This is the current implementation contract, not a claim that the architecture is already implemented. It governs capability composition, ownership and evolution where older architecture descriptions conflict. It does not supersede unrelated security, tenancy or clinical-review requirements.

## 1. Design forward; do not preserve development debt

There are no real users. Current tables, APIs, UI components, historical plans and synthetic fixtures are not target-design constraints. Choose reuse, refactor or replacement on merit. Do not build compatibility layers, dual-write paths or fixture migrations solely to preserve disposable development work. A scoped clean replacement can be preferable to incremental preservation.

An implementation assignment must identify its exact affected contracts and consumers, then choose a bounded transition. Development-data resets may be proposed with explicit environment/target and reconstruction steps; this document does not authorize deletion, rewriting applied migrations, external resets or deployment. Preserve unrelated work, credentials and retained evidence. Once real records or external consumers exist, reconsider the transition strategy explicitly.

Historical integrity below describes required product behavior demonstrated with fresh synthetic records. It is not an obligation to carry today's fixture population into the new design.

## 2. One modular application, explicit owners

Keep React/TypeScript, Rails API and PostgreSQL. Use a modular monolith, not specialty forks, one database/engine per capability, or speculative microservices. Change this decision only for demonstrated scaling, isolation or independent-deployment needs that outweigh operational costs.

Each fact/invariant has one domain writer. Identity/tenancy, configuration, scheduling/resources, clinical care, work coordination, inventory/fulfillment and finance/commercial records own their respective transitions. These are responsibility boundaries, not mandatory new directories or services. Map actual code before naming or extracting a module; current namespaces need not survive if wrong.

Commands invoke narrow owned operations. Queries may compose authorized read-only source data across domains. Patient Flow displays source status and owned tasks; it must not maintain a second clinical, stock or payment truth. Cross-domain atomic local actions may share a database transaction through their owners. Avoid callbacks or implicit event cascades that conceal required business work.

Use conventional Rails/React organization and explicit dependencies. No sibling-controller calls, cross-domain direct writes, giant generic workflow manager, universal state machine or abstraction whose purpose is only to remove small duplication. A shared mechanism must have matching semantics, not merely matching field names. Dependency checks should catch actual forbidden edges; do not add indirection merely to make a graph green.

## 3. Setup-time composition and tiered change authority

Separate specialty, modality, payment model and operational capabilities. Telehealth-only must not require physical resources. A specialty name does not grant permissions, choose treatments, connect vendors or determine payment policy.

A small code-owned capability registry defines key, supported configuration schema, dependencies/conflicts, supported scope and implemented variants. Clinic configuration owns selected values and revision. Presets are reviewed recipes, applied idempotently through domain owners. Persist the applied preset identity/version and record links; never silently overwrite customizations when the recipe changes.

Choose the foundational profile during clinic creation. Finalization protects it from ordinary settings edits; it does not prohibit every supported later change. Classify each operation by authority and impact, not a single immutable label on the entire feature:

| Class | Examples / boundary | Change rule |
| --- | --- | --- |
| Shared core | Tenant/patient identity, assigned authorization, source-owned records, work ownership and integrity mechanisms | Always present; no clinic switch. Optional specialty screens are not compulsory just because their supporting core exists. |
| Clinic-managed | Staff assignment, hours, appointment availability, notifications, prices, service availability and form revisions within the selected profile | Authorized clinic roles use supported owning operations and effective/revision rules; no implicit activation of an unselected major module or rewriting completed work. |
| Meta Clinic-managed | Enabling/changing an optional capability for which the application implements a safe, bounded transition | Authorized Meta Clinic team uses scoped, audited product operations after dependency and impact review. Clinic administrators cannot perform this merely by editing settings. |
| FDE-assisted | Unsupported workflow transition, new data mapping, restructuring or custom integration | Forward-deployed engineer (FDE) designs and verifies the specific change under a separate scoped assignment. No generic bypass, routine direct database edits or automatic reset. |

Classify by effect, not just field name. Changing available chairs within an enabled resource model is operational; changing the scheduling model is foundational. A new service is operational only when its requirements fit the finalized profile. A new price does not reprice an existing agreement automatically. Choosing weight loss sets a recipe; merely renaming the clinic does not change its profile.

Setup finalization is a persisted software milestone, not clinical, regulatory, vendor or production approval. Before finalization, draft configuration can be edited and dependencies validated. After finalization, every backend write path enforces its operation's change tier and current permissions. Clinic Setup shows clinic-editable controls, team-managed requests and unsupported/FDE-required changes honestly. Do not rely on hiding controls or imply that a support route is an implemented transition.

A change's tier can depend on existing obligations: initial activation with no affected records differs from disabling a module with stock, reservations or unfinished work. Define enable and disable separately. Assignment, support access and configuration authority do not grant patient-data access or professional authority. Repeated FDE interventions are candidates for a supported Meta Clinic-managed product operation, not a reason to build every possible transition upfront.

Resolve effective configuration on the backend. Keep these questions separate:

1. Is the capability configured/enabled for this service/context?
2. May this actor perform this action now?
3. Are this action's actual patient/service prerequisites satisfied?
4. Is external execution connected and ready, if required?

Return stable reason codes and scoped resolution information for UI controls and Patient Flow. Recheck authority on the server; a visible button or cached capability response grants nothing. Do not pin obsolete employee permissions with historical configuration.

Start with the scope actually needed. Practice-level selection, location-specific resources and service-specific requirements are distinct. Do not add arbitrary cascading overrides until a real requirement defines precedence. Keep permanent configuration separate from temporary release flags. No customer-executable scripts, universal rule language, new form-builder platform or automatically generated all-purpose Clinic Setup UI is selected.

## 4. Controlled changes, not universal switching

Ordinary clinic configuration endpoints must reject protected changes to a finalized foundational profile. A supported Meta Clinic-managed transition uses a distinct authorized operation with exact scope, impact preview, affected-record/open-work analysis, recovery and focused proof. Otherwise route it to a scoped FDE assessment. Do not build a universal conversion engine, silently unlock settings, grant an admin bypass or require a duplicate clinic/patient system as the default workaround. A Meta Clinic-managed operation is a product capability, not a routine SQL-edit procedure.

For permitted operating settings, specify change, disable-new-use and open-work handling where relevant. Preview consequences, then atomically revalidate relevant configuration revision, references and dependencies at apply time. Relevant patient/service writes must likewise reject incompatible stale assumptions without blocking independent work for an unrelated settings edit. These are domain semantics, not a mandatory universal lifecycle enum.

Disabling new use must not erase history or abandon tasks. Existing work may be completed, corrected, canceled or reconciled only under its current action-specific rules; old configuration is not a blanket permission to continue. Show exact conflicts, owner/team and resolution. Re-enabling must not duplicate records, restore canceled work or transmit backlog automatically. Irreversible business effects require explicit correction, not a pretend toggle rollback.

Reject unsupported dependencies/combinations at their boundary. Do not promise that every change is instantaneous, that no migration will ever be needed, or that data with different meanings can be converted automatically.

## 5. Separate definitions, plans, use and facts

Maintain distinct identities for reusable definitions/forms, patient-specific plans/orders, appointments, encounters, notes, performed events and coordination tasks. Not every clinic needs a structured treatment plan. A clinical plan is not an appointment schedule, prescription, inventory reservation or completed treatment.

Version published content whose meaning must survive change. Record explicit use of the exact revision at the applicable appointment/encounter/action, including tenant, patient, actor, time and source relationship. Validate every referenced context; a linked record does not inherit a safe patient/tenant identity merely by association.

Distinguish intended revision for future care from actual revision used. The latest saved draft is not necessarily approved, current or applicable. A new approved revision prompts review of affected future work; it does not silently rewrite completed encounters or prove the new content was used. An encounter can have multiple explicit usage records when the domain requires it. Do not infer usage from timestamps or a single mutable 'current plan' pointer.

Signed/reviewed content retains its exact version and amendment lineage. Copy-forward creates a reviewable draft with source attribution, never a copied signature or newly observed finding. Historical renderers preserve interpretation; current authorization controls access and action. Keep clinical revision, template business version, configuration revision, database schema version and external FHIR resource-history version distinct.

Do not introduce full event sourcing, revisions for every keystroke, a universal polymorphic history table or executable old rule engines. Choose typed lineage/usage relations that enforce the actual domain. Existing care-plan revisions and fulfillment links are candidates for reuse, not constraints or proof of complete longitudinal traceability.

## 6. Typed data; FHIR at defined exchange boundaries

Use relational types, scoped references, constraints and appropriate transactions for identities, money, quantities, units, state and ownership. Use validated, schema-versioned JSON only for bounded variable data. Do not make every domain an arbitrary payload or duplicate the whole schema for each specialty.

Follow [standards-guided development](../development/healthcare-standards.md) for each substantive healthcare change. Record the exact U.S.-applicable guide/package/version, requirement or recommendation, owning data, UI behavior and focused verification. Preserve identifier systems, terminology systems/codes and appropriate units/source. Unknown is not zero, negative or approved.

FHIR informs semantics and mappings; it does not mandate a FHIR-native operational database. Select profiles, terminology dependencies and supported interactions per integration. US Core 9.0.0 research does not upgrade every interface; PAS 2.2.1 has its own dependencies. Must Support is not a universal required form field. Draft requirements differ from action and exchange requirements. Unknown modifier semantics cannot be silently ignored when claiming a valid mapping.

FHIR canonical business versions and resource `meta.versionId`/`_history` are different. Maintain internal revision-use evidence without assuming indefinite remote history access. No conformance, certification or vendor acceptance claim follows merely from naming a FHIR resource.

## 7. Narrow adapters and durable side effects

Keep local clinical/commercial intent independent of vendor transport. Use narrow domain-facing adapters for prescriptions, labs, suppliers, insurance, payments and media where appropriate, not one universal vendor request model that erases their differences.

Track source revision, destination, idempotency identity, attempts and known outcome. Disconnected, prepared, submitted, outcome-unknown, rejected, accepted and fulfilled are distinct meanings; use the subset and state model appropriate to that domain. Simulators use the real domain boundary and retain source labels. Connection alone never sends old work.

Use a transactional outbox or equivalent proven durable mechanism when a local commit must reliably trigger asynchronous work. Do not add a broker or event bus for ordinary local calls. Handle duplicate/out-of-order delivery and stale sources; recheck current action readiness before execution. Reconcile possible external success before retrying or replacing requests. Keep sensitive payloads out of ordinary logs and minimize queued data.

## 8. Projections do not own facts

Future recurrence, chair/resource availability, stock demand and authorization outlook are derived from owned inputs. Retain horizon, timezone, exact dates, source versions, assumptions and calculation time. Missing inputs produce visible uncertainty. Calendar months are not silently converted to fixed weeks.

Keep forecast, tentative hold, confirmed reservation, delivered care, material reservation and actual stock movement distinct. Confirm all required resources atomically under configured capacity rules. A view or computed count cannot authorize a booking or decrement stock. Recompute changed projections and reconcile affected commitments; never rewrite completed care.

Coverage, eligibility and service authorization are separate evidence. Review affected scheduled/planned care, including ordinary appointments without treatment plans. Do not trigger automatic patient outreach solely from an expiration date. Additional blocking/contact policy requires explicit scoped definition. Infusion forecasts and live payer integrations remain future scope, not prerequisites to completing weight loss.

## 9. Enforce with small, complete changes

For each changed capability, document one writer, relevant dependency/transaction boundary, variation point, configuration effect, change tier for each transition, data/revision meaning, exact blocked action and permitted independent work. Update Clinic Setup, the existing matrix and owning tracker row together. Avoid copying a second decision log, task register or matrix.

The first implementation remains [the configured weight-loss journey](../../PATIENT_JOURNEY_PROOF_AND_REFINEMENT.md). Select a clean design for the slice, then prove setup-to-component behavior and finalization, rejection of a clinic-unauthorized protected edit, one permitted clinic-managed change, one continuing patient and prospective version-use history. Identify the team/FDE route for changes the slice does not implement; do not build a full support console or general reconfiguration engine. Check one materially different supported configuration using focused evidence, not ten specialty builds.

Use focused contract/invariant checks and one connected browser proof. Test the relevant denied action alongside permitted independent work; include touched concurrency, retries, tenant/role, money/stock and revision risks. Do not run a full permutation suite or broad launch audit by default. Reassess after 10 cumulative verification minutes under the active development policy; necessary bounded proof may continue with a stated reason.

Revisit this contract when actual clinical workflows break the chosen boundaries, measured runtime needs justify extraction, partner requirements change mappings, or real users/external consumers change compatibility obligations. AI-generated volume and passing static checks are not substitutes for those observations.

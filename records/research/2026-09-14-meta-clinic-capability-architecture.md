# Architecture for a configurable Meta Clinic

## Conclusion

Meta Clinic should be a modular monolith: one Rails application and PostgreSQL operational database, with a React/TypeScript frontend, clear domain ownership and deliberately limited variation points. Specialty presets should assemble capabilities at clinic creation, not create separate applications. Finalization should protect foundational choices from ordinary clinic edits. Later changes belong to explicit clinic-managed, Meta Clinic-managed or forward-deployed-engineer-assisted tiers. Clinic configuration should affect actual actions, forms and components while leaving identity, authorization, accounting and clinical traceability under their respective domain owners.

FHIR should guide healthcare meanings and exchange contracts, not dictate one table per resource or turn the application into a general-purpose FHIR workflow engine. Clinical definitions, patient-specific plans, orders, appointments, tasks and records of performed care need distinct identities and lifecycles. Version-used links should preserve the meaning of completed work without forcing future work to execute obsolete rules.

This is a design recommendation and its rationale. The adopted contract is [Clinic capability architecture](../../docs/architecture/clinic-capability-architecture.md); D-078 in [Decisions](../../APPlyVault/03%20Execution/Decisions.md) records authority. Neither this report nor a standards citation establishes implementation or clinical/vendor acceptance.

## Scope and evidence

Research reviewed on 2026-09-14 covers configurable outpatient software, U.S.-applicable FHIR guidance, source ownership, configuration changes, clinical revision history, asynchronous vendor operations and future resource-based treatment planning. Meta Clinic has no real users. Existing development code, test fixtures and synthetic records are not compatibility requirements and do not determine the target design. Their value is evidence of reusable work and possible failure modes, not a reason to perpetuate a weak abstraction.

The evidence has three distinct strengths. Published HL7 specifications define behavior within their stated conformance scope. Original engineering accounts and architectural literature provide experience and trade-offs, not universal laws. The decisions below are product-specific judgments applying those sources to Meta Clinic. A good architecture reduces the cost of change; it cannot guarantee that no migration, redesign or unforeseen problem will occur.

The reviewed healthcare baseline includes published FHIR R4 4.0.1, US Core 9.0.0/STU 9, and Da Vinci Prior Authorization Support (PAS) 2.2.1. These are deliberately not combined into a claim that all three form one vendor-compatible implementation. Each integration needs its own selected package versions, dependencies, terminology, supported interactions and partner contract. No non-U.S. national profile or foreign clinical policy is adopted.

## 1. What the architecture should optimize

The central risk is uncontrolled variation. If every clinic type introduces its own patient, encounter, balance and inventory machinery, fixes will need to be repeated and the same patient journey will acquire incompatible meanings. The opposite extreme is also dangerous: one generic object with arbitrary fields, transitions and scripts hides domain rules and makes every feature depend on a framework few people can confidently change.

Software-product-line research treats variability as an architectural concern that must be represented explicitly in shared assets. It does not imply that every conceivable variation should be supported.[^1] For Meta Clinic, the useful boundary is a stable set of domain contracts with a small catalogue of implemented capabilities and reviewed combinations.

Evaluate an abstraction against a concrete change: adding chair requirements, replacing a lab adapter, changing a published intake form, disabling new in-house fulfillment, or adding insurance to a cash clinic. A sound boundary keeps the change close to its owner and makes its downstream effects discoverable. Counting packages or minimizing all duplication is not an adequate measure.

The existing technology stack remains suitable because ordinary Rails transactions and relational constraints fit these workloads. This choice is not justified by sunk cost. Replacing the stack would need evidence of a material problem the replacement solves better; configurability by itself is not that evidence.

## 2. Deployment and code boundaries

Microservices offer independent deployment and scaling but introduce network failure, distributed state and operational costs. Fowler's analysis explicitly describes this trade-off rather than treating smaller services as an unconditional improvement.[^2] Meta Clinic does not currently have an established need for separate specialty deployments. A modular monolith keeps cross-domain local operations tractable while preserving the option to extract a boundary later.

The principal ownership areas should be identity/tenancy, clinic configuration, scheduling/resources, clinical care, work coordination, inventory/fulfillment, and commercial/financial records. These are responsibility boundaries, not instructions to create seven engines or databases. A workflow may call more than one owner inside one database transaction when the business action genuinely needs atomic local completion.

Commands change state through the owning operation. Queries may compose authorized read-only data for Patient Flow, encounter context or forecasts. This avoids a false choice between direct cross-domain mutation and requiring every screen to consume an asynchronous copy of every record. A read model can join source data without becoming its writer.

Keep operations named for the work performed and contracts small. Avoid a universal manager that accepts a resource name, arbitrary attributes and a requested status. Share genuinely identical mechanisms such as scoped idempotency, but keep prescription authorization, appointment confirmation and inventory fulfillment semantically distinct. Small presentational duplication can be cheaper than a misleading shared abstraction.[^3]

Shopify's experience with Rails modularization is particularly relevant: a dependency tool cannot choose sensible boundaries, and reorganizing code to satisfy a poorly chosen graph can increase indirection.[^4] Therefore, do not adopt Packwerk, engines or a broad folder migration as the architecture itself. Start with explicit ownership and targeted dependency checks; introduce tooling only against a demonstrated enforcement gap.

## 3. Configuration is a product model, not scattered flags

Separate four axes: specialty, delivery modality, commercial model and operational capabilities. Telehealth-only is a delivery configuration, not a separate patient system. Weight loss does not imply a particular medication, a subscription price, insurance exclusion or in-house dispensing. Infusion scheduling may require resources and recurrence that a simple consultation does not.

A code-owned capability registry should describe stable keys, supported scopes, dependencies, conflicts, configuration validation and available component/operation variants. Clinic-owned configuration stores selected values and a revision. Presets are reviewable starting recipes that create or select typed records through their owners; they are not permanent inheritance that silently changes a clinic whenever a preset is edited.

The recommended binding point is setup finalization. Separate a non-optional shared core from clinic-managed settings, supported Meta Clinic-managed changes and exceptional engineering-assisted transitions. Protecting foundational choices from ordinary clinic edits reduces the transitions the initial product must support. Services, staff, hours, prices and clinical forms still change, so permitted operations need owned rules. This tiering is a Meta Clinic product decision, not an HL7 requirement.

Classify the transition rather than the whole feature: enabling inventory initially differs from disabling it with outstanding stock obligations. Adjusting chair hours differs from replacing the scheduling model. Meta Clinic's team should perform supported changes through scoped, audited product controls; unsupported mappings, restructuring or integration changes require a forward-deployed engineer (FDE). Repeated engineering interventions can become supported product operations. Neither unrestricted administrator toggles nor routine direct database edits are an appropriate default. Do not introduce a universal reconfiguration engine until concrete transitions justify it.

Permanent product configuration should be distinguished from temporary development/release flags. Feature-toggle literature describes different lifetimes and decision points; treating every variation as a boolean check spreads complexity.[^5] Meta Clinic should resolve effective configuration on the backend and expose an explanation to the frontend, while separately checking the actor's current permissions and the action's patient/service prerequisites.

The registry must remain modest. It should not become a no-code programming language, dynamically load customer code, or automatically render every administrative screen. Real specialized controls are appropriate for resource requirements, terms and clinical forms. Generic metadata works well for simple selections; it is a poor substitute for thoughtful domain UX.

Unsupported combinations must be explained at the dependent setting or action. Turning on telehealth does not mean a video provider is connected. Turning off insurance must not disable local cash billing. Changing a form must not silently reinterpret an answer that was captured under an earlier question definition.

## 4. What HL7 FHIR guides—and what it does not

FHIR's architectural overview addresses healthcare information and interoperability using connected resources. It does not prescribe Rails namespaces, a database persistence strategy, microservices, or a particular clinic-configuration engine.[^6] Resource boundaries are useful semantic input, not automatically application module boundaries.

The R4 workflow material distinguishes definitions, requests and events: reusable descriptions of possible work, intent for work to occur, and evidence of what occurred.[^7] That distinction directly helps avoid treating a plan as performed care. Task can coordinate fulfillment without replacing the source clinical or commercial record. Meta Clinic's ownership matrix remains a product contract, not something FHIR generates for us.

US Core requirements apply to specified exchange behavior. Its Must Support interpretation distinguishes supported data from data that must always appear; it is not a command to make every supported element a compulsory intake question.[^8] Clinical prerequisites still need an applicable source or explicit clinic policy. Internal draft saving should not depend on satisfying every eventual export requirement.

The US Core QuestionnaireResponse profile supports form/question identity, patient, response status, gathered date and provenance. Its guidance also allows answers to be extracted into a searchable local store.[^9] This supports versioned intake with typed answer values and deliberate mapping to clinical observations. It does not justify copying every answer into a clinical fact automatically. Patient reporting, clinician review and calculated measurements remain distinguishable.

US Core Provenance supplies a U.S.-applicable basis for identifying the target information, timing and responsible sources.[^10] An audit trail of access or database edits is not by itself the clinical explanation of which plan was used. Those concerns should cooperate without being conflated.

Structured Data Capture is relevant through US Core's QuestionnaireResponse relationship. Its standalone STU4 landing page did not return usable content during this review; no independent SDC implementation or version-conformance claim is made. Before implementing advanced form extraction or behavior, review the exact published dependency selected for that interface.

## 5. Use versioning selectively and explicitly

The treatment-note example identifies a real architectural need: an appointment must show the content actually used, not whichever content happens to be current when the chart is opened years later. However, a note, a reusable template and a patient treatment plan are not interchangeable objects.

The internal model should distinguish these concepts:

| Concept | Identity and change rule |
| --- | --- |
| Reusable form or plan definition | Stable definition identity; published revisions; new drafts do not change issued content |
| Patient-specific plan/order | Patient-scoped identity and reviewed revisions, with status and effective applicability |
| Planned appointment use | Explicit intended revision or unresolved planning reference; eligible for visible reconciliation |
| Encounter/action use | Exact revision actually reviewed/used, actor and time; may contain multiple explicit usage records |
| Encounter note or performed event | Its own authored record, signature/review linkage and amendment history |
| Software/configuration schema | A separate evolution concern; not the clinical document's revision number |

FHIR supports version-specific resource references using `_history`, and separately canonical references with a business version. The latter is not the server's `meta.versionId`.[^11] This supports the distinction but does not prescribe Meta Clinic's tables or guarantee external history retention. The application should own the retained revision relationship necessary to interpret its records rather than depending on a remote server always resolving an old URL.

For example, a first visit uses plan revision A. A clinician drafts B, then approves it for future work. The first visit remains linked to A. Future appointments show whether their planned use needs review; they do not silently become evidence that B was used. At the next action, the system records the actual applicable revision. If the clinician changes the plan during that encounter, multiple explicit use records may be necessary rather than one mutable encounter-wide pointer.

Do not infer the version used by comparing timestamps or selecting the highest revision. Effective time, recorded time and approval are different. Likewise, copying a note forward must remain a reviewable draft derived from its source; it must not copy a signature or make old findings look newly observed.

This is not a recommendation for full event sourcing or recording every keystroke. Published clinical content and authoritative transactions need appropriate revision/correction semantics. Ordinary editable configuration drafts do not need the same machinery. Historical rendering should support retained content without preserving an executable copy of every old rule engine. Current authorization always controls access and action; an old configuration never resurrects a revoked privilege.

## 6. Capability changes and development freedom

There are two separate problems: redesigning today's development database and supporting future clinic changes inside the product. The first can use a bounded replacement or an explicitly approved synthetic-data reset when that is cleaner. It should not accumulate adapters merely to retain disposable fixtures. The second must preserve meaning and resolve outstanding obligations once meaningful product records exist.

An ordinary settings endpoint should reject structural edits once setup is finalized. A separately supported structural transition, or a permitted operating-setting change, should preview affected services, references, drafts and open work as appropriate. Applying it must revalidate the relevant revision and dependencies atomically; a preview cannot authorize a stale later write. Disabling a service's new use, finishing existing work, correcting history and viewing history are separate permissions and policies. Disabling new use does not automatically delete its tasks; nor does old work guarantee that every action remains permitted under current policy.

Re-enabling a connection or service must not replay a backlog, duplicate setup records or revive canceled work. Some changes can apply immediately, some require reconciliation, and some combinations are unsupported. Product-managed transitions are the target—not the promise that any module can be swapped instantaneously with no consequences.

For future deployed systems, expand/migrate/contract is an available change strategy: add the new representation, transition consumers/data, then retire the old one.[^12] It is not imposed on every local development change. Even in development, reset targets and side effects must be explicit; secrets, unrelated work and external resources are not disposable test data.

## 7. Persistence and vendor preparation

Use typed relational records and constraints for important identities, relationships, amounts, units, state and ownership. Reserve schema-versioned JSON for bounded configuration, questionnaire answers or justified extensions. Do not make all medical, financial and inventory records arbitrary JSON or an entity-attribute-value model merely because clinics differ.

An adapter boundary separates a domain operation from a vendor's transport and representation. This applies the original ports-and-adapters principle without requiring an interface and repository wrapper around every Rails class.[^13] Preserve normalized local intent, destination, source revision, request identity, attempts and known outcome. A synthetic simulator should exercise the same domain boundary while remaining clearly distinguishable from external execution.

When a committed local change must reliably produce asynchronous work, use a transactional outbox or an equivalent existing durable mechanism. AWS's pattern addresses the failure between committing business data and publishing its notification; it also requires handling duplicate delivery.[^14] This is not an AWS provider selection, an exactly-once guarantee, or a reason to introduce a message broker for all local actions.

Retries must be scoped to the original operation, tenant and source version. A timeout can mean the remote system accepted the request but the response was lost. Reconcile before replacing it. A later event cannot blindly overwrite a newer local decision. Check current action authority and readiness before execution, and minimize sensitive payloads in diagnostic logs and queue metadata.

Vendor readiness cannot be completely prebuilt without vendor contracts. FHIR exchange, prescription transmission, supplier ordering and insurance can use different standards and identifiers. Prepare the meaningful local data now; select and validate exact mappings later. An unconnected operation stays prepared or disconnected, never transmitted or accepted by inference.

## 8. Infusion as a boundary test, not an immediate build

Infusion is a useful stress test because clinical intent, resources, inventory and insurance influence each other without sharing one lifecycle. A recurrence such as twice weekly over three calendar months is not automatically 24 visits: actual dates, timezone, selected days, exceptions and the endpoint convention matter.

FHIR Schedule distinguishes availability associated with resources from appointments and describes checking multiple required schedules.[^15] Meta Clinic must add its own booking constraints and atomic confirmation. A chair forecast is not a chair reservation; a reservation is not attendance; a performed treatment is not proof of take-home dispensing or a supplier receipt.

A future projection should identify source plan revision, service, material assumptions, resource requirements, horizon and calculation time. Missing duration or unit mapping produces an explicit unknown, not zero demand. Changed plans recompute projections and reconcile affected tentative/confirmed work rather than rewriting completed events. Stock reservations and actual ledger movements stay separately owned.

PAS 2.2.1 includes structures for authorization response details and time periods, within a guide with its own dependency versions.[^16] Coverage dates, service authorization, approved quantities, consumption and payer adjudication are separate facts. A response completing processing does not by itself mean approval. These meanings must be mapped to the actual partner contract before transmission or automated decisions.

Review should be attached to affected planned care. An ordinary clinic's booked visit can need authorization review even without a recurring plan. Conversely, an expiration date with no affected care should not automatically create patient outreach. Additional blocks and outreach timing are explicit policy, not an architectural default.

## 9. Five-year change tests

| Future change | Intended local change | Failure this design avoids |
| --- | --- | --- |
| Weight-loss clinic adds insurance | Explicit supported structural reconfiguration, then adapter setup; not a routine settings toggle | Rebuilding the clinic as an insurance-specific tenant type or silently changing financial assumptions |
| Virtual clinic begins physical visits | Reviewed structural transition adds location/resources and modality support | Re-registering patients or requiring chairs for purely virtual appointments |
| Published form or treatment plan changes | New revision; explicit future-work reconciliation and historical use links | Old answers or visits appearing to use today's content |
| In-house fulfillment is disabled | Stop disallowed new work; reconcile owned outstanding obligations | Hidden prescriptions, abandoned tasks or duplicate external fulfillment |
| Lab or supplier vendor changes | New mapping/adapter and destination review | Vendor payload shape spreading through every UI and domain |
| Resource booking becomes a scaling bottleneck | Measure and optimize its owned boundary; consider extraction if justified | Paying distributed-system costs years before the need exists |

These are design tests, not predictions that each feature will ship. They favor reversibility while recognizing that changing the meaning of a clinical fact, financial posting or external side effect is not the same as replacing a component.

## 10. Build sequence and confidence limits

First prove one real configured weight-loss journey, not ten thin specialty demos. Establish the capability decision boundary and version-use semantics only where that journey needs them. Inspect the existing implementation to decide reuse, refactor or replacement; document that choice briefly instead of treating source compatibility as mandatory.

Second, use a materially different configuration as a bounded counterexample: telehealth-only without room requirements, or cash care with insurance disabled. Prove that finalization blocks a clinic-unauthorized structural edit while a permitted operating change works against fresh synthetic records. Identify the supported team/FDE route without building a universal support console. This is prospective behavior, not a requirement to migrate every old fixture. Defer general structural reconfiguration, infusion forecasting and actual payer/vendor integrations to their own scoped assignments.

Keep verification proportional. The critical checks concern cross-clinic/role denial, concurrent configuration/booking writes, source-version changes, retries, money/stock invariants and visibility of independent work. One connected browser journey establishes what isolated tests cannot; repeating all unchanged browser permutations does not add proportional confidence. Combinatorial testing can reduce combinations, but NIST cautions against assuming pairwise coverage alone is sufficient.[^17]

Frontend component replacement also needs draft-context care: React associates state with component position and identity, so unmounting or changing keys can reset it.[^18] Save meaningful drafts through the owning backend, bind them to patient/encounter/form context, and show conflicts. Do not hide clinical drafts in an unreviewed browser-storage workaround.

The largest remaining uncertainties are correct current domain boundaries, complete appointment-to-revision traceability, justified variation points, real partner mappings and usability for clinic staff. None is resolved by the existence of this document. The accepted path is a clean target, small complete increments and evidence that those increments preserve their intended meaning.

## Sources

All web references below were reviewed for the bounded claims above on 2026-09-14. Published version URLs are used where available. Practitioner publications support trade-off reasoning, not clinical requirements or standards conformance.

[^1]: Felix Bachmann and Paul Clements, CMU Software Engineering Institute, [Variability in Software Product Lines](https://sei.cmu.edu/library/variability-in-software-product-lines/), CMU/SEI-2005-TR-012, 2005. Software-product-line variability and shared assets.
[^2]: Martin Fowler, [Microservice Trade-Offs](https://martinfowler.com/articles/microservice-trade-offs.html), 2015. Original practitioner analysis of deployment benefits and distributed-system costs.
[^3]: Sandi Metz, [The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction), 2016. Abstraction versus duplication trade-off.
[^4]: Shopify Engineering, [A Packwerk Retrospective](https://shopify.engineering/a-packwerk-retrospective), 2024-02-07. Rails dependency tooling, boundary-selection risks and static-analysis limits.
[^5]: Pete Hodgson, [Feature Toggles](https://martinfowler.com/articles/feature-toggles.html). Toggle categories and decision separation; not a vendor/tool recommendation.
[^6]: HL7, [FHIR R4 Architectural Overview](https://hl7.org/fhir/R4/overview-arch.html), 4.0.1, informative page. Information architecture and interoperability scope; base standard used through U.S. implementation guides.
[^7]: HL7, [FHIR R4 Workflow](https://hl7.org/fhir/R4/workflow.html), 4.0.1. Definition, request and event patterns; informational design guidance, not a prescribed internal workflow engine.
[^8]: HL7, [US Core Must Support](https://hl7.org/fhir/us/core/STU9/must-support.html), 9.0.0/STU 9, U.S. Interpretation of exchange support obligations.
[^9]: HL7, [US Core QuestionnaireResponse](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-questionnaireresponse.html), 9.0.0/STU 9, trial-use, R4, U.S. Mandatory/Must Support and profile-specific guidance.
[^10]: HL7, [US Core Provenance](https://www.hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-provenance.html), 9.0.0/STU 9, trial-use, R4, U.S. Target, time and lineage requirements.
[^11]: HL7, [FHIR R4 Resource References](https://hl7.org/fhir/R4/references.html), 4.0.1, normative references page. Version-specific literal references and canonical business versions; subject context is not inherited through arbitrary references.
[^12]: Martin Fowler, [Parallel Change](https://martinfowler.com/bliki/ParallelChange.html). Expand/migrate/contract compatibility technique, not mandatory development-data preservation.
[^13]: Alistair Cockburn, [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture). Original ports-and-adapters description; application/technology boundaries.
[^14]: AWS Prescriptive Guidance, [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html). Durable dual-write handling and duplicate delivery; no AWS selection implied.
[^15]: HL7, [FHIR R4 Schedule](https://hl7.org/fhir/R4/schedule.html), 4.0.1, trial-use. Sections 12.12.1.1–3: availability, actors and multi-resource checking; operational constraints remain application-owned.
[^16]: HL7, [Da Vinci PAS Claim Response](https://hl7.org/fhir/us/davinci-pas/2.2.1/en/StructureDefinition-profile-claimresponse.html), 2.2.1/STU 2, trial-use, R4, U.S.; active 2026-03-27. Formal response elements and authorization period structures; partner applicability unverified.
[^17]: NIST, [Combinatorial Testing Methodology: Do's and Don'ts](https://csrc.nist.gov/Projects/automated-combinatorial-testing-for-software/software-testing-methodology/dos-and-don-ts-of-testing). Limits of pairwise-only assumptions and interaction testing.
[^18]: React documentation, [Preserving and Resetting State](https://react.dev/learn/preserving-and-resetting-state). Component identity and state lifetime; frontend behavior, not a clinical-storage recommendation.

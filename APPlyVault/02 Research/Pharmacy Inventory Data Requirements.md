---
type: research
status: broad-scope-confirmed-design-proposed
updated: 2026-09-13
---
# Pharmacy Inventory Data Requirements

Home: [[00 Home]] · Product: [[Clinic Workspace]] · Model: [[Data Modeling]] · Diligence: [[Texas Diligence]] · Sources: [[Source Register]] · Tasks: [Meta Clinic Implementation Tracker](../03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md)

## Recommendation and scope

**Build the inventory record around identifiable products, lots/containers, locations, receipts, and an attributable movement history. Keep purchasing, physical stock, and patient-linked medication use separate but reconcilable.** A drug catalog plus a quantity field is insufficient for useful pharmacy inventory management.

Requested 2026-08-30: due diligence on necessary/relevant data collection, clarified to prioritize inventory management, especially pharmacy. This is a proposed collection specification, not a prescribing system, legal opinion, pharmacy license determination, or authorization to handle real records. Broader consultancy data collection is secondary. No clinic formulary, supplier records, licenses, or actual medication workflow has been provided for review.

**Subsequent founder direction, D-028:** assume clinics will want the option of any pharmacy setup and develop the product from that broad scope. Do not require selection of one clinic operating model before designing the shared foundation. Broad support is the accepted product direction; the capability decomposition, logical records and delivery sequence below are proposed implementation details. This is a design assumption, not evidence that every customer wants or may operate every setup.

“Core” below means recommended for the product's operational usefulness, **not universally required by law**. Conditional requirements depend on the actual activity, product, facility, professional authority, and applicable program. All development examples remain wholly synthetic; no real patient-linked records enter this vault or prototype. Any future real-data system still requires L-05 and the applicable professional/operational gates outside this workspace.

**Implementation update:** D-031 authorizes PostgreSQL and the shared inventory core. [[PostgreSQL and Inventory Foundation]] records tested units, delivery provenance, shared ledger, overlapping holds, counts and action permissions, plus the unimplemented configuration/clinical extensions. The field catalog below remains the broader specification, not a claim that every field or workflow is delivered.

## Configurable pharmacy capabilities

Use a shared inventory foundation with composable capabilities, rather than one mutually exclusive pharmacy-type switch or a different inventory system for each setup. A clinic may combine capabilities, with narrower location, product, professional-role and operating-entity scopes. The current one-clinic-per-login rule remains unchanged. A separate pharmacy operator or record custodian is not automatically another location under the clinic's permissions.

| Capability family | Additional records and collection points | Design boundary |
| --- | --- | --- |
| Shared inventory and purchasing | Product/package identity, verified units, supplier/receipt lines, lots, locations, ownership, movements, counts, holds, orders/invoices/credits and replenishment inputs | Required foundation for every stock-holding configuration. A prescription-only workflow need not pretend the clinic owns stock. |
| Clinic administration and practitioner supply | Actual administration/supply event, responsible professional, order or other approved authority, quantity/unit, lot/container allocation and waste; recipient linkage only in the protected workflow | Distinct workflows even when they consume the same stock. A prescription written for an outside pharmacy does not decrement clinic inventory. |
| Licensed pharmacy dispensing | Pharmacy/operator and professional references, prescription versions, fills/partial fills/refills, preparation/check/release events, labels, pickup/delivery and cancellation/reversal evidence | Reserve a separate protected dispensing record and state machine. Prescribing, filling, checking and handing over are distinct events; this is not a complete pharmacy-practice specification. |
| Cold chain, vaccines and opened containers | Storage/sensor history, excursion cases, manufacturer instruction versions, opening/reconstitution/thaw times, container-specific use-by limits and disposition | Can attach to administration or dispensing. Rules apply to the actual product/container, not a universal vaccine or vial default. |
| Controlled substances | Registrant/site and schedule references, acquisition/disposition detail, formal count snapshots, custody and discrepancy review, applicable loss/destruction and reporting evidence | An overlay on the relevant workflows; ordinary inventory access does not grant controlled-drug authority. Reporting/export remains separately scoped. |
| Drug tracing and recalls | Partner-verification evidence, transaction documents/messages, package identifiers, receipt associations, verification/investigation cases, affected-stock and notification reconciliation | Applicability and document versions travel with the transaction. A tracing integration is not a public drug-catalog import. |
| Repackaging and compounding | Source lots/quantities, formula/instruction version, preparation record, output batch/container genealogy, yield/waste, preparer/checker and release evidence | Separate sterile, nonsterile and hazardous-handling profiles as needed. Their detailed safety, quality and facility requirements remain a specialist requirements workstream. |
| Samples, consignment and program stock | Provenance, owner/funding category, permitted-use rules, receipt acknowledgment and disposition | Can coexist with other capabilities; zero purchase cost must not erase quantity, ownership or traceability. |
| Transfers, central supply and delivery | Sender/receiver and operator, ownership/custody change, shipment contents, in-transit location, dispatch/receipt discrepancy and temperature evidence where relevant | Internal relocation, cross-entity supply and patient delivery are different transaction types. Recording them does not make APPly a drug distributor. |

Institutional, specialty, remote/mail-delivery and other future configurations remain within the broad design ambition. Add a reviewed profile and any missing capability instead of assuming this initial matrix is exhaustive or announcing universal support. Existing cash-pay primary-care / North Texas market direction is unchanged; broader pharmacy configurability does not itself expand the launch consultancy's promised service package.

### Configuration and data collection rules

Keep three separate facts: **product capability exists**, **clinic requests/configures it**, and **a scoped workflow is authorized for use**. A feature flag or a completed configuration form cannot substitute for any of them.

- Version each operating profile: clinic, operator/custodian reference, location scope, selected activities/product categories, capability dependencies, policy versions, reviewer/evidence references, effective interval and status. Proposed states are draft, synthetic-only, approved-for-defined-use, suspended and retired; no current clinic receives an approved state from this note.
- Require server-side checks for both the clinic capability and the individual's action/location permissions. Record the profile/policy version used by each event. A later profile edit must not reinterpret historical quantities, roles or approvals.
- Collect fields only when the selected activity needs them. Distinguish missing, not yet collected and reviewed-not-applicable; do not force empty controlled-drug or patient fields on an ordinary supply receipt. Unknown safety-critical facts must block the affected action, rather than default to approval.
- Restrict identifiers and clinical details to the protected dispensing/clinical record. Generic inventory screens, movement reasons, audit messages and APPly billing exports should not contain patient names or prescription content. Even an opaque patient-use link remains sensitive and needs restricted access.
- Suspending a capability stops new affected actions while preserving stock custody, history, required record access, reconciliation and the approved return/disposal path. It must not delete records or strand an unresolved recall. Removal and reactivation need attributable decisions.

Collection should follow the work: verify catalog/package data at setup; capture lot/expiry/condition and quantities at receiving; capture opening/temperature events when they occur; post actual use, movement or disposition once; reconcile counts and purchasing evidence separately. Supplier feeds, barcode capture and document extraction may assist later, but ambiguous matches go to review and no external transaction is sent merely because a record was imported.

The logical record extensions are in [[Data Modeling#Inventory and commercial boundary]], and the proposed delivery order and acceptance criteria are in [Meta Clinic Implementation Tracker](../03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md). These extend the requirements baseline; they do not claim the implemented inventory foundation covers the full matrix.

## First establish what pharmacy means here

This is now a **per-clinic configuration and activation question**, not a prerequisite to designing the broad product. Support the options above while keeping each real operator's classification and authority evidenced separately.

| Operating situation | Collection consequence |
| --- | --- |
| Clinic purchases medication for administration on site | Track receipt through usable stock, administration, waste, and recall. Patient administration belongs in the clinical record, with restricted links to consumed stock. |
| Practitioner supplies samples or medication for use at home | Separately establish the lawful NP/PA/physician pathway, permitted charges, labeling, custody, and documentation. Prescriptive authority does not automatically authorize every dispensing model. |
| Licensed pharmacy fills prescriptions | Add pharmacy/license and pharmacist responsibilities, prescription/fill records, applicable drug tracing, and reporting workflows. It is a materially larger scope than stock control. |
| APPly purchases, takes title to, warehouses, or resells drugs | Obtain a separate role/licensing review before proceeding. Software that records a clinic's purchases does not by itself establish authority to distribute drugs. Preserve buyer, seller, owner, and custodian as distinct facts. |

Texas's licensing guidance distinguishes Class A community pharmacies from Class D clinic pharmacies and explicitly excludes a physician's office from Class D licensing. Do not assume that a room called “the pharmacy” establishes a pharmacy classification. [TSBP licensing; S-24](https://www.pharmacy.texas.gov/applicants/new-pharmacy.asp).

Proposed applicability record: clinic/legal operator, physical site, activity (purchase/store/administer/provide/dispense/transfer), professional and facility license references, controlled-drug registration if relevant, authorized roles, product categories, reviewer, supporting authority, review date, and recheck trigger. Keep confidential originals in approved controlled storage. Unknown classifications remain unknown; a software checkbox cannot grant professional authority.

Provider and professional review now has a companion agenda: [[Pharmacy Provider and Counsel Questions]]. Its 60 open questions connect the proposed collection to licensing, NP/PA authority, patient charges, APPly procurement/fees, storage, tracing, controlled drugs, compounding, privacy and continuity. The corresponding implementation task tracks the review; no answer or clearance is inferred from this data specification.

## Core collection dictionary

These are proposed fields and capture points. Manufacturer labeling, supplier documents, physical observations, and approved procedures supply operational facts; a public directory cannot supply a clinic's actual stock.

| Record / capture point | Data to collect | Purpose and design rule |
| --- | --- | --- |
| **Product and package** — catalog setup | Internal product ID/SKU; brand/generic name; active ingredient(s), strength and strength unit; dosage form; route; package description; manufacturer and labeler as distinct fields; package NDC and identifier scheme; Rx/OTC classification; controlled schedule with source/review date if applicable; active status | Distinguish different strengths, presentations, and pack sizes. An NDC identifies a listed product/package, not a particular lot or physical container. Keep source/version and who verified the catalog entry. |
| **Units and conversions** — catalog setup and receipt | Order unit, stock base unit, units per package, container volume where applicable, conversion factor and effective version, permitted decimal precision | Count tablets, mL, vials, and cartons explicitly. Do not infer dose from package count or convert drug mass to volume without verified concentration. Preserve the conversion used by each historical transaction. |
| **Lot and individual container** — receiving/opening | Product ID, manufacturer lot, labeled expiry and its printed precision, receipt references; optional package serial/GTIN; container ID when different containers can have different opening/use-by histories | Separate one manufacturing lot from its multiple receipts, storage locations, and opened containers. The same lot can arrive at different prices from different suppliers. Do not put the only supplier/cost record on the lot. |
| **Location and ownership** — receiving/moving | Clinic, site, cabinet/refrigerator/bin, owner/custodian, stock category (purchased/sample/consigned/public-program where relevant), location history | Know where affected stock was during a recall or temperature event. A storage location is not a tenant. Do not pool different clinics' ownership or imply transfer authority. |
| **Supplier and receipt** — each delivery | Supplier ID and authorization-verification reference/date where applicable; PO/line, shipment and invoice references; delivered/accepted/rejected quantities and units; lot/expiry; receipt time; receiver; package condition; discrepancy/hold reason; cost/currency | Reconcile what was ordered, arrived, and was accepted. Split a delivery across lots. Preserve a controlled document reference; invoice numbers, terms and attachments can be confidential business information. |
| **Stock movement** — each physical event | Clinic, lot/container, source/destination, signed quantity and unit, event type, occurred-at and recorded-at, actor, reason, source transaction ID, retry key, reversal/correction reference | Distinguish receipt, internal transfer, administration, dispensing, waste, supplier return, and count correction. Append attributable events rather than silently overwriting balances. An order alone does not add physical stock. |
| **Stock condition and holds** — on discovery and resolution | Hold ID/type, affected lots/containers/quantity/locations, reason and source notice, discovered-at, responsible reviewer, resolution evidence, release/disposal authorization and timestamps | Quarantined, recalled, damaged, expired, or otherwise restricted stock can remain physically present but unavailable. Multiple simultaneous holds must all be resolved before release. |
| **Physical count and reconciliation** — receipt verification and approved count cadence | Scope, cutoff time, expected balance, observed quantity/unit, count method, counter, variance, recount, explanation, approving role, correcting movement | Preserve observations even if they disagree with the system. Cycle counts support accuracy; they do not replace any applicable formal inventory. Configure cadence by the approved operating profile. |
| **Purchase and financial events** — order through credit | Buyer/seller, PO and line ID, requested/approved/placed/cancelled/received/invoiced/credited events, quantity, unit price, discounts, tax, freight, currency, source IDs and reconciliation status | Needed for procurement and APPly's inventory-value fee basis. Supplier returns and credits are separate events. Historical prices must not change when today's catalog price changes. |
| **Replenishment inputs** — observed over time | Usable stock, reservations, open-order quantities, actual supplier lead times, minimum order/pack size, consumption by period, unmet demand/stockout periods, approved minimum/target levels, expiry exposure | Support reorder recommendations and cash planning. Sparse history is unknown demand, not zero. No automatic substitution, ordering, or spending authority is implied. |

Proposed balance definitions: **physical on hand** is the posted stock ledger; **usable** excludes the union of all applicable holds and expired/use-by-lapsed containers; **available** is usable less valid reservations. Do not subtract the same held stock twice. A paired internal transfer conserves stock; a cross-entity transfer needs its own approved transaction and documents.

Use exact decimal quantities/money, explicit units/currency, immutable source references, and clinic-scoped relationships. A single lot may supply multiple uses, and one use may consume multiple lots; support allocations rather than one overwritable lot field. The implementation controls in [[Data Modeling]] remain proposals requiring validation.

## Conditional collection

| Trigger | Additional proposed data / boundary |
| --- | --- |
| Opened, punctured, reconstituted, or thawed container | Container-specific transition time, preparer, applicable instruction/version, calculated beyond-use date/time, reviewer, and any later manufacturer dating notice. Use the earliest applicable limit; do not apply a universal “28 days.” |
| Refrigerated/frozen products, especially vaccines | Storage device and sensor ID, calibrated status/reference, timestamped readings and units, monitoring gaps, excursion interval/extremes, affected inventory, response, manufacturer/program advice and disposition. A missing reading is not an in-range reading. |
| Patient administration or take-home dispensing | In the approved clinical/dispensing system: patient and order/prescription reference, prescriber and administering/dispensing professional, actual product/quantity/unit/time, lot/container allocations, and required clinical/label information. Define one stock-posting event so an order, fill, and administration do not all decrement the same stock. This linkage remains sensitive even if it uses UUIDs. |
| Controlled substances | Registration/location and schedule; accountable acquisition/disposition records; formal inventory snapshots with required count detail; discrepancy investigations; applicable order, loss and destruction evidence. Scope verification, professional signoff, and reporting are separate from inventory permission. |
| DSCSA-covered pharmacy transactions | Trading-partner verification, transaction information/statement and retrievable evidence; package identifiers where applicable; source-to-receipt association, exceptions, verification requests/results, suspect-product investigation and notification records. A scanned barcode alone is not the traceability record. |
| Repackaging or compounding | Source ingredient/product lots, input quantities, resulting batch/container genealogy, preparation and approved expiry/BUD basis, preparer/checker, release and quality evidence. This is a separate requirements review; no USP-compliant compounding workflow is specified here. |
| Samples, consignment, or publicly funded stock | Provenance, ownership/funding class, permitted use, receipt/acknowledgment and disposition references. Track inventory even where acquisition cost is zero. Do not assume free stock is eligible for fees or interchangeable with purchased stock. |
| Return or disposal | Distinguish supplier return, patient-returned material, unused stock, and administration waste; record quantities, reason, custody transfer, authorized recipient, shipping/manifest/certificate references, credit and final disposition separately. Do not automatically restock patient-returned medicines. |

CDC's **July 2026** toolkit supports vaccine receipt/accounting, temperature-event documentation, and product-specific BUD tracking. Its recommendations and VFC program requirements are distinguished in the document; participation is not assumed. A temperature excursion calls for segregation and review, not automatic destruction or release. [Current toolkit, sections 3–4; S-35](https://www.cdc.gov/vaccines/hcp/downloads/storage-handling-toolkit.pdf). Product-specific storage and dating instructions must come from the current manufacturer/FDA source. [CDC source guidance; S-35](https://www.cdc.gov/vaccines/hcp/storage-handling/).

## Regulatory findings that change the model

### Controlled-drug records and formal counts

DEA's published 2023 practitioner manual describes initial and at-least-biennial inventory, container/form/quantity detail, count-method rules, separate Schedule II records, and at least two-year federal retention for required records. It also describes activity-specific recordkeeping exceptions. Apply these to the actual registrant/activity, not indiscriminately to every clinic. [DEA manual, section V; S-26](https://www.deadiversion.usdoj.gov/GDP/%28DEA-DC-071%29%28EO-DEA226%29_Practitioner%27s_Manual_%28final%29.pdf).

Texas's board compilation §291.17 specifies **annual** controlled-substance inventory for Class A/A-S, C/C-S and F pharmacies, plus event-triggered counts; the Class C/C-S Schedule II perpetual-inventory provision should not be generalized to every setting. §291.34(i) identifies supplier invoices, credits and disposition records; its staff-identifier log has a seven-year retention provision. Thus neither a universal biennial schedule nor a universal two-year deletion rule is appropriate. [TSBP rules, selected §§291.17 and 291.34; S-25](https://www.pharmacy.texas.gov/files_pdf/TSBP%20Rules_MASTER%20FILE.pdf).

For Texas-licensed pharmacies, TSBP states that dispensed Schedule II–V records are reported to PMP by the next business day. A stock adjustment is not that submission. If this workflow is in scope, add the approved reporting specification, acknowledgments, rejection/correction handling, and deadline evidence within the protected dispensing system. [Texas PMP; S-37](https://www.pharmacy.texas.gov/PMP/).

### Drug tracing has both applicability exceptions and a recent extension

DSCSA addresses specified prescription products, trading partners and transactions; it does not cover every item in a clinic inventory. FDA lists exclusions and distinguishes stock replenishment from transfers for a specific patient's prescription. [FDA tracing FAQ; S-30](https://www.fda.gov/drugs/drug-supply-chain-security-act-dscsa/drug-supply-chain-security-act-product-tracing-requirements-frequently-asked-questions).

Section 582(d)(5) contains a usual-professional-practice exception for specified licensed practitioners from paragraphs (d)(1) and (d)(4). **Do not expand that into a blanket exception for a separately licensed pharmacy, all DSCSA provisions, or distribution/resale.** The precise entity/activity needs review. [FDA reproduction of enacted text, §582(d)(5); S-33](https://www.fda.gov/drugs/drug-supply-chain-security-act-dscsa/title-ii-drug-quality-and-security-act).

For covered pharmacies, FDA describes retaining tracing documentation for six years and investigating/quarantining suspect products. [FDA pharmacist guidance; S-31](https://www.fda.gov/drugs/drug-supply-chain-security-act-dscsa/pharmacists-utilize-dscsa-requirements-protect-your-patients). Applicable illegitimate-product notification is triggered by a determination, with a 24-hour deadline; record discovery, determination, responsible reviewer, notifications and acknowledgments separately. No reporting is authorized by this note. [FDA notification guidance; S-34](https://www.fda.gov/drugs/drug-supply-chain-security-act-dscsa/notify-fda-illegitimate-products).

**Current-date finding:** FDA's letter issued **2026-08-06** grants specified small-dispenser exemptions for **2026-11-27 through 2027-11-27**, following the prior exemption through 2026-11-27. Eligibility for the new period uses the owning corporate entity's total of no more than 25 full-time licensed pharmacists/qualified pharmacy technicians as of 2026-11-27; it is not simply staff at one location. The relief is limited to listed requirements and does not suspend the remaining obligations. Preserve eligibility evidence and applicable date/version rather than hard-coding “small pharmacy exempt.” The letter also notes that exchanging transaction history ceased to be required in 2023; retain required historical evidence without demanding a new legacy history document on every receipt. [FDA exemption letter; S-32](https://www.fda.gov/media/194424/download?attachment=).

Recommendation: retain structured identifiers and document associations now; choose supplier interoperability/EPCIS or a tracing service only after the scope and interfaces are established. This is not approval to build or buy a tracing network.

### Disposal needs more than a negative quantity

EPA's pharmaceutical-waste framework depends on waste and facility classifications. Its hazardous-pharmaceutical sewer prohibition applies to healthcare facilities, including very small quantity generators. Record a reviewed disposal route and evidence, not just “discarded.” DEA stock disposal and patient take-back are also different workflows. [EPA FAQ; S-36](https://www.epa.gov/hwgenerators/frequent-questions-about-management-standards-hazardous-waste-pharmaceuticals-and), [DEA manual, section V; S-26](https://www.deadiversion.usdoj.gov/GDP/%28DEA-DC-071%29%28EO-DEA226%29_Practitioner%27s_Manual_%28final%29.pdf). Texas environmental applicability and actual disposal contracts remain unreviewed.

## What can be prefilled versus observed

**Catalog prefill:** FDA NDC/openFDA can help with listed names, ingredients, forms, labelers, and package descriptions. Inclusion is not FDA approval or independent verification, and the directory is not exhaustive. Match the actual package and retain human verification/source dates. Do not use openFDA for clinical decisions. [NDC Directory; S-27](https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory), [openFDA limitations; S-28](https://open.fda.gov/apis/drug/ndc/).

**Observed or supplied by the transaction:** actual lot, expiry, serial, quantities, condition, receipt time, supplier authorization, price, invoice, stock ownership, storage history and patient use. Do not manufacture these from a catalog result. Supplier feeds and barcode capture may reduce typing but still need discrepancy checks; no feed, import or live connection is approved here.

**Identifier design:** preserve raw identifier, scheme, parsed segments and verified normalization separately as strings, including leading zeroes. FDA's finalized uniform 12-digit NDC format takes effect **2033-03-07**; FDA distinguishes that from the 11-digit reimbursement format. Do not prematurely relabel current identifiers or permanently constrain the model to one length. [FDA NDC format; S-29](https://www.fda.gov/drugs/electronic-drug-registration-and-listing-system-edrls/national-drug-code-format).

## APPly economics and useful reporting

The founder selected percentage-of-**ordered inventory value** pricing. Preserve that direction; this note does not select a rate or billing trigger. Maintain order placement, fulfillment, invoices, payments and credits separately. T-14 still must define eligible products/orders, discounts, freight/tax, cancellations, partial deliveries, returns/credits, period, payer and disputes.

The concurrent [[Inventory Price Comparison Sources]] note provides supplier and benchmark leads for those purchasing fields. Preserve price type, effective date, exact package and delivered-cost components; a reference price is not evidence of the clinic's actual acquisition cost.

The eventual billing export should contain only approved clinic/order IDs, dates, currency, eligible value, adjustment links and calculation/rule versions. It does not need patient names, prescriptions, diagnoses, encounter details, or patient-level usage. Purchasing authority and any supplier commission/conflict review remain separate under L-04.

Recommended clinic reports, derived from authorized inventory records:

- Usable and physical stock by product/lot/location, with unreconciled differences visible.
- Earliest-use-by stock and value at risk of expiry; pick eligible stock by earliest applicable expiry/BUD, with documented exceptions.
- Stockouts, unmet demand and actual lead times; proposed reorders rounded to valid pack quantities and checked against shelf life/capacity.
- Waste, damage, expiry and unexplained shrinkage by cause, quantity and acquisition cost.
- Recall/excursion reconciliation: affected quantity received, still held, already used, returned and disposed; any recipient follow-up occurs only in the clinical system.
- Order-to-receipt-to-invoice/credit reconciliation and separately calculated software-fee evidence.

These are proposed management measures, not observed business results. No demand, cost, margin or revenue estimates were invented. Broader business collection can reuse supplier performance, support effort, onboarding time and training evidence without collecting clinical content.

## Implications for the current prototype

**Current implementation, D-031/D-033:** [[PostgreSQL and Inventory Foundation]] now records typed units/conversions, distinct receipts with optional costs, shared ledger, overlapping holds and count/approval records behind the separate frontend/API. The next two paragraphs preserve the earlier T-31 inspection, not today's missing-feature list. Broader purchasing, container/storage, clinical and specialist workflows remain open.

Read-only inspection on 2026-08-30 covered the in-progress pharmacy migration, four pharmacy models and the NDC lookup service. The working tree was changing concurrently; this is a bounded source snapshot, not runtime verification or acceptance of another task's work.

The inspected code has package-level catalog entries, lot/expiry/location, supplier text, whole-package movements, actor/reason/retry attribution, and quarantine/recall states. Those are useful foundations. At that earlier inspection the structures did not model verified unit conversions, individual opened containers/BUD, receipt lines with separate cost/supplier history, purchase/invoice/credit reconciliation, temperature evidence, serialized tracing, formal count records, or patient-use allocations. Do not represent whole packages as administered doses. No clinical workflow should be added just to make the ledger balance.

The original next-scope recommendation was typed units, receipts, movements/counts and controlled holds; that bounded core is now delivered under D-031. Location/operator configuration and scoped acceptance remain open, while this note retains the broader requirements. Add product-specific container/temperature handling before rehearsing that product class. Patient dispensing, controlled-drug operations, traceability integrations and billing each need their own bounded implementation task, evidence and acceptance. These are dependencies, not permission to expand the code now.

Useful synthetic acceptance cases: two deliveries of the same lot at different costs; a carton converted into stock units; partial receipt and later credit; two containers from one lot opened at different times; overlapping recall and temperature holds; duplicate event retry; a count discrepancy; and a returned shipment whose credit arrives later. No patient examples are needed to validate the inventory core.

## Evidence to request next and remaining limits

Through authorized access, obtain the intended medication/formulary list and operating model; blank supplier invoice/packing-list and tracing-message examples; storage/monitoring and count procedures; role/approval descriptions; return/disposal workflow; and a wholly synthetic receipt-to-use walkthrough. Request descriptions or approved templates, not patient records, portal credentials or confidential documents in chat. Actual agreements and professional findings remain in controlled storage.

Map every chosen field to its purpose, source, collector, validation, permitted readers, retention rule and correction process before real collection. Keep separate retention classes for purchasing/tax records, tracing evidence, controlled-drug records, staff attribution, clinical records and logs. Do not set a universal deletion period or treat a supplier portal link as guaranteed long-term access. Preserve original evidence and legal holds.

Source review was limited to the cited relevant passages, not entire external rulebooks. The current TSBP PDF was consulted alongside its adopted-changes page, which lists a §291.17 amendment effective 2025-09-01. The live TAC viewer/linked Register retrieval did not expose that amendment text; reconcile current controlling text before configuring legal workflows. During the initial review, direct current eCFR and Texas Occupations Code chapter 158 retrieval also failed. The later same-day [[Pharmacy Provider and Counsel Questions]] follow-up retrieved official Chapter 158 and selected Chapter 157/102 provisions (S-60–S-62), resolving that Chapter 158 access gap. Current eCFR and profession-specific administrative-rule reconciliation remain open; no practitioner-dispensing clearance is claimed. FDA's linked trading-partner guidance is marked draft and was not used as an effective rule. [TSBP change register; S-38](https://www.pharmacy.texas.gov/Rules_Recent_Adopted_Changes.asp).

The initial full local vault review covered 24 Markdown notes and five JSON configurations; all 257 baseline wiki links resolved and every note was reachable from Home. Subsequent review included the concurrent pricing note and all changed portions of the existing notes/configuration, bringing coverage to 26 Markdown notes and five JSON files. D-019/D-026 contextualize earlier ownership/account-model records; the mentorship note now exists. Obsidian Sync enablement and stale Welcome UI references were preserved without assuming approved synchronization. MD/governance/SharePoint originals remain missing and unreviewed. L-02, L-04, L-05 and L-06 remain open; no code changes, live-data access, outreach, purchase, submission or deployment occurred in this research task.

---
type: research
status: research-recorded-integration-deferred
updated: 2026-08-31
---
# Inventory Price Comparison Sources

Home: [[00 Home]] · Evidence: [[Source Register]] · Product: [[Clinic Workspace]] · Model: [[Data Modeling]] · Collection: [[Pharmacy Inventory Data Requirements]] · Commercial boundary: [[Business Model]]

## Purpose and scope

Public supplier/manufacturer documents and pricing references for comparing U.S. clinic inventory costs, researched on 2026-08-30 at the founder's request. This is a source shortlist, not a completed price comparison, approved supplier list, purchasing commitment, clinical substitution decision, or product integration.

**Suggested starting point:** DiaMedical's priced PDF and Bound Tree's public list prices for supplies/equipment; CMS NADAC for pharmacy acquisition-cost background; CDC's private-sector column for vaccines. Add authorized supplier quotes for the clinic's actual basket before claiming achievable savings. Keep routine supplies, medications, vaccines, and capital equipment distinct.

**Current status — deferred by founder, 2026-08-30 (D-029 / U-19):** preserve the source shortlist, supplier-integration findings and proposed extensible design below; do not start integration implementation or supplier onboarding now. T-37 in [[Roadmap and Tasks]] is the canonical deferred work item. No supplier, network, API contract, build scope, budget or delivery date has been selected. T-13/T-34's broader inventory work and T-14's unresolved billing mechanics remain unchanged.

## Supplier and manufacturer documents

| Source | Document / format | What it contributes | Price access, date and limits |
| --- | --- | --- | --- |
| S-39 — DiaMedical | [2026 Medical Equipment & Supplies Catalog](https://www.diamedicalusa.com/downloadable-resources), downloadable PDF | Spring 2026, 156 pages; supply/equipment prices, supplier SKUs, units and some manufacturer part numbers. Contents include diagnostics, infection control, infusion and patient care | Public catalog prices. Cover, contents, sample product pages 60/72 and price terms on p.150 checked. Prices can change; freight, handling and other fees affect totals. Distinguish new from reconditioned equipment and training products |
| S-40 — Bound Tree Medical | [Online syringe catalog / price page](https://www.boundtree.com/iv-drug-delivery/syringes-needles/luer-lock-syringes/p/group000480) and [gloves](https://www.boundtree.com/gloves/c/117), HTML | Supplier item numbers, product descriptions and each/box/case quantities with public list prices | Public list prices observed on 2026-08-30; account-specific prices and availability require login. EMS-oriented range overlaps clinic supplies; not every product fits the intended clinic |
| S-41 — McKesson Medical-Surgical | [Catalog / SupplyManager](https://mms.mckesson.com/catalog), online catalog; clinic-specific quote or price export to obtain | Broad supplier/manufacturer item matching; candidate source for the clinic's actual negotiated supply prices | Direct catalog access redirected to login. No account, private quote, invoice or export reviewed; do not treat account prices as public or assume a bulk export/API is available |
| S-42 — Henry Schein Medical | [Medical Supply Catalog](https://www.henryschein.com/medical-supply-catalog.aspx) and [ordering resources](https://www.henryschein.com/medical-supply-online.aspx), catalog/online resources; quote and invoice documents to obtain | Office-practice supplies, diagnostics, pharmaceuticals and equipment. [Published account guidance](https://www.henryschein.com/us-en/340b/resourcecenter/helpfulhints.aspx) describes pricing, purchase history and electronic invoices | Public descriptions reviewed; direct catalog retrieval was unreliable and no account pricing or private documents were accessed. Confirm current prices, pack sizes and applicable account terms; no 340B eligibility is inferred from the guidance page |
| S-43 — American Diagnostic Corporation (ADC) | [Product ordering/specification pages](https://www.adctoday.com/products/6121), HTML; [manufacturer MSRP explanation](https://www.adctoday.com/blog/two-new-ways-shop-smarter) | Manufacturer model/variant references and suggested-retail-price context for diagnostic instruments | Manufacturer's MSRP explanation is dated 2016. Current product page reviewed, but selected-variant price was not exposed in direct retrieval; no current numerical price captured. MSRP is not a distributor quote |
| S-44 — Dynarex | [Disposable Medical Products Catalog](https://info.dynarex.com/hubfs/disposable.pdf), PDF | Manufacturer reference numbers, descriptions, quantities per box and boxes per case; useful for matching products and units | Retrieved 208-page file contains 2019 copyright notices. Sample glove/IV tables reviewed; no dollar prices found in extracted text. Historical product reference only until identifiers/packaging are rechecked; not a 2026 price list |

DiaMedical's [direct public PDF](https://4420736.app.netsuite.com/core/media/media.nl?id=7368564&c=4420736&h=0P1pE29cihdGjVsIR93750r0CCIw8UZ-EhbMqNG0mM6a2SmO&_xt=.pdf) was downloaded from its resource page and inspected locally. Prefer the resource page for later editions.

## Pharmacy and vaccine benchmarks

| Source | Download / document | Useful fields | Important boundary |
| --- | --- | --- | --- |
| S-45 — CMS NADAC | [2026 dataset](https://catalog.data.gov/dataset/nadac-national-average-drug-acquisition-cost-2026), [CSV linked on 2026-08-30](https://download.medicaid.gov/data/nadac-national-average-drug-acquisition-cost-08-26-2026.csv), and [field definitions PDF](https://www.medicaid.gov/medicaid-chip-program-information/by-topics/prescription-drugs/ful-nadac-downloads/nadacdatadefinitions.pdf) | NDC, description, per-unit acquisition-cost benchmark, pricing unit, effective date and As of Date | Based on retail community pharmacy invoice surveys, not a clinic-specific wholesaler quote or patient retail price. CMS publishes weekly updates. Dataset metadata, CSV header/initial sample and both definition pages checked; entire CSV not validated |
| S-46 — CDC | [Current vaccine price-list hub](https://www.cdc.gov/vaccines-for-children/php/price-list/index.html) and [Adult Vaccine Price List PDF](https://www.cdc.gov/vaccines-for-children/media/pdfs/2026/07/Adult-Vaccine-Price-List-08-03-26.pdf) | Brand, NDC, packaging, cost per dose, manufacturer and contract dates | Hub says prices reviewed 2026-08-01; linked adult filename includes 08-03-26. All four adult PDF pages/footnotes checked. Private-sector figures are manufacturer-reported reference prices. Private providers cannot directly buy through CDC contracts; do not use CDC contract prices as an attainable clinic quote |

CMS's [survey explanation](https://www.medicaid.gov/medicaid/prescription-drugs/retail-price-survey) and [publication page](https://www.medicaid.gov/medicaid/prescription-drugs/pharmacy-pricing) explain the benchmark. Preserve NDC as text, including leading zeros. The dated CSV's initial sampled row has an earlier As of Date: do not assign the download filename's date to every record. Select and validate the intended snapshot and effective dates before comparing or importing prices. NADAC units include EA, ML and GM; a per-mL figure is not a per-vial price.

## Evidence examples, not purchase recommendations

- DiaMedical p.72 lists Dynarex manufacturer part **7060**, supplier SKU **IV080455-6IN**, at **$5.29 each**. This illustrates why manufacturer and distributor identifiers need separate fields; it is a dated catalog observation, not a verified current quote.
- Bound Tree item **1633-20003** displays **$0.35 each**, **$35.00 per 100** and **$350.00 per 1,000**. These normalize to the same item cost before fees. The page withholds the account-specific price and availability. This checks units within one listing, not savings between suppliers.

## Comparison record to collect

These are proposed comparison fields, not accepted application-schema changes:

| Field group | Capture |
| --- | --- |
| Product identity | Manufacturer, manufacturer part number, supplier SKU, exact variant; GTIN/UDI if supplied; NDC and strength/form/concentration/package for drugs |
| Packaging | Order unit, inner packs, units per pack/case, base unit, conversion factor; singles versus pairs and sterile versus non-sterile |
| Price evidence | Amount/currency, price type (catalog, MSRP, benchmark, account quote, invoice), source URL/document/page, issue/effective/access dates, quote expiry and quantity tier |
| Delivered cost | Item subtotal, explicit discounts/credits, freight/cold-chain/handling, small-order/payment fees and applicable tax; record unknowns rather than zero |
| Availability and fitness | Stock/lead time, minimum order, expiry/shelf life, returns, new/reconditioned/training-only status and required technical/clinical review of alternatives |

Proposed calculation: **delivered unit cost = (item subtotal - applicable discounts + allocated shipping/fees + applicable tax) / total base units**. Record the allocation method for order-level charges. Compare exact products first; put possible substitutes in a separate review queue. Matching descriptions or NDC pricing groups do not establish clinical interchangeability.

For usable quotes, the desired documents are a dated itemized quote or authorized account price export, packaging/specification sheet, shipping/minimum-order terms, and any applicable discount schedule. Historical purchasing evidence can help establish actual costs, but do not upload unreviewed invoices, patient details, account identifiers or confidential contracts here. Keep controlled originals in approved storage; this note needs only permitted non-sensitive summaries.

## Gaps and next use

- [Medline Physician Office Essentials PDF](https://www.medline.com/media/catalog/Docs/MKT/CAT_Physician_Office_Essentials_redu.pdf) was discovered, but full retrieval failed through the available web reader/direct download. It remains an unreviewed lead, not a verified price document.
- Several search-indexed GSA/FSS price-list PDFs returned 404 on direct retrieval; none is included as a verified current price source. Government contract prices would require separate applicability checks in any event.
- No clinic purchasing basket, supplier account terms, live stock, delivered quotes or manufacturer reuse/feed permissions have been supplied. No cheapest-vendor or savings conclusion is supported yet.
- Before automated collection, verify permitted catalog reuse, export/API availability and licensing with each source. Public visibility alone does not establish permission for bulk scraping, redistribution or commercial embedding. No connector, scraper, import or recurring monitor was created.
- Earlier suggested next use under T-13 was a small non-sensitive basket and dated supplier quotes. The founder has now deferred the supplier-pricing work under T-37; the steps below are retained for resumption, not current commitments. This research does not close T-13 or T-14, authorize purchases, select suppliers, or change ordered-inventory-value billing rules. Real clinical/PHI gates remain unchanged.

## Supplier integrations — research snapshot

Public-source research from the same 2026-08-30 discussion. These are advertised capabilities, not tested APPly connections or confirmation that a particular clinic qualifies. Public reference prices, negotiated account prices and actual transaction costs must remain distinct.

| Supplier | Public evidence | Access and unresolved limits |
| --- | --- | --- |
| Medline — S-68 | [eCommerce capabilities](https://www.medline.com/business/ecommerce-capabilities/) and [Digital Integration Services guide](https://www.medline.com/media/assets/pdf/Digital%20Integration%20Services%20060122.pdf), especially p.3, describe APIs for live contract prices, product information and warehouse-related availability, alongside hosted catalogs, EDI and PunchOut | Guide text reviewed; API schemas are Medline-defined. Account eligibility, technical documentation, commercial terms, rate limits and APPly's right to cache/display data are unverified. This does not resolve the separate failed price-catalog retrieval above |
| McKesson — S-69 | [Technology Consultants](https://mms.mckesson.com/content/inventory-management/technology-consultants/) describes PunchOut pricing/availability, cXML, EDI and SFTP. Its [2026 API flyer](https://mms.mckesson.com/content/wp-content/uploads/2026/07/FINAL-2025_4780850-API-Product-Marketing-Flyer.pdf) supports third-party/internal software, order/invoice access and sandbox testing | Flyer describes an API agreement and account information. It does not expressly establish a standalone price-query endpoint; confirm that capability before designing against it. No agreement signed, credentials obtained or patient-related API capability included in scope |
| Bound Tree — S-70 | [Operative IQ integration](https://www.boundtree.com/operative-iq) checks pricing/availability during ordering and supports orders and receiving | Evidence of an existing partner connection, not published developer access for APPly. Protocol, eligibility and commercial/data-use terms remain unknown |
| Henry Schein — S-71 | [Special Markets integration page](https://www.henryschein.com/us-en/SpecialMarkets/Services/EZ_Scan.aspx?hsec=1) advertises PunchOut, cXML, EDI and XML web services | Primary-site search-index text reviewed; direct retrieval failed. Medical division coverage, current price-query scope and access remain to verify; do not treat Special Markets marketing as a Medical API specification |
| DiaMedical, ADC and Dynarex | Existing catalog references remain useful; no public live-pricing developer documentation verified in this search. ADC's [dealer page](https://www.adctoday.com/dealers/locate) (S-75) and Dynarex's [FAQ](https://dynarex.com/faqs) (S-76) describe dealer/distributor sales | No public documentation found is not proof that an integration is unavailable. Manufacturer identity/specification data can be useful even when the clinic's purchase price comes from a reseller |

The Medline guide describes returning the PunchOut cart to the procurement system, followed by an approved order through a separate transaction. PunchOut is not itself a universal bulk-price API or an order-placement authorization. An [older FAQ](https://www.medline.com/media/assets/pdf/PunchOut/Medline-PunchOut-FAQ-pages.pdf) found during research conflicts with the newer guide on Level II support; use current supplier confirmation before relying on that detail.

## How existing comparison platforms connect

These examples support several arrangements rather than a claim that every inventory system compares the whole market:

- **Direct supplier integration:** the software connects through supported interfaces, with the buyer's supplier account and applicable prices. Technical connectivity does not grant a discount or permission to redistribute pricing.
- **Procurement network:** [GHX Marketplace](https://www.ghx.com/marketplace/) advertises one connection to more than 250 supplier PunchOut sites (S-72). This is vendor-reported coverage, not evidence of APPly access or a verified price feed for every supplier.
- **Supplier commercial program:** [Hybrent](https://hybrent.com/suppliers/) describes supplier agreements and optional custom APIs, including pricing/stock availability (S-73). A platform may have supplier partnerships; no commission or commercial relationship is inferred for APPly.
- **Group purchasing contracts:** [Premier](https://premierinc.com/providers/group-purchasing-organization) describes negotiated contracts across care settings (S-74). The customer's eligibility and activated terms must be established separately from software access.

Implementation can combine API requests, permitted catalog/price files and EDI, with PunchOut for supplier-hosted shopping. A comparison may cover only connected suppliers and eligible contracts. Display that coverage explicitly; do not label a limited result the cheapest price in the market.

## Proposed extensible design — not implemented

Keep this as an adjacent procurement module to the existing product/lot ledger in [[Clinic Workspace]], using the boundaries in [[Data Modeling#Inventory and commercial boundary]]. APIs are one connector type in the same design as approved imports. Do not put one mutable supplier price on an inventory product or overwrite acquisition history when a catalog changes.

| Record / responsibility | Proposed content and rule |
| --- | --- |
| Product and package | Manufacturer/labeler, exact variant, raw identifiers and schemes, package contents, verified dimensional units/conversions and evidence. Shared catalog data only where reuse is permitted; clinic formularies and stock stay separate |
| Supplier listing | Supplier SKU and offered package mapped to a verified product/package. Preserve original description/unit and mapping provenance; ambiguous matches await review |
| Clinic supplier account | Clinic, supplier account/contract scope and permissions; secure credential reference only. Never make a clinic's negotiated price visible to another clinic by using a shared cache or product ID |
| Price and availability observations | Source, listing/account scope, exact amount/currency, price type, quantity tier/minimum order, effective/retrieval/expiry dates, availability/lead time and known cost components. Preserve history; unknown charges or expiry are not zero or an invented guarantee |
| Connector and import run | Declared capabilities such as catalog, prices and availability; source/version, cursor, validation/mapping outcomes, timestamps and failure state. Add ordering/invoice capabilities only under later scope. Use bounded retries, deduplication and supplier-specific limits; exclude secrets and patient details from logs |
| Comparison | Exact package/unit matching, quantity-sensitive delivered-cost estimate, price type, freshness, coverage and missing-cost warnings. Keep potential substitutes in a separate professional review path; no automatic clinical equivalence |

Conceptual flow: **permitted source → connector/import validation → product/package matching → scoped offer history → comparison**. Purchase approval, supplier submission, physical receiving and invoice/credit reconciliation are separate later workflows. Importing a price or catalog row must never create stock, place an order or calculate an APPly fee.

The earlier pharmacy slice used whole sealed packages. D-031 now supplies exact typed units, evidenced package conversions and distinct receipt-level optional cost history in [[PostgreSQL and Inventory Foundation]]. Preserve current unit/conversion provenance and historical package semantics; do not reinterpret old package movements as doses. Supplier offer/comparison integration remains deferred under D-029/T-37. Public FDA metadata, NADAC and CDC benchmarks are not supplier quotes or stock evidence.

## Future work when reprioritized

T-37 holds status and ownership; this sequence records scope and acceptance considerations, not a separate backlog or authorization to act now.

1. **Revalidate scope and access.** Define a small non-sensitive comparison basket and required suppliers; recheck public documentation. Obtain authorized account/feed documentation, sandbox eligibility, fees, support, rate limits, permitted caching/display/retention and clinic-specific price scope. Choose direct integration versus a network using actual coverage and cost evidence, not supplier size or marketing alone.
2. **Reconcile the data model.** Coordinate with T-13/T-34 on product identity, typed units, supplier/receipt provenance and clinic isolation. Keep quote/list/benchmark/invoice values distinct. Define how freight, cold-chain fees, discounts, order thresholds, tax and credits affect a comparison; display unresolved components.
3. **Build a bounded synthetic first slice.** After scope is resumed and accepted, implement validated CSV/quote imports, mappings, price history and a read-only comparison view. Review extracted PDF rows before acceptance; do not make unattended PDF scraping the live-price foundation. Preserve permitted source evidence and reject ambiguous or malformed rows without silently replacing prior prices.
4. **Validate useful failure cases.** Compare differing pack sizes; preserve leading-zero identifiers; reject incompatible units and unreviewed variants; isolate two clinics' different prices for the same item; keep dated/tiered offers separate; test duplicate imports, partial failures, stale data and unavailable suppliers. Unknown shipping must not yield a false delivered-price ranking, and a price refresh must leave stock/order/billing history unchanged.
5. **Add one authorized live connector.** Confirm its actual price/availability endpoints, authentication and sandbox behavior. Test clinic scope, mapping, throttling, expiry and outage recovery; make freshness visible and revalidate relevant prices before a later approved purchase. No live credentials or confidential contracts belong in this vault.
6. **Scope procurement and billing separately.** Orders, approvals, acknowledgments, partial receipts, invoices/credits and returns need their own accepted workflow and evidence. T-14 must settle fee mechanics before metering. Use T-09 and L-04/L-08, including PQ-26–PQ-30 in [[Pharmacy Provider and Counsel Questions]], for contract/procurement/incentive boundaries. Keep patient workflows outside this integration; all applicable real-use gates remain open.

**Resume only when the founder explicitly reprioritizes this work.** Owner remains unassigned; no date, recurring monitor, outreach, supplier signup, purchase or deployment is scheduled. Research documentation is complete for this discussion; integration feasibility, access, costs and implementation acceptance remain future work.

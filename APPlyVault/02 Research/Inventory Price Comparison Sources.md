---
type: research
status: source-shortlist
updated: 2026-08-30
---
# Inventory Price Comparison Sources

Home: [[00 Home]] · Evidence: [[Source Register]] · Product: [[Clinic Workspace]] · Model: [[Data Modeling]] · Collection: [[Pharmacy Inventory Data Requirements]] · Commercial boundary: [[Business Model]]

## Purpose and scope

Public supplier/manufacturer documents and pricing references for comparing U.S. clinic inventory costs, researched on 2026-08-30 at the founder's request. This is a source shortlist, not a completed price comparison, approved supplier list, purchasing commitment, clinical substitution decision, or product integration.

**Suggested starting point:** DiaMedical's priced PDF and Bound Tree's public list prices for supplies/equipment; CMS NADAC for pharmacy acquisition-cost background; CDC's private-sector column for vaccines. Add authorized supplier quotes for the clinic's actual basket before claiming achievable savings. Keep routine supplies, medications, vaccines, and capital equipment distinct.

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
- Suggested next use under T-13: define a small non-sensitive basket, match exact identifiers and packaging, then compare dated supplier quotes against these references. This research does not close T-13 or T-14, authorize purchases, select suppliers, or change ordered-inventory-value billing rules. Real clinical/PHI gates remain unchanged.


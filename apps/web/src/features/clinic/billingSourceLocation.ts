import type {
  BillingLocationProvenance,
  BillingSourceSite,
} from "../../api/contracts";

export function invoiceLocationLabel(invoice: BillingLocationProvenance) {
  return invoice.source_site_id === null
    ? "Shared / unassigned"
    : invoice.source_site_name || "Location unavailable";
}

export function paymentLocationLabels(sites?: BillingSourceSite[]) {
  return sites?.length
    ? sites
        .map((site) => (site.id === null ? "Shared / unassigned" : site.name))
        .join(", ")
    : "Location unavailable";
}

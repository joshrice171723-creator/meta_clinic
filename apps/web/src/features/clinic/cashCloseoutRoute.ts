import type { CashDrawer, ClinicWorkspaceContext } from "../../api/contracts";

export function cashCloseoutHref(practiceId: number, drawer: CashDrawer) {
  const query = new URLSearchParams({
    tab: "cash",
    cash_drawer_id: String(drawer.id),
    cash_closeout: "1",
    cash_practice_id: String(practiceId),
    cash_site_id: String(drawer.site_id),
    cash_currency: drawer.currency ?? "",
  });
  return `/clinic/billing?${query}`;
}

// These hints identify the intended session; the authorized server response
// remains the source of truth. Never substitute another drawer for this route.
export function cashCloseoutError(
  search: string,
  clinic: ClinicWorkspaceContext,
  drawer: CashDrawer | null,
) {
  const query = new URLSearchParams(search);
  if (!query.has("cash_closeout")) return "";
  if (clinic.capabilities.billing_payment_record !== true)
    return "Cash drawer closeout access is required.";
  if (
    query.get("cash_closeout") !== "1" ||
    query.get("cash_practice_id") !== String(clinic.practice.id) ||
    query.get("cash_site_id") !== String(clinic.current_site?.id) ||
    !drawer ||
    query.get("cash_drawer_id") !== String(drawer.id) ||
    query.get("cash_site_id") !== String(drawer.site_id) ||
    !query.has("cash_currency") ||
    query.get("cash_currency") !== (drawer.currency ?? "")
  )
    return "This cash closeout link no longer matches an available drawer at the current clinic and location. Return to Morning view and choose the session again.";
  if (drawer.status !== "open")
    return "This drawer session is already closed. Review its recorded count and reconciliation in Cash drawer.";
  return "";
}

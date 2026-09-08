export type ServiceComponent = {
  service_id: number;
  name: string;
  description: string;
  mode: "included" | "optional" | "choose_one" | "choose_many";
  group: string;
  min: number;
  max: number;
  quantity: number;
  frequency: "term" | "day" | "week" | "month";
  price_adjustment: string;
  eligibility_review: boolean;
};
export type PackageTerms = {
  family_id: number;
  family_name: string;
  package_id: number;
  package_name: string;
  description: string;
  tier: string;
  display_order?: number;
  amount: string;
  currency: string;
  duration: number;
  duration_unit: "days" | "months";
  renewal: "none" | "manual" | "automatic";
  cancellation: "immediate" | "end_of_term";
  refund_policy: "none" | "manual_review";
  terms: string;
  eligibility_review: boolean;
  max_per_patient: number;
  available_from: string | null;
  available_until: string | null;
  components: ServiceComponent[];
  selected_components?: ServiceComponent[];
  total?: string;
};
export type MembershipProgram = {
  id: number;
  name: string;
  description: string;
  display_order: number;
};
export type PublishedPackage = {
  program?: MembershipProgram;
  id: number;
  number: number;
  terms: PackageTerms;
};
export type Subscription = {
  id: number;
  patient_id?: number;
  invoice_id: number;
  version_id: number;
  state: string;
  processor?: "stripe" | "development_fixture";
  checkout_status?: "open" | "expired" | "complete" | null;
  renewal_status?: string | null;
  renewal_canceled?: boolean;
  last_synced_at?: string | null;
  renewal_amount_due?: string | null;
  renewal_invoice_status?: string | null;
  amount: string;
  currency: string;
  balance: string;
  invoice_status: string;
  starts_at: string | null;
  ends_at: string | null;
  cancellation_effective_at: string | null;
  terms: PackageTerms;
  events: { kind: string; occurred_at: string }[];
};
export type SubscriptionReceipt = {
  id: number;
  invoice_id: number;
  kind: string;
  issued_at: string;
  amount: string;
  currency: string;
  period_start: string | null;
  period_end: string | null;
};
export type CatalogItem = {
  display_order?: number;
  lock_version?: number;
  published_snapshot?: Omit<MembershipProgram, "id"> | null;
  id: number;
  name: string;
  description: string;
  retired: boolean;
};
export type DraftPackage = {
  id: number;
  name: string;
  family_id: number;
  draft: Partial<PackageTerms>;
  lock_version: number;
  retired: boolean;
  published_version_id: number | null;
};
export type AdminCatalog = {
  families: CatalogItem[];
  services: CatalogItem[];
  packages: DraftPackage[];
  capabilities: { write: boolean; publish: boolean };
};
export function subscriptionMoney(amount: string, currency: string) {
  const [whole, fraction = ""] = amount.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}
export function stateLabel(state: string) {
  const words = state.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function subscriptionDate(value: string, includeTime = false) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(parsed);
}

export function membershipPeriod(terms: PackageTerms) {
  if (terms.renewal === "automatic") return "Monthly";
  const unit =
    terms.duration === 1
      ? terms.duration_unit.replace(/s$/, "")
      : terms.duration_unit;
  return `${terms.duration} ${unit}`;
}

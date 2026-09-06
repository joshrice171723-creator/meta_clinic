import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PackageCard } from "../src/features/clinic/subscriptions/PackageCard";
import {
  subscriptionMoney,
  type PackageTerms,
  type ServiceComponent,
} from "../src/features/clinic/subscriptions/contracts";

const service: ServiceComponent = {
  service_id: 1,
  name: "Dev seed chosen service",
  description: "Clinic-defined description",
  mode: "choose_one",
  group: "Choose a service",
  min: 1,
  max: 1,
  quantity: 2,
  frequency: "month",
  price_adjustment: "0.10",
  eligibility_review: true,
};
const terms: PackageTerms = {
  family_id: 1,
  family_name: "Any family",
  package_id: 1,
  package_name: "Any package",
  description: "",
  tier: "Any tier",
  amount: "12.30",
  currency: "USD",
  duration: 3,
  duration_unit: "months",
  renewal: "manual",
  cancellation: "end_of_term",
  refund_policy: "manual_review",
  terms: "Clinic-defined fixed-term conditions.",
  eligibility_review: true,
  max_per_patient: 1,
  available_from: null,
  available_until: null,
  components: [
    service,
    { ...service, service_id: 2, name: "Unselected alternative" },
  ],
};

describe("subscription purchase presentation", () => {
  it("preserves exact money beyond JavaScript numeric precision", () => {
    expect(subscriptionMoney("99999999999999.99", "USD")).toBe(
      "USD 99,999,999,999,999.99",
    );
    expect(subscriptionMoney("12.6", "USD")).toBe("USD 12.60");
  });
  it("confirmation shows server-selected components and authoritative total", () => {
    const html = renderToStaticMarkup(
      <PackageCard
        terms={{ ...terms, total: "12.40", selected_components: [service] }}
      />,
    );
    expect(html).toContain("USD 12.40");
    expect(html).toContain("Dev seed chosen service");
    expect(html).not.toContain("Unselected alternative");
    expect(html).toContain("Clinic review required before payment");
    expect(html).toContain("Manual renewal; no automatic charge");
    expect(html).toContain("Clinic-defined fixed-term conditions.");
  });
  it("browsing offers labeled selectable components without claiming purchase", () => {
    const html = renderToStaticMarkup(
      <PackageCard terms={terms} selections={[]} onSelect={() => {}} />,
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html).toContain("Unselected alternative");
    expect(html).not.toContain("Payment complete");
  });
});

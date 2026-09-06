import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PackageCard } from "../src/features/clinic/subscriptions/PackageCard";
import { MembershipCard } from "../src/features/clinic/subscriptions/MembershipCard";
import { draftMembershipTerms } from "../src/features/clinic/subscriptions/draftMembershipTerms";
import {
  MembershipCatalog,
  membershipPrice,
} from "../src/features/patientPortal/MembershipCatalog";
import { patientPortalLabel } from "../src/features/patientPortal/patientPortalLabels";
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
  it("renders published program and tier copy verbatim including service descriptions and terms", () => {
    const published = {
      ...terms,
      package_name: "A custom tier",
      description: "synthetic materials explained by the clinic",
      terms: "lowercase terms\nKeep this exact line.",
      components: [
        {
          ...service,
          name: "Dev seed exact service",
          mode: "included" as const,
        },
      ],
    };
    const html = renderToStaticMarkup(
      <MembershipCatalog
        catalog={[
          {
            id: 3,
            number: 2,
            program: {
              id: 1,
              name: "Clinic-authored program",
              description: "Program introduction",
              display_order: 9,
            },
            terms: published,
          },
        ]}
        busy={false}
        canPurchase
        onChoose={() => {}}
      />,
    );
    for (const value of [
      "Clinic-authored program",
      "Program introduction",
      "A custom tier",
      "synthetic materials explained by the clinic",
      "Dev seed exact service",
      service.description,
      "lowercase terms",
      "Keep this exact line.",
      "$12.30",
      "renew manually",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain("no automatic renewal");
  });
  it("builds the immediate preview from current input and catalog services without a client total", () => {
    const live = draftMembershipTerms(
      {
        name: "Unsaved tier",
        family_id: 7,
        draft: {
          ...terms,
          amount: "99999999999999.99",
          total: "1.00",
          selected_components: [service],
          components: [
            {
              ...service,
              name: "stale name",
              description: "stale copy",
              mode: "included",
            },
          ],
        },
      },
      [{ id: 7, name: "Unsaved program", description: "", retired: false }],
      [
        {
          id: 1,
          name: "Current catalog service",
          description: "Current service description",
          retired: false,
        },
      ],
    );
    expect(live.package_name).toBe("Unsaved tier");
    expect(live.components[0].name).toBe("Current catalog service");
    expect(live.components[0].description).toBe("Current service description");
    expect(live.components[0].price_adjustment).toBe("0");
    expect(live.total).toBeUndefined();
    expect(live.selected_components).toBeUndefined();
    const preview = renderToStaticMarkup(
      <MembershipCard terms={live} draftPreview />,
    );
    const storefront = renderToStaticMarkup(
      <MembershipCard terms={live} onChoose={() => {}} />,
    );
    for (const value of [
      "Unsaved tier",
      "Current catalog service",
      "Current service description",
      "$99,999,999,999,999.99",
    ])
      expect(preview.includes(value) && storefront.includes(value)).toBe(true);
    expect(preview).toContain("disabled");
    expect(preview).not.toContain("stale name");
  });
  it("does not invent a price or tier while the admin has not entered them", () => {
    const html = renderToStaticMarkup(
      <MembershipCard
        terms={draftMembershipTerms({ name: "" }, [], [])}
        draftPreview
      />,
    );
    expect(html).toContain("Enter a base price");
    expect(html).not.toContain("$0.00");
    expect(html).not.toContain("Essential");
  });
  it("removes development fixture prefixes from patient-facing labels only", () => {
    expect(patientPortalLabel("Dev seed Women's Wellness")).toBe(
      "Women's Wellness",
    );
    expect(patientPortalLabel("Dev seed flexible services")).toBe(
      "Flexible services",
    );
    expect(patientPortalLabel("SYN_Mercer, Alex")).toBe("Mercer, Alex");
    expect(patientPortalLabel("SYN-BASE-001")).toBe("BASE-001");
    expect(terms.family_name).toBe("Any family");
  });
  it("formats US storefront prices without losing cents or changing other currencies", () => {
    expect(membershipPrice("99999999999999.99", "USD")).toBe(
      "$99,999,999,999,999.99",
    );
    expect(membershipPrice("12.30", "CAD")).toBe("CAD 12.30");
  });
  it("compares one program at a time and permits exploration without purchase authority", () => {
    const html = renderToStaticMarkup(
      <MembershipCatalog
        busy={false}
        canPurchase={false}
        onChoose={() => {}}
        catalog={[
          {
            id: 9,
            number: 1,
            terms: {
              ...terms,
              family_id: 9,
              family_name: "Separate program",
              package_name: "Separate plan",
            },
          },
          { id: 1, number: 1, terms },
          {
            id: 2,
            number: 1,
            terms: { ...terms, package_id: 2, package_name: "Second tier" },
          },
        ]}
      />,
    );
    expect(html).toContain("Separate program");
    expect(html).toContain("Separate plan");
    expect(html).not.toContain("Second tier");
    expect(html).toContain("Explore Separate plan");
    expect(html).not.toContain("Choose Separate plan");
    expect(html).toContain("Base membership price");
    expect(html).not.toContain("Most popular");
  });
  it("offers an honest empty state without frontend fixture plans", () => {
    const html = renderToStaticMarkup(
      <MembershipCatalog
        busy={false}
        canPurchase
        onChoose={() => {}}
        catalog={[]}
      />,
    );
    expect(html).toContain("no published plans available");
    expect(html).not.toContain("$89");
  });
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
    expect(html).toContain("Renew manually; no automatic charge");
    expect(html).toContain("Clinic-defined fixed-term conditions.");
  });
  it("discloses monthly recurring charges and cancellation after the paid period", () => {
    const html = renderToStaticMarkup(
      <PackageCard terms={{ ...terms, renewal: "automatic" }} />,
    );
    expect(html).toContain("Billed monthly until canceled.");
    expect(html).toContain("Cancellation takes effect at the end of the current paid period.");
    expect(html).not.toContain("no automatic charge");
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

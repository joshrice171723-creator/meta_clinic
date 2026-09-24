import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetaClinicMarketing } from "../src/features/marketing/MetaClinicMarketing";
import {
  featureHref,
  marketingFeatures,
} from "../src/features/marketing/features";

describe("Meta Clinic marketing pages", () => {
  it("offers a distinct page for every feature in the homepage catalog", () => {
    const home = renderToStaticMarkup(<MetaClinicMarketing />);
    const slugs = marketingFeatures.map((feature) => feature.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const feature of marketingFeatures) {
      expect(home).toContain(`href="${featureHref(feature)}"`);
      const detail = renderToStaticMarkup(
        <MetaClinicMarketing featureSlug={feature.slug} />,
      );
      if (
        ["inventory", "scheduling", "clinical-notes"].includes(feature.slug)
      ) {
        expect(detail).toContain('class="meta-flagship');
      } else {
        expect(detail).toContain(feature.headline);
        expect(detail.replaceAll("&#x27;", "'")).toContain(feature.summary);
      }
    }
  });

  it("presents scheduling day, month, booking, and clinic team imagery", () => {
    const detail = renderToStaticMarkup(
      <MetaClinicMarketing featureSlug="scheduling" />,
    );

    expect(detail).toContain("Day view");
    expect(detail).toContain("Month view");
    expect(detail).toContain("scheduling-showcase-telehealth.png");
    expect(detail).toContain("scheduling-booking-clean.png");
    expect(detail).toContain("scheduling-front-desk.png");
    expect(detail).toContain("scheduling-planning-team.png");
    expect(detail).toContain("scheduling-telehealth.png");
    expect(detail).not.toContain("warning");
  });

  it("shows a useful destination when a feature slug is unknown", () => {
    const detail = renderToStaticMarkup(
      <MetaClinicMarketing featureSlug="missing-feature" />,
    );

    expect(detail).toContain("Feature not found");
    expect(detail).toContain('href="/meta-clinic#tools"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MetaClinicMarketing } from "../src/features/marketing/MetaClinicMarketing";
import {
  featureHref,
  marketingFeatures,
} from "../src/features/marketing/features";
import { storySlugs } from "../src/features/marketing/FeatureStoryPages";

const marketingAssets = fileURLToPath(
  new URL("../public/marketing/", import.meta.url),
);

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
        expect(storySlugs).toContain(feature.slug);
        expect(detail).toContain('class="meta-story');
        expect(detail).toContain("Illustrative concept");
        expect(detail.match(/<img /g)).toHaveLength(2);
        expect(detail.match(/<article/g)).toHaveLength(3);
        const paths = [...detail.matchAll(/src="(\/marketing\/[^"]+\.svg)"/g)];
        expect(paths).toHaveLength(2);
        for (const [, path] of paths) {
          expect(
            existsSync(`${marketingAssets}${path.split("/").at(-1)}`),
          ).toBe(true);
        }
      }
    }
  });

  it("links the Tracking Board from the catalog and gives it a populated flow visual", () => {
    const home = renderToStaticMarkup(<MetaClinicMarketing />);
    const detail = renderToStaticMarkup(
      <MetaClinicMarketing featureSlug="tracking-board" />,
    );
    expect(home).toContain('href="/meta-clinic/features/tracking-board"');
    expect(detail).toContain("Know where every visit stands.");
    expect(detail).toContain("tracking-board-overview.svg");
    expect(detail).toContain("tracking-board-flow.svg");
    const board = readFileSync(
      `${marketingAssets}tracking-board-overview.svg`,
      "utf8",
    );
    for (const stage of [
      "Expected",
      "Intake",
      "Ready for provider",
      "Provider assigned",
      "Checkout",
    ]) {
      expect(board).toContain(stage);
    }
    expect(board).toContain("Vitals");
    expect(board).toContain("Care tasks");
    expect(board).not.toMatch(/failed|stale|warning/i);
  });

  it("keeps each illustrative financial detail internally consistent", () => {
    const cash = readFileSync(
      `${marketingAssets}cash-billing-detail.svg`,
      "utf8",
    );
    expect(cash).toContain("Avery Ellis");
    expect(cash).toContain("$145.00");
    expect(cash).toContain("$0.00");
    expect(cash).not.toContain("$195.00");
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

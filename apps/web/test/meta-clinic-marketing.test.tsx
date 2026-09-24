import { renderToStaticMarkup } from "react-dom/server";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MetaClinicMarketing } from "../src/features/marketing/MetaClinicMarketing";
import {
  featureHref,
  marketingFeatures,
} from "../src/features/marketing/features";
import { storySlugs } from "../src/features/marketing/FeatureStoryPages";

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
        expect(detail).not.toContain("Inside the clinic day");
        expect(detail).not.toContain("Illustrative concept");
        expect(detail).not.toContain("-overview.svg");
        expect(detail.match(/<article/g)).toHaveLength(3);
      }
    }
  });

  it("links the Tracking Board to a page with a real populated board capture", () => {
    const home = renderToStaticMarkup(<MetaClinicMarketing />);
    const detail = renderToStaticMarkup(
      <MetaClinicMarketing featureSlug="tracking-board" />,
    );
    expect(home).toContain('href="/meta-clinic/features/tracking-board"');
    expect(detail).toContain("Know where every visit stands.");
    expect(detail).toContain("/marketing/tracking-board-app.png");
    expect(detail).toContain("/marketing/tracking-board-team.png");
    expect(
      existsSync(
        fileURLToPath(
          new URL(
            "../public/marketing/tracking-board-app.png",
            import.meta.url,
          ),
        ),
      ),
    ).toBe(true);
    expect(detail).not.toContain("tracking-board-overview.svg");
  });

  it("uses captured app views for inventory, billing, memberships, and invoices", () => {
    for (const [slug, filename] of [
      ["inventory", "inventory-app.png"],
      ["cash-billing", "cash-billing-app.png"],
      ["cash-billing", "cash-billing-collections.png"],
      ["memberships-packages", "memberships-app.png"],
      ["invoices", "invoices-app.png"],
    ]) {
      const detail = renderToStaticMarkup(
        <MetaClinicMarketing featureSlug={slug} />,
      );
      expect(detail).toContain(`/marketing/${filename}`);
      expect(
        existsSync(
          fileURLToPath(
            new URL(`../public/marketing/${filename}`, import.meta.url),
          ),
        ),
      ).toBe(true);
    }
  });

  it("pairs inventory's real app capture with clinic photography", () => {
    const detail = renderToStaticMarkup(
      <MetaClinicMarketing featureSlug="inventory" />,
    );
    for (const filename of ["inventory-supplies.png", "inventory-review.png"]) {
      expect(detail).toContain(`/marketing/${filename}`);
      expect(
        existsSync(
          fileURLToPath(
            new URL(`../public/marketing/${filename}`, import.meta.url),
          ),
        ),
      ).toBe(true);
    }
  });

  it("offers clinic-specific primary care, membership care, urgent care, and infusion pages", () => {
    const home = renderToStaticMarkup(<MetaClinicMarketing />);
    for (const [slug, heading, appImage, peopleImage, secondPeopleImage] of [
      [
        "primary-care",
        "Know the person. Keep the day moving.",
        "primary-care-patients-app.png",
        "primary-care-visit.png",
        "primary-care-front-desk.png",
      ],
      [
        "membership-care",
        "Give ongoing care a clear shape.",
        "memberships-app.png",
        "memberships-team.png",
        "memberships-front-desk.png",
      ],
      [
        "urgent-care",
        "Make the next patient visible.",
        "tracking-board-app.png",
        "urgent-care-visit.png",
        "urgent-care-handoff.png",
      ],
      [
        "weight-management",
        "Make room for steady progress.",
        "memberships-app.png",
        "weight-management-visit.png",
        "weight-management-team.png",
      ],
      [
        "hormone-health",
        "Keep the next conversation in sight.",
        "scheduling-month.png",
        "hormone-health-visit.png",
        "hormone-health-team.png",
      ],
      [
        "behavioral-health",
        "Protect the time for care.",
        "scheduling-showcase-telehealth.png",
        "behavioral-health-session.png",
        "behavioral-health-team.png",
      ],
      [
        "rehabilitation-pt",
        "Give every visit a place in the journey.",
        "memberships-app.png",
        "rehabilitation-visit.png",
        "rehabilitation-team.png",
      ],
      [
        "aesthetics",
        "Give the experience a thoughtful foundation.",
        "inventory-app.png",
        "aesthetics-consult.png",
        "aesthetics-team.png",
      ],
      [
        "infusion",
        "Give every treatment day room to breathe.",
        "inventory-app.png",
        "infusion-care.png",
        "infusion-team.png",
      ],
    ]) {
      expect(home).toContain(`href="/meta-clinic/${slug}"`);
      const detail = renderToStaticMarkup(
        <MetaClinicMarketing clinicTypeSlug={slug} />,
      );
      expect(detail).toContain(heading);
      expect(detail).toContain(`/marketing/${appImage}`);
      expect(detail).toContain(`/marketing/${peopleImage}`);
      expect(detail).toContain(`/marketing/${secondPeopleImage}`);
      for (const image of [appImage, peopleImage, secondPeopleImage]) {
        expect(
          existsSync(
            fileURLToPath(
              new URL(`../public/marketing/${image}`, import.meta.url),
            ),
          ),
        ).toBe(true);
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

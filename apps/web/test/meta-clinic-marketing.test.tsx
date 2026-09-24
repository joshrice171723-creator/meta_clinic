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
import { clinicTypeLabels } from "../src/features/marketing/ClinicTypePages";
import {
  clinicTypeFeatureHref,
  clinicTypeToolkits,
} from "../src/features/marketing/clinicTypeFeatures";

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

  it("links the Tracking Board with an authentic populated board capture", () => {
    const home = renderToStaticMarkup(<MetaClinicMarketing />);
    const detail = renderToStaticMarkup(
      <MetaClinicMarketing featureSlug="tracking-board" />,
    );
    expect(home).toContain('href="/meta-clinic/features/tracking-board"');
    expect(detail).toContain("Know where every visit stands.");
    expect(detail).toContain("/marketing/captures/tracking-board-varied-stages-omni.png");
    expect(detail).toContain("Tracking Board · direct synthetic app capture");
    expect(detail).toContain("/marketing/tracking-board-team.png");
    expect(
      existsSync(
        fileURLToPath(
          new URL(
            "../public/marketing/captures/tracking-board-varied-stages-omni.png",
            import.meta.url,
          ),
        ),
      ),
    ).toBe(true);
    expect(detail).not.toContain("tracking-board-overview.svg");
  });

  it("uses captured app views for inventory, billing, memberships, and invoices", () => {
    for (const [slug, filename] of [
      [
        "inventory",
        "captures/inventory-catalog-100-products.png",
      ],
      ["cash-billing", "captures/finance-open-invoice-queue.png"],
      ["cash-billing", "captures/finance-paid-invoice-detail.png"],
      [
        "memberships-packages",
        "captures/membership-catalog-five-programs.png",
      ],
      ["invoices", "captures/finance-open-invoice-detail.png"],
      ["invoices", "captures/finance-credit-dialog.png"],
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
        "captures/patient-directory-21-natural-records.png",
        "primary-care-visit.png",
        "primary-care-front-desk.png",
      ],
      [
        "membership-care",
        "Give ongoing care a clear shape.",
        "captures/membership-catalog-five-programs.png",
        "memberships-team.png",
        "memberships-front-desk.png",
      ],
      [
        "urgent-care",
        "Make the next patient visible.",
        "captures/front-desk-five-visit-queue.png",
        "urgent-care-visit.png",
        "urgent-care-handoff.png",
      ],
      [
        "weight-management",
        "Make room for steady progress.",
        "captures/membership-catalog-five-programs.png",
        "weight-management-visit.png",
        "weight-management-team.png",
      ],
      [
        "hormone-health",
        "Keep the next conversation in sight.",
        "captures/schedule-day-omni-morning.png",
        "hormone-health-visit.png",
        "hormone-health-team.png",
      ],
      [
        "behavioral-health",
        "Protect the time for care.",
        "captures/schedule-booking-omni-adapted.png",
        "behavioral-health-session.png",
        "behavioral-health-team.png",
      ],
      [
        "rehabilitation-pt",
        "Give every visit a place in the journey.",
        "captures/membership-catalog-five-programs.png",
        "rehabilitation-visit.png",
        "rehabilitation-team.png",
      ],
      [
        "aesthetics",
        "Give the experience a thoughtful foundation.",
        "captures/inventory-catalog-100-products.png",
        "aesthetics-consult.png",
        "aesthetics-team.png",
      ],
      [
        "infusion",
        "Give every treatment day room to breathe.",
        "captures/inventory-catalog-100-products.png",
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

  it("gives every clinic type its own working feature paths and contextual pages", () => {
    for (const clinicType of Object.keys(clinicTypeToolkits) as Array<
      keyof typeof clinicTypeToolkits
    >) {
      const landing = renderToStaticMarkup(
        <MetaClinicMarketing clinicTypeSlug={clinicType} />,
      );
      const selected = clinicTypeToolkits[clinicType].features;

      expect(landing).toContain(clinicTypeToolkits[clinicType].heading);
      expect(new Set(selected.map((item) => item.slug)).size).toBe(
        selected.length,
      );
      for (const item of selected) {
        const href = clinicTypeFeatureHref(clinicType, item.slug);
        expect(landing).toContain(`href="${href}"`);
        const detail = renderToStaticMarkup(
          <MetaClinicMarketing
            clinicTypeSlug={clinicType}
            featureSlug={href.split("/").at(-1)}
          />,
        );
        expect(detail).toContain(item.headline);
        expect(detail).toContain(
          item.useCase.replaceAll("&", "&amp;").replaceAll("'", "&#x27;"),
        );
        expect(detail).toContain(
          `for ${clinicTypeLabels[clinicType].replaceAll("&", "&amp;")}`,
        );
        expect(detail).toContain('class="meta-type-feature');
        expect(detail).not.toContain("That feature is not in this toolkit.");
        for (const photo of clinicTypeToolkits[clinicType].photos) {
          expect(detail).toContain(`/marketing/${photo}`);
        }
      }
    }
  }, 30_000);

  it("supports the infusion lab-results URL without presenting a related screen as lab results", () => {
    expect(clinicTypeFeatureHref("infusion", "labs-results")).toBe(
      "/meta-clinic/infusion/features/lab-results",
    );
    const page = renderToStaticMarkup(
      <MetaClinicMarketing
        clinicTypeSlug="infusion"
        featureSlug="lab-results"
      />,
    );
    expect(page).toContain("Bring lab review into treatment planning.");
    expect(page).toContain(
      "/marketing/captures/inventory-catalog-100-products.png",
    );
    expect(page).toContain("this image does not show labs &amp; results");
    expect(page).toContain('href="/meta-clinic/infusion#features"');
  });

  it("presents scheduling day, month, booking, and clinic team imagery", () => {
    const detail = renderToStaticMarkup(
      <MetaClinicMarketing featureSlug="scheduling" />,
    );

    expect(detail).toContain("Day view");
    expect(detail).toContain("Month view");
    expect(detail).toContain("captures/schedule-day-omni-morning.png");
    expect(detail).toContain("captures/schedule-day-omni-afternoon.png");
    expect(detail).toContain("captures/schedule-booking-omni-adapted.png");
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

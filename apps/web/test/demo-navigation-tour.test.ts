import { describe, expect, it } from "vitest";
import { demoRouteAllowed } from "../src/features/demo/DemoFrameBoundary";

const origin = "http://localhost:3230";
const navigationTour = {
  active: true,
  run: {
    lesson_key: "navigation_tour",
    mode: "clinic" as const,
    steps: [],
  },
};

describe("navigation tour routing", () => {
  it("allows each clinic navigation destination", () => {
    for (const href of [
      "/clinic",
      "/clinic/work",
      "/clinic/schedule",
      "/clinic/patients",
      "/clinic/refills",
      "/clinic/recalls",
      "/clinic/telehealth",
      "/clinic/scribe",
      "/clinic/front-desk",
      "/clinic/waitlist",
      "/clinic/operations",
      "/clinic/reminders",
      "/clinic/messages",
      "/clinic/inventory",
      "/clinic/workforce",
      "/clinic/billing",
      "/clinic/subscriptions",
      "/clinic/growth",
      "/clinic/setup",
      "/clinic/settings",
    ]) {
      expect(demoRouteAllowed(href, navigationTour, origin)).toBe(true);
    }
  });

  it("blocks clinic detail pages and non-clinic destinations", () => {
    expect(
      demoRouteAllowed("/clinic/patients/12", navigationTour, origin),
    ).toBe(false);
    expect(demoRouteAllowed("/portal", navigationTour, origin)).toBe(false);
  });
});

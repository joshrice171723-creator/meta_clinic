import { describe, expect, it } from "vitest";
import { demoRouteAllowed } from "../src/features/demo/DemoFrameBoundary";

const origin = "http://localhost:3230";
const clinic = {
  active: true,
  run: {
    mode: "clinic" as const,
    steps: [
      { id: "setup", href: "/clinic/setup", status: "complete" },
      { id: "publish", href: "/clinic/subscriptions", status: "available" },
      { id: "schedule", href: "/clinic/schedule", status: "locked" },
      { id: "enroll", href: "/memberships/example", status: "available" },
    ],
  },
};

describe("guided demo navigation", () => {
  it("allows unlocked lessons and their detail pages", () => {
    expect(demoRouteAllowed("/clinic/subscriptions", clinic, origin)).toBe(
      true,
    );
    expect(demoRouteAllowed("/clinic/subscriptions/12", clinic, origin)).toBe(
      true,
    );
  });

  it("blocks locked lessons, unrelated pages and external destinations", () => {
    for (const href of [
      "/clinic/schedule",
      "/clinic/patients",
      "/clinic/subscriptions-other",
      "https://example.com/clinic/setup",
    ]) {
      expect(demoRouteAllowed(href, clinic, origin)).toBe(false);
    }
    expect(demoRouteAllowed("/clinic/setup", { active: false }, origin)).toBe(
      false,
    );
  });

  it("requires the server-selected view when moving between clinic and patient lessons", () => {
    expect(demoRouteAllowed("/memberships/example", clinic, origin)).toBe(
      false,
    );
    const patient = {
      ...clinic,
      run: { ...clinic.run, mode: "patient" as const },
    };
    expect(demoRouteAllowed("/memberships/example", patient, origin)).toBe(
      true,
    );
    expect(demoRouteAllowed("/clinic/setup", patient, origin)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { demoRouteAllowed } from "../src/features/demo/DemoFrameBoundary";
import { nextDemoStep } from "../src/features/demo/progression";
import type { DemoRun, DemoRunStep } from "../src/features/demo/contracts";
import {
  DEMO_ROLES,
  roleLesson,
  rolePrerequisite,
} from "../src/features/demo/roles";

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
  it("selects the earliest available role lesson before a completed fallback", () => {
    const run = {
      view: "clinic",
      steps: [
        { id: "setup", title: "Set up clinic", status: "complete" },
        { id: "publish", title: "Publish offering", status: "available" },
      ],
    } as DemoRun;
    expect(roleLesson(run, DEMO_ROLES[0]!)?.id).toBe("publish");
  });

  it("explains a locked role with its incomplete prerequisite title", () => {
    const run = {
      view: "clinic",
      steps: [
        { id: "setup", title: "Set up clinic", status: "locked", requires: [] },
        {
          id: "schedule",
          title: "Schedule visit",
          status: "locked",
          requires: ["setup"],
        },
      ],
    } as DemoRun;
    expect(rolePrerequisite(run, DEMO_ROLES[2]!)).toBe(
      "Complete “Set up clinic” to open this workspace.",
    );
  });

  it("follows the current lesson dependency before switching workflow branches", () => {
    const lesson = (id: string, requires: string[]): DemoRunStep => ({
      id,
      requires,
      title: id,
      description: "",
      href: "/clinic",
      status: "available",
    });
    const steps = [
      lesson("enroll", ["publish"]),
      lesson("schedule", ["payment"]),
      lesson("inventory_receive", ["setup"]),
      lesson("inventory_count", ["inventory_receive"]),
    ];
    expect(nextDemoStep(steps, "publish")?.id).toBe("enroll");
    expect(nextDemoStep(steps, "inventory_receive")?.id).toBe(
      "inventory_count",
    );
    expect(nextDemoStep([], "visit")).toBeUndefined();
  });
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

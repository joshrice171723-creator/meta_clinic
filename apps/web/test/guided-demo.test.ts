import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoRouteAllowed } from "../src/features/demo/DemoFrameBoundary";
import {
  isNavigationTour,
  lessonInstructions,
  LessonCatalog,
} from "../src/features/demo/DemoJourney";
import { nextDemoStep } from "../src/features/demo/progression";
import {
  spotlightDirection,
  showsDemoCoach,
  tutorialActionMatches,
  visitSaveLessonSteps,
} from "../src/features/demo/DemoSpotlight";
import {
  lessonGuide,
  supportedLessonGuideIds,
} from "../src/features/demo/lessonGuidance";
import { telehealthDate } from "../src/features/telehealth/TelehealthQueue";
import type { DemoRun, DemoRunStep } from "../src/features/demo/contracts";
import {
  DEMO_ROLES,
  roleLesson,
  rolePrerequisite,
} from "../src/features/demo/roles";

const origin = "http://localhost:3230";
describe("telehealth lesson queue", () => {
  it("formats the appointment date used by the prepared queue", () => {
    expect(telehealthDate("UTC", new Date("2026-09-20T00:30:00Z"))).toBe(
      "2026-09-20",
    );
  });
});

describe("SOAP note lesson guidance", () => {
  it("uses an ordered chart-to-save path", () => {
    expect(lessonInstructions("visit_save")).toEqual([
      "Open the prepared chart.",
      "Apply the prepared SOAP template.",
      "Add the supplied follow-up update to Additional subjective history.",
      "Save the unsigned draft.",
    ]);
    expect(visitSaveLessonSteps).toHaveLength(4);
    expect(
      tutorialActionMatches("visit_save", "Confirm and begin charting"),
    ).toBe(true);
    expect(tutorialActionMatches("visit_save", "Save draft")).toBe(false);
  });
});

describe("guided lesson schema", () => {
  it("keeps the floating coach out of ordinary action lessons", () => {
    expect(showsDemoCoach("clinic_setup", false)).toBe(false);
    expect(showsDemoCoach("visit_save", false)).toBe(true);
    expect(showsDemoCoach("messages_review", true)).toBe(true);
  });

  it("guides clinic setup through a saved scope choice before finalization", () => {
    expect(lessonInstructions("clinic_setup")).toEqual([
      "Under Services this clinic intends to provide, select Telehealth visits and read its Base workflow readiness label.",
      "Select Save clinic profile and wait for the confirmation that the selected scope was saved.",
      "Review the saved clinic type and service scope, then select Finalize clinic setup.",
    ]);
    expect(tutorialActionMatches("clinic_setup", "Telehealth visits")).toBe(
      true,
    );
  });

  it("gives every supported workflow a complete learner brief", () => {
    expect(supportedLessonGuideIds).toHaveLength(38);
    for (const lessonId of supportedLessonGuideIds) {
      const guide = lessonGuide(lessonId);
      expect(guide.goal).not.toHaveLength(0);
      expect(guide.constraints).not.toHaveLength(0);
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      expect(guide.steps.length).toBeLessThanOrEqual(5);
      expect(guide.doneWhen).not.toHaveLength(0);
      expect(guide.recap).not.toHaveLength(0);
    }
  });

  it("reuses the complete workflow guide for specialty variants", () => {
    expect(lessonGuide("primary_care__visit_save").steps).toEqual(
      lessonGuide("visit_save").steps,
    );
    expect(
      lessonGuide("weight_management__appointment_schedule").goal,
    ).toContain("weight-management scenario");
  });
});

describe("tutorial target visibility", () => {
  it("guides both specialty note lessons through opening the chart", () => {
    expect(
      tutorialActionMatches(
        "primary_care__visit_save",
        "Confirm and open chart",
      ),
    ).toBe(true);
    expect(
      tutorialActionMatches(
        "weight_management__visit_complete",
        "Confirm and open chart",
      ),
    ).toBe(true);
  });
  it.each([
    [-100, 100, "above"],
    [800, 100, "below"],
    [100, -100, "to the left"],
    [100, 1200, "to the right"],
    [100, 100, null],
    [-25, 100, null],
    [775, 100, null],
  ])("locates a target at top %s, left %s", (top, left, direction) => {
    expect(
      spotlightDirection(
        { top: Number(top), left: Number(left), width: 50, height: 50 },
        1200,
        800,
      ),
    ).toBe(direction);
  });
});
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
  it("offers an explicit finish action for the read-only navigation tour", () => {
    expect(isNavigationTour("navigation_tour")).toBe(true);
    expect(isNavigationTour("patient_flow_review")).toBe(false);
  });

  it("renders grouped lesson roles with unique accessible open actions and prepared state", () => {
    const html = renderToStaticMarkup(
      createElement(LessonCatalog, {
        busy: false,
        onSelect: () => undefined,
        lessons: [
          {
            id: "clinic_setup",
            title: "Set up clinic",
            description: "Create the clinic.",
            role: "administrator",
            prepared: ["Sample clinic"],
            status: "complete",
          },
          {
            id: "inventory_receive",
            title: "Receive shipment",
            description: "Record a shipment.",
            role: "inventory",
            prepared: ["Sample shipment"],
            status: "available",
          },
        ],
      }),
    );
    expect(html).toContain("Clinic administrator");
    expect(html).toContain("Inventory coordinator");
    expect(html).toContain('aria-label="Open Set up clinic"');
    expect(html).toContain('aria-label="Open Receive shipment"');
    expect(html).toContain("Sample shipment");
    expect(html).not.toContain(">Complete<");
    expect(html).toContain("Primary care");
    expect(html).toContain("Weight management");
  });

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

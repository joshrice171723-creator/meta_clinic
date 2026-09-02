import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clinicRoute,
  clinicRouteHref,
  clinicTarget,
  normalizeClinicPath,
} from "../src/features/clinic/clinicNavigation";

describe("clinic-local navigation", () => {
  it("canonicalizes tracking and schedule as views of the same URL", () => {
    expect(normalizeClinicPath("/clinic/schedule/")).toBe("/clinic");
    expect(clinicRoute("/clinic")).toEqual({
      path: "/clinic",
      search: "",
      homeView: "tracking",
    });
    const schedule = clinicRoute("/clinic/schedule", "?page=3");
    expect(schedule).toEqual({
      path: "/clinic",
      search: "",
      homeView: "schedule",
    });
    expect(clinicRouteHref(schedule)).toBe("/clinic");
    expect(clinicRoute("/clinic", "", "schedule").homeView).toBe("schedule");
  });

  it("intercepts only same-origin clinic destinations", () => {
    expect(
      clinicTarget("/clinic/patients/7", "https://apply.test")?.pathname,
    ).toBe("/clinic/patients/7");
    expect(clinicTarget("/portal", "https://apply.test")).toBeNull();
    expect(clinicTarget("/clinician", "https://apply.test")).toBeNull();
    expect(clinicTarget("http://[", "https://apply.test")).toBeNull();
    expect(
      clinicTarget("https://outside.test/clinic", "https://apply.test"),
    ).toBeNull();
  });

  it("keeps view paging and signed-chart resolution inside React", () => {
    const careFlow = readFileSync(
      new URL("../src/features/clinic/CareFlow.tsx", import.meta.url),
      "utf8",
    );
    const chartSelection = readFileSync(
      new URL("../src/features/clinic/ChartSelectionPage.tsx", import.meta.url),
      "utf8",
    );
    const clinicFrame = readFileSync(
      new URL("../src/features/clinic/ClinicFrame.tsx", import.meta.url),
      "utf8",
    );
    expect(careFlow).not.toContain("window.location.assign(`/clinic/schedule");
    expect(careFlow).toContain("onPageChange?.(page)");
    expect(chartSelection).not.toContain("window.location.replace(");
    expect(chartSelection).toContain("{ replace: true }");
    expect(clinicFrame).toContain(
      '"nav a, nav button, .clinic-sidebar-bottom a"',
    );
  });
});

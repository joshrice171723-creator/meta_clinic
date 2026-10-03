import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clinicRoute,
  clinicRouteHref,
  clinicTarget,
  createClinicNavigationGuard,
  normalizeClinicPath,
} from "../src/features/clinic/clinicNavigation";

const readSource = (path: string | URL) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

afterEach(() => vi.unstubAllGlobals());

describe("clinic navigation write protection", () => {
  it("denies unresolved navigation even when discard would be accepted, then releases it on cleanup", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { confirm });
    const guard = createClinicNavigationGuard();
    const unregister = guard.registerBlocker(() => "Unknown write", {
      preventNavigation: true,
    });
    expect(guard.confirmNavigation()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    unregister();
    unregister();
    expect(guard.confirmNavigation()).toBe(true);
  });

  it("retains existing discard decisions and does not block an unrelated guard", () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { confirm });
    const guard = createClinicNavigationGuard();
    let unresolved = true;
    guard.registerBlocker(() => (unresolved ? "Pending write" : null), {
      preventNavigation: true,
    });
    expect(createClinicNavigationGuard().confirmNavigation()).toBe(true);
    unresolved = false;
    const unregister = guard.registerBlocker(() => "Unsaved draft");
    expect(guard.confirmNavigation()).toBe(true);
    expect(confirm).toHaveBeenCalledWith("Unsaved draft");
    confirm.mockReturnValue(false);
    expect(guard.confirmNavigation()).toBe(false);
    unregister();
    expect(guard.confirmNavigation()).toBe(true);
  });
});

describe("clinic-local navigation", () => {
  it("retains the advertised anchor and query through canonical routing", () => {
    const target = clinicTarget(
      "/clinic/operations?site=7#connectors-transmissions",
      "https://apply.test",
    )!;
    const route = clinicRoute(
      target.pathname,
      target.search,
      undefined,
      target.hash,
    );
    expect(clinicRouteHref(route)).toBe(
      "/clinic/operations?site=7#connectors-transmissions",
    );
    expect(
      clinicRouteHref(
        clinicRoute("/clinic", "?patient_id=105", undefined, "#visit"),
      ),
    ).toBe("/clinic/schedule?patient_id=105#visit");
    expect(clinicRouteHref(clinicRoute("/clinic"))).toBe("/clinic");
  });
  it("keeps tracking and schedule as canonical routes without dropping context", () => {
    expect(normalizeClinicPath("/clinic/schedule/")).toBe("/clinic/schedule");
    expect(clinicRoute("/clinic")).toEqual({
      path: "/clinic",
      search: "",
      homeView: "tracking",
    });
    const schedule = clinicRoute("/clinic/schedule", "?page=3");
    expect(schedule).toEqual({
      path: "/clinic/schedule",
      search: "?page=3",
      homeView: "schedule",
    });
    expect(clinicRouteHref(schedule)).toBe("/clinic/schedule?page=3");
    const contextualSchedule = clinicRoute(
      "/clinic/schedule",
      "?page=3&patient_id=105&ignored=value",
    );
    expect(contextualSchedule).toEqual({
      path: "/clinic/schedule",
      search: "?page=3&patient_id=105&ignored=value",
      homeView: "schedule",
    });
    expect(clinicRouteHref(contextualSchedule)).toBe(
      "/clinic/schedule?page=3&patient_id=105&ignored=value",
    );
  });

  it("maps legacy schedule context while preserving the tracking-board route", () => {
    expect(clinicRoute("/clinic", "?patient_id=105&mode=book")).toEqual({
      path: "/clinic/schedule",
      search: "?patient_id=105&mode=book",
      homeView: "schedule",
    });
    expect(clinicRoute("/clinic", "?visit_modality=video")).toEqual({
      path: "/clinic/schedule",
      search: "?visit_modality=video",
      homeView: "schedule",
    });
    expect(clinicRoute("/clinic", "?page=3", "schedule")).toEqual({
      path: "/clinic/schedule",
      search: "?page=3",
      homeView: "schedule",
    });
    expect(clinicRoute("/clinic", "?page=3", "tracking")).toEqual({
      path: "/clinic",
      search: "?page=3",
      homeView: "tracking",
    });
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
    const careFlow = readSource(
      new URL("../src/features/clinic/CareFlow.tsx", import.meta.url),
    );
    const chartSelection = readSource(
      new URL("../src/features/clinic/ChartSelectionPage.tsx", import.meta.url),
    );
    const clinicFrame = readSource(
      new URL("../src/features/clinic/ClinicFrame.tsx", import.meta.url),
    );
    expect(careFlow).not.toContain("window.location.assign(`/clinic/schedule");
    expect(careFlow).toContain("onPageChange?.(page)");
    expect(chartSelection).not.toContain("window.location.replace(");
    expect(chartSelection).toContain("{ replace: true }");
    expect(clinicFrame).toContain(
      '"nav a, nav button, .clinic-sidebar-bottom a"',
    );
  });

  it("preserves the authenticated shell while switching clinic history routes", () => {
    const app = readSource(new URL("../src/App.tsx", import.meta.url));
    const workspace = readSource(
      new URL("../src/features/clinic/Workspace.tsx", import.meta.url),
    );
    expect(app).toContain("window.history[method]");
    expect(app).toContain('window.addEventListener("popstate", restore)');
    expect(app).toMatch(/<Workspace\s+key=\{user.id\}/);
    expect(workspace).toContain(
      "const { navigate, confirmNavigation } = useClinicNavigation();",
    );
    expect(workspace).toMatch(/event\.preventDefault\(\);\s+navigate\(/);
    expect(app).toContain('route.path === "/clinic/schedule"');
  });

  it("uses Workforce Employees as the single employee administration destination", () => {
    const app = readSource(new URL("../src/App.tsx", import.meta.url));
    const workspace = readSource(
      new URL("../src/features/clinic/Workspace.tsx", import.meta.url),
    );
    const employees = readSource(
      new URL(
        "../src/features/workforce/EmploymentAdminPage.tsx",
        import.meta.url,
      ),
    );

    expect(workspace).not.toContain('href: "/clinic/staff"');
    expect(app).toContain(
      '<ClinicLegacyRedirect to="/clinic/workforce/employees" />',
    );
    expect(employees).toContain('label="Employee name"');
    expect(employees).toContain('label="Job title"');
    expect(employees).toContain('label="Access role"');
    expect(employees).toContain('label="Create a new employee login"');
  });

  it("gives implementation specialists one clinic setup destination", () => {
    const app = readSource(new URL("../src/App.tsx", import.meta.url));
    const workspace = readSource(
      new URL("../src/features/clinic/Workspace.tsx", import.meta.url),
    );
    const setup = readSource(
      new URL(
        "../src/features/clinic/PracticeFeatureSettings.tsx",
        import.meta.url,
      ),
    );

    expect(app).toContain(
      'path === "/clinic/setup" || path === "/clinic/facilities"',
    );
    expect(workspace).toContain('href: "/clinic/setup"');
    expect(workspace).toContain("capabilities.facilities_read === true");
    expect(workspace).toContain(
      'if (capabilities.facilities_read) return "/clinic/setup";',
    );
    expect(setup).toContain("Implementation Specialist (FDE)");
    expect(setup).toMatch(/does not grant clinical\s+authority/);
    expect(setup).toContain("Hardening required");
  });

  it("keeps the calendar handoff and board refresh/listeners component-local", () => {
    const careFlow = readSource(
      new URL("../src/features/clinic/CareFlow.tsx", import.meta.url),
    );
    const board = readSource(
      new URL("../src/features/clinic/TrackingBoardPage.tsx", import.meta.url),
    );
    expect(careFlow).toContain("<ClinicSchedule");
    expect(careFlow).not.toContain("const [page, setPage] = useState(1);");
    expect(careFlow).toContain('data-clinic-view="tracking"');
    expect(careFlow).toContain("Return to tracking board");
    expect(careFlow).not.toContain("window.history.pushState");
    expect(board).toContain("if (!active) return;");
    expect(board).toContain("useTrackingBoard(active)");
  });

  it("guards in-app SOAP navigation while retaining hard auth exits", () => {
    const careFlow = readSource(
      new URL(
        "../src/features/clinic/CareSoapNoteWorkspace.tsx",
        import.meta.url,
      ),
    );
    const app = readSource(new URL("../src/App.tsx", import.meta.url));
    expect(careFlow).toContain("registerBlocker(");
    expect(careFlow).toContain("unsaved changes. Leave the chart");
    expect(careFlow).toContain("window.location.replace(");
    expect(careFlow).toContain("currentLoginDestination()");
    expect(app).toContain('window.location.replace(\n        "/login?next="');
  });

  it("closes the compact drawer after an in-drawer destination click", () => {
    const frame = readSource(
      new URL("../src/features/clinic/ClinicFrame.tsx", import.meta.url),
    );
    expect(frame).toContain("nav a, nav button, .clinic-sidebar-bottom a");
    expect(frame).toContain("if (!drawer) return;");
    expect(frame).toContain("panel.current?.querySelector<HTMLAnchorElement>");
    expect(frame).toMatch(
      /drawer &&\s*!event\.defaultPrevented &&\s*event\.key === "Escape"/,
    );
    expect(frame).toContain('window.location.replace("/login")');
  });
});

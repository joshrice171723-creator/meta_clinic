import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clinicRoute,
  clinicRouteHref,
  clinicTarget,
  normalizeClinicPath,
} from "../src/features/clinic/clinicNavigation";

const readSource = (path: string | URL) =>
  readFileSync(path, "utf8").replaceAll("\r\n", "\n");

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
    expect(app).toContain("<Workspace\n        key={user.id}");
    expect(workspace).toContain("const { navigate } = useClinicNavigation();");
    expect(workspace).toContain(
      "event.preventDefault();\n                navigate(",
    );
  });

  it("keeps schedule paging and board refresh/listeners component-local", () => {
    const careFlow = readSource(
      new URL("../src/features/clinic/CareFlow.tsx", import.meta.url),
    );
    const board = readSource(
      new URL("../src/features/clinic/TrackingBoardPage.tsx", import.meta.url),
    );
    expect(careFlow).toContain("const [page, setPage] = useState(1);");
    expect(careFlow).toContain("onPageChange={setPage}");
    expect(careFlow).toContain('data-clinic-view="tracking"');
    expect(careFlow).toContain("Return to tracking board");
    expect(careFlow).not.toContain("window.history.pushState");
    expect(board).toContain("if (!active) return;");
    expect(board).toContain("useTrackingBoard(active)");
  });

  it("guards in-app SOAP navigation while retaining hard auth exits", () => {
    const careFlow = readSource(
      new URL("../src/features/clinic/CareFlow.tsx", import.meta.url),
    );
    const app = readSource(new URL("../src/App.tsx", import.meta.url));
    expect(careFlow).toContain("registerBlocker(");
    expect(careFlow).toContain("unsaved changes. Leave the chart");
    expect(careFlow).toContain('window.location.replace("/login")');
    expect(app).toContain('window.location.replace(\n        "/login?next="');
  });

  it("closes the compact drawer after an in-drawer destination click", () => {
    const frame = readSource(
      new URL("../src/features/clinic/ClinicFrame.tsx", import.meta.url),
    );
    expect(frame).toContain("nav a, nav button, .clinic-sidebar-bottom a");
    expect(frame).toContain("if (!drawer) return;");
    expect(frame).toContain("panel.current?.querySelector<HTMLAnchorElement>");
    expect(frame).toContain('window.location.replace("/login")');
  });
});

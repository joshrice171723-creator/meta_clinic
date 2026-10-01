import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canLoadClinicOverview,
  clinicOverviewRequired,
  requiresClinicSetup,
  requiresLocationSelection,
} from "../src/features/clinic/locationSelection";

const frame = readFileSync(
  new URL("../src/features/clinic/ClinicFrame.tsx", import.meta.url),
  "utf8",
);
const frameCss = readFileSync(
  new URL("../src/features/clinic/clinicFrame.css", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../src/features/clinic/Workspace.tsx", import.meta.url),
  "utf8",
);

describe("clinic shell composition", () => {
  it("switches from the dropdown without reloading into the initial picker", () => {
    expect(workspace).toContain(
      "onLocationChange={(siteId) => void selectSite(siteId)}",
    );
    expect(workspace).not.toContain("window.location.reload()");
    expect(workspace).toContain("setLocationSelectionMade(true)");
    expect(workspace).toContain("refreshWorkspace();");
    expect(workspace).toContain("overview.refresh();");
    expect(workspace).toContain("data === previousLocationContext");
    expect(workspace).toContain("if (selectingLocation.current) return;");
    expect(workspace).toContain("setPreviousLocationContext(null)");
    expect(workspace).toContain("{locationPickerError && (");
  });

  it("uses a compact conventional menu control and preserves drawer safeguards", () => {
    expect(frame).toContain('className="clinic-menu-toggle"');
    expect(frame).toContain("MenuIcon");
    expect(frame).toContain("CloseIcon");
    expect(frame).toContain("LaunchIcon");
    expect(frame).not.toContain("PublicIcon");
    expect(frame).toContain('aria-label={collapsed ? "Open clinic menu"');
    expect(frame).toMatch(
      /drawer &&\s*!event\.defaultPrevented &&\s*event\.key === "Escape"/,
    );
    expect(frame).toContain("panel.current?.querySelector<HTMLAnchorElement>");
    expect(frame).toContain('window.location.replace("/login")');
    expect(frame).toContain('className="practice-location"');
    expect(frame).toContain('aria-label="Current clinic location"');
    expect(frame).not.toContain("data-focus-mode");
    expect(frame).toContain("Select a location");
    expect(frame).not.toContain("clinic-chart-tab");
  });

  it("keeps a stable desktop rail, tablet-first layout, and safe phone drawer fallback", () => {
    expect(frameCss).toContain("grid-template-columns: 232px minmax(0, 1fr)");
    expect(frameCss).toContain("display: none");
    expect(frameCss).toContain("@media (max-width: 900px)");
    expect(frameCss).toContain("gap: 12px");
    expect(frameCss).toContain("font-size: 18px");
    expect(frameCss).toContain("display: flex");
    expect(frameCss).toContain("position: fixed");
    expect(frameCss).toContain(".clinic-content.scribe-page");
    expect(frameCss).not.toContain("box-shadow");
    expect(frameCss).not.toContain("clinic-chart-tab");
  });

  it("keeps current clinic context and the launch workspace exit in the shell", () => {
    for (const icon of [
      "DashboardIcon",
      "PersonSearchIcon",
      "CalendarMonthIcon",
      "StorefrontIcon",
      "Inventory2Icon",
      "PeopleAltIcon",
      "SettingsIcon",
    ])
      expect(workspace).toContain(icon);
    expect(workspace).toMatch(
      /className=\{`clinic-topbar\$\{user\.development_demo/,
    );
    expect(workspace).toContain('className="clinic-topbar-location"');
    expect(workspace).toContain('path.startsWith("/clinic/scribe")');
    expect(workspace).toContain("data?.current_site?.name");
    expect(workspace).toContain('method: "PATCH"');
    expect(frame).toContain('href="/portal"');
    expect(frame).not.toContain('href="/"');
  });

  it("requires an explicit location selection before rendering a multi-location workspace", () => {
    expect(workspace).toContain(
      "Choose a location you are authorized to use before entering the",
    );
    expect(workspace).toContain(
      "requiresLocationSelection(data.sites, locationSelected)",
    );
    expect(workspace).toContain("clinicOverviewRequired(path)");
    expect(workspace).not.toContain("Continue without selecting");
    expect(requiresLocationSelection([{ id: 1 }, { id: 2 }], false)).toBe(true);
    expect(requiresLocationSelection([{ id: 1 }, { id: 2 }], true)).toBe(false);
    expect(canLoadClinicOverview(undefined, false)).toBe(false);
    expect(canLoadClinicOverview([{ id: 1 }], false)).toBe(true);
    expect(canLoadClinicOverview([{ id: 1 }, { id: 2 }], false)).toBe(false);
    expect(canLoadClinicOverview([{ id: 1 }, { id: 2 }], true)).toBe(true);
    expect(canLoadClinicOverview([{ id: 1 }], false, false)).toBe(false);
    expect(clinicOverviewRequired("/clinic/operations")).toBe(true);
    expect(clinicOverviewRequired("/clinic/inventory")).toBe(true);
    expect(clinicOverviewRequired("/clinic")).toBe(false);
    expect(clinicOverviewRequired("/clinic/work")).toBe(false);
  });

  it("gates a selected site until its specialty and setup are finalized", () => {
    expect(requiresClinicSetup(null, undefined)).toBe(false);
    expect(requiresClinicSetup(4, undefined)).toBe(true);
    expect(
      requiresClinicSetup(4, {
        site_specialty_configured: true,
        configured: true,
        finalized: false,
      }),
    ).toBe(true);
    expect(
      requiresClinicSetup(4, {
        site_specialty_configured: true,
        configured: true,
        finalized: true,
      }),
    ).toBe(false);
  });

  it("keeps 1024px rail use while moving portrait tablet widths into the drawer fallback", () => {
    expect(frame).toContain('COMPACT_NAV_QUERY = "(max-width: 900px)"');
    expect(frameCss).toContain("grid-template-columns: 232px minmax(0, 1fr)");
    expect(frameCss).toContain("@media (max-width: 900px)");
  });
});

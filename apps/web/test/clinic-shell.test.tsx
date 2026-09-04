import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
  it("uses a compact conventional menu control and preserves drawer safeguards", () => {
    expect(frame).toContain('className="clinic-menu-toggle"');
    expect(frame).toContain("MenuIcon");
    expect(frame).toContain("CloseIcon");
    expect(frame).toContain("LaunchIcon");
    expect(frame).toContain("PublicIcon");
    expect(frame).toContain('aria-label={collapsed ? "Open clinic menu"');
    expect(frame).toContain('if (event.key === "Escape" && !collapsed)');
    expect(frame).toContain("panel.current?.querySelector<HTMLAnchorElement>");
    expect(frame).toContain('window.location.replace("/login")');
    expect(frame).toContain('className="practice-location"');
    expect(frame).toContain('aria-label="Current clinic location"');
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
    expect(frameCss).not.toContain("box-shadow");
    expect(frameCss).not.toContain("clinic-chart-tab");
  });

  it("keeps current clinic context and cross-product exits in the shell", () => {
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
    expect(workspace).toContain('className="clinic-topbar"');
    expect(workspace).toContain('className="clinic-topbar-location"');
    expect(workspace).toContain("data?.current_site?.name");
    expect(workspace).toContain('method: "PATCH"');
    expect(frame).toContain('href="/portal"');
    expect(frame).toContain('href="/"');
  });

  it("keeps 1024px rail use while moving portrait tablet widths into the drawer fallback", () => {
    expect(frame).toContain('COMPACT_NAV_QUERY = "(max-width: 900px)"');
    expect(frameCss).toContain("grid-template-columns: 232px minmax(0, 1fr)");
    expect(frameCss).toContain("@media (max-width: 900px)");
  });
});

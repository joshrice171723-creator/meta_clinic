import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClinicCapabilities } from "../src/api/contracts";
import { OperationsReportsCatalog } from "../src/features/clinic/OperationsReportsCatalog";

const capabilities: ClinicCapabilities = {
  patients: false,
  patients_write: false,
  staff: false,
  inventory: false,
  appointments: false,
  encounters: false,
  notes_read: false,
  notes_write: false,
  documents: false,
  messages: false,
  billing: false,
  roles: false,
  appointments_read: true,
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T01:30:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function dateControl(timezone?: string) {
  const html = renderToStaticMarkup(
    <OperationsReportsCatalog
      capabilities={capabilities}
      siteId={1}
      timezone={timezone}
    />,
  );
  expect(html).toContain("End-of-day closeout");
  const input = html.match(/<input[^>]*type="date"[^>]*>/)?.[0];
  expect(input).toBeDefined();
  return { html, value: input!.match(/value="([^"]*)"/)?.[1] };
}
it("renders without window and leaves date selection empty without a clinic timezone", () => {
  vi.stubGlobal("window", undefined);
  const result = dateControl();
  expect(result.value).toBe("");
  expect(result.html).toContain("Show report");
});
it("renders without window using the clinic-local date at a UTC day boundary", () => {
  vi.stubGlobal("window", undefined);
  expect(dateControl("America/Los_Angeles").value).toBe("2026-09-30");
});
it("retains a browser URL date ahead of the timezone fallback", () => {
  vi.stubGlobal("window", {
    location: { search: "?date=2026-09-12&site_id=1" },
  });
  const result = dateControl("America/Los_Angeles");
  expect(result.value).toBe("2026-09-12");
  expect(result.html).toContain("Refresh report");
});
it.each(["", "?date=not-a-date", "?date=2026-9-2"])(
  "uses the clinic-local fallback for missing/malformed query %s",
  (search) => {
    vi.stubGlobal("window", { location: { search } });
    expect(dateControl("America/Los_Angeles").value).toBe("2026-09-30");
  },
);
it.each(["", "?date=not-a-date"])(
  "does not infer a date without query or timezone for %s",
  (search) => {
    vi.stubGlobal("window", { location: { search } });
    expect(dateControl().value).toBe("");
  },
);
it("retains a valid browser URL date even without a supplied timezone", () => {
  vi.stubGlobal("window", { location: { search: "?date=2026-09-12" } });
  expect(dateControl().value).toBe("2026-09-12");
});

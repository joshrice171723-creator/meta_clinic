import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingDurationMinutes,
  bookingEndTime,
  Schedule,
} from "../src/features/clinic/CareFlow";

const scenario = vi.hoisted(() => ({ timezone: "UTC" }));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    practice: { timezone: scenario.timezone },
    capabilities: { appointments: true, patients: true },
    sites: [{ id: 4, code: "SYN", timezone_override: scenario.timezone }],
  }),
}));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => ({ registerBlocker: vi.fn() }),
}));
vi.mock("../src/features/clinic/useWorkingDraft", () => ({
  useWorkingDraft: () => ({
    ready: true,
    restored: null,
    save: vi.fn(),
    clear: vi.fn(),
    reload: vi.fn(),
  }),
}));
vi.mock("../src/shared/ui", async (original) => ({
  ...(await original<typeof import("../src/shared/ui")>()),
  useResource: (path: string) => ({
    data: path.includes("type=sites")
      ? {
          sites: [{ id: 4, code: "SYN", timezone_override: scenario.timezone }],
        }
      : path.includes("type=rooms")
        ? { rooms: [] }
        : path.includes("type=visit_types")
          ? { visit_types: [] }
          : path.includes("/clinicians")
            ? { clinicians: [{ id: 9, display_name: "Synthetic clinician" }] }
            : undefined,
    refresh: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  scenario.timezone = "UTC";
});
afterEach(() => vi.useRealTimers());

function bookingHtml(starts_at: string, ends_at: string) {
  const schedule = Schedule({ search: "" });
  return renderToStaticMarkup(
    schedule.props.renderBooking(
      { site_id: 4, clinician_id: 9, starts_at, ends_at },
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
    ),
  );
}

// Run under UTC and America/Chicago to exercise the browser-local datetime
// inputs independently of the clinic timezone. No API mutation is performed.
function deviceValue(instant: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(instant))
    .replace(" ", "T");
}

describe("Muse 180 booking form timezone defaults", () => {
  it("keeps duration arithmetic on instants across DST changes and midnight", () => {
    for (const start of [
      "2026-03-08T07:45:00Z",
      "2026-11-01T06:45:00Z",
      "2026-10-07T04:45:00Z",
    ]) {
      const end = new Date(Date.parse(start) + 45 * 60_000).toISOString();
      expect(bookingEndTime(start, 45)).toBe(deviceValue(end));
      expect(bookingDurationMinutes(start, end)).toBe(45);
    }
    expect(bookingEndTime("", 45)).toBeNull();
  });

  it("preserves October 6 at 09:00 UTC clinic time even when the device shows 04:00", () => {
    const html = bookingHtml("2026-10-06T09:00:00Z", "2026-10-06T09:30:00Z");
    expect(html).toContain(`value="${deviceValue("2026-10-06T09:00:00Z")}"`);
    expect(html).toContain(`value="${deviceValue("2026-10-06T09:30:00Z")}"`);
    expect(html).toContain("9:00 AM clinic time");
  });

  it("uses the clinic's Chicago opening instant instead of interpreting it as device time", () => {
    scenario.timezone = "America/Chicago";
    const html = bookingHtml("2026-10-06T14:00:00Z", "2026-10-06T14:30:00Z");
    expect(html).toContain(`value="${deviceValue("2026-10-06T14:00:00Z")}"`);
    expect(html).toContain(`value="${deviceValue("2026-10-06T14:30:00Z")}"`);
    expect(html).toContain("9:00 AM clinic time");
  });
});

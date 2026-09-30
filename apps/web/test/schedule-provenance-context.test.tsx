import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarResponse } from "../src/api/contracts";
import type { CalendarBooking } from "../src/features/clinic/ClinicSchedule";

const hooks = vi.hoisted(() => ({
  cursor: 0,
  refCursor: 0,
  states: [] as { value: unknown; set: (next: unknown) => void }[],
  refs: [] as { current: unknown }[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useRef: (value: unknown) => {
    const index = hooks.refCursor++;
    return (hooks.refs[index] ??= { current: value });
  },
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!hooks.states[index]) {
      const slot = {
        value: initial,
        set: (next: unknown) => {
          slot.value = typeof next === "function" ? next(slot.value) : next;
        },
      };
      hooks.states[index] = slot;
    }
    return [hooks.states[index].value, hooks.states[index].set];
  },
}));
vi.mock("@mui/material", () =>
  Object.fromEntries(
    [
      "Alert",
      "Box",
      "Button",
      "ButtonBase",
      "Chip",
      "Dialog",
      "DialogActions",
      "DialogContent",
      "DialogTitle",
      "MenuItem",
      "Paper",
      "Stack",
      "TextField",
      "ToggleButton",
      "ToggleButtonGroup",
      "Typography",
    ].map((name) => [name, name]),
  ),
);
vi.mock("../src/features/clinic/SeriesManagement", () => ({
  SeriesManagement: "SeriesManagement",
}));
vi.mock("../src/shared/businessDate", () => ({
  businessNow: () => new Date("2026-09-16T13:00:00Z"),
}));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    current_site: { id: 4 },
    practice: { timezone: "America/Chicago" },
    sites: [
      { id: 4, code: "ORIGIN", timezone_override: "America/Chicago" },
      { id: 5, code: "OTHER", timezone_override: "UTC" },
    ],
    capabilities: {},
  }),
}));
vi.mock("../src/shared/ui", () => ({
  useResource: (path: string) => {
    const site = path.includes("site_id=5") ? 5 : 4;
    const data: CalendarResponse = {
      site_id: site,
      month: "2026-09",
      timezone: site === 4 ? "America/Chicago" : "UTC",
      capacity_configured: true,
      slot_minutes: 30,
      clinicians: [{ id: 9, name: "Synthetic Clinician" }],
      rooms: [{ id: 6, name: "Synthetic Room", kind: "physical" }],
      days: [
        {
          date: "2026-09-16",
          available: 1,
          scheduled: 0,
          confirmed: 0,
          conflicts: 0,
          holds: [],
          appointments: [],
          slots: [
            {
              starts_at: "2026-09-16T14:00:00Z",
              ends_at: "2026-09-16T14:30:00Z",
              clinician_id: 9,
              room_ids: [6],
              provenance: {
                generated_at: "2026-09-16T13:00:00Z",
                source_rules: [{ id: 41, version: 2 }],
              },
            },
          ],
        },
      ],
    };
    return {
      data: path.includes("schedule_calendar") ? data : undefined,
      refresh: vi.fn(),
    };
  },
}));

import { ClinicSchedule } from "../src/features/clinic/ClinicSchedule";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function find(tree: unknown, predicate: (element: Element) => boolean) {
  const result = elements(tree).find(predicate);
  if (!result) throw new Error("Synthetic schedule control was not found");
  return result;
}
function change(element: Element, name: string, ...args: unknown[]) {
  (element.props[name] as (...values: unknown[]) => void)(...args);
}
const renderBooking = vi.fn((_booking?: CalendarBooking) => null);
function render() {
  hooks.cursor = 0;
  hooks.refCursor = 0;
  return ClinicSchedule({ canBook: true, renderBooking });
}
function dayView(group: "clinician" | "room") {
  let tree = render();
  change(
    find(tree, (e) => e.props["aria-label"] === "Calendar view"),
    "onChange",
    null,
    "day",
  );
  tree = render();
  change(
    find(tree, (e) => e.props.label === "Group by"),
    "onChange",
    { target: { value: group } },
  );
  return render();
}

beforeEach(() => {
  hooks.states = [];
  hooks.refs = [];
  renderBooking.mockClear();
});

describe("actual schedule booking context handoffs", () => {
  it("Day-view Book appointment retains the selected opening's exact provenance", () => {
    const tree = dayView("clinician");
    change(
      find(
        tree,
        (e) => e.type === "Button" && e.props.children === "Book appointment",
      ),
      "onClick",
    );
    render();
    const booking = renderBooking.mock.calls.at(-1)?.[0];
    expect(booking).toMatchObject({
      site_id: 4,
      clinician_id: 9,
      room_id: 6,
      starts_at: "2026-09-16T14:00:00Z",
      ends_at: "2026-09-16T14:30:00Z",
      provenance: {
        site_id: 4,
        clinician_id: 9,
        timezone: "America/Chicago",
        starts_at: "2026-09-16T14:00:00Z",
        ends_at: "2026-09-16T14:30:00Z",
        source_rules: [{ id: 41, version: 2 }],
      },
    });
  });
  it("room-grid booking does not carry a source for a clinician it leaves unselected", () => {
    const tree = dayView("room");
    change(
      find(
        tree,
        (e) =>
          e.type === "ButtonBase" &&
          String(e.props["aria-label"]).includes("Synthetic Room"),
      ),
      "onClick",
    );
    render();
    const booking = renderBooking.mock.calls.at(-1)?.[0];
    expect(booking).toMatchObject({
      site_id: 4,
      room_id: 6,
      starts_at: "2026-09-16T14:00:00Z",
    });
    expect(booking?.clinician_id).toBeUndefined();
    expect(booking?.provenance).toBeUndefined();
  });
  it("location change hides old booking immediately even before effects run", () => {
    const tree = dayView("clinician");
    change(
      find(tree, (e) => e.type === "ButtonBase"),
      "onClick",
    );
    const open = render();
    expect(renderBooking.mock.calls.at(-1)?.[0]?.provenance?.timezone).toBe(
      "America/Chicago",
    );
    expect(
      find(
        open,
        (e) =>
          e.type === "Dialog" &&
          e.props["aria-labelledby"] === "schedule-appointment-title",
      ).props.open,
    ).toBe(true);
    renderBooking.mockClear();
    change(
      find(open, (e) => e.props.label === "Location"),
      "onChange",
      { target: { value: "5" } },
    );
    const switched = render();
    expect(
      find(
        switched,
        (e) =>
          e.type === "Dialog" &&
          e.props["aria-labelledby"] === "schedule-appointment-title",
      ).props.open,
    ).toBe(false);
    expect(renderBooking).not.toHaveBeenCalled();
  });
});

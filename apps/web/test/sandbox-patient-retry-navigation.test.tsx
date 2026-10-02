import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { PatientWaitlistOffers } from "../src/features/patientPortal/PatientWaitlistOffers";
import { PatientEducationMaterials } from "../src/features/patientPortal/PatientEducationMaterials";
import { ApiError } from "../src/api/client";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  api: vi.fn(),
  refresh: vi.fn(),
  data: {} as Record<string, unknown>,
  blocker: null as null | (() => { blocked: boolean; message: string | null }),
}));
vi.mock("../src/features/demo/navigationBlockers", () => ({
  useDemoNavigationBlocker: (
    read: () => { blocked: boolean; message: string | null },
  ) => {
    harness.blocker = read;
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState<T>(initial: T | (() => T)) {
    const slot = harness.cursor++;
    if (!(slot in harness.slots))
      harness.slots[slot] =
        typeof initial === "function" ? (initial as () => T)() : initial;
    return [
      harness.slots[slot] as T,
      (value: T) => {
        harness.slots[slot] = value;
      },
    ];
  },
  useRef<T>(initial: T) {
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) harness.slots[slot] = { current: initial };
    return harness.slots[slot] as { current: T };
  },
  useEffect(effect: () => void) {
    const slot = harness.cursor++;
    if (!(slot in harness.slots)) {
      harness.slots[slot] = true;
      effect();
    }
  },
}));
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: harness.api,
}));
vi.mock("../src/shared/ui", () => ({
  useResource: () => ({ data: harness.data, refresh: harness.refresh }),
}));
type Props = { children?: ReactNode; action?: ReactNode; onClick?: () => void };
function nodes(node: ReactNode): Props[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  return [
    node.props,
    ...nodes(node.props.children),
    ...nodes(node.props.action),
  ];
}
let component = PatientWaitlistOffers;
function render() {
  harness.cursor = 0;
  return nodes(component());
}
function click(text: string) {
  render().find((props) => props.children === text && props.onClick)!
    .onClick!();
}
function blocked() {
  render();
  return harness.blocker!().blocked;
}
const offer = {
  id: 51,
  version: 4,
  state: "offered",
  site_id: 12,
  clinician_id: 13,
  visit_type_id: 14,
  offer_starts_at: "2026-10-03T10:00:00Z",
  offer_ends_at: "2026-10-03T10:30:00Z",
  offer_expires_at: "2026-10-02T23:00:00Z",
};
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.api.mockReset();
  harness.refresh.mockReset();
  harness.blocker = null;
  component = PatientWaitlistOffers;
  harness.data = {
    entries: [offer],
    can_accept: true,
    booking_requirement: "",
  };
});

it("waitlist replies veto switching in flight and after uncertainty until the exact retry succeeds", async () => {
  let reject!: (error: Error) => void;
  harness.api
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    )
    .mockRejectedValueOnce(new ApiError(403, "Synthetic denial"))
    .mockResolvedValueOnce({
      entry: {
        ...offer,
        version: 5,
        state: "booked",
        recorded_state: "booked",
        appointment_id: 71,
      },
    });
  click("Accept and book");
  expect(harness.blocker!().blocked).toBe(true); // live owner protects before a rerender
  reject(new TypeError("Synthetic lost reply"));
  await vi.waitFor(() =>
    expect(render().some((props) => props.children === "Retry response")).toBe(
      true,
    ),
  );
  expect(blocked()).toBe(true);
  click("Retry response");
  await vi.waitFor(() => expect(harness.api).toHaveBeenCalledTimes(2));
  await vi.waitFor(() =>
    expect(
      render().some((props) => props.children === "Synthetic denial"),
    ).toBe(true),
  );
  expect(blocked()).toBe(true);
  click("Retry response");
  await vi.waitFor(() => expect(blocked()).toBe(false));
  expect(harness.api.mock.calls.map((call) => call[1].body)).toEqual(
    Array(3).fill(harness.api.mock.calls[0][1].body),
  );
  expect(harness.refresh).toHaveBeenCalledOnce();
});

it("waitlist callbacks retain their original key and payload across lost response then denial", async () => {
  harness.data = { entries: [], can_accept: false, booking_requirement: "" };
  let reject!: (error: Error) => void;
  harness.api
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    )
    .mockRejectedValueOnce(new ApiError(403, "Synthetic denial"))
    .mockResolvedValueOnce({ request: { id: 71 } });
  click("Request a call about an earlier opening");
  expect(harness.blocker!().blocked).toBe(true);
  reject(new ApiError(408, "Synthetic timeout"));
  await vi.waitFor(() =>
    expect(
      render().some((props) => props.children === "Synthetic timeout"),
    ).toBe(true),
  );
  expect(blocked()).toBe(true);
  click("Request a call about an earlier opening");
  await vi.waitFor(() =>
    expect(
      render().some((props) => props.children === "Synthetic denial"),
    ).toBe(true),
  );
  expect(blocked()).toBe(true);
  click("Request a call about an earlier opening");
  await vi.waitFor(() => expect(blocked()).toBe(false));
  expect(harness.api.mock.calls.map((call) => [call[0], call[1].body])).toEqual(
    Array(3).fill([
      harness.api.mock.calls[0][0],
      harness.api.mock.calls[0][1].body,
    ]),
  );
});

it("a known first callback rejection does not invent an uncertain outcome", async () => {
  harness.data = { entries: [], can_accept: false, booking_requirement: "" };
  harness.api.mockRejectedValueOnce(new ApiError(422, "Synthetic validation"));
  click("Request a call about an earlier opening");
  await vi.waitFor(() =>
    expect(
      render().some((props) => props.children === "Synthetic validation"),
    ).toBe(true),
  );
  expect(blocked()).toBe(false);
});

it("education acknowledgment keys and exact payload survive failed retries until success", async () => {
  component = PatientEducationMaterials;
  harness.data = {
    materials: [
      {
        id: 51,
        material_title: "Synthetic material",
        topic_title: "Synthetic topic",
        language: "en",
        material_url: "https://example.test/material",
        delivered_at: "2026-10-01T10:00:00Z",
        acknowledged_at: null,
      },
    ],
  };
  let reject!: (error: Error) => void;
  harness.api
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    )
    .mockRejectedValueOnce(new ApiError(403, "Synthetic denial"))
    .mockResolvedValueOnce({ material: { id: 51 } });
  click("I viewed this material");
  expect(harness.blocker!().blocked).toBe(true); // retained key protects before a rerender
  reject(new ApiError(408, "Synthetic timeout"));
  await vi.waitFor(() =>
    expect(
      render().some((props) => props.children === "I viewed this material"),
    ).toBe(true),
  );
  expect(blocked()).toBe(true);
  click("I viewed this material");
  await vi.waitFor(() => expect(harness.api).toHaveBeenCalledTimes(2));
  await vi.waitFor(() =>
    expect(
      render().some((props) => props.children === "I viewed this material"),
    ).toBe(true),
  );
  expect(blocked()).toBe(true);
  click("I viewed this material");
  await vi.waitFor(() => expect(blocked()).toBe(false));
  expect(harness.api.mock.calls.map((call) => [call[0], call[1].body])).toEqual(
    Array(3).fill([
      harness.api.mock.calls[0][0],
      harness.api.mock.calls[0][1].body,
    ]),
  );
  expect(harness.refresh).toHaveBeenCalledOnce();
});

it("a definitive first education rejection permits leaving and retains the key for a local retry", async () => {
  component = PatientEducationMaterials;
  harness.data = {
    materials: [
      {
        id: 51,
        material_title: "Synthetic material",
        topic_title: "Synthetic topic",
        language: "en",
        material_url: "https://example.test/material",
        delivered_at: "2026-10-01T10:00:00Z",
        acknowledged_at: null,
      },
    ],
  };
  harness.api
    .mockRejectedValueOnce(new ApiError(403, "Synthetic denial"))
    .mockResolvedValueOnce({ material: { id: 51 } });
  click("I viewed this material");
  await vi.waitFor(() =>
    expect(
      render().some((props) => props.children === "Synthetic denial"),
    ).toBe(true),
  );
  expect(blocked()).toBe(false);
  click("I viewed this material");
  await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledOnce());
  expect(harness.api.mock.calls[1][1].body).toEqual(
    harness.api.mock.calls[0][1].body,
  );
  expect(blocked()).toBe(false);
});

it("a refreshed viewed status does not hide an uncertain education attempt's exact retry", async () => {
  component = PatientEducationMaterials;
  const material = {
    id: 51,
    material_title: "Synthetic material",
    topic_title: "Synthetic topic",
    language: "en",
    material_url: "https://example.test/material",
    delivered_at: "2026-10-01T10:00:00Z",
    acknowledged_at: null as string | null,
  };
  harness.data = { materials: [material] };
  harness.api
    .mockRejectedValueOnce(new ApiError(408, "Synthetic lost acknowledgement"))
    .mockResolvedValueOnce({
      material: { ...material, acknowledged_at: "2026-10-02T10:00:00Z" },
    });
  click("I viewed this material");
  await vi.waitFor(() =>
    expect(
      render().some((props) => props.children === "I viewed this material"),
    ).toBe(true),
  );
  expect(blocked()).toBe(true);
  harness.data = {
    materials: [{ ...material, acknowledged_at: "2026-10-02T10:00:00Z" }],
  };
  expect(blocked()).toBe(true);
  click("Retry acknowledgment");
  await vi.waitFor(() => expect(blocked()).toBe(false));
  expect(harness.api.mock.calls[1][0]).toEqual(harness.api.mock.calls[0][0]);
  expect(harness.api.mock.calls[1][1].body).toEqual(
    harness.api.mock.calls[0][1].body,
  );
  expect(harness.refresh).toHaveBeenCalledOnce();
});

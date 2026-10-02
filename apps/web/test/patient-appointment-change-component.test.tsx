import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppointmentChangeDialog } from "../src/features/patientPortal/PatientAppointmentRequests";
import { ApiError } from "../src/api/client";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  api: vi.fn(),
  refresh: vi.fn(),
  blocker: null as null | (() => { blocked: boolean; message: string | null }),
}));
vi.mock("../src/features/demo/navigationBlockers", () => ({
  useDemoNavigationBlocker: (
    read: () => { blocked: boolean; message: string | null },
  ) => {
    harness.blocker = read;
  },
}));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
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
  };
});
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: harness.api,
}));
vi.mock("../src/shared/ui", () => ({
  useResource: () => ({ data: { requests: [] }, refresh: harness.refresh }),
}));

type Props = {
  label?: string;
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
};
function nodes(node: ReactNode): Props[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  return [node.props, ...nodes(node.props.children)];
}
const appointment = {
  id: 51,
  starts_at: "2026-10-03T10:00:00Z",
  ends_at: "2026-10-03T11:00:00Z",
  updated_at: "2026-09-30T20:00:00.123456Z",
  status: "scheduled",
  site: { id: 12, code: "SYN", name: "Synthetic site" },
  room: null,
  clinician: null,
  visit_type: null,
  can_confirm: false,
  confirmation_version: null,
  visit_modality: "in_person" as const,
};
let kind: "reschedule" | "cancel" = "reschedule";
const onSaved = vi.fn();
const onClose = vi.fn();
function render() {
  harness.cursor = 0;
  return nodes(
    AppointmentChangeDialog({ appointment, kind, onSaved, onClose }),
  );
}
function field(label: string) {
  return render().find((props) => props.label === label)!;
}
function send() {
  return render().find(
    (props) =>
      props.onClick &&
      [
        "Send reschedule request",
        "Send cancellation request",
        "Retry same request",
        "Sending…",
      ].includes(String(props.children)),
  )!;
}
function close() {
  return render().find((props) => props.children === "Close")!;
}
function response(body: { appointment_request: Record<string, string> }) {
  const request = body.appointment_request;
  return {
    appointment_request: {
      id: 71,
      request_key: request.request_key,
      request_kind: request.request_kind,
      starts_at: request.starts_at ?? null,
      ends_at: request.ends_at ?? null,
      requested_modality: kind === "cancel" ? null : "in_person",
      source_appointment: { ...appointment },
      site: null,
      visit_type: null,
      status: "pending",
    },
  };
}
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.api.mockReset();
  harness.blocker = null;
  onSaved.mockReset();
  onClose.mockReset();
});
describe("appointment change dialog handlers with controlled hooks", () => {
  it.each(["reschedule", "cancel"] as const)(
    "retains %s after 408 then denial and closes only on exact acknowledgement",
    async (value) => {
      kind = value;
      harness.api
        .mockRejectedValueOnce(new ApiError(408, "Synthetic timeout"))
        .mockRejectedValueOnce(new ApiError(403, "Synthetic denied"))
        .mockImplementation(async (_path, options) => response(options.body));
      for (let index = 0; index < 3; index++) {
        await send().onClick!();
        await vi.waitFor(() => expect(send().children).not.toBe("Sending…"));
        if (index < 2) {
          expect(onSaved).not.toHaveBeenCalled();
          expect(send().children).toBe("Retry same request");
          expect(close().disabled).toBe(true);
          expect(harness.blocker?.().blocked).toBe(true);
          expect(render()[0]).not.toHaveProperty(
            "onClose",
            expect.any(Function),
          );
          if (kind === "reschedule")
            expect(field("Preferred start (your local time)").disabled).toBe(
              true,
            );
        }
      }
      expect(harness.api.mock.calls.map((call) => call[1].body)).toEqual(
        Array(3).fill(harness.api.mock.calls[0][1].body),
      );
      expect(harness.api.mock.calls[0][0]).toBe(
        "/api/patient_portal/appointment_requests",
      );
      if (kind === "cancel")
        expect(
          harness.api.mock.calls[0][1].body.appointment_request,
        ).not.toHaveProperty("starts_at");
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(harness.blocker?.().blocked).toBe(false);
    },
  );
  it.each(["reschedule", "cancel"] as const)(
    "serializes %s repeated handlers and rejects foreign acknowledgement",
    async (value) => {
      kind = value;
      let complete!: (value: unknown) => void;
      harness.api.mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
      const handler = send().onClick!;
      handler();
      handler();
      expect(harness.blocker?.().blocked).toBe(true);
      expect(harness.api).toHaveBeenCalledTimes(1);
      complete({
        appointment_request: {
          ...response(harness.api.mock.calls[0][1].body).appointment_request,
          request_key: "foreign-key",
        },
      });
      await vi.waitFor(() =>
        expect(send().children).toBe("Retry same request"),
      );
      expect(onSaved).not.toHaveBeenCalled();
      expect(close().disabled).toBe(true);
      expect(harness.blocker?.().blocked).toBe(true);
    },
  );
});

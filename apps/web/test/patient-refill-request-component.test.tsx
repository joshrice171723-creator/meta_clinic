import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientRefillRequests } from "../src/features/patientPortal/PatientRefillRequests";
import { ApiError } from "../src/api/client";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  api: vi.fn(),
  refresh: vi.fn(),
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
function render() {
  harness.cursor = 0;
  return nodes(PatientRefillRequests());
}
function field(label: string) {
  return render().find((props) => props.label === label)!;
}
function send() {
  return render().find(
    (props) =>
      props.onClick &&
      [
        "Send refill request",
        "Retry same request",
        "Sending request…",
      ].includes(String(props.children)),
  )!;
}
function fill() {
  field("Medication name").onChange!({
    target: { value: " Synthetic medication " },
  });
  field("Pharmacy destination").onChange!({
    target: { value: " Synthetic pharmacy " },
  });
  field("Note for the clinic (optional)").onChange!({
    target: { value: " Synthetic note " },
  });
}
function response(body: { patient_portal_request: Record<string, string> }) {
  const request = body.patient_portal_request;
  return {
    request: {
      id: 51,
      request_key: request.request_key,
      request_type: "refill",
      source: "patient",
      status: "pending",
      medication_name: request.medication_name,
      pharmacy_destination: request.pharmacy_destination,
      request_note: request.request_note ?? null,
    },
  };
}

beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.api.mockReset();
  harness.refresh.mockReset();
});
describe("refill component handler recovery with controlled hooks", () => {
  it("locks fields across lost response then rejection and explicitly retries exact body", async () => {
    harness.api
      .mockRejectedValueOnce(new TypeError("Synthetic lost response"))
      .mockRejectedValueOnce(new ApiError(403, "Synthetic denied"))
      .mockImplementation(async (_path, options) => response(options.body));
    fill();
    await send().onClick!();
    await vi.waitFor(() =>
      expect(send().children).not.toBe("Sending request…"),
    );
    expect(harness.api).toHaveBeenCalledTimes(1);
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(send().children).toBe("Retry same request");
    for (const label of [
      "Medication name",
      "Pharmacy destination",
      "Note for the clinic (optional)",
    ])
      expect(field(label).disabled).toBe(true);
    await send().onClick!();
    await vi.waitFor(() =>
      expect(send().children).not.toBe("Sending request…"),
    );
    expect(field("Medication name").disabled).toBe(true);
    await send().onClick!();
    await vi.waitFor(() =>
      expect(send().children).not.toBe("Sending request…"),
    );
    expect(harness.api.mock.calls.map((call) => call[1].body)).toEqual(
      Array(3).fill(harness.api.mock.calls[0][1].body),
    );
    expect(harness.api.mock.calls[0][0]).toBe("/api/patient_portal/requests");
    expect(
      harness.api.mock.calls[0][1].body.patient_portal_request,
    ).toMatchObject({
      medication_name: "Synthetic medication",
      pharmacy_destination: "Synthetic pharmacy",
      request_note: "Synthetic note",
    });
    expect(field("Medication name").disabled).toBe(false);
    expect(harness.refresh).toHaveBeenCalledTimes(1);
    expect(
      render().some(
        (props) =>
          props.children ===
          "Your refill request is saved. Check its current status below.",
      ),
    ).toBe(true);
  });

  it("ignores repeated handlers while in flight and never announces mismatched acknowledgement", async () => {
    let complete!: (value: unknown) => void;
    harness.api.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    fill();
    const handler = send().onClick!;
    const first = handler();
    await handler();
    expect(harness.api).toHaveBeenCalledTimes(1);
    expect(field("Medication name").disabled).toBe(true);
    complete({
      request: {
        ...response(harness.api.mock.calls[0][1].body).request,
        request_key: "other-key",
      },
    });
    await first;
    await vi.waitFor(() => expect(send().children).toBe("Retry same request"));
    expect(harness.refresh).not.toHaveBeenCalled();
    expect(send().children).toBe("Retry same request");
    expect(field("Medication name").disabled).toBe(true);
  });
});

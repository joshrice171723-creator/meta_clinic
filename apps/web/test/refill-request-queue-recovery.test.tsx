import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefillRequestQueue } from "../src/features/clinic/RefillRequestQueue";
import { ApiError } from "../src/api/client";
import type { Patient } from "../src/api/contracts";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  api: vi.fn(),
  refresh: vi.fn(),
  capabilities: { patients: true, medication_requests_write: true },
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
        (value: T | ((previous: T) => T)) => {
          harness.slots[slot] =
            typeof value === "function"
              ? (value as (previous: T) => T)(harness.slots[slot] as T)
              : value;
        },
      ];
    },
    useRef<T>(initial: T) {
      const slot = harness.cursor++;
      if (!(slot in harness.slots)) harness.slots[slot] = { current: initial };
      return harness.slots[slot] as { current: T };
    },
    useMemo<T>(factory: () => T) {
      return factory();
    },
    useEffect: vi.fn(),
  };
});
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: harness.api,
}));
vi.mock("../src/shared/ui", () => ({
  useResource: () => ({
    data: {
      refill_requests: [],
      pagination: { page: 1, per_page: 25, total: 0 },
    },
    refresh: harness.refresh,
  }),
}));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    capabilities: harness.capabilities,
    current_clinician_profile_id: null,
  }),
}));

type Props = {
  label?: string;
  children?: ReactNode;
  disabled?: boolean;
  expanded?: boolean;
  onClick?: () => void;
  onChange?: (...args: unknown[]) => void;
  renderInput?: (params: Record<string, unknown>) => ReactNode;
};
type RequestBody = {
  refill_request: {
    request_key: string;
    patient_id: number;
    medication_name: string;
    pharmacy_destination: string;
    medication_request_series_id?: string;
    request_note?: string;
  };
};
const patient = {
  id: 41,
  display_name: "Synthetic Patient A",
  reference: "SYN-41",
} as Patient;
const editedPatient = {
  id: 42,
  display_name: "Synthetic Patient B",
  reference: "SYN-42",
} as Patient;

function nodes(node: ReactNode): Props[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  return [node.props, ...nodes(node.props.children)];
}
function render() {
  harness.cursor = 0;
  return nodes(RefillRequestQueue());
}
function field(label: string) {
  return render().find((props) => props.label === label)!;
}
function picker(label: string) {
  return render().find((props) =>
    nodes(props.renderInput?.({})).some((input) => input.label === label),
  )!;
}
function send() {
  return render().find(
    (props) =>
      props.onClick &&
      ["Open refill request", "Retry same refill request"].includes(
        String(props.children),
      ),
  )!;
}
function fill(edited = false) {
  picker("Patient").onChange!(null, edited ? editedPatient : patient);
  picker("Prior prescription (optional)").onChange!(null, {
    id: edited ? 22 : 21,
    series_id: edited ? "synthetic-series-b" : "synthetic-series-a",
    version_number: 1,
    status: "active",
    medication_name: edited ? "Edited medication" : "Synthetic medication",
    pharmacy_name: edited ? "Edited pharmacy" : "Synthetic pharmacy",
    pharmacy_location: null,
    recorded_at: "2026-10-02T08:00:00Z",
  });
  for (const [label, value] of [
    [
      "Medication name",
      edited ? " Edited medication " : " Synthetic medication ",
    ],
    [
      "Pharmacy destination",
      edited ? " Edited pharmacy " : " Synthetic pharmacy ",
    ],
    ["Request note (optional)", edited ? " Edited note " : " Synthetic note "],
  ])
    field(label).onChange!({ target: { value } });
}
function response(body: RequestBody) {
  const request = body.refill_request;
  return {
    refill_request: {
      id: 51,
      patient: { id: request.patient_id },
      medication_name: request.medication_name,
      pharmacy_destination: request.pharmacy_destination,
      request_note: request.request_note ?? null,
      source: "staff",
    },
  };
}
function matchResponse() {
  harness.api.mockImplementation(async (_path, options) =>
    response(options.body),
  );
}
async function settled() {
  await vi.waitFor(() => expect(send().disabled).toBe(false));
}

beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.api.mockReset();
  harness.refresh.mockReset();
  harness.capabilities = { patients: true, medication_requests_write: true };
});
describe("staff refill creation recovery with controlled hooks", () => {
  it.each([
    ["network loss", new TypeError("Synthetic lost response")],
    ["timeout", new ApiError(408, "Synthetic timeout")],
    ["service failure", new ApiError(503, "Synthetic service failure")],
    [
      "unconfirmed outcome",
      new ApiError(409, "Synthetic uncertain", "outcome_unconfirmed"),
    ],
  ])(
    "retains the exact pending request after %s despite draft edits",
    async (_name, reason) => {
      let reject!: (reason: unknown) => void;
      harness.api.mockImplementation(
        () =>
          new Promise((_resolve, rejectPromise) => {
            reject = rejectPromise;
          }),
      );
      fill();
      const captured = send().onClick!;
      captured();
      captured();
      expect(harness.api).toHaveBeenCalledTimes(1);
      expect(send().disabled).toBe(true);
      const firstBody = harness.api.mock.calls[0][1].body as RequestBody;
      expect(firstBody.refill_request).toMatchObject({
        patient_id: 41,
        medication_name: "Synthetic medication",
        pharmacy_destination: "Synthetic pharmacy",
        medication_request_series_id: "synthetic-series-a",
        request_note: "Synthetic note",
      });
      fill(true);
      reject(reason);
      await settled();
      expect(send().children).toBe("Retry same refill request");
      expect(harness.api).toHaveBeenCalledTimes(1);
      expect(harness.refresh).not.toHaveBeenCalled();
      fill(true);
      // Retry remains available even when the currently edited draft is incomplete.
      picker("Patient").onChange!(null, null);
      field("Medication name").onChange!({ target: { value: "" } });
      field("Pharmacy destination").onChange!({ target: { value: "" } });
      expect(send().disabled).toBe(false);
      render().find((props) => props.expanded !== undefined)!.onChange!(
        null,
        false,
      );
      expect(
        render().find((props) => props.expanded !== undefined)!.expanded,
      ).toBe(true);
      matchResponse();
      send().onClick!();
      await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledTimes(1));
      expect(harness.api.mock.calls.map((call) => call[0])).toEqual([
        "/api/clinic/refill_requests",
        "/api/clinic/refill_requests",
      ]);
      expect(harness.api.mock.calls[1][1].body).toBe(firstBody);
      expect(harness.api.mock.calls[1][1].method).toBe("POST");
      expect(send().children).toBe("Open refill request");
      expect(send().disabled).toBe(true);
      fill(true);
      send().onClick!();
      await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledTimes(2));
      expect(
        harness.api.mock.calls[2][1].body.refill_request.request_key,
      ).not.toBe(firstBody.refill_request.request_key);
      expect(harness.api.mock.calls[2][1].body.refill_request.patient_id).toBe(
        42,
      );
    },
  );

  it("keeps an earlier uncertain write unresolved after a later denial", async () => {
    harness.api
      .mockRejectedValueOnce(new TypeError("Synthetic lost response"))
      .mockRejectedValueOnce(new ApiError(403, "Synthetic denied"));
    fill();
    send().onClick!();
    await settled();
    const original = harness.api.mock.calls[0][1].body;
    fill(true);
    send().onClick!();
    await settled();
    expect(harness.api).toHaveBeenCalledTimes(2);
    expect(send().children).toBe("Retry same refill request");
    expect(
      render().some((props) => props.children === "Synthetic denied"),
    ).toBe(true);
    expect(harness.refresh).not.toHaveBeenCalled();
    matchResponse();
    send().onClick!();
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledTimes(1));
    expect(harness.api.mock.calls.map((call) => call[1].body)).toEqual([
      original,
      original,
      original,
    ]);
  });

  it("allows an explicit corrected request with a new key after initial validation rejection", async () => {
    harness.api.mockRejectedValueOnce(new ApiError(422, "Synthetic invalid"));
    fill();
    send().onClick!();
    await settled();
    const original = harness.api.mock.calls[0][1].body as RequestBody;
    expect(send().children).toBe("Open refill request");
    fill(true);
    expect(harness.api).toHaveBeenCalledTimes(1);
    matchResponse();
    send().onClick!();
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledTimes(1));
    const corrected = harness.api.mock.calls[1][1].body as RequestBody;
    expect(corrected.refill_request.request_key).not.toBe(
      original.refill_request.request_key,
    );
    expect(corrected.refill_request).toMatchObject({
      patient_id: 42,
      medication_name: "Edited medication",
      pharmacy_destination: "Edited pharmacy",
      medication_request_series_id: "synthetic-series-b",
      request_note: "Edited note",
    });
  });

  it("retains the attempt when the acknowledgement belongs to another patient", async () => {
    harness.api.mockImplementation(async (_path, options) => ({
      refill_request: {
        ...response(options.body).refill_request,
        patient: { id: 999 },
      },
    }));
    fill();
    send().onClick!();
    await settled();
    expect(send().children).toBe("Retry same refill request");
    expect(harness.refresh).not.toHaveBeenCalled();
    const original = harness.api.mock.calls[0][1].body;
    matchResponse();
    send().onClick!();
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledTimes(1));
    expect(harness.api.mock.calls[1][1].body).toBe(original);
  });

  it("hides retained patient details and blocks captured retry after capability revocation", async () => {
    harness.api.mockRejectedValueOnce(new TypeError("Synthetic lost response"));
    fill();
    send().onClick!();
    await settled();
    const original = harness.api.mock.calls[0][1].body;
    const capturedRetry = send().onClick!;
    harness.capabilities.patients = false;
    const renderedText = render()
      .map((props) => JSON.stringify(props.children))
      .join(" ");
    for (const protectedText of [
      patient.display_name,
      patient.reference,
      "Synthetic medication",
      "Synthetic pharmacy",
    ])
      expect(renderedText).not.toContain(protectedText);
    expect(send()).toBeUndefined();
    capturedRetry();
    await Promise.resolve();
    expect(harness.api).toHaveBeenCalledTimes(1);
    expect(harness.refresh).not.toHaveBeenCalled();
    harness.capabilities.patients = true;
    expect(send().children).toBe("Retry same refill request");
    expect(harness.api).toHaveBeenCalledTimes(1);
    matchResponse();
    capturedRetry();
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledTimes(1));
    expect(harness.api).toHaveBeenCalledTimes(2);
    expect(harness.api.mock.calls[1][0]).toBe("/api/clinic/refill_requests");
    expect(harness.api.mock.calls[1][1].body).toBe(original);
  });

  it.each(["patients", "medication_requests_write"] as const)(
    "offers no creation or automatic send without %s capability",
    (capability) => {
      harness.capabilities[capability] = false;
      expect(send()).toBeUndefined();
      render();
      expect(harness.api).not.toHaveBeenCalled();
      expect(harness.refresh).not.toHaveBeenCalled();
    },
  );
});

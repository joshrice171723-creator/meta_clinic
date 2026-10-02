import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefillRequestQueue } from "../src/features/clinic/RefillRequestQueue";
import { ApiError } from "../src/api/client";
import type {
  ClinicRefillRequest,
  Encounter,
  PatientCareSummary,
} from "../src/api/contracts";
import {
  refillApprovalAttempt,
  refillApprovalReady,
  submitRefillApproval,
  type RefillReviewAttempt,
} from "../src/features/clinic/refillReviewBatch";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  api: vi.fn(),
  refresh: vi.fn(),
  requests: [] as ClinicRefillRequest[],
  clinician: "synthetic-clinician",
  canWrite: true,
  generation: 1,
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
  useMemo: (factory: () => unknown) => factory(),
  useEffect: vi.fn(),
}));
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: harness.api,
}));
vi.mock("../src/shared/ui", () => ({
  useResource: () => ({
    data: {
      refill_requests: harness.requests,
      pagination: { page: 1, per_page: 25, total: harness.requests.length },
    },
    refresh: harness.refresh,
  }),
}));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({
    user_id: 1,
    practice: { id: 1 },
    authorization_generation: harness.generation,
    capabilities: {
      patients: true,
      medication_requests_write: harness.canWrite,
    },
    current_clinician_profile_id: harness.clinician || null,
  }),
}));

type Props = {
  children?: ReactNode;
  control?: ReactNode;
  label?: string;
  disabled?: boolean;
  checked?: boolean;
  slotProps?: { input?: { "aria-label"?: string } };
  onClick?: () => void;
  onChange?: (...args: unknown[]) => void;
};
function nodes(node: ReactNode): Props[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  return [
    node.props,
    ...nodes(node.props.children),
    ...nodes(node.props.control),
  ];
}
function render() {
  harness.cursor = 0;
  return nodes(RefillRequestQueue());
}
function button(label: string) {
  return render().find(
    (props) =>
      props.onClick &&
      (Array.isArray(props.children)
        ? props.children.join("")
        : String(props.children)
      ).startsWith(label),
  )!;
}
function field(label: string, index: number) {
  return render().filter((props) => props.label === label)[index];
}
function selection(id: number) {
  return render().find((props) =>
    props.slotProps?.input?.["aria-label"]?.startsWith(
      `Select request #${id} `,
    ),
  )!;
}
function attestation(index: number) {
  const control = field(
    "I reviewed the current medication history and reconciled the requested plan.",
    index,
  ).control;
  return nodes(control)[0];
}
function request(id: number): ClinicRefillRequest {
  return {
    id,
    patient: {
      id: 100 + id,
      display_name: `Synthetic Patient ${id}`,
      reference: `SYN-${id}`,
    },
    status: "pending",
    medication_name: `Synthetic medication ${id}`,
    pharmacy_destination: "Synthetic pharmacy",
    request_note: null,
    source: "staff",
    requested_at: "2026-10-02T09:00:00Z",
    reviewed_at: null,
    decision: null,
    patient_message: null,
    source_encounter_id: null,
    medication_request_revision_id: null,
    response_delivery_state: null,
    response_delivery_failure_code: null,
    reviewed_by: null,
    reconciliation_acknowledged: false,
    reconciliation_note: null,
  };
}
const outcome = {
  patientMessage: "Synthetic reviewed response",
  reconciliationAcknowledged: true,
  reconciliationNote: "",
};
function summary(id: number) {
  return {
    patient_id: 100 + id,
    medications: { state: "not_recorded", items: [] },
  } as unknown as PatientCareSummary;
}
function encounter(id: number) {
  return {
    id: 200 + id,
    patient_id: 100 + id,
    site_id: "synthetic-site",
    appointment_id: null,
    room_id: null,
    ended_at: null,
    status: "open",
    started_at: "2026-10-02T09:00:00Z",
  } satisfies Encounter;
}
function saved(id: number, body: RefillReviewAttempt["body"]) {
  return {
    refill_request: {
      ...request(id),
      ...body.refill_request,
      reconciliation_note: body.refill_request.reconciliation_note ?? null,
      reviewed_by: { display_name: "Synthetic clinician" },
      source_encounter_id: body.refill_request.encounter_id,
      medication_request_revision_id: 300 + id,
      response_delivery_state: id === 2 ? "failed" : "delivered",
    },
  };
}
async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
async function review(id: number, index: number) {
  selection(id).onChange!(null, true);
  await tick();
  field("Patient-visible outcome", index).onChange!({
    target: { value: `Synthetic reviewed response ${id}` },
  });
  attestation(index).onChange!({ target: { checked: true } });
}
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.requests = [request(1), request(2), request(3)];
  harness.clinician = "synthetic-clinician";
  harness.canWrite = true;
  harness.generation = 1;
  harness.refresh.mockReset();
  harness.api.mockReset();
  harness.api.mockImplementation(
    async (path: string, options?: { body: RefillReviewAttempt["body"] }) => {
      if (path.includes("care_summary"))
        return summary(Number(path.split("/")[4]) - 100);
      if (path.includes("encounters?"))
        return {
          encounters: [
            encounter(
              Number(
                new URL(path, "http://synthetic.invalid").searchParams.get(
                  "patient_id",
                ),
              ) - 100,
            ),
          ],
        };
      return saved(Number(path.split("/")[4]), options!.body);
    },
  );
});

describe("explicit clinician batch review", () => {
  it("walks five reviewed requests in 16 actions rather than the baseline 20", async () => {
    harness.requests = [1, 2, 3, 4, 5].map(request);
    expect(button("Approve selected reviewed requests").disabled).toBe(true);
    let actions = 0;
    for (let index = 0; index < 5; index++) {
      await review(index + 1, index);
      actions += 3;
    }
    expect(button("Approve selected reviewed requests").disabled).toBe(false);
    button("Approve selected reviewed requests").onClick!();
    actions++;
    await tick();
    const writes = harness.api.mock.calls.filter(([path]) =>
      path.includes("/transition"),
    );
    expect(writes).toHaveLength(5);
    expect(actions).toBe(16);
    expect(
      new Set(
        writes.map(([, options]) => options.body.refill_request.request_key),
      ).size,
    ).toBe(5);
    expect(button("Retry exact decision")).toBeUndefined();
    expect(
      render().some((props) =>
        String(props.children).includes("portal delivery needs follow-up"),
      ),
    ).toBe(true);
    expect(harness.refresh).toHaveBeenCalledOnce();
  });
  it("does not submit any selection until every selected patient is reconciled", async () => {
    await review(1, 0);
    selection(2).onChange!(null, true);
    await tick();
    expect(button("Approve selected reviewed requests").disabled).toBe(true);
    button("Approve selected reviewed requests").onClick!();
    await tick();
    expect(
      harness.api.mock.calls.filter(([path]) => path.includes("/transition")),
    ).toHaveLength(0);
    selection(2).onChange!(null, false);
    field("Patient-visible outcome", 0).onChange!({
      target: { value: "Edited response" },
    });
    expect(attestation(0).checked).toBe(false);
  });
  it("keeps partial successes, and retries only an unknown request with its original key and payload", async () => {
    for (let index = 0; index < 3; index++) await review(index + 1, index);
    const implementation = harness.api.getMockImplementation()!;
    harness.api.mockImplementation(async (path: string, options) => {
      if (path.endsWith("/2/transition"))
        throw new TypeError("Synthetic lost response");
      return implementation(path, options);
    });
    const submit = button("Approve selected reviewed requests").onClick!;
    submit();
    submit();
    await tick();
    const firstWrites = harness.api.mock.calls.filter(([path]) =>
      path.includes("/transition"),
    );
    expect(firstWrites).toHaveLength(3);
    expect(field("Patient-visible outcome", 1).disabled).toBe(true);
    expect(button("Edit and review again #2")).toBeUndefined();
    const original = firstWrites[1][1].body;
    harness.api.mockImplementation(implementation);
    button("Retry exact decision #2").onClick!();
    await tick();
    const writes = harness.api.mock.calls.filter(([path]) =>
      path.includes("/transition"),
    );
    expect(writes).toHaveLength(4);
    expect(writes[3][0]).toContain("/2/transition");
    expect(writes[3][1].body).toBe(original);
    expect(button("Retry exact decision #2")).toBeUndefined();
  });
  it("permits editing a definitive validation failure only after clearing the failed attempt and attestation", async () => {
    await review(1, 0);
    harness.api.mockRejectedValue(
      new ApiError(422, "Synthetic validation failure"),
    );
    button("Approve selected reviewed requests").onClick!();
    await tick();
    expect(field("Patient-visible outcome", 0).disabled).toBe(true);
    button("Edit and review again #1").onClick!();
    expect(field("Patient-visible outcome", 0).disabled).toBe(false);
    expect(attestation(0).checked).toBe(false);
  });
  it("requires named clinician and existing write permission", async () => {
    harness.clinician = "";
    expect(button("Approve selected reviewed requests")).toBeUndefined();
    expect(selection(1)).toBeUndefined();
    harness.clinician = "synthetic-clinician";
    harness.canWrite = false;
    expect(button("Approve selected reviewed requests")).toBeUndefined();
  });
  it("stops unsent requests when authority changes while a request is in flight", async () => {
    await review(1, 0);
    await review(2, 1);
    let finish!: (value: unknown) => void;
    harness.api.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    button("Approve selected reviewed requests").onClick!();
    const body = harness.api.mock.calls.at(-1)![1].body;
    harness.generation++;
    render();
    finish(saved(1, body));
    await tick();
    expect(
      harness.api.mock.calls.filter(([path]) => path.includes("/transition")),
    ).toHaveLength(1);
    expect(harness.refresh).not.toHaveBeenCalled();
  });
});

describe("per-request contract and recovery", () => {
  it("rejects mismatched history, patient encounters, terminal and incomplete requests", () => {
    const ready = (
      req = request(1),
      data = summary(1),
      enc = encounter(1),
      values = outcome,
    ) => refillApprovalReady(req, values, data, [enc], 201);
    expect(ready()).toBe(true);
    expect(ready(request(1), summary(2))).toBe(false);
    expect(ready(request(1), summary(1), encounter(2))).toBe(false);
    expect(ready({ ...request(1), status: "resolved" })).toBe(false);
    expect(
      ready(request(1), summary(1), encounter(1), {
        ...outcome,
        reconciliationAcknowledged: false,
      }),
    ).toBe(false);
    expect(
      ready(request(1), summary(1), encounter(1), {
        ...outcome,
        patientMessage: " ",
      }),
    ).toBe(false);
  });
  it("treats wrong patient, missing revision or unowned response as unknown", async () => {
    const attempt = refillApprovalAttempt(
      request(1),
      outcome,
      201,
      "synthetic-clinician",
    );
    for (const changes of [
      { patient: request(2).patient },
      { medication_request_revision_id: null },
      { reviewed_by: null },
      { source_encounter_id: 202 },
    ]) {
      const response = saved(1, attempt.body);
      const result = await submitRefillApproval(
        attempt,
        vi.fn().mockResolvedValue({
          refill_request: { ...response.refill_request, ...changes },
        }),
      );
      expect(result.state).toBe("unknown");
    }
  });
  it("a later denial does not resolve an earlier unknown write", async () => {
    const attempt = refillApprovalAttempt(
      request(1),
      outcome,
      201,
      "synthetic-clinician",
    );
    const send = vi
      .fn()
      .mockRejectedValue(new ApiError(403, "Synthetic denial"));
    expect((await submitRefillApproval(attempt, send, true)).state).toBe(
      "unknown",
    );
    expect((await submitRefillApproval(attempt, send)).state).toBe("failed");
    expect(Object.isFrozen(attempt.body.refill_request)).toBe(true);
  });
});

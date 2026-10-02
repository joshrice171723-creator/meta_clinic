import { beforeEach, expect, it, vi } from "vitest";
import type { DemoRunResponse } from "../src/features/demo/contracts";
import {
  canEnterCareModel,
  enterSandboxCareModel,
} from "../src/features/demo/careModels";

const transport = vi.hoisted(() => ({
  api: vi.fn(),
  setApiActor: vi.fn(),
  setClinicPractice: vi.fn(),
}));
vi.mock("../src/api/client", () => transport);

const accounts = [
  "admin",
  "front_desk",
  "clinician",
  "inventory",
  "patient",
] as const;
const response = {
  active: true,
  run: {
    id: "synthetic-model-run",
    sandbox: true,
    account: { key: "admin", user_id: 100, portal: "clinic" },
    clinic: { id: 34 },
  },
} as DemoRunResponse;
const context = {
  user_id: 100,
  demo_sandbox: true,
  practice: { id: 34 },
  membership_id: 51,
  practices: [
    { id: 34, name: "Sandbox Primary Care", organization: { id: 7 } },
    { id: 35, name: "Sandbox Weight Management", organization: { id: 7 } },
  ],
};
beforeEach(() => vi.clearAllMocks());

it("maps all existing accounts to Primary care and only Admin to Weight management", () => {
  for (const account of accounts) {
    expect(canEnterCareModel(account, "primary_care")).toBe(true);
    expect(canEnterCareModel(account, "weight_management")).toBe(
      account === "admin",
    );
  }
});

it.each(accounts)(
  "%s Primary care entry makes no new scope request",
  async (key) => {
    await enterSandboxCareModel(
      {
        ...response,
        run: { ...(response as any).run, account: { key } },
      } as DemoRunResponse,
      "primary_care",
    );
    expect(transport.api).not.toHaveBeenCalled();
    expect(transport.setApiActor).not.toHaveBeenCalled();
  },
);

it.each(accounts.filter((key) => key !== "admin"))(
  "denies %s Weight management before transport",
  async (key) => {
    await expect(
      enterSandboxCareModel(
        {
          ...response,
          run: {
            ...(response as any).run,
            account: { key, portal: key === "patient" ? "patient" : "clinic" },
          },
        } as DemoRunResponse,
        "weight_management",
      ),
    ).rejects.toThrow("only to the existing Admin");
    expect(transport.api).not.toHaveBeenCalled();
  },
);

it("switches the existing Admin through context, then confirms actor and membership", async () => {
  transport.api
    .mockResolvedValueOnce(context)
    .mockResolvedValueOnce({ practice_id: 35, membership_id: 52 })
    .mockResolvedValueOnce({
      ...context,
      practice: { id: 35 },
      membership_id: 52,
    });
  await enterSandboxCareModel(response, "weight_management");
  expect(transport.setApiActor).toHaveBeenCalledWith(100);
  expect(transport.setClinicPractice.mock.calls).toEqual([[34], [35]]);
  expect(transport.api.mock.calls).toEqual([
    ["/api/clinic/context"],
    ["/api/clinic/context", { method: "PATCH", body: { practice_id: 35 } }],
    ["/api/clinic/context"],
  ]);
});

it.each([
  { ...context, user_id: 999 },
  { ...context, demo_sandbox: false },
  { ...context, practice: { id: 35 } },
  { ...context, practices: undefined },
  { ...context, practices: context.practices.slice(0, 1) },
  {
    ...context,
    practices: [
      context.practices[0],
      { ...context.practices[1], organization: { id: 999 } },
    ],
  },
  { ...context, practices: [...context.practices, context.practices[1]] },
])(
  "denies missing, unrelated, ambiguous or stale context without a mutation",
  async (projection) => {
    transport.api.mockResolvedValueOnce(projection);
    await expect(
      enterSandboxCareModel(response, "weight_management"),
    ).rejects.toThrow("assignment could not be confirmed");
    expect(transport.api).toHaveBeenCalledTimes(1);
  },
);

it("does not retry an unconfirmed scope switch or mount a claimed success", async () => {
  transport.api
    .mockResolvedValueOnce(context)
    .mockRejectedValueOnce(new Error("Outcome unconfirmed"));
  await expect(
    enterSandboxCareModel(response, "weight_management"),
  ).rejects.toThrow("Outcome unconfirmed");
  expect(transport.api).toHaveBeenCalledTimes(2);
  expect(transport.setClinicPractice.mock.calls).toEqual([[34]]);
});

it.each([
  { ...context, practice: { id: 35 }, membership_id: 999 },
  { ...context, practice: { id: 35 }, membership_id: 52, user_id: 999 },
  { ...context, practice: { id: 34 }, membership_id: 52 },
])(
  "rejects changed actor, clinic or membership after switch",
  async (projection) => {
    transport.api
      .mockResolvedValueOnce(context)
      .mockResolvedValueOnce({ practice_id: 35, membership_id: 52 })
      .mockResolvedValueOnce(projection);
    await expect(
      enterSandboxCareModel(response, "weight_management"),
    ).rejects.toThrow("changed while opening");
  },
);

import { beforeEach, describe, expect, it, vi } from "vitest";

type HookSlot = {
  value: unknown;
  set: (next: unknown) => void;
};
type ElementNode = {
  type: unknown;
  props: Record<string, unknown>;
};

const harness = vi.hoisted(() => ({
  cursor: 0,
  hooks: [] as HookSlot[],
  refs: [] as Array<{ current: unknown }>,
  resource: {
    data: {
      enrollment: {
        clinic_name: "Synthetic Clinic",
        package_name: "Monthly membership",
        amount: "79.25",
        currency: "USD",
        renewal: "automatic",
        stage: "paid_onboarding",
        can_pay: false,
        redirect_to: "/patient-portal?membership_payment=local#onboarding",
        local_simulator: {
          enabled: true,
          source: "local_membership_payment_simulator",
          vendor_confirmed: false,
          evidence: "server_signed_local_event",
          checkout_started: true,
          payment_verified: true,
          recurring: true,
          cancel_at_period_end: false,
        },
      },
    },
    refresh: vi.fn(),
  },
}));
const api = vi.hoisted(() => vi.fn());

vi.mock("react", () => ({
  useEffect: () => undefined,
  useState: <T,>(initial: T) => {
    const index = harness.cursor++;
    harness.hooks[index] ??= {
      value: initial,
      set: (next) => {
        const current = harness.hooks[index].value;
        harness.hooks[index].value =
          typeof next === "function"
            ? (next as (value: unknown) => unknown)(current)
            : next;
      },
    };
    const slot = harness.hooks[index];
    return [slot.value as T, slot.set] as const;
  },
  useRef: <T,>(initial: T) => {
    const index = harness.cursor++;
    harness.refs[index] ??= { current: initial };
    return harness.refs[index] as { current: T };
  },
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
}));
vi.mock("@mui/material", () =>
  Object.fromEntries(
    ["Alert", "Box", "Button", "Paper", "Stack", "Typography"].map((name) => [
      name,
      name,
    ]),
  ),
);
vi.mock("../src/api/client", () => ({ api }));
vi.mock("../src/shared/ui", () => ({
  useResource: () => harness.resource,
}));
vi.mock("../src/features/demo/frame", () => ({ isDemoFrame: () => false }));
vi.mock("../src/features/clinic/subscriptions/contracts", () => ({
  subscriptionMoney: (amount: string) => amount,
}));

import { MembershipAccount } from "../src/features/membershipGrowth/MembershipAccount";

function renderAccount() {
  harness.cursor = 0;
  return MembershipAccount() as ElementNode;
}

function findButton(node: unknown, label: string): ElementNode | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ElementNode;
  if (element.type === "Button" && element.props.children === label)
    return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findButton(child, label);
    if (match) return match;
  }
  return undefined;
}

function click(button: ElementNode | undefined) {
  expect(button).toBeDefined();
  (button!.props.onClick as () => void)();
}

function requestKey(callIndex: number) {
  return (
    api.mock.calls[callIndex][1] as {
      body: { payment: { request_key: string } };
    }
  ).body.payment.request_key;
}

beforeEach(() => {
  harness.cursor = 0;
  harness.hooks = [];
  harness.refs = [];
  harness.resource.refresh.mockReset();
  api.mockReset();
  vi.stubGlobal("crypto", {
    randomUUID: vi
      .fn()
      .mockReturnValueOnce("retry-key-1")
      .mockReturnValueOnce("cancel-key-2"),
  });
  vi.stubGlobal("window", {
    location: {
      pathname: "/memberships/account",
      search: "?payment=local",
      replace: vi.fn(),
      assign: vi.fn(),
    },
  });
});

describe("membership local payment retries", () => {
  it("reuses an uncertain request key and rotates it after a confirmed outcome", async () => {
    let rejectPayment!: (reason: Error) => void;
    api.mockImplementationOnce(
      () => new Promise((_, reject) => (rejectPayment = reject)),
    );

    click(findButton(renderAccount(), "Record renewal failure"));
    expect(api).toHaveBeenCalledTimes(1);
    const firstKey = requestKey(0);
    rejectPayment(new Error("The response timed out after the request."));
    await vi.waitFor(() => expect(harness.hooks[0].value).toBe(false));

    api.mockResolvedValueOnce({ payment: { payment_verified: true } });
    click(findButton(renderAccount(), "Record renewal failure"));
    await vi.waitFor(() =>
      expect(harness.resource.refresh).toHaveBeenCalledTimes(1),
    );
    expect(api).toHaveBeenCalledTimes(2);
    expect(requestKey(1)).toBe(firstKey);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);

    api.mockResolvedValueOnce({ payment: { cancel_at_period_end: true } });
    click(findButton(renderAccount(), "Cancel future renewals"));
    await vi.waitFor(() =>
      expect(harness.resource.refresh).toHaveBeenCalledTimes(2),
    );
    expect(requestKey(2)).toBe("cancel-key-2");
    expect(requestKey(2)).not.toBe(firstKey);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
  });
});

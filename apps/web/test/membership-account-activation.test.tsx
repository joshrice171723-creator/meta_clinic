import { beforeEach, describe, expect, it, vi } from "vitest";

type StateSlot = {
  value: unknown;
  set: (next: unknown) => void;
};
type ElementNode = {
  type: unknown;
  props: Record<string, unknown>;
};

const hooks = vi.hoisted(() => ({
  cursor: 0,
  states: [] as StateSlot[],
}));
const api = vi.hoisted(() => vi.fn());

vi.mock("react", () => ({
  useState: <T,>(initial: T | (() => T)) => {
    const index = hooks.cursor++;
    hooks.states[index] ??= {
      value: typeof initial === "function" ? (initial as () => T)() : initial,
      set: (next) => {
        hooks.states[index].value = next;
      },
    };
    const slot = hooks.states[index];
    return [slot.value as T, slot.set] as const;
  },
}));

vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
  jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
}));

vi.mock("@mui/material", () =>
  Object.fromEntries(
    [
      "Alert",
      "Box",
      "Button",
      "Checkbox",
      "Chip",
      "FormControlLabel",
      "Paper",
      "Stack",
      "TextField",
      "Typography",
    ].map((name) => [name, name]),
  ),
);
vi.mock("../src/api/client", () => ({ api }));

import { MembershipAccountActivation } from "../src/features/membershipGrowth/MembershipAccountActivation";

function renderActivation() {
  hooks.cursor = 0;
  return MembershipAccountActivation() as ElementNode;
}

function findForm(node: unknown): ElementNode | undefined {
  if (!node || typeof node !== "object") return undefined;
  const element = node as ElementNode;
  if (element.type === "Stack" && element.props.component === "form")
    return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findForm(child);
    if (match) return match;
  }
  return undefined;
}

function setValidCredentials() {
  hooks.states[1].set("Synthetic-password-2026!");
  hooks.states[2].set("Synthetic-password-2026!");
  hooks.states[3].set(true);
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.states = [];
  api.mockReset();
  vi.stubGlobal("window", {
    location: {
      pathname: "/memberships/account/activate",
      search: "?source=email",
      hash: "#token=one-time-activation-token",
      assign: vi.fn(),
    },
    history: { replaceState: vi.fn() },
  });
});

describe("membership account activation recovery", () => {
  it("keeps the one-time email link reloadable after a temporary activation failure and scrubs it after success", async () => {
    api.mockRejectedValueOnce(new Error("Temporary activation failure"));
    const firstForm = findForm(renderActivation());
    expect(firstForm).toBeDefined();
    setValidCredentials();
    await (
      firstForm!.props.onSubmit as (event: {
        preventDefault: () => void;
      }) => Promise<void>
    )({ preventDefault: vi.fn() });

    expect(api).toHaveBeenCalledWith(
      "/api/public/membership_accounts/activate",
      expect.objectContaining({
        body: expect.objectContaining({
          membership_account: expect.objectContaining({
            token: "one-time-activation-token",
          }),
        }),
      }),
    );
    expect(window.history.replaceState).not.toHaveBeenCalled();

    hooks.states = [];
    const reloadedForm = findForm(renderActivation());
    expect(reloadedForm).toBeDefined();
    setValidCredentials();
    api.mockResolvedValueOnce({
      account: { redirect_to: "/memberships/account" },
    });
    await (
      reloadedForm!.props.onSubmit as (event: {
        preventDefault: () => void;
      }) => Promise<void>
    )({ preventDefault: vi.fn() });

    expect(api).toHaveBeenLastCalledWith(
      "/api/public/membership_accounts/activate",
      expect.objectContaining({
        body: expect.objectContaining({
          membership_account: expect.objectContaining({
            token: "one-time-activation-token",
          }),
        }),
      }),
    );
    expect(window.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/memberships/account/activate?source=email",
    );
    expect(window.location.assign).toHaveBeenCalledWith("/memberships/account");
  });
});

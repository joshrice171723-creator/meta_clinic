import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Synthetic component checks: execute the PR35 component with synthetic state and
// an in-memory API promise. No browser, service, reset, or network request runs.
const harness = vi.hoisted(() => ({
  cursor: 0,
  refCursor: 0,
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  request: vi.fn(),
  initial: null as unknown,
}));
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => undefined,
  useRef: (initial: unknown) => {
    const index = harness.refCursor++;
    return (harness.refs[index] ??= { current: initial });
  },
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states))
      harness.states[index] =
        index === 0
          ? harness.initial
          : typeof initial === "function"
            ? initial()
            : initial;
    return [
      harness.states[index],
      (next: unknown) => {
        harness.states[index] =
          typeof next === "function" ? next(harness.states[index]) : next;
      },
    ];
  },
}));
vi.mock("react/jsx-runtime", () => ({
  Fragment: "Fragment",
  jsx: (type: unknown, props: unknown) => ({ type, props }),
  jsxs: (type: unknown, props: unknown) => ({ type, props }),
}));
vi.mock("@mui/material", () =>
  Object.fromEntries(
    [
      "Alert",
      "Box",
      "Button",
      "Chip",
      "CircularProgress",
      "Dialog",
      "DialogActions",
      "DialogContent",
      "DialogTitle",
      "LinearProgress",
      "MenuItem",
      "Paper",
      "Stack",
      "TextField",
      "Typography",
      "ToggleButton",
      "ToggleButtonGroup",
    ].map((name) => [name, name]),
  ),
);
vi.mock("@mui/icons-material/ArrowForwardRounded", () => ({
  default: "ArrowForwardRounded",
}));
vi.mock("../src/api/client", () => ({
  api: harness.request,
  clearCsrf: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public code?: string,
    ) {
      super(message);
    }
  },
}));

import { DemoJourney } from "../src/features/demo/DemoJourney";
import { ApiError } from "../src/api/client";

type Element = { type: unknown; props: Record<string, any> };
const payload = {
  active: true,
  run: {
    id: "synthetic-run-34",
    lesson_key: "sandbox",
    sandbox: true,
    lessons: [],
    steps: [{ id: "sandbox", href: "/clinic/tracking" }],
    clinic: { id: 34, name: "Synthetic GH34 clinic", slug: "synthetic-gh34" },
  },
};
function render() {
  harness.cursor = 0;
  harness.refCursor = 0;
  return DemoJourney() as unknown as Element;
}
function nodes(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as Element;
  return [element, ...nodes(element.props.children)];
}
function text(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree === null || tree === undefined || typeof tree === "boolean")
    return "";
  if (typeof tree === "object") return text((tree as Element).props?.children);
  return String(tree);
}
function resetDialog(tree: Element) {
  return nodes(tree).find(
    (node) => node.type === "Dialog" && text(node).includes("Reset Sandbox?"),
  )!;
}
function button(tree: Element, label: string) {
  return nodes(tree).find(
    (node) => node.type === "Button" && text(node) === label,
  )!;
}
function startMockedReset() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  harness.request.mockReturnValue(
    new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    }),
  );
  button(render(), "Reset Sandbox").props.onClick();
  const dialog = resetDialog(render());
  expect(dialog.props.open).toBe(true);
  button(dialog, "Reset Sandbox").props.onClick();
  return { resolve, reject };
}
async function settle() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}
function beginReset() {
  button(render(), "Reset Sandbox").props.onClick();
  button(resetDialog(render()), "Reset Sandbox").props.onClick();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-30T08:00:00Z"));
  harness.cursor = harness.refCursor = 0;
  harness.states = [];
  harness.refs = [];
  harness.initial = { status: "ready", value: payload };
  harness.request.mockReset();
  vi.stubGlobal("window", {
    location: { origin: "http://synthetic-gh34.invalid" },
    sessionStorage: { getItem: () => null, setItem: vi.fn() },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GH34 reset progress (mocked component evidence, not live reset acceptance)", () => {
  it("keeps pending reset progress and elapsed time inside the open confirmation dialog", () => {
    startMockedReset();
    const tree = render();
    const dialog = resetDialog(tree);
    expect(dialog.props.open).toBe(true);
    expect(button(dialog, "Cancel").props.disabled).toBe(true);
    expect(button(dialog, "Reset Sandbox").props.disabled).toBe(true);
    expect(nodes(tree).some((node) => node.props.role === "status")).toBe(true);
    expect(nodes(tree).some((node) => node.type === "LinearProgress")).toBe(
      true,
    );
    expect(nodes(dialog).some((node) => node.props.role === "status")).toBe(
      true,
    );
    expect(nodes(dialog).some((node) => node.type === "LinearProgress")).toBe(
      true,
    );
    expect(text(dialog)).toContain("Elapsed: 0:00");
    expect(
      nodes(tree).filter((node) => node.props.role === "status"),
    ).toHaveLength(1);
    expect(harness.request).toHaveBeenCalledTimes(1);
    expect(harness.request).toHaveBeenCalledWith("/api/demo/lesson", {
      method: "POST",
      body: { lesson_key: "sandbox", restart: true, account: "admin" },
      timeoutMs: 240_000,
    });
  });
  it("shows the original failure and duration in the dialog after the mocked request settles", async () => {
    const pending = startMockedReset();
    vi.setSystemTime(new Date("2026-09-30T08:00:16Z"));
    pending.reject(new Error("Not found."));
    await settle();
    const dialog = resetDialog(render());
    expect(dialog.props.open).toBe(true);
    expect(text(dialog)).toContain("Not found. Preparation ran for 0:16.");
    expect(nodes(dialog).some((node) => node.props.role === "status")).toBe(
      false,
    );
    expect(button(dialog, "Cancel").props.disabled).toBe(false);
    expect(button(dialog, "Reset Sandbox").props.disabled).toBe(false);
    expect(harness.request).toHaveBeenCalledTimes(1);
  });
  it("closes the dialog only when the mocked reset response succeeds", async () => {
    const pending = startMockedReset();
    harness.request
      .mockResolvedValueOnce({ complete: true })
      .mockResolvedValueOnce(payload)
      .mockResolvedValueOnce(payload);
    expect(resetDialog(render()).props.open).toBe(true);
    pending.resolve(payload);
    await settle();
    const tree = render();
    expect(resetDialog(tree).props.open).toBe(false);
    expect(nodes(tree).some((node) => node.props.role === "status")).toBe(
      false,
    );
    expect(harness.request).toHaveBeenCalledTimes(4);
    expect(harness.request).toHaveBeenNthCalledWith(4, "/api/demo/run/view", {
      method: "POST",
      body: {
        account: "admin",
        expected_run_id: payload.run.id,
        expected_user_id: null,
      },
    });
  });
  it("waits for all stages after recovering a lost initial response", async () => {
    const replacement = {
      ...payload,
      run: { ...payload.run, id: "synthetic-replacement-34" },
    };
    let finish!: (value: unknown) => void;
    harness.request
      .mockRejectedValueOnce(
        new ApiError(0, "Response lost", "outcome_unconfirmed"),
      )
      .mockResolvedValueOnce(replacement)
      .mockResolvedValueOnce({ complete: false })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce(replacement)
      .mockResolvedValueOnce(replacement);
    beginReset();
    await settle();
    expect(resetDialog(render()).props.open).toBe(true);
    expect(button(resetDialog(render()), "Reset Sandbox").props.disabled).toBe(
      true,
    );
    expect(harness.states[0]).toEqual({ status: "ready", value: payload });
    expect(harness.request).toHaveBeenNthCalledWith(
      4,
      "/api/demo/sandbox/prepare",
      {
        method: "POST",
        body: {},
        timeoutMs: 240_000,
      },
    );
    finish({ complete: true });
    await settle();
    expect(resetDialog(render()).props.open).toBe(false);
    expect(harness.states[0]).toEqual({ status: "ready", value: replacement });
    expect(harness.request).toHaveBeenNthCalledWith(5, "/api/demo/run");
    expect(harness.request).toHaveBeenNthCalledWith(6, "/api/demo/run/view", {
      method: "POST",
      body: {
        account: "admin",
        expected_run_id: replacement.run.id,
        expected_user_id: null,
      },
    });
  });
  it("keeps the original failure when recovery only finds the old run", async () => {
    harness.request
      .mockRejectedValueOnce(
        new ApiError(0, "Response lost", "outcome_unconfirmed"),
      )
      .mockResolvedValueOnce(payload);
    beginReset();
    await settle();
    expect(resetDialog(render()).props.open).toBe(true);
    expect(text(resetDialog(render()))).toContain("Response lost");
    expect(harness.request).toHaveBeenCalledTimes(2);
  });
  it("retains a preparation denial after initial-response recovery without showing success", async () => {
    const replacement = {
      ...payload,
      run: { ...payload.run, id: "synthetic-replacement-34" },
    };
    harness.request
      .mockRejectedValueOnce(
        new ApiError(0, "Response lost", "outcome_unconfirmed"),
      )
      .mockResolvedValueOnce(replacement)
      .mockRejectedValueOnce(new ApiError(404, "Not found."));
    beginReset();
    await settle();
    expect(resetDialog(render()).props.open).toBe(true);
    expect(text(resetDialog(render()))).toContain("Not found.");
    expect(button(resetDialog(render()), "Reset Sandbox").props.disabled).toBe(
      false,
    );
    expect(harness.states[0]).toEqual({ status: "ready", value: payload });
    expect(harness.request).toHaveBeenCalledTimes(3);
  });
});

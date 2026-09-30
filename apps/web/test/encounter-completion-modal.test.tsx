import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Dialog, TextField } from "@mui/material";
import { beforeEach, expect, it, vi } from "vitest";
import type { EncounterDetail, Patient } from "../src/api/contracts";
import { VisitWrapUp } from "../src/features/clinic/CareFlow";

// Exercise the real handler and returned dialog without adding a DOM framework.
// Only this component invocation uses controlled hooks; MUI renders normally.
const harness = vi.hoisted(() => ({
  active: false,
  cursor: 0,
  refCursor: 0,
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  post: vi.fn(),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!harness.active) return actual.useState(initial);
      const index = harness.cursor++;
      if (!(index in harness.states)) harness.states[index] = initial;
      return [
        harness.states[index],
        (value: unknown) => {
          harness.states[index] = value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      if (!harness.active) return actual.useRef(initial);
      const index = harness.refCursor++;
      return (harness.refs[index] ??= { current: initial });
    },
    useEffect: (...args: Parameters<typeof actual.useEffect>) => {
      if (!harness.active) actual.useEffect(...args);
    },
  };
});
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: harness.post,
}));
vi.mock("../src/features/clinic/Workspace", () => ({
  useClinic: () => ({ capabilities: { encounters: true } }),
}));
vi.mock("../src/shared/ui", async (original) => ({
  ...(await original<typeof import("../src/shared/ui")>()),
  useResource: () => ({
    data: {
      can_complete: true,
      evidence: {
        follow_up: { id: 1, version: 1, status: "recorded" },
        signed_instruction: null,
        education_events: [],
        open_tasks: [],
      },
      options: {
        disposition_codes: ["other"],
        instructions_statuses: ["not_required"],
        education_statuses: ["not_required"],
      },
    },
    refresh: vi.fn(),
  }),
}));
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    return [child, ...elements(child.props.children as ReactNode)];
  });
}
function renderWrapUp() {
  harness.cursor = 0;
  harness.refCursor = 0;
  harness.active = true;
  try {
    return VisitWrapUp({
      patient: { id: 7, display_name: "Synthetic Patient" } as Patient,
      encounter: { id: 9, patient_id: 7, status: "open" } as EncounterDetail,
      timezone: "UTC",
    });
  } finally {
    harness.active = false;
  }
}
const exceptionError = "Record what happened for this completion exception.";
function confirmationDialog(tree = renderWrapUp()) {
  return elements(tree).find((node) => node.type === Dialog)!;
}
function button(tree: ReactNode, label: string) {
  return elements(tree).find(
    (node) => node.type === Button && node.props.children === label,
  )!;
}
function click(node: ReactElement<Record<string, unknown>>) {
  (node.props.onClick as () => void)();
}
function dialogErrors(dialog = confirmationDialog()) {
  return elements(dialog.props.children as ReactNode).filter(
    (node) => typeof node.props.message === "string",
  );
}
beforeEach(() => {
  harness.post.mockReset();
  harness.refs = [];
  harness.states = [
    null,
    null,
    false,
    "",
    "idle",
    null,
    null,
    "other",
    "not_required",
    "not_required",
    "   ",
    true,
  ];
});
it("shows a missing Other-outcome exception note inside the open confirmation without posting", () => {
  harness.post.mockClear();
  // completed, review, busy, error, close state, confirmation, request key,
  // disposition, instruction status, education status, exception, work review.
  harness.states = [
    null,
    null,
    false,
    "",
    "idle",
    "close",
    null,
    "other",
    "not_required",
    "not_required",
    "   ",
    true,
  ];
  const dialog = elements(renderWrapUp()).find((node) => node.type === Dialog)!;
  const confirm = elements(dialog.props.children as ReactNode).find(
    (node) => node.type === Button && node.props.variant === "contained",
  )!;
  (confirm.props.onClick as () => void)();
  const updated = elements(renderWrapUp()).find(
    (node) => node.type === Dialog,
  )!;
  expect(updated.props.open).toBe(true);
  const error = elements(updated.props.children as ReactNode).find(
    (node) =>
      node.props.message ===
      "Record what happened for this completion exception.",
  );
  expect(error).toBeDefined();
  expect(renderToStaticMarkup(error!)).toContain('role="alert"');
  expect(harness.post).not.toHaveBeenCalled();
  expect(harness.states[10]).toBe("   ");
  expect(harness.states[6]).toBeNull();
  expect(harness.states[4]).toBe("idle");
});

it("opens a clean confirmation after validation, Go back, and correcting the exception", () => {
  click(button(renderWrapUp(), "Complete encounter"));
  click(button(confirmationDialog(), "Confirm completion"));
  expect(dialogErrors().map((node) => node.props.message)).toEqual([
    exceptionError,
  ]);

  click(button(confirmationDialog(), "Go back"));
  expect(confirmationDialog().props.open).toBe(false);
  const exception = elements(renderWrapUp()).find(
    (node) =>
      node.type === TextField &&
      node.props.label === "Completion exception note",
  )!;
  (exception.props.onChange as (event: { target: { value: string } }) => void)({
    target: { value: "Independently synthetic completion exception." },
  });
  click(button(renderWrapUp(), "Complete encounter"));

  const reopened = confirmationDialog();
  expect(reopened.props.open).toBe(true);
  expect(dialogErrors(reopened)).toEqual([]);
  expect(harness.states[10]).toBe(
    "Independently synthetic completion exception.",
  );
  expect(harness.post).not.toHaveBeenCalled();
  expect(harness.states[6]).toBeNull();
  expect(harness.states[4]).toBe("idle");
});

it("revalidates still-invalid input after reopening without posting or allocating a key", () => {
  click(button(renderWrapUp(), "Complete encounter"));
  click(button(confirmationDialog(), "Confirm completion"));
  click(button(confirmationDialog(), "Go back"));
  click(button(renderWrapUp(), "Complete encounter"));
  expect(dialogErrors()).toEqual([]);

  click(button(confirmationDialog(), "Confirm completion"));
  expect(confirmationDialog().props.open).toBe(true);
  expect(dialogErrors().map((node) => node.props.message)).toEqual([
    exceptionError,
  ]);
  expect(harness.states[10]).toBe("   ");
  expect(harness.post).not.toHaveBeenCalled();
  expect(harness.states[6]).toBeNull();
  expect(harness.states[4]).toBe("idle");
});

it("retains the duplicate-submit guard and the unresolved attempt after a valid confirmation", async () => {
  let reject!: (reason: Error) => void;
  harness.post.mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  harness.states[10] = "Independently synthetic completion exception.";
  click(button(renderWrapUp(), "Complete encounter"));
  click(button(confirmationDialog(), "Confirm completion"));
  const pending = renderWrapUp();
  expect(button(pending, "Completing encounter…").props.disabled).toBe(true);
  expect(
    button(confirmationDialog(pending), "Confirm completion").props.disabled,
  ).toBe(true);
  click(button(confirmationDialog(pending), "Confirm completion"));
  expect(harness.post).toHaveBeenCalledTimes(1);
  const requestKey = harness.states[6];
  expect(typeof requestKey).toBe("string");
  expect(harness.states[4]).toBe("closing");
  expect(harness.post.mock.calls[0][0]).toBe("/api/clinic/encounters/9/close");
  expect(harness.post.mock.calls[0][1].body.close.request_key).toBe(requestKey);

  reject(new Error("Synthetic response unavailable."));
  await Promise.resolve();
  await Promise.resolve();
  const unconfirmed = renderWrapUp();
  expect(button(unconfirmed, "Complete encounter").props.disabled).toBe(true);
  click(button(confirmationDialog(unconfirmed), "Confirm completion"));
  expect(harness.post).toHaveBeenCalledTimes(1);
  expect(harness.states[6]).toBe(requestKey);
  expect(harness.refs[0].current).toBe(requestKey);
  expect(harness.states[4]).toBe("outcome_unconfirmed");
  expect(harness.states[3]).toBe(
    "The visit close could not be confirmed. No automatic retry was made. Check the current encounter status.",
  );
});

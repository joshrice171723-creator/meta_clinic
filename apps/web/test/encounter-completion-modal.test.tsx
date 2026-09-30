import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Dialog } from "@mui/material";
import { expect, it, vi } from "vitest";
import type { EncounterDetail, Patient } from "../src/api/contracts";
import { VisitWrapUp } from "../src/features/clinic/CareFlow";

// Exercise the real handler and returned dialog without adding a DOM framework.
// Only this component invocation uses controlled hooks; MUI renders normally.
const harness = vi.hoisted(() => ({
  active: false,
  cursor: 0,
  states: [] as unknown[],
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
    useRef: (initial: unknown) =>
      harness.active ? { current: initial } : actual.useRef(initial),
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

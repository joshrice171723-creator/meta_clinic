import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Dialog, Stack } from "@mui/material";
import { beforeEach, expect, it, vi } from "vitest";
import { PatientClinicalHistory } from "../src/features/clinic/PatientClinicalHistory";
import type { ClinicalHistoryResponse } from "../src/features/clinic/clinicalHistory";

// In-memory responses only; invoke the real control/dialog/transport handlers.
// Controlled hooks apply only to PatientClinicalHistory, leaving MUI unmodified.
const harness = vi.hoisted(() => ({
  active: false,
  cursor: 0,
  states: [] as unknown[],
  data: null as ClinicalHistoryResponse | null,
  api: vi.fn(),
  refresh: vi.fn(),
  changed: vi.fn(),
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
          harness.states[index] =
            typeof value === "function" ? value(harness.states[index]) : value;
        },
      ];
    },
    useMemo: (factory: () => unknown, deps: unknown[]) =>
      harness.active ? factory() : actual.useMemo(factory, deps),
    useEffect: (...args: Parameters<typeof actual.useEffect>) => {
      if (!harness.active) actual.useEffect(...args);
    },
  };
});
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: harness.api,
}));
vi.mock("../src/shared/ui", async (original) => ({
  ...(await original<typeof import("../src/shared/ui")>()),
  useResource: () => ({ data: harness.data, refresh: harness.refresh }),
}));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => ({ registerBlocker: vi.fn() }),
}));
beforeEach(() => {
  harness.states = [];
  harness.data = {
    schema_version: "patient-clinical-history-v1",
    patient_id: 7,
    encounter_id: 9,
    can_write: true,
    allergies: [],
    medications: [],
    conditions: [],
    reviews: {},
  };
  harness.api.mockReset();
  harness.refresh.mockReset();
  harness.changed.mockReset();
});
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    return [child, ...elements(child.props.children as ReactNode)];
  });
}
function render(encounterId: number | null = 9) {
  harness.cursor = 0;
  harness.active = true;
  try {
    return PatientClinicalHistory({
      patientId: 7,
      encounterId: encounterId ?? undefined,
      onChanged: harness.changed,
    });
  } finally {
    harness.active = false;
  }
}
function button(tree: ReactNode, label: string) {
  return elements(tree).find(
    (node) => node.type === Button && node.props.children === label,
  )!;
}
function openReview() {
  const control = button(render(), "Review care needs");
  expect(control).toBeDefined();
  (control.props.onClick as () => void)();
  const dialog = elements(render()).find(
    (node) => node.type === Dialog && node.props.open,
  )!;
  expect(dialog).toBeDefined();
  expect(renderToStaticMarkup(dialog.props.children as ReactNode)).toContain(
    "Review Care needs",
  );
}
function choose(label: string, value: string) {
  const field = elements(render()).find((node) => node.props.label === label)!;
  (field.props.onChange as (value: string) => void)(value);
}
it.each(["none_reported", "current_list_confirmed"])(
  "records explicit %s care-needs review through the existing encounter API",
  async (outcome) => {
    openReview();
    expect(button(render(), "Record review").props.disabled).toBe(true);
    expect(harness.api).not.toHaveBeenCalled();
    choose("Review outcome", outcome);
    expect(button(render(), "Record review").props.disabled).toBe(true);
    choose("Information source", "patient");
    harness.api.mockResolvedValue({ patient_id: 7, encounter_id: 9 });
    const submit = button(render(), "Record review");
    expect(submit.props.disabled).toBe(false);
    await (submit.props.onClick as () => Promise<void>)();
    expect(harness.api).toHaveBeenCalledExactlyOnceWith(
      "/api/clinic/patients/7/clinical_history/reviews",
      {
        method: "POST",
        body: {
          review: {
            encounter_id: 9,
            request_key: expect.any(String),
            topic: "care_needs",
            outcome,
            information_source: "patient",
            notes: "",
          },
        },
      },
    );
    expect(harness.refresh).toHaveBeenCalledOnce();
    expect(harness.changed).toHaveBeenCalledOnce();
    expect(
      elements(render()).filter(
        (node) => node.type === Dialog && node.props.open,
      ),
    ).toHaveLength(0);
    expect(renderToStaticMarkup(render())).toContain(
      "Care needs review recorded.",
    );
  },
);
it.each([
  "completed encounter",
  "reader without write permission",
  "no encounter",
])("does not offer care-needs review for %s", (reason) => {
  harness.data!.can_write = false;
  const tree = reason === "no encounter" ? render(null) : render();
  expect(button(tree, "Review care needs")).toBeUndefined();
  expect(harness.api).not.toHaveBeenCalled();
});
it("keeps an unknown review locked to its exact request until explicit retry succeeds", async () => {
  openReview();
  choose("Review outcome", "unable_to_obtain");
  choose("Information source", "patient");
  harness.api.mockRejectedValueOnce(new Error("Synthetic connection lost"));
  await (
    button(render(), "Record review").props.onClick as () => Promise<void>
  )();
  const first = structuredClone(harness.api.mock.calls[0]);
  const tree = render();
  const dialog = elements(tree).find(
    (node) => node.type === Dialog && node.props.open,
  )!;
  expect(dialog.props.onClose).toBeUndefined();
  expect(button(dialog, "Cancel").props.disabled).toBe(true);
  expect(
    elements(dialog).find(
      (node) => node.type === Stack && node.props.component === "fieldset",
    )!.props.disabled,
  ).toBe(true);
  expect(harness.refresh).not.toHaveBeenCalled();
  expect(harness.changed).not.toHaveBeenCalled();
  harness.api.mockResolvedValueOnce({ patient_id: 7, encounter_id: 9 });
  await (
    button(render(), "Retry same review").props.onClick as () => Promise<void>
  )();
  expect(harness.api.mock.calls[1]).toEqual(first);
  expect(harness.refresh).toHaveBeenCalledOnce();
  expect(harness.changed).toHaveBeenCalledOnce();
});
it("does not accept a review receipt from another patient encounter", async () => {
  openReview();
  choose("Review outcome", "none_reported");
  choose("Information source", "patient");
  harness.api.mockResolvedValueOnce({ patient_id: 8, encounter_id: 10 });
  await (
    button(render(), "Record review").props.onClick as () => Promise<void>
  )();
  expect(button(render(), "Retry same review")).toBeDefined();
  expect(harness.refresh).not.toHaveBeenCalled();
  expect(harness.changed).not.toHaveBeenCalled();
});

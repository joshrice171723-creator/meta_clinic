import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import { PatientClinicalHistory } from "../src/features/clinic/PatientClinicalHistory";
import type { ClinicalHistoryResponse } from "../src/features/clinic/clinicalHistory";

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  data: undefined as unknown,
  api: vi.fn(),
  refresh: vi.fn(),
  changed: vi.fn(),
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
        (value: T | ((current: T) => T)) => {
          harness.slots[slot] =
            typeof value === "function"
              ? (value as (current: T) => T)(harness.slots[slot] as T)
              : value;
        },
      ];
    },
    useRef<T>(initial: T) {
      const slot = harness.cursor++;
      if (!(slot in harness.slots)) harness.slots[slot] = { current: initial };
      return harness.slots[slot] as { current: T };
    },
    useMemo<T>(create: () => T) {
      return create();
    },
    useEffect() {},
  };
});
vi.mock("../src/api/client", async (original) => ({
  ...(await original<typeof import("../src/api/client")>()),
  api: harness.api,
}));
vi.mock("../src/shared/ui", () => ({
  useResource: () => ({ data: harness.data, refresh: harness.refresh }),
  LoadState: () => null,
}));
vi.mock("../src/features/clinic/clinicNavigation", () => ({
  useClinicNavigation: () => ({ registerBlocker: () => () => {} }),
}));

type Props = {
  children?: ReactNode;
  label?: string;
  value?: unknown;
  component?: string;
  open?: boolean;
  disabled?: boolean;
  severity?: string;
  onClick?: () => void | Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
};
type Mode = "record POST" | "record PATCH" | "review POST";
const modes: Mode[] = ["record POST", "record PATCH", "review POST"];
const patientId = 17;
const encounterId = 29;
const recordId = 81;
const originalText = " Synthetic draft A \nComplete narrative line two ";
const correctedText = " Synthetic draft B \nComplete corrected narrative ";
const record = {
  id: recordId,
  patient_id: patientId,
  lock_version: 7,
  recorded_at: "2026-10-01T12:00:00Z",
  last_reviewed_at: null,
  allergen_name: "Synthetic recorded allergen",
  reaction: null,
  category: "unknown",
  clinical_status: "active",
  verification_status: "unconfirmed",
  criticality: "unable_to_assess",
  severity: "unknown",
  onset_at: null,
};

// Controlled hooks inspect actual component handlers and props, not DOM or effects.
function nodes(node: ReactNode): Props[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  if (
    typeof node.type === "function" &&
    ["RecordFields", "SelectField"].includes(node.type.name)
  ) {
    return nodes((node.type as (props: Props) => ReactNode)(node.props));
  }
  return [node.props, ...nodes(node.props.children)];
}
function render() {
  harness.cursor = 0;
  return nodes(
    PatientClinicalHistory({
      patientId,
      encounterId,
      onChanged: harness.changed,
    }),
  );
}
function button(label: string, props = render()) {
  const found = props.find((item) => item.onClick && item.children === label);
  expect(found).toBeDefined();
  return found!;
}
function dialog(mode: Mode) {
  return render().filter((props) => props.open !== undefined)[
    mode === "review POST" ? 1 : 0
  ];
}
function field(mode: Mode, label: string) {
  const found = nodes(dialog(mode).children).find(
    (props) => props.label === label,
  );
  expect(found).toBeDefined();
  return found!;
}
function fieldset(mode: Mode) {
  return nodes(dialog(mode).children).find(
    (props) => props.component === "fieldset",
  )!;
}
function draftField(mode: Mode) {
  return field(mode, mode === "review POST" ? "Review notes" : "Reaction");
}
function primary(mode: Mode) {
  const labels =
    mode === "review POST"
      ? ["Record review", "Recording.", "Retry", "Retry same review"]
      : ["Save", "Saving.", "Retry", "Retry same save"];
  return nodes(dialog(mode).children).find(
    (props) => props.onClick && labels.includes(String(props.children)),
  )!;
}
function begin(mode: Mode, text = originalText) {
  button(
    mode === "review POST"
      ? "Review list"
      : mode === "record PATCH"
        ? "Edit"
        : "Add",
  ).onClick!();
  if (mode === "review POST") {
    field(mode, "Review outcome").onChange!({
      target: { value: "follow_up_needed" },
    });
    field(mode, "Information source").onChange!({
      target: { value: "patient" },
    });
  } else {
    field(mode, "Allergen").onChange!({
      target: { value: " Synthetic allergen " },
    });
  }
  draftField(mode).onChange!({ target: { value: text } });
}
function acknowledgement(mode: Mode) {
  return {
    patient_id: patientId,
    encounter_id: encounterId,
    ...(mode === "review POST"
      ? {}
      : {
          record: { ...record, id: mode === "record PATCH" ? recordId : 94 },
        }),
  };
}
function deferred() {
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}
function payload(call: unknown[], mode: Mode) {
  const options = call[1] as {
    body: {
      clinical_history?: Record<string, unknown>;
      review?: Record<string, unknown>;
    };
  };
  return (
    mode === "review POST" ? options.body.review : options.body.clinical_history
  )!;
}

beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.api.mockReset();
  harness.refresh.mockReset();
  harness.changed.mockReset();
  harness.data = {
    schema_version: "patient-clinical-history-v1",
    patient_id: patientId,
    encounter_id: encounterId,
    can_write: true,
    allergies: [record],
    medications: [],
    conditions: [],
    reviews: {},
  } satisfies ClinicalHistoryResponse;
});

describe("clinical history request recovery with controlled component hooks", () => {
  it.each(modes)(
    "%s keeps the submitted request across in-flight edits, unknown outcome, and later rejection",
    async (mode) => {
      const pending = deferred();
      harness.api
        .mockReturnValueOnce(pending.promise)
        .mockRejectedValueOnce(new ApiError(403, "Synthetic retry denied"))
        .mockResolvedValue(acknowledgement(mode));
      begin(mode);
      const staleEdit = draftField(mode).onChange!;
      const staleSave = primary(mode).onClick!;
      const staleOpenEditor = button("Add").onClick!;
      const staleOpenReview = button("Review list").onClick!;
      const first = staleSave();
      const submitted = structuredClone(harness.api.mock.calls[0]);
      expect(submitted[0]).toBe(
        `/api/clinic/patients/${patientId}/clinical_history/${
          mode === "review POST"
            ? "reviews"
            : `allergies${mode === "record PATCH" ? `/${recordId}` : ""}`
        }`,
      );
      expect(submitted[1].method).toBe(
        mode === "record PATCH" ? "PATCH" : "POST",
      );
      expect(payload(submitted, mode)).toMatchObject({
        encounter_id: encounterId,
        request_key: expect.any(String),
      });
      expect(
        payload(submitted, mode)[mode === "review POST" ? "notes" : "reaction"],
      ).toBe(originalText);
      if (mode === "record PATCH")
        expect(payload(submitted, mode).lock_version).toBe(7);
      staleEdit({ target: { value: correctedText } });
      staleOpenEditor();
      staleOpenReview();
      await staleSave();
      expect(harness.api).toHaveBeenCalledTimes(1);
      expect(draftField(mode).value).toBe(originalText);
      expect(fieldset(mode).disabled).toBe(true);
      pending.reject(new TypeError("Synthetic lost response"));
      await first;
      expect(primary(mode).children).toBe(
        mode === "review POST" ? "Retry same review" : "Retry same save",
      );
      expect(harness.refresh).not.toHaveBeenCalled();
      for (let retry = 0; retry < 2; retry++) {
        staleEdit({ target: { value: correctedText } });
        staleOpenEditor();
        staleOpenReview();
        expect(draftField(mode).value).toBe(originalText);
        expect(fieldset(mode).disabled).toBe(true);
        await primary(mode).onClick!();
        expect(harness.api.mock.calls[retry + 1]).toEqual(submitted);
        if (retry === 0) {
          expect(dialog(mode).open).toBe(true);
          expect(fieldset(mode).disabled).toBe(true);
          expect(primary(mode).children).toBe(
            mode === "review POST" ? "Retry same review" : "Retry same save",
          );
          expect(harness.refresh).not.toHaveBeenCalled();
        }
      }
      expect(dialog(mode).open).toBe(false);
      expect(harness.refresh).toHaveBeenCalledTimes(1);
      expect(harness.changed).toHaveBeenCalledTimes(1);
      begin(mode, correctedText);
      await primary(mode).onClick!();
      expect(payload(harness.api.mock.calls[3], mode).request_key).not.toBe(
        payload(submitted, mode).request_key,
      );
      expect(
        payload(harness.api.mock.calls[3], mode)[
          mode === "review POST" ? "notes" : "reaction"
        ],
      ).toBe(correctedText);
    },
  );

  it.each(modes)(
    "%s allows an explicitly corrected new request after a first definite rejection",
    async (mode) => {
      harness.api
        .mockRejectedValueOnce(
          new ApiError(422, "Synthetic validation rejected"),
        )
        .mockResolvedValueOnce(acknowledgement(mode));
      begin(mode);
      await primary(mode).onClick!();
      const submitted = structuredClone(harness.api.mock.calls[0]);
      expect(dialog(mode).open).toBe(true);
      expect(fieldset(mode).disabled).toBe(false);
      expect(draftField(mode).value).toBe(originalText);
      draftField(mode).onChange!({ target: { value: correctedText } });
      expect(harness.api).toHaveBeenCalledTimes(1);
      await primary(mode).onClick!();
      const corrected = harness.api.mock.calls[1];
      expect(corrected[0]).toBe(submitted[0]);
      expect(corrected[1].method).toBe(submitted[1].method);
      expect(payload(corrected, mode).request_key).not.toBe(
        payload(submitted, mode).request_key,
      );
      expect(
        payload(corrected, mode)[mode === "review POST" ? "notes" : "reaction"],
      ).toBe(correctedText);
      if (mode === "record PATCH")
        expect(payload(corrected, mode).lock_version).toBe(7);
      expect(dialog(mode).open).toBe(false);
    },
  );

  it.each(
    modes.flatMap((mode) =>
      ["patient_id", "encounter_id"].map((scope) => ({ mode, scope })),
    ),
  )(
    "$mode never announces success for a mismatched $scope",
    async ({ mode, scope }) => {
      harness.api
        .mockResolvedValueOnce({ ...acknowledgement(mode), [scope]: 999 })
        .mockResolvedValueOnce(acknowledgement(mode));
      begin(mode);
      await primary(mode).onClick!();
      const submitted = structuredClone(harness.api.mock.calls[0]);
      expect(dialog(mode).open).toBe(true);
      expect(fieldset(mode).disabled).toBe(true);
      expect(harness.refresh).not.toHaveBeenCalled();
      expect(harness.changed).not.toHaveBeenCalled();
      expect(render().some((props) => props.severity === "success")).toBe(
        false,
      );
      await primary(mode).onClick!();
      expect(harness.api.mock.calls[1]).toEqual(submitted);
      expect(dialog(mode).open).toBe(false);
    },
  );
});

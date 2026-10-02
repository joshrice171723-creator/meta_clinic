import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { unresolvedIntakeQuestions } from "../src/features/clinic/IntakeActionFeedback";
import {
  IntakeQuestions,
  type IntakeAnswers,
  type IntakeField,
} from "../src/features/patientPortal/IntakeQuestions";

function unresolved(
  fields: IntakeField[],
  answers: IntakeAnswers = {},
  extra = {},
) {
  return unresolvedIntakeQuestions({
    fields,
    chunks: [{ index: 0, fields: fields.map((field) => field.id) }],
    confirmedChunks: [0],
    answers,
    measuredFields: [],
    video: false,
    ...extra,
  }).map((question) => question.id);
}

describe("server-rejected intake question guidance", () => {
  it("identifies unresolved questions across all requested confirmed groups", () => {
    expect(
      unresolvedIntakeQuestions({
        fields: [
          { id: "first", label: "First" },
          { id: "active", label: "Active" },
          { id: "later", label: "Later" },
        ],
        chunks: [
          { index: 0, fields: ["first"] },
          { index: 1, fields: ["active"] },
          { index: 2, fields: ["later"] },
        ],
        confirmedChunks: [0, 1],
        answers: {},
        measuredFields: [],
        video: false,
      }),
    ).toEqual([
      { id: "first", label: "First", chunkIndex: 0 },
      { id: "active", label: "Active", chunkIndex: 1 },
    ]);
  });

  it("keeps explicit resolution states resolved even when their values are empty", () => {
    const states = [
      "unknown",
      "declined",
      "not_asked",
      "not_applicable",
      "negative",
    ];
    expect(
      unresolved(
        states.map((id) => ({ id, label: id })),
        Object.fromEntries(
          states.map((state) => [state, { state, value: "" }]),
        ),
      ),
    ).toEqual([]);
  });

  it("recognizes missing, blank legacy and normalized blank scalar answers", () => {
    expect(
      unresolved(
        ["missing", "legacy", "scalar", "complete"].map((id) => ({
          id,
          label: id,
        })),
        {
          legacy: "  ",
          scalar: { state: "answered", value: "  " },
          complete: { state: "answered", value: "Synthetic answer" },
        },
      ),
    ).toEqual(["missing", "legacy", "scalar"]);
  });

  it("recognizes empty multiselects without treating populated records as blank scalars", () => {
    expect(
      unresolved(
        [
          { id: "empty", label: "Empty", input_type: "multiselect" },
          { id: "selected", label: "Selected", input_type: "multiselect" },
          {
            id: "record",
            label: "Record",
            record_fields: [{ id: "name", label: "Name" }],
          },
          { id: "history", label: "History", history_kind: "condition" },
        ],
        {
          empty: { state: "answered", value: "", values: [] },
          selected: { state: "answered", value: "", values: ["synthetic"] },
          record: {
            state: "answered",
            value: "",
            entries: [{ name: "Synthetic record" }],
          },
          history: {
            state: "answered",
            value: "",
            entries: [{ name: "Synthetic history" }],
          },
        },
      ),
    ).toEqual(["empty"]);
  });

  it("does not invent the separate record validation error", () => {
    expect(
      unresolved([{ id: "record", label: "Record", record_fields: [] }], {
        record: { state: "answered", value: "", entries: [] },
      }),
    ).toEqual([]);
  });

  it("excludes hidden conditional and extended/clinician fields", () => {
    const fields: IntakeField[] = [
      { id: "parent", label: "Parent", choices: ["yes", "no"] },
      {
        id: "hidden",
        label: "Hidden",
        depends_on: "parent",
        depends_values: ["yes"],
      },
      { id: "extended", label: "Extended", requiredness: "extended" },
      { id: "clinician", label: "Clinician", requiredness: "clinician" },
    ];
    expect(unresolved(fields, { parent: "no" })).toEqual([]);
    expect(unresolved(fields, { parent: "yes" })).toEqual(["hidden"]);
  });

  it("excludes only measurements linked in the submitted request and nonvideo locations", () => {
    const fields = [
      "height",
      "weight",
      "telehealth_location",
      "telehealth_physical_location",
    ].map((id) => ({ id, label: id }));
    expect(unresolved(fields, {}, { measuredFields: ["height"] })).toEqual([
      "weight",
    ]);
    expect(
      unresolved(
        fields,
        {},
        { measuredFields: ["height", "weight"], video: true },
      ),
    ).toEqual(["telehealth_location", "telehealth_physical_location"]);
  });
});

describe("optional question-level feedback", () => {
  it("associates persistent helper text with a focusable question while preserving the entered draft", () => {
    const html = renderToStaticMarkup(
      <IntakeQuestions
        fields={[{ id: "care_needs", label: "Care needs" }]}
        answers={{ care_needs: "Synthetic retained draft" }}
        disabled={false}
        onChange={() => {}}
        questionErrors={{
          care_needs: "Resolve this question before confirming.",
        }}
      />,
    );
    expect(html).toContain('data-intake-question="care_needs"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toMatch(/aria-describedby="[^"]+-care_needs-error"/);
    expect(html).toContain("Resolve this question before confirming.");
    expect(html).toContain("Synthetic retained draft");
  });

  it("does not disclose sensitive answers or mount their controls when an error is shown", () => {
    const html = renderToStaticMarkup(
      <IntakeQuestions
        fields={[
          { id: "sensitive", label: "Sensitive support", sensitive: true },
        ]}
        answers={{ sensitive: "Synthetic hidden answer" }}
        disabled={false}
        onChange={() => {}}
        questionErrors={{
          sensitive: "Resolve this question before confirming.",
        }}
      />,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Resolve this question before confirming.");
    expect(html).not.toContain("Synthetic hidden answer");
    expect(html).not.toContain("<textarea");
  });
});

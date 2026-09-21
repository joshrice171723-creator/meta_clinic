import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffIntakeSections } from "../src/features/clinic/StaffIntakeSections";
import type { IntakeField } from "../src/features/patientPortal/IntakeQuestions";

describe("staff intake section layout", () => {
  it("groups related questions once and preserves new server questions", () => {
    const html = renderToStaticMarkup(
      <StaffIntakeSections
        sectionId="today_visit"
        fields={[
          { id: "visit_reason", label: "Visit reason" },
          { id: "goals", label: "Visit goals" },
          { id: "symptoms", label: "Symptoms" },
          { id: "new_server_question", label: "New question" },
        ]}
        answers={{}}
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Visit reason &amp; goals"');
    expect(html).toContain('aria-label="Symptoms &amp; changes"');
    expect(html).toContain('aria-label="Additional details"');
    for (const label of [
      "Visit reason",
      "Visit goals",
      "Symptoms",
      "New question",
    ]) {
      expect(html.split(`aria-label="${label} question"`)).toHaveLength(2);
    }
    expect(html).not.toContain(">Response<");
  });

  it("keeps dependencies visible across presentation sections", () => {
    const fields: IntakeField[] = [
      { id: "goals", label: "Goals", choices: ["other"] },
      {
        id: "symptoms",
        label: "Conditional details",
        depends_on: "goals",
        depends_values: ["other"],
      },
    ];
    const render = (value: string) =>
      renderToStaticMarkup(
        <StaffIntakeSections
          sectionId="today_visit"
          fields={fields}
          definitions={fields}
          answers={{ goals: { state: "answered", value } }}
          disabled={false}
          onChange={() => {}}
        />,
      );
    expect(render("other")).toContain(
      'aria-label="Conditional details question"',
    );
    expect(render("none")).not.toContain(
      'aria-label="Conditional details question"',
    );
  });

  it("preserves disabled controls and sensitive-question privacy", () => {
    const html = renderToStaticMarkup(
      <StaffIntakeSections
        sectionId="unrecognized_group"
        fields={[
          { id: "public_field", label: "Public field" },
          { id: "private_field", label: "Sensitive support", sensitive: true },
        ]}
        answers={{
          private_field: { state: "answered", value: "PRIVATE_TEST_VALUE" },
        }}
        disabled
        onChange={() => {}}
      />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("Open sensitive questions when you have privacy");
    expect(html).not.toContain("PRIVATE_TEST_VALUE");
  });
});

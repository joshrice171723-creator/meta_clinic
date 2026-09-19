import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  IntakeQuestions,
  answerState,
} from "../src/features/patientPortal/IntakeQuestions";
import {
  appendPrevisitNote,
  previsitNoteBlock,
} from "../src/features/clinic/PrevisitNoteImport";
import {
  hasUnsavedPrevisitDraft,
  isCurrentPrevisitLoad,
} from "../src/features/patientPortal/PatientPrevisitNote";

describe("PatientPrevisitNote load scope", () => {
  it("rejects an older response after the editor starts a newer load", () => {
    expect(isCurrentPrevisitLoad(42, 2, 42, 1)).toBe(false);
    expect(isCurrentPrevisitLoad(42, 2, 42, 2)).toBe(true);
  });

  it("rejects a response for another appointment", () => {
    expect(isCurrentPrevisitLoad(43, 1, 42, 1)).toBe(false);
  });
});

describe("typed patient journey intake", () => {
  it("avoids duplicated status labels and explains the not-asked state", () => {
    const html = renderToStaticMarkup(
      <IntakeQuestions
        fields={[
          { id: "support_status", label: "Support status", reusable: false },
        ]}
        answers={{}}
        disabled={false}
        answerStates={["unanswered", "not_asked", "unknown"]}
        onChange={() => {}}
      />,
    );
    expect(html).not.toContain("Support status status");
    expect(html).toContain(
      "Use Not asked when the question was not discussed.",
    );
  });

  it("never collapses explicit missing and negative answers into an empty legacy answer", () => {
    expect(answerState("")).toBe("unanswered");
    expect(answerState("No reported changes")).toBe("answered");
    const states = [
      "unanswered",
      "unknown",
      "declined",
      "not_applicable",
      "negative",
    ];
    for (const state of states) {
      expect(answerState({ state, value: "" })).toBe(state);
    }
    const original = { state: "unknown", value: "" };
    const baseline = JSON.stringify([
      "",
      [["allergies", JSON.stringify(original)]],
    ]);
    expect(hasUnsavedPrevisitDraft("", { allergies: original }, baseline)).toBe(
      false,
    );
    expect(
      hasUnsavedPrevisitDraft(
        "",
        { allergies: { state: "negative", value: "" } },
        baseline,
      ),
    ).toBe(true);
  });

  it("measurement provenance changes make the protected draft dirty", () => {
    const weight = {
      state: "answered",
      value: "83.5",
      unit: "kg",
      measured_at: "2026-09-01",
      source: "patient_reported",
    };
    const baseline = JSON.stringify(["", [["weight", JSON.stringify(weight)]]]);
    expect(hasUnsavedPrevisitDraft("", { weight }, baseline)).toBe(false);
    for (const change of [
      { unit: "[lb_av]" },
      { measured_at: "2026-09-02" },
      { source: "clinic_measured" },
    ]) {
      expect(
        hasUnsavedPrevisitDraft(
          "",
          { weight: { ...weight, ...change } },
          baseline,
        ),
      ).toBe(true);
    }
  });

  it("renders repeatable patient entries and explicit measurement provenance controls", () => {
    const html = renderToStaticMarkup(
      <IntakeQuestions
        fields={[
          {
            id: "medications",
            label: "Medicines and supplements",
            reusable: true,
          },
          {
            id: "weight",
            label: "Current weight",
            reusable: false,
            units: ["kg", "[lb_av]"],
          },
        ]}
        answers={{
          medications: {
            state: "answered",
            value: "Synthetic medicine\nSynthetic supplement",
          },
          weight: {
            state: "answered",
            value: "83.5",
            unit: "kg",
            measured_at: "2026-09-01",
            source: "patient_reported",
          },
        }}
        medicationOptions={["Synthetic medicine"]}
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Synthetic medicine");
    expect(html).toContain("Synthetic supplement");
    expect(html).toContain("Add another");
    expect(html).not.toContain("answer status");
    expect(html).toContain("Current weight measured at");
    expect(html).toContain("Current weight source");
    expect(html).toContain('type="date"');
    expect(html).toContain("2026-09-01");
  });

  it("renders structured treatment history with bounded choices and searchable medicines", () => {
    const html = renderToStaticMarkup(
      <IntakeQuestions
        fields={[
          {
            id: "prior_approaches",
            label: "Previous treatments and medicines",
            reusable: true,
            history_kind: "treatment",
          },
        ]}
        answers={{
          prior_approaches: {
            state: "answered",
            value: "",
            entries: [
              {
                kind: "medication",
                name: "Synthetic prior medicine",
                date_precision: "approximate",
                date_value: "2024",
                duration: "three_to_six_months",
                outcome: "some_benefit",
                maintenance: "no",
                stop_reason: "adverse_effect",
                adverse_effects: "reported",
                adverse_effect_details: "Synthetic nausea",
                complication_state: "unknown",
                complication_details: "",
              },
            ],
          },
        }}
        medicationOptions={["Synthetic prior medicine"]}
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("History record 1");
    expect(html).toContain("Synthetic prior medicine");
    expect(html).toContain("Date certainty");
    expect(html).toContain("Reason it ended");
    expect(html).toContain("Add another history record");
    expect(html).not.toContain(
      "Describe every prior treatment in one text box",
    );
  });

  it("renders condition and family-history routing controls with uncertainty", () => {
    const html = renderToStaticMarkup(
      <IntakeQuestions
        fields={[
          {
            id: "history",
            label: "Health conditions and recent changes",
            reusable: true,
            history_kind: "condition",
          },
          {
            id: "family_history",
            label: "Family history and uncertainty",
            reusable: true,
            history_kind: "family",
          },
        ]}
        answers={{
          history: {
            state: "answered",
            value: "",
            entries: [
              {
                kind: "metabolic",
                name: "Synthetic metabolic condition",
                date_precision: "approximate",
                date_value: "2022",
                duration: "unknown",
                outcome: "unknown",
                maintenance: "unknown",
                stop_reason: "unknown",
                adverse_effects: "unknown",
                adverse_effect_details: "",
                complication_state: "unknown",
                complication_details: "",
                current_status: "current",
                review_route: "clinical_review",
                details: "Synthetic condition detail",
              },
            ],
          },
          family_history: {
            state: "answered",
            value: "",
            entries: [
              {
                kind: "parent",
                name: "Synthetic cardiovascular history",
                date_precision: "unknown",
                date_value: "",
                duration: "unknown",
                outcome: "unknown",
                maintenance: "unknown",
                stop_reason: "unknown",
                adverse_effects: "unknown",
                adverse_effect_details: "",
                complication_state: "unknown",
                complication_details: "",
                certainty: "uncertain",
                details: "Synthetic family-history detail",
              },
            ],
          },
        }}
        medicationOptions={[]}
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("each condition");
    expect(html).toContain("Current status");
    expect(html).toContain("Review route");
    expect(html).toContain("each family-history item");
    expect(html).toContain("Family-history certainty");
    expect(html).toContain("Synthetic cardiovascular history");
  });

  it("renders actual-use medication and allergy-versus-intolerance controls", () => {
    const html = renderToStaticMarkup(
      <IntakeQuestions
        fields={[
          {
            id: "medications",
            label: "Current medicines and supplements",
            reusable: true,
            history_kind: "medication",
          },
          {
            id: "allergies",
            label: "Allergies and reactions",
            reusable: true,
            history_kind: "allergy",
          },
        ]}
        answers={{
          medications: {
            state: "answered",
            value: "",
            entries: [
              {
                kind: "prescribed",
                name: "Synthetic current medicine",
                date_precision: "unknown",
                date_value: "",
                duration: "unknown",
                outcome: "unknown",
                maintenance: "unknown",
                stop_reason: "unknown",
                adverse_effects: "unknown",
                adverse_effect_details: "",
                complication_state: "unknown",
                complication_details: "",
                actual_use: "taking",
                dose_value: "5",
                dose_unit: "mg",
                dose_certainty: "known",
                frequency: "once_daily",
                source: "prescription_record",
                details: "Synthetic dose detail",
              },
            ],
          },
          allergies: {
            state: "answered",
            value: "",
            entries: [
              {
                kind: "intolerance",
                name: "Synthetic allergy substance",
                date_precision: "unknown",
                date_value: "",
                duration: "unknown",
                outcome: "unknown",
                maintenance: "unknown",
                stop_reason: "unknown",
                adverse_effects: "unknown",
                adverse_effect_details: "",
                complication_state: "unknown",
                complication_details: "",
                certainty: "uncertain",
                severity: "unknown",
                details: "Synthetic reaction detail",
              },
            ],
          },
        }}
        medicationOptions={["Synthetic current medicine"]}
        disabled={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Actual use");
    expect(html).toContain("Dose certainty");
    expect(html).toContain("Record source");
    expect(html).toContain("Reaction type");
    expect(html).toContain("Reaction severity");
    expect(html).toContain("Synthetic allergy substance");
  });

  it("staff chart imports preserve an unconfirmed draft label and do not duplicate the same version", () => {
    const draft = {
      id: 17,
      version_number: 2,
      text: "Synthetic unconfirmed context",
      status: "draft" as const,
      submitted_at: "2026-09-01T14:00:00Z",
      attestation: null,
    };
    const block = previsitNoteBlock(draft);
    expect(block).toContain("draft saved");
    expect(block).not.toContain(", submitted ");
    const first = appendPrevisitNote("Clinician context", draft);
    expect(first).toContain("Clinician context");
    expect(appendPrevisitNote(first, draft)).toBe(first);
    expect(
      appendPrevisitNote(first, {
        ...draft,
        version_number: 3,
        text: "Corrected synthetic context",
      }),
    ).toContain("Corrected synthetic context");
  });
});

describe("PatientPrevisitNote dirty-close protection", () => {
  const baseline = JSON.stringify(["Saved note", [["allergies", "None"]]]);

  it("detects unsaved note text and intake answer changes", () => {
    expect(
      hasUnsavedPrevisitDraft("Changed note", { allergies: "None" }, baseline),
    ).toBe(true);
    expect(
      hasUnsavedPrevisitDraft(
        "Saved note",
        { allergies: "Penicillin" },
        baseline,
      ),
    ).toBe(true);
  });

  it("does not block closing an unchanged normalized draft", () => {
    expect(
      hasUnsavedPrevisitDraft(
        "  Saved note  ",
        { allergies: " None ", ignored_blank: " " },
        baseline,
      ),
    ).toBe(false);
  });
});

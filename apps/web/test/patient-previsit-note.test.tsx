import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeQuestions, answerState } from "../src/features/patientPortal/IntakeQuestions";
import { appendPrevisitNote, previsitNoteBlock } from "../src/features/clinic/PrevisitNoteImport";
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
  it("never collapses explicit missing and negative answers into an empty legacy answer", () => {
    expect(answerState("")).toBe("unanswered");
    expect(answerState("No reported changes")).toBe("answered");
    const states = ["unanswered", "unknown", "declined", "not_applicable", "negative"];
    for (const state of states) {
      expect(answerState({ state, value: "" })).toBe(state);
    }
    const original = { state: "unknown", value: "" };
    const baseline = JSON.stringify(["", [["allergies", JSON.stringify(original)]]]);
    expect(hasUnsavedPrevisitDraft("", { allergies: original }, baseline)).toBe(false);
    expect(hasUnsavedPrevisitDraft("", { allergies: { state: "negative", value: "" } }, baseline)).toBe(true);
  });

  it("measurement provenance changes make the protected draft dirty", () => {
    const weight = { state: "answered", value: "83.5", unit: "kg", measured_at: "2026-09-01", source: "patient_reported" };
    const baseline = JSON.stringify(["", [["weight", JSON.stringify(weight)]]]);
    expect(hasUnsavedPrevisitDraft("", { weight }, baseline)).toBe(false);
    for (const change of [{ unit: "[lb_av]" }, { measured_at: "2026-09-02" }, { source: "clinic_measured" }]) {
      expect(hasUnsavedPrevisitDraft("", { weight: { ...weight, ...change } }, baseline)).toBe(true);
    }
  });

  it("renders repeatable patient entries and explicit measurement provenance controls", () => {
    const html = renderToStaticMarkup(<IntakeQuestions
      fields={[
        { id: "medications", label: "Medicines and supplements", reusable: true },
        { id: "weight", label: "Current weight", reusable: false, units: ["kg", "[lb_av]"] },
      ]}
      answers={{ medications: { state: "answered", value: "Synthetic medicine\nSynthetic supplement" }, weight: { state: "answered", value: "83.5", unit: "kg", measured_at: "2026-09-01", source: "patient_reported" } }}
      states={["answered", "unanswered", "unknown", "declined", "not_applicable", "negative"]}
      medicationOptions={["Synthetic medicine"]} disabled={false} onChange={() => {}}
    />);
    expect(html).toContain("Synthetic medicine");
    expect(html).toContain("Synthetic supplement");
    expect(html).toContain("Add another");
    expect(html).toContain("Current weight measured at");
    expect(html).toContain("Current weight source");
    expect(html).toContain('type="date"');
    expect(html).toContain("2026-09-01");
  });

  it("staff chart imports preserve an unconfirmed draft label and do not duplicate the same version", () => {
    const draft = { id: 17, version_number: 2, text: "Synthetic unconfirmed context", status: "draft" as const, submitted_at: "2026-09-01T14:00:00Z", attestation: null };
    const block = previsitNoteBlock(draft);
    expect(block).toContain("draft saved");
    expect(block).not.toContain(", submitted ");
    const first = appendPrevisitNote("Clinician context", draft);
    expect(first).toContain("Clinician context");
    expect(appendPrevisitNote(first, draft)).toBe(first);
    expect(appendPrevisitNote(first, { ...draft, version_number: 3, text: "Corrected synthetic context" })).toContain("Corrected synthetic context");
  });
});

describe("PatientPrevisitNote dirty-close protection", () => {
  const baseline = JSON.stringify(["Saved note", [["allergies", "None"]]]);

  it("detects unsaved note text and intake answer changes", () => {
    expect(
      hasUnsavedPrevisitDraft(
        "Changed note",
        { allergies: "None" },
        baseline,
      ),
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

import { describe, expect, it } from "vitest";
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

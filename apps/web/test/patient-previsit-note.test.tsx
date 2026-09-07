import { describe, expect, it } from "vitest";
import { isCurrentPrevisitLoad } from "../src/features/patientPortal/PatientPrevisitNote";

describe("PatientPrevisitNote load scope", () => {
  it("rejects an older response after the editor starts a newer load", () => {
    expect(isCurrentPrevisitLoad(42, 2, 42, 1)).toBe(false);
    expect(isCurrentPrevisitLoad(42, 2, 42, 2)).toBe(true);
  });

  it("rejects a response for another appointment", () => {
    expect(isCurrentPrevisitLoad(43, 1, 42, 1)).toBe(false);
  });
});

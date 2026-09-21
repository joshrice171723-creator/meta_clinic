import { describe, expect, it } from "vitest";
import { workingDraftRecoveryDecision } from "../src/features/clinic/useWorkingDraft";

describe("working draft lost-response recovery", () => {
  const previous = {
    encoded: JSON.stringify({ field: "preserved value" }),
    expected: 4,
  };

  it("accepts a matching committed copy without issuing another save", () => {
    expect(
      workingDraftRecoveryDecision(
        { version: 5, payload: { field: "preserved value" } },
        previous,
      ),
    ).toBe("committed");
  });

  it("retries only when the server still has the original version", () => {
    expect(
      workingDraftRecoveryDecision(
        { version: 4, payload: { field: "earlier value" } },
        previous,
      ),
    ).toBe("retry");
  });

  it("protects a changed working copy from replacement", () => {
    expect(
      workingDraftRecoveryDecision(
        { version: 5, payload: { field: "another window" } },
        previous,
      ),
    ).toBe("conflict");
  });
});

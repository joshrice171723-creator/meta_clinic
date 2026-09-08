import { describe, expect, it } from "vitest";
import { isLatestVitalLoad } from "../src/features/clinic/VitalSignsEntry";

describe("VitalSignsEntry option loading", () => {
  it("accepts only the current definitions request", () => {
    expect(isLatestVitalLoad(2, 1)).toBe(false);
    expect(isLatestVitalLoad(2, 2)).toBe(true);
  });

  it("invalidates a pending request when the dialog resets", () => {
    const pendingRequest = 3;
    const sequenceAfterReset = 4;

    expect(isLatestVitalLoad(sequenceAfterReset, pendingRequest)).toBe(false);
  });
});

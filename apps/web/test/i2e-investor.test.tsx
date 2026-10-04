import { describe, expect, it } from "vitest";
import {
  addedClinicUsage,
  conversionTarget,
  investorBudget,
  investorCosts,
  scribeAllowance,
  scribeCostForNotes,
} from "../src/features/marketing/I2eInvestorPage";
import {
  clinicMarkets,
  janeProfiles,
} from "../src/features/marketing/i2eMarketData";

describe("i2E added-clinic financial model", () => {
  it("separates the central monthly stack from one added clinic's usage", () => {
    expect(investorCosts).toHaveLength(13);
    expect(investorBudget.upfront).toBe(10500);
    expect(investorBudget.monthly).toBe(2960);
    expect(
      investorCosts.find((row) => row.category === "Insurance billing engine")
        ?.monthly,
    ).toBe(1500);
    expect(addedClinicUsage).toEqual({ video: 30, scribe: 30 });
    expect(conversionTarget.vendorCost).toBe(60);
    expect(conversionTarget.price - conversionTarget.vendorCost).toBe(1040);
  });

  it("prices Whisper transcription and Luna note drafting by workload", () => {
    expect(scribeCostForNotes(125)).toBeCloseTo(24.21225, 5);
    expect(scribeCostForNotes(500)).toBeCloseTo(96.849, 5);
    expect(scribeAllowance(125)).toBe(30);
    expect(scribeAllowance(500)).toBe(110);
  });

  it("does not invent a clinic subscription baseline or add-on total", () => {
    expect(conversionTarget.baseline).toBeNull();
    expect(conversionTarget.namedAddons).toBeNull();
  });

  it("covers ten specialties and both Jane payment profiles", () => {
    expect(new Set(clinicMarkets.map((row) => row.name)).size).toBe(10);
    expect(janeProfiles.map((row) => row.name)).toEqual([
      "Jane cash-pay clinic",
      "Jane insurance-billing clinic",
    ]);
  });
});

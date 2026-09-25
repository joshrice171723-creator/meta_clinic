import { describe, expect, it } from "vitest";
import {
  addedClinicUsage,
  conversionTarget,
  investorBudget,
  investorCosts,
} from "../src/features/marketing/I2eInvestorPage";
import {
  clinicMarkets,
  janeProfiles,
} from "../src/features/marketing/i2eMarketData";

describe("i2E added-clinic financial model", () => {
  it("separates the central monthly stack from one added clinic's usage", () => {
    expect(investorCosts).toHaveLength(12);
    expect(investorBudget.upfront).toBe(10500);
    expect(investorBudget.monthly).toBe(3200);
    expect(
      investorCosts.find((row) => row.category === "Insurance billing engine")
        ?.monthly,
    ).toBe(1500);
    expect(addedClinicUsage).toEqual({ video: 30, scribe: 120 });
    expect(conversionTarget.vendorCost).toBe(150);
    expect(conversionTarget.price - conversionTarget.vendorCost).toBe(950);
  });

  it("keeps the conversion comparison tied to its listed subscriptions", () => {
    expect(conversionTarget.baseline).toBe(1334);
    expect(conversionTarget.baseline - conversionTarget.price).toBe(234);
    expect(conversionTarget.namedAddons).toBe(1185);
  });

  it("covers ten specialties and both Jane payment profiles", () => {
    expect(new Set(clinicMarkets.map((row) => row.name)).size).toBe(10);
    expect(janeProfiles.map((row) => row.name)).toEqual([
      "Jane cash-pay clinic",
      "Jane insurance-billing clinic",
    ]);
  });
});

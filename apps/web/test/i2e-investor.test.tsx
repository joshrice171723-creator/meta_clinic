import { describe, expect, it } from "vitest";
import {
  conversionTarget,
  investorBudget,
  investorCosts,
} from "../src/features/marketing/I2eInvestorPage";
import {
  clinicMarkets,
  janeProfiles,
} from "../src/features/marketing/i2eMarketData";

describe("i2E one-clinic financial model", () => {
  it("compares one cash-pay clinic without adding optional insurance", () => {
    expect(investorCosts).toHaveLength(12);
    expect(investorBudget.upfront).toBe(10500);
    expect(investorBudget.monthly).toBe(1350);
    expect(investorBudget.insuranceAddOn).toBe(1500);
    expect(investorBudget.monthly + investorBudget.insuranceAddOn).toBe(2850);
    expect(conversionTarget.vendorCost).toBe(1350);
    expect(conversionTarget.price - conversionTarget.vendorCost).toBe(-250);
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

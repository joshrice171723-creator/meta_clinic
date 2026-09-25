import { describe, expect, it } from "vitest";
import {
  conversionTarget,
  investorBudget,
  investorCosts,
  pilotClinics,
} from "../src/features/marketing/I2eInvestorPage";
import {
  clinicMarkets,
  janeProfiles,
} from "../src/features/marketing/i2eMarketData";

describe("i2E pilot financial model", () => {
  it("allocates the shared vendor budget once across four pilot clinics", () => {
    expect(investorCosts).toHaveLength(12);
    expect(investorBudget.upfront).toBe(10500);
    expect(investorBudget.monthly).toBe(3200);
    expect(pilotClinics).toBe(4);
    expect(conversionTarget.allocatedCost).toBe(800);
    expect(pilotClinics * conversionTarget.price - investorBudget.monthly).toBe(
      1200,
    );
    expect(conversionTarget.price - conversionTarget.allocatedCost).toBe(300);
    expect(conversionTarget.price - investorBudget.monthly).toBe(-2100);
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

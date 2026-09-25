import { describe, expect, it } from "vitest";
import {
  clinicEconomics,
  incrementalCosts,
  stackCosts,
  investorBudget,
  investorCosts,
} from "../src/features/marketing/I2eInvestorPage";

describe("i2E financial model", () => {
  it("reconciles the cost rows with the revised six-month plan", () => {
    expect(investorCosts).toHaveLength(12);
    expect(investorBudget.upfront).toBe(10500);
    expect(investorBudget.monthly).toBe(3200);
    const operatingCapital = investorBudget.capital - investorBudget.upfront;
    expect(operatingCapital).toBe(19500);
    expect(Math.floor(operatingCapital / investorBudget.monthly)).toBe(6);
    expect(investorBudget.monthly * 7).toBeGreaterThan(operatingCapital);
  });
  it("requires order volume as well as clinic count to cover fixed costs", () => {
    const spread = investorBudget.retail - investorBudget.wholesale;
    expect(spread).toBe(75);
    expect(Math.ceil(investorBudget.monthly / spread)).toBe(43);
    expect(3 * 15 * spread).toBeGreaterThanOrEqual(investorBudget.monthly);
    expect(3 * 14 * spread).toBeLessThan(investorBudget.monthly);
    expect(4 * 11 * spread).toBeGreaterThanOrEqual(investorBudget.monthly);
    expect(4 * 10 * spread).toBeLessThan(investorBudget.monthly);
  });
});

describe("independent clinic costs", () => {
  it("adds marginal costs only after the first clinic", () => {
    expect(incrementalCosts.reduce((sum, row) => sum + row.monthly, 0)).toBe(
      500,
    );
    expect(clinicEconomics(1).monthly).toBe(3200);
    expect(clinicEconomics(3).monthly).toBe(4200);
    expect(clinicEconomics(4).monthly).toBe(4700);
    expect(clinicEconomics(10).monthly).toBe(7700);
  });
  it("includes network costs in order targets and offsets subscription receipts once", () => {
    expect(clinicEconomics(3).orders).toBe(56);
    expect(clinicEconomics(4).orders).toBe(63);
    expect(clinicEconomics(10).orders).toBe(103);
    expect(clinicEconomics(3, 1200).remainingOrders).toBe(8);
    expect(clinicEconomics(4, 1200).contribution).toBe(100);
    expect(clinicEconomics(4, 1200, 100).remainingOrders).toBe(4);
    expect(clinicEconomics(4, 1200, 100).monthly).toBe(5100);
    expect(clinicEconomics(10, 1200).remainingOrders).toBe(0);
  });
  it("keeps the comparison software-only and reconciles supplied rows", () => {
    expect(stackCosts).toHaveLength(5);
    expect(stackCosts.reduce((sum, row) => sum + row.cost, 0)).toBe(1354);
  });
});

import {
  clinicMarkets,
  janeProfiles,
} from "../src/features/marketing/i2eMarketData";
import { switchingEconomics } from "../src/features/marketing/I2eMarketComparison";

describe("clinic switching comparisons", () => {
  it("covers ten specialties and both Jane payment profiles", () => {
    expect(new Set(clinicMarkets.map((row) => row.name)).size).toBe(10);
    expect(
      clinicMarkets.filter((row) => row.payment === "Insurance-enabled"),
    ).toHaveLength(5);
    clinicMarkets.forEach((row) => {
      expect(row.prices).toHaveLength(5);
      expect(row.implementation).toHaveLength(5);
    });
    expect(janeProfiles.map((row) => row.name)).toEqual([
      "Jane cash-pay clinic",
      "Jane insurance-billing clinic",
    ]);
  });
  it("shows savings and contribution without labor or pharmacy revenue", () => {
    const result = switchingEconomics(1354, 20, 10, 0);
    expect(result.offer).toBeCloseTo(1083.2);
    expect(result.cost).toBe(clinicEconomics(10).average);
    expect(result.saving).toBeCloseTo(270.8);
    expect(result.annualSaving).toBeCloseTo(3249.6);
    expect(result.contribution).toBeCloseTo(313.2);
    expect(result.minimumCurrent).toBeCloseTo(962.5);
  });
  it("rejects the economics of undercutting a low software bill", () => {
    expect(switchingEconomics(149, 20, 10, 0).contribution).toBeCloseTo(-650.8);
    expect(switchingEconomics(0, 20, 10, 0).contribution).toBe(-770);
  });
  it("includes extra expenses and the higher cost of a smaller network", () => {
    expect(switchingEconomics(1354, 20, 4, 100).cost).toBe(1275);
    expect(switchingEconomics(1354, 20, 4, 100).contribution).toBeLessThan(0);
  });
});

import { incrementalForServices } from "../src/features/marketing/I2eInvestorPage";
it("prices each optional service once and propagates the bundle to both models", () => {
  for (const [insurance, erx, expected] of [
    [false, false, 245],
    [true, false, 305],
    [false, true, 440],
    [true, true, 500],
  ] as const) {
    const incremental = incrementalForServices(insurance, erx);
    expect(incremental).toBe(expected);
    expect(clinicEconomics(1, 0, 0, incremental).monthly).toBe(3200);
    expect(clinicEconomics(10, 0, 0, incremental).monthly).toBe(
      3200 + 9 * expected,
    );
    expect(switchingEconomics(1354, 20, 10, 0, incremental).cost).toBe(
      clinicEconomics(10, 0, 0, incremental).average,
    );
  }
});

import { conversionTarget } from "../src/features/marketing/I2eInvestorPage";
it("reconciles the fixed conversion offer and ten-owner ledger", () => {
  const t = conversionTarget;
  expect(t.baseline - t.price).toBe(234);
  expect(((t.baseline - t.price) / t.baseline) * 100).toBeCloseTo(17.541, 2);
  expect(t.price - t.variable).toBe(600);
  expect(((t.price - t.variable) / t.price) * 100).toBeCloseTo(54.545, 2);
  expect(t.namedAddons).toBe(1185);
  expect(t.baseline).toBe(149 + t.namedAddons);
  expect(t.orders * (investorBudget.retail - investorBudget.wholesale)).toBe(
    2250,
  );
  expect(clinicEconomics(10, t.price).contribution).toBe(3300);
});

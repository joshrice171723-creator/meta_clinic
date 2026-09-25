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
    expect(investorCosts).toHaveLength(10);
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

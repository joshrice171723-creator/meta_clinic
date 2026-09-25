import { describe, expect, it } from "vitest";
import {
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

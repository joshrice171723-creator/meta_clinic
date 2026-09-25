import { describe, expect, it } from "vitest";
import {
  investorBudget,
  investorCosts,
} from "../src/features/marketing/I2eInvestorPage";

describe("i2E financial model", () => {
  it("reconciles the cost rows with the seven-month plan", () => {
    expect(investorCosts).toHaveLength(8);
    expect(investorBudget.upfront).toBe(10500);
    expect(investorBudget.monthly).toBe(2700);
    const operatingCapital = investorBudget.capital - investorBudget.upfront;
    expect(operatingCapital).toBe(19500);
    expect(Math.floor(operatingCapital / investorBudget.monthly)).toBe(7);
    expect(investorBudget.monthly * 8).toBeGreaterThan(operatingCapital);
  });
  it("requires order volume as well as clinic count to cover fixed costs", () => {
    const spread = investorBudget.retail - investorBudget.wholesale;
    expect(spread).toBe(75);
    expect(3 * 12 * spread).toBe(investorBudget.monthly);
    expect(4 * 9 * spread).toBe(investorBudget.monthly);
    expect(4 * 8 * spread).toBeLessThan(investorBudget.monthly);
  });
});

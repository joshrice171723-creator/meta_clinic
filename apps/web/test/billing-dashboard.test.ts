import { describe, expect, it } from "vitest";
import type { BillingInvoiceSummary } from "../src/api/contracts";
import {
  filteredInvoices,
  invoicePaymentState,
} from "../src/features/clinic/BillingDashboard";

const invoices: BillingInvoiceSummary[] = [
  {
    id: 1,
    status: "draft",
    currency: "USD",
    total: "90.00",
    allocated: "0.00",
    balance: "90.00",
    created_at: "2026-09-02T12:00:00Z",
  },
  {
    id: 2,
    status: "posted",
    currency: "USD",
    total: "100.00",
    allocated: "100.00",
    balance: "0.00",
    created_at: "2026-09-02T12:00:00Z",
  },
  {
    id: 3,
    status: "posted",
    currency: "USD",
    total: "100.00",
    allocated: "40.00",
    balance: "60.00",
    created_at: "2026-09-02T12:00:00Z",
  },
  {
    id: 4,
    status: "posted",
    currency: "USD",
    total: "100.00",
    allocated: "0.00",
    balance: "100.00",
    created_at: "2026-09-02T12:00:00Z",
  },
  {
    id: 5,
    status: "void",
    currency: "USD",
    total: "100.00",
    allocated: "0.00",
    balance: "0.00",
    created_at: "2026-09-02T12:00:00Z",
  },
];

describe("billing invoice presentation", () => {
  it("derives display states from ledger amounts without inventing payment data", () => {
    expect(invoices.map(invoicePaymentState)).toEqual([
      "draft",
      "paid",
      "partial",
      "open",
      "void",
    ]);
  });

  it("filters the existing ledger rather than creating local invoice records", () => {
    expect(filteredInvoices(invoices, "draft").map(({ id }) => id)).toEqual([
      1,
    ]);
    expect(filteredInvoices(invoices, "open").map(({ id }) => id)).toEqual([
      3, 4,
    ]);
    expect(filteredInvoices(invoices, "all")).toBe(invoices);
  });
});

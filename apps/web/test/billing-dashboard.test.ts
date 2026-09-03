import { describe, expect, it } from "vitest";
import type { BillingInvoiceSummary } from "../src/api/contracts";
import {
  filteredInvoices,
  invoicePaymentState,
  periodLabel,
  totalOpenInvoiceCount,
  sortedInvoices,
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

  it("keeps date-only reporting periods in their recorded calendar month", () => {
    expect(periodLabel("2026-09-01", "America/Chicago")).toBe("September 2026");
  });

  it("counts the same cross-currency open invoices shown by the queue", () => {
    expect(
      totalOpenInvoiceCount([
        { open_invoice_count: 2 },
        { open_invoice_count: 3 },
      ]),
    ).toBe(5);
  });

  it("supports paid and void review filters", () => {
    expect(filteredInvoices(invoices, "paid").map(({ id }) => id)).toEqual([2]);
    expect(filteredInvoices(invoices, "void").map(({ id }) => id)).toEqual([5]);
  });

  it("sorts decimal ledger values without floating-point coercion", () => {
    const values = [
      {
        ...invoices[0],
        id: 6,
        total: "100000000000000000.01",
        balance: "100000000000000000.01",
      },
      {
        ...invoices[0],
        id: 7,
        total: "100000000000000000.00",
        balance: "100000000000000000.00",
      },
      { ...invoices[0], id: 8, total: "9.99", balance: "9.99" },
    ];
    expect(sortedInvoices(values, "total_desc").map(({ id }) => id)).toEqual([
      6, 7, 8,
    ]);
    expect(sortedInvoices(values, "balance_desc").map(({ id }) => id)).toEqual([
      6, 7, 8,
    ]);
  });
});

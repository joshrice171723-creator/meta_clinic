import { describe, expect, it } from "vitest";
import {
  externalPaymentAmounts,
  externalPaymentMoney,
  externalPaymentResponse,
  type ExternalPaymentAttempt,
} from "../src/features/clinic/billing/externalPayment";

describe("received payment and invoice allocation remain distinct", () => {
  it.each([
    ["25.00", "25.00", null, "25", "0"],
    ["10.125", "25.00", null, "10.125", "0"],
    ["30.00", "25.00", null, "25", "5"],
    ["30.00", "25.00", "10.125", "10.125", "19.875"],
    [
      "9007199254740993.123456",
      "9007199254740993.123456",
      null,
      "9007199254740993.123456",
      "0",
    ],
  ])(
    "receives %s against %s with override %s",
    (received, balance, override, allocation, remainder) => {
      expect(externalPaymentAmounts(received!, balance!, override)).toEqual({
        error: "",
        allocation,
        notAppliedHere: remainder,
      });
    },
  );

  it.each(["", "0", "-1", "1e2", "01", "1.1234567"])(
    "rejects received amount %s",
    (received) => {
      expect(externalPaymentAmounts(received, "25", null).error).not.toBe("");
    },
  );

  it("rejects allocation beyond received money or outstanding balance", () => {
    expect(externalPaymentAmounts("10", "25", "11").error).not.toBe("");
    expect(externalPaymentAmounts("30", "25", "26").error).not.toBe("");
    expect(externalPaymentAmounts("25", "0", null).error).not.toBe("");
  });

  it("keeps all supported decimals visible in the final summary", () => {
    expect(externalPaymentMoney("10.125001", "USD")).toBe("USD 10.125001");
  });
});

const attempt: ExternalPaymentAttempt = {
  invoiceId: 41,
  patientId: 42,
  currency: "USD",
  reference: "synthetic-event-1",
  received: "30.00",
  allocation: "25.00",
};
const response = {
  payment_allocation: {
    id: 43,
    invoice_id: 41,
    patient_id: 42,
    payment_event_id: 44,
    amount: "25",
    payment_event: { id: 44, amount: "30", unapplied_amount: "5" },
  },
};

describe("authoritative payment acknowledgment", () => {
  it("accepts only the exact invoice, patient and amounts", () => {
    expect(externalPaymentResponse(response, attempt)).toEqual({
      unapplied: "5",
    });
  });
  it.each(["invoice_id", "patient_id", "amount", "payment_event_id"])(
    "rejects mismatched %s",
    (field) => {
      const changed = structuredClone(response);
      Object.assign(changed.payment_allocation, {
        [field]: field === "amount" ? "24" : 999,
      });
      expect(externalPaymentResponse(changed, attempt)).toBeNull();
    },
  );
  it("rejects missing or invalid payment evidence", () => {
    expect(externalPaymentResponse({}, attempt)).toBeNull();
    const changed = structuredClone(response);
    changed.payment_allocation.payment_event.amount = "29";
    expect(externalPaymentResponse(changed, attempt)).toBeNull();
  });
});

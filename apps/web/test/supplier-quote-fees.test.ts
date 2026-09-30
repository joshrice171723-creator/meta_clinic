import { describe, expect, it } from "vitest";
import { quoteFeeEvidenceLabel } from "../src/features/inventory/quoteFeeEvidence";

describe("supplier-stated quoted fee evidence", () => {
  it("keeps absent and incomplete historic evidence unknown", () => {
    expect(quoteFeeEvidenceLabel({})).toBe("Quoted fees unknown");
    expect(quoteFeeEvidenceLabel({ quoted_fee_amount: null })).toBe(
      "Quoted fees unknown",
    );
    expect(quoteFeeEvidenceLabel({ quoted_fee_amount: "0" })).toBe(
      "Quoted fees unknown",
    );
  });
  it("distinguishes explicit zero from unknown without calculating totals", () => {
    expect(
      quoteFeeEvidenceLabel({
        quoted_fee_amount: "0.0",
        quoted_fee_currency: "USD",
        quoted_fee_basis: "No fee for this quoted shipment",
      }),
    ).toBe(
      "Quoted fee: USD 0.0 · No fee for this quoted shipment · not included in merchandise totals",
    );
  });
  it("preserves the exact quoted amount, currency and supplier basis", () => {
    expect(
      quoteFeeEvidenceLabel({
        quoted_fee_amount: "1.230001",
        quoted_fee_currency: "CAD",
        quoted_fee_basis: "For all four quoted packages",
      }),
    ).toBe(
      "Quoted fee: CAD 1.230001 · For all four quoted packages · not included in merchandise totals",
    );
  });
});

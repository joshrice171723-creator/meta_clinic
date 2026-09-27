import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import {
  CashPayEstimateSnapshot,
  estimateDeliveryLabel,
  estimateFailure,
  type CashPayEstimate,
} from "../src/features/clinic/CashPayEstimates";

const issued: CashPayEstimate = {
  id: 10,
  patient_id: 3,
  practice_name: "Synthetic clinic",
  clinic_contact_snapshot: {},
  total_amount: "75.0",
  classification: "issued_gfe",
  status: "superseded",
  currency: "USD",
  policy_version: "synthetic-policy-v1",
  delivery_method: "portal",
  issued_at: "2026-09-22T12:00:00Z",
  delivered_at: null,
  supersedes_id: null,
  correction_reason: null,
  revision: 1,
  lines: [
    {
      id: 1,
      billing_service_id: 2,
      service_offering_id: 17,
      quantity: "1.0",
      unit_amount: "75.0",
      expected_amount: "75.0",
      description: "Office visit",
      inclusions: null,
      exclusions: null,
    },
  ],
};

describe("cash-pay estimate snapshots", () => {
  it("keeps the prior and corrected prices and reason visible without implying delivery", () => {
    const correction: CashPayEstimate = {
      ...issued,
      id: 11,
      status: "issued",
      supersedes_id: issued.id,
      revision: 2,
      correction_reason: "Price catalog changed",
      lines: [
        {
          ...issued.lines[0],
          id: 2,
          unit_amount: "95.0",
          expected_amount: "95.0",
        },
      ],
    };
    const html = renderToStaticMarkup(
      <>
        <CashPayEstimateSnapshot
          estimate={issued}
          title="Prior issued snapshot"
        />
        <CashPayEstimateSnapshot
          estimate={correction}
          title="Correction snapshot"
        />
      </>,
    );
    expect(html).toContain("Prior issued snapshot");
    expect(html).toContain("Correction snapshot");
    expect(html).toContain("USD 75.0");
    expect(html).toContain("USD 95.0");
    expect(html).toContain("Price catalog changed");
    expect(html).toContain("Linked service offering #17");
    expect(html).toContain("Delivery not recorded");
    expect(html).toContain("Planned delivery method: portal");
    expect(estimateDeliveryLabel(correction)).toBe("Delivery not recorded");
  });

  it("keeps an uncertain failure eligible for an exact request retry", () => {
    expect(estimateFailure(new Error("Network interrupted")).uncertain).toBe(
      true,
    );
    expect(
      estimateFailure(new ApiError(422, "Invalid estimate")).uncertain,
    ).toBe(false);
  });
});

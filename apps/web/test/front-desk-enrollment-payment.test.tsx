import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enrollmentTermsPreview } from "../src/features/clinic/FrontDeskMembershipEnrollment";
import type { PackageTerms } from "../src/features/clinic/subscriptions/contracts";

const source = readFileSync(
  new URL(
    "../src/features/clinic/FrontDeskMembershipEnrollment.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("front desk one-time payment wiring", () => {
  it("previews the selected billing mode without changing the published terms", () => {
    const published = {
      renewal: "automatic",
      cancellation: "end_of_term",
      amount: "149.00",
    } as PackageTerms;
    expect(enrollmentTermsPreview(published, "one_time")).toMatchObject({
      renewal: "none",
      cancellation: "immediate",
      amount: "149.00",
    });
    expect(enrollmentTermsPreview(published, "recurring")).toMatchObject({
      renewal: "automatic",
      cancellation: "end_of_term",
    });
    expect(published.renewal).toBe("automatic");
  });
  it("gates simulation on the server capability and reuses a stable retry key", () => {
    expect(source).toContain("!oneTimePayment?.simulation_available");
    expect(source).toContain("/one_time_payment`");
    expect(source).toContain("request_key: oneTimeRequestKey");
    expect(source).toContain("setOneTimePayment(result.one_time_payment)");
    expect(source).toContain("Simulate card payment");
    expect(source).not.toContain("window.location");
  });

  it("allows onboarding only after a returned paid outcome", () => {
    expect(source).toContain('oneTimePayment?.status === "paid"');
    expect(source).toContain("createdProspect.patient_id");
    expect(source).toContain("Proceed to onboarding");
    expect(source).toContain("oneTimePayment?.instructions");
  });
});

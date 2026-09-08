import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/client";
import { clinicalHistoryOutcomeIsUnknown } from "../src/features/clinic/PatientClinicalHistory";

describe("clinical history save recovery", () => {
  it("retains the exact request after uncertain transport outcomes", () => {
    expect(clinicalHistoryOutcomeIsUnknown(new Error("Connection lost"))).toBe(
      true,
    );
    expect(
      clinicalHistoryOutcomeIsUnknown(new ApiError(408, "Timed out")),
    ).toBe(true);
    expect(
      clinicalHistoryOutcomeIsUnknown(new ApiError(503, "Unavailable")),
    ).toBe(true);
    expect(
      clinicalHistoryOutcomeIsUnknown(
        new ApiError(409, "Outcome unknown", "outcome_unconfirmed"),
      ),
    ).toBe(true);
  });

  it("keeps rejected validation requests editable", () => {
    expect(
      clinicalHistoryOutcomeIsUnknown(new ApiError(422, "Invalid record")),
    ).toBe(false);
  });
});

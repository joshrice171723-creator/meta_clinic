import { describe, expect, it } from "vitest";
import { patientPickerAccess } from "../src/features/scribe/ScribePatientPicker";

describe("scribe patient picker S1 contract", () => {
  it("requires identity lookup access to choose an existing patient", () => {
    expect(
      patientPickerAccess({
        patient_identity_read: true,
        patients: false,
      }),
    ).toEqual({ canReadIdentity: true });
    expect(
      patientPickerAccess({
        patient_identity_read: false,
        patients: true,
      }),
    ).toEqual({ canReadIdentity: true });
    expect(
      patientPickerAccess({
        patient_identity_read: false,
        patients: false,
      }),
    ).toEqual({ canReadIdentity: false });
  });
});

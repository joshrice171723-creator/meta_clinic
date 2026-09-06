import { describe, expect, it } from "vitest";
import {
  patientFromCreateResponse,
  patientPickerAccess,
} from "../src/features/scribe/ScribePatientPicker";

describe("scribe patient picker S1 contract", () => {
  it("accepts only a complete creation result for the active scope", () => {
    const response = {
      id: 17,
      patient: { id: 17, display_name: "Avery Patient", reference: "REF-17" },
    };
    expect(patientFromCreateResponse(response, 3, 3)).toEqual(response.patient);
    expect(patientFromCreateResponse(response, 2, 3)).toBeNull();
    expect(patientFromCreateResponse({ ...response, id: 18 }, 3, 3)).toBeNull();
  });

  it("keeps identity lookup and patient creation permissions independent", () => {
    expect(
      patientPickerAccess({
        patient_identity_read: true,
        patients: false,
        patients_write: false,
      }),
    ).toEqual({ canReadIdentity: true, canCreate: false });
    expect(
      patientPickerAccess({
        patient_identity_read: false,
        patients: true,
        patients_write: true,
      }),
    ).toEqual({ canReadIdentity: true, canCreate: true });
    expect(
      patientPickerAccess({
        patient_identity_read: false,
        patients: false,
        patients_write: true,
      }),
    ).toEqual({ canReadIdentity: false, canCreate: true });
  });
});

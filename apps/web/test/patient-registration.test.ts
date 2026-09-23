import { describe, expect, it } from "vitest";
import {
  registrationApiValues,
  registrationContactError,
  registrationIdentityReviewRequired,
  registrationIdentitySearches,
  registrationIdentitySignature,
} from "../src/features/clinic/Patients";

describe("patient registration request mapping", () => {
  it("keeps the structured address out of the strict API payload", () => {
    const values = {
      display_name: "Synthetic Patient",
      primary_address: "100 Example Street, Austin, TX 78701",
      address_line1: "100 Example Street",
      address_line2: "Suite 4",
      address_city: "Austin",
      address_state: "TX",
      address_postal_code: "78701",
      primary_address_original: "100 Example Street, Austin, TX 78701",
    };

    expect(registrationApiValues(values)).toEqual({
      display_name: "Synthetic Patient",
      primary_address: "100 Example Street, Austin, TX 78701",
    });
    expect(values.address_line1).toBe("100 Example Street");
  });
});

describe("registration identity review", () => {
  const submitted = {
    display_name: "Avery Example",
    legal_name: "Avery Example",
    reference: "TEST-801",
    date_of_birth: "1990-02-03",
    contact_type: "phone",
    contact_value: "(555) 111-2222",
  };

  it("searches each submitted identity detail independently", () => {
    expect(registrationIdentitySearches(submitted)).toEqual([
      "q=Avery+Example",
      "q=TEST-801",
      "date_of_birth=1990-02-03",
      "phone=5551112222",
    ]);
  });

  it("requires another review when the actual registration name, birth date, or reference changes", () => {
    const reviewed = registrationIdentitySignature(submitted);
    expect(registrationIdentityReviewRequired(submitted, reviewed, false)).toBe(
      false,
    );
    for (const change of [
      { display_name: "Different Patient" },
      { date_of_birth: "1992-03-04" },
      { reference: "TEST-802" },
    ]) {
      expect(
        registrationIdentityReviewRequired(
          { ...submitted, ...change },
          reviewed,
          false,
        ),
      ).toBe(true);
    }
    expect(registrationIdentityReviewRequired(submitted, null, false)).toBe(
      true,
    );
    expect(
      registrationIdentityReviewRequired(
        { ...submitted, display_name: "Different Patient" },
        reviewed,
        true,
      ),
    ).toBe(false);
  });
});

describe("patient registration contact validation", () => {
  it("checks the entered contact against its selected type before final save", () => {
    expect(
      registrationContactError({
        contact_type: "phone",
        contact_value: "overnight@example.invalid",
      }),
    ).toBe("Enter a valid phone number.");
    expect(
      registrationContactError({
        contact_type: "email",
        contact_value: "overnight@example.invalid",
      }),
    ).toBe("");
  });
});

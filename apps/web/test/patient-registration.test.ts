import { describe, expect, it } from "vitest";
import { registrationApiValues } from "../src/features/clinic/Patients";

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

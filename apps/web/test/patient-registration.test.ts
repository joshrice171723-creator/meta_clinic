import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PatientRegistrationForm,
  registrationApiValues,
  registrationContactError,
  registrationIdentityReviewRequired,
  registrationIdentitySearches,
  registrationIdentitySignature,
} from "../src/features/clinic/Patients";

const recovery = vi.hoisted(() => ({
  restored: null as null | {
    body: { clinic_patient: Record<string, string> };
    requestKey: string;
    pending: boolean;
    outcomeUnconfirmed: boolean;
  },
}));
vi.mock("../src/features/clinic/useWorkingDraft", () => ({
  useWorkingDraft: () => ({
    ready: true,
    restored: recovery.restored,
    status: "idle",
    error: "",
  }),
}));

describe("registration recovery controls", () => {
  const draft = {
    body: {
      clinic_patient: {
        display_name: "Synthetic First Patient",
        reference: "SYNTHETIC-FIRST-001",
        sex: "unknown",
        request_key: "synthetic-registration-retry",
      },
    },
    requestKey: "synthetic-registration-retry",
    pending: true,
    outcomeUnconfirmed: true,
  };
  const submitButton = (html: string) =>
    html.match(/<button\b[^>]*type="submit"[^>]*>/)?.[0];

  it.each([true, false])(
    "lets staff retry a restored pending registration without repeating locked sections (unknown=%s)",
    (outcomeUnconfirmed) => {
      recovery.restored = { ...draft, outcomeUnconfirmed };
      const html = renderToStaticMarkup(createElement(PatientRegistrationForm));
      expect(html).toContain("Retry same request");
      expect(html).toMatch(/<fieldset\b[^>]*disabled/);
      expect(submitButton(html)).toBeDefined();
      expect(submitButton(html)).not.toContain("disabled");
    },
  );

  it.each([null, { ...draft, pending: false, outcomeUnconfirmed: false }])(
    "keeps unfinished fresh and editable restored registrations behind section completion",
    (restored) => {
      recovery.restored = restored;
      const html = renderToStaticMarkup(createElement(PatientRegistrationForm));
      expect(html).not.toContain("Retry same request");
      expect(submitButton(html)).toContain("disabled");
    },
  );
});

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

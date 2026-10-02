import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Patient } from "../src/api/contracts";
import { PatientLookupResults } from "../src/features/clinic/Patients";

type LookupPatient = Omit<Patient, "reference"> & {
  reference?: string | null;
};

const lookupResource = vi.hoisted(() => vi.fn());
vi.mock("../src/shared/ui", async (original) => ({
  ...(await original<typeof import("../src/shared/ui")>()),
  useResource: lookupResource,
}));
vi.mock("../src/features/clinic/CareFlow", () => ({
  PatientSupport: () => null,
}));

beforeEach(() => lookupResource.mockReset());

function lookupRows(patients: LookupPatient[]) {
  lookupResource.mockReturnValue({
    data: {
      patients,
      pagination: {
        page: 1,
        per_page: 25,
        total: patients.length,
        total_pages: 1,
      },
    },
    refresh: vi.fn(),
  });
  const html = renderToStaticMarkup(
    <PatientLookupResults search="q=Avery+Marigold+Silverbrook" />,
  );
  return Array.from(
    html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g),
    (match) => match[1],
  );
}

describe("patient lookup recorded references", () => {
  it("distinguishes same-name patients by their provided references and exact destinations", () => {
    const rows = lookupRows([
      {
        id: 2,
        display_name: "Avery Marigold Silverbrook",
        reference: "SYN-MZ02-BM01-01",
        date_of_birth: null,
        phone_hint: null,
      },
      {
        id: 3,
        display_name: "Avery Marigold Silverbrook",
        reference: "SYN-MZ02-BM01-02",
        date_of_birth: null,
        phone_hint: null,
      },
    ]);

    expect(rows).toHaveLength(2);
    for (const [index, row] of rows.entries()) {
      const reference = `SYN-MZ02-BM01-0${index + 1}`;
      expect(row).toContain("Avery Marigold Silverbrook");
      expect(row).toContain(`Clinic reference: ${reference}`);
      expect(row).toContain("Possible duplicate");
      expect(row).toContain("Date of birth: Not recorded");
      expect(row).toContain("Phone: Not recorded");
      expect(row).toContain(`href="/clinic/patients/${index + 2}"`);
      expect(row).not.toContain(
        `href="/clinic/patients/${index === 0 ? 3 : 2}"`,
      );
      expect(row).not.toContain("Clinic reference: Not recorded");
    }
    expect(lookupResource).toHaveBeenCalledWith(
      "/api/clinic/patients/lookup?q=Avery+Marigold+Silverbrook&page=1&per_page=25",
    );
  });

  it.each([
    ["ordinary", "  CLINIC-204  ", "CLINIC-204"],
    ["SYN-", "  SYN-MZ02-BM01-01  ", "SYN-MZ02-BM01-01"],
    ["SYN_", "  SYN_MZ02_BM01_02  ", "SYN_MZ02_BM01_02"],
  ])(
    "shows the supplied %s reference and other identity fields",
    (_, reference, label) => {
      const [row] = lookupRows([
        {
          id: 204,
          display_name: "Avery Marigold Silverbrook",
          reference,
          date_of_birth: "1990-02-03",
          phone_hint: "***-0142",
        },
      ]);
      expect(row).toContain(`Clinic reference: ${label}`);
      expect(row).toContain("Date of birth: 1990-02-03");
      expect(row).toContain("Phone: ***-0142");
      expect(row).toContain('href="/clinic/patients/204"');
      expect(row).not.toContain("Clinic reference: Not recorded");
    },
  );

  it.each(["", "   ", null, undefined])(
    "keeps the missing-reference fallback for %s",
    (reference) => {
      const [row] = lookupRows([
        { id: 204, display_name: "Avery Marigold Silverbrook", reference },
      ]);
      expect(row).toContain("Clinic reference: Not recorded");
      expect(row).toContain("Date of birth: Not recorded");
      expect(row).toContain("Phone: Not recorded");
      expect(row).toContain('href="/clinic/patients/204"');
    },
  );
});

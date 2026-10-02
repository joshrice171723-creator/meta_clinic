import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClinicCapabilities } from "../src/api/contracts";
import {
  clearPatientContextHref,
  clinicPatientContextId,
  PatientContextBar,
} from "../src/features/clinic/PatientContextBar";

const fixture = vi.hoisted(() => ({
  patient: null as any,
  reads: [] as { enabled?: boolean }[],
}));
vi.mock("../src/shared/ui", async (original) => ({
  ...(await original<typeof import("../src/shared/ui")>()),
  useResource: (_path: string, options: { enabled?: boolean }) => {
    fixture.reads.push(options);
    return {
      data: fixture.patient ? { patients: [fixture.patient] } : undefined,
      refresh: vi.fn(),
    };
  },
}));
beforeEach(() => {
  fixture.patient = null;
  fixture.reads = [];
});

const capabilities = (
  overrides: Partial<ClinicCapabilities> = {},
): ClinicCapabilities => ({
  patients: false,
  patients_write: false,
  staff: false,
  inventory: false,
  appointments: false,
  encounters: false,
  notes_read: false,
  notes_write: false,
  documents: false,
  messages: false,
  billing: false,
  roles: false,
  ...overrides,
});

describe("URL-derived patient context", () => {
  it("uses a patient route before a conflicting query parameter", () => {
    expect(
      clinicPatientContextId(
        "/clinic/patients/42/encounters/7",
        "?patient_id=99",
      ),
    ).toBe(42);
    expect(clinicPatientContextId("/clinic/schedule", "?patient_id=99")).toBe(
      99,
    );
  });

  it.each([
    ["/clinic/schedule", "", null],
    ["/clinic/schedule", "?patient_id=0", null],
    ["/clinic/schedule", "?patient_id=-1", null],
    ["/clinic/schedule", "?patient_id=1.5", null],
    ["/clinic/schedule", "?patient_id=9007199254740992", null],
    ["/clinic/patients/not-a-number", "", null],
    ["/clinic/patients/0", "?patient_id=17", 17],
  ])("validates patient context from %s%s", (path, search, expected) => {
    expect(clinicPatientContextId(path, search)).toBe(expected);
  });

  it("clears only explicit query context and preserves unrelated parameters", () => {
    expect(
      clearPatientContextHref(
        "/clinic/schedule",
        "?patient_id=42&page=3&visit_modality=video",
      ),
    ).toBe("/clinic/schedule?page=3&visit_modality=video");
    expect(
      clearPatientContextHref(
        "/clinic/reminders",
        "?view=attention&patient_id=42&patient_id=43",
      ),
    ).toBe("/clinic/reminders?view=attention");
    expect(
      clearPatientContextHref(
        "/clinic/patients/42/encounters/7",
        "?focus=nurse-workspace",
      ),
    ).toBe("/clinic/patients");
  });

  it("keeps identity unread and hidden while offering generic context clearing without identity access", () => {
    fixture.patient = {
      id: 42,
      display_name: "Synthetic hidden identity",
      reference: "SYN-HIDDEN",
    };
    const html = renderToStaticMarkup(
      <PatientContextBar
        capabilities={capabilities()}
        path="/clinic/schedule"
        search="?patient_id=42"
      />,
    );
    expect(fixture.reads).toEqual([{ enabled: false }]);
    expect(html).toContain("Patient identity is restricted for this account");
    expect(html).toContain('aria-label="Clear current patient"');
    expect(html).not.toContain("Synthetic hidden identity");
    expect(html).not.toContain("SYN-HIDDEN");
    expect(html).not.toContain('href="/clinic/patients/42"');
    expect(html).not.toContain("Open patient record");
  });

  it("renders a bounded loading identity surface without unauthorized actions", () => {
    const html = renderToStaticMarkup(
      <PatientContextBar
        capabilities={capabilities({ patient_identity_read: true })}
        path="/clinic/schedule"
        search="?patient_id=42"
      />,
    );
    expect(html).toContain('aria-label="Current patient"');
    expect(html).toContain("Loading identity");
    expect(html).toContain('aria-label="Clear current patient"');
    expect(html).not.toContain("Open chart");
    expect(html).not.toContain(">Schedule<");
  });
});

describe("152 patient record link contract", () => {
  it.each(["/clinic/patients/42", "/clinic/patients/42/encounters/7"])(
    "labels the patient record destination accurately from %s",
    (path) => {
      fixture.patient = {
        id: 42,
        display_name: "Synthetic context patient",
        reference: "SYN-42",
      };
      const html = renderToStaticMarkup(
        <PatientContextBar
          capabilities={capabilities({ patients: true })}
          path={path}
          search=""
        />,
      );
      expect(html).toContain("Open patient record");
      expect(html).toContain('href="/clinic/patients/42"');
      expect(html).not.toContain("Open chart");
    },
  );
  it("does not offer record access with identity-only permission", () => {
    fixture.patient = {
      id: 42,
      display_name: "Synthetic context patient",
      reference: "SYN-42",
    };
    const html = renderToStaticMarkup(
      <PatientContextBar
        capabilities={capabilities({ patient_identity_read: true })}
        path="/clinic/schedule"
        search="?patient_id=42"
      />,
    );
    expect(html).toContain("Synthetic context patient");
    expect(html).not.toContain("Open patient record");
  });
});

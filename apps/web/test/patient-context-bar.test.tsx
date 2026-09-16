import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClinicCapabilities } from "../src/api/contracts";
import {
  clearPatientContextHref,
  clinicPatientContextId,
  PatientContextBar,
} from "../src/features/clinic/PatientContextBar";

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

  it("renders no identity surface when the account lacks identity access", () => {
    const html = renderToStaticMarkup(
      <PatientContextBar
        capabilities={capabilities()}
        path="/clinic/schedule"
        search="?patient_id=42"
      />,
    );
    expect(html).toBe("");
    expect(html).not.toContain("Current patient");
    expect(html).not.toContain("42");
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

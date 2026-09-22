import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  currentPatientAttempt,
  isCurrentPatientRequest,
} from "../src/features/clinic/PatientLabReports";

const patientLabReportsSource = readFileSync(
  new URL("../src/features/clinic/PatientLabReports.tsx", import.meta.url),
  "utf8",
);

describe("PatientLabReports patient scope", () => {
  it("never reuses an outcome-unknown mutation for another patient", () => {
    const attempt = {
      patientId: 42,
      key: "request-42",
      path: "/api/clinic/patients/42/lab_reports",
      body: { lab_report: { title: "Current result" } },
    };

    expect(currentPatientAttempt(attempt, 42)).toBe(attempt);
    expect(currentPatientAttempt(attempt, 43)).toBeNull();
    expect(currentPatientAttempt(null, 42)).toBeNull();
  });

  it("rejects a stale response after returning to the same patient", () => {
    expect(isCurrentPatientRequest(42, 2, 42, 0)).toBe(false);
    expect(isCurrentPatientRequest(42, 2, 42, 2)).toBe(true);
  });

  it("offers an explicit retry and labels retained results after a refresh failure", () => {
    expect(patientLabReportsSource).toContain(
      "setReportsStale(data !== undefined);",
    );
    expect(patientLabReportsSource).toContain("setReportsStale(false);");
    expect(patientLabReportsSource).toContain(
      "onClick={() => setReload((current) => current + 1)}",
    );
    expect(patientLabReportsSource).toContain("Prior results — refresh failed");
  });

  it("captures and preserves source-supplied terminology, UCUM, and interpretation fields", () => {
    expect(patientLabReportsSource).toContain('label="Test code system"');
    expect(patientLabReportsSource).toContain('label="Test code version"');
    expect(patientLabReportsSource).toContain('label="UCUM unit code"');
    expect(patientLabReportsSource).toContain('label="Source interpretation"');
    expect(patientLabReportsSource).toContain("code_system: row.code_system?.trim() || null");
    expect(patientLabReportsSource).toContain("unit_code: row.unit_code?.trim() || null");
    expect(patientLabReportsSource).toContain("interpretation: row.interpretation?.trim() || null");
  });
});

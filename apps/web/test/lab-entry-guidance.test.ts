import { expect, it } from "vitest";
import { labReportEntryGuidance } from "../src/features/clinic/PatientLabReports";

it("promises New report only when the existing creation gate allows it", () => {
  expect(labReportEntryGuidance(true, true, 30)).toContain("New report");
  expect(labReportEntryGuidance(false, false, 30)).toContain("write access");
  expect(labReportEntryGuidance(false, true, 30)).toContain(
    "active laboratory order",
  );
  expect(labReportEntryGuidance(false, true)).toContain(
    "Open the source encounter",
  );
  for (const message of [
    labReportEntryGuidance(false, false, 30),
    labReportEntryGuidance(false, true, 30),
    labReportEntryGuidance(false, true),
  ]) {
    expect(message).not.toContain("New report");
  }
});

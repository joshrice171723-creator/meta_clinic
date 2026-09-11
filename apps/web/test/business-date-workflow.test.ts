import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  businessNow,
  businessTimeAfter,
  isBeforeBusinessTime,
  setBusinessDate,
} from "../src/shared/businessDate";

afterEach(() => setBusinessDate(""));

describe("clinic workflow date", () => {
  it("uses the selected app date for workflow-relative times", () => {
    setBusinessDate("2035-04-22");

    const now = businessNow();
    expect(now.getFullYear()).toBe(2035);
    expect(now.getMonth()).toBe(3);
    expect(now.getDate()).toBe(22);

    const fixedNow = new Date("2035-04-22T12:00:00Z");
    expect(businessTimeAfter(4 * 3_600_000, fixedNow).toISOString()).toBe(
      "2035-04-22T16:00:00.000Z",
    );
    expect(isBeforeBusinessTime("2035-04-22T11:59:59Z", fixedNow)).toBe(true);
    expect(isBeforeBusinessTime("2035-04-22T12:00:01Z", fixedNow)).toBe(false);
  });

  it("keeps clinic date-sensitive workflows off the computer clock", () => {
    const dateSensitiveSources = [
      "src/features/clinic/LabFollowUpWorklist.tsx",
      "src/features/clinic/PatientLabReports.tsx",
      "src/features/clinic/RecallWorklist.tsx",
      "src/features/clinic/WaitlistWorkspace.tsx",
      "src/features/clinic/WorkInbox.tsx",
    ].map((path) => readFileSync(path, "utf8"));
    const frontDesk = readFileSync("src/features/clinic/FrontDesk.tsx", "utf8");

    for (const source of dateSensitiveSources) {
      expect(source).not.toContain("Date.now()");
    }
    expect(frontDesk).toContain("clinicDateValue(businessNow(), timezone)");
    expect(frontDesk).not.toContain("clinicDateValue(new Date(), timezone)");
  });
});

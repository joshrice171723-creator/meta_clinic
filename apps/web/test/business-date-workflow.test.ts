import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
    expect(now.getUTCFullYear()).toBe(2035);
    expect(now.getUTCMonth()).toBe(3);
    expect(now.getUTCDate()).toBe(22);

    const fixedNow = new Date("2035-04-22T12:00:00Z");
    expect(businessTimeAfter(4 * 3_600_000, fixedNow).toISOString()).toBe(
      "2035-04-22T16:00:00.000Z",
    );
    expect(isBeforeBusinessTime("2035-04-22T11:59:59Z", fixedNow)).toBe(true);
    expect(isBeforeBusinessTime("2035-04-22T12:00:01Z", fixedNow)).toBe(false);
  });

  it.each([
    ["America/Los_Angeles", "2026-10-01T06:27:00.000Z", 420],
    ["Asia/Tokyo", "2026-10-01T23:27:00.000Z", -540],
  ])("keeps the server business instant in %s", (timezone, instant, offset) => {
    const moduleUrl = new URL("../src/shared/businessDate.ts", import.meta.url);
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
          const instant = ${JSON.stringify(instant)};
          const RealDate = Date;
          globalThis.Date = class extends RealDate {
            constructor(value = instant) { super(value); }
            static now() { return RealDate.parse(instant); }
          };
          const { businessNow, setBusinessDate } = await import(${JSON.stringify(moduleUrl.href)});
          setBusinessDate("2026-10-01");
          const current = businessNow().toISOString();
          setBusinessDate("2035-04-22");
          const shifted = businessNow().toISOString();
          setBusinessDate("");
          console.log(JSON.stringify({
            offset: new Date().getTimezoneOffset(),
            current,
            shifted,
            cleared: businessNow().toISOString(),
          }));
        `,
      ],
      {
        env: { ...process.env, TZ: String(timezone) },
        encoding: "utf8",
        timeout: 10000,
      },
    );
    expect(JSON.parse(output)).toEqual({
      offset,
      current: instant,
      shifted: `2035-04-22${String(instant).slice(10)}`,
      cleared: instant,
    });
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

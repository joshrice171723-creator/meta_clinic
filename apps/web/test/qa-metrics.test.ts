import { describe, expect, it } from "vitest";
import { githubOpenDefectCount } from "../src/features/qa/qaMetrics";

describe("GitHub open defect count", () => {
  it("does not report zero when the source is unavailable", () => {
    expect(githubOpenDefectCount({ status: "unavailable", issues: [] })).toBe(
      "Unavailable",
    );
  });

  it("does not report cached issues as a current count", () => {
    expect(
      githubOpenDefectCount({ status: "stale", issues: [{ state: "open" }] }),
    ).toBe("Unavailable");
  });

  it("reports a genuine zero for a connected empty source", () => {
    expect(githubOpenDefectCount({ status: "connected", issues: [] })).toBe(0);
  });

  it("counts only open issues from a connected source", () => {
    expect(
      githubOpenDefectCount({
        status: "connected",
        issues: [{ state: "open" }, { state: "closed" }, { state: "open" }],
      }),
    ).toBe(2);
  });
});

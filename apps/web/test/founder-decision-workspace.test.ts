import { describe, expect, it } from "vitest";
import { buildDecisionBrief } from "../src/features/founder/FounderDecisionWorkspace";

describe("founder decision workspace", () => {
  it("builds a copy-ready response from selected answers and notes", () => {
    const brief = buildDecisionBrief(
      { weight_intake: ["initial", "follow_up"] },
      { weight_intake: "Start with the cash-pay weight-management profile." },
      {
        clinic: "Weight-management reference clinic",
        owner: "Founder",
        goal: "Bounded intake implementation",
      },
    );

    expect(brief).toContain("# Meta Clinic decision response");
    expect(brief).toContain(
      "- Clinic/profile: Weight-management reference clinic",
    );
    expect(brief).toContain(
      "- Build the complete initial intake across M1–M10.",
    );
    expect(brief).toContain(
      "- Add a shorter, change-focused follow-up form (M12).",
    );
    expect(brief).toContain(
      "Start with the cash-pay weight-management profile.",
    );
    expect(brief).toContain(
      "## Availability, resource capacity, and reservation recovery",
    );
    expect(brief).toContain("- No answer recorded.");
  });
});

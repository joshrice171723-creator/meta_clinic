import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TimecardSummary } from "../src/features/workforce/TimecardSummary";
import type { Timecard } from "../src/features/workforce/clockTypes";

function unknownPolicyCard(): Timecard {
  return {
    id: 1,
    employment_id: 2,
    employee_name: "Synthetic Hours",
    period_start: "2026-08-30",
    period_end: "2026-09-06",
    version_number: 1,
    status: "draft",
    source_digest: "a".repeat(64),
    unresolved_exceptions: ["rounding_policy_unconfigured"],
    settings_provenance: {},
    lock_version: 0,
    submitted_at: null,
    approved_at: null,
    snapshot: {
      period: { start: "2026-08-30", end: "2026-09-06" },
      totals: {
        raw_minutes: 7,
        rounded_minutes: null,
        paid_minutes: null,
        regular_minutes: null,
        overtime_minutes: null,
      },
      segments: [],
    },
  };
}

describe("timecard policy state", () => {
  it("shows unknown payment categories and preserved raw time with explicit policy warning", () => {
    const html = renderToStaticMarkup(
      <TimecardSummary card={unknownPolicyCard()} />,
    );
    expect(html).toContain("Not configured");
    expect(html).toContain("0h 07m");
    expect(html).toContain("rounding policy unconfigured");
    expect(html).toContain("cannot be approved or exported");
  });

  it("distinguishes absent published schedule from an observed off-schedule exception", () => {
    const card = unknownPolicyCard();
    card.unresolved_exceptions = [];
    card.snapshot.schedule_checks = [
      {
        site_id: 3,
        local_date: "2026-09-01",
        status: "no_published_schedule",
        publication_ids: [],
      },
    ];
    const unknown = renderToStaticMarkup(<TimecardSummary card={card} />);
    expect(unknown).toContain("no published schedule to compare");
    expect(unknown).not.toContain("off schedule work");
    card.unresolved_exceptions = ["off_schedule_work"];
    card.snapshot.schedule_checks[0].status = "compared";
    const compared = renderToStaticMarkup(<TimecardSummary card={card} />);
    expect(compared).toContain("off schedule work");
    expect(compared).not.toContain("no published schedule to compare");
  });
});

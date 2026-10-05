import { describe, expect, it } from "vitest";
import { timecardAttention } from "../src/features/workforce/timecardAttention";
import type {
  Adjustment,
  Timecard,
} from "../src/features/workforce/clockTypes";
export const card = (
  id: number,
  attributes: Partial<Timecard> = {},
): Timecard => ({
  id,
  employment_id: id,
  employee_name: `Synthetic ${id}`,
  period_start: "2026-09-21",
  period_end: "2026-09-28",
  version_number: 1,
  status: "draft",
  source_digest: "a".repeat(64),
  unresolved_exceptions: [],
  settings_provenance: {},
  snapshot: {
    period: { start: "2026-09-21", end: "2026-09-28" },
    segments: [],
    totals: {
      raw_minutes: 0,
      rounded_minutes: 0,
      paid_minutes: 0,
      regular_minutes: null,
      overtime_minutes: null,
    },
  },
  lock_version: 0,
  submitted_at: null,
  approved_at: null,
  ...attributes,
});
const correction = (
  id: number,
  source: number,
  status: Adjustment["status"] = "submitted",
): Adjustment => ({
  id,
  employment_id: source,
  employee_name: `Synthetic ${source}`,
  period_start: "2026-09-21",
  period_end: "2026-09-28",
  timecard_version_id: source,
  status,
  correction_type: "add_segment",
  proposed_changes: {},
  source_interval: null,
  reason: "Synthetic correction",
  requested_at: "2026-09-30T12:00:00Z",
  reviewed_at: null,
  decision_reason: null,
  resulting_timecard_version_id: null,
  lock_version: 0,
});
describe("timecard attention over authorized source records", () => {
  it("selects the highest version independent of input ordering and separates periods/employees", () => {
    const result = timecardAttention(
      [
        card(1, { status: "submitted" }),
        card(2, { employment_id: 1, version_number: 2, status: "approved" }),
        card(3, {
          employment_id: 1,
          period_start: "2026-09-14",
          status: "submitted",
        }),
        card(4, { status: "submitted" }),
      ],
      [],
    );
    expect(result.groups.all.map((c) => c.id)).toEqual([2, 3, 4]);
    expect(result.groups.submitted.map((c) => c.id)).toEqual([3, 4]);
  });
  it("excludes final versions from exceptions and does not resurrect a superseded card", () => {
    const result = timecardAttention(
      [
        card(1, { unresolved_exceptions: ["missing_punch"] }),
        card(2, { status: "approved", unresolved_exceptions: ["old"] }),
        card(3, { status: "superseded", unresolved_exceptions: ["old"] }),
      ],
      [],
    );
    expect(result.groups.exceptions.map((c) => c.id)).toEqual([1]);
    expect(result.groups.all.map((c) => c.id)).toEqual([1, 2]);
  });
  it("keeps pending historical and unmatched correction requests, excluding resolved requests", () => {
    const pending = [
      correction(11, 1),
      correction(12, 99),
      correction(13, 3, "denied"),
      correction(14, 3, "approved"),
    ];
    const result = timecardAttention(
      [card(1), card(2, { employment_id: 1, version_number: 2 }), card(3)],
      pending,
    );
    expect(result.pending.map((c) => c.id)).toEqual([11, 12]);
    expect(result.groups.corrections.map((c) => c.id)).toEqual([2]);
    expect(pending[0].timecard_version_id).toBe(1);
  });
  it("keeps unanswered/empty data empty and does not infer an exception from null overtime", () => {
    expect(timecardAttention([], []).groups.all).toEqual([]);
    expect(timecardAttention([card(1)], []).groups.exceptions).toEqual([]);
  });
});

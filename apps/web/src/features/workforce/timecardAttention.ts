import type { Adjustment, Timecard } from "./clockTypes";

export type TimecardAttention =
  "all" | "submitted" | "exceptions" | "corrections";

/** Presentation over authorized records; never determines approval eligibility. */
export function timecardAttention(
  cards: Timecard[],
  adjustments: Adjustment[],
) {
  const latest = new Map<string, Timecard>();
  for (const card of cards) {
    const key = `${card.employment_id}:${card.period_start}`;
    const previous = latest.get(key);
    if (!previous || card.version_number > previous.version_number)
      latest.set(key, card);
  }
  const current = [...latest.values()].filter(
    (card) => card.status !== "superseded",
  );
  const byId = new Map(cards.map((card) => [card.id, card]));
  const pending = adjustments.filter(
    (request) => request.status === "submitted",
  );
  // A correction can still refer to an earlier version. Keep that request visible.
  const correctionPeriods = new Set(
    pending.flatMap((request) => {
      const source = byId.get(request.timecard_version_id);
      return source ? [`${source.employment_id}:${source.period_start}`] : [];
    }),
  );
  const groups = {
    all: current,
    submitted: current.filter((card) => card.status === "submitted"),
    exceptions: current.filter(
      (card) =>
        !["approved", "superseded"].includes(card.status) &&
        card.unresolved_exceptions.length > 0,
    ),
    corrections: current.filter((card) =>
      correctionPeriods.has(`${card.employment_id}:${card.period_start}`),
    ),
  };
  return { groups, pending };
}

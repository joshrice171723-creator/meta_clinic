// Independently invented UI examples, never mapped to directory/API patient IDs.
// A fixed scenario clock avoids presenting simulated waits as a live feed.
export const EXAMPLE_CLOCK = "2026-08-31T10:20:00-05:00";
export const VISIT_STAGES = [
  {
    id: "waiting",
    label: "Awaiting intake",
    action: "Intake",
    waiting: true,
  },
  { id: "intake", label: "In intake", action: "Triage", waiting: false },
  {
    id: "ready",
    label: "Ready for Provider",
    action: "Provider",
    waiting: true,
  },
  {
    id: "clinician",
    label: "With Provider",
    action: "Provider",
    waiting: false,
  },
  {
    id: "checkout",
    label: "Awaiting checkout",
    action: "Checkout",
    waiting: true,
  },
] as const;
export type VisitStage = (typeof VISIT_STAGES)[number]["id"];
export type BoardVisit = {
  id: string;
  firstName: string;
  lastName: string;
  age: number | null;
  gender: "F" | "M" | "X" | null;
  appointmentType: "Scheduled" | "Unscheduled" | "Follow-up" | "Establish Care";
  chiefComplaint: string;
  reason: string;
  visitType: string;
  membership: "member" | "nonmember" | "unknown";
  stage: VisitStage;
  room: string | null;
  owner: string | null;
  arrivedAt: string | null;
  stageStartedAt: string | null;
  triage: {
    summary: string;
    recordedAt: string;
    recordedBy: string;
    vitals: string | null;
    vitalsSummary: string | null;
    review: string;
  } | null;
};
const at = (time: string) => `2026-08-31T${time}:00-05:00`;
const assessed = (
  time: string,
  summary: string,
): NonNullable<BoardVisit["triage"]> => ({
  summary,
  recordedAt: at(time),
  recordedBy: "Example staff A",
  vitals: "BP 124/78 mmHg · HR 72 bpm · RR 16/min · SpO₂ 98% · T 36.8°C",
  vitalsSummary: "BP 124/78 · HR 72 · 72 kg",
  review: "Medication and allergy review recorded in this example",
});
export const EXAMPLE_VISITS: readonly BoardVisit[] = [
  {
    id: "EX-001",
    firstName: "Mara",
    lastName: "Rivera",
    age: 46,
    gender: "F",
    appointmentType: "Follow-up",
    chiefComplaint: "Migraine",
    reason: "Follow-up visit",
    visitType: "Scheduled · Follow-up",
    membership: "member",
    stage: "waiting",
    room: "Waiting room",
    owner: null,
    arrivedAt: at("09:59"),
    stageStartedAt: at("09:59"),
    triage: null,
  },
  {
    id: "EX-002",
    firstName: "Theo",
    lastName: "Bennett",
    age: 34,
    gender: "M",
    appointmentType: "Establish Care",
    chiefComplaint: "New patient intake",
    reason: "Establish care",
    visitType: "Scheduled · New patient",
    membership: "nonmember",
    stage: "intake",
    room: "Room 2",
    owner: "Example staff A",
    arrivedAt: at("09:50"),
    stageStartedAt: at("10:10"),
    triage: {
      summary: "Intake in progress",
      recordedAt: at("10:12"),
      recordedBy: "Example staff A",
      vitals: null,
      vitalsSummary: null,
      review: "Medication and allergy review not recorded",
    },
  },
  {
    id: "EX-003",
    firstName: "Avery",
    lastName: "Chen",
    age: 61,
    gender: "F",
    appointmentType: "Scheduled",
    chiefComplaint: "Flu Shot",
    reason: "Medication follow-up",
    visitType: "Scheduled · Follow-up",
    membership: "member",
    stage: "ready",
    room: "Room 1",
    owner: "Example Provider A",
    arrivedAt: at("09:40"),
    stageStartedAt: at("10:03"),
    triage: assessed("10:01", "Ready for Provider review"),
  },
  {
    id: "EX-004",
    firstName: "Jules",
    lastName: "Patel",
    age: 45,
    gender: "X",
    appointmentType: "Scheduled",
    chiefComplaint: "Annual wellness",
    reason: "Annual visit",
    visitType: "Scheduled · Annual",
    membership: "member",
    stage: "clinician",
    room: "Room 3",
    owner: "Example Provider B",
    arrivedAt: at("09:25"),
    stageStartedAt: at("09:55"),
    triage: assessed("09:48", "Questions for Provider"),
  },
  {
    id: "EX-005",
    firstName: "Lena",
    lastName: "Morris",
    age: 28,
    gender: "F",
    appointmentType: "Unscheduled",
    chiefComplaint: "Migraine",
    reason: "Same-day concern",
    visitType: "Same-day · Return patient",
    membership: "unknown",
    stage: "ready",
    room: "Room 4",
    owner: null,
    arrivedAt: at("09:58"),
    stageStartedAt: at("10:11"),
    triage: {
      ...assessed("10:09", "Provider review requested"),
      vitals: null,
    },
  },
  {
    id: "EX-006",
    firstName: "Eli",
    lastName: "Ross",
    age: 52,
    gender: "M",
    appointmentType: "Follow-up",
    chiefComplaint: "Medication Refill",
    reason: "Follow-up visit",
    visitType: "Scheduled · Follow-up",
    membership: "member",
    stage: "checkout",
    room: "Checkout",
    owner: "Example front desk",
    arrivedAt: at("09:15"),
    stageStartedAt: at("10:15"),
    triage: assessed("09:30", "Intake recorded"),
  },
];
export function patientLabel(first: string, last: string) {
  const characters = (value: string) =>
    Array.from(value.trim().normalize("NFC"));
  const initial = characters(first)[0];
  const surname = characters(last).slice(0, 3).join("");
  return `${initial ? initial + "." : "—"} ${surname || "—"}`;
}
export function elapsedMinutes(
  since: string | null,
  now: string,
): number | null {
  if (!since) return null;
  const milliseconds = Date.parse(now) - Date.parse(since);
  return Number.isFinite(milliseconds) && milliseconds >= 0
    ? Math.floor(milliseconds / 60_000)
    : null;
}
export function waitingMinutes(visit: BoardVisit, now: string) {
  if (!VISIT_STAGES.find((s) => s.id === visit.stage)?.waiting) return null;
  const arrived = elapsedMinutes(visit.arrivedAt, now);
  const stage = elapsedMinutes(visit.stageStartedAt, now);
  return arrived !== null && stage !== null && stage <= arrived ? stage : null;
}
export function durationLabel(minutes: number | null) {
  if (minutes === null) return "Not recorded";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function filterVisits(
  visits: readonly BoardVisit[],
  stage: string,
  query: string,
  sort: string,
  now: string,
) {
  const search = query.trim().toLocaleLowerCase();
  return visits
    .filter(
      (v) =>
        (stage === "all" || v.stage === stage) &&
        [
          patientLabel(v.firstName, v.lastName),
          v.id,
          v.room ?? "",
          v.owner ?? "",
          v.reason,
          v.chiefComplaint,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search),
    )
    .sort((a, b) => {
      const value = (v: BoardVisit) =>
        sort === "wait"
          ? waitingMinutes(v, now)
          : elapsedMinutes(v.arrivedAt, now);
      return (value(b) ?? -1) - (value(a) ?? -1) || a.id.localeCompare(b.id);
    });
}

export const VISIT_STAGES = [
  {
    id: "scheduled",
    label: "Expected",
    action: "Expected",
    waiting: false,
  },
  {
    id: "waiting",
    label: "Waiting room",
    action: "Intake",
    waiting: true,
  },
  { id: "intake", label: "Intake", action: "Triage", waiting: false },
  {
    id: "ready",
    label: "Ready",
    action: "Provider",
    waiting: true,
  },
  {
    id: "clinician",
    label: "With provider",
    action: "Provider",
    waiting: false,
  },
  {
    id: "checkout",
    label: "Checkout",
    action: "Checkout",
    waiting: true,
  },
  {
    id: "unrecorded",
    label: "Not recorded",
    action: "Review encounter record",
    waiting: false,
  },
] as const;
export type VisitStage = (typeof VISIT_STAGES)[number]["id"];
export type OperationalState =
  "upcoming" | "on_time" | "late" | "waiting_room" | "unrecorded";
export type BoardVitalStatus = "above" | "within" | "below" | "unassessed";
export type BoardClinician = {
  id: string;
  firstName: string;
  lastName: string;
  credentials: string;
  displayName?: string;
  locationIds: readonly string[];
};
export type BoardVisit = {
  id: string;
  patientId?: number | null;
  encounterId?: number | null;
  patientDisplayName?: string | null;
  patientReference?: string | null;
  firstName: string;
  lastName: string;
  age: number | null;
  gender: "F" | "M" | "X" | null;
  appointmentType:
    | "Scheduled"
    | "Unscheduled"
    | "Follow-up"
    | "Establish Care"
    | "Recorded visit";
  chiefComplaint: string;
  appointmentStartsAt?: string | null;
  appointmentEndsAt?: string | null;
  operationalState?: OperationalState;
  reason: string;
  visitType: string;
  membership: "member" | "nonmember" | "unknown";
  stage: VisitStage;
  locationId: string;
  room: string | null;
  assignedClinicianId: string | null;
  assignedProviderName?: string | null;
  providerAssignmentToken?: string | null;
  providerAssignmentAvailable?: boolean;
  eligibleProviders?: readonly BoardClinician[];
  owner: string | null;
  arrivedAt: string | null;
  stageStartedAt: string | null;
  triage: {
    summary: string;
    recordedAt: string;
    recordedBy: string;
    vitals: string | null;
    vitalsSummary: string | null;
    readings?: {
      bp: { value: string; unit: string | null } | null;
      hr: { value: string; unit: string | null } | null;
      weight: { value: string; unit: string | null } | null;
    } | null;
    vitalStatuses: {
      bp: BoardVitalStatus;
      hr: BoardVitalStatus;
      weight: BoardVitalStatus;
    } | null;
    review: string;
  } | null;
};
export function cliniciansForLocation(
  locationId: string,
  clinicians: readonly BoardClinician[],
) {
  return clinicians.filter((clinician) =>
    clinician.locationIds.includes(locationId),
  );
}
export function clinicianInitials(clinician: BoardClinician) {
  const first = Array.from(clinician.firstName.trim().normalize("NFC"))[0];
  const last = Array.from(clinician.lastName.trim().normalize("NFC"))[0];
  return `${first ?? "—"}${last ?? "—"}`;
}
export function clinicianLabel(clinician: BoardClinician) {
  if (clinician.displayName?.trim()) return clinician.displayName.trim();
  const name = `${clinician.firstName} ${clinician.lastName}`.trim();
  return clinician.credentials ? `${name}, ${clinician.credentials}` : name;
}
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
          v.patientDisplayName ?? "",
          v.patientReference ?? "",
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

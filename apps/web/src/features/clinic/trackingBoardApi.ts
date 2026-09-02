import type { ClinicTrackingBoardVisit } from "../../api/contracts";
import type { BoardVisit } from "./trackingBoardData";

function appointmentType(code: string | null) {
  const normalized = code?.trim().toLocaleLowerCase() ?? "";
  if (/follow[\s_-]*up/.test(normalized)) return "Follow-up" as const;
  if (/establish[\s_-]*care|new[\s_-]*patient/.test(normalized))
    return "Establish Care" as const;
  return "Recorded visit" as const;
}

export function trackingBoardVisitToBoardVisit(
  visit: ClinicTrackingBoardVisit,
): BoardVisit {
  const visitType = visit.appointment?.visit_type_code?.trim() || null;
  const scenario = visit.synthetic_scenario;
  const location = [
    visit.encounter.site_code,
    visit.encounter.room_code,
  ].filter(Boolean);
  return {
    id: `encounter-${visit.encounter_id}`,
    patientId: visit.patient_id,
    encounterId: visit.encounter_id,
    patientDisplayName: visit.patient.display_name,
    patientReference: visit.patient.reference,
    isSynthetic: false,
    firstName: "",
    lastName: "",
    age: null,
    gender: null,
    appointmentType: appointmentType(visitType),
    chiefComplaint: scenario?.reason || "Reason not recorded",
    reason: scenario?.reason || visitType || "Reason not recorded",
    visitType: visitType || "Visit type not recorded",
    membership: "unknown",
    stage: scenario?.stage ?? "unrecorded",
    locationId: visit.encounter.site_id
      ? `api-site-${visit.encounter.site_id}`
      : "unassigned",
    room: location.length ? location.join(" · ") : null,
    assignedClinicianId: null,
    owner: null,
    arrivedAt: null,
    stageStartedAt: null,
    triage: null,
  };
}

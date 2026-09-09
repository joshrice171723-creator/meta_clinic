import type { ClinicTrackingBoardVisit } from "../../api/contracts";
import type { BoardVisit } from "./trackingBoardData";
import { api } from "../../api/client";

type TrackingBoardVisitWithOperations = ClinicTrackingBoardVisit & {
  intake_ownership?: {
    participant_id: string;
    token: string;
    owner: { membership_id: string; display_name: string };
    lease_expires_at: string | null;
    state: "claimed" | "stale";
    claim_available: boolean;
    release_available: boolean;
  } | null;
  intake_claim_available?: boolean;
  exceptions?: { code: string; message: string }[];
};

export type BoardIntakeOwnership = {
  participantId: string;
  token: string;
  ownerName: string;
  leaseExpiresAt: string | null;
  state: "claimed" | "stale";
  canClaim: boolean;
  canRelease: boolean;
};

export type BoardOperationMetadata = {
  intakeOwnership: BoardIntakeOwnership | null;
  canClaimIntake: boolean;
  exceptions: readonly { code: string; message: string }[];
};

export function providerAssignmentRequestKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `provider-${Date.now()}-${Math.random()}`
  );
}

export function intakeOwnershipRequestKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `intake-ownership-${Date.now()}-${Math.random()}`
  );
}

export function assignBoardProvider(
  encounterId: number,
  patientId: number,
  clinicianProfileId: string | null,
  expectedToken: string | null,
  requestKey = providerAssignmentRequestKey(),
) {
  return api<{
    assignment: { participant_id: string | null; token: string | null };
  }>(`/api/clinic/encounters/${encounterId}/provider_assignment`, {
    method: "POST",
    body: {
      assignment: {
        patient_id: patientId,
        clinician_profile_id: clinicianProfileId,
        request_key: requestKey,
        expected_token: expectedToken,
        unassign: clinicianProfileId === null,
      },
    },
  });
}

export function claimBoardIntake(
  encounterId: number,
  expectedToken: string | null,
  requestKey = intakeOwnershipRequestKey(),
) {
  return api<{ intake_ownership: { token: string } }>(
    `/api/clinic/encounters/${encounterId}/intake_ownership/claim`,
    {
      method: "POST",
      body: { ownership: { request_key: requestKey, expected_token: expectedToken } },
    },
  );
}

export function releaseBoardIntake(
  encounterId: number,
  expectedToken: string,
  requestKey = intakeOwnershipRequestKey(),
) {
  return api<{ intake_ownership: { token: string | null } }>(
    `/api/clinic/encounters/${encounterId}/intake_ownership/release`,
    {
      method: "POST",
      body: { ownership: { request_key: requestKey, expected_token: expectedToken } },
    },
  );
}

export function trackingBoardOperationMetadata(
  visit: ClinicTrackingBoardVisit,
): BoardOperationMetadata {
  const operations = visit as TrackingBoardVisitWithOperations;
  const ownership = operations.intake_ownership;
  return {
    intakeOwnership: ownership
      ? {
          participantId: ownership.participant_id,
          token: ownership.token,
          ownerName: ownership.owner.display_name,
          leaseExpiresAt: ownership.lease_expires_at,
          state: ownership.state,
          canClaim: ownership.claim_available,
          canRelease: ownership.release_available,
        }
      : null,
    canClaimIntake: ownership
      ? ownership.claim_available
      : operations.intake_claim_available === true,
    exceptions: operations.exceptions ?? [],
  };
}

function appointmentType(code: string | null) {
  const normalized = code?.trim().toLocaleLowerCase() ?? "";
  if (/follow[\s_-]*up/.test(normalized)) return "Follow-up" as const;
  if (/establish[\s_-]*care|new[\s_-]*patient/.test(normalized))
    return "Establish Care" as const;
  return "Recorded visit" as const;
}

function displaySex(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase();
  if (!normalized || normalized === "unknown" || normalized === "not_recorded")
    return null;
  if (normalized === "female") return "F" as const;
  if (normalized === "male") return "M" as const;
  return "X" as const;
}

function patientNameParts(value: string | null | undefined) {
  const cleaned = value?.trim().replace(/^SYN[_\s-]*/i, "") ?? "";
  const [lastPart, firstPart] = cleaned.split(",");
  const fallback = cleaned.split(/\s+/);
  const lastName = firstPart === undefined ? (fallback.at(-1) ?? "") : lastPart;
  const firstName = firstPart === undefined ? (fallback[0] ?? "") : firstPart;
  return {
    lastName: lastName.trim(),
    firstName: firstName.trim().split(/\s+/)[0] ?? "",
  };
}

export function formatRecordedDecimal(value: string | null | undefined) {
  if (value == null || value.trim() === "") return null;
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const fraction = match[3]?.replace(/0+$/, "") ?? "";
  const magnitude = fraction ? `${integer}.${fraction}` : integer;
  return /^0(?:\.0*)?$/.test(magnitude) ? "0" : `${match[1]}${magnitude}`;
}

export function trackingBoardVisitToBoardVisit(
  visit: ClinicTrackingBoardVisit,
): BoardVisit {
  const visitType = visit.appointment?.visit_type_code?.trim() || null;
  const scenario = visit.synthetic_scenario;
  const encounter = visit.encounter;
  const locationRecord = encounter ?? visit.appointment;
  const room =
    locationRecord?.room_code?.trim() ||
    visit.appointment?.room_code?.trim() ||
    null;
  const name = patientNameParts(visit.patient.display_name);
  const bp = visit.vitals?.blood_pressure;
  const systolic = formatRecordedDecimal(bp?.systolic);
  const diastolic = formatRecordedDecimal(bp?.diastolic);
  const hr = formatRecordedDecimal(visit.vitals?.heart_rate?.value);
  const weight = formatRecordedDecimal(visit.vitals?.weight?.value);
  const hasVitals = systolic || diastolic || hr || weight;
  const membership = visit.patient.membership;
  const provider = visit.provider;
  const operations = trackingBoardOperationMetadata(visit);
  return {
    id: `${visit.row_type}-${visit.id}`,
    patientId: visit.patient_id,
    encounterId: visit.encounter_id,
    chartStatus: visit.chart_status,
    patientDisplayName: visit.patient.display_name,
    patientReference: visit.patient.reference,
    firstName: name.firstName,
    lastName: name.lastName,
    age: visit.patient.demographics?.age ?? null,
    gender: displaySex(visit.patient.demographics?.sex),
    appointmentType: appointmentType(visitType),
    chiefComplaint: scenario?.reason || "Reason not recorded",
    reason: scenario?.reason || visitType || "Reason not recorded",
    visitType: visitType || "Visit type not recorded",
    membership:
      membership === "member"
        ? "member"
        : membership === "nonmember"
          ? "nonmember"
          : "unknown",
    stage:
      scenario?.stage ??
      (["upcoming", "on_time", "late"].includes(visit.operational_state)
        ? "scheduled"
        : visit.operational_state === "waiting_room"
          ? "waiting"
          : "unrecorded"),
    locationId: locationRecord?.site_id
      ? `api-site-${locationRecord.site_id}`
      : "unassigned",
    room,
    assignedClinicianId: provider
      ? `api-provider-${provider.clinician_profile_id}`
      : null,
    assignedProviderName: provider?.display_name ?? null,
    providerAssignmentToken: provider?.token ?? null,
    providerAssignmentAvailable:
      visit.row_type === "encounter" &&
      visit.provider_assignment_available === true,
    owner: operations.intakeOwnership?.ownerName ?? null,
    arrivedAt: encounter?.started_at ?? null,
    stageStartedAt: encounter?.started_at ?? null,
    triage: hasVitals
      ? {
          summary: "Vitals recorded",
          recordedAt: visit.encounter?.started_at ?? "",
          recordedBy: "",
          vitals: null,
          vitalsSummary: "Vitals recorded",
          readings: {
            bp:
              systolic || diastolic
                ? {
                    value: `${systolic ?? "—"}/${diastolic ?? "—"}`,
                    unit: bp?.unit ?? null,
                  }
                : null,
            hr: hr
              ? {
                  value: hr,
                  unit: visit.vitals?.heart_rate?.unit ?? null,
                }
              : null,
            weight: weight
              ? {
                  value: weight,
                  unit: visit.vitals?.weight?.unit ?? null,
                }
              : null,
          },
          vitalStatuses: null,
          review: "",
        }
      : null,
    appointmentStartsAt: visit.appointment?.starts_at ?? null,
    appointmentEndsAt: visit.appointment?.ends_at ?? null,
    operationalState: visit.operational_state,
  };
}

import { api } from "../../api/client";
import type {
  TelehealthDeviceResults,
  TelehealthEnvelope,
  TelehealthMutationData,
  TelehealthJoinGrantData,
  TelehealthQueueData,
  TelehealthSettingsData,
  TelehealthSettingsDraft,
  TelehealthVisit,
} from "./types";

export const requestKey = () => crypto.randomUUID();

export function loadTelehealthQueue(
  query: URLSearchParams,
  signal?: AbortSignal,
) {
  const suffix = query.size ? `?${query.toString()}` : "";
  return api<TelehealthEnvelope<TelehealthQueueData>>(
    `/api/clinic/telehealth/visits${suffix}`,
    { signal },
  );
}

export function loadVisit(visitId: string, signal?: AbortSignal) {
  return api<TelehealthEnvelope<TelehealthVisit>>(
    `/api/clinic/telehealth/visits/${encodeURIComponent(visitId)}`,
    { signal },
  );
}

export function loadPatientVisit(visitId: string, signal?: AbortSignal) {
  return api<TelehealthEnvelope<TelehealthVisit>>(
    `/api/patient_portal/telehealth/visits/${encodeURIComponent(visitId)}`,
    { signal },
  );
}

function staffMutation(
  visitId: string,
  action: string,
  expectedVersion: number,
  fields: Record<string, unknown> = {},
  key: string = requestKey(),
) {
  return api<TelehealthEnvelope<TelehealthMutationData>>(
    `/api/clinic/telehealth/visits/${encodeURIComponent(visitId)}/${action}`,
    {
      method: "POST",
      body: { request_key: key, expected_version: expectedVersion, ...fields },
    },
  );
}

function patientMutation(
  visitId: string,
  action: string,
  expectedVersion: number,
  fields: Record<string, unknown> = {},
  key: string = requestKey(),
) {
  return api<TelehealthEnvelope<TelehealthMutationData>>(
    `/api/patient_portal/telehealth/visits/${encodeURIComponent(visitId)}/${action}`,
    {
      method: "POST",
      body: { request_key: key, expected_version: expectedVersion, ...fields },
    },
  );
}

export const startEncounter = (
  visitId: string,
  expectedVersion: number,
  key?: string,
) => staffMutation(visitId, "start_encounter", expectedVersion, {}, key);
export const verifyPreparation = (
  visitId: string,
  expectedVersion: number,
  checkinId: string | number,
  key?: string,
) =>
  staffMutation(
    visitId,
    "verify_preparation",
    expectedVersion,
    { checkin_id: checkinId },
    key,
  );
export const prepareRoom = (
  visitId: string,
  expectedVersion: number,
  key?: string,
) => staffMutation(visitId, "prepare_room", expectedVersion, {}, key);
export const admitParticipant = (
  visitId: string,
  participantId: string,
  expectedVersion: number,
  key?: string,
) =>
  api<TelehealthEnvelope<TelehealthMutationData>>(
    `/api/clinic/telehealth/visits/${encodeURIComponent(visitId)}/participants/${encodeURIComponent(participantId)}/admit`,
    {
      method: "POST",
      body: {
        request_key: key ?? requestKey(),
        expected_version: expectedVersion,
      },
    },
  );
export const addParticipant = (
  visitId: string,
  expectedVersion: number,
  membershipId: number,
  key?: string,
) =>
  api<TelehealthEnvelope<TelehealthMutationData>>(
    `/api/clinic/telehealth/visits/${encodeURIComponent(visitId)}/participants`,
    {
      method: "POST",
      body: {
        request_key: key ?? requestKey(),
        expected_version: expectedVersion,
        membership_id: membershipId,
      },
    },
  );
export const removeParticipant = (
  visitId: string,
  participantId: string,
  expectedVersion: number,
  key?: string,
) =>
  api<TelehealthEnvelope<TelehealthMutationData>>(
    `/api/clinic/telehealth/visits/${encodeURIComponent(visitId)}/participants/${encodeURIComponent(participantId)}/remove`,
    {
      method: "POST",
      body: {
        request_key: key ?? requestKey(),
        expected_version: expectedVersion,
      },
    },
  );
export const requestStaffJoinGrant = (
  visitId: string,
  expectedVersion: number,
  key: string = requestKey(),
) =>
  api<TelehealthEnvelope<TelehealthJoinGrantData>>(
    `/api/clinic/telehealth/visits/${encodeURIComponent(visitId)}/join_grant`,
    {
      method: "POST",
      body: { request_key: key, expected_version: expectedVersion },
    },
  );
export const leaveStaffVisit = (
  visitId: string,
  expectedVersion: number,
  key?: string,
) => staffMutation(visitId, "leave", expectedVersion, {}, key);
export const endVisit = (
  visitId: string,
  expectedVersion: number,
  key?: string,
) => staffMutation(visitId, "end", expectedVersion, {}, key);
export const reconcileVisit = (
  visitId: string,
  expectedVersion: number,
  key?: string,
) => staffMutation(visitId, "reconcile", expectedVersion, {}, key);
export const extendVisit = (
  visitId: string,
  expectedVersion: number,
  key?: string,
) => staffMutation(visitId, "extend", expectedVersion, {}, key);
export const resumeVisit = (
  visitId: string,
  expectedVersion: number,
  key?: string,
) => staffMutation(visitId, "resume", expectedVersion, {}, key);

export type PatientCheckinInput = {
  location: TelehealthVisit["preparation"]["location"];
  callback_phone: string | null;
  location_attested: boolean;
  device_results: TelehealthDeviceResults;
};

export function submitCheckin(
  visitId: string,
  expectedVersion: number,
  checkin: PatientCheckinInput,
  key?: string,
) {
  return patientMutation(
    visitId,
    "checkins",
    expectedVersion,
    { checkin },
    key,
  );
}

export function recordConsent(
  visitId: string,
  expectedVersion: number,
  policyVersion: number,
  decision: "accepted" | "declined" | "withdrawn",
  key?: string,
) {
  return patientMutation(
    visitId,
    "consents",
    expectedVersion,
    { consent: { policy_version: policyVersion, decision } },
    key,
  );
}

export function enterWaitingRoom(
  visitId: string,
  expectedVersion: number,
  policyVersion: number,
  key?: string,
) {
  return patientMutation(
    visitId,
    "enter_waiting_room",
    expectedVersion,
    { consent: { policy_version: policyVersion, decision: "accepted" } },
    key,
  );
}

export const requestPatientJoinGrant = (
  visitId: string,
  expectedVersion: number,
  key: string = requestKey(),
) =>
  api<TelehealthEnvelope<TelehealthJoinGrantData>>(
    `/api/patient_portal/telehealth/visits/${encodeURIComponent(visitId)}/join_grant`,
    {
      method: "POST",
      body: { request_key: key, expected_version: expectedVersion },
    },
  );
export const leavePatientVisit = (
  visitId: string,
  expectedVersion: number,
  key?: string,
) => patientMutation(visitId, "leave", expectedVersion, {}, key);

export function recordPatientScribeConsent(
  visitId: string,
  expectedVersion: number,
  decision: "accepted" | "declined" | "withdrawn",
  key: string = requestKey(),
) {
  return api<TelehealthEnvelope<TelehealthMutationData>>(
    `/api/patient_portal/telehealth/visits/${encodeURIComponent(visitId)}/scribe_consent`,
    {
      method: "POST",
      body: {
        consent: {
          decision,
          request_key: key,
          expected_version: expectedVersion,
        },
      },
    },
  );
}

export function loadTelehealthSettings(signal?: AbortSignal) {
  return api<TelehealthEnvelope<TelehealthSettingsData>>(
    "/api/clinic/telehealth/settings",
    { signal },
  );
}

export function saveTelehealthSettingsDraft(
  expectedVersion: number,
  settings: Pick<TelehealthSettingsData, "provider_account_ref" | "enabled">,
  draft: TelehealthSettingsDraft,
  visitTypeRules: TelehealthSettingsData["visit_type_rules"],
  key: string = requestKey(),
) {
  return api<TelehealthEnvelope<TelehealthSettingsData>>(
    "/api/clinic/telehealth/settings/draft",
    {
      method: "PUT",
      body: {
        request_key: key,
        expected_version: expectedVersion,
        settings,
        policy: draft,
        visit_type_rules: visitTypeRules,
      },
    },
  );
}

export const publishTelehealthSettings = (
  expectedVersion: number,
  draftVersion: number,
  key: string = requestKey(),
) =>
  api<TelehealthEnvelope<TelehealthSettingsData>>(
    "/api/clinic/telehealth/settings/publish",
    {
      method: "POST",
      body: {
        request_key: key,
        expected_version: expectedVersion,
        draft_version: draftVersion,
      },
    },
  );
export const checkTelehealthConnection = (
  expectedVersion: number,
  key: string = requestKey(),
) =>
  api<TelehealthEnvelope<TelehealthSettingsData>>(
    "/api/clinic/telehealth/settings/check_connection",
    { method: "POST", body: { request_key: key } },
  );
export const disableNewTelehealthVisits = (
  expectedVersion: number,
  key: string = requestKey(),
) =>
  api<TelehealthEnvelope<TelehealthSettingsData>>(
    "/api/clinic/telehealth/settings/disable",
    {
      method: "POST",
      body: { request_key: key, expected_version: expectedVersion },
    },
  );

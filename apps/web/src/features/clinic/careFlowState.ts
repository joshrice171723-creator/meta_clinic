// Pure care-flow projections, request ownership, and recoverable draft contracts.
import type {
  Clinician,
  ClinicWorkspaceContext,
  EncounterCompletionReview,
  EncounterDetail,
  EncounterNote,
  FacilitySite,
  NoteTemplate,
  Observation,
  Patient,
  SoapNoteSections,
  VisitType,
} from "../../api/contracts";
import { ApiError } from "../../api/client";
import { type VisitModality } from "./TelehealthBookingFormat";
import {
  composeHistoryOfPresentIllness,
  splitHistoryOfPresentIllness,
} from "./HistoryOfPresentIllness";
import { patientReferenceLabel } from "./patientReference";

export function patientDisplayLabel(
  patient?: Pick<Patient, "display_name" | "reference"> | null,
) {
  const name = patient?.display_name ?? "Patient";
  const reference = patientReferenceLabel(patient?.reference);
  return reference ? `${name} · ${reference}` : name;
}

export function encounterDetailPath(
  patientId: string | number,
  encounterId: string | number,
) {
  return `/api/clinic/encounters/${encodeURIComponent(String(encounterId))}?patient_id=${encodeURIComponent(String(patientId))}`;
}

export type BookingDraft = {
  visitModality?: VisitModality;
  patientId: string;
  startsAt: string;
  endsAt: string;
  durationMinutes?: number;
  endTimeEdited?: boolean;
  siteId: string;
  roomId: string;
  clinicianId: string;
  visitTypeId: string;
  serviceOfferingId?: string;
  reason?: string;
  overbookReason?: string;
  overbookRequested?: boolean;
  walkInReason?: string;
  walkInRequested?: boolean;
  repeat?: "none" | "weekly";
  repeatIntervalWeeks?: number;
  repeatCount?: number;
  seriesResolutions?: SeriesResolution[];
};

export type SeriesResolution = {
  sequence: number;
  starts_at?: string;
  room_id?: number;
  change_reason?: string;
  skip_reason?: string;
};

export type SeriesPreviewRow = {
  sequence: number;
  original_date: string;
  state: "booked" | "skipped";
  starts_at: string | null;
  ends_at: string | null;
  conflict: string | null;
  skip_reason: string | null;
};

export type SeriesAttempt = {
  body: {
    series: {
      patient_id: string;
      site_id: string;
      room_id: string;
      booked_clinician_id: string;
      visit_type_id: string;
      service_offering_id?: string;
      starts_at: string;
      ends_at: string;
      visit_modality: VisitModality;
      interval_weeks: number;
      occurrence_count: number;
      expected_policy_revision: number;
      resolutions: SeriesResolution[];
      reason: string;
      request_key: string;
    };
  };
};

export type BookingClinician = Clinician & {
  display_name?: string | null;
};

export type BookingServiceOffering = {
  id: number;
  name: string;
  code: string | null;
  visit_type_id: number | null;
  duration_minutes: number | null;
  modality: "in_person" | "video" | "either";
  requires_room: boolean;
  status: "draft" | "published" | "retired";
  eligible_site_ids: number[];
  available_site_ids?: number[];
  eligible_clinician_ids: number[];
};

export function offeringEligibilityIssue(
  offering: BookingServiceOffering,
  siteId: string,
  clinicianId: string,
  visitTypeId: string,
  visitModality: VisitModality,
  roomId: string,
  startsAt: string,
  endsAt: string,
): string | null {
  if (offering.status !== "published")
    return "This service offering is no longer published. Choose another offering or use visit-type booking.";
  if (!offering.eligible_site_ids.includes(Number(siteId)))
    return "This service offering is unavailable at the selected site.";
  if (
    offering.eligible_clinician_ids.length > 0 &&
    !offering.eligible_clinician_ids.includes(Number(clinicianId))
  )
    return "The selected clinician is not eligible for this service offering.";
  if (offering.visit_type_id !== Number(visitTypeId))
    return "Choose the visit type configured for this service offering.";
  if (offering.modality !== "either" && offering.modality !== visitModality)
    return "This service offering does not support the selected visit format.";
  if (offering.requires_room && visitModality === "in_person" && !roomId)
    return "Choose a room for this service offering.";
  const minutes =
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000;
  if (minutes !== offering.duration_minutes)
    return `This service offering requires a ${offering.duration_minutes}-minute appointment.`;
  return null;
}

export type BookingAttempt = {
  body: {
    appointment: {
      patient_id: string;
      starts_at: string;
      ends_at: string;
      site_id: string;
      room_id: string;
      booked_clinician_id: string | null;
      first_available?: boolean;
      visit_type_id: string;
      service_offering_id?: string;
      expected_resource_revision?: number;
      schedule_hold_id?: number;
      reason?: string;
      overbook_reason?: string;
      walk_in?: boolean;
      capacity_override_reason?: string;
      expected_policy_revision?: number;
      request_key: string;
      visit_modality?: VisitModality;
    };
  };
};

export type HoldAttempt = {
  body: {
    hold: {
      request_key: string;
      patient_id: string;
      site_id: string;
      clinician_id: string;
      room_id: string;
      starts_at: string;
      ends_at: string;
      expires_at: string;
    };
  };
};

export const FIRST_AVAILABLE_CLINICIAN = "first_available";

export type AppointmentWorkingDraft = {
  draft: BookingDraft;
  attempt: BookingAttempt | null;
  outcomeUnconfirmed: boolean;
  holdAttempt?: HoldAttempt | null;
  holdOutcomeUnconfirmed?: boolean;
  seriesAttempt?: SeriesAttempt | null;
  seriesOutcomeUnconfirmed?: boolean;
};

export function appointmentDraftRecoveryMessage(
  draft: AppointmentWorkingDraft | null,
  updatedAt?: string | null,
): string | null {
  if (
    !draft ||
    draft.attempt ||
    draft.outcomeUnconfirmed ||
    draft.holdAttempt ||
    draft.holdOutcomeUnconfirmed ||
    draft.seriesAttempt ||
    draft.seriesOutcomeUnconfirmed
  )
    return null;
  const age = updatedAt ? Date.now() - Date.parse(updatedAt) : Number.NaN;
  const stale = Number.isFinite(age) && age >= 24 * 60 * 60 * 1_000;
  return stale
    ? `Recovered stale appointment draft saved ${new Date(updatedAt!).toLocaleString()}. Review its patient, time, and scheduling details before scheduling, or start a new appointment.`
    : "Recovered appointment draft: review its patient, time, and scheduling details before scheduling, or start a new appointment to clear it.";
}

/**
 * Patient Flow owns the patient context for a selected scheduling handoff.
 * A recovered working copy may contain older editable values, but it must not
 * replace the patient selected by the current workflow. An uncertain attempt
 * for another patient is unsafe to retry, so it is discarded while the other
 * draft fields remain recoverable.
 */
export function bindBookingPatient(
  draft: BookingDraft,
  attempt: BookingAttempt | null,
  outcomeUnconfirmed: boolean,
  patientId?: number,
) {
  if (!patientId) {
    return { draft, attempt, outcomeUnconfirmed };
  }
  const attemptedPatientId = attempt
    ? Number(attempt.body.appointment.patient_id)
    : null;
  const attemptMatches =
    attemptedPatientId === null || attemptedPatientId === patientId;
  return {
    draft: { ...draft, patientId: String(patientId) },
    attempt: attemptMatches ? attempt : null,
    outcomeUnconfirmed: attemptMatches ? outcomeUnconfirmed : false,
  };
}

export function bookingDraftHasChanges(
  draft: BookingDraft,
  baseline: BookingDraft,
) {
  return (Object.keys(baseline) as Array<keyof BookingDraft>).some((field) =>
    field === "seriesResolutions"
      ? JSON.stringify(draft.seriesResolutions ?? []) !==
        JSON.stringify(baseline.seriesResolutions ?? [])
      : draft[field] !== baseline[field],
  );
}

export function operationReceiptPath(requestKey: string) {
  return `/api/clinic/operation_receipts/${encodeURIComponent(requestKey)}`;
}

export function closeRequestKey(
  current: string | null,
  create: () => string = () => crypto.randomUUID(),
) {
  return current ?? create();
}

export const noteSaveRequestKey = closeRequestKey;

export function noteSaveRequestBody(
  operationCode: "notes.create" | "notes.revise" | "notes.correct",
  fields: Record<string, unknown>,
  requestKey: string,
  expectedRevision?: number,
  correction?: {
    reason: string;
    expectedRevisionId: number;
    expectedRevision: number;
  },
) {
  return operationCode === "notes.create"
    ? {
        encounter_note: {
          note_kind: "soap",
          ...fields,
          request_key: requestKey,
        },
      }
    : operationCode === "notes.revise"
      ? {
          revision: {
            ...fields,
            expected_revision: expectedRevision,
            request_key: requestKey,
          },
        }
      : {
          correction: {
            ...fields,
            reason: correction?.reason,
            expected_revision_id: correction?.expectedRevisionId,
            expected_revision: correction?.expectedRevision,
            request_key: requestKey,
          },
        };
}

export type EncounterCompletionInput = {
  disposition_code: EncounterCompletionReview["disposition_code"];
  instructions_status: EncounterCompletionReview["instructions_status"];
  education_status: EncounterCompletionReview["education_status"];
  follow_up_id: number;
  follow_up_version: number;
  expected_follow_up_state: EncounterCompletionReview["follow_up_state"];
  instruction_note_revision_id: number | null;
  expected_education_event_ids: number[];
  expected_open_task_versions: string[];
  open_work_reviewed: boolean;
  exception_note: string | null;
};

export function closeRequestBody(
  patientId: number,
  requestKey: string,
  completion: EncounterCompletionInput,
) {
  return {
    close: { patient_id: patientId, request_key: requestKey, ...completion },
  };
}

export function closeFailureState(
  status?: number,
  message = "",
  code?: string,
) {
  return status === undefined ||
    status >= 500 ||
    code === "outcome_unconfirmed" ||
    (status === 409 && /outcome is unconfirmed/i.test(message))
    ? "outcome_unconfirmed"
    : "rejected";
}

export function receiptResolution(
  status: number,
  outcome?: string,
): "committed" | "outcome_unconfirmed" | "not_found" {
  if (status === 404) return "not_found";
  return outcome === "committed" ? "committed" : "outcome_unconfirmed";
}

export function encounterCloseMatches(
  value: EncounterDetail,
  patientId: number,
  encounterId: number,
) {
  return (
    value.id === encounterId &&
    value.patient_id === patientId &&
    value.status === "completed"
  );
}

export function noteSaveMatches(
  value: EncounterNote,
  patientId: number,
  encounterId: number,
  noteId: number,
  expectedRevision: number,
) {
  return (
    value.id === noteId &&
    value.patient_id === patientId &&
    value.encounter_id === encounterId &&
    value.note_kind === "soap" &&
    value.current_revision?.revision_no === expectedRevision
  );
}

export function encounterNoteRefreshMatches(
  value: EncounterDetail,
  patientId: number,
  encounterId: number,
  noteId: number,
) {
  return (
    value.id === encounterId &&
    value.patient_id === patientId &&
    value.note_ids.includes(noteId)
  );
}

export function encounterHasSignedSoapNote(encounter: EncounterDetail) {
  return encounter.notes.some(
    (note) =>
      note.note_kind === "soap" &&
      (note.current_revision_signed ?? note.signed),
  );
}

export function noteReceiptMatches(
  receipt: OperationReceipt,
  operationCode: "notes.create" | "notes.revise" | "notes.correct",
  resourceId: number,
) {
  return (
    receipt.operation_code === operationCode &&
    receipt.resource_id === resourceId
  );
}

export function noteReconciliationMatches(
  value: EncounterNote,
  patientId: number,
  encounterId: number,
  noteId: number,
  expectedRevision: number,
) {
  return (
    noteSaveMatches(value, patientId, encounterId, noteId, expectedRevision) &&
    !value.current_revision?.signed &&
    Boolean(value.current_revision?.body)
  );
}

export type OperationReceipt = {
  operation_code: string;
  outcome: "committed" | "outcome_unconfirmed";
  resource_id: number | null;
};

export function clinicDateTime(value: string | null, timezone: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "Not recorded";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return "Not recorded";
  }
}

export function siteLabel(
  context: ClinicWorkspaceContext,
  siteId: number | null,
) {
  if (siteId === null) return "Site not assigned";
  return (
    context.sites.find((site) => site.id === siteId)?.code ?? "Assigned site"
  );
}

export function statusLabel(value: string) {
  return value
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function chartStateLabel(
  signed: boolean,
  confirmed: boolean,
  existing = false,
) {
  if (signed) return "Signed";
  return confirmed || existing ? "In progress" : "Not started";
}

export function patientAge(
  dateOfBirth: string | null | undefined,
  asOf: string | null,
) {
  if (!dateOfBirth || !asOf) return "Not recorded";
  const birth = new Date(dateOfBirth);
  const date = new Date(asOf);
  if (!Number.isFinite(birth.valueOf()) || !Number.isFinite(date.valueOf()))
    return "Not recorded";
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    date.getUTCMonth() < birth.getUTCMonth() ||
    (date.getUTCMonth() === birth.getUTCMonth() &&
      date.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? String(age) : "Not recorded";
}

export function patientSexLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    female: "Female",
    male: "Male",
    intersex: "Intersex",
    unknown: "Unknown",
    not_recorded: "Not recorded",
  };
  return labels[value ?? ""] ?? "Not recorded";
}

export function observationByLabel(
  observations: Observation[],
  pattern: RegExp,
) {
  const match = observations.find(
    (observation) =>
      observation.value_kind !== "group" &&
      pattern.test(observationLabel(observation.code)),
  );
  return match ? observationValue(match) : "Not recorded";
}

export function bloodPressureValue(observations: Observation[]) {
  const systolic = observations.find(
    (observation) =>
      observation.code === "vital-systolic-bp" &&
      observation.value_kind === "numeric",
  );
  if (!systolic) return observationByLabel(observations, /blood\s*pressure/i);
  const diastolic = observations.find(
    (observation) =>
      observation.code === "vital-diastolic-bp" &&
      observation.value_kind === "numeric" &&
      observation.code_system === systolic.code_system &&
      observation.unit_code === systolic.unit_code &&
      (systolic.parent_observation_id !== null
        ? observation.parent_observation_id === systolic.parent_observation_id
        : observation.parent_observation_id === null &&
          observation.observed_at === systolic.observed_at),
  );
  return diastolic
    ? `${systolic.numeric_value}/${diastolic.numeric_value} ${systolic.unit_label || systolic.unit_code || ""}`.trim()
    : "Paired reading not recorded";
}

export function localDateTimeValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function bookingTimePreview(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  const local = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const clinic = date.toLocaleTimeString([], {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const localDate = date.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const clinicDate = date.toLocaleDateString([], {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const datePrefix =
    localDate === clinicDate ? "" : `${localDate} → ${clinicDate} · `;
  return `${datePrefix}${local} your time → ${clinic} clinic time`;
}

export function clinicDateForBooking(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const fields = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    return `${fields.year}-${fields.month}-${fields.day}`;
  } catch {
    return null;
  }
}

export function appointmentDefaults(now = new Date()) {
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15);
  if (start <= now) start.setMinutes(start.getMinutes() + 15);
  const end = new Date(start.getTime() + 30 * 60_000);
  return {
    startsAt: localDateTimeValue(start),
    endsAt: localDateTimeValue(end),
  };
}

export function appointmentIntervalError(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (
    !startsAt ||
    !endsAt ||
    !Number.isFinite(start.valueOf()) ||
    !Number.isFinite(end.valueOf())
  )
    return "Choose a valid start and end time.";
  if (end <= start) return "End time must be after the start time.";
  if (end.getTime() - start.getTime() > 24 * 60 * 60_000)
    return "An appointment cannot be longer than 24 hours.";
  return "";
}

export function bookingDurationMinutes(
  startsAt: string,
  endsAt: string,
  savedDuration?: number,
) {
  if (
    typeof savedDuration === "number" &&
    Number.isFinite(savedDuration) &&
    savedDuration > 0 &&
    savedDuration <= 24 * 60
  )
    return savedDuration;
  const minutes = (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000;
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 24 * 60
    ? minutes
    : 30;
}

export function bookingEndTime(startsAt: string, minutes: number) {
  const start = new Date(startsAt);
  return Number.isFinite(start.valueOf())
    ? localDateTimeValue(new Date(start.getTime() + minutes * 60_000))
    : null;
}

export function statusColor(
  status: string,
): "default" | "success" | "warning" | "error" | "info" {
  if (status === "confirmed" || status === "completed") return "success";
  if (status === "cancelled" || status === "no_show") return "error";
  if (status === "scheduled") return "info";
  return "default";
}

export function bookingAvailability(
  capabilities: Pick<
    ClinicWorkspaceContext["capabilities"],
    "appointments" | "appointments_book" | "appointments_read"
  >,
) {
  const atomicBooking =
    capabilities.appointments_book === true &&
    capabilities.appointments_read === true;
  return {
    visible: capabilities.appointments === true || atomicBooking,
    identityLookup: atomicBooking && capabilities.appointments !== true,
  };
}

export function bookingContextDefaults(
  sites: Pick<FacilitySite, "id">[],
  visitTypes: VisitType[],
  currentSiteId?: number,
) {
  const site =
    currentSiteId !== undefined
      ? sites.find((item) => item.id === currentSiteId)
      : sites.length === 1
        ? sites[0]
        : undefined;
  const activeVisitTypes = visitTypes.filter((type) => !type.retired_at);
  return {
    siteId: site ? String(site.id) : "",
    visitTypeId:
      activeVisitTypes.length === 1 ? String(activeVisitTypes[0].id) : "",
  };
}

export function observationValue(observation: Observation) {
  switch (observation.value_kind) {
    case "numeric":
      return [
        observation.numeric_value,
        observation.unit_label || observation.unit_code,
      ]
        .filter(Boolean)
        .join(" ");
    case "text":
      return observation.text_value || "Not recorded";
    case "coded":
      return observation.coded_value || "Not recorded";
    case "missing":
      return observation.missing_reason
        ? `Missing: ${observation.missing_reason}`
        : "Missing value";
    case "group":
      return "Grouped observation";
  }
}

export function observationLabel(code: string) {
  return code
    .replace(/^vital[-_]/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const EMPTY_SOAP_SECTIONS: SoapNoteSections = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};
export const SOAP_SECTION_LABELS: [keyof SoapNoteSections, string][] = [
  ["subjective", "Subjective"],
  ["objective", "Objective"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
];

export function voidChartValidation(reason: string, acknowledged: boolean) {
  if (!reason.trim() || !acknowledged)
    return "Enter a reason and acknowledge the displayed patient and visit before voiding this chart.";
  return "";
}

export function hasSoapContent(sections: SoapNoteSections) {
  return Object.values(sections).some((value) => value.trim().length > 0);
}

export type NoteSaveState =
  | "idle"
  | "saving"
  | "reconciling"
  | "outcome_unconfirmed"
  | "not_found"
  | "rejected";

export function noteSaveAllowsMutation(state: NoteSaveState) {
  return state === "idle";
}

export function noteSaveFailureState(status?: number, message = "") {
  return status === undefined ||
    status >= 500 ||
    (status === 409 && /outcome is unconfirmed/i.test(message))
    ? "outcome_unconfirmed"
    : "rejected";
}

export type NoteSaveAttempt = {
  requestKey: string;
  operationCode: "notes.create" | "notes.revise" | "notes.correct";
  noteId: number | null;
  expectedRevision: number;
  endpoint: string;
  body: Record<string, unknown>;
};

export type CorrectionTarget = {
  revisionId: number;
  revisionNo: number;
  reason: string;
};

export type SoapEditorBaseline = {
  noteId: number | null;
  revisionId: number | null;
  revisionNo: number | null;
  sections: SoapNoteSections;
  patientInstructions: string;
  sessionDurationMinutes: number | null;
  template: { id: string; version: number } | null;
};

export type SoapWorkingDraft = {
  schema_version: 1;
  patient_id: number;
  encounter_id: number;
  baseline: SoapEditorBaseline;
  sections: SoapNoteSections;
  patient_instructions: string;
  session_duration_minutes?: number | null;
  applied_template: { id: string; version: number } | null;
  correction_target: CorrectionTarget | null;
  pending_attempt: NoteSaveAttempt | null;
};

export function validSoapSections(value: unknown): value is SoapNoteSections {
  if (!value || typeof value !== "object") return false;
  const sections = value as Record<string, unknown>;
  return SOAP_SECTION_LABELS.every(
    ([key]) => typeof sections[key] === "string",
  );
}

export function validSessionDuration(
  value: unknown,
): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 1440)
  );
}

export function noteAttemptMatchesContext(
  attempt: NoteSaveAttempt,
  baseline: SoapEditorBaseline,
  encounterId: number,
) {
  const expectedEndpoint =
    attempt.operationCode === "notes.create"
      ? `/api/clinic/encounters/${encounterId}/notes`
      : attempt.operationCode === "notes.correct"
        ? `/api/clinic/notes/${baseline.noteId}/corrections`
        : `/api/clinic/notes/${baseline.noteId}/revisions`;
  const root =
    attempt.operationCode === "notes.create"
      ? "encounter_note"
      : attempt.operationCode === "notes.correct"
        ? "correction"
        : "revision";
  const input = attempt.body?.[root];
  return (
    attempt.endpoint === expectedEndpoint &&
    typeof attempt.requestKey === "string" &&
    typeof input === "object" &&
    input !== null &&
    (input as Record<string, unknown>).request_key === attempt.requestKey
  );
}

export class NoteReconciliationError extends Error {}

export function isUnknownNoteSaveError(caught: unknown) {
  return (
    caught instanceof NoteReconciliationError ||
    !(caught instanceof ApiError) ||
    noteSaveFailureState(caught.status, caught.message) ===
      "outcome_unconfirmed"
  );
}

export function templateWouldOverwrite(
  sections: SoapNoteSections,
  template: NoteTemplate,
) {
  return SOAP_SECTION_LABELS.some(
    ([key]) =>
      Boolean(sections[key].trim()) &&
      Boolean(template.sections[key].trim()) &&
      sections[key] !== template.sections[key],
  );
}

export function hasTemplatePrompts(template: NoteTemplate) {
  return SOAP_SECTION_LABELS.some(([key]) => template.sections[key].trim());
}

export function applySoapTemplate(
  sections: SoapNoteSections,
  template: NoteTemplate,
): SoapNoteSections {
  const next = Object.fromEntries(
    SOAP_SECTION_LABELS.map(([key]) => [
      key,
      template.sections[key].trim() ? template.sections[key] : sections[key],
    ]),
  ) as SoapNoteSections;
  if (template.sections.subjective.trim()) {
    const documented = splitHistoryOfPresentIllness(sections.subjective);
    next.subjective = composeHistoryOfPresentIllness(
      template.sections.subjective,
      documented.hpi,
      documented.selections,
    );
  }
  return next;
}

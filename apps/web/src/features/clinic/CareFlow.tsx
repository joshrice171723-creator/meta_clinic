import type {
  Appointment,
  Clinician,
  ClinicWorkspaceContext,
  Encounter,
  EncounterCompletionResponse,
  EncounterCompletionReview,
  EncounterDetail,
  EncounterNote,
  FacilityRoom,
  FacilitySite,
  NoteTemplate,
  Observation,
  Pagination as PageInfo,
  PatientCareSummary,
  Patient,
  SoapNoteSections,
  VisitType,
} from "../../api/contracts";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, currentLoginDestination } from "../../api/client";
import { businessNow } from "../../shared/businessDate";
import {
  TelehealthBookingFormat,
  type VisitModality,
} from "./TelehealthBookingFormat";
import {
  Alert,
  Box,
  Button,
  Card as MuiCard,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  Link,
  MenuItem,
  Pagination as MuiPagination,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Card, ErrorMessage, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { CareIndicators, type CareSummaryLoadState } from "./CareIndicators";
import { useClinicNavigation } from "./clinicNavigation";
import { ReviewOfSystems } from "./ReviewOfSystems";
import { HistoryOfPresentIllness } from "./HistoryOfPresentIllness";
import { appendPrevisitNote, PrevisitNoteImport } from "./PrevisitNoteImport";
import { VisitInstructionHandout } from "../../shared/VisitInstructionHandout";
import { PatientClinicalHistory } from "./PatientClinicalHistory";
import { patientReferenceLabel } from "./patientReference";
import { PatientLabReports } from "./PatientLabReports";
import { MedicationAdministrations } from "./MedicationAdministrations";
import { EncounterNoteSigning } from "./EncounterNoteSigning";
import { useWorkingDraft } from "./useWorkingDraft";
import { EncounterFollowUpPanel } from "./EncounterFollowUp";
import { NurseEncounterWorkspace } from "./NurseEncounterWorkspace";
import { PatientEducationPanel } from "./PatientEducationPanel";
import { ClinicalPlanWorkspace } from "./ClinicalPlanWorkspace";
import { ClinicSchedule, type CalendarBooking } from "./ClinicSchedule";
import { BookingPatientPicker } from "./BookingPatientPicker";

function patientDisplayLabel(
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

type BookingDraft = {
  visitModality?: VisitModality;
  patientId: string;
  startsAt: string;
  endsAt: string;
  siteId: string;
  roomId: string;
  clinicianId: string;
  visitTypeId: string;
  reason?: string;
};

type BookingClinician = Clinician & {
  display_name?: string | null;
};

type BookingAttempt = {
  body: {
    appointment: {
      patient_id: string;
      starts_at: string;
      ends_at: string;
      site_id: string;
      room_id: string;
      booked_clinician_id: string;
      visit_type_id: string;
      reason?: string;
      request_key: string;
      visit_modality?: VisitModality;
    };
  };
};

type AppointmentWorkingDraft = {
  draft: BookingDraft;
  attempt: BookingAttempt | null;
  outcomeUnconfirmed: boolean;
};

export function appointmentDraftRecoveryMessage(
  draft: AppointmentWorkingDraft | null,
): string | null {
  if (!draft || draft.attempt || draft.outcomeUnconfirmed) return null;
  return "Recovered appointment draft: its patient, time, and scheduling details are from your earlier work. Review them before scheduling, or start a new appointment to clear this saved draft.";
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
  return (Object.keys(baseline) as Array<keyof BookingDraft>).some(
    (field) => draft[field] !== baseline[field],
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

type EncounterCompletionInput = {
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

type OperationReceipt = {
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

function siteLabel(context: ClinicWorkspaceContext, siteId: number | null) {
  if (siteId === null) return "Site not assigned";
  return (
    context.sites.find((site) => site.id === siteId)?.code ?? "Assigned site"
  );
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function chartStateLabel(
  signed: boolean,
  confirmed: boolean,
  existing = false,
) {
  if (signed) return "Signed";
  return confirmed || existing ? "In progress" : "Not started";
}

function patientAge(
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

function patientSexLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    female: "Female",
    male: "Male",
    intersex: "Intersex",
    unknown: "Unknown",
    not_recorded: "Not recorded",
  };
  return labels[value ?? ""] ?? "Not recorded";
}

function observationByLabel(observations: Observation[], pattern: RegExp) {
  const match = observations.find(
    (observation) =>
      observation.value_kind !== "group" &&
      pattern.test(observationLabel(observation.code)),
  );
  return match ? observationValue(match) : "Not recorded";
}

function bloodPressureValue(observations: Observation[]) {
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

function localDateTimeValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function clinicDateForBooking(value: string, timezone: string) {
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

export function appointmentDefaults(now = businessNow()) {
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

function statusColor(
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

function BookingForm({
  timezone,
  onCreated,
  initialPatientId,
  initialVisitModality = "in_person",
  initialSlot,
}: {
  timezone: string;
  onCreated?: (appointment: Appointment) => void;
  identityLookup?: boolean;
  initialPatientId?: number;
  initialVisitModality?: VisitModality;
  initialSlot?: CalendarBooking;
}) {
  const workingDraft = useWorkingDraft<AppointmentWorkingDraft>({
    kind: "appointment",
    patientId: initialPatientId,
  });
  const preserved = useRef<AppointmentWorkingDraft | null | undefined>(
    undefined,
  );
  if (!workingDraft.ready && !workingDraft.error) return <LoadState />;
  return (
    <Stack spacing={1.5}>
      {workingDraft.error && (
        <Alert
          severity="warning"
          action={<Button onClick={workingDraft.reload}>Retry recovery</Button>}
        >
          Saved scheduling draft could not be loaded. You can continue with a
          new appointment.
        </Alert>
      )}
      <BookingFormEditor
        timezone={timezone}
        onCreated={onCreated}
        initialPatientId={initialPatientId}
        initialVisitModality={initialVisitModality}
        initialSlot={initialSlot}
        initialDraft={
          preserved.current ??
          (workingDraft.ready ? workingDraft.restored : null)
        }
        workingDraft={workingDraft}
        onReloadDraft={(snapshot) => {
          preserved.current = snapshot;
          workingDraft.reload();
        }}
      />
    </Stack>
  );
}

function BookingFormEditor({
  timezone,
  onCreated,
  initialPatientId,
  initialVisitModality = "in_person",
  initialSlot,
  initialDraft,
  workingDraft,
  onReloadDraft,
}: {
  timezone: string;
  onCreated?: (appointment: Appointment) => void;
  initialPatientId?: number;
  initialVisitModality?: VisitModality;
  initialSlot?: CalendarBooking;
  initialDraft: AppointmentWorkingDraft | null;
  workingDraft: ReturnType<typeof useWorkingDraft<AppointmentWorkingDraft>>;
  onReloadDraft: (snapshot: AppointmentWorkingDraft) => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const clinic = useClinic();
  const defaultDraft = useMemo<BookingDraft>(() => {
    const defaults = appointmentDefaults();
    return {
      patientId: initialPatientId ? String(initialPatientId) : "",
      startsAt: initialSlot?.starts_at
        ? localDateTimeValue(new Date(initialSlot.starts_at))
        : defaults.startsAt,
      endsAt: initialSlot?.ends_at
        ? localDateTimeValue(new Date(initialSlot.ends_at))
        : defaults.endsAt,
      siteId: initialSlot ? String(initialSlot.site_id) : "",
      roomId: initialSlot?.room_id ? String(initialSlot.room_id) : "",
      clinicianId: initialSlot?.clinician_id
        ? String(initialSlot.clinician_id)
        : "",
      visitTypeId: "",
      reason: "",
      visitModality: initialVisitModality,
    };
  }, [initialPatientId, initialVisitModality, initialSlot]);
  const restoredDraft = initialDraft?.attempt
    ? initialDraft.draft
    : {
        ...(initialDraft?.draft ?? defaultDraft),
        ...(initialSlot
          ? {
              startsAt: defaultDraft.startsAt,
              endsAt: defaultDraft.endsAt,
              siteId: defaultDraft.siteId,
              roomId: defaultDraft.roomId,
              clinicianId: defaultDraft.clinicianId,
            }
          : {}),
      };
  const boundBooking = bindBookingPatient(
    restoredDraft,
    initialDraft?.attempt ?? null,
    Boolean(initialDraft?.attempt),
    initialPatientId,
  );
  const effectiveDraft = boundBooking.draft;
  const draftRecoveryMessage = appointmentDraftRecoveryMessage(initialDraft);
  const [baseline, setBaseline] = useState<BookingDraft>(defaultDraft);
  const [patientId, setPatientId] = useState(effectiveDraft.patientId);
  const [replacementPatientId, setReplacementPatientId] = useState<
    number | undefined
  >(effectiveDraft.patientId ? Number(effectiveDraft.patientId) : undefined);
  const [replacementPatient, setReplacementPatient] = useState<Patient>();
  const [replacementPatientError, setReplacementPatientError] = useState("");
  const [replacementPatientLoading, setReplacementPatientLoading] = useState(
    Boolean(effectiveDraft.patientId),
  );
  const [startsAt, setStartsAt] = useState(restoredDraft.startsAt);
  const [endsAt, setEndsAt] = useState(restoredDraft.endsAt);
  const [siteId, setSiteId] = useState(restoredDraft.siteId);
  const [roomId, setRoomId] = useState(restoredDraft.roomId);
  const [clinicianId, setClinicianId] = useState(restoredDraft.clinicianId);
  const [visitTypeId, setVisitTypeId] = useState(restoredDraft.visitTypeId);
  const [reason, setReason] = useState(restoredDraft.reason ?? "");
  const [visitModality, setVisitModality] = useState<VisitModality>(
    restoredDraft.visitModality ?? initialVisitModality,
  );
  const [busy, setBusy] = useState(false);
  const [bookingAttempt, setBookingAttempt] = useState<BookingAttempt | null>(
    boundBooking.attempt,
  );
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(
    boundBooking.outcomeUnconfirmed,
  );
  const [hasWorkingDraft, setHasWorkingDraft] = useState(Boolean(initialDraft));
  const autosaveTimer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const lastWorkingDraft = useRef<AppointmentWorkingDraft>(
    initialDraft
      ? {
          draft: effectiveDraft,
          attempt: boundBooking.attempt,
          outcomeUnconfirmed: boundBooking.outcomeUnconfirmed,
        }
      : {
          draft: effectiveDraft,
          attempt: null,
          outcomeUnconfirmed: false,
        },
  );
  const [patientQuery, setPatientQuery] = useState("");
  const [changingPatient, setChangingPatient] = useState(false);
  const deferredPatientQuery = useDeferredValue(patientQuery);
  const [submitError, setSubmitError] = useState("");
  const [created, setCreated] = useState<Appointment>();
  const resourceDate =
    clinicDateForBooking(startsAt, timezone) ??
    clinicDateForBooking(businessNow().toISOString(), timezone) ??
    "1970-01-01";
  const scheduledResourceParams = new URLSearchParams({
    date: resourceDate,
    per_page: "100",
  });
  if (siteId) scheduledResourceParams.set("site_id", siteId);
  if (clinicianId)
    scheduledResourceParams.set("booked_clinician_id", clinicianId);
  const currentDraft = useMemo<BookingDraft>(
    () => ({
      patientId,
      startsAt,
      endsAt,
      siteId,
      roomId,
      clinicianId,
      visitTypeId,
      reason,
      visitModality,
    }),
    [
      patientId,
      startsAt,
      endsAt,
      siteId,
      roomId,
      clinicianId,
      visitTypeId,
      reason,
      visitModality,
    ],
  );
  const draftChanged = bookingDraftHasChanges(currentDraft, baseline);
  const dirty = hasWorkingDraft || draftChanged;
  const patients = useResource<{ patients: Patient[] }>(
    `/api/clinic/patients/lookup?q=${encodeURIComponent(deferredPatientQuery.trim())}&per_page=25`,
    {
      enabled: deferredPatientQuery.trim().length > 0,
    },
  );
  const facilities = useResource<{ sites: FacilitySite[] }>(
    "/api/clinic/facilities?type=sites",
  );
  const rooms = useResource<{ rooms: FacilityRoom[] }>(
    "/api/clinic/facilities?type=rooms&per_page=100",
  );
  const clinicians = useResource<{ clinicians: BookingClinician[] }>(
    "/api/clinic/clinicians?per_page=100",
  );
  const visitTypes = useResource<{ visit_types: VisitType[] }>(
    "/api/clinic/facilities?type=visit_types&per_page=100",
  );
  const scheduledResources = useResource<{ appointments: Appointment[] }>(
    `/api/clinic/appointments?${scheduledResourceParams.toString()}`,
    { retainDataOnRefresh: true },
  );
  useEffect(() => {
    if (draftChanged) setHasWorkingDraft(true);
  }, [draftChanged]);
  useEffect(() => {
    if (!replacementPatientId) {
      setReplacementPatientError("");
      setReplacementPatientLoading(false);
      return;
    }
    const controller = new AbortController();
    setReplacementPatient(undefined);
    setReplacementPatientError("");
    setReplacementPatientLoading(true);
    api<{ patients: Patient[] }>(
      `/api/clinic/patients/lookup?id=${encodeURIComponent(String(replacementPatientId))}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const patient = result.patients.find(
          (candidate) => candidate.id === replacementPatientId,
        );
        if (!patient) {
          setReplacementPatientError(
            "The selected patient could not be verified. Choose a patient before scheduling.",
          );
          return;
        }
        setReplacementPatient(patient);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setReplacementPatientError(
          reason instanceof Error
            ? reason.message
            : "The selected patient could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setReplacementPatientLoading(false);
      });
    return () => controller.abort();
  }, [replacementPatientId]);
  useEffect(() => {
    if (!dirty || bookingAttempt || outcomeUnconfirmed || busy) return;
    const snapshot: AppointmentWorkingDraft = {
      draft: currentDraft,
      attempt: null,
      outcomeUnconfirmed: false,
    };
    lastWorkingDraft.current = snapshot;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = undefined;
      void workingDraft.save(snapshot);
    }, 500);
    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = undefined;
      }
    };
  }, [
    bookingAttempt,
    busy,
    currentDraft,
    dirty,
    outcomeUnconfirmed,
    workingDraft.save,
  ]);
  useEffect(() => {
    if ((!dirty && !outcomeUnconfirmed) || typeof window === "undefined")
      return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, outcomeUnconfirmed]);
  useEffect(
    () =>
      registerBlocker(
        outcomeUnconfirmed
          ? () =>
              "The scheduling outcome is unknown. Retry the exact request before leaving scheduling."
          : dirty
            ? () =>
                "This appointment draft has unsaved changes. Leave scheduling and discard them?"
            : null,
      ),
    [dirty, outcomeUnconfirmed, registerBlocker],
  );
  const resourceError =
    facilities.error || rooms.error || clinicians.error || visitTypes.error;
  if (!facilities.data || !rooms.data || !clinicians.data || !visitTypes.data)
    return <LoadState error={resourceError} />;
  const clearReplacementPatient = () => {
    setPatientId("");
    setReplacementPatientId(undefined);
    setReplacementPatient(undefined);
  };
  if (replacementPatientId && replacementPatientLoading) return <LoadState />;
  if (replacementPatientId && replacementPatientError)
    return (
      <Stack spacing={1.5}>
        <Alert severity="error">{replacementPatientError}</Alert>
        <Button
          onClick={clearReplacementPatient}
          sx={{ alignSelf: "flex-start" }}
        >
          Clear selected patient
        </Button>
      </Stack>
    );
  const selectablePatients = replacementPatient
    ? [
        replacementPatient,
        ...(patients.data?.patients ?? []).filter(
          (patient) => patient.id !== replacementPatient.id,
        ),
      ]
    : (patients.data?.patients ?? []);
  const selectedPatient = selectablePatients.find(
    (patient) => String(patient.id) === patientId,
  );
  const availableRooms = siteId
    ? rooms.data.rooms.filter((room) => room.site_id === Number(siteId))
    : [];
  const scheduledResourceAppointments =
    scheduledResources.data?.appointments.filter((appointment) => {
      if (!roomId && !clinicianId) return false;
      return (
        appointment.room_id === Number(roomId) ||
        appointment.booked_clinician_id === Number(clinicianId)
      );
    }) ?? [];
  const intervalError = appointmentIntervalError(startsAt, endsAt);
  const setDuration = (minutes: number) => {
    const start = new Date(startsAt);
    if (Number.isFinite(start.valueOf()))
      setEndsAt(
        localDateTimeValue(new Date(start.getTime() + minutes * 60_000)),
      );
  };
  const reset = () => {
    const next = appointmentDefaults();
    setBaseline({
      patientId: "",
      startsAt: next.startsAt,
      endsAt: next.endsAt,
      siteId: "",
      roomId: "",
      clinicianId: "",
      visitTypeId: "",
      reason: "",
      visitModality: "in_person",
    });
    setPatientId("");
    setReplacementPatientId(undefined);
    setStartsAt(next.startsAt);
    setReplacementPatient(undefined);
    setChangingPatient(false);
    setEndsAt(next.endsAt);
    setSiteId("");
    setRoomId("");
    setClinicianId("");
    setVisitTypeId("");
    setReason("");
    setVisitModality("in_person");
    setBookingAttempt(null);
    setOutcomeUnconfirmed(false);
    setHasWorkingDraft(false);
    setPatientQuery("");
  };
  const discard = async () => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = undefined;
    }
    if (!(await workingDraft.clear())) {
      setSubmitError(
        "The saved working copy could not be cleared. Retry before starting another appointment.",
      );
      return;
    }
    reset();
  };
  return (
    <MuiCard variant="outlined" sx={{ overflow: "visible" }}>
      <CardContent
        sx={{ p: { xs: 2, sm: 3 }, "&:last-child": { pb: { xs: 2, sm: 3 } } }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{ justifyContent: "space-between", gap: 1, mb: 3 }}
        >
          <Box>
            <Typography component="h2" variant="h5" sx={{ fontWeight: 700 }}>
              Schedule an appointment
            </Typography>
          </Box>
          <Chip label="Schedule only" size="small" variant="outlined" />
        </Stack>
        {clinicians.data.clinicians.length === 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No clinicians are configured for this clinic. Add a clinician in
            clinic setup before booking. Your selected patient and draft are
            preserved.
          </Alert>
        )}
        {draftRecoveryMessage && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => void discard()}
                disabled={busy}
              >
                Start new appointment
              </Button>
            }
          >
            {draftRecoveryMessage}
          </Alert>
        )}
        {created && (
          <Alert
            severity="success"
            sx={{ mb: 3 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => setCreated(undefined)}
              >
                Dismiss
              </Button>
            }
          >
            Appointment #{created.id} scheduled for{" "}
            {clinicDateTime(created.starts_at, timezone)}.
            {created.telehealth?.clinic_href && (
              <Button size="small" href={created.telehealth.clinic_href}>
                Open video visit
              </Button>
            )}
          </Alert>
        )}
        <Box
          component="form"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (inFlight.current) return;
            setSubmitError("");
            if (!bookingAttempt && changingPatient)
              return setSubmitError(
                "Choose a replacement patient or keep the current patient before scheduling.",
              );
            if (!bookingAttempt && !patientId)
              return setSubmitError("Select a patient before scheduling.");
            if (!bookingAttempt && intervalError)
              return setSubmitError(intervalError);
            if (!bookingAttempt && (!siteId || !clinicianId || !visitTypeId))
              return setSubmitError(
                "Choose a site, clinician, and visit type before scheduling.",
              );
            inFlight.current = true;
            if (autosaveTimer.current) {
              window.clearTimeout(autosaveTimer.current);
              autosaveTimer.current = undefined;
            }
            const attempt =
              bookingAttempt ??
              ({
                body: {
                  appointment: {
                    patient_id: patientId,
                    starts_at: new Date(startsAt).toISOString(),
                    ends_at: new Date(endsAt).toISOString(),
                    site_id: siteId,
                    room_id: visitModality === "video" ? "" : roomId,
                    booked_clinician_id: clinicianId,
                    visit_type_id: visitTypeId,
                    reason,
                    visit_modality: visitModality,
                    request_key: crypto.randomUUID(),
                  },
                },
              } satisfies BookingAttempt);
            const pendingDraft: AppointmentWorkingDraft = {
              draft: currentDraft,
              attempt,
              outcomeUnconfirmed: false,
            };
            lastWorkingDraft.current = pendingDraft;
            if (!(await workingDraft.save(pendingDraft))) {
              inFlight.current = false;
              setSubmitError(
                "The working copy could not be saved. Keep this page open and retry before scheduling.",
              );
              return;
            }
            setBookingAttempt(attempt);
            setBusy(true);
            try {
              const result = await api<{ appointment: Appointment }>(
                "/api/clinic/appointments",
                {
                  method: "POST",
                  body: attempt.body,
                },
              );
              if (!(await workingDraft.clear())) {
                setOutcomeUnconfirmed(true);
                setSubmitError(
                  "The appointment was scheduled, but its working copy could not be cleared. Retry the same request to finish recovery.",
                );
                return;
              }
              setCreated(result.appointment);
              reset();
              onCreated?.(result.appointment);
            } catch (reason) {
              const unknown =
                !(reason instanceof ApiError) ||
                reason.status === 408 ||
                reason.status >= 500 ||
                reason.code === "outcome_unconfirmed";
              setOutcomeUnconfirmed(unknown);
              if (unknown) {
                const unresolved = {
                  ...pendingDraft,
                  outcomeUnconfirmed: true,
                };
                lastWorkingDraft.current = unresolved;
                await workingDraft.save(unresolved);
              } else {
                setBookingAttempt(null);
                const editable = {
                  draft: currentDraft,
                  attempt: null,
                  outcomeUnconfirmed: false,
                };
                lastWorkingDraft.current = editable;
                await workingDraft.save(editable);
              }
              setSubmitError(
                unknown
                  ? "The scheduling outcome is unknown. Retry this exact request before editing or leaving scheduling."
                  : reason instanceof Error
                    ? reason.message
                    : "The appointment could not be scheduled.",
              );
            } finally {
              inFlight.current = false;
              setBusy(false);
            }
          }}
        >
          <Stack spacing={2.5}>
            <BookingPatientPicker
              patient={selectedPatient}
              editing={changingPatient}
              query={patientQuery}
              results={patients.data?.patients ?? []}
              loading={Boolean(
                deferredPatientQuery.trim() &&
                !patients.data &&
                !patients.error,
              )}
              error={patients.error}
              disabled={busy || outcomeUnconfirmed}
              onEditingChange={setChangingPatient}
              canReviewPatient={clinic.capabilities.patients === true}
              onQueryChange={setPatientQuery}
              onSelect={(selected) => {
                setPatientId(String(selected.id));
                setReplacementPatient(selected);
                setReplacementPatientId(undefined);
              }}
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 2,
              }}
            >
              <TextField
                label="Starts"
                type="datetime-local"
                required
                disabled={busy || outcomeUnconfirmed}
                value={startsAt}
                onChange={(event) => {
                  const value = event.target.value;
                  setStartsAt(value);
                  const start = new Date(value);
                  if (Number.isFinite(start.valueOf()))
                    setEndsAt(
                      localDateTimeValue(
                        new Date(start.getTime() + 30 * 60_000),
                      ),
                    );
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Ends"
                type="datetime-local"
                required
                disabled={busy || outcomeUnconfirmed}
                value={endsAt}
                error={Boolean(intervalError)}
                helperText={
                  intervalError || "End time must follow the start time."
                }
                onChange={(event) => setEndsAt(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}
            >
              <Typography variant="body2" color="text.secondary">
                Duration:
              </Typography>
              {[30, 45, 60].map((minutes) => (
                <Button
                  key={minutes}
                  size="small"
                  variant="outlined"
                  disabled={busy || outcomeUnconfirmed}
                  onClick={() => setDuration(minutes)}
                >
                  {minutes} min
                </Button>
              ))}
            </Stack>
            <Alert severity="info" variant="outlined">
              Enter times using this device’s timezone (
              {Intl.DateTimeFormat().resolvedOptions().timeZone || "local time"}
              ). Confirm the clinic time shown on the schedule in {timezone}
              before finishing.
            </Alert>
            <TelehealthBookingFormat
              value={visitModality}
              disabled={busy || outcomeUnconfirmed}
              canConfigure={clinic.capabilities.telehealth_configure === true}
              onChange={(format) => {
                setVisitModality(format);
                if (format === "video") setRoomId("");
              }}
            />
            <Typography variant="subtitle2">Appointment setup</Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 2,
              }}
            >
              <FormControl
                fullWidth
                required
                disabled={busy || outcomeUnconfirmed}
              >
                <InputLabel id="site-label">Site</InputLabel>
                <Select
                  labelId="site-label"
                  label="Site"
                  value={siteId}
                  onChange={(event) => {
                    setSiteId(event.target.value);
                    setRoomId("");
                  }}
                >
                  <MenuItem value="" disabled>
                    Select a site
                  </MenuItem>
                  {facilities.data.sites.map((site) => (
                    <MenuItem key={site.id} value={site.id.toString()}>
                      {site.code}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {visitModality !== "video" && (
                <FormControl
                  fullWidth
                  disabled={!siteId || busy || outcomeUnconfirmed}
                >
                  <InputLabel id="room-label">Room</InputLabel>
                  <Select
                    labelId="room-label"
                    label="Room"
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value)}
                  >
                    <MenuItem value="">No room yet</MenuItem>
                    {availableRooms.map((room) => (
                      <MenuItem key={room.id} value={room.id.toString()}>
                        {room.code}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControl
                fullWidth
                required
                disabled={busy || outcomeUnconfirmed}
              >
                <InputLabel id="clinician-label">Booked clinician</InputLabel>
                <Select
                  labelId="clinician-label"
                  label="Booked clinician"
                  value={clinicianId}
                  onChange={(event) => setClinicianId(event.target.value)}
                >
                  <MenuItem value="" disabled>
                    Select a clinician
                  </MenuItem>
                  {clinicians.data.clinicians.map((clinician) => (
                    <MenuItem
                      key={clinician.id}
                      value={clinician.id.toString()}
                    >
                      {clinician.display_name?.trim() ||
                        `Clinician profile #${clinician.id}`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl
                fullWidth
                required
                disabled={busy || outcomeUnconfirmed}
              >
                <InputLabel id="visit-type-label">Visit type</InputLabel>
                <Select
                  labelId="visit-type-label"
                  label="Visit type"
                  value={visitTypeId}
                  onChange={(event) => setVisitTypeId(event.target.value)}
                >
                  <MenuItem value="" disabled>
                    Select a visit type
                  </MenuItem>
                  {visitTypes.data.visit_types
                    .filter((type) => !type.retired_at)
                    .map((type) => (
                      <MenuItem key={type.id} value={type.id.toString()}>
                        {type.code}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Visit reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy || outcomeUnconfirmed}
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 500 } }}
                helperText="Optional scheduler-facing reason. It is saved with the appointment."
                sx={{ gridColumn: { md: "1 / -1" } }}
              />
              {(roomId || clinicianId) && (
                <Box sx={{ gridColumn: { md: "1 / -1" } }}>
                  {scheduledResources.error ? (
                    <Alert severity="warning">
                      Scheduled resource activity could not be loaded. The
                      booking check will still prevent a conflicting
                      appointment.
                    </Alert>
                  ) : !scheduledResources.data ? (
                    <Typography color="text.secondary" role="status">
                      Checking scheduled resource activity…
                    </Typography>
                  ) : scheduledResourceAppointments.length === 0 ? (
                    <Alert severity="success" variant="outlined">
                      No scheduled appointments use the selected resource on{" "}
                      {resourceDate}. Final availability is confirmed when you
                      schedule.
                    </Alert>
                  ) : (
                    <Alert severity="warning" variant="outlined">
                      <Typography component="div" variant="body2">
                        The selected resource is already scheduled on{" "}
                        {resourceDate}:
                      </Typography>
                      <Stack
                        component="ul"
                        spacing={0.25}
                        sx={{ m: 0, pl: 2.5 }}
                      >
                        {scheduledResourceAppointments.map((appointment) => (
                          <Typography
                            component="li"
                            key={appointment.id}
                            variant="body2"
                          >
                            {clinicDateTime(appointment.starts_at, timezone)}
                            {appointment.room_id === Number(roomId)
                              ? " · selected room"
                              : " · selected clinician"}
                          </Typography>
                        ))}
                      </Stack>
                      <Typography
                        component="div"
                        variant="body2"
                        sx={{ mt: 0.5 }}
                      >
                        Choose another time or resource before scheduling.
                      </Typography>
                    </Alert>
                  )}
                </Box>
              )}
            </Box>
            {submitError && (
              <Alert severity="error" role="alert">
                {submitError}
              </Alert>
            )}
            {workingDraft.status === "saving" && (
              <Typography role="status">Saving working copy…</Typography>
            )}
            {workingDraft.status === "saved" && dirty && (
              <Typography color="text.secondary" role="status">
                Working copy saved.
              </Typography>
            )}
            {(workingDraft.status === "error" ||
              workingDraft.status === "conflict") && (
              <Alert
                severity="error"
                action={
                  workingDraft.status === "error" ? (
                    <Button
                      color="inherit"
                      onClick={() =>
                        void workingDraft.save(lastWorkingDraft.current)
                      }
                    >
                      Retry working-copy save
                    </Button>
                  ) : (
                    <Button
                      color="inherit"
                      onClick={() => onReloadDraft(lastWorkingDraft.current)}
                    >
                      Reload version and keep my edits
                    </Button>
                  )
                }
              >
                {workingDraft.error}
              </Alert>
            )}
            <Divider />
            <Stack
              direction={{ xs: "column-reverse", sm: "row" }}
              spacing={1.5}
              sx={{ justifyContent: "flex-end" }}
            >
              <Button
                type="button"
                color="inherit"
                onClick={() => void discard()}
                disabled={busy || outcomeUnconfirmed}
              >
                {draftRecoveryMessage ? "Clear recovered draft" : "Clear"}
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={
                  busy ||
                  (!outcomeUnconfirmed && (!selectedPatient || changingPatient))
                }
                startIcon={
                  busy ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : undefined
                }
              >
                {busy
                  ? "Scheduling…"
                  : outcomeUnconfirmed
                    ? "Retry same request"
                    : "Schedule appointment"}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </CardContent>
    </MuiCard>
  );
}

export function ScheduleView({
  context,
  appointments,
  pagination,
  onAppointmentCreated,
  onPageChange,
  initialPatientId,
  initialVisitModality = "in_person",
}: {
  context: ClinicWorkspaceContext;
  appointments: Appointment[];
  pagination: PageInfo;
  onAppointmentCreated?: (appointment: Appointment) => void;
  onPageChange?: (page: number) => void;
  initialPatientId?: number;
  initialVisitModality?: VisitModality;
}) {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography color="text.secondary" variant="overline">
          PATIENT FLOW · SCHEDULED
        </Typography>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Typography component="h1" variant="h3">
            Schedule
          </Typography>
          <Link href="/clinic" data-clinic-view="tracking">
            Tracking board ↗
          </Link>
        </Stack>
      </Box>
      <Alert severity="info">
        Scheduled visits appear here after the clinic records them. A scheduled
        time is not an arrival or a place in the tracking-board queue.
      </Alert>
      {bookingAvailability(context.capabilities).visible && (
        <BookingForm
          key={`${initialPatientId ?? "new"}:${initialVisitModality}`}
          timezone={context.practice.timezone}
          identityLookup={
            bookingAvailability(context.capabilities).identityLookup
          }
          initialPatientId={initialPatientId}
          initialVisitModality={initialVisitModality}
          onCreated={onAppointmentCreated}
        />
      )}
      <MuiCard variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ justifyContent: "space-between", gap: 1, mb: 2 }}
          >
            <Box>
              <Typography component="h2" variant="h5" sx={{ fontWeight: 700 }}>
                Scheduled visits
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ordered by start time · {context.practice.timezone}
              </Typography>
            </Box>
            <Chip
              label={`${pagination.total} ${pagination.total === 1 ? "visit" : "visits"}`}
              variant="outlined"
            />
          </Stack>
          {appointments.length === 0 ? (
            <Alert severity="info">
              <strong>No scheduled visits were returned.</strong> This is not
              evidence that the clinic has no active visits.
            </Alert>
          ) : (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ maxWidth: "100%" }}
            >
              <Table aria-label="Scheduled visits" sx={{ minWidth: 760 }}>
                <TableHead>
                  <TableRow
                    sx={{
                      "& th": {
                        fontWeight: 700,
                        bgcolor: "background.default",
                      },
                    }}
                  >
                    <TableCell>When</TableCell>
                    <TableCell>Patient</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Record</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {appointments.map((appointment) => (
                    <TableRow key={appointment.id}>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>
                          {clinicDateTime(
                            appointment.starts_at,
                            context.practice.timezone,
                          )}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Ends{" "}
                          {clinicDateTime(
                            appointment.ends_at,
                            context.practice.timezone,
                          )}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {context.capabilities.patients ? (
                          <Link
                            href={`/clinic/patients/${appointment.patient_id}`}
                          >
                            {patientDisplayLabel(appointment.patient)}
                          </Link>
                        ) : (
                          <Typography color="text.secondary">
                            {patientDisplayLabel(appointment.patient)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography>
                          {siteLabel(context, appointment.site_id)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {appointment.visit_modality === "video"
                            ? "Video visit"
                            : appointment.room_id === null
                              ? "Room not assigned"
                              : `Room record #${appointment.room_id}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={statusLabel(appointment.status)}
                          color={statusColor(appointment.status)}
                          variant="outlined"
                          sx={{ textTransform: "capitalize" }}
                        />
                      </TableCell>
                      <TableCell>
                        {appointment.telehealth?.clinic_href && (
                          <Button
                            size="small"
                            href={appointment.telehealth.clinic_href}
                          >
                            Open video visit
                          </Button>
                        )}
                        {appointment.encounter_id === null ? (
                          <Typography color="text.secondary">
                            No encounter yet
                          </Typography>
                        ) : context.capabilities.patients ? (
                          <Link
                            href={`/clinic/patients/${appointment.patient_id}/encounters/${appointment.encounter_id}`}
                          >
                            Open encounter →
                          </Link>
                        ) : (
                          <Typography color="text.secondary">
                            Encounter record unavailable
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {pagination.total_pages > 1 && (
            <MuiPagination
              sx={{ mt: 2, display: "flex", justifyContent: "center" }}
              count={pagination.total_pages}
              page={pagination.page}
              onChange={(_, page) => onPageChange?.(page)}
              color="primary"
              aria-label="Scheduled visits pages"
            />
          )}
        </CardContent>
      </MuiCard>
    </Stack>
  );
}

export function Schedule({
  search = window.location.search,
}: { search?: string } = {}) {
  const context = useClinic();
  const replacementPatientId = Number(
    new URLSearchParams(search).get("patient_id"),
  );
  const initialPatientId =
    Number.isSafeInteger(replacementPatientId) && replacementPatientId > 0
      ? replacementPatientId
      : undefined;
  return (
    <ClinicSchedule
      key={initialPatientId ?? "schedule"}
      initialPatientId={initialPatientId}
      canBook={bookingAvailability(context.capabilities).visible}
      renderBooking={(slot, onCreated) => (
        <BookingForm
          timezone={context.practice.timezone}
          initialPatientId={initialPatientId}
          initialSlot={slot}
          initialVisitModality={
            new URLSearchParams(search).get("visit_modality") === "video"
              ? "video"
              : "in_person"
          }
          onCreated={onCreated}
        />
      )}
    />
  );
}

function EncounterHistory({ patientId }: { patientId: number }) {
  const timezone = useClinic().practice.timezone;
  const { data, error } = useResource<{
    encounters: Encounter[];
    pagination: PageInfo;
  }>(`/api/clinic/patients/${patientId}/encounters`);
  if (!data) return <LoadState error={error} />;
  return (
    <Card title="Encounter history">
      {data.encounters.length === 0 ? (
        <p>No encounters are recorded for this patient.</p>
      ) : (
        <ul className="care-record-list">
          {data.encounters.map((encounter) => (
            <li key={encounter.id}>
              <div>
                <strong>Encounter #{encounter.id}</strong>
                <span>{clinicDateTime(encounter.started_at, timezone)}</span>
              </div>
              <span className="care-status">
                {encounter.status === "open" ? "In progress" : "Completed"}
              </span>
              <a
                href={`/clinic/patients/${patientId}/encounters/${encounter.id}`}
              >
                Open →
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PatientSupport({ patientId }: { patientId: number }) {
  return <EncounterHistory patientId={patientId} />;
}

function observationValue(observation: Observation) {
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

function observationLabel(code: string) {
  return code
    .replace(/^vital[-_]/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const EMPTY_SOAP_SECTIONS: SoapNoteSections = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};
const SOAP_SECTION_LABELS: [keyof SoapNoteSections, string][] = [
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

type NoteSaveState =
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

type NoteSaveAttempt = {
  requestKey: string;
  operationCode: "notes.create" | "notes.revise" | "notes.correct";
  noteId: number | null;
  expectedRevision: number;
  endpoint: string;
  body: Record<string, unknown>;
};

type CorrectionTarget = {
  revisionId: number;
  revisionNo: number;
  reason: string;
};

type SoapEditorBaseline = {
  noteId: number | null;
  revisionId: number | null;
  revisionNo: number | null;
  sections: SoapNoteSections;
  patientInstructions: string;
  template: { id: string; version: number } | null;
};

type SoapWorkingDraft = {
  schema_version: 1;
  patient_id: number;
  encounter_id: number;
  baseline: SoapEditorBaseline;
  sections: SoapNoteSections;
  patient_instructions: string;
  applied_template: { id: string; version: number } | null;
  correction_target: CorrectionTarget | null;
  pending_attempt: NoteSaveAttempt | null;
};

function validSoapSections(value: unknown): value is SoapNoteSections {
  if (!value || typeof value !== "object") return false;
  const sections = value as Record<string, unknown>;
  return SOAP_SECTION_LABELS.every(
    ([key]) => typeof sections[key] === "string",
  );
}

function noteAttemptMatchesContext(
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

class NoteReconciliationError extends Error {}

function isUnknownNoteSaveError(caught: unknown) {
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

export function applySoapTemplate(
  sections: SoapNoteSections,
  template: NoteTemplate,
): SoapNoteSections {
  return Object.fromEntries(
    SOAP_SECTION_LABELS.map(([key]) => [
      key,
      template.sections[key].trim() ? template.sections[key] : sections[key],
    ]),
  ) as SoapNoteSections;
}

export function SoapNoteForm({
  encounterId,
  patientId,
  patientName,
  note,
  templates,
  canWrite,
  canSign = false,
  onCreated,
  onRefresh,
}: {
  encounterId: number;
  patientId?: number;
  patientName?: string;
  note?: EncounterNote;
  templates: NoteTemplate[];
  canWrite: boolean;
  canSign?: boolean;
  onCreated?: (note: EncounterNote) => void;
  onRefresh?: () => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const savedBody = note?.current_revision?.body;
  const workingDraft = useWorkingDraft<SoapWorkingDraft>({
    kind: "soap",
    patientId,
    encounterId,
    enabled: canWrite,
  });
  const initialBaseline = (): SoapEditorBaseline => ({
    noteId: note?.id ?? null,
    revisionId: note?.current_revision?.id ?? null,
    revisionNo: note?.current_revision?.revision_no ?? null,
    sections: savedBody?.sections ?? EMPTY_SOAP_SECTIONS,
    patientInstructions: savedBody?.patient_instructions ?? "",
    template: savedBody
      ? { id: savedBody.template_id, version: savedBody.template_version }
      : null,
  });
  const [baseline, setBaseline] = useState<SoapEditorBaseline>(initialBaseline);
  const [sections, setSections] = useState<SoapNoteSections>(baseline.sections);
  const [patientInstructions, setPatientInstructions] = useState(
    baseline.patientInstructions,
  );
  const [appliedTemplate, setAppliedTemplate] = useState<{
    id: string;
    version: number;
  } | null>(baseline.template);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id ?? "",
  );
  const [templateConfirmation, setTemplateConfirmation] =
    useState<NoteTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState<NoteSaveState>("idle");
  const [resetConfirmation, setResetConfirmation] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionConfirmed, setCorrectionConfirmed] = useState(false);
  const [correctionTarget, setCorrectionTarget] =
    useState<CorrectionTarget | null>(null);
  const [incomingNote, setIncomingNote] = useState<EncounterNote | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [replaceWorkingCopy, setReplaceWorkingCopy] = useState(false);
  const saveAttemptRef = useRef<NoteSaveAttempt | null>(null);
  const restoredDraft = useRef(false);
  const skipNextDraftSave = useRef(false);
  const draftSaveTimer = useRef<number | null>(null);
  const templateChanged =
    appliedTemplate?.id !== baseline.template?.id ||
    appliedTemplate?.version !== baseline.template?.version;
  const dirty =
    SOAP_SECTION_LABELS.some(
      ([key]) => sections[key] !== baseline.sections[key],
    ) ||
    patientInstructions !== baseline.patientInstructions ||
    templateChanged;
  const signed = note?.current_revision?.signed === true;
  const editorDisabled =
    busy ||
    !workingDraft.ready ||
    !noteSaveAllowsMutation(saveState) ||
    Boolean(incomingNote) ||
    (signed && !correctionTarget) ||
    !canWrite;
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null;

  const applyTemplate = (template: NoteTemplate) => {
    setSections((current) => applySoapTemplate(current, template));
    setAppliedTemplate({ id: template.id, version: template.version });
    setNotice(
      `${template.label} prompts were added. Review and replace every prompt with this encounter's recorded facts.`,
    );
  };

  const requestTemplateApplication = () => {
    if (!selectedTemplate || editorDisabled) return;
    if (templateWouldOverwrite(sections, selectedTemplate)) {
      setTemplateConfirmation(selectedTemplate);
      return;
    }
    applyTemplate(selectedTemplate);
  };
  const workingSnapshot = (
    pendingAttempt = saveAttemptRef.current,
  ): SoapWorkingDraft | null =>
    patientId == null
      ? null
      : {
          schema_version: 1,
          patient_id: patientId,
          encounter_id: encounterId,
          baseline,
          sections,
          patient_instructions: patientInstructions,
          applied_template: appliedTemplate,
          correction_target: correctionTarget,
          pending_attempt: pendingAttempt,
        };

  const cancelPendingDraftSave = () => {
    if (draftSaveTimer.current !== null) {
      window.clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = null;
    }
  };

  const reloadWorkingDraft = () => {
    cancelPendingDraftSave();
    setReplaceWorkingCopy(false);
    restoredDraft.current = false;
    workingDraft.reload();
  };

  const retryWorkingDraft = async () => {
    cancelPendingDraftSave();
    const snapshot = workingSnapshot();
    if (!snapshot || !(await workingDraft.save(snapshot)))
      setError(
        "The current working note is still only in this window. Keep it open and retry when the connection is available.",
      );
  };

  useEffect(() => {
    if (!workingDraft.ready || restoredDraft.current) return;
    restoredDraft.current = true;
    const restored = workingDraft.restored;
    if (
      !restored ||
      patientId == null ||
      restored.schema_version !== 1 ||
      restored.patient_id !== patientId ||
      restored.encounter_id !== encounterId ||
      !restored.baseline ||
      !validSoapSections(restored.baseline.sections) ||
      !validSoapSections(restored.sections) ||
      typeof restored.patient_instructions !== "string" ||
      (restored.pending_attempt !== null &&
        !noteAttemptMatchesContext(
          restored.pending_attempt,
          restored.baseline,
          encounterId,
        ))
    ) {
      if (restored)
        setError(
          "The protected working note did not match this editor version and was not loaded.",
        );
      return;
    }
    skipNextDraftSave.current = true;
    setBaseline(restored.baseline);
    setSections(restored.sections);
    setPatientInstructions(restored.patient_instructions);
    setAppliedTemplate(restored.applied_template);
    setCorrectionTarget(restored.correction_target);
    saveAttemptRef.current = restored.pending_attempt;
    if (restored.pending_attempt) {
      setRequestKey(restored.pending_attempt.requestKey);
      setSaveState("outcome_unconfirmed");
      setError(
        "A submitted note save was restored. Check its retained status before continuing.",
      );
    }
    if (
      note?.id !== restored.baseline.noteId ||
      note?.current_revision?.revision_no !== restored.baseline.revisionNo
    ) {
      setIncomingNote(note ?? null);
      setConflictDialogOpen(Boolean(note));
    }
  }, [encounterId, note, patientId, workingDraft.ready, workingDraft.restored]);

  useEffect(() => {
    const revision = note?.current_revision;
    if (!revision?.body || revision.revision_no === baseline.revisionNo) return;
    if (
      dirty ||
      correctionTarget ||
      saveAttemptRef.current ||
      workingDraft.status === "saving" ||
      workingDraft.status === "conflict"
    ) {
      setIncomingNote(note ?? null);
      return;
    }
    const next = initialBaseline();
    setBaseline(next);
    setSections(next.sections);
    setPatientInstructions(next.patientInstructions);
    setAppliedTemplate(next.template);
    setIncomingNote(null);
  }, [note?.current_revision?.id, note?.current_revision?.revision_no]);

  useEffect(() => {
    if (busy || !workingDraft.ready || !restoredDraft.current) return;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    if (!dirty && !correctionTarget && !saveAttemptRef.current) return;
    const snapshot = workingSnapshot();
    if (!snapshot) return;
    cancelPendingDraftSave();
    draftSaveTimer.current = window.setTimeout(() => {
      draftSaveTimer.current = null;
      void workingDraft.save(snapshot);
    }, 650);
    return cancelPendingDraftSave;
  }, [
    appliedTemplate,
    baseline,
    busy,
    correctionTarget,
    dirty,
    patientInstructions,
    sections,
    workingDraft.ready,
  ]);

  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(
    () =>
      registerBlocker(
        dirty
          ? () =>
              "This SOAP draft has unsaved changes. Leave the chart and discard them?"
          : null,
      ),
    [dirty, registerBlocker],
  );

  const save = async () => {
    if (
      !appliedTemplate ||
      busy ||
      !noteSaveAllowsMutation(saveState) ||
      incomingNote ||
      (signed && !correctionTarget) ||
      !canWrite ||
      (!dirty && !correctionTarget)
    )
      return;
    cancelPendingDraftSave();
    const operationCode = correctionTarget
      ? "notes.correct"
      : baseline.noteId
        ? "notes.revise"
        : "notes.create";
    const fields = {
      template_id: appliedTemplate.id,
      template_version: appliedTemplate.version,
      ...sections,
      patient_instructions: patientInstructions,
    };
    const requestKey = noteSaveRequestKey(
      saveAttemptRef.current?.requestKey ?? null,
    );
    const noteId = baseline.noteId;
    const endpoint =
      operationCode === "notes.create"
        ? `/api/clinic/encounters/${encounterId}/notes`
        : operationCode === "notes.correct"
          ? `/api/clinic/notes/${noteId}/corrections`
          : `/api/clinic/notes/${noteId}/revisions`;
    const attempt: NoteSaveAttempt = {
      requestKey,
      operationCode,
      noteId,
      expectedRevision: correctionTarget
        ? correctionTarget.revisionNo + 1
        : baseline.revisionNo
          ? baseline.revisionNo + 1
          : 1,
      endpoint,
      body: noteSaveRequestBody(
        operationCode,
        fields,
        requestKey,
        baseline.revisionNo ?? undefined,
        correctionTarget
          ? {
              reason: correctionTarget.reason,
              expectedRevisionId: correctionTarget.revisionId,
              expectedRevision: correctionTarget.revisionNo,
            }
          : undefined,
      ),
    };
    saveAttemptRef.current = attempt;
    setRequestKey(attempt.requestKey);
    setBusy(true);
    setError("");
    setNotice("");
    setSaveState("saving");
    try {
      const snapshot = workingSnapshot(attempt);
      if (!snapshot || !(await workingDraft.save(snapshot))) {
        setSaveState("idle");
        setError(
          "The working note was not saved. The official save was stopped so this documentation remains recoverable.",
        );
        return;
      }
      if (
        (attempt.operationCode === "notes.revise" ||
          attempt.operationCode === "notes.correct") &&
        attempt.noteId
      ) {
        await api<{ revision: { revision_no: number } }>(attempt.endpoint, {
          method: "POST",
          body: attempt.body,
        });
      } else {
        const result = await api<{ note: EncounterNote }>(attempt.endpoint, {
          method: "POST",
          body: attempt.body,
        });
        attempt.noteId = result.note.id;
      }
      const reconciled = await reconcileNoteSave(attempt);
      await completeNoteSave(attempt, reconciled);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.replace(
          `/login?next=${encodeURIComponent(currentLoginDestination())}`,
        );
        return;
      }
      if (isUnknownNoteSaveError(caught)) {
        setSaveState("outcome_unconfirmed");
        setError(
          "Save outcome not confirmed. No automatic retry was made; check the retained save status explicitly.",
        );
      } else {
        setSaveState("rejected");
        setError(
          caught instanceof Error ? caught.message : "The draft was rejected.",
        );
        if (
          caught instanceof ApiError &&
          (caught.code === "stale_record" || caught.code === "already_exists")
        )
          onRefresh?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const reconcileNoteSave = async (
    attempt: NoteSaveAttempt,
  ): Promise<EncounterNote> => {
    setSaveState("reconciling");
    const exactPatientId = patientId ?? note?.patient_id;
    if (exactPatientId === undefined) {
      throw new NoteReconciliationError(
        "The saved draft cannot be reconciled without the selected patient.",
      );
    }
    try {
      let exactEncounter: EncounterDetail | undefined;
      let exactNoteId = attempt.noteId;
      if (exactNoteId === null) {
        const encounterResult = await api<{ encounter: EncounterDetail }>(
          encounterDetailPath(exactPatientId, encounterId),
        );
        exactEncounter = encounterResult.encounter;
        if (
          exactEncounter.id !== encounterId ||
          exactEncounter.patient_id !== exactPatientId
        )
          throw new NoteReconciliationError(
            "The refreshed encounter did not match the selected patient and encounter.",
          );
        const candidates = exactEncounter.notes.filter(
          (candidate) =>
            candidate.note_kind === "soap" &&
            candidate.latest_revision === attempt.expectedRevision,
        );
        if (candidates.length !== 1)
          throw new NoteReconciliationError(
            "The committed draft could not be matched to exactly one SOAP note.",
          );
        exactNoteId = candidates[0].id;
      }
      const noteResult = await api<{ note: EncounterNote }>(
        `/api/clinic/notes/${exactNoteId}`,
      );
      if (
        !noteReconciliationMatches(
          noteResult.note,
          exactPatientId,
          encounterId,
          exactNoteId,
          attempt.expectedRevision,
        )
      )
        throw new NoteReconciliationError(
          "The refreshed note did not match the selected patient, encounter, unsigned SOAP note, or expected revision.",
        );
      if (!exactEncounter) {
        const encounterResult = await api<{ encounter: EncounterDetail }>(
          encounterDetailPath(exactPatientId, encounterId),
        );
        exactEncounter = encounterResult.encounter;
      }
      if (
        !encounterNoteRefreshMatches(
          exactEncounter,
          exactPatientId,
          encounterId,
          exactNoteId,
        )
      )
        throw new NoteReconciliationError(
          "The refreshed encounter did not contain the expected SOAP note.",
        );
      attempt.noteId = exactNoteId;
      return noteResult.note;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) throw caught;
      if (caught instanceof NoteReconciliationError) throw caught;
      throw new NoteReconciliationError(
        "The committed draft could not be refreshed and verified. The outcome remains unconfirmed.",
      );
    }
  };

  const completeNoteSave = async (
    attempt: NoteSaveAttempt,
    reconciled: EncounterNote,
  ) => {
    cancelPendingDraftSave();
    const body = reconciled.current_revision?.body;
    if (body) {
      setSections(body.sections);
      setPatientInstructions(body.patient_instructions ?? "");
      setAppliedTemplate({
        id: body.template_id,
        version: body.template_version,
      });
      setBaseline({
        noteId: reconciled.id,
        revisionId: reconciled.current_revision?.id ?? null,
        revisionNo: reconciled.current_revision?.revision_no ?? null,
        sections: body.sections,
        patientInstructions: body.patient_instructions ?? "",
        template: {
          id: body.template_id,
          version: body.template_version,
        },
      });
    }
    if (!(await workingDraft.clear())) {
      setSaveState("outcome_unconfirmed");
      setError(
        "The note was saved, but its recovery copy could not be cleared. Check the retained save status to finish reconciliation.",
      );
      return;
    }
    setSaveState("idle");
    setNotice(
      attempt.operationCode === "notes.correct"
        ? `Unsigned correction revision ${attempt.expectedRevision} saved after note and encounter verification. Review and sign it separately.`
        : `Unsigned draft ${attempt.operationCode === "notes.create" ? "created" : `revision ${attempt.expectedRevision} saved`} after note and encounter verification.`,
    );
    saveAttemptRef.current = null;
    setRequestKey(null);
    if (attempt.operationCode === "notes.correct") setCorrectionTarget(null);
    if (attempt.operationCode === "notes.create") onCreated?.(reconciled);
    else onRefresh?.();
  };

  const checkSaveStatus = async () => {
    const attempt = saveAttemptRef.current;
    if (busy || !attempt) return;
    setBusy(true);
    setError("");
    setSaveState("reconciling");
    try {
      const expectedResourceId =
        attempt.operationCode === "notes.create" ? encounterId : attempt.noteId;
      if (expectedResourceId === null)
        throw new NoteReconciliationError(
          "The retained save attempt has no note identity to reconcile.",
        );
      const result = await api<{ receipt: OperationReceipt }>(
        operationReceiptPath(attempt.requestKey),
      );
      if (
        !noteReceiptMatches(
          result.receipt,
          attempt.operationCode,
          expectedResourceId,
        )
      )
        throw new NoteReconciliationError(
          "The saved status did not match this note. The outcome remains unconfirmed.",
        );
      if (result.receipt.outcome !== "committed") {
        setSaveState("outcome_unconfirmed");
        setError(
          "The saved status is still unconfirmed. The draft remains protected and no automatic retry was made.",
        );
        return;
      }
      const reconciled = await reconcileNoteSave(attempt);
      await completeNoteSave(attempt, reconciled);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.replace(
          `/login?next=${encodeURIComponent(currentLoginDestination())}`,
        );
        return;
      }
      if (caught instanceof ApiError && caught.status === 404) {
        setSaveState("not_found");
        setError(
          "No saved result was found for this attempt. The outcome remains unconfirmed; reset only after checking the note.",
        );
      } else if (isUnknownNoteSaveError(caught)) {
        setSaveState("outcome_unconfirmed");
        setError(
          "The save outcome remains unconfirmed. No automatic retry was made; check the retained save status again.",
        );
      } else {
        setSaveState("rejected");
        setError(
          caught instanceof Error
            ? caught.message
            : "The save status request was rejected.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const retryExactNoteSave = async () => {
    const attempt = saveAttemptRef.current;
    if (busy || !attempt || saveState !== "not_found") return;
    cancelPendingDraftSave();
    setBusy(true);
    setError("");
    setSaveState("saving");
    try {
      const snapshot = workingSnapshot(attempt);
      if (!snapshot || !(await workingDraft.save(snapshot))) {
        setSaveState("not_found");
        setError(
          "The exact save attempt could not be preserved. Reload the working note before retrying.",
        );
        return;
      }
      await api(attempt.endpoint, { method: "POST", body: attempt.body });
      const reconciled = await reconcileNoteSave(attempt);
      await completeNoteSave(attempt, reconciled);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.replace(
          `/login?next=${encodeURIComponent(currentLoginDestination())}`,
        );
        return;
      }
      setSaveState(
        isUnknownNoteSaveError(caught) ? "outcome_unconfirmed" : "rejected",
      );
      setError(
        caught instanceof Error
          ? caught.message
          : "The exact note save could not be reconciled.",
      );
      if (
        caught instanceof ApiError &&
        (caught.code === "stale_record" || caught.code === "already_exists")
      )
        onRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  const resetSaveAttempt = async () => {
    if (busy || !saveAttemptRef.current) return;
    cancelPendingDraftSave();
    setResetConfirmation(false);
    setBusy(true);
    const snapshot = workingSnapshot(null);
    if (!snapshot || !(await workingDraft.save(snapshot))) {
      setBusy(false);
      setError(
        "The pending save identity could not be cleared from the protected working note.",
      );
      return;
    }
    saveAttemptRef.current = null;
    setRequestKey(null);
    setSaveState("idle");
    setError("");
    setBusy(false);
  };

  const startCorrection = () => {
    if (!note || !savedBody || !note.current_revision || !signed) return;
    if (!correctionReason.trim() || !correctionConfirmed) return;
    setSections(savedBody.sections);
    setPatientInstructions(savedBody.patient_instructions ?? "");
    setAppliedTemplate({
      id: savedBody.template_id,
      version: savedBody.template_version,
    });
    setCorrectionTarget({
      revisionId: note.current_revision.id,
      revisionNo: note.current_revision.revision_no,
      reason: correctionReason.trim(),
    });
    setCorrectionDialogOpen(false);
    setCorrectionConfirmed(false);
    setNotice(
      `Preparing a correction to signed revision ${note.current_revision.revision_no}. Review the full copied note, then save it as an unsigned correction.`,
    );
  };

  const incomingBody = incomingNote?.current_revision?.body;
  const useIncomingRevision = async () => {
    if (!incomingNote?.current_revision || !incomingBody || busy) return;
    cancelPendingDraftSave();
    setBusy(true);
    if (!(await workingDraft.clear())) {
      setBusy(false);
      setError(
        "The preserved working note could not be cleared. Keep this copy open and try again.",
      );
      return;
    }
    const next: SoapEditorBaseline = {
      noteId: incomingNote.id,
      revisionId: incomingNote.current_revision.id,
      revisionNo: incomingNote.current_revision.revision_no,
      sections: incomingBody.sections,
      patientInstructions: incomingBody.patient_instructions ?? "",
      template: {
        id: incomingBody.template_id,
        version: incomingBody.template_version,
      },
    };
    saveAttemptRef.current = null;
    setRequestKey(null);
    setSaveState("idle");
    setBaseline(next);
    setSections(next.sections);
    setPatientInstructions(next.patientInstructions);
    setAppliedTemplate(next.template);
    setCorrectionTarget(null);
    setIncomingNote(null);
    setConflictDialogOpen(false);
    setError("");
    setNotice(`Loaded saved revision ${next.revisionNo}.`);
    setBusy(false);
  };

  const rebaseOntoIncomingRevision = () => {
    if (
      !incomingNote?.current_revision ||
      !incomingBody ||
      incomingNote.current_revision.signed
    )
      return;
    cancelPendingDraftSave();
    saveAttemptRef.current = null;
    setRequestKey(null);
    setSaveState("idle");
    setBaseline({
      noteId: incomingNote.id,
      revisionId: incomingNote.current_revision.id,
      revisionNo: incomingNote.current_revision.revision_no,
      sections: incomingBody.sections,
      patientInstructions: incomingBody.patient_instructions ?? "",
      template: {
        id: incomingBody.template_id,
        version: incomingBody.template_version,
      },
    });
    setAppliedTemplate({
      id: incomingBody.template_id,
      version: incomingBody.template_version,
    });
    setCorrectionTarget(null);
    setIncomingNote(null);
    setConflictDialogOpen(false);
    setError("");
    setNotice(
      `Your preserved text is now based on saved revision ${incomingNote.current_revision.revision_no}. Review it before saving.`,
    );
  };

  return (
    <Box className="soap-workspace">
      {note && savedBody && (
        <Alert severity={signed ? "info" : "warning"}>
          {signed
            ? `Signed revision ${note.current_revision?.revision_no} is read-only. Start a correction to prepare a separate unsigned revision.`
            : correctionTarget
              ? `Correction in progress for signed revision ${correctionTarget.revisionNo}. Save creates an unsigned correction that must be reviewed and signed separately.`
              : `Draft revision ${note.current_revision?.revision_no}. Template provenance is fixed after creation.`}
        </Alert>
      )}
      {incomingNote && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" onClick={() => setConflictDialogOpen(true)}>
              Review versions
            </Button>
          }
        >
          Saved revision {incomingNote.current_revision?.revision_no} changed
          while this working note was open. Your text is preserved and official
          save is blocked until you review both versions.
        </Alert>
      )}
      {note?.revisions.length ? (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Saved revision history
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", mt: 0.75 }}>
            {note.revisions.map((revision) => (
              <Chip
                key={revision.id}
                size="small"
                variant={
                  revision.id === note.current_revision?.id
                    ? "filled"
                    : "outlined"
                }
                color={revision.signed ? "success" : "default"}
                label={`Revision ${revision.revision_no}${revision.signed ? " · signed" : " · unsigned"}`}
              />
            ))}
          </Stack>
        </Box>
      ) : null}
      <Stack spacing={1} className="soap-sections">
        {!note && !signed && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.25}>
              <Box>
                <Typography component="h3" variant="subtitle1">
                  Start with a SOAP template
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Choose prompts that fit this visit, then apply them before
                  saving a draft. Template prompts are editable and do not
                  document findings on their own.
                </Typography>
              </Box>
              <FormControl fullWidth size="small">
                <InputLabel id="soap-template-label">SOAP template</InputLabel>
                <Select
                  labelId="soap-template-label"
                  label="SOAP template"
                  value={selectedTemplateId}
                  disabled={editorDisabled || templates.length === 0}
                  onChange={(event) =>
                    setSelectedTemplateId(event.target.value)
                  }
                >
                  {templates.map((template) => (
                    <MenuItem key={template.id} value={template.id}>
                      {template.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {selectedTemplate && (
                <Alert severity="info">
                  <strong>{selectedTemplate.source_label}</strong>
                  {selectedTemplate.caution
                    ? ` ${selectedTemplate.caution}`
                    : null}
                </Alert>
              )}
              <Button
                variant="outlined"
                sx={{ alignSelf: "flex-start" }}
                disabled={!selectedTemplate || editorDisabled}
                onClick={requestTemplateApplication}
              >
                Apply template prompts
              </Button>
            </Stack>
          </Paper>
        )}
        {patientId != null && (
          <PrevisitNoteImport
            key={`${patientId}:${encounterId}`}
            patientId={patientId}
            encounterId={encounterId}
            patientName={patientName}
            subjective={sections.subjective}
            disabled={editorDisabled}
            onAppend={(source) =>
              setSections((current) => ({
                ...current,
                subjective: appendPrevisitNote(current.subjective, source),
              }))
            }
          />
        )}
        <HistoryOfPresentIllness
          value={sections.subjective}
          onChange={(subjective) =>
            setSections((current) => ({ ...current, subjective }))
          }
          disabled={editorDisabled}
        />
        <ReviewOfSystems
          value={sections.subjective}
          onChange={(subjective) =>
            setSections((current) => ({ ...current, subjective }))
          }
          disabled={editorDisabled}
        />
        {SOAP_SECTION_LABELS.filter(([key]) => key !== "subjective").map(
          ([key, label]) => (
            <Box
              key={key}
              id={
                key === "assessment" || key === "plan"
                  ? `chart-${key}`
                  : undefined
              }
              sx={{ scrollMarginTop: 16 }}
            >
              <TextField
                fullWidth
                name={key}
                label={`${label} (${label.charAt(0)})`}
                value={sections[key]}
                onChange={(event) =>
                  setSections((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                multiline
                minRows={key === "objective" ? 10 : 4}
                slotProps={{ htmlInput: { maxLength: 50_000 } }}
                disabled={editorDisabled}
                helperText={
                  key === "objective" && appliedTemplate && !signed
                    ? "Template text is editable and remains unverified until the author reviews it."
                    : undefined
                }
              />
            </Box>
          ),
        )}
        <TextField
          label="Patient instructions"
          value={patientInstructions}
          onChange={(event) => setPatientInstructions(event.target.value)}
          multiline
          minRows={4}
          slotProps={{ htmlInput: { maxLength: 5_000 } }}
          disabled={editorDisabled}
          helperText="Optional. These exact instructions are available to the patient portal only after this revision is signed and the encounter is completed."
        />
      </Stack>
      {!canWrite && !signed && (
        <Alert severity="info">
          You have read access but cannot change this note.
        </Alert>
      )}
      {error && <ErrorMessage message={error} />}
      {workingDraft.status === "loading" && canWrite && (
        <Typography variant="caption" role="status" color="text.secondary">
          Recovering protected working note…
        </Typography>
      )}
      <Box role="status" aria-live="polite" aria-atomic="true">
        {saveState === "saving"
          ? "Saving unsigned draft…"
          : saveState === "reconciling"
            ? "Checking the saved note and encounter…"
            : notice}
      </Box>
      {workingDraft.status === "saving" && (
        <Typography variant="caption" role="status" color="text.secondary">
          Saving protected working note…
        </Typography>
      )}
      {workingDraft.status === "saved" && dirty && (
        <Typography variant="caption" role="status" color="text.secondary">
          Working note saved for refresh recovery.
        </Typography>
      )}
      {(workingDraft.status === "error" ||
        workingDraft.status === "conflict") && (
        <Alert
          severity="warning"
          action={
            workingDraft.status === "error" ? (
              <Button color="inherit" onClick={() => void retryWorkingDraft()}>
                Retry saving current note
              </Button>
            ) : saveAttemptRef.current ? undefined : (
              <Button
                color="inherit"
                onClick={() => setReplaceWorkingCopy(true)}
              >
                Load saved copy
              </Button>
            )
          }
        >
          {workingDraft.error ||
            "The protected working note could not be saved."}
          {workingDraft.status === "conflict" && saveAttemptRef.current
            ? " Check the submitted save before replacing this copy."
            : null}
        </Alert>
      )}
      <Stack
        id="chart-signing"
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ scrollMarginTop: 16 }}
      >
        {(!signed || correctionTarget) && (
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={
              busy ||
              !workingDraft.ready ||
              !canWrite ||
              (!dirty && !correctionTarget) ||
              !noteSaveAllowsMutation(saveState) ||
              Boolean(incomingNote) ||
              !appliedTemplate ||
              !hasSoapContent(sections)
            }
          >
            {busy
              ? "Saving…"
              : correctionTarget
                ? "Save unsigned correction"
                : note
                  ? "Save new revision"
                  : "Save draft"}
          </Button>
        )}
        {signed && !correctionTarget && canWrite && (
          <Button
            variant="contained"
            onClick={() => setCorrectionDialogOpen(true)}
            disabled={busy || !noteSaveAllowsMutation(saveState)}
          >
            Start correction
          </Button>
        )}
        {requestKey && (
          <Button
            variant="outlined"
            onClick={() => void checkSaveStatus()}
            disabled={busy}
          >
            {busy && saveState !== "saving"
              ? "Checking save status…"
              : "Check save status"}
          </Button>
        )}
        {requestKey && !busy && (
          <Button variant="text" onClick={() => setResetConfirmation(true)}>
            Reset save attempt
          </Button>
        )}
        {requestKey && saveState === "not_found" && !busy && (
          <Button variant="outlined" onClick={() => void retryExactNoteSave()}>
            Retry exact save
          </Button>
        )}
        {note && patientId && canSign && (
          <EncounterNoteSigning
            note={note}
            patientId={patientId}
            patientName={patientName}
            encounterId={encounterId}
            canSign={canSign}
            disabled={
              busy ||
              dirty ||
              !noteSaveAllowsMutation(saveState) ||
              Boolean(saveAttemptRef.current)
            }
            onSigned={() => onRefresh?.()}
            onRefresh={onRefresh}
          />
        )}
      </Stack>
      <Dialog
        open={Boolean(templateConfirmation)}
        onClose={() => setTemplateConfirmation(null)}
      >
        <DialogTitle>Replace note prompts?</DialogTitle>
        <DialogContent>
          <Typography>
            Applying {templateConfirmation?.label} will replace the sections
            where it supplies prompt text. Review the replacement before you
            save the unsigned draft.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateConfirmation(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (templateConfirmation) applyTemplate(templateConfirmation);
              setTemplateConfirmation(null);
            }}
          >
            Apply template
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={resetConfirmation}
        onClose={() => !busy && setResetConfirmation(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reset save attempt?</DialogTitle>
        <DialogContent>
          Check the saved note before resetting this attempt. Resetting does not
          send another save.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetConfirmation(false)} disabled={busy}>
            Go back
          </Button>
          <Button onClick={() => void resetSaveAttempt()} disabled={busy}>
            Reset attempt
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={replaceWorkingCopy}
        onClose={() => setReplaceWorkingCopy(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Replace this working note?</DialogTitle>
        <DialogContent>
          Loading the server copy replaces newer note edits currently held in
          this window. Continue only after confirming those local edits are no
          longer needed.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReplaceWorkingCopy(false)}>
            Keep local note
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={reloadWorkingDraft}
          >
            Replace with saved copy
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={conflictDialogOpen && Boolean(incomingNote)}
        onClose={() => !busy && setConflictDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Review saved and preserved note versions</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="warning">
              Your working text remains preserved. Choosing the saved revision
              discards it. Rebasing keeps your text but makes the displayed
              saved revision its new editing base.
            </Alert>
            <Typography variant="subtitle2">
              Saved revision {incomingNote?.current_revision?.revision_no}
            </Typography>
            {SOAP_SECTION_LABELS.map(([key, label]) => (
              <Box key={key}>
                <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {incomingBody?.sections[key] || "Not recorded"}
                </Typography>
              </Box>
            ))}
            <Divider />
            <Typography variant="subtitle2">
              Your preserved working text
            </Typography>
            {SOAP_SECTION_LABELS.map(([key, label]) => (
              <Box key={key}>
                <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {sections[key] || "Not recorded"}
                </Typography>
              </Box>
            ))}
            {incomingNote?.current_revision?.signed && (
              <Alert severity="info">
                The newer revision is signed. Load it, then start a correction
                if further documentation is required.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConflictDialogOpen(false)} disabled={busy}>
            Keep reviewing
          </Button>
          <Button
            onClick={rebaseOntoIncomingRevision}
            disabled={busy || incomingNote?.current_revision?.signed === true}
          >
            Keep my text and rebase
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void useIncomingRevision()}
            disabled={busy}
          >
            Use saved revision
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={correctionDialogOpen}
        onClose={() => !busy && setCorrectionDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Start correction to signed SOAP note</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              This keeps signed revision {note?.current_revision?.revision_no}{" "}
              intact and creates a separate unsigned correction for review and
              signature.
            </Alert>
            <Typography color="text.secondary">
              {patientName || `Patient #${patientId ?? "unavailable"}`} ·
              Encounter #{encounterId} · Signed revision{" "}
              {note?.current_revision?.revision_no}
            </Typography>
            {SOAP_SECTION_LABELS.map(([key, label]) => (
              <Box key={key}>
                <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
                <Typography sx={{ whiteSpace: "pre-wrap" }}>
                  {savedBody?.sections[key] || "Not recorded"}
                </Typography>
              </Box>
            ))}
            <Box>
              <Typography sx={{ fontWeight: 700 }}>
                Patient instructions
              </Typography>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {savedBody?.patient_instructions ||
                  "No patient instructions recorded."}
              </Typography>
            </Box>
            <TextField
              label="Reason for correction"
              value={correctionReason}
              onChange={(event) => setCorrectionReason(event.target.value)}
              multiline
              minRows={3}
              required
              slotProps={{ htmlInput: { maxLength: 2_000 } }}
              helperText="This reason is saved with the correction."
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={correctionConfirmed}
                  onChange={(event) =>
                    setCorrectionConfirmed(event.target.checked)
                  }
                />
              }
              label="I confirmed the displayed patient, encounter, signed revision, and copied note content."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy}
            onClick={() => setCorrectionDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || !correctionConfirmed || !correctionReason.trim()}
            onClick={startCorrection}
          >
            Start correction
          </Button>
        </DialogActions>
      </Dialog>
      <Typography variant="caption" color="text.secondary">
        {signed
          ? "The signed revision remains read-only. A correction is a separate unsigned revision until it is reviewed and signed."
          : "Saving stores an unsigned chart draft; it does not sign the note or close the encounter."}
      </Typography>
    </Box>
  );
}

function ExistingSoapNote({
  patientId,
  patientName,
  encounterId,
  noteId,
  templates,
  canWrite,
  canSign,
  onChanged,
}: {
  patientId: number;
  patientName?: string;
  encounterId: number;
  noteId: number;
  templates: NoteTemplate[];
  canWrite: boolean;
  canSign: boolean;
  onChanged?: () => void;
}) {
  const resource = useResource<{ note: EncounterNote }>(
    `/api/clinic/notes/${noteId}`,
  );
  if (!resource.data) return <LoadState error={resource.error} />;
  if (
    resource.data.note.id !== noteId ||
    resource.data.note.patient_id !== patientId ||
    resource.data.note.encounter_id !== encounterId ||
    resource.data.note.note_kind !== "soap"
  )
    return (
      <ErrorMessage message="The loaded note did not match this patient and encounter." />
    );
  if (!resource.data.note.current_revision?.body)
    return (
      <ErrorMessage message="This SOAP note does not contain a supported draft payload." />
    );
  return (
    <SoapNoteForm
      patientId={patientId}
      patientName={patientName}
      encounterId={encounterId}
      note={resource.data.note}
      templates={templates}
      canWrite={canWrite}
      canSign={canSign}
      onRefresh={() => {
        resource.refresh();
        onChanged?.();
      }}
    />
  );
}

function SoapNoteWorkspace({
  encounter,
  patientName,
  onChanged,
}: {
  encounter: EncounterDetail;
  patientName?: string;
  onChanged?: () => void;
}) {
  const context = useClinic();
  const [created, setCreated] = useState<EncounterNote | null>(null);
  const templates = useResource<{ templates: NoteTemplate[] }>(
    "/api/clinic/note_templates",
  );
  if (!context.capabilities.notes_read)
    return (
      <div className="care-blocked">
        <strong>Note access restricted</strong>
        <span>Your current clinic permissions do not allow note review.</span>
      </div>
    );
  if (!templates.data) return <LoadState error={templates.error} />;
  const existing = encounter.notes.find((note) => note.note_kind === "soap");
  const noteId = created?.id ?? existing?.id;
  return noteId ? (
    <ExistingSoapNote
      patientId={encounter.patient_id}
      patientName={patientName}
      encounterId={encounter.id}
      noteId={noteId}
      templates={templates.data.templates}
      canWrite={context.capabilities.notes_write}
      canSign={context.capabilities.notes_sign === true}
      onChanged={onChanged}
    />
  ) : context.capabilities.notes_write ? (
    <SoapNoteForm
      encounterId={encounter.id}
      patientId={encounter.patient_id}
      patientName={patientName}
      templates={templates.data.templates}
      canWrite
      onCreated={setCreated}
      onRefresh={onChanged}
    />
  ) : (
    <div className="care-blocked">
      <strong>No SOAP note recorded</strong>
      <span>You can review existing notes but cannot create a draft.</span>
    </div>
  );
}

export function ChartQuickJump() {
  const links = [
    ["Patient", "#chart-patient"],
    ["Intake", "#nurse-workspace"],
    ["Education", "#patient-education"],
    ["History", "#clinical-history"],
    ["Labs", "#chart-labs"],
    ["Medication", "#medication-administration"],
    ["Orders & plans", "#clinical-plan-workspace"],
    ["HPI", "#chart-hpi"],
    ["ROS", "#chart-ros"],
    ["Assessment", "#chart-assessment"],
    ["Plan", "#chart-plan"],
    ["Signing", "#chart-signing"],
    ["Completion", "#chart-completion"],
  ] as const;

  return (
    <Paper
      component="nav"
      variant="outlined"
      className="chart-quick-jump"
      aria-label="Chart quick navigation"
    >
      <Typography variant="overline" component="h2">
        Quick jump
      </Typography>
      <Stack className="chart-quick-jump-links">
        {links.map(([label, href]) => (
          <Button
            key={href}
            href={href}
            variant="text"
            size="small"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              document.querySelector(href)?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
              window.history.replaceState(null, "", href);
            }}
          >
            {label}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}

export function ProviderEncounterWorkflow({
  patient,
  encounter,
  observations: initialObservations,
  timezone,
  noteWorkspace,
  careSummaryState = { status: "unlinked" },
  onCareSummaryRefresh,
  onEncounterRefresh,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  observations: Observation[];
  timezone: string;
  noteWorkspace: ReactNode;
  careSummaryState?: CareSummaryLoadState;
  onCareSummaryRefresh?: () => void;
  onEncounterRefresh?: () => void;
}) {
  const { capabilities } = useClinic();
  const [recordedObservations, setRecordedObservations] = useState<
    Observation[]
  >([]);
  const [handoutOpen, setHandoutOpen] = useState(false);
  const [orderRevision, setOrderRevision] = useState(0);
  const observations = Array.from(
    new Map(
      [...initialObservations, ...recordedObservations].map((observation) => [
        observation.id,
        observation,
      ]),
    ).values(),
  ).sort(
    (left, right) =>
      Date.parse(right.observed_at) - Date.parse(left.observed_at) ||
      right.id - left.id,
  );
  const displayedObservations = observations.filter(
    (observation) => observation.value_kind !== "group",
  );
  const [chartConfirmed, setChartConfirmed] = useState(false);
  const signedChart = encounterHasSignedSoapNote(encounter);
  const currentPhones = (patient.contacts ?? []).filter(
    (contact) => contact.contact_type === "phone" && !contact.effective_until,
  );
  const existingChart = encounter.notes.some(
    (note) => note.note_kind === "soap",
  );
  const workspaceHeading = useRef<HTMLHeadingElement | null>(null);
  const observationTimes = new Set(
    displayedObservations.map((observation) => observation.observed_at),
  );
  const sharedObservationTime =
    observationTimes.size === 1
      ? clinicDateTime(displayedObservations[0]?.observed_at ?? null, timezone)
      : null;
  const reviewNeededTopics =
    careSummaryState.status === "ready"
      ? (careSummaryState.summary.review_needed_topics ?? []).filter(
          (topic): topic is "allergies" | "medications" =>
            topic === "allergies" || topic === "medications",
        )
      : [];
  const focusReview = (topic: "allergies" | "medications") => {
    const href = `#clinical-history-${topic}-review`;
    const target = document.getElementById(href.slice(1));
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
  };

  useEffect(() => {
    const requestedFocus = new URLSearchParams(window.location.search).get(
      "focus",
    );
    if (requestedFocus === "nurse-workspace") {
      const timer = window.setTimeout(() => {
        const target = document.getElementById(requestedFocus);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        target?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!chartConfirmed) return;
    if (!requestedFocus) {
      workspaceHeading.current?.focus();
      return;
    }
    const timer = window.setTimeout(() => {
      const target = document.getElementById(requestedFocus);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [chartConfirmed]);

  return (
    <Stack spacing={2} className="provider-encounter-workflow">
      {encounter.visit_modality === "video" && !encounter.telehealth && (
        <Alert severity="info">
          Video visit requested. The clinic's video connection or visit
          eligibility is not ready. Clinic setup staff must resolve video access
          before joining. Intake, manual charting, orders and follow-up remain
          available; no video session has started.
        </Alert>
      )}
      <Paper
        id="chart-patient"
        variant="outlined"
        sx={{ p: 2 }}
        className="chart-anchor"
      >
        <Stack spacing={1}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between" }}
          >
            <Typography variant="subtitle2">Patient Demographics</Typography>
            {chartConfirmed &&
              encounter.telehealth?.clinic_href &&
              capabilities.telehealth_read && (
                <Button
                  size="small"
                  variant="contained"
                  href={encounter.telehealth.clinic_href}
                >
                  Open video visit &amp; Scribe
                </Button>
              )}
            {chartConfirmed &&
              capabilities.scribe_read === true &&
              capabilities.scribe_write === true &&
              capabilities.notes_write === true && (
                <Button
                  size="small"
                  variant="outlined"
                  href={`/clinic/scribe?patient_id=${patient.id}&clinical_encounter_id=${encounter.id}`}
                >
                  Open Scribe
                </Button>
              )}
          </Stack>
          <TableContainer>
            <Table size="small" className="patient-demographics-table">
              <TableBody>
                <TableRow>
                  <TableCell component="th">MRN</TableCell>
                  <TableCell>
                    {patientReferenceLabel(patient.reference) || "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Date of Visit</TableCell>
                  <TableCell>
                    {clinicDateTime(encounter.started_at, timezone)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Patient</TableCell>
                  <TableCell>
                    {patient.display_name || "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Age</TableCell>
                  <TableCell>
                    {patientAge(
                      patient.demographics?.date_of_birth,
                      encounter.started_at,
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Sex</TableCell>
                  <TableCell>
                    {patientSexLabel(patient.demographics?.sex)}
                  </TableCell>
                  <TableCell component="th">Phone</TableCell>
                  <TableCell>
                    {currentPhones.find((contact) => contact.preferred)
                      ?.contact_value ||
                      currentPhones[0]?.contact_value ||
                      "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Birthdate</TableCell>
                  <TableCell>
                    {patient.demographics?.date_of_birth || "Not recorded"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Heart Rate</TableCell>
                  <TableCell>
                    {observationByLabel(observations, /heart\s*rate/i)}
                  </TableCell>
                  <TableCell component="th">Blood Pressure</TableCell>
                  <TableCell>{bloodPressureValue(observations)}</TableCell>
                  <TableCell component="th">Weight</TableCell>
                  <TableCell>
                    {observationByLabel(observations, /weight/i)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Encounter</TableCell>
                  <TableCell>#{encounter.id}</TableCell>
                  <TableCell component="th">Chart Status</TableCell>
                  <TableCell>
                    {chartStateLabel(
                      signedChart,
                      chartConfirmed,
                      existingChart,
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          {encounter.status === "completed" &&
            capabilities.notes_read === true && (
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setHandoutOpen(true)}
                >
                  Patient handout
                </Button>
              </Box>
            )}
          {handoutOpen && (
            <VisitInstructionHandout
              key={`${patient.id}:${encounter.id}`}
              endpoint={`/api/clinic/patients/${patient.id}/encounters/${encounter.id}/visit_instructions`}
              onClose={() => setHandoutOpen(false)}
            />
          )}
        </Stack>
      </Paper>

      <NurseEncounterWorkspace
        patient={patient}
        encounter={encounter}
        observations={observations}
        onObservationsRecorded={(saved) =>
          setRecordedObservations((current) => [
            ...current,
            ...saved.filter(
              (observation) =>
                observation.patient_id === patient.id &&
                observation.encounter_id === encounter.id,
            ),
          ])
        }
        careSummary={
          careSummaryState.status === "ready" ? careSummaryState.summary : null
        }
      />

      <Paper id="chart-access" variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.25}>
          <Box>
            <Typography component="h2" variant="subtitle1">
              Clinician chart
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Confirm the patient and encounter before opening the chart. This
              confirmation does not accept a handoff or assign a provider.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Chip
              label={chartStateLabel(
                signedChart,
                chartConfirmed,
                existingChart,
              )}
              variant="outlined"
            />
            {chartConfirmed && (
              <Button href="/clinic" variant="text" size="small">
                Close chart
              </Button>
            )}
          </Stack>
          {!chartConfirmed && (
            <Alert severity="info">
              {signedChart
                ? "Confirm this patient reference and encounter before viewing the signed chart."
                : existingChart
                  ? "This encounter has an in-progress chart. Confirm the patient reference and encounter before opening it."
                  : "Complete the available nurse preparation, then confirm this patient reference and encounter before opening the chart."}
            </Alert>
          )}
          {!chartConfirmed && (
            <Button
              variant="contained"
              onClick={() => setChartConfirmed(true)}
              sx={{ alignSelf: "flex-start" }}
            >
              {signedChart
                ? "Confirm and view signed chart"
                : existingChart
                  ? "Confirm and open chart"
                  : "Confirm and begin charting"}
            </Button>
          )}
        </Stack>
      </Paper>

      {chartConfirmed && (
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Typography
                ref={workspaceHeading}
                tabIndex={-1}
                variant="subtitle2"
                component="h2"
              >
                Encounter context
              </Typography>
              <Box>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  Recorded care details
                </Typography>
                {careSummaryState.status === "loading" ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    role="status"
                  >
                    Loading recorded care details…
                  </Typography>
                ) : careSummaryState.status === "error" ? (
                  <Typography variant="body2" color="text.secondary">
                    Recorded care details could not be loaded.
                  </Typography>
                ) : (
                  <CareIndicators
                    state={careSummaryState}
                    patientLabel={patient.display_name}
                    timezone={timezone}
                  />
                )}
              </Box>
              {reviewNeededTopics.length > 0 && (
                <Box>
                  <Typography variant="subtitle2">Review needed</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Use the existing review controls to record the outcome for
                    this encounter.
                  </Typography>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ mt: 1 }}
                  >
                    {reviewNeededTopics.map((topic) => (
                      <Button
                        key={topic}
                        size="small"
                        variant="outlined"
                        href={`#clinical-history-${topic}-review`}
                        onClick={(event) => {
                          event.preventDefault();
                          focusReview(topic);
                        }}
                      >
                        Review {topic.replaceAll("_", " ")}
                      </Button>
                    ))}
                  </Stack>
                </Box>
              )}
              <Divider />
              <Box>
                <Typography variant="subtitle2">Vital signs</Typography>
                {displayedObservations.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No recorded observations are available for this encounter.
                  </Typography>
                ) : (
                  <>
                    {sharedObservationTime && (
                      <Typography variant="caption" color="text.secondary">
                        Observed {sharedObservationTime}
                      </Typography>
                    )}
                    <Box className="provider-vitals-grid">
                      {displayedObservations.map((observation) => (
                        <Box key={observation.id}>
                          <Typography variant="caption" color="text.secondary">
                            {observation.display_label ||
                              observationLabel(observation.code)}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {observationValue(observation)}
                          </Typography>
                          {!sharedObservationTime && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {clinicDateTime(
                                observation.observed_at,
                                timezone,
                              )}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  </>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Values are displayed as recorded. No review status is inferred
                or stored here.
              </Typography>
            </Stack>
          </Paper>
          <Box className="provider-chart-layout">
            <ChartQuickJump />
            <Stack spacing={2} className="provider-chart-content">
              <PatientEducationPanel patient={patient} encounter={encounter} />
              <PatientClinicalHistory
                patientId={patient.id}
                encounterId={encounter.id}
                onChanged={onCareSummaryRefresh}
              />
              <Box id="chart-labs">
                <PatientLabReports
                  patientId={patient.id}
                  patientName={patient.display_name}
                  encounterId={encounter.id}
                  orderRevision={orderRevision}
                />
              </Box>
              <MedicationAdministrations
                encounter={encounter}
                patient={patient}
                timezone={timezone}
                onChanged={onCareSummaryRefresh}
              />
              <ClinicalPlanWorkspace
                patient={patient}
                encounter={encounter}
                onChanged={() => setOrderRevision((revision) => revision + 1)}
              />
              {noteWorkspace}
              <VisitWrapUp
                patient={patient}
                encounter={encounter}
                timezone={timezone}
                onEncounterRefresh={onEncounterRefresh}
              />
            </Stack>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}

type CloseState =
  | "idle"
  | "closing"
  | "reconciling"
  | "outcome_unconfirmed"
  | "not_found"
  | "rejected"
  | "committed";

const COMPLETION_DISPOSITION_LABELS: Record<
  EncounterCompletionReview["disposition_code"],
  string
> = {
  completed_as_planned: "Completed as planned",
  left_before_completion: "Patient left before completion",
  transferred_to_higher_level_of_care: "Transferred to a higher level of care",
  emergency_services: "Emergency services involved",
  other: "Other recorded outcome",
};

const COMPLETION_INSTRUCTION_LABELS: Record<
  EncounterCompletionReview["instructions_status"],
  string
> = {
  provided: "Signed written instructions provided",
  not_required: "Written instructions not required",
  unable_to_complete: "Unable to provide written instructions",
};

const COMPLETION_EDUCATION_LABELS: Record<
  EncounterCompletionReview["education_status"],
  string
> = {
  recorded: "Education and teach-back recorded",
  not_required: "Education not required for this visit",
  unable_to_complete: "Unable to complete education",
};

function VisitWrapUp({
  patient,
  encounter,
  timezone,
  onEncounterRefresh,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  timezone: string;
  onEncounterRefresh?: () => void;
}) {
  const context = useClinic();
  const completionPath = `/api/clinic/encounters/${encounter.id}/completion?patient_id=${patient.id}`;
  const completionResource = useResource<EncounterCompletionResponse>(
    completionPath,
    { retainDataOnRefresh: true },
  );
  const [completed, setCompleted] = useState<EncounterDetail | null>(null);
  const [savedReview, setSavedReview] =
    useState<EncounterCompletionReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closeState, setCloseState] = useState<CloseState>("idle");
  const [confirmation, setConfirmation] = useState<"close" | "reset" | null>(
    null,
  );
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);
  const initializedEncounterRef = useRef<number | null>(null);
  const [disposition, setDisposition] = useState<
    EncounterCompletionReview["disposition_code"] | ""
  >("");
  const [instructionsStatus, setInstructionsStatus] = useState<
    EncounterCompletionReview["instructions_status"] | ""
  >("");
  const [educationStatus, setEducationStatus] = useState<
    EncounterCompletionReview["education_status"] | ""
  >("");
  const [exceptionNote, setExceptionNote] = useState("");
  const [openWorkReviewed, setOpenWorkReviewed] = useState(false);
  const current = completed ?? encounter;
  const completion = completionResource.data;
  const evidence = completion?.evidence;
  const review = savedReview ?? completion?.completion_review ?? null;
  const formLocked = busy || closeState !== "idle";
  const exceptionRequired =
    Boolean(disposition && instructionsStatus && educationStatus) &&
    (disposition !== "completed_as_planned" ||
      instructionsStatus === "unable_to_complete" ||
      educationStatus === "unable_to_complete");

  useEffect(() => {
    if (!completion || initializedEncounterRef.current === encounter.id) return;
    initializedEncounterRef.current = encounter.id;
  }, [completion, encounter.id]);

  const redirectIfUnauthorized = (caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401) {
      window.location.replace(
        `/login?next=${encodeURIComponent(currentLoginDestination())}`,
      );
      return true;
    }
    return false;
  };

  const reconcileCommittedClose = async () => {
    setCloseState("reconciling");
    const [encounterResult, completionResult] = await Promise.all([
      api<{ encounter: EncounterDetail }>(
        encounterDetailPath(patient.id, encounter.id),
      ),
      api<EncounterCompletionResponse>(completionPath),
    ]);
    if (
      !encounterCloseMatches(
        encounterResult.encounter,
        patient.id,
        encounter.id,
      )
    ) {
      throw new Error(
        "The refreshed encounter did not match this patient, encounter, and completed status.",
      );
    }
    if (
      !completionResult.completion_review ||
      completionResult.patient_id !== patient.id ||
      completionResult.encounter_id !== encounter.id
    ) {
      throw new Error(
        "The encounter ended, but its completion review could not be confirmed.",
      );
    }
    setCompleted(encounterResult.encounter);
    setSavedReview(completionResult.completion_review);
    setCloseState("committed");
    requestKeyRef.current = null;
    setRequestKey(null);
    completionResource.refresh();
    onEncounterRefresh?.();
  };

  const endVisit = async () => {
    if (busy || closeState !== "idle" || !completion || !evidence) return;
    if (!evidence.follow_up) {
      setError(
        "Save the encounter follow-up disposition before completing this visit.",
      );
      return;
    }
    if (!disposition || !instructionsStatus || !educationStatus) {
      setError(
        "Choose the visit outcome, written-instruction status, and education status.",
      );
      return;
    }
    if (!openWorkReviewed) {
      setError(
        "Review the unfinished work and its current owner before completing this visit.",
      );
      return;
    }
    if (instructionsStatus === "provided" && !evidence.signed_instruction) {
      setError(
        "No signed patient-instruction revision is available. Refresh the checklist or choose another status.",
      );
      return;
    }
    if (
      educationStatus === "recorded" &&
      evidence.education_events.length === 0
    ) {
      setError(
        "No patient education event is available. Refresh the checklist or choose another status.",
      );
      return;
    }
    if (exceptionRequired && !exceptionNote.trim()) {
      setError("Record what happened for this completion exception.");
      return;
    }
    setConfirmation(null);
    const key = closeRequestKey(requestKeyRef.current);
    requestKeyRef.current = key;
    setRequestKey(key);
    const body = closeRequestBody(patient.id, key, {
      disposition_code: disposition,
      instructions_status: instructionsStatus,
      education_status: educationStatus,
      follow_up_id: evidence.follow_up.id,
      follow_up_version: evidence.follow_up.version,
      expected_follow_up_state: evidence.follow_up.status,
      instruction_note_revision_id:
        instructionsStatus === "provided"
          ? (evidence.signed_instruction?.revision_id ?? null)
          : null,
      expected_education_event_ids: evidence.education_events.map(
        (event) => event.id,
      ),
      expected_open_task_versions: evidence.open_tasks.map(
        (task) => `${task.id}:${task.version}`,
      ),
      open_work_reviewed: openWorkReviewed,
      exception_note: exceptionNote.trim() || null,
    });
    setBusy(true);
    setError("");
    setCloseState("closing");
    try {
      const result = await api<{
        encounter: EncounterDetail;
        completion_review: EncounterCompletionReview;
      }>(`/api/clinic/encounters/${encounter.id}/close`, {
        method: "POST",
        body,
      });
      if (
        result.completion_review.patient_id !== patient.id ||
        result.completion_review.encounter_id !== encounter.id
      ) {
        throw new Error(
          "The saved completion review did not match this patient encounter.",
        );
      }
      setSavedReview(result.completion_review);
      await reconcileCommittedClose();
    } catch (caught) {
      if (redirectIfUnauthorized(caught)) return;
      if (
        closeFailureState(
          caught instanceof ApiError ? caught.status : undefined,
          caught instanceof ApiError ? caught.message : "",
          caught instanceof ApiError ? caught.code : undefined,
        ) === "rejected"
      ) {
        setCloseState("rejected");
        setError(
          caught instanceof Error
            ? caught.message
            : "The close request was rejected.",
        );
      } else {
        setCloseState("outcome_unconfirmed");
        setError(
          "The visit close could not be confirmed. No automatic retry was made. Check the current encounter status.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const checkCloseStatus = async () => {
    const key = requestKeyRef.current;
    if (busy || !key) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ receipt: OperationReceipt }>(
        operationReceiptPath(key),
      );
      if (
        result.receipt.operation_code !== "encounters.close" ||
        result.receipt.resource_id !== encounter.id
      ) {
        throw new Error(
          "The saved close status did not match this encounter. The outcome remains unconfirmed.",
        );
      }
      if (receiptResolution(200, result.receipt.outcome) === "committed") {
        await reconcileCommittedClose();
      } else {
        setCloseState("outcome_unconfirmed");
        setError(
          "The visit close is still unconfirmed. No automatic retry was made.",
        );
      }
    } catch (caught) {
      if (redirectIfUnauthorized(caught)) return;
      if (caught instanceof ApiError && caught.status === 404) {
        setCloseState("not_found");
        setError(
          "No saved result was found for this close attempt. The outcome remains unconfirmed and no automatic retry was made.",
        );
      } else if (
        closeFailureState(
          caught instanceof ApiError ? caught.status : undefined,
          caught instanceof ApiError ? caught.message : "",
          caught instanceof ApiError ? caught.code : undefined,
        ) === "rejected"
      ) {
        setCloseState("rejected");
        setError(
          caught instanceof Error
            ? caught.message
            : "The close status request was rejected.",
        );
      } else if (caught instanceof Error) {
        setCloseState("outcome_unconfirmed");
        setError(caught.message);
      } else {
        setCloseState("outcome_unconfirmed");
        setError("The close outcome remains unconfirmed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const resetCloseAttempt = () => {
    if (busy || !requestKeyRef.current) return;
    setConfirmation(null);
    requestKeyRef.current = null;
    setRequestKey(null);
    setCloseState("idle");
    setError("");
  };

  return (
    <Stack spacing={2}>
      <EncounterFollowUpPanel
        patient={patient}
        encounter={current}
        timezone={timezone}
        onChanged={completionResource.refresh}
      />
      <Paper
        id="chart-completion"
        variant="outlined"
        sx={{ p: 2, scrollMarginTop: 16 }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle2">Visit completion review</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Confirm the recorded outcome, follow-up, patient information, and
              ownership of unfinished work before ending the encounter. This is
              not clinical discharge authorization.
            </Typography>
          </Box>
          {completionResource.error && (
            <Alert
              severity="error"
              action={
                <Button onClick={completionResource.refresh}>Retry</Button>
              }
            >
              The completion checklist could not be loaded.{" "}
              {completionResource.error}
            </Alert>
          )}
          {!completion && !completionResource.error && <LoadState />}
          {current.status === "completed" && review ? (
            <>
              <Alert severity="success" role="status" aria-live="polite">
                Completion review recorded and encounter ended{" "}
                {clinicDateTime(current.ended_at, timezone)}.
              </Alert>
              <Stack spacing={0.5} component="dl" sx={{ m: 0 }}>
                <Typography
                  component="dt"
                  variant="caption"
                  color="text.secondary"
                >
                  Recorded outcome
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {COMPLETION_DISPOSITION_LABELS[review.disposition_code]}
                </Typography>
                <Typography
                  component="dt"
                  variant="caption"
                  color="text.secondary"
                >
                  Follow-up
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {statusLabel(review.follow_up_state)}
                </Typography>
                <Typography
                  component="dt"
                  variant="caption"
                  color="text.secondary"
                >
                  Patient information
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {COMPLETION_INSTRUCTION_LABELS[review.instructions_status]} ·{" "}
                  {COMPLETION_EDUCATION_LABELS[review.education_status]}
                </Typography>
                <Typography
                  component="dt"
                  variant="caption"
                  color="text.secondary"
                >
                  Unfinished work retained
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {review.open_work_snapshot.length} open task
                  {review.open_work_snapshot.length === 1 ? "" : "s"}
                </Typography>
              </Stack>
            </>
          ) : current.status === "completed" ? (
            <Alert severity="warning">
              This encounter is closed without a linked completion review.
              Follow-up, instructions, education, and unfinished-work evidence
              must be reviewed separately.
            </Alert>
          ) : completion ? (
            <>
              {!completion.evidence.follow_up && (
                <Alert severity="warning">
                  Save the encounter follow-up disposition above before
                  completing the visit.
                </Alert>
              )}
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  select
                  fullWidth
                  label="Recorded visit outcome"
                  value={disposition}
                  onChange={(event) =>
                    setDisposition(
                      event.target
                        .value as EncounterCompletionReview["disposition_code"],
                    )
                  }
                  disabled={formLocked}
                >
                  <MenuItem value="" disabled>
                    Choose an outcome
                  </MenuItem>
                  {completion.options.disposition_codes.map((value) => (
                    <MenuItem key={value} value={value}>
                      {COMPLETION_DISPOSITION_LABELS[value]}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="Written instructions"
                  value={instructionsStatus}
                  onChange={(event) =>
                    setInstructionsStatus(
                      event.target
                        .value as EncounterCompletionReview["instructions_status"],
                    )
                  }
                  disabled={formLocked}
                >
                  <MenuItem value="" disabled>
                    Choose an instruction status
                  </MenuItem>
                  {completion.options.instructions_statuses.map((value) => (
                    <MenuItem key={value} value={value}>
                      {COMPLETION_INSTRUCTION_LABELS[value]}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="Education and teach-back"
                  value={educationStatus}
                  onChange={(event) =>
                    setEducationStatus(
                      event.target
                        .value as EncounterCompletionReview["education_status"],
                    )
                  }
                  disabled={formLocked}
                >
                  <MenuItem value="" disabled>
                    Choose an education status
                  </MenuItem>
                  {completion.options.education_statuses.map((value) => (
                    <MenuItem key={value} value={value}>
                      {COMPLETION_EDUCATION_LABELS[value]}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Alert
                severity={
                  completion.evidence.signed_instruction ? "info" : "warning"
                }
              >
                {completion.evidence.signed_instruction
                  ? `Signed written instructions are available from note revision ${completion.evidence.signed_instruction.revision_no}.`
                  : "No signed note revision with written patient instructions is available."}
              </Alert>
              <Alert
                severity={
                  completion.evidence.education_events.length
                    ? "info"
                    : "warning"
                }
              >
                {completion.evidence.education_events.length
                  ? `${completion.evidence.education_events.length} education record${completion.evidence.education_events.length === 1 ? "" : "s"} will be linked to this completion review.`
                  : "No education or teach-back record is available for this encounter."}
              </Alert>
              <Box>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    alignItems: { sm: "center" },
                    justifyContent: "space-between",
                  }}
                >
                  <Typography variant="subtitle2">
                    Unfinished work ownership
                  </Typography>
                  <Button
                    size="small"
                    onClick={completionResource.refresh}
                    disabled={formLocked}
                  >
                    Refresh checklist
                  </Button>
                </Stack>
                {completion.evidence.open_tasks.length ? (
                  <Stack component="ul" spacing={0.5} sx={{ pl: 3, mb: 1 }}>
                    {completion.evidence.open_tasks.map((task) => (
                      <Typography component="li" variant="body2" key={task.id}>
                        {statusLabel(task.task_kind)} ·{" "}
                        {statusLabel(task.state)} ·{" "}
                        {task.assigned_to_membership_id
                          ? "Assigned staff member"
                          : `${statusLabel(task.pool_code)} pool`}
                      </Typography>
                    ))}
                  </Stack>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ my: 1 }}
                  >
                    No open encounter tasks are recorded.
                  </Typography>
                )}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={openWorkReviewed}
                      onChange={(event) =>
                        setOpenWorkReviewed(event.target.checked)
                      }
                      disabled={formLocked}
                    />
                  }
                  label="I reviewed the current owner or pool for every unfinished item. These tasks remain open after encounter completion."
                />
              </Box>
              {exceptionRequired && (
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  label="Completion exception note"
                  value={exceptionNote}
                  onChange={(event) => setExceptionNote(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                  required
                  disabled={formLocked}
                  helperText="Record what happened and the immediate operational handoff. Do not copy the clinical note."
                />
              )}
            </>
          ) : null}
          {error && <ErrorMessage message={error} />}
          {closeState === "reconciling" && (
            <Box role="status" aria-live="polite" aria-atomic="true">
              Verifying the committed completion review against this patient and
              encounter…
            </Box>
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            {current.status === "open" &&
              context.capabilities.encounters &&
              completion?.can_complete && (
                <Button
                  variant="contained"
                  color="warning"
                  onClick={() => setConfirmation("close")}
                  disabled={formLocked || !completion.evidence.follow_up}
                >
                  {busy ? "Completing encounter…" : "Complete encounter"}
                </Button>
              )}
            {requestKey && closeState !== "committed" && (
              <Button
                variant="outlined"
                onClick={() => void checkCloseStatus()}
                disabled={busy}
              >
                {busy && closeState !== "closing"
                  ? "Checking completion status…"
                  : "Check completion status"}
              </Button>
            )}
            {requestKey && closeState !== "committed" && !busy && (
              <Button variant="text" onClick={() => setConfirmation("reset")}>
                Reset completion attempt
              </Button>
            )}
            <Button href="/clinic" variant="outlined">
              Return to tracking board
            </Button>
            {current.status === "completed" &&
              context.capabilities.billing_read === true && (
                <Button
                  href={`/clinic/billing/patients?patient_id=${patient.id}&encounter_id=${current.id}`}
                  variant="contained"
                >
                  Continue to checkout
                </Button>
              )}
          </Stack>
        </Stack>
      </Paper>
      <Dialog
        open={confirmation !== null}
        onClose={() => !busy && setConfirmation(null)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="encounter-close-title"
      >
        <DialogTitle id="encounter-close-title">
          {confirmation === "reset"
            ? "Reset completion attempt?"
            : "Complete encounter?"}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>
            {patient.display_name} · Encounter #{encounter.id}
          </Typography>
          <Typography color="text.secondary">
            {confirmation === "reset"
              ? "Resetting clears this local attempt. Verify the encounter and completion-review status before trying again."
              : "This records the completion review, ends the encounter, completes the linked appointment when applicable, and makes the visit eligible for checkout. Open tasks remain open with their recorded owner or pool."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(null)} disabled={busy}>
            Go back
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={busy}
            onClick={() =>
              confirmation === "reset" ? resetCloseAttempt() : void endVisit()
            }
          >
            {confirmation === "reset" ? "Reset attempt" : "Confirm completion"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function EncounterView({
  patient,
  encounter,
  observations,
  timezone,
  noteWorkspace,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  observations: Observation[];
  timezone: string;
  noteWorkspace?: ReactNode;
}) {
  const reference = patientReferenceLabel(patient.reference);
  return (
    <>
      <a href={`/clinic/patients/${patient.id}`}>← {patient.display_name}</a>
      {noteWorkspace ? (
        <div className="care-encounter-workspace">{noteWorkspace}</div>
      ) : (
        <>
          <div className="care-heading">
            <div>
              <p className="eyebrow">ENCOUNTER #{encounter.id}</p>
              <h1>{patient.display_name}</h1>
              {reference && (
                <p className="clinic-lead">Reference: {reference}</p>
              )}
            </div>
            <span className="care-status care-status-large">
              {statusLabel(encounter.status)}
            </span>
          </div>
          <div className="care-summary">
            <div>
              <span>Started</span>
              <strong>{clinicDateTime(encounter.started_at, timezone)}</strong>
            </div>
            <div>
              <span>Ended</span>
              <strong>{clinicDateTime(encounter.ended_at, timezone)}</strong>
            </div>
            <div>
              <span>Participants</span>
              <strong>{encounter.participants.length}</strong>
            </div>
            <div>
              <span>Documents</span>
              <strong>{encounter.document_count}</strong>
            </div>
          </div>
          <div className="care-grid">
            <Card title="Recorded observations">
              {observations.length === 0 ? (
                <p>No observations are associated with this encounter.</p>
              ) : (
                <dl className="care-observations">
                  {observations.map((observation) => (
                    <div key={observation.id}>
                      <dt>{observation.code}</dt>
                      <dd>
                        <strong>{observationValue(observation)}</strong>
                        <span>
                          {clinicDateTime(observation.observed_at, timezone)} ·{" "}
                          {observation.code_system}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="clinic-fine-print">
                Values are displayed as recorded. This interface does not infer
                normal ranges, readiness or clinical priority.
              </p>
            </Card>
            <Card title="Clinical note">
              <div className="care-blocked">
                <strong>Editor unavailable</strong>
                <span>The protected note workspace was not loaded.</span>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export function EncounterPage({
  patientId,
  encounterId,
}: {
  patientId: string;
  encounterId: string;
}) {
  const context = useClinic();
  const patient = useResource<{ patient: Patient }>(
    `/api/clinic/patients/${patientId}`,
  );
  const encounter = useResource<{ encounter: EncounterDetail }>(
    encounterDetailPath(patientId, encounterId),
    { retainDataOnRefresh: true },
  );
  const observations = useResource<{
    observations: Observation[];
    pagination: PageInfo;
  }>(
    `/api/clinic/patients/${patientId}/observations?encounter_id=${encounterId}`,
  );
  const careSummary = useResource<PatientCareSummary>(
    `/api/clinic/patients/${patientId}/care_summary?encounter_id=${encounterId}`,
  );
  const error = patient.error || encounter.error || observations.error;
  if (!patient.data || !encounter.data || !observations.data)
    return <LoadState error={error} />;
  if (encounter.data.encounter.patient_id !== patient.data.patient.id)
    return (
      <ErrorMessage message="This encounter does not belong to the selected patient." />
    );
  return (
    <EncounterView
      patient={patient.data.patient}
      encounter={encounter.data.encounter}
      observations={observations.data.observations}
      timezone={context.practice.timezone}
      noteWorkspace={
        <ProviderEncounterWorkflow
          key={`${patientId}:${encounterId}`}
          patient={patient.data.patient}
          encounter={encounter.data.encounter}
          observations={observations.data.observations}
          timezone={context.practice.timezone}
          careSummaryState={
            careSummary.data
              ? { status: "ready", summary: careSummary.data }
              : careSummary.error
                ? { status: "error" }
                : { status: "loading" }
          }
          onEncounterRefresh={encounter.refresh}
          onCareSummaryRefresh={careSummary.refresh}
          noteWorkspace={
            <SoapNoteWorkspace
              encounter={encounter.data.encounter}
              patientName={patient.data.patient.display_name}
              onChanged={encounter.refresh}
            />
          }
        />
      }
    />
  );
}

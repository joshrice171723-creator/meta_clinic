import type {
  Appointment,
  Clinician,
  ClinicWorkspaceContext,
  Encounter,
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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "../../api/client";
import { businessNow } from "../../shared/businessDate";
import {
  Alert,
  Box,
  Button,
  Card as MuiCard,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
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
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { Card, ErrorMessage, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { CareIndicators, type CareSummaryLoadState } from "./CareIndicators";
import { useClinicNavigation } from "./clinicNavigation";
import { ReviewOfSystems } from "./ReviewOfSystems";
import { HistoryOfPresentIllness } from "./HistoryOfPresentIllness";
import { appendPrevisitNote, PrevisitNoteImport } from "./PrevisitNoteImport";
import { VitalSignsEntry } from "./VitalSignsEntry";
import { VisitInstructionHandout } from "../../shared/VisitInstructionHandout";
import { PatientClinicalHistory } from "./PatientClinicalHistory";
import { patientReferenceLabel } from "./patientReference";
import { PatientLabReports } from "./PatientLabReports";
import { MedicationAdministrations } from "./MedicationAdministrations";
import { EncounterNoteSigning } from "./EncounterNoteSigning";

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
  patientId: string;
  startsAt: string;
  endsAt: string;
  siteId: string;
  roomId: string;
  clinicianId: string;
  visitTypeId: string;
};

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

export function closeRequestBody(patientId: number, requestKey: string) {
  return { close: { patient_id: patientId, request_key: requestKey } };
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
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
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
  identityLookup = false,
  initialPatientId,
}: {
  timezone: string;
  onCreated?: (appointment: Appointment) => void;
  identityLookup?: boolean;
  initialPatientId?: number;
}) {
  const { registerBlocker } = useClinicNavigation();
  const [baseline, setBaseline] = useState<BookingDraft>(() => {
    const defaults = appointmentDefaults();
    return {
      patientId: initialPatientId ? String(initialPatientId) : "",
      startsAt: defaults.startsAt,
      endsAt: defaults.endsAt,
      siteId: "",
      roomId: "",
      clinicianId: "",
      visitTypeId: "",
    };
  });
  const [patientId, setPatientId] = useState(baseline.patientId);
  const [replacementPatientId, setReplacementPatientId] = useState<
    number | undefined
  >(initialPatientId);
  const [replacementPatient, setReplacementPatient] = useState<Patient>();
  const [replacementPatientError, setReplacementPatientError] = useState("");
  const [replacementPatientLoading, setReplacementPatientLoading] = useState(
    Boolean(initialPatientId),
  );
  const [startsAt, setStartsAt] = useState(baseline.startsAt);
  const [endsAt, setEndsAt] = useState(baseline.endsAt);
  const [siteId, setSiteId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [visitTypeId, setVisitTypeId] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [created, setCreated] = useState<Appointment>();
  const dirty = bookingDraftHasChanges(
    { patientId, startsAt, endsAt, siteId, roomId, clinicianId, visitTypeId },
    baseline,
  );
  const patients = useResource<{ patients: Patient[] }>(
    identityLookup
      ? "/api/clinic/patients/lookup?per_page=100"
      : "/api/clinic/patients?per_page=100",
  );
  const facilities = useResource<{ sites: FacilitySite[] }>(
    "/api/clinic/facilities?type=sites",
  );
  const rooms = useResource<{ rooms: FacilityRoom[] }>(
    "/api/clinic/facilities?type=rooms&per_page=100",
  );
  const clinicians = useResource<{ clinicians: Clinician[] }>(
    "/api/clinic/clinicians?per_page=100",
  );
  const visitTypes = useResource<{ visit_types: VisitType[] }>(
    "/api/clinic/facilities?type=visit_types&per_page=100",
  );
  useEffect(() => {
    if (!replacementPatientId) {
      setReplacementPatient(undefined);
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
            "The replacement patient could not be verified. Choose a patient before scheduling.",
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
            : "The replacement patient could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setReplacementPatientLoading(false);
      });
    return () => controller.abort();
  }, [replacementPatientId]);
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
              "This appointment draft has unsaved changes. Leave scheduling and discard them?"
          : null,
      ),
    [dirty, registerBlocker],
  );
  const resourceError =
    patients.error ||
    facilities.error ||
    rooms.error ||
    clinicians.error ||
    visitTypes.error;
  if (
    !patients.data ||
    !facilities.data ||
    !rooms.data ||
    !clinicians.data ||
    !visitTypes.data
  )
    return <LoadState error={resourceError} />;
  const clearReplacementPatient = () => {
    setPatientId("");
    setReplacementPatientId(undefined);
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
          Clear replacement patient
        </Button>
      </Stack>
    );
  const selectablePatients = replacementPatient
    ? [
        replacementPatient,
        ...patients.data.patients.filter(
          (patient) => patient.id !== replacementPatient.id,
        ),
      ]
    : patients.data.patients;
  const availableRooms = siteId
    ? rooms.data.rooms.filter((room) => room.site_id === Number(siteId))
    : [];
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
    });
    setPatientId("");
    setReplacementPatientId(undefined);
    setStartsAt(next.startsAt);
    setEndsAt(next.endsAt);
    setSiteId("");
    setRoomId("");
    setClinicianId("");
    setVisitTypeId("");
    setShowDetails(false);
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
          </Alert>
        )}
        {replacementPatient && (
          <Alert
            severity="info"
            sx={{ mb: 3 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={clearReplacementPatient}
              >
                Clear patient
              </Button>
            }
          >
            Scheduling a new appointment for{" "}
            {patientDisplayLabel(replacementPatient)}. This does not reopen the
            cancelled or no-show appointment.
          </Alert>
        )}
        <Box
          component="form"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitError("");
            if (!patientId)
              return setSubmitError("Select a patient before scheduling.");
            if (intervalError) return setSubmitError(intervalError);
            setBusy(true);
            try {
              const result = await api<{ appointment: Appointment }>(
                "/api/clinic/appointments",
                {
                  method: "POST",
                  body: {
                    appointment: {
                      patient_id: patientId,
                      starts_at: new Date(startsAt).toISOString(),
                      ends_at: new Date(endsAt).toISOString(),
                      site_id: siteId,
                      room_id: roomId,
                      booked_clinician_id: clinicianId,
                      visit_type_id: visitTypeId,
                    },
                  },
                },
              );
              setCreated(result.appointment);
              reset();
              onCreated?.(result.appointment);
            } catch (reason) {
              setSubmitError(
                reason instanceof Error
                  ? reason.message
                  : "The appointment could not be scheduled.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Stack spacing={2.5}>
            <TextField
              label="Patient"
              select
              required
              value={patientId}
              onChange={(event) => {
                const nextPatientId = event.target.value;
                setPatientId(nextPatientId);
                if (
                  replacementPatientId &&
                  nextPatientId !== String(replacementPatientId)
                ) {
                  setReplacementPatientId(undefined);
                }
              }}
              fullWidth
              helperText={
                selectablePatients.length
                  ? "Choose the patient record for this visit."
                  : "No patients are available to schedule."
              }
            >
              <MenuItem value="" disabled>
                Select a patient
              </MenuItem>
              {selectablePatients.map((patient) => (
                <MenuItem key={patient.id} value={patient.id.toString()}>
                  {patientDisplayLabel(patient)}
                </MenuItem>
              ))}
            </TextField>
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
                  onClick={() => setDuration(minutes)}
                >
                  {minutes} min
                </Button>
              ))}
            </Stack>
            <Alert severity="info" variant="outlined">
              Times are entered in this device’s local timezone and shown on the
              schedule in {timezone}.
            </Alert>
            <Button
              variant="text"
              onClick={() => setShowDetails((value) => !value)}
              sx={{ alignSelf: "flex-start" }}
              aria-expanded={showDetails}
            >
              {showDetails
                ? "Hide optional details"
                : "Add location, clinician, and visit type"}
            </Button>
            <Collapse in={showDetails} unmountOnExit>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 2,
                  pt: 0.5,
                }}
              >
                <FormControl fullWidth>
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
                    <MenuItem value="">Not assigned</MenuItem>
                    {facilities.data.sites.map((site) => (
                      <MenuItem key={site.id} value={site.id.toString()}>
                        {site.code}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth disabled={!siteId}>
                  <InputLabel id="room-label">Room</InputLabel>
                  <Select
                    labelId="room-label"
                    label="Room"
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value)}
                  >
                    <MenuItem value="">Not assigned</MenuItem>
                    {availableRooms.map((room) => (
                      <MenuItem key={room.id} value={room.id.toString()}>
                        {room.code}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel id="clinician-label">Booked clinician</InputLabel>
                  <Select
                    labelId="clinician-label"
                    label="Booked clinician"
                    value={clinicianId}
                    onChange={(event) => setClinicianId(event.target.value)}
                  >
                    <MenuItem value="">Not assigned</MenuItem>
                    {clinicians.data.clinicians.map((clinician) => (
                      <MenuItem
                        key={clinician.id}
                        value={clinician.id.toString()}
                      >
                        {clinician.reference ??
                          `Clinician profile #${clinician.id}`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel id="visit-type-label">Visit type</InputLabel>
                  <Select
                    labelId="visit-type-label"
                    label="Visit type"
                    value={visitTypeId}
                    onChange={(event) => setVisitTypeId(event.target.value)}
                  >
                    <MenuItem value="">Not specified</MenuItem>
                    {visitTypes.data.visit_types
                      .filter((type) => !type.retired_at)
                      .map((type) => (
                        <MenuItem key={type.id} value={type.id.toString()}>
                          {type.code}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Box>
            </Collapse>
            {submitError && (
              <Alert severity="error" role="alert">
                {submitError}
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
                onClick={reset}
                disabled={busy}
              >
                Clear
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={busy || !selectablePatients.length}
                startIcon={
                  busy ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : undefined
                }
              >
                {busy ? "Scheduling…" : "Schedule appointment"}
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
}: {
  context: ClinicWorkspaceContext;
  appointments: Appointment[];
  pagination: PageInfo;
  onAppointmentCreated?: (appointment: Appointment) => void;
  onPageChange?: (page: number) => void;
  initialPatientId?: number;
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
        Read-only scheduled visits from the clinic API. A scheduled time is not
        an arrival or a place in the tracking-board queue.
      </Alert>
      {bookingAvailability(context.capabilities).visible && (
        <BookingForm
          timezone={context.practice.timezone}
          identityLookup={
            bookingAvailability(context.capabilities).identityLookup
          }
          initialPatientId={initialPatientId}
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
                          {appointment.room_id === null
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

export function Schedule() {
  const context = useClinic();
  const replacementPatientId = Number(
    new URLSearchParams(window.location.search).get("patient_id"),
  );
  const initialPatientId =
    Number.isSafeInteger(replacementPatientId) && replacementPatientId > 0
      ? replacementPatientId
      : undefined;
  const [page, setPage] = useState(1);
  const [createdAppointment, setCreatedAppointment] = useState<Appointment>();
  const { data, error } = useResource<{
    appointments: Appointment[];
    pagination: PageInfo;
  }>(`/api/clinic/appointments?page=${page}`);
  if (!data) return <LoadState error={error} />;
  const includesCreated = data.appointments.some(
    (appointment) => appointment.id === createdAppointment?.id,
  );
  const appointments =
    createdAppointment && !includesCreated
      ? [...data.appointments, createdAppointment].sort((left, right) =>
          left.starts_at.localeCompare(right.starts_at),
        )
      : data.appointments;
  return (
    <ScheduleView
      context={context}
      appointments={appointments}
      pagination={{
        ...data.pagination,
        total:
          data.pagination.total +
          (createdAppointment && !includesCreated ? 1 : 0),
      }}
      onAppointmentCreated={setCreatedAppointment}
      onPageChange={setPage}
      initialPatientId={initialPatientId}
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
};

type CorrectionTarget = {
  revisionId: number;
  revisionNo: number;
  reason: string;
};

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
  const initialSections = savedBody?.sections ?? EMPTY_SOAP_SECTIONS;
  const initialPatientInstructions = savedBody?.patient_instructions ?? "";
  const [sections, setSections] = useState<SoapNoteSections>(initialSections);
  const [patientInstructions, setPatientInstructions] = useState(
    initialPatientInstructions,
  );
  const [appliedTemplate, setAppliedTemplate] = useState<{
    id: string;
    version: number;
  } | null>(
    savedBody
      ? { id: savedBody.template_id, version: savedBody.template_version }
      : templates[0]
        ? { id: templates[0].id, version: templates[0].version }
        : null,
  );
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
  const saveAttemptRef = useRef<NoteSaveAttempt | null>(null);
  const dirty =
    SOAP_SECTION_LABELS.some(
      ([key]) => sections[key] !== initialSections[key],
    ) || patientInstructions !== initialPatientInstructions;
  const signed = note?.current_revision?.signed === true;
  const editorDisabled =
    busy ||
    !noteSaveAllowsMutation(saveState) ||
    (signed && !correctionTarget) ||
    !canWrite;
  useEffect(() => {
    if (saveAttemptRef.current) return;
    setSections(initialSections);
    setPatientInstructions(initialPatientInstructions);
    if (savedBody) {
      setAppliedTemplate({
        id: savedBody.template_id,
        version: savedBody.template_version,
      });
    }
  }, [
    savedBody?.template_id,
    savedBody?.template_version,
    savedBody?.patient_instructions,
    note?.current_revision?.revision_no,
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
      (signed && !correctionTarget) ||
      !canWrite ||
      (!dirty && !correctionTarget)
    )
      return;
    const operationCode = correctionTarget
      ? "notes.correct"
      : note?.current_revision
        ? "notes.revise"
        : "notes.create";
    const attempt: NoteSaveAttempt = {
      requestKey: noteSaveRequestKey(
        saveAttemptRef.current?.requestKey ?? null,
      ),
      operationCode,
      noteId: note?.id ?? null,
      expectedRevision: correctionTarget
        ? correctionTarget.revisionNo + 1
        : note?.current_revision
          ? note.current_revision.revision_no + 1
          : 1,
    };
    saveAttemptRef.current = attempt;
    setRequestKey(attempt.requestKey);
    setBusy(true);
    setError("");
    setNotice("");
    setSaveState("saving");
    const fields = {
      template_id: appliedTemplate.id,
      template_version: appliedTemplate.version,
      ...sections,
      patient_instructions: patientInstructions,
    };
    try {
      if (
        (attempt.operationCode === "notes.revise" ||
          attempt.operationCode === "notes.correct") &&
        note?.current_revision
      ) {
        await api<{ revision: { revision_no: number } }>(
          attempt.operationCode === "notes.correct"
            ? `/api/clinic/notes/${note.id}/corrections`
            : `/api/clinic/notes/${note.id}/revisions`,
          {
            method: "POST",
            body: noteSaveRequestBody(
              attempt.operationCode,
              fields,
              attempt.requestKey,
              note.current_revision.revision_no,
              correctionTarget
                ? {
                    reason: correctionTarget.reason,
                    expectedRevisionId: correctionTarget.revisionId,
                    expectedRevision: correctionTarget.revisionNo,
                  }
                : undefined,
            ),
          },
        );
      } else {
        const result = await api<{ note: EncounterNote }>(
          `/api/clinic/encounters/${encounterId}/notes`,
          {
            method: "POST",
            body: noteSaveRequestBody(
              attempt.operationCode,
              fields,
              attempt.requestKey,
            ),
          },
        );
        attempt.noteId = result.note.id;
      }
      const reconciled = await reconcileNoteSave(attempt);
      completeNoteSave(attempt, reconciled);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.replace("/login");
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

  const completeNoteSave = (
    attempt: NoteSaveAttempt,
    reconciled: EncounterNote,
  ) => {
    const body = reconciled.current_revision?.body;
    if (body) {
      setSections(body.sections);
      setPatientInstructions(body.patient_instructions ?? "");
      setAppliedTemplate({
        id: body.template_id,
        version: body.template_version,
      });
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
          "The protected receipt did not match this note save attempt.",
        );
      if (result.receipt.outcome !== "committed") {
        setSaveState("outcome_unconfirmed");
        setError(
          "The protected receipt says the save outcome is unconfirmed. The draft remains blocked; no automatic retry was made.",
        );
        return;
      }
      const reconciled = await reconcileNoteSave(attempt);
      completeNoteSave(attempt, reconciled);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (caught instanceof ApiError && caught.status === 404) {
        setSaveState("not_found");
        setError(
          "No protected save receipt was found. The outcome remains unconfirmed; choose a deliberate reset before retrying.",
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

  const resetSaveAttempt = () => {
    if (busy || !saveAttemptRef.current) return;
    setResetConfirmation(false);
    saveAttemptRef.current = null;
    setRequestKey(null);
    setSaveState("idle");
    setError("");
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
            <TextField
              key={key}
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
      <Box role="status" aria-live="polite" aria-atomic="true">
        {saveState === "saving"
          ? "Saving unsigned draft…"
          : saveState === "reconciling"
            ? "Verifying the protected receipt, note, and encounter…"
            : notice}
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        {(!signed || correctionTarget) && (
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={
              busy ||
              !canWrite ||
              (!dirty && !correctionTarget) ||
              !noteSaveAllowsMutation(saveState) ||
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
          />
        )}
      </Stack>
      <Dialog
        open={resetConfirmation}
        onClose={() => !busy && setResetConfirmation(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reset save attempt?</DialogTitle>
        <DialogContent>
          Check the saved note before clearing this request key. Resetting does
          not send another save request.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetConfirmation(false)} disabled={busy}>
            Go back
          </Button>
          <Button onClick={resetSaveAttempt} disabled={busy}>
            Reset attempt
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
    ["HPI", "#chart-hpi"],
    ["ROS", "#chart-ros"],
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
  const [chartType, setChartType] = useState("soap");
  const signedChart = encounterHasSignedSoapNote(encounter);
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
    if (chartConfirmed) workspaceHeading.current?.focus();
  }, [chartConfirmed]);

  return (
    <Stack spacing={2} className="provider-encounter-workflow">
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
                  <TableCell component="th">Primary Care</TableCell>
                  <TableCell>Not recorded</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Last Name</TableCell>
                  <TableCell>
                    {patient.display_name.split(",")[0]?.trim() ||
                      "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Age</TableCell>
                  <TableCell>
                    {patientAge(
                      patient.demographics?.date_of_birth,
                      encounter.started_at,
                    )}
                  </TableCell>
                  <TableCell component="th">Member</TableCell>
                  <TableCell>Not recorded</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">First Name</TableCell>
                  <TableCell>
                    {patient.display_name.split(",")[1]?.trim() ||
                      patient.display_name ||
                      "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Sex</TableCell>
                  <TableCell>
                    {patient.demographics?.sex || "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Phone</TableCell>
                  <TableCell>
                    {patient.contacts?.find((contact) => contact.preferred)
                      ?.contact_value ||
                      patient.contacts?.[0]?.contact_value ||
                      "Not recorded"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Birthdate</TableCell>
                  <TableCell>
                    {patient.demographics?.date_of_birth || "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Heart Rate</TableCell>
                  <TableCell>
                    {observationByLabel(observations, /heart\s*rate/i)}
                  </TableCell>
                  <TableCell component="th">Blood Pressure</TableCell>
                  <TableCell>{bloodPressureValue(observations)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Weight</TableCell>
                  <TableCell>
                    {observationByLabel(observations, /weight/i)}
                  </TableCell>
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
          {capabilities.observations_write === true && (
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <VitalSignsEntry
                key={`${patient.id}:${encounter.id}`}
                patientId={patient.id}
                patientName={patient.display_name}
                encounterId={encounter.id}
                onRecorded={(saved) =>
                  setRecordedObservations((current) => [
                    ...current,
                    ...saved.filter(
                      (observation) =>
                        observation.patient_id === patient.id &&
                        observation.encounter_id === encounter.id,
                    ),
                  ])
                }
              />
            </Box>
          )}
          {!chartConfirmed && (
            <Box className="chart-type-picker">
              <Typography variant="subtitle2">Choose a chart</Typography>
              <Typography variant="body2" color="text.secondary">
                Select the type of chart to open for this encounter.
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={chartType}
                onChange={(_, value) => value && setChartType(value)}
                aria-label="Chart type"
                size="small"
              >
                <ToggleButton value="soap">SOAP</ToggleButton>
                <ToggleButton value="chest-pain" disabled>
                  Chest Pain
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" color="text.secondary">
                Additional complaint-specific charts will appear as they are
                implemented.
              </Typography>
            </Box>
          )}
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "flex-end" }}
          >
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
          </Stack>
          {!chartConfirmed && (
            <Alert severity="warning">
              {signedChart
                ? "Confirm this patient reference and encounter before viewing the signed chart. Viewing the chart does not accept a handoff or assign a provider."
                : existingChart
                  ? "This encounter has an in-progress chart. Confirm the patient reference and encounter before opening it."
                  : "Confirm this patient reference and encounter before opening the chart. Opening the chart does not accept a handoff or assign a provider."}
            </Alert>
          )}
          {!chartConfirmed && (
            <Button
              variant="contained"
              onClick={() => chartType === "soap" && setChartConfirmed(true)}
              disabled={chartType !== "soap"}
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
        <Box className="provider-chart-layout">
          <ChartQuickJump />
          <Stack spacing={2} className="provider-chart-content">
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
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {observation.display_label ||
                                observationLabel(observation.code)}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600 }}
                            >
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
            <PatientClinicalHistory
              patientId={patient.id}
              encounterId={encounter.id}
              onChanged={onCareSummaryRefresh}
            />
            <Box id="chart-labs">
              <PatientLabReports
                patientId={patient.id}
                patientName={patient.display_name}
              />
            </Box>
            <MedicationAdministrations
              encounter={encounter}
              patient={patient}
              timezone={timezone}
              onChanged={onCareSummaryRefresh}
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
  const [completed, setCompleted] = useState<EncounterDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closeState, setCloseState] = useState<CloseState>("idle");
  const [confirmation, setConfirmation] = useState<"close" | "reset" | null>(
    null,
  );
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);
  const current = completed ?? encounter;

  const redirectIfUnauthorized = (caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401) {
      window.location.replace("/login");
      return true;
    }
    return false;
  };

  const reconcileCommittedClose = async () => {
    setCloseState("reconciling");
    const result = await api<{ encounter: EncounterDetail }>(
      encounterDetailPath(patient.id, encounter.id),
    );
    if (!encounterCloseMatches(result.encounter, patient.id, encounter.id)) {
      throw new Error(
        "The refreshed encounter did not match this patient, encounter, and completed status.",
      );
    }
    setCompleted(result.encounter);
    setCloseState("committed");
    requestKeyRef.current = null;
    setRequestKey(null);
    onEncounterRefresh?.();
  };

  const endVisit = async () => {
    if (busy || closeState !== "idle") return;
    setConfirmation(null);
    const key = closeRequestKey(requestKeyRef.current);
    requestKeyRef.current = key;
    setRequestKey(key);
    setBusy(true);
    setError("");
    setCloseState("closing");
    try {
      await api<{ encounter: EncounterDetail }>(
        `/api/clinic/encounters/${encounter.id}/close`,
        {
          method: "POST",
          body: closeRequestBody(patient.id, key),
        },
      );
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
          "The encounter close outcome is unconfirmed. No automatic retry was made. Check the retained close status explicitly.",
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
          "The close receipt did not match this encounter. The outcome remains unconfirmed.",
        );
      }
      if (receiptResolution(200, result.receipt.outcome) === "committed") {
        await reconcileCommittedClose();
      } else {
        setCloseState("outcome_unconfirmed");
        setError(
          "The retained receipt says the encounter close outcome is unconfirmed. No automatic retry was made.",
        );
      }
    } catch (caught) {
      if (redirectIfUnauthorized(caught)) return;
      if (caught instanceof ApiError && caught.status === 404) {
        setCloseState("not_found");
        setError(
          "No close receipt was found. The encounter close outcome remains unconfirmed; no automatic retry was made.",
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
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        <Typography variant="subtitle2">Visit wrap-up</Typography>
        {current.status === "completed" ? (
          <Alert severity="success" role="status" aria-live="polite">
            Encounter ended {clinicDateTime(current.ended_at, timezone)}. Note
            signing, discharge, checkout, and handoff remain separate.
          </Alert>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Close after saving documentation. This records the encounter end
            time only; note signing, discharge, checkout, and handoff remain
            separate.
          </Typography>
        )}
        {error && <ErrorMessage message={error} />}
        {closeState === "reconciling" && (
          <Box role="status" aria-live="polite" aria-atomic="true">
            Verifying the committed close against this patient and encounter…
          </Box>
        )}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          {current.status === "open" && context.capabilities.encounters && (
            <Button
              variant="contained"
              color="warning"
              onClick={() => setConfirmation("close")}
              disabled={busy || closeState !== "idle"}
            >
              {busy ? "Closing encounter…" : "Close encounter"}
            </Button>
          )}
          {requestKey && closeState !== "committed" && (
            <Button
              variant="outlined"
              onClick={() => void checkCloseStatus()}
              disabled={busy}
            >
              {busy && closeState !== "closing"
                ? "Checking close status…"
                : "Check close status"}
            </Button>
          )}
          {requestKey && closeState !== "committed" && !busy && (
            <Button variant="text" onClick={() => setConfirmation("reset")}>
              Reset close attempt
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
      <Dialog
        open={confirmation !== null}
        onClose={() => !busy && setConfirmation(null)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="encounter-close-title"
      >
        <DialogTitle id="encounter-close-title">
          {confirmation === "reset"
            ? "Reset close attempt?"
            : "Close encounter?"}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>
            {patient.display_name} · Encounter #{encounter.id}
          </Typography>
          <Typography color="text.secondary">
            {confirmation === "reset"
              ? "Resetting clears this local request key. Verify the encounter status before sending another close request."
              : "Save your note changes before continuing. Closing records the encounter end time; you can continue to checkout afterward."}
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
            {confirmation === "reset" ? "Reset attempt" : "Confirm close"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
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

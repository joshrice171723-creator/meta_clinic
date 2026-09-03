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
import {
  Alert,
  Box,
  Button,
  Card as MuiCard,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControl,
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

export function encounterDetailPath(
  patientId: string | number,
  encounterId: string | number,
) {
  return `/api/clinic/encounters/${encodeURIComponent(String(encounterId))}?patient_id=${encodeURIComponent(String(patientId))}`;
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
  operationCode: "notes.create" | "notes.revise",
  fields: Record<string, unknown>,
  requestKey: string,
  expectedRevision?: number,
) {
  return operationCode === "notes.create"
    ? {
        encounter_note: {
          note_kind: "soap",
          ...fields,
          request_key: requestKey,
        },
      }
    : {
        revision: {
          ...fields,
          expected_revision: expectedRevision,
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
    (note) => note.note_kind === "soap" && note.signed,
  );
}

export function noteReceiptMatches(
  receipt: OperationReceipt,
  operationCode: "notes.create" | "notes.revise",
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
    !value.signed &&
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

function localDateTimeValue(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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
}: {
  timezone: string;
  onCreated?: (appointment: Appointment) => void;
  identityLookup?: boolean;
}) {
  const defaults = appointmentDefaults();
  const [patientId, setPatientId] = useState("");
  const [startsAt, setStartsAt] = useState(defaults.startsAt);
  const [endsAt, setEndsAt] = useState(defaults.endsAt);
  const [siteId, setSiteId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [visitTypeId, setVisitTypeId] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [created, setCreated] = useState<Appointment>();
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
    setPatientId("");
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
              onChange={(event) => setPatientId(event.target.value)}
              fullWidth
              helperText={
                patients.data.patients.length
                  ? "Choose the patient record for this visit."
                  : "No patients are available to schedule."
              }
            >
              <MenuItem value="" disabled>
                Select a patient
              </MenuItem>
              {patients.data.patients.map((patient) => (
                <MenuItem key={patient.id} value={patient.id.toString()}>
                  {patient.display_name} · {patient.reference}
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
                        Clinician profile #{clinician.id}
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
                disabled={busy || !patients.data.patients.length}
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
}: {
  context: ClinicWorkspaceContext;
  appointments: Appointment[];
  pagination: PageInfo;
  onAppointmentCreated?: (appointment: Appointment) => void;
  onPageChange?: (page: number) => void;
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
                            {appointment.patient?.display_name ?? "Patient"} ·{" "}
                            {appointment.patient?.reference ??
                              "Reference unavailable"}
                          </Link>
                        ) : (
                          <Typography color="text.secondary">
                            {appointment.patient?.display_name ?? "Patient"} ·{" "}
                            {appointment.patient?.reference ??
                              "Reference unavailable"}
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
                {statusLabel(encounter.status)}
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
      return [observation.numeric_value, observation.unit_code]
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
  operationCode: "notes.create" | "notes.revise";
  noteId: number | null;
  expectedRevision: number;
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
  note,
  templates,
  canWrite,
  onCreated,
  onRefresh,
}: {
  encounterId: number;
  patientId?: number;
  note?: EncounterNote;
  templates: NoteTemplate[];
  canWrite: boolean;
  onCreated?: (note: EncounterNote) => void;
  onRefresh?: () => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const savedBody = note?.current_revision?.body;
  const initialSections = savedBody?.sections ?? EMPTY_SOAP_SECTIONS;
  const [sections, setSections] = useState<SoapNoteSections>(initialSections);
  const [selectedTemplate, setSelectedTemplate] = useState(
    savedBody?.template_id ?? templates[0]?.id ?? "",
  );
  const [appliedTemplate, setAppliedTemplate] = useState<{
    id: string;
    version: number;
  } | null>(
    savedBody
      ? { id: savedBody.template_id, version: savedBody.template_version }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState<NoteSaveState>("idle");
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const saveAttemptRef = useRef<NoteSaveAttempt | null>(null);
  const dirty = SOAP_SECTION_LABELS.some(
    ([key]) => sections[key] !== initialSections[key],
  );
  const signed = note?.signed || note?.current_revision?.signed || false;

  useEffect(() => {
    if (saveAttemptRef.current) return;
    setSections(initialSections);
    if (savedBody) {
      setSelectedTemplate(savedBody.template_id);
      setAppliedTemplate({
        id: savedBody.template_id,
        version: savedBody.template_version,
      });
    }
  }, [
    savedBody?.template_id,
    savedBody?.template_version,
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

  const applyTemplate = () => {
    const template = templates.find(
      (candidate) => candidate.id === selectedTemplate,
    );
    if (!template) return;
    if (
      templateWouldOverwrite(sections, template) &&
      !window.confirm(
        "Replace the current SOAP sections with this template's starter text?",
      )
    )
      return;
    setSections(
      (current) =>
        Object.fromEntries(
          SOAP_SECTION_LABELS.map(([key]) => [
            key,
            template.sections[key].trim()
              ? template.sections[key]
              : current[key],
          ]),
        ) as SoapNoteSections,
    );
    setAppliedTemplate({ id: template.id, version: template.version });
    setNotice("");
    setError("");
  };

  const save = async () => {
    if (
      !appliedTemplate ||
      busy ||
      !noteSaveAllowsMutation(saveState) ||
      signed ||
      !canWrite ||
      !dirty
    )
      return;
    const operationCode = note?.current_revision
      ? "notes.revise"
      : "notes.create";
    const attempt: NoteSaveAttempt = {
      requestKey: noteSaveRequestKey(
        saveAttemptRef.current?.requestKey ?? null,
      ),
      operationCode,
      noteId: note?.id ?? null,
      expectedRevision: note?.current_revision
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
    };
    try {
      if (attempt.operationCode === "notes.revise" && note?.current_revision) {
        await api<{ revision: { revision_no: number } }>(
          `/api/clinic/notes/${note.id}/revisions`,
          {
            method: "POST",
            body: noteSaveRequestBody(
              attempt.operationCode,
              fields,
              attempt.requestKey,
              note.current_revision.revision_no,
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
      setSelectedTemplate(body.template_id);
      setAppliedTemplate({
        id: body.template_id,
        version: body.template_version,
      });
    }
    setSaveState("idle");
    setNotice(
      `Unsigned draft ${attempt.operationCode === "notes.create" ? "created" : `revision ${attempt.expectedRevision} saved`} after note and encounter verification.`,
    );
    saveAttemptRef.current = null;
    setRequestKey(null);
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
    if (
      busy ||
      !saveAttemptRef.current ||
      !window.confirm(
        "Forget this local save request key without sending another request? Confirm the note status independently before retrying.",
      )
    )
      return;
    saveAttemptRef.current = null;
    setRequestKey(null);
    setSaveState("idle");
    setError("");
  };

  const template = templates.find(
    (candidate) => candidate.id === selectedTemplate,
  );
  return (
    <Box className="soap-workspace">
      {!note && (
        <Paper variant="outlined" className="soap-template-panel">
          <Typography variant="subtitle2">Start from a template</Typography>
          <FormControl fullWidth size="small">
            <InputLabel id="soap-template-label">Template</InputLabel>
            <Select
              labelId="soap-template-label"
              label="Template"
              value={selectedTemplate}
              disabled={busy || !noteSaveAllowsMutation(saveState)}
              onChange={(event) => setSelectedTemplate(event.target.value)}
            >
              {templates.map((option) => (
                <MenuItem
                  key={`${option.id}-${option.version}`}
                  value={option.id}
                >
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {template && (
            <>
              <Alert severity="warning">{template.caution}</Alert>
              <Typography variant="caption" color="text.secondary">
                Source: {template.source_label}. Prototype attribution only;
                this does not establish clinical approval or reuse rights for
                release.{" "}
                <Link
                  href={template.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Review source
                </Link>
              </Typography>
            </>
          )}
          <Button
            variant="outlined"
            onClick={applyTemplate}
            disabled={!template || !noteSaveAllowsMutation(saveState)}
          >
            Apply starter text
          </Button>
        </Paper>
      )}
      {note && savedBody && (
        <Alert severity={signed ? "info" : "warning"}>
          {signed
            ? "This exact revision is signed and read-only. Signing is not available from this editor."
            : `Draft revision ${note.current_revision?.revision_no}. Template provenance is fixed after creation.`}
        </Alert>
      )}
      <Stack spacing={2} className="soap-sections">
        {SOAP_SECTION_LABELS.map(([key, label]) => (
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
            disabled={
              busy || !noteSaveAllowsMutation(saveState) || signed || !canWrite
            }
            helperText={
              key === "objective" && appliedTemplate && !signed
                ? "Template text is editable and remains unverified until the author reviews it."
                : undefined
            }
          />
        ))}
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
        {!signed && (
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={
              busy ||
              !canWrite ||
              !dirty ||
              !noteSaveAllowsMutation(saveState) ||
              !appliedTemplate ||
              !hasSoapContent(sections)
            }
          >
            {busy ? "Saving…" : note ? "Save new revision" : "Save draft"}
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
          <Button variant="text" onClick={resetSaveAttempt}>
            Reset save attempt
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {signed
          ? "This signed SOAP chart is read-only. Signing, treatment, discharge, encounter close, and checkout remain separate."
          : "This is an unsigned draft only—not an exam occurrence, diagnosis, signature, treatment, discharge, encounter close, or checkout."}
      </Typography>
    </Box>
  );
}

function ExistingSoapNote({
  patientId,
  encounterId,
  noteId,
  templates,
  canWrite,
}: {
  patientId: number;
  encounterId: number;
  noteId: number;
  templates: NoteTemplate[];
  canWrite: boolean;
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
      encounterId={encounterId}
      note={resource.data.note}
      templates={templates}
      canWrite={canWrite}
      onRefresh={resource.refresh}
    />
  );
}

function SoapNoteWorkspace({ encounter }: { encounter: EncounterDetail }) {
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
      encounterId={encounter.id}
      noteId={noteId}
      templates={templates.data.templates}
      canWrite={context.capabilities.notes_write}
    />
  ) : context.capabilities.notes_write ? (
    <SoapNoteForm
      encounterId={encounter.id}
      patientId={encounter.patient_id}
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

export function ProviderEncounterWorkflow({
  patient,
  encounter,
  observations,
  timezone,
  noteWorkspace,
  careSummaryState = { status: "unlinked" },
  onEncounterRefresh,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  observations: Observation[];
  timezone: string;
  noteWorkspace: ReactNode;
  careSummaryState?: CareSummaryLoadState;
  onEncounterRefresh?: () => void;
}) {
  const [chartConfirmed, setChartConfirmed] = useState(false);
  const signedChart = encounterHasSignedSoapNote(encounter);
  const workspaceHeading = useRef<HTMLHeadingElement | null>(null);
  const observationTimes = new Set(
    observations.map((observation) => observation.recorded_at),
  );
  const sharedObservationTime =
    observationTimes.size === 1
      ? clinicDateTime(observations[0]?.recorded_at ?? null, timezone)
      : null;

  useEffect(() => {
    if (chartConfirmed) workspaceHeading.current?.focus();
  }, [chartConfirmed]);

  return (
    <Stack spacing={2} className="provider-encounter-workflow">
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ justifyContent: "space-between", gap: 1 }}
          >
            <Box>
              <Typography variant="subtitle2">Patient and visit</Typography>
              <Typography variant="h6">{patient.display_name}</Typography>
              <Typography variant="body2" color="text.secondary">
                Reference {patient.reference} · Encounter #{encounter.id} ·
                started {clinicDateTime(encounter.started_at, timezone)}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Chip label={statusLabel(encounter.status)} variant="outlined" />
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
                : "Confirm this patient reference and encounter before opening the chart. Opening the chart does not accept a handoff or assign a provider."}
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
                : "Confirm and begin charting"}
            </Button>
          )}
        </Stack>
      </Paper>

      {chartConfirmed && (
        <>
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
              <Divider />
              <Box>
                <Typography variant="subtitle2">Vital signs</Typography>
                {observations.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No recorded observations are available for this encounter.
                  </Typography>
                ) : (
                  <>
                    {sharedObservationTime && (
                      <Typography variant="caption" color="text.secondary">
                        Recorded {sharedObservationTime}
                      </Typography>
                    )}
                    <Box className="provider-vitals-grid">
                      {observations.map((observation) => (
                        <Box key={observation.id}>
                          <Typography variant="caption" color="text.secondary">
                            {observationLabel(observation.code)}
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
                                observation.recorded_at,
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
          {noteWorkspace}
          <VisitWrapUp
            patient={patient}
            encounter={encounter}
            timezone={timezone}
            onEncounterRefresh={onEncounterRefresh}
          />
        </>
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
    if (
      busy ||
      closeState !== "idle" ||
      !window.confirm(
        "Close this encounter now? This records only that the encounter ended. Save any note changes first. It is not discharge, checkout, treatment, signing, or handoff acceptance.",
      )
    )
      return;
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
    if (
      busy ||
      !requestKeyRef.current ||
      !window.confirm(
        "Forget this local close request key without sending another request? Confirm the encounter status independently before starting a new close attempt.",
      )
    )
      return;
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
            signing, discharge, checkout, treatment, and handoff acceptance
            remain separate.
          </Alert>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Close the encounter after documentation is saved. Closing is not
            discharge, checkout, treatment, signing, or handoff acceptance.
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
              onClick={() => void endVisit()}
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
            <Button variant="text" onClick={resetCloseAttempt}>
              Reset close attempt
            </Button>
          )}
          <Button href="/clinic" variant="outlined">
            Return to tracking board
          </Button>
        </Stack>
      </Stack>
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
              <p className="clinic-lead">Reference: {patient.reference}</p>
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
          noteWorkspace={
            <SoapNoteWorkspace encounter={encounter.data.encounter} />
          }
        />
      }
    />
  );
}

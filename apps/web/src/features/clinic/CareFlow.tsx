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
  Patient,
  SoapNoteSections,
  VisitType,
} from "../../api/contracts";
import { useEffect, useState, type ReactNode } from "react";
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

function currentPage() {
  if (typeof window === "undefined") return 1;
  const page = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

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

function BookingForm({
  timezone,
  onCreated,
}: {
  timezone: string;
  onCreated?: (appointment: Appointment) => void;
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
    "/api/clinic/patients?per_page=100",
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
            <Typography color="text.secondary">
              Create a schedule record for an existing fictional patient.
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
}: {
  context: ClinicWorkspaceContext;
  appointments: Appointment[];
  pagination: PageInfo;
  onAppointmentCreated?: (appointment: Appointment) => void;
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
          <Link href="/clinic">Tracking-board example ↗</Link>
        </Stack>
      </Box>
      <Alert severity="info">
        Read-only scheduled visits from the clinic API. A scheduled time is not
        an arrival or a place in the tracking-board queue.
      </Alert>
      {context.capabilities.appointments && (
        <BookingForm
          timezone={context.practice.timezone}
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
                        <Link
                          href={`/clinic/patients/${appointment.patient_id}`}
                        >
                          Patient record #{appointment.patient_id}
                        </Link>
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
                        ) : (
                          <Link
                            href={`/clinic/patients/${appointment.patient_id}/encounters/${appointment.encounter_id}`}
                          >
                            Open encounter →
                          </Link>
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
              onChange={(_, page) =>
                window.location.assign(`/clinic/schedule?page=${page}`)
              }
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
  const page = currentPage();
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
        <p>No encounters are recorded for this synthetic patient.</p>
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

export function hasSoapContent(sections: SoapNoteSections) {
  return Object.values(sections).some((value) => value.trim().length > 0);
}

export function templateWouldOverwrite(
  sections: SoapNoteSections,
  template: NoteTemplate,
) {
  return (
    hasSoapContent(sections) &&
    SOAP_SECTION_LABELS.some(
      ([key]) => sections[key] !== template.sections[key],
    )
  );
}

export function SoapNoteForm({
  encounterId,
  note,
  templates,
  canWrite,
  onCreated,
  onRefresh,
}: {
  encounterId: number;
  note?: EncounterNote;
  templates: NoteTemplate[];
  canWrite: boolean;
  onCreated?: (note: EncounterNote) => void;
  onRefresh?: () => void;
}) {
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
  const [conflict, setConflict] = useState(false);
  const dirty = SOAP_SECTION_LABELS.some(
    ([key]) => sections[key] !== initialSections[key],
  );
  const signed = note?.signed || note?.current_revision?.signed || false;

  useEffect(() => {
    setSections(initialSections);
    if (savedBody) {
      setSelectedTemplate(savedBody.template_id);
      setAppliedTemplate({
        id: savedBody.template_id,
        version: savedBody.template_version,
      });
    }
    setConflict(false);
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
    setSections({ ...template.sections });
    setAppliedTemplate({ id: template.id, version: template.version });
    setNotice("");
    setError("");
  };

  const save = async () => {
    if (!appliedTemplate || busy || signed || !canWrite || !dirty) return;
    setBusy(true);
    setError("");
    setNotice("");
    setConflict(false);
    const fields = {
      template_id: appliedTemplate.id,
      template_version: appliedTemplate.version,
      ...sections,
    };
    try {
      if (note?.current_revision) {
        await api<{ note: EncounterNote }>(
          `/api/clinic/notes/${note.id}/revisions`,
          {
            method: "POST",
            body: {
              revision: {
                ...fields,
                expected_revision: note.current_revision.revision_no,
              },
            },
          },
        );
        setNotice("Draft saved. Reloaded the acknowledged revision.");
        onRefresh?.();
      } else {
        const result = await api<{ note: EncounterNote }>(
          `/api/clinic/encounters/${encounterId}/notes`,
          {
            method: "POST",
            body: { encounter_note: { note_kind: "soap", ...fields } },
          },
        );
        setNotice("Draft created.");
        onCreated?.(result.note);
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        window.location.replace("/login");
        return;
      }
      if (caught instanceof ApiError && caught.status === 409) {
        setConflict(true);
        setError(
          "The saved note changed or creation could not be confirmed. Reload before trying again.",
        );
      } else if (caught instanceof ApiError) setError(caught.message);
      else
        setError(
          "Save outcome not confirmed. Reload before trying again; this draft was not automatically replayed.",
        );
    } finally {
      setBusy(false);
    }
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
            disabled={!template}
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
            disabled={busy || signed || !canWrite}
            helperText={
              key === "objective" && appliedTemplate
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
      {notice && <p role="status">{notice}</p>}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button
          variant="contained"
          onClick={save}
          disabled={
            busy ||
            signed ||
            !canWrite ||
            !dirty ||
            !appliedTemplate ||
            !hasSoapContent(sections)
          }
        >
          {busy ? "Saving…" : note ? "Save new revision" : "Save draft"}
        </Button>
        {conflict && (
          <Button variant="outlined" onClick={() => window.location.reload()}>
            Reload saved note
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Draft saving does not sign the note, close the encounter, transmit a
        prescription, or complete follow-up work.
      </Typography>
    </Box>
  );
}

function ExistingSoapNote({
  encounterId,
  noteId,
  templates,
  canWrite,
}: {
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
      encounterId={encounter.id}
      noteId={noteId}
      templates={templates.data.templates}
      canWrite={context.capabilities.notes_write}
    />
  ) : context.capabilities.notes_write ? (
    <SoapNoteForm
      encounterId={encounter.id}
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
      <div className="care-heading">
        <div>
          <p className="eyebrow">ENCOUNTER #{encounter.id}</p>
          <h1>{patient.display_name}</h1>
          <p className="clinic-lead">
            Fictional reference: {patient.reference}
          </p>
        </div>
        <span className="care-status care-status-large">
          {statusLabel(encounter.status)}
        </span>
      </div>
      <p className="care-boundary">
        This is the encounter’s open/completed API status—not an intake, handoff
        or tracking-board stage.
      </p>
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
          {noteWorkspace ?? (
            <div className="care-blocked">
              <strong>Editor unavailable</strong>
              <span>The protected note workspace was not loaded.</span>
            </div>
          )}
        </Card>
      </div>
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
    `/api/clinic/encounters/${encounterId}`,
  );
  const observations = useResource<{
    observations: Observation[];
    pagination: PageInfo;
  }>(
    `/api/clinic/patients/${patientId}/observations?encounter_id=${encounterId}`,
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
      noteWorkspace={<SoapNoteWorkspace encounter={encounter.data.encounter} />}
    />
  );
}

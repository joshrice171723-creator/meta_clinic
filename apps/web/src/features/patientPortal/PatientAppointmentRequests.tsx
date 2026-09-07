import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import {
  PatientAppointmentConfirmation,
  type ConfirmableAppointment,
} from "./PatientAppointmentConfirmation";
import { PatientPrevisitNote } from "./PatientPrevisitNote";

type Site = { id: number; code: string; name: string };
type VisitType = { id: number; code: string };
export type UpcomingAppointment = ConfirmableAppointment;
type AppointmentSnapshot = UpcomingAppointment;
type AppointmentRequest = {
  id: number;
  request_key: string;
  request_kind: "new_booking" | "reschedule" | "cancel";
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  site: Site | null;
  visit_type: VisitType | null;
  requested_at: string;
  reviewed_at: string | null;
  source_appointment: AppointmentSnapshot | null;
  appointment: AppointmentSnapshot | null;
};
type AppointmentRequestResponse = {
  appointment_requests: AppointmentRequest[];
  upcoming_appointments: AppointmentSnapshot[];
  options: { sites: Site[]; visit_types: VisitType[] };
};

function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.valueOf() - offset).toISOString().slice(0, 16);
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function PatientAppointmentRequests({
  hideHeader = false,
  onUpcomingAppointments,
  onUpcomingAppointmentsError,
}: {
  hideHeader?: boolean;
  onUpcomingAppointments?: (appointments: UpcomingAppointment[]) => void;
  onUpcomingAppointmentsError?: (error: string) => void;
}) {
  const resource = useResource<AppointmentRequestResponse>(
    "/api/patient_portal/appointment_requests",
  );
  const [startsAt, setStartsAt] = useState(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    value.setHours(9, 0, 0, 0);
    return localDateTime(value);
  });
  const [endsAt, setEndsAt] = useState(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    value.setHours(10, 0, 0, 0);
    return localDateTime(value);
  });
  const [siteId, setSiteId] = useState("");
  const [visitTypeId, setVisitTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [change, setChange] = useState<{
    appointment: AppointmentSnapshot;
    kind: "reschedule" | "cancel";
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    appointment: AppointmentSnapshot;
    sourceUpdatedAt: string;
  } | null>(null);
  const [appointmentOverrides, setAppointmentOverrides] = useState<
    Record<
      number,
      { appointment: AppointmentSnapshot; sourceUpdatedAt: string }
    >
  >({});
  const minimum = useMemo(() => localDateTime(new Date()), []);
  const intervalValid =
    new Date(endsAt).valueOf() > new Date(startsAt).valueOf();
  const effectiveUpcomingAppointments = useMemo(
    () =>
      resource.data?.upcoming_appointments.map((appointment) => {
        const override = appointmentOverrides[appointment.id];
        return override?.sourceUpdatedAt === appointment.updated_at
          ? override.appointment
          : appointment;
      }),
    [appointmentOverrides, resource.data?.upcoming_appointments],
  );

  useEffect(() => {
    if (effectiveUpcomingAppointments) {
      onUpcomingAppointments?.(effectiveUpcomingAppointments);
      onUpcomingAppointmentsError?.("");
    } else if (resource.error) {
      onUpcomingAppointmentsError?.(resource.error);
    }
  }, [
    onUpcomingAppointments,
    onUpcomingAppointmentsError,
    effectiveUpcomingAppointments,
    resource.error,
  ]);

  async function submit() {
    if (!siteId || !intervalValid) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/patient_portal/appointment_requests", {
        method: "POST",
        body: {
          appointment_request: {
            request_key: requestKey,
            request_kind: "new_booking",
            starts_at: new Date(startsAt).toISOString(),
            ends_at: new Date(endsAt).toISOString(),
            site_id: Number(siteId),
            visit_type_id: visitTypeId ? Number(visitTypeId) : undefined,
          },
        },
      });
      setNotice(
        "Your preferred window was sent to the clinic for review. It is not a confirmed appointment.",
      );
      setRequestKey(crypto.randomUUID());
      setOutcomeUnconfirmed(false);
      resource.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your appointment request could not be sent.",
      );
      setOutcomeUnconfirmed(
        !(reason instanceof ApiError) ||
          reason.status >= 500 ||
          reason.code === "outcome_unconfirmed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 3.5 } }}>
      <Stack spacing={2.5}>
        {!hideHeader && (
          <Box>
            <Typography variant="h5" component="h2">
              Appointments
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              Confirm an upcoming visit, share a note with your care team, or
              request a new appointment. Your clinic reviews requests to book or
              change a visit.
            </Typography>
          </Box>
        )}
        {!resource.data && !resource.error && (
          <Typography role="status">
            Loading appointment request options…
          </Typography>
        )}
        {resource.error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={resource.refresh}>
                Retry
              </Button>
            }
          >
            Your appointments could not be loaded. {resource.error}
          </Alert>
        )}
        {resource.data && (
          <>
            {notice && (
              <Alert severity="success" onClose={() => setNotice("")}>
                {notice}
              </Alert>
            )}
            {error && (
              <Alert severity="error" onClose={() => setError("")}>
                {error}
              </Alert>
            )}
            <Stack spacing={1.25}>
              <Typography variant="h6" component="h2">
                Your upcoming appointments
              </Typography>
              {resource.data.upcoming_appointments.length === 0 && (
                <Typography color="text.secondary">
                  You have no upcoming appointments to change.
                </Typography>
              )}
              {resource.data.upcoming_appointments.map(
                (originalAppointment) => {
                  const override = appointmentOverrides[originalAppointment.id];
                  const appointment =
                    override?.sourceUpdatedAt === originalAppointment.updated_at
                      ? override.appointment
                      : originalAppointment;
                  const pendingChange =
                    resource.data?.appointment_requests.find(
                      (request) =>
                        request.status === "pending" &&
                        request.source_appointment?.id === appointment.id,
                    );
                  return (
                    <Box
                      key={appointment.id}
                      id={`appointment-${appointment.id}`}
                      sx={{
                        borderTop: "1px solid",
                        borderColor: "divider",
                        pt: 1.5,
                        scrollMarginTop: 24,
                      }}
                    >
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        sx={{ justifyContent: "space-between" }}
                      >
                        <Box>
                          <Typography sx={{ fontWeight: 700 }}>
                            {dateTime(appointment.starts_at)} –{" "}
                            {dateTime(appointment.ends_at)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {appointment.site?.name ||
                              appointment.site?.code ||
                              "Location not recorded"}
                            {appointment.room
                              ? ` · Room ${appointment.room.code}`
                              : ""}
                            {appointment.visit_type
                              ? ` · ${appointment.visit_type.code}`
                              : ""}
                          </Typography>
                        </Box>
                        <Stack
                          direction="row"
                          spacing={1}
                          useFlexGap
                          sx={{
                            alignItems: "center",
                            columnGap: 1,
                            flexWrap: "wrap",
                            maxWidth: "100%",
                            rowGap: 1,
                          }}
                        >
                          <Chip
                            size="small"
                            color={
                              appointment.status === "confirmed"
                                ? "success"
                                : "default"
                            }
                            label={
                              appointment.status === "confirmed"
                                ? "Confirmed"
                                : "Scheduled"
                            }
                          />
                          {pendingChange ? (
                            <Chip
                              size="small"
                              color="info"
                              label={`${pendingChange.request_kind === "cancel" ? "Cancellation" : "Reschedule"} request pending`}
                            />
                          ) : (
                            <>
                              {appointment.can_confirm && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  disabled={confirmation !== null}
                                  onClick={() =>
                                    setConfirmation({
                                      appointment,
                                      sourceUpdatedAt:
                                        originalAppointment.updated_at,
                                    })
                                  }
                                >
                                  Confirm appointment
                                </Button>
                              )}
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={confirmation !== null}
                                onClick={() =>
                                  setChange({ appointment, kind: "reschedule" })
                                }
                              >
                                Request reschedule
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                disabled={confirmation !== null}
                                onClick={() =>
                                  setChange({ appointment, kind: "cancel" })
                                }
                              >
                                Request cancellation
                              </Button>
                            </>
                          )}
                        </Stack>
                      </Stack>
                      <Box sx={{ mt: 1 }}>
                        <PatientPrevisitNote
                          appointmentId={appointment.id}
                          appointmentLabel={`${dateTime(appointment.starts_at)} · ${appointment.site?.name || appointment.site?.code || "Location not recorded"}${appointment.room ? ` · Room ${appointment.room.code}` : ""}`}
                        />
                      </Box>
                    </Box>
                  );
                },
              )}
            </Stack>
            <Box>
              <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>
                Request a new appointment
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                  gap: 2,
                }}
              >
                <TextField
                  disabled={busy || outcomeUnconfirmed}
                  label="Preferred start (your local time)"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => {
                    setStartsAt(event.target.value);
                    setRequestKey(crypto.randomUUID());
                  }}
                  slotProps={{
                    htmlInput: { min: minimum },
                    inputLabel: { shrink: true },
                  }}
                />
                <TextField
                  disabled={busy || outcomeUnconfirmed}
                  label="Preferred end (your local time)"
                  type="datetime-local"
                  value={endsAt}
                  error={!intervalValid}
                  helperText={
                    intervalValid
                      ? "Choose a window up to four hours."
                      : "End time must be after the start time."
                  }
                  onChange={(event) => {
                    setEndsAt(event.target.value);
                    setRequestKey(crypto.randomUUID());
                  }}
                  slotProps={{
                    htmlInput: { min: minimum },
                    inputLabel: { shrink: true },
                  }}
                />
                <TextField
                  disabled={busy || outcomeUnconfirmed}
                  select
                  required
                  label="Preferred clinic location"
                  value={siteId}
                  onChange={(event) => {
                    setSiteId(event.target.value);
                    setRequestKey(crypto.randomUUID());
                  }}
                >
                  <MenuItem value="" disabled>
                    Choose a clinic location
                  </MenuItem>
                  {resource.data.options.sites.map((site) => (
                    <MenuItem key={site.id} value={String(site.id)}>
                      {site.name || site.code}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  disabled={busy || outcomeUnconfirmed}
                  select
                  label="Visit type (optional)"
                  value={visitTypeId}
                  helperText="Choose one if you have a preference."
                  onChange={(event) => {
                    setVisitTypeId(event.target.value);
                    setRequestKey(crypto.randomUUID());
                  }}
                >
                  <MenuItem value="">No preference</MenuItem>
                  {resource.data.options.visit_types.map((type) => (
                    <MenuItem key={type.id} value={String(type.id)}>
                      {type.code}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{
                  justifyContent: "space-between",
                  alignItems: { sm: "center" },
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  The clinic may offer a different available time. No clinician
                  is selected by this request.
                </Typography>
                <Button
                  variant="contained"
                  disabled={busy || !siteId || !intervalValid}
                  onClick={() => void submit()}
                  startIcon={<EventAvailableOutlinedIcon />}
                >
                  {busy
                    ? "Sending…"
                    : outcomeUnconfirmed
                      ? "Retry same request"
                      : "Send request"}
                </Button>
              </Stack>
            </Box>
            <Stack spacing={1.25}>
              <Typography variant="h6" component="h2">
                Your requests
              </Typography>
              {resource.data.appointment_requests.length === 0 && (
                <Typography color="text.secondary">
                  You have not requested an appointment yet.
                </Typography>
              )}
              {resource.data.appointment_requests.map((request) => (
                <Box
                  key={request.id}
                  sx={{
                    borderTop: "1px solid",
                    borderColor: "divider",
                    pt: 1.5,
                  }}
                >
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{ justifyContent: "space-between" }}
                  >
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>
                        {request.request_kind === "cancel"
                          ? "Cancellation requested"
                          : `${request.request_kind === "reschedule" ? "Reschedule requested: " : ""}${dateTime(request.starts_at || "")} – ${dateTime(request.ends_at || "")}`}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {request.source_appointment
                          ? `Original appointment: ${dateTime(request.source_appointment.starts_at)} at ${request.source_appointment.site?.name || request.source_appointment.site?.code || "Location not recorded"}`
                          : `${request.site?.name || request.site?.code || "Location not specified"} · ${request.visit_type?.code || "Visit type not specified"}`}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={request.status.replaceAll("_", " ")}
                      color={
                        request.status === "approved"
                          ? "success"
                          : request.status === "declined"
                            ? "default"
                            : "info"
                      }
                    />
                  </Stack>
                  {request.appointment && (
                    <Alert
                      severity={
                        request.appointment.status === "confirmed" ||
                        request.appointment.status === "scheduled"
                          ? "success"
                          : "info"
                      }
                      icon={false}
                      sx={{ mt: 1 }}
                    >
                      {request.request_kind === "new_booking"
                        ? "Booking status"
                        : "Appointment status"}
                      : {request.appointment.status.replaceAll("_", " ")} ·{" "}
                      {dateTime(request.appointment.starts_at)} at{" "}
                      {request.appointment.site?.name ||
                        request.appointment.site?.code ||
                        "Location not recorded"}
                      {request.appointment.room
                        ? ` · Room ${request.appointment.room.code}`
                        : ""}
                      {request.appointment.clinician
                        ? ` · ${request.appointment.clinician.display_name}`
                        : ""}
                      .
                    </Alert>
                  )}
                </Box>
              ))}
            </Stack>
          </>
        )}
        {change && (
          <AppointmentChangeDialog
            appointment={change.appointment}
            kind={change.kind}
            onClose={() => setChange(null)}
            onSaved={() => {
              setChange(null);
              setNotice(
                change.kind === "cancel"
                  ? "Your cancellation request was sent to the clinic for review."
                  : "Your preferred reschedule time was sent to the clinic for review.",
              );
              resource.refresh();
            }}
          />
        )}
        {confirmation && (
          <PatientAppointmentConfirmation
            appointment={confirmation.appointment}
            onClose={() => setConfirmation(null)}
            onReload={resource.refresh}
            onConfirmed={(appointment) => {
              setAppointmentOverrides((current) => ({
                ...current,
                [appointment.id]: {
                  appointment,
                  sourceUpdatedAt: confirmation.sourceUpdatedAt,
                },
              }));
              setConfirmation(null);
              setNotice("Your appointment was confirmed.");
            }}
          />
        )}
      </Stack>
    </Paper>
  );
}

function AppointmentChangeDialog({
  appointment,
  kind,
  onClose,
  onSaved,
}: {
  appointment: AppointmentSnapshot;
  kind: "reschedule" | "cancel";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startsAt, setStartsAt] = useState(() =>
    localDateTime(new Date(appointment.starts_at)),
  );
  const [endsAt, setEndsAt] = useState(() =>
    localDateTime(new Date(appointment.ends_at)),
  );
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const [error, setError] = useState("");
  const intervalValid =
    kind === "cancel" ||
    new Date(endsAt).valueOf() > new Date(startsAt).valueOf();

  async function submit() {
    if (!intervalValid) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/patient_portal/appointment_requests", {
        method: "POST",
        body: {
          appointment_request: {
            request_key: requestKey,
            request_kind: kind,
            source_appointment_id: appointment.id,
            source_appointment_updated_at: appointment.updated_at,
            starts_at:
              kind === "reschedule"
                ? new Date(startsAt).toISOString()
                : undefined,
            ends_at:
              kind === "reschedule"
                ? new Date(endsAt).toISOString()
                : undefined,
          },
        },
      });
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your appointment change request could not be sent.",
      );
      setOutcomeUnconfirmed(
        !(reason instanceof ApiError) ||
          reason.status >= 500 ||
          reason.code === "outcome_unconfirmed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={busy || outcomeUnconfirmed ? undefined : onClose}
    >
      <DialogTitle>
        {kind === "cancel"
          ? "Request appointment cancellation"
          : "Request appointment reschedule"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            Current appointment: {dateTime(appointment.starts_at)} –{" "}
            {dateTime(appointment.ends_at)}. The clinic will review this request
            before changing your appointment.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
          {kind === "cancel" ? (
            <Typography color="text.secondary">
              This sends a cancellation request. Your appointment remains
              scheduled until the clinic reviews it.
            </Typography>
          ) : (
            <>
              <TextField
                disabled={busy || outcomeUnconfirmed}
                label="Preferred start (your local time)"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => {
                  setStartsAt(event.target.value);
                  setRequestKey(crypto.randomUUID());
                  setOutcomeUnconfirmed(false);
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                disabled={busy || outcomeUnconfirmed}
                label="Preferred end (your local time)"
                type="datetime-local"
                value={endsAt}
                error={!intervalValid}
                helperText={
                  intervalValid
                    ? "Choose a window up to four hours."
                    : "End time must be after the start time."
                }
                onChange={(event) => {
                  setEndsAt(event.target.value);
                  setRequestKey(crypto.randomUUID());
                  setOutcomeUnconfirmed(false);
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy || outcomeUnconfirmed} onClick={onClose}>
          Close
        </Button>
        <Button
          variant="contained"
          color={kind === "cancel" ? "error" : "primary"}
          disabled={busy || !intervalValid}
          onClick={() => void submit()}
        >
          {busy
            ? "Sending…"
            : outcomeUnconfirmed
              ? "Retry same request"
              : kind === "cancel"
                ? "Send cancellation request"
                : "Send reschedule request"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

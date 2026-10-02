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
import { useEffect, useMemo, useRef, useState } from "react";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";
import {
  PatientAppointmentConfirmation,
  type ConfirmableAppointment,
} from "./PatientAppointmentConfirmation";
import { PatientPrevisitNote } from "./PatientPrevisitNote";
import { PatientAppointmentDetails } from "./PatientAppointmentDetails";
import { patientPortalCodeLabel } from "./patientPortalLabels";
import {
  ReturnVisitRequestSubmission,
  type ReturnVisitAcknowledgement,
} from "./returnVisitRequestSubmission";

import {
  AppointmentChangeSubmission,
  type AppointmentChangeAcknowledgement,
} from "./appointmentChangeSubmission";

type Site = { id: number; code: string; name: string };
type VisitType = {
  id: number;
  code: string;
  allowed_modalities?: ("in_person" | "video")[];
};
export type UpcomingAppointment = ConfirmableAppointment;
type AppointmentSnapshot = UpcomingAppointment;
type AppointmentRequest = {
  requested_modality?: "in_person" | "video";
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
  options: {
    sites: Site[];
    visit_types: VisitType[];
    can_request_new_booking: boolean;
    booking_requirement: string;
    video_connection_ready: boolean;
  };
};

function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.valueOf() - offset).toISOString().slice(0, 16);
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function dateTimeRange(start: string, end: string) {
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf())) {
    return `${dateTime(start)} – ${dateTime(end)}`;
  }

  const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
  if (startsAt.toDateString() === endsAt.toDateString()) {
    return `${day.format(startsAt)} · ${time.format(startsAt)} – ${time.format(endsAt)}`;
  }
  return `${dateTime(start)} – ${dateTime(end)}`;
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
  const [requestedModality, setRequestedModality] = useState<
    "in_person" | "video"
  >("in_person");
  const [busy, setBusy] = useState(false);
  const submission = useRef<ReturnVisitRequestSubmission | null>(null);
  submission.current ??= new ReturnVisitRequestSubmission(async (attempt) => {
    const result = await api<{
      appointment_request: ReturnVisitAcknowledgement;
    }>("/api/patient_portal/appointment_requests", {
      method: "POST",
      body: { appointment_request: attempt },
    });
    return result.appointment_request;
  });
  const [error, setError] = useState("");
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const callbackAttempt = useRef<{
    readonly requestKey: string;
    busy: boolean;
    saved: boolean;
    outcomeUnconfirmed: boolean;
  } | null>(null);
  callbackAttempt.current ??= {
    requestKey: crypto.randomUUID(),
    busy: false,
    saved: false,
    outcomeUnconfirmed: false,
  };
  const [callbackSaved, setCallbackSaved] = useState(false);
  const [callbackOutcomeUnconfirmed, setCallbackOutcomeUnconfirmed] =
    useState(false);
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
  useDemoNavigationBlocker(() => ({
    blocked: Boolean(
      busy ||
      outcomeUnconfirmed ||
      callbackOutcomeUnconfirmed ||
      submission.current?.busy ||
      submission.current?.outcomeUnconfirmed ||
      callbackAttempt.current?.busy ||
      callbackAttempt.current?.outcomeUnconfirmed,
    ),
    message:
      siteId || visitTypeId || change || confirmation
        ? "Discard your unsaved appointment choices?"
        : null,
  }));
  const intervalDuration =
    new Date(endsAt).valueOf() - new Date(startsAt).valueOf();
  const intervalValid =
    intervalDuration > 0 && intervalDuration <= 4 * 60 * 60 * 1_000;
  const submissionBlocker = !resource.data?.options.can_request_new_booking
    ? resource.data?.options.booking_requirement ||
      "The clinic must review your booking access. Request a call above for help."
    : !siteId
      ? "Choose a preferred clinic location before sending your request."
      : !intervalValid
        ? "Choose an end time after the start and within four hours before sending your request."
        : busy
          ? "Your request is being sent. Please wait for its outcome."
          : outcomeUnconfirmed
            ? "The previous outcome is unconfirmed. Retry the same request before changing its details."
            : "Your request will be sent to the clinic for review; it does not confirm an appointment.";
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
    const current = submission.current!;
    const eligible = resource.data?.options.can_request_new_booking === true;
    if (busy || !siteId || !intervalValid || !current.canSubmit(eligible))
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const acknowledged = await current.submit(
        {
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          site_id: Number(siteId),
          visit_type_id: visitTypeId ? Number(visitTypeId) : undefined,
          requested_modality: requestedModality,
        },
        eligible,
      );
      if (!acknowledged) return;
      setNotice(
        "Your appointment request is saved. Check its current status below; a request alone is not a confirmed appointment.",
      );
      resource.refresh();
    } catch (reason) {
      setError(
        current.outcomeUnconfirmed
          ? "We could not confirm whether your request was saved. Retry the same request before choosing a different window."
          : reason instanceof Error
            ? reason.message
            : "Your appointment request could not be sent.",
      );
    } finally {
      setOutcomeUnconfirmed(current.outcomeUnconfirmed);
      setBusy(false);
    }
  }

  async function requestCallback() {
    const current = callbackAttempt.current!;
    if (busy || current.busy || current.saved) return;
    current.busy = true;
    setBusy(true);
    setError("");
    setNotice("");
    const content = "Please call me about scheduling an appointment.";
    try {
      const response = await api<{
        request: {
          id: number;
          request_key: string;
          request_type: string;
          content: string;
          status: string;
        };
      }>("/api/patient_portal/requests", {
        method: "POST",
        body: {
          patient_portal_request: {
            request_key: current.requestKey,
            request_type: "callback",
            content,
          },
        },
      });
      const saved = response?.request;
      if (
        !saved ||
        !Number.isSafeInteger(saved.id) ||
        saved.id <= 0 ||
        saved.request_key !== current.requestKey ||
        saved.request_type !== "callback" ||
        saved.content !== content ||
        !["pending", "in_review", "resolved", "declined"].includes(saved.status)
      ) {
        throw new Error("The saved callback request could not be confirmed.");
      }
      current.saved = true;
      current.outcomeUnconfirmed = false;
      setCallbackSaved(true);
      setNotice(
        "Your callback request is saved. The clinic owns its follow-up; this request does not book an appointment.",
      );
    } catch (reason) {
      current.outcomeUnconfirmed ||=
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      setError(
        current.outcomeUnconfirmed
          ? "We could not confirm your callback request. Retry the same callback request to confirm its outcome."
          : reason instanceof Error
            ? reason.message
            : "Your callback request could not be sent.",
      );
    } finally {
      current.busy = false;
      setCallbackOutcomeUnconfirmed(current.outcomeUnconfirmed);
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
                            {dateTimeRange(
                              appointment.starts_at,
                              appointment.ends_at,
                            )}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {appointment.site?.name ||
                              (appointment.site?.code
                                ? patientPortalCodeLabel(appointment.site.code)
                                : "") ||
                              "Location not recorded"}
                            {appointment.room
                              ? ` · Room ${patientPortalCodeLabel(appointment.room.code)}`
                              : ""}
                            {appointment.visit_type
                              ? ` · ${patientPortalCodeLabel(appointment.visit_type.code)}`
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
                          {appointment.telehealth && (
                            <Button
                              size="small"
                              variant="outlined"
                              href={appointment.telehealth.prepare_href}
                            >
                              {["join", "rejoin", "admitted"].includes(
                                appointment.telehealth.access_state,
                              )
                                ? "Return to video visit"
                                : appointment.telehealth.access_state ===
                                    "waiting"
                                  ? "Open waiting room"
                                  : "Prepare for video visit"}
                            </Button>
                          )}
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
                        <PatientAppointmentDetails appointment={appointment} />
                        <PatientPrevisitNote
                          appointmentId={appointment.id}
                          appointmentLabel={`${dateTime(appointment.starts_at)} · ${appointment.site?.name || (appointment.site?.code ? patientPortalCodeLabel(appointment.site.code) : "Location not recorded")}${appointment.room ? ` · Room ${patientPortalCodeLabel(appointment.room.code)}` : ""}`}
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
              {(!resource.data.options.can_request_new_booking ||
                callbackOutcomeUnconfirmed) && (
                <Alert
                  severity="info"
                  sx={{ mb: 2 }}
                  action={
                    <Button
                      color="inherit"
                      disabled={busy || callbackSaved}
                      onClick={() => void requestCallback()}
                    >
                      {callbackSaved
                        ? "Callback requested"
                        : callbackOutcomeUnconfirmed
                          ? "Retry same callback"
                          : "Request a call"}
                    </Button>
                  }
                >
                  {resource.data.options.can_request_new_booking
                    ? "Your earlier callback outcome is unconfirmed. Retry it to confirm the saved request."
                    : resource.data.options.booking_requirement}
                </Alert>
              )}
              {requestedModality === "video" &&
                !resource.data.options.video_connection_ready && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    Your video preference can be saved. The clinic must arrange
                    the connection before you can join.
                  </Alert>
                )}
              <Box
                component="fieldset"
                disabled={
                  busy ||
                  outcomeUnconfirmed ||
                  !resource.data.options.can_request_new_booking
                }
                sx={{
                  border: 0,
                  p: 0,
                  m: 0,
                  minWidth: 0,
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
                      : "Choose an end time after the start and within four hours."
                  }
                  onChange={(event) => {
                    setEndsAt(event.target.value);
                  }}
                  slotProps={{
                    htmlInput: { min: minimum },
                    inputLabel: { shrink: true },
                  }}
                />
                <TextField
                  disabled={
                    busy ||
                    outcomeUnconfirmed ||
                    !resource.data.options.can_request_new_booking
                  }
                  select
                  required
                  label="Preferred clinic location"
                  value={siteId}
                  onChange={(event) => {
                    setSiteId(event.target.value);
                  }}
                >
                  <MenuItem value="" disabled>
                    Choose a clinic location
                  </MenuItem>
                  {resource.data.options.sites.map((site) => (
                    <MenuItem
                      key={site.id}
                      value={String(site.id)}
                      aria-label={`${site.name || patientPortalCodeLabel(site.code)} · Code ${site.code} · Reference ${site.id}`}
                    >
                      {site.name || patientPortalCodeLabel(site.code)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  disabled={
                    busy ||
                    outcomeUnconfirmed ||
                    !resource.data.options.can_request_new_booking
                  }
                  select
                  label="Visit type (optional)"
                  value={visitTypeId}
                  helperText="Choose one if you have a preference."
                  onChange={(event) => {
                    setVisitTypeId(event.target.value);
                    setRequestedModality("in_person");
                  }}
                >
                  <MenuItem value="">No preference</MenuItem>
                  {resource.data.options.visit_types.map((type) => (
                    <MenuItem
                      key={type.id}
                      value={String(type.id)}
                      aria-label={`${patientPortalCodeLabel(type.code)} · Code ${type.code} · Reference ${type.id}`}
                    >
                      {patientPortalCodeLabel(type.code)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Preferred visit format"
                  value={requestedModality}
                  disabled={
                    busy ||
                    outcomeUnconfirmed ||
                    !resource.data.options.can_request_new_booking
                  }
                  onChange={(event) => {
                    setRequestedModality(
                      event.target.value as "in_person" | "video",
                    );
                  }}
                  helperText="Video visits require an eligible visit type and clinic approval."
                >
                  <MenuItem value="in_person">In person</MenuItem>
                  <MenuItem
                    value="video"
                    disabled={
                      !resource.data.options.visit_types
                        .find((type) => String(type.id) === visitTypeId)
                        ?.allowed_modalities?.includes("video")
                    }
                  >
                    Video
                  </MenuItem>
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
                <Typography
                  id="appointment-request-guidance"
                  variant="body2"
                  color="text.secondary"
                  role="status"
                >
                  {submissionBlocker} The clinic may offer a different available
                  time. No clinician is selected by this request.
                </Typography>
                <Button
                  variant="contained"
                  aria-describedby="appointment-request-guidance"
                  disabled={
                    busy ||
                    !siteId ||
                    !intervalValid ||
                    !submission.current.canSubmit(
                      resource.data.options.can_request_new_booking,
                    )
                  }
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
                          : `${request.request_kind === "reschedule" ? "Reschedule requested: " : ""}${dateTimeRange(request.starts_at || "", request.ends_at || "")}`}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {request.source_appointment
                          ? `Original appointment: ${dateTime(request.source_appointment.starts_at)} at ${request.source_appointment.site?.name || request.source_appointment.site?.code || "Location not recorded"}`
                          : `${request.site?.name || (request.site?.code ? patientPortalCodeLabel(request.site.code) : "Location not specified")} · ${request.visit_type?.code ? patientPortalCodeLabel(request.visit_type.code) : "Visit type not specified"}`}
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
                  {request.status === "expired" && (
                    <Alert severity="info" icon={false} sx={{ mt: 1 }}>
                      This request expired before it was approved. Submit a new
                      request if you still need this appointment change.
                    </Alert>
                  )}
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
                        ? ` · Room ${patientPortalCodeLabel(request.appointment.room.code)}`
                        : ""}
                      {request.appointment.clinician
                        ? ` · ${request.appointment.clinician.display_name}`
                        : ""}
                      .
                    </Alert>
                  )}
                  {request.appointment && (
                    <PatientAppointmentDetails
                      appointment={request.appointment}
                    />
                  )}
                </Box>
              ))}
            </Stack>
          </>
        )}
        {change && (
          <AppointmentChangeDialog
            key={`${change.appointment.id}:${change.kind}`}
            appointment={change.appointment}
            kind={change.kind}
            onClose={() => setChange(null)}
            onSaved={() => {
              setChange(null);
              setNotice(
                "Your appointment change request is saved. Check its current status below.",
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

export function AppointmentChangeDialog({
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
  const [busy, setBusy] = useState(false);
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const [error, setError] = useState("");
  const submission = useRef<AppointmentChangeSubmission | null>(null);
  submission.current ??= new AppointmentChangeSubmission(
    appointment,
    kind,
    async (attempt) => {
      const response = await api<{
        appointment_request: AppointmentChangeAcknowledgement;
      }>("/api/patient_portal/appointment_requests", {
        method: "POST",
        body: { appointment_request: attempt },
      });
      return response.appointment_request;
    },
  );
  const intervalDuration =
    new Date(endsAt).valueOf() - new Date(startsAt).valueOf();
  const intervalValid =
    kind === "cancel" ||
    (intervalDuration > 0 && intervalDuration <= 4 * 60 * 60 * 1_000);
  const timeChanged =
    kind === "cancel" ||
    startsAt !== localDateTime(new Date(appointment.starts_at)) ||
    endsAt !== localDateTime(new Date(appointment.ends_at));
  useDemoNavigationBlocker(() => ({
    blocked: Boolean(
      busy ||
      outcomeUnconfirmed ||
      submission.current?.busy ||
      submission.current?.outcomeUnconfirmed,
    ),
    message: "Discard your unsaved appointment change?",
  }));

  async function submit() {
    const current = submission.current!;
    if (
      current.busy ||
      ((!intervalValid || !timeChanged) && !current.outcomeUnconfirmed)
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (
        await current.submit(
          kind === "reschedule"
            ? {
                starts_at: new Date(startsAt).toISOString(),
                ends_at: new Date(endsAt).toISOString(),
              }
            : undefined,
        )
      )
        onSaved();
    } catch (reason) {
      setError(
        current.outcomeUnconfirmed
          ? "We could not confirm this change request. Your original details are kept unchanged. Retry the same request before changing or closing it."
          : reason instanceof Error
            ? reason.message
            : "Your appointment change request could not be sent.",
      );
    } finally {
      setOutcomeUnconfirmed(current.outcomeUnconfirmed);
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
            Current appointment:{" "}
            {dateTimeRange(appointment.starts_at, appointment.ends_at)}. The
            clinic will review this request before changing your appointment.
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
                    : "Choose an end time after the start and within four hours."
                }
                onChange={(event) => {
                  setEndsAt(event.target.value);
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </>
          )}
          {kind === "reschedule" && (
            <Typography
              id="reschedule-request-guidance"
              color="text.secondary"
              role="status"
            >
              {outcomeUnconfirmed
                ? "The outcome is unconfirmed. Retry the same request before changing its details."
                : !timeChanged
                  ? "Change the preferred start or end time before sending a reschedule request."
                  : !intervalValid
                    ? "Choose an end time after the start and within four hours."
                    : "The clinic will review your preferred window before changing the appointment."}
            </Typography>
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
          disabled={
            busy || (!outcomeUnconfirmed && (!intervalValid || !timeChanged))
          }
          aria-describedby={
            kind === "reschedule" ? "reschedule-request-guidance" : undefined
          }
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

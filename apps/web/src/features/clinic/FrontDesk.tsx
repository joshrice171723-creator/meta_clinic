import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import TodayOutlinedIcon from "@mui/icons-material/TodayOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { ClinicSite, EncounterDetail, Patient } from "../../api/contracts";
import { useResource } from "../../shared/ui";
import { bookingAvailability } from "./CareFlow";
import {
  appointmentActions,
  appointmentStatus,
  appointmentTimeRange,
  buildAppointmentQueuePath,
  clinicDateValue,
  freshnessLabel,
  localDateTimeInput,
  queueDateLabel,
  siteLabel,
  type AppointmentTransition,
  type FrontDeskAppointment,
  type FrontDeskAppointmentResponse,
} from "./frontDeskModel";
import { useClinic } from "./Workspace";
import "./frontDesk.css";

function allowed(capability: boolean | undefined) {
  return capability === true;
}

export function FrontDesk() {
  const clinic = useClinic();
  const { capabilities } = clinic;
  const canPatients = allowed(capabilities.patients);
  const canIdentityLookup = allowed(capabilities.patient_identity_read);
  const canReadAppointments = allowed(capabilities.appointments_read);
  const canBilling = allowed(capabilities.billing_read);
  const booking = bookingAvailability(capabilities);

  return (
    <div className="front-desk-page">
      <header className="front-desk-heading">
        <div>
          <Typography component="h1" variant="h1">
            Front desk
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 720 }}>
            Run today’s appointment queue, open the right patient record, and
            start a visit when care begins.
          </Typography>
        </div>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          {booking.visible && (
            <Button
              component="a"
              href="/clinic/schedule"
              variant="contained"
              startIcon={<EventOutlinedIcon />}
            >
              Schedule visit
            </Button>
          )}
          {canPatients && (
            <Button component="a" href="/clinic/patients" variant="outlined">
              Patient directory
            </Button>
          )}
          {canBilling && (
            <Button component="a" href="/clinic/billing" variant="outlined">
              Billing
            </Button>
          )}
        </Stack>
      </header>

      {canReadAppointments ? (
        <AppointmentDayQueue
          sites={clinic.sites}
          currentSiteId={clinic.current_site?.id ?? null}
          timezone={clinic.practice.timezone}
          canPatients={canPatients}
          canBilling={canBilling}
          canTransition={
            allowed(capabilities.appointments_status_transition) ||
            allowed(capabilities.appointments)
          }
          canStartVisit={allowed(capabilities.encounters)}
          canReschedule={booking.visible}
          canReviewReminders={allowed(capabilities.reminders)}
        />
      ) : (
        <Alert severity="info">
          The appointment queue is unavailable for this account.
        </Alert>
      )}

      {!canPatients && canIdentityLookup && <IdentityLookup />}
    </div>
  );
}

function AppointmentDayQueue({
  sites,
  currentSiteId,
  timezone,
  canPatients,
  canBilling,
  canTransition,
  canStartVisit,
  canReschedule,
  canReviewReminders,
}: {
  sites: ClinicSite[];
  currentSiteId: number | null;
  timezone: string;
  canPatients: boolean;
  canBilling: boolean;
  canTransition: boolean;
  canStartVisit: boolean;
  canReschedule: boolean;
  canReviewReminders: boolean;
}) {
  const today = useMemo(
    () => clinicDateValue(new Date(), timezone),
    [timezone],
  );
  const [date, setDate] = useState(today);
  const [siteId, setSiteId] = useState(
    currentSiteId === null ? "" : String(currentSiteId),
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1);
  const [busyAction, setBusyAction] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticePatientId, setNoticePatientId] = useState<number>();
  const [refreshedAt, setRefreshedAt] = useState<Date>();
  const [reschedule, setReschedule] = useState<RescheduleDraft>();
  const path = buildAppointmentQueuePath({
    date,
    siteId,
    query: deferredQuery,
    page,
  });
  const appointments = useResource<FrontDeskAppointmentResponse>(path);

  useEffect(() => {
    if (appointments.data) setRefreshedAt(new Date());
  }, [appointments.data]);

  async function transition(
    appointment: FrontDeskAppointment,
    to: AppointmentTransition,
  ) {
    const patientName = appointment.patient?.display_name || "this patient";
    if (
      to !== "confirmed" &&
      !window.confirm(
        to === "cancelled"
          ? `Cancel ${patientName}’s appointment? This does not notify the patient.`
          : `Mark ${patientName} as a no-show for this appointment?`,
      )
    )
      return;

    const actionKey = `${appointment.id}:${to}`;
    setBusyAction(actionKey);
    setActionError("");
    setNotice("");
    setNoticePatientId(undefined);
    try {
      await api(`/api/clinic/appointments/${appointment.id}/transition`, {
        method: "POST",
        body: { transition: { to, expected_status: appointment.status } },
      });
      setNotice(
        to === "confirmed"
          ? `${patientName} is confirmed.`
          : to === "cancelled"
            ? `${patientName}’s appointment was cancelled.`
            : `${patientName} was marked as a no-show.`,
      );
      appointments.refresh();
    } catch (error) {
      handleMutationError(error, setActionError);
    } finally {
      setBusyAction("");
    }
  }

  async function startVisit(appointment: FrontDeskAppointment) {
    const patientName = appointment.patient?.display_name || "this patient";
    if (
      !window.confirm(
        `Start ${patientName}’s visit? This records an open clinical encounter.`,
      )
    )
      return;

    const actionKey = `${appointment.id}:start`;
    setBusyAction(actionKey);
    setActionError("");
    setNotice("");
    setNoticePatientId(undefined);
    try {
      await api<{ encounter: EncounterDetail }>(
        `/api/clinic/patients/${appointment.patient_id}/encounters`,
        {
          method: "POST",
          body: {
            encounter: {
              patient_id: appointment.patient_id,
              appointment_id: appointment.id,
            },
          },
        },
      );
      setNotice(`${patientName}’s visit is now in progress.`);
      appointments.refresh();
    } catch (error) {
      handleMutationError(error, setActionError);
    } finally {
      setBusyAction("");
    }
  }

  function openReschedule(appointment: FrontDeskAppointment) {
    setActionError("");
    setNotice("");
    setNoticePatientId(undefined);
    setReschedule({
      appointment,
      startsAt: localDateTimeInput(appointment.starts_at),
      endsAt: localDateTimeInput(appointment.ends_at),
      requestKey: crypto.randomUUID(),
      error: "",
      busy: false,
      outcomeUnconfirmed: false,
    });
  }

  async function saveReschedule() {
    if (!reschedule || !reschedule.appointment.updated_at) return;
    const startsAt = new Date(reschedule.startsAt);
    const endsAt = new Date(reschedule.endsAt);
    if (
      !Number.isFinite(startsAt.valueOf()) ||
      !Number.isFinite(endsAt.valueOf()) ||
      endsAt <= startsAt
    ) {
      setReschedule((current) =>
        current
          ? {
              ...current,
              error: "Enter a valid end time after the start time.",
            }
          : current,
      );
      return;
    }

    setReschedule((current) =>
      current ? { ...current, busy: true, error: "" } : current,
    );
    try {
      await api(`/api/clinic/appointments/${reschedule.appointment.id}`, {
        method: "PATCH",
        body: {
          appointment: {
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
            expected_updated_at: reschedule.appointment.updated_at,
            request_key: reschedule.requestKey,
          },
        },
      });
      const patientName =
        reschedule.appointment.patient?.display_name || "The patient";
      setReschedule(undefined);
      setNotice(
        `${patientName}’s appointment was rescheduled. Review reminders and send an updated message if a custom reminder was cancelled.`,
      );
      setNoticePatientId(reschedule.appointment.patient_id);
      appointments.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        window.location.replace("/login");
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "The appointment could not be rescheduled.";
      const outcomeUnconfirmed =
        !(error instanceof ApiError) ||
        error.status >= 500 ||
        error.code === "outcome_unconfirmed";
      setReschedule((current) =>
        current
          ? {
              ...current,
              busy: false,
              outcomeUnconfirmed,
              error: outcomeUnconfirmed
                ? `${message} The change was not retried. Keep these times and retry only after checking the schedule.`
                : `${message} Review the appointment before trying again.`,
            }
          : current,
      );
    }
  }

  const response = appointments.data;
  const records = response?.appointments ?? [];
  const pagination = response?.pagination;

  return (
    <Paper component="section" variant="outlined" className="front-desk-ledger">
      <div className="front-desk-toolbar">
        <div>
          <Typography component="h2" variant="h2">
            Day queue
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {queueDateLabel(date, timezone)}
            {refreshedAt
              ? ` · Updated ${freshnessLabel(refreshedAt, timezone)}`
              : ""}
          </Typography>
        </div>
        <Button
          variant="text"
          startIcon={<RefreshIcon />}
          onClick={() => appointments.refresh()}
          disabled={!appointments.data}
        >
          Refresh
        </Button>
      </div>

      <div className="front-desk-filters">
        <TextField
          label="Appointment date"
          type="date"
          value={date}
          onChange={(event) => {
            if (!event.target.value) return;
            setDate(event.target.value);
            setPage(1);
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button
          variant="outlined"
          startIcon={<TodayOutlinedIcon />}
          onClick={() => {
            setDate(today);
            setPage(1);
          }}
          disabled={date === today}
        >
          Today
        </Button>
        <TextField
          select
          label="Site"
          value={siteId}
          onChange={(event) => {
            setSiteId(event.target.value);
            setPage(1);
          }}
        >
          <MenuItem value="">All authorized sites</MenuItem>
          {sites.map((site) => (
            <MenuItem key={site.id} value={String(site.id)}>
              {site.name || site.code}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Search appointments"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Patient or clinic reference"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon aria-hidden="true" />
                </InputAdornment>
              ),
            },
          }}
        />
      </div>

      {actionError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={appointments.refresh}>
              Refresh schedule
            </Button>
          }
          className="front-desk-alert"
        >
          {actionError}
        </Alert>
      )}
      {notice && (
        <Alert
          severity="success"
          className="front-desk-alert"
          action={
            canReviewReminders && noticePatientId !== undefined ? (
              <Button
                component="a"
                href={`/clinic/reminders?patient_id=${noticePatientId}`}
                color="inherit"
                size="small"
              >
                Review reminders
              </Button>
            ) : undefined
          }
        >
          {notice}
        </Alert>
      )}

      {!response && !appointments.error && (
        <div className="front-desk-loading" role="status">
          <CircularProgress size={26} />
          <span>Loading the appointment queue…</span>
        </div>
      )}
      {appointments.error && (
        <Alert
          severity="error"
          className="front-desk-alert"
          action={
            <Button color="inherit" size="small" onClick={appointments.refresh}>
              Retry
            </Button>
          }
        >
          {appointments.error}
        </Alert>
      )}
      {response && records.length === 0 && (
        <div className="front-desk-empty">
          <TodayOutlinedIcon aria-hidden="true" />
          <Typography component="h3" variant="h6">
            No appointments found
          </Typography>
          <Typography color="text.secondary">
            Try another date, site, or search term.
          </Typography>
          {(query || siteId || date !== today) && (
            <Button
              variant="outlined"
              onClick={() => {
                setDate(today);
                setSiteId(currentSiteId === null ? "" : String(currentSiteId));
                setQuery("");
                setPage(1);
              }}
            >
              Reset filters
            </Button>
          )}
        </div>
      )}
      {response && records.length > 0 && (
        <>
          <div className="front-desk-list-heading" aria-hidden="true">
            <span>Time</span>
            <span>Patient</span>
            <span>Location</span>
            <span>Status</span>
            <span>Next action</span>
          </div>
          <Box component="ul" className="front-desk-list">
            {records.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                sites={sites}
                timezone={timezone}
                canPatients={canPatients}
                canBilling={canBilling}
                canTransition={canTransition}
                canStartVisit={canStartVisit}
                canReschedule={canReschedule}
                busyAction={busyAction}
                onTransition={transition}
                onStartVisit={startVisit}
                onReschedule={openReschedule}
              />
            ))}
          </Box>
        </>
      )}

      {pagination && pagination.total_pages > 1 && (
        <nav className="front-desk-pagination" aria-label="Appointment pages">
          <Typography color="text.secondary" variant="body2">
            Page {pagination.page} of {pagination.total_pages} ·{" "}
            {pagination.total} appointments
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              disabled={pagination.page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outlined"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </Stack>
        </nav>
      )}
      <RescheduleDialog
        draft={reschedule}
        clinicTimezone={timezone}
        onChange={setReschedule}
        onClose={() => {
          if (!reschedule?.busy) setReschedule(undefined);
        }}
        onSave={saveReschedule}
        onRefresh={appointments.refresh}
      />
    </Paper>
  );
}

function AppointmentRow({
  appointment,
  sites,
  timezone,
  canPatients,
  canBilling,
  canTransition,
  canStartVisit,
  canReschedule,
  busyAction,
  onTransition,
  onStartVisit,
  onReschedule,
}: {
  appointment: FrontDeskAppointment;
  sites: ClinicSite[];
  timezone: string;
  canPatients: boolean;
  canBilling: boolean;
  canTransition: boolean;
  canStartVisit: boolean;
  canReschedule: boolean;
  busyAction: string;
  onTransition: (
    appointment: FrontDeskAppointment,
    to: AppointmentTransition,
  ) => Promise<void>;
  onStartVisit: (appointment: FrontDeskAppointment) => Promise<void>;
  onReschedule: (appointment: FrontDeskAppointment) => void;
}) {
  const actions = appointmentActions(appointment);
  const status = appointmentStatus(appointment);
  const patientName = appointment.patient?.display_name || "Patient record";
  const patientReference =
    appointment.patient?.reference || `#${appointment.patient_id}`;
  const anyActionBusy = busyAction.length > 0;
  const patientPath = `/clinic/patients/${appointment.patient_id}`;
  const chartPath = appointment.encounter_id
    ? `${patientPath}/encounters/${appointment.encounter_id}`
    : "";
  const billingPath = `/clinic/billing/patients?patient_id=${appointment.patient_id}`;
  const hasVisibleAction =
    (canTransition &&
      (actions.canConfirm || actions.canCancel || actions.canMarkNoShow)) ||
    (canStartVisit && actions.canStartVisit) ||
    (canReschedule && actions.canReschedule) ||
    Boolean(chartPath && canPatients) ||
    canBilling;

  return (
    <Box component="li" className="front-desk-row">
      <div className="front-desk-time" data-label="Time">
        <strong>{appointmentTimeRange(appointment, timezone)}</strong>
      </div>
      <div className="front-desk-patient" data-label="Patient">
        {canPatients ? (
          <a href={patientPath}>{patientName}</a>
        ) : (
          <strong>{patientName}</strong>
        )}
        <span>{patientReference}</span>
      </div>
      <div data-label="Location">
        <strong>{siteLabel(sites, appointment.site_id)}</strong>
        {appointment.room_id && <span>Room {appointment.room_id}</span>}
      </div>
      <div data-label="Status">
        <Chip size="small" label={status.label} color={status.color} />
        {appointment.encounter_status === "open" && (
          <span>Clinical encounter open</span>
        )}
      </div>
      <div className="front-desk-actions" data-label="Next action">
        {canTransition && actions.canConfirm && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<CheckCircleOutlineIcon />}
            disabled={anyActionBusy}
            onClick={() => void onTransition(appointment, "confirmed")}
          >
            {busyAction === `${appointment.id}:confirmed`
              ? "Confirming…"
              : "Confirm"}
          </Button>
        )}
        {canStartVisit && actions.canStartVisit && (
          <Button
            size="small"
            variant="contained"
            startIcon={<PlayArrowOutlinedIcon />}
            disabled={anyActionBusy}
            onClick={() => void onStartVisit(appointment)}
          >
            {busyAction === `${appointment.id}:start`
              ? "Starting…"
              : "Start visit"}
          </Button>
        )}
        {chartPath && canPatients && (
          <Button
            component="a"
            href={chartPath}
            size="small"
            variant="contained"
          >
            Open chart
          </Button>
        )}
        {canReschedule && actions.canReschedule && (
          <Button
            size="small"
            color="inherit"
            disabled={anyActionBusy}
            onClick={() => onReschedule(appointment)}
          >
            Reschedule
          </Button>
        )}
        {canTransition && actions.canCancel && (
          <Button
            size="small"
            color="inherit"
            disabled={anyActionBusy}
            onClick={() => void onTransition(appointment, "cancelled")}
          >
            {busyAction === `${appointment.id}:cancelled`
              ? "Cancelling…"
              : "Cancel"}
          </Button>
        )}
        {canTransition && actions.canMarkNoShow && (
          <Button
            size="small"
            color="inherit"
            startIcon={<PersonOffOutlinedIcon />}
            disabled={anyActionBusy}
            onClick={() => void onTransition(appointment, "no_show")}
          >
            {busyAction === `${appointment.id}:no_show` ? "Saving…" : "No show"}
          </Button>
        )}
        {canBilling && (
          <a className="front-desk-inline-link" href={billingPath}>
            Billing
          </a>
        )}
        {!hasVisibleAction && (
          <span className="front-desk-muted">No action available</span>
        )}
      </div>
    </Box>
  );
}

type RescheduleDraft = {
  appointment: FrontDeskAppointment;
  startsAt: string;
  endsAt: string;
  requestKey: string;
  error: string;
  busy: boolean;
  outcomeUnconfirmed: boolean;
};

function RescheduleDialog({
  draft,
  clinicTimezone,
  onChange,
  onClose,
  onSave,
  onRefresh,
}: {
  draft: RescheduleDraft | undefined;
  clinicTimezone: string;
  onChange: (draft: RescheduleDraft | undefined) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  onRefresh: () => void;
}) {
  const browserTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "your device time zone";
  const patientName = draft?.appointment.patient?.display_name || "Patient";

  return (
    <Dialog
      open={Boolean(draft)}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="reschedule-title"
    >
      <DialogTitle id="reschedule-title">Reschedule appointment</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <div>
            <Typography sx={{ fontWeight: 700 }}>{patientName}</Typography>
            <Typography color="text.secondary" variant="body2">
              Site, room, clinician, and visit type stay the same.
            </Typography>
          </div>
          <Alert severity="info">
            Edit times in {browserTimezone}. The clinic schedule is displayed in{" "}
            {clinicTimezone}.
          </Alert>
          <Alert severity="warning">
            Custom reminder messages will be cancelled. Review reminders and
            send an updated message after rescheduling.
          </Alert>
          <TextField
            label="Starts"
            type="datetime-local"
            value={draft?.startsAt || ""}
            disabled={draft?.busy || draft?.outcomeUnconfirmed}
            onChange={(event) => {
              if (draft)
                onChange({
                  ...draft,
                  startsAt: event.target.value,
                  requestKey: draft.error
                    ? crypto.randomUUID()
                    : draft.requestKey,
                  error: "",
                });
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Ends"
            type="datetime-local"
            value={draft?.endsAt || ""}
            disabled={draft?.busy || draft?.outcomeUnconfirmed}
            onChange={(event) => {
              if (draft)
                onChange({
                  ...draft,
                  endsAt: event.target.value,
                  requestKey: draft.error
                    ? crypto.randomUUID()
                    : draft.requestKey,
                  error: "",
                });
            }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          {draft?.error && (
            <Alert
              severity="error"
              action={
                draft.outcomeUnconfirmed ? (
                  <Button color="inherit" size="small" onClick={onRefresh}>
                    Check schedule
                  </Button>
                ) : undefined
              }
            >
              {draft.error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={draft?.busy} color="inherit">
          Keep current time
        </Button>
        <Button
          variant="contained"
          disabled={!draft || draft.busy}
          onClick={() => void onSave()}
        >
          {draft?.busy ? "Saving…" : "Save new time"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function IdentityLookup() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const patients = useResource<{ patients?: Patient[] }>(
    `/api/clinic/patients/lookup?q=${encodeURIComponent(deferredQuery)}&per_page=25`,
  );

  return (
    <Paper
      component="section"
      variant="outlined"
      className="front-desk-identity"
    >
      <div>
        <Typography component="h2" variant="h2">
          Patient identity lookup
        </Typography>
        <Typography color="text.secondary" variant="body2">
          Search the clinic reference. Full charts and registration remain
          unavailable for this account.
        </Typography>
      </div>
      <TextField
        label="Clinic reference"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon aria-hidden="true" />
              </InputAdornment>
            ),
          },
        }}
      />
      {!patients.data && !patients.error && (
        <Typography role="status" color="text.secondary">
          Loading patient references…
        </Typography>
      )}
      {patients.error && <Alert severity="error">{patients.error}</Alert>}
      {patients.data?.patients?.length === 0 && (
        <Typography color="text.secondary">
          No matching clinic references were returned.
        </Typography>
      )}
      {!!patients.data?.patients?.length && (
        <ul className="front-desk-identity-results">
          {patients.data.patients.map((patient) => (
            <li key={patient.id}>
              <strong>{patient.display_name}</strong>
              <span>{patient.reference}</span>
            </li>
          ))}
        </ul>
      )}
    </Paper>
  );
}

function handleMutationError(
  error: unknown,
  setError: (message: string) => void,
) {
  if (error instanceof ApiError && error.status === 401) {
    window.location.replace("/login");
    return;
  }
  const message =
    error instanceof Error
      ? error.message
      : "The action could not be completed.";
  setError(
    `${message} The action was not retried. Refresh the schedule before trying again.`,
  );
}

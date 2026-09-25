import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import TodayOutlinedIcon from "@mui/icons-material/TodayOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, currentLoginDestination } from "../../api/client";
import { isDemoFrame } from "../demo/frame";
import type {
  ClinicSite,
  Clinician,
  EncounterDetail,
  FacilityRoom,
  Patient,
  VisitType,
} from "../../api/contracts";
import { businessNow } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";
import { bookingAvailability } from "./CareFlow";
import { patientReferenceLabel } from "./patientReference";
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
import { AppointmentRequestQueue } from "./AppointmentRequestQueue";
import { FrontDeskMembershipEnrollment } from "./FrontDeskMembershipEnrollment";
import "./frontDesk.css";

function allowed(capability: boolean | undefined) {
  return capability === true;
}

type AppointmentSetupField = "site" | "clinician" | "visit_type";
type AppointmentWithReadiness = FrontDeskAppointment & {
  needs_setup?: boolean;
  readiness?: "ready" | "needs_setup";
  setup_missing?: AppointmentSetupField[];
};

function appointmentSetupMissing(appointment: FrontDeskAppointment) {
  const projected = appointment as AppointmentWithReadiness;
  if (projected.readiness && projected.setup_missing)
    return projected.setup_missing;
  return [
    !appointment.site_id ? "site" : null,
    !appointment.booked_clinician_id ? "clinician" : null,
    !appointment.visit_type_id ? "visit_type" : null,
  ].filter((field): field is AppointmentSetupField => field !== null);
}

function setupFieldLabel(field: AppointmentSetupField) {
  return field === "visit_type" ? "visit type" : field;
}

export function FrontDesk() {
  const clinic = useClinic();
  const { capabilities } = clinic;
  const canPatients = allowed(capabilities.patients);
  const canIdentityLookup = allowed(capabilities.patient_identity_read);
  const canReadAppointments = allowed(capabilities.appointments_read);
  const canBilling = allowed(capabilities.billing_read);
  const canMembershipEnrollment = allowed(capabilities.subscriptions_review);
  const booking = bookingAvailability(capabilities);
  const [appointmentRequestRevision, setAppointmentRequestRevision] =
    useState(0);

  return (
    <div className="front-desk-page">
      <header className="front-desk-heading">
        <div>
          <Typography component="h1" variant="h1">
            Front desk
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 720 }}>
            Run today’s appointment queue, open the right patient record, and
            check patients in when they arrive.
          </Typography>
        </div>
        <Stack
          component="nav"
          aria-label="Front desk actions"
          className="front-desk-quick-actions"
          direction="row"
          spacing={1.5}
          useFlexGap
          sx={{ flexWrap: "wrap" }}
        >
          {canMembershipEnrollment && <FrontDeskMembershipEnrollment />}
          {capabilities.telehealth_read && (
            <Button href="/clinic/telehealth" variant="outlined">
              Virtual waiting room
            </Button>
          )}
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
        <>
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
            canScheduleReplacement={
              booking.visible && allowed(capabilities.patient_identity_read)
            }
            canReviewReminders={allowed(capabilities.reminders)}
            appointmentRequestRevision={appointmentRequestRevision}
          />
          {booking.visible && (
            <AppointmentRequestQueue
              currentSiteId={clinic.current_site?.id ?? null}
              onAppointmentBooked={() =>
                setAppointmentRequestRevision((revision) => revision + 1)
              }
            />
          )}
        </>
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
  canScheduleReplacement,
  canReviewReminders,
  appointmentRequestRevision,
}: {
  sites: ClinicSite[];
  currentSiteId: number | null;
  timezone: string;
  canPatients: boolean;
  canBilling: boolean;
  canTransition: boolean;
  canStartVisit: boolean;
  canReschedule: boolean;
  canScheduleReplacement: boolean;
  canReviewReminders: boolean;
  appointmentRequestRevision: number;
}) {
  const today = useMemo(
    () => clinicDateValue(businessNow(), timezone),
    [timezone],
  );
  const [date, setDate] = useState(() => {
    const requested = isDemoFrame()
      ? new URLSearchParams(window.location.search).get("date")
      : null;
    if (!requested || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return today;
    const parsed = new Date(`${requested}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === requested
      ? requested
      : today;
  });
  const [siteId, setSiteId] = useState(
    currentSiteId === null ? "" : String(currentSiteId),
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1);
  const [busyAction, setBusyAction] = useState("");
  const busyActionRef = useRef("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeContext, setNoticeContext] = useState<{
    patientId: number;
    appointmentId: number;
    kind: "cancellation" | "reminders";
  }>();
  const [refreshedAt, setRefreshedAt] = useState<Date>();
  const [reschedule, setReschedule] = useState<RescheduleDraft>();
  const [confirmation, setConfirmation] = useState<{
    appointment: FrontDeskAppointment;
    action: "start" | "cancelled" | "no_show";
  } | null>(null);
  const [cancellationMessageAcknowledged, setCancellationMessageAcknowledged] =
    useState(false);
  const path = buildAppointmentQueuePath({
    date,
    siteId,
    query: deferredQuery,
    page,
  });
  const appointments = useResource<FrontDeskAppointmentResponse>(path);
  const clinicians = useResource<{ clinicians: Clinician[] }>(
    "/api/clinic/clinicians?per_page=100",
  );
  const visitTypes = useResource<{ visit_types: VisitType[] }>(
    "/api/clinic/facilities?type=visit_types&per_page=100",
  );
  const rooms = useResource<{ rooms: FacilityRoom[] }>(
    "/api/clinic/facilities?type=rooms&per_page=100",
  );

  const unknownMutationFailure = (error: unknown) =>
    !(error instanceof ApiError) ||
    error.status === 408 ||
    error.status >= 500 ||
    error.code === "outcome_unconfirmed";

  async function refreshedAppointment(appointment: FrontDeskAppointment) {
    const result = await api<{ appointment: FrontDeskAppointment }>(
      `/api/clinic/appointments/${appointment.id}`,
    );
    if (
      result.appointment.id !== appointment.id ||
      result.appointment.patient_id !== appointment.patient_id
    )
      throw new Error("The refreshed appointment did not match this patient.");
    return result.appointment;
  }

  useEffect(() => {
    if (appointments.data) setRefreshedAt(new Date());
  }, [appointments.data]);

  useEffect(() => {
    if (appointmentRequestRevision) appointments.refresh();
  }, [appointmentRequestRevision]);

  async function transition(
    appointment: FrontDeskAppointment,
    to: AppointmentTransition,
    confirmed = false,
  ) {
    const patientName = appointment.patient?.display_name || "this patient";
    if (to !== "confirmed" && !confirmed) {
      if (to === "cancelled") setCancellationMessageAcknowledged(false);
      setConfirmation({ appointment, action: to });
      return;
    }

    const actionKey = `${appointment.id}:${to}`;
    if (busyActionRef.current) return;
    busyActionRef.current = actionKey;
    setBusyAction(actionKey);
    setActionError("");
    setNotice("");
    setNoticeContext(undefined);
    try {
      await api(`/api/clinic/appointments/${appointment.id}/transition`, {
        method: "POST",
        body: {
          transition: {
            to,
            expected_status: appointment.status,
            ...(to === "cancelled"
              ? { cancellation_message_acknowledged: true }
              : {}),
          },
        },
      });
      setNotice(
        to === "confirmed"
          ? `${patientName} is confirmed.`
          : to === "cancelled"
            ? `${patientName}’s appointment was cancelled. No cancellation message was sent by this action.`
            : `${patientName} was marked as a no-show.`,
      );
      if (to === "cancelled")
        setNoticeContext({
          patientId: appointment.patient_id,
          appointmentId: appointment.id,
          kind: "cancellation",
        });
      appointments.refresh();
    } catch (error) {
      if (!unknownMutationFailure(error)) {
        handleMutationError(error, setActionError);
      } else {
        try {
          const refreshed = await refreshedAppointment(appointment);
          if (refreshed.status === to) {
            setNotice(
              to === "confirmed"
                ? `${patientName} is confirmed.`
                : to === "cancelled"
                  ? `${patientName}’s appointment was cancelled. No cancellation message was sent by this action.`
                  : `${patientName} was marked as a no-show.`,
            );
            if (to === "cancelled")
              setNoticeContext({
                patientId: appointment.patient_id,
                appointmentId: appointment.id,
                kind: "cancellation",
              });
          } else if (refreshed.status === appointment.status) {
            setActionError(
              "The schedule confirms that the action was not applied. You can retry it.",
            );
          } else {
            setActionError(
              `The appointment changed to ${refreshed.status.replaceAll("_", " ")} while the request was being checked.`,
            );
          }
          appointments.refresh();
        } catch (refreshError) {
          handleMutationError(refreshError, setActionError);
        }
      }
    } finally {
      if (busyActionRef.current === actionKey) busyActionRef.current = "";
      setBusyAction("");
    }
  }

  async function startVisit(
    appointment: FrontDeskAppointment,
    confirmed = false,
  ) {
    const patientName = appointment.patient?.display_name || "this patient";
    if (!confirmed) {
      setConfirmation({ appointment, action: "start" });
      return;
    }

    const actionKey = `${appointment.id}:start`;
    if (busyActionRef.current) return;
    busyActionRef.current = actionKey;
    setBusyAction(actionKey);
    setActionError("");
    setNotice("");
    setNoticeContext(undefined);
    try {
      const result = await api<{ encounter: EncounterDetail }>(
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
      if (
        result.encounter.patient_id !== appointment.patient_id ||
        result.encounter.appointment_id !== appointment.id
      )
        throw new Error(
          "The created encounter did not match this appointment.",
        );
      setNotice(`${patientName} is checked in and the visit is in progress.`);
      appointments.refresh();
    } catch (error) {
      if (!unknownMutationFailure(error)) {
        handleMutationError(error, setActionError);
      } else {
        try {
          const refreshed = await refreshedAppointment(appointment);
          if (refreshed.encounter_id) {
            setNotice(
              `${patientName} is checked in and the visit is in progress.`,
            );
          } else {
            setActionError(
              "The schedule confirms that check-in was not applied. You can retry it.",
            );
          }
          appointments.refresh();
        } catch (refreshError) {
          handleMutationError(refreshError, setActionError);
        }
      }
    } finally {
      if (busyActionRef.current === actionKey) busyActionRef.current = "";
      setBusyAction("");
    }
  }

  function openReschedule(appointment: FrontDeskAppointment) {
    setActionError("");
    setNotice("");
    setNoticeContext(undefined);
    setReschedule({
      appointment,
      startsAt: localDateTimeInput(appointment.starts_at),
      endsAt: localDateTimeInput(appointment.ends_at),
      siteId: appointment.site_id ? String(appointment.site_id) : "",
      roomId: appointment.room_id ? String(appointment.room_id) : "",
      clinicianId: appointment.booked_clinician_id
        ? String(appointment.booked_clinician_id)
        : "",
      visitTypeId: appointment.visit_type_id
        ? String(appointment.visit_type_id)
        : "",
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
    if (
      !reschedule.siteId ||
      !reschedule.clinicianId ||
      !reschedule.visitTypeId
    ) {
      setReschedule((current) =>
        current
          ? {
              ...current,
              error: "Choose a site, clinician, and visit type before saving.",
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
            site_id: reschedule.siteId,
            room_id: reschedule.roomId || null,
            booked_clinician_id: reschedule.clinicianId,
            visit_type_id: reschedule.visitTypeId,
            expected_updated_at: reschedule.appointment.updated_at,
            request_key: reschedule.requestKey,
          },
        },
      });
      const patientName =
        reschedule.appointment.patient?.display_name || "The patient";
      setReschedule(undefined);
      setNotice(
        `${patientName}’s appointment was updated. Review reminders and send an updated message if a custom reminder was cancelled.`,
      );
      setNoticeContext({
        patientId: reschedule.appointment.patient_id,
        appointmentId: reschedule.appointment.id,
        kind: "reminders",
      });
      appointments.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        window.location.replace(
          `/login?next=${encodeURIComponent(currentLoginDestination())}`,
        );
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
          size="small"
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
          size="small"
          value={siteId}
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
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
          size="small"
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
            canReviewReminders && noticeContext ? (
              <Button
                component="a"
                href={`/clinic/reminders?patient_id=${noticeContext.patientId}&appointment_id=${noticeContext.appointmentId}`}
                color="inherit"
                size="small"
              >
                {noticeContext.kind === "cancellation"
                  ? "Review patient message"
                  : "Review reminders"}
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
                canScheduleReplacement={canScheduleReplacement}
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
      <Dialog
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="appointment-action-title"
      >
        <DialogTitle id="appointment-action-title">
          {confirmation?.action === "start"
            ? "Check in patient"
            : confirmation?.action === "cancelled"
              ? "Cancel appointment"
              : "Mark as no-show"}
        </DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontWeight: 700 }}>
            {confirmation?.appointment.patient?.display_name ||
              "Patient record"}
          </Typography>
          {confirmation && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {appointmentTimeRange(confirmation.appointment, timezone)} ·{" "}
              {siteLabel(sites, confirmation.appointment.site_id)}
            </Typography>
          )}
          <Typography sx={{ mt: 2 }}>
            {confirmation?.action === "start"
              ? "Check this patient in after confirming they have arrived. This opens the clinical encounter."
              : confirmation?.action === "cancelled"
                ? "Cancel this appointment? This updates the schedule and cancels pending reminders. It does not send a cancellation message to the patient."
                : "Record that the patient did not attend this appointment?"}
          </Typography>
          {confirmation?.action === "cancelled" && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={cancellationMessageAcknowledged}
                  onChange={(event) =>
                    setCancellationMessageAcknowledged(event.target.checked)
                  }
                />
              }
              label="I understand that no cancellation message will be sent automatically."
              sx={{ mt: 1, alignItems: "flex-start" }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(null)}>Go back</Button>
          <Button
            variant="contained"
            color={confirmation?.action === "start" ? "primary" : "error"}
            disabled={
              confirmation?.action === "cancelled" &&
              !cancellationMessageAcknowledged
            }
            onClick={() => {
              if (!confirmation || busyAction) return;
              const confirmed = confirmation;
              setConfirmation(null);
              if (confirmed.action === "start")
                void startVisit(confirmed.appointment, true);
              else
                void transition(confirmed.appointment, confirmed.action, true);
            }}
          >
            {confirmation?.action === "start"
              ? "Check in"
              : confirmation?.action === "cancelled"
                ? "Cancel appointment"
                : "Mark as no-show"}
          </Button>
        </DialogActions>
      </Dialog>
      <RescheduleDialog
        draft={reschedule}
        clinicTimezone={timezone}
        sites={sites}
        clinicians={clinicians.data?.clinicians ?? []}
        visitTypes={visitTypes.data?.visit_types ?? []}
        rooms={rooms.data?.rooms ?? []}
        setupOptionsError={clinicians.error || visitTypes.error || rooms.error}
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
  canScheduleReplacement,
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
  canScheduleReplacement: boolean;
  busyAction: string;
  onTransition: (
    appointment: FrontDeskAppointment,
    to: AppointmentTransition,
  ) => Promise<void>;
  onStartVisit: (appointment: FrontDeskAppointment) => Promise<void>;
  onReschedule: (appointment: FrontDeskAppointment) => void;
}) {
  const actions = appointmentActions(appointment);
  const setupMissing = appointmentSetupMissing(appointment);
  const needsSetup = setupMissing.length > 0;
  const status = appointmentStatus(appointment);
  const patientName = appointment.patient?.display_name || "Patient record";
  const patientReference = patientReferenceLabel(
    appointment.patient?.reference,
  );
  const anyActionBusy = busyAction.length > 0;
  const patientPath = `/clinic/patients/${appointment.patient_id}`;
  const chartPath = appointment.encounter_id
    ? `${patientPath}/encounters/${appointment.encounter_id}`
    : "";
  const billingPath = `/clinic/billing/patients?patient_id=${appointment.patient_id}`;
  const hasVisibleAction =
    (canTransition &&
      ((!needsSetup && actions.canConfirm) ||
        actions.canCancel ||
        actions.canMarkNoShow)) ||
    (!needsSetup && canStartVisit && actions.canStartVisit) ||
    (canReschedule && actions.canReschedule) ||
    (canScheduleReplacement && actions.canScheduleReplacement) ||
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
        {patientReference && <span>{patientReference}</span>}
      </div>
      <div data-label="Location">
        <strong>{siteLabel(sites, appointment.site_id)}</strong>
        {appointment.room_code && <span>Room {appointment.room_code}</span>}
      </div>
      <div data-label="Status">
        <Chip size="small" label={status.label} color={status.color} />
        {needsSetup &&
          (canReschedule ? (
            <Button
              size="small"
              variant="text"
              onClick={() => onReschedule(appointment)}
              aria-label={`Complete appointment setup: ${setupMissing.map(setupFieldLabel).join(", ")}`}
            >
              Needs setup: {setupMissing.map(setupFieldLabel).join(", ")}
            </Button>
          ) : (
            <span>
              Needs setup: {setupMissing.map(setupFieldLabel).join(", ")}
            </span>
          ))}
        {appointment.encounter_status === "open" && (
          <span>Clinical encounter open</span>
        )}
      </div>
      <div className="front-desk-actions" data-label="Next action">
        {canTransition && actions.canConfirm && !needsSetup && (
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
        {canStartVisit && actions.canStartVisit && !needsSetup && (
          <Button
            size="small"
            variant="contained"
            startIcon={<CheckCircleOutlineIcon />}
            disabled={anyActionBusy}
            onClick={() => void onStartVisit(appointment)}
          >
            {busyAction === `${appointment.id}:start`
              ? "Checking in…"
              : "Check in"}
          </Button>
        )}
        {appointment.telehealth?.clinic_href && (
          <Button
            href={appointment.telehealth.clinic_href}
            size="small"
            variant="outlined"
          >
            Open video visit
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
            {needsSetup ? "Complete setup" : "Reschedule"}
          </Button>
        )}
        {canScheduleReplacement && actions.canScheduleReplacement && (
          <Button
            component="a"
            href={`/clinic/schedule?patient_id=${encodeURIComponent(String(appointment.patient_id))}`}
            size="small"
            variant="outlined"
            disabled={anyActionBusy}
            aria-label={`Schedule a replacement appointment for ${patientName}`}
          >
            Schedule replacement
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
  siteId: string;
  roomId: string;
  clinicianId: string;
  visitTypeId: string;
  requestKey: string;
  error: string;
  busy: boolean;
  outcomeUnconfirmed: boolean;
};

function RescheduleDialog({
  draft,
  clinicTimezone,
  sites,
  clinicians,
  visitTypes,
  rooms,
  setupOptionsError,
  onChange,
  onClose,
  onSave,
  onRefresh,
}: {
  draft: RescheduleDraft | undefined;
  clinicTimezone: string;
  sites: ClinicSite[];
  clinicians: Clinician[];
  visitTypes: VisitType[];
  rooms: FacilityRoom[];
  setupOptionsError?: string;
  onChange: (draft: RescheduleDraft | undefined) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  onRefresh: () => void;
}) {
  const browserTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "your device time zone";
  const patientName = draft?.appointment.patient?.display_name || "Patient";
  const needsSetup = draft
    ? appointmentSetupMissing(draft.appointment).length > 0
    : false;

  return (
    <Dialog
      open={Boolean(draft)}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="reschedule-title"
    >
      <DialogTitle id="reschedule-title">
        {needsSetup ? "Complete appointment setup" : "Edit appointment"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <div>
            <Typography sx={{ fontWeight: 700 }}>{patientName}</Typography>
            <Typography color="text.secondary" variant="body2">
              Review the time and required setup before saving.
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
          {setupOptionsError && (
            <Alert severity="warning">{setupOptionsError}</Alert>
          )}
          <TextField
            select
            required
            label="Site"
            autoFocus={Boolean(
              draft && appointmentSetupMissing(draft.appointment)[0] === "site",
            )}
            value={draft?.siteId || ""}
            disabled={draft?.busy || draft?.outcomeUnconfirmed}
            onChange={(event) =>
              draft &&
              onChange({
                ...draft,
                siteId: event.target.value,
                roomId: "",
                requestKey: draft.error
                  ? crypto.randomUUID()
                  : draft.requestKey,
                error: "",
              })
            }
          >
            <MenuItem value="" disabled>
              Select a site
            </MenuItem>
            {sites.map((site) => (
              <MenuItem key={site.id} value={String(site.id)}>
                {site.name || site.code}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Room"
            value={draft?.roomId || ""}
            disabled={draft?.busy || draft?.outcomeUnconfirmed}
            onChange={(event) =>
              draft &&
              onChange({
                ...draft,
                roomId: event.target.value,
                requestKey: draft.error
                  ? crypto.randomUUID()
                  : draft.requestKey,
                error: "",
              })
            }
          >
            <MenuItem value="">No room</MenuItem>
            {rooms
              .filter(
                (room) =>
                  String(room.site_id) === draft?.siteId &&
                  room.kind === "physical",
              )
              .map((room) => (
                <MenuItem key={room.id} value={String(room.id)}>
                  {room.code}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            select
            required
            label="Booked clinician"
            autoFocus={Boolean(
              draft &&
              appointmentSetupMissing(draft.appointment)[0] === "clinician",
            )}
            value={draft?.clinicianId || ""}
            disabled={draft?.busy || draft?.outcomeUnconfirmed}
            onChange={(event) =>
              draft &&
              onChange({
                ...draft,
                clinicianId: event.target.value,
                requestKey: draft.error
                  ? crypto.randomUUID()
                  : draft.requestKey,
                error: "",
              })
            }
          >
            <MenuItem value="" disabled>
              Select a clinician
            </MenuItem>
            {clinicians.map((clinician) => (
              <MenuItem key={clinician.id} value={String(clinician.id)}>
                {clinician.display_name?.trim() ||
                  clinician.reference ||
                  `Clinician profile #${clinician.id}`}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            required
            label="Visit type"
            autoFocus={Boolean(
              draft &&
              appointmentSetupMissing(draft.appointment)[0] === "visit_type",
            )}
            value={draft?.visitTypeId || ""}
            disabled={draft?.busy || draft?.outcomeUnconfirmed}
            onChange={(event) =>
              draft &&
              onChange({
                ...draft,
                visitTypeId: event.target.value,
                requestKey: draft.error
                  ? crypto.randomUUID()
                  : draft.requestKey,
                error: "",
              })
            }
          >
            <MenuItem value="" disabled>
              Select a visit type
            </MenuItem>
            {visitTypes
              .filter((type) => !type.retired_at)
              .map((type) => (
                <MenuItem key={type.id} value={String(type.id)}>
                  {type.code}
                </MenuItem>
              ))}
          </TextField>
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
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!draft || draft.busy}
          onClick={() => void onSave()}
        >
          {draft?.busy ? "Saving…" : "Save appointment"}
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
              {patientReferenceLabel(patient.reference) && (
                <span>{patientReferenceLabel(patient.reference)}</span>
              )}
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
    window.location.replace(
      `/login?next=${encodeURIComponent(currentLoginDestination())}`,
    );
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

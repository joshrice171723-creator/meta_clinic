import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type {
  Appointment,
  Patient,
  CalendarAppointment,
  CalendarHold,
  CalendarResponse,
} from "../../api/contracts";
import { api } from "../../api/client";
import { businessNow } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { workflowStatusLabel } from "./workflowStatus";
import { patientReferenceLabel } from "./patientReference";
import { SeriesManagement } from "./SeriesManagement";

export type CalendarBooking = {
  site_id: number;
  clinician_id?: number;
  room_id?: number;
  starts_at?: string;
  ends_at?: string;
  hold?: CalendarHold;
  overbook?: boolean;
};

export function calendarTimezone(
  sites: { id: number; timezone_override?: string | null }[],
  siteId: string,
  fallback: string,
) {
  return (
    sites.find((site) => String(site.id) === siteId)?.timezone_override ||
    fallback
  );
}

export function calendarDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftCalendarMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}
export function isValidCalendarMonth(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const [year, month] = value.split("-").map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}
export function isValidCalendarDay(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}
export function calendarInstant(date: string, hour: number, timezone: string) {
  const wall = Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  let instant = wall;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const value = (name: string) => parts.find((p) => p.type === name)?.value;
    const observed = Date.parse(
      `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:00Z`,
    );
    instant += wall - observed;
  }
  return new Date(instant).toISOString();
}
function minuteOfDay(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return (
    Number(parts.find((p) => p.type === "hour")?.value) * 60 +
    Number(parts.find((p) => p.type === "minute")?.value)
  );
}
export function appointmentTracks(appointments: CalendarAppointment[]) {
  const result = new Map<number, { track: number; tracks: number }>();
  let active: { end: number; track: number }[] = [];
  let cluster: { id: number; track: number }[] = [];
  let count = 0;
  const finish = () =>
    cluster.forEach((item) =>
      result.set(item.id, { track: item.track, tracks: count }),
    );
  for (const appointment of [...appointments].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  )) {
    const start = Date.parse(appointment.starts_at);
    active = active.filter((item) => item.end > start);
    if (!active.length) {
      finish();
      cluster = [];
      count = 0;
    }
    let track = 0;
    while (active.some((item) => item.track === track)) track += 1;
    active.push({
      end: Math.max(Date.parse(appointment.ends_at), start + 30 * 60000),
      track,
    });
    cluster.push({ id: appointment.id, track });
    count = Math.max(count, track + 1);
  }
  finish();
  return result;
}

type CalendarIcsOptions = {
  calendarName: string;
  generatedAt?: string;
};

function icsEscape(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "");
}

function icsUtc(value: string) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  return instant
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

/**
 * Builds a read-only iCalendar snapshot from the server-owned projection.
 * Cancelled/no-show visits are intentionally omitted so an export cannot
 * suggest that a patient should still arrive. The server snapshot timestamp
 * is retained in DTSTAMP for reconciliation.
 */
export function buildCalendarIcs(
  appointments: CalendarAppointment[],
  { calendarName, generatedAt }: CalendarIcsOptions,
) {
  const generated = icsUtc(generatedAt || new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meta Clinic//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    `X-META-CLINIC-SOURCE:${icsEscape("server-calendar-read-only")}`,
  ];
  appointments
    .filter(
      (appointment) => !["cancelled", "no_show"].includes(appointment.status),
    )
    .forEach((appointment) => {
      const start = icsUtc(appointment.starts_at);
      const end = icsUtc(appointment.ends_at);
      if (!start || !end) return;
      const patient =
        appointment.patient?.display_name || "Patient appointment";
      const visitType = appointment.visit_type_name || "Clinic appointment";
      const status = appointment.calendar_status || appointment.status;
      const icsStatus = status === "scheduled" ? "TENTATIVE" : "CONFIRMED";
      const description = [
        `Patient: ${patient}`,
        `Status: ${status}`,
        "Source: Meta Clinic server calendar (read-only export)",
      ].join("\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:meta-clinic-${appointment.id}@local`,
        `DTSTAMP:${generated}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `STATUS:${icsStatus}`,
        `SUMMARY:${icsEscape(`${patient} · ${visitType}`)}`,
        `DESCRIPTION:${icsEscape(description)}`,
        ...(appointment.room_name
          ? [`LOCATION:${icsEscape(appointment.room_name)}`]
          : []),
        "END:VEVENT",
      );
    });
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });

export function slotBookingAriaLabel({
  startsAt,
  date,
  timezone,
  clinicianName,
  roomName,
}: {
  startsAt: string;
  date: string;
  timezone: string;
  clinicianName: string;
  roomName?: string;
}) {
  const time = new Date(startsAt).toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return roomName
    ? `Book ${time} on ${dateLabel(date)} in ${roomName}`
    : `Book ${time} on ${dateLabel(date)} with ${clinicianName}`;
}

export function ClinicSchedule({
  initialPatientId,
  canBook,
  renderBooking,
}: {
  initialPatientId?: number;
  canBook: boolean;
  renderBooking: (
    slot: CalendarBooking | undefined,
    onCreated: (appointment: Appointment) => void,
    onHoldChanged: () => void,
    onChooseNewSlot: () => void,
    onClose?: () => void,
  ) => ReactNode;
}) {
  const context = useClinic();
  const routeParams = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const [siteId, setSiteId] = useState(
    routeParams.get("site_id") ||
      String(context.current_site?.id ?? context.sites[0]?.id ?? ""),
  );
  const timezone = calendarTimezone(
    context.sites,
    siteId,
    context.practice.timezone,
  );
  const today = calendarDate(businessNow(), timezone);
  const initialMonth = isValidCalendarMonth(routeParams.get("month"))
    ? routeParams.get("month")!
    : today.slice(0, 7);
  const initialDay = isValidCalendarDay(routeParams.get("day"))
    ? routeParams.get("day")!
    : initialMonth === today.slice(0, 7)
      ? today
      : `${initialMonth}-01`;
  const [month, setMonth] = useState(initialMonth);
  const [day, setDay] = useState(
    initialDay.startsWith(initialMonth) ? initialDay : `${initialMonth}-01`,
  );
  const [view, setView] = useState<"month" | "day">(
    routeParams.get("view") === "day" ? "day" : "month",
  );
  const [group, setGroup] = useState<"clinician" | "room">(
    routeParams.get("group") === "clinician" ? "clinician" : "room",
  );
  const [booking, setBooking] = useState<CalendarBooking>();
  const [selected, setSelected] = useState<CalendarAppointment>();
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const [seriesId, setSeriesId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [holdError, setHoldError] = useState("");
  const [busy, setBusy] = useState(false);
  const releaseAttempt = useRef<{
    holdId: number;
    lockVersion: number;
    requestKey: string;
  } | null>(null);
  const routeInitialized = useRef(false);
  const patient = useResource<{ patients: Patient[] }>(
    `/api/clinic/patients/lookup?id=${initialPatientId ?? ""}`,
    { enabled: Boolean(initialPatientId) },
  );
  const selectedPatient = patient.data?.patients.find(
    (item) => item.id === initialPatientId,
  );
  const patientName = selectedPatient?.display_name;
  const calendar = useResource<CalendarResponse>(
    `/api/clinic/schedule_calendar?site_id=${siteId}&date=${month}-01`,
    { enabled: Boolean(siteId), retainDataOnRefresh: true },
  );
  // Retained responses must never be displayed under another location/month.
  const data =
    calendar.data?.month === month && String(calendar.data.site_id) === siteId
      ? calendar.data
      : undefined;
  const refreshCalendar = useRef(calendar.refresh);
  refreshCalendar.current = calendar.refresh;
  const nextHoldExpiry = data?.days
    .flatMap((item) => item.holds)
    .map((hold) => Date.parse(hold.expires_at))
    .filter((instant) => instant > businessNow().getTime())
    .sort((left, right) => left - right)[0];
  useEffect(() => {
    if (nextHoldExpiry === undefined) return;
    const timer = window.setTimeout(
      () => {
        refreshCalendar.current();
        setNotice(
          "A slot hold expired. Choose a currently available slot before booking.",
        );
      },
      Math.max(1, nextHoldExpiry - businessNow().getTime() + 100),
    );
    return () => window.clearTimeout(timer);
  }, [nextHoldExpiry]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("month", month);
    params.set("day", day);
    params.set("view", view);
    params.set("group", group);
    if (siteId) params.set("site_id", siteId);
    else params.delete("site_id");
    const nextSearch = `?${params.toString()}`;
    if (nextSearch === window.location.search) {
      routeInitialized.current = true;
      return;
    }
    const nextUrl = `${window.location.pathname}${nextSearch}`;
    if (routeInitialized.current) {
      window.history.pushState(window.history.state, "", nextUrl);
    } else {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
    routeInitialized.current = true;
  }, [day, group, month, siteId, view]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const restoreFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const nextMonth = isValidCalendarMonth(params.get("month"))
        ? params.get("month")!
        : today.slice(0, 7);
      const requestedDay = isValidCalendarDay(params.get("day"))
        ? params.get("day")!
        : `${nextMonth}-01`;
      setMonth(nextMonth);
      setDay(
        requestedDay.startsWith(nextMonth) ? requestedDay : `${nextMonth}-01`,
      );
      setView(params.get("view") === "day" ? "day" : "month");
      setGroup(params.get("group") === "clinician" ? "clinician" : "room");
      setSiteId(
        params.get("site_id") ||
          String(context.current_site?.id ?? context.sites[0]?.id ?? ""),
      );
    };
    window.addEventListener("popstate", restoreFromUrl);
    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, [context.current_site?.id, context.sites, today]);
  const selectedDay = data?.days.find((item) => item.date === day);
  const time = (value: string) =>
    new Date(value).toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    });
  const actionLabel = "Book appointment";
  function openDay(date: string) {
    setDay(date);
    setView("day");
  }
  function changeMonth(offset: number) {
    const next = shiftCalendarMonth(month, offset);
    setMonth(next);
    setDay(`${next}-01`);
  }
  function booked(appointment: Appointment) {
    const date = calendarDate(new Date(appointment.starts_at), timezone);
    setBooking(undefined);
    setMonth(date.slice(0, 7));
    setDay(date);
    setView("day");
    setNotice(
      `Appointment scheduled for ${appointment.patient?.display_name ?? "the selected patient"}. Check in when they arrive.`,
    );
    calendar.refresh();
  }
  function exportCalendar() {
    if (!data) return;
    const appointments =
      view === "day"
        ? selectedDay?.appointments || []
        : data.days.flatMap((item) => item.appointments);
    const blob = new Blob(
      [
        buildCalendarIcs(appointments, {
          calendarName: `Meta Clinic ${
            context.sites.find((site) => String(site.id) === siteId)?.name ||
            "schedule"
          }`,
          generatedAt: data.as_of,
        }),
      ],
      {
        type: "text/calendar;charset=utf-8",
      },
    );
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `meta-clinic-schedule-${view === "day" ? day : month}.ics`;
    link.click();
    URL.revokeObjectURL(href);
  }
  async function checkIn() {
    if (!selected || busy) return;
    setBusy(true);
    setMutationError("");
    try {
      const result = await api<{
        encounter: { patient_id: number; appointment_id: number };
      }>(`/api/clinic/patients/${selected.patient_id}/encounters`, {
        method: "POST",
        body: { encounter: { appointment_id: selected.id } },
      });
      if (
        result.encounter.patient_id !== selected.patient_id ||
        result.encounter.appointment_id !== selected.id
      )
        throw new Error(
          "Check-in response did not match this appointment. Refresh before continuing.",
        );
      setSelected(undefined);
      setNotice(
        "Patient checked in. Their visit is now on the Tracking Board.",
      );
      calendar.refresh();
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "Check-in could not be verified. Refresh before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancelSelectedAppointment() {
    if (!selected || busy) return;
    setBusy(true);
    setMutationError("");
    try {
      const result = await api<{ appointment: { id: number; status: string } }>(
        `/api/clinic/appointments/${selected.id}/transition`,
        {
          method: "POST",
          body: {
            transition: {
              to: "cancelled",
              expected_status: selected.status,
              cancellation_message_acknowledged: true,
            },
          },
        },
      );
      if (
        result.appointment.id !== selected.id ||
        result.appointment.status !== "cancelled"
      )
        throw new Error(
          "The cancellation response did not match this appointment. Refresh before trying again.",
        );
      setSelected(undefined);
      setNotice(
        "Appointment cancelled. No cancellation message was sent by this action.",
      );
      calendar.refresh();
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "The appointment could not be cancelled. Refresh before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function releaseHold(hold: CalendarHold) {
    if (busy) return;
    const prior = releaseAttempt.current;
    const attempt =
      prior?.holdId === hold.id && prior.lockVersion === hold.lock_version
        ? prior
        : {
            holdId: hold.id,
            lockVersion: hold.lock_version,
            requestKey: crypto.randomUUID(),
          };
    releaseAttempt.current = attempt;
    setBusy(true);
    setHoldError("");
    try {
      const result = await api<{
        hold: { id: number; state: string; lock_version: number };
      }>(`/api/clinic/schedule_holds/${hold.id}/release`, {
        method: "POST",
        body: {
          hold: {
            request_key: attempt.requestKey,
            lock_version: attempt.lockVersion,
          },
        },
      });
      if (result.hold.id !== hold.id || result.hold.state !== "released")
        throw new Error(
          "The hold release could not be confirmed. Refresh the schedule before retrying.",
        );
      releaseAttempt.current = null;
      setNotice("Slot hold released. Availability has been refreshed.");
      calendar.refresh();
    } catch (error) {
      setHoldError(
        error instanceof Error
          ? error.message
          : "The hold release could not be confirmed. Refresh before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  const columns = group === "clinician" ? data?.clinicians : data?.rooms;
  const activeColumns = columns?.length
    ? columns
    : [
        {
          id: 0,
          name: group === "room" ? "Unassigned room" : "Unassigned clinician",
        },
      ];
  const unassigned = selectedDay?.appointments.some((a) =>
    group === "room" ? !a.room_id : !a.booked_clinician_id,
  );
  const lanes =
    unassigned && activeColumns.every((c) => c.id !== 0)
      ? [...activeColumns, { id: 0, name: "Unassigned" }]
      : activeColumns;
  const intervals = [
    ...(selectedDay?.slots ?? []),
    ...(selectedDay?.appointments ?? []),
  ];
  const startMinute =
    Math.floor(
      Math.min(
        8 * 60,
        ...intervals.map((s) => minuteOfDay(s.starts_at, timezone)),
      ) / 30,
    ) * 30;
  const endMinute = Math.min(
    1440,
    Math.ceil(
      Math.max(
        18 * 60,
        ...intervals.map((s) => minuteOfDay(s.ends_at, timezone) || 1440),
      ) / 30,
    ) * 30,
  );
  const ticks = Array.from(
    { length: (endMinute - startMinute) / 30 },
    (_, index) => startMinute + index * 30,
  );
  const tracks = new Map<number, { track: number; tracks: number }>();
  for (const lane of lanes) {
    const appointments =
      selectedDay?.appointments.filter(
        (a) =>
          !["cancelled", "no_show"].includes(a.status) &&
          ((group === "clinician" ? a.booked_clinician_id : a.room_id) ?? 0) ===
            lane.id,
      ) ?? [];
    for (const [id, position] of appointmentTracks(appointments))
      tracks.set(id, position);
  }
  return (
    <Stack spacing={1}>
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Box>
          <Typography component="h1" variant="h5">
            Schedule
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Appointments and availability · {timezone}
          </Typography>
        </Box>
        <Stack direction="row" sx={{ gap: 1 }}>
          <Button href="/clinic" data-clinic-view="tracking">
            Tracking Board
          </Button>
          {canBook && (
            <Button
              variant="contained"
              disabled={!siteId}
              onClick={() => {
                // No slot was selected; let BookingForm use real-time defaults.
                setBooking({ site_id: Number(siteId) });
              }}
            >
              {actionLabel}
            </Button>
          )}
        </Stack>
      </Stack>
      {initialPatientId && (
        <Alert severity="info">
          <Stack spacing={0.25}>
            <Typography>
              {patientName
                ? `Scheduling for ${patientName}.`
                : "Verifying the patient selected from Patient Flow."}
            </Typography>
            {selectedPatient?.reference && (
              <Typography variant="body2">
                Clinic reference:{" "}
                {patientReferenceLabel(selectedPatient.reference)}
              </Typography>
            )}
            <Typography variant="body2">
              Choose a day and available time to schedule an appointment.
            </Typography>
          </Stack>
        </Alert>
      )}
      {patient.error && (
        <Alert severity="error">
          The selected patient could not be loaded. {patient.error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      <Stack
        direction="row"
        sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}
      >
        <Button aria-label="Previous month" onClick={() => changeMonth(-1)}>
          ←
        </Button>
        <Typography component="h2" variant="h6" sx={{ minWidth: 160 }}>
          {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", {
            timeZone: "UTC",
            month: "long",
            year: "numeric",
          })}
        </Typography>
        <Button aria-label="Next month" onClick={() => changeMonth(1)}>
          →
        </Button>
        <Button
          onClick={() => {
            setMonth(today.slice(0, 7));
            setDay(today);
          }}
        >
          Today
        </Button>
        <TextField
          select
          size="small"
          label="Location"
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
          sx={{ minWidth: 170 }}
        >
          {context.sites.map((site) => (
            <MenuItem key={site.id} value={String(site.id)}>
              {site.name || site.code}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={view}
          onChange={(_, next) => next && setView(next)}
          aria-label="Calendar view"
        >
          <ToggleButton value="month">Month</ToggleButton>
          <ToggleButton value="day">Day</ToggleButton>
        </ToggleButtonGroup>
        {view === "day" && (
          <TextField
            type="date"
            size="small"
            label="Day"
            value={day}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => {
              if (event.target.value) {
                setDay(event.target.value);
                setMonth(event.target.value.slice(0, 7));
              }
            }}
          />
        )}
        {view === "day" && (
          <TextField
            select
            size="small"
            label="Group by"
            value={group}
            onChange={(event) =>
              setGroup(event.target.value as "clinician" | "room")
            }
          >
            <MenuItem value="clinician">Clinician</MenuItem>
            <MenuItem value="room">Room</MenuItem>
          </TextField>
        )}
        <Button onClick={calendar.refresh}>Refresh</Button>
        <Button
          variant="outlined"
          onClick={exportCalendar}
          disabled={!data}
          aria-label={`Export ${view === "day" ? "day" : "month"} schedule as a read-only calendar file`}
        >
          Export {view === "day" ? "day" : "month"} · read-only
        </Button>
      </Stack>
      {data && (
        <Typography variant="caption" color="text.secondary">
          Export omits cancelled and no-show appointments
          {data.as_of
            ? ` · Updated ${new Date(data.as_of).toLocaleString()}`
            : ""}
        </Typography>
      )}
      {calendar.error && (
        <Alert severity="error">
          {calendar.error} <Button onClick={calendar.refresh}>Retry</Button>
        </Alert>
      )}
      {!siteId ? (
        <Alert severity="info">Choose a location to view its schedule.</Alert>
      ) : !data ? (
        calendar.error ? null : (
          <Typography role="status">Loading calendar…</Typography>
        )
      ) : (
        <>
          {!data.capacity_configured && (
            <Alert severity="info">
              Clinician availability is not configured for this location.
              Appointments are shown; available capacity is unknown.{" "}
              <Button href="/clinic/waitlist">Set clinician capacity</Button>
            </Alert>
          )}
          {(data.policy?.recurrence === "not_configured" ||
            data.policy?.overbook === "not_configured") && (
            <Alert severity="warning" sx={{ py: 0, alignItems: "center" }}>
              {data.policy.recurrence === "not_configured" &&
                "Recurring appointments are off. "}
              {data.policy.overbook === "not_configured" &&
                "Overbook exceptions are off. "}
              An authorized staff member can change this site's scheduling
              policy in Clinic setup.
            </Alert>
          )}
          {view === "month" ? (
            <Paper variant="outlined" sx={{ overflowX: "auto" }}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, minmax(105px, 1fr))",
                  minWidth: 735,
                }}
              >
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (label) => (
                    <Typography
                      key={label}
                      align="center"
                      variant="subtitle2"
                      sx={{ p: 1, bgcolor: "action.hover" }}
                    >
                      {label}
                    </Typography>
                  ),
                )}
                {Array.from(
                  { length: new Date(`${month}-01T12:00:00Z`).getUTCDay() },
                  (_, i) => (
                    <Box key={`blank-${i}`} sx={{ bgcolor: "action.hover" }} />
                  ),
                )}
                {data.days.map((item) => {
                  const completed = item.appointments.filter(
                    (appointment) =>
                      appointment.calendar_status === "completed",
                  ).length;
                  return (
                    <ButtonBase
                      key={item.date}
                      onClick={() => openDay(item.date)}
                      aria-label={`${dateLabel(item.date)}: ${completed} completed, ${item.scheduled} scheduled, ${item.confirmed} confirmed, ${item.available ?? "unknown"} available slots, ${item.holds.length} active holds, ${item.conflicts} conflicts`}
                      sx={{
                        display: "block",
                        textAlign: "left",
                        p: 1.25,
                        minHeight: 128,
                        borderTop: 1,
                        borderRight: 1,
                        borderColor: "divider",
                        bgcolor:
                          item.date === today
                            ? "action.selected"
                            : "background.paper",
                        "&:hover": { bgcolor: "action.hover" },
                        "&.Mui-focusVisible": {
                          outline: "2px solid",
                          outlineColor: "primary.main",
                          outlineOffset: -2,
                        },
                      }}
                    >
                      <Typography
                        sx={{ fontWeight: 700 }}
                        color={item.date === today ? "primary" : "text.primary"}
                      >
                        {Number(item.date.slice(-2))}
                        {item.date === today ? " · Today" : ""}
                      </Typography>
                      {completed > 0 && (
                        <Typography variant="body2" color="success.main">
                          {completed} completed
                        </Typography>
                      )}
                      <Typography variant="body2">
                        {item.scheduled} scheduled
                      </Typography>
                      <Typography variant="body2">
                        {item.confirmed} confirmed
                      </Typography>
                      {item.holds.length > 0 && (
                        <Typography variant="body2" color="warning.main">
                          {item.holds.length} held
                        </Typography>
                      )}
                      <Typography
                        variant="caption"
                        sx={{ display: "block" }}
                        color="text.secondary"
                      >
                        {item.available === null
                          ? "Capacity not set"
                          : `${item.available} open slots · ${data.slot_minutes} min`}
                      </Typography>
                      {item.conflicts > 0 && (
                        <Typography variant="caption" color="error">
                          {item.conflicts} conflicts
                        </Typography>
                      )}
                    </ButtonBase>
                  );
                })}
              </Box>
            </Paper>
          ) : (
            <>
              {holdError && (
                <Alert severity="error">
                  {holdError}{" "}
                  <Button onClick={calendar.refresh}>Refresh</Button>
                </Alert>
              )}
              {selectedDay && selectedDay.holds.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Typography component="h3" variant="subtitle1">
                      Active slot holds
                    </Typography>
                    {selectedDay.holds.map((hold) => (
                      <Stack
                        key={hold.id}
                        direction={{ xs: "column", sm: "row" }}
                        sx={{
                          alignItems: { sm: "center" },
                          justifyContent: "space-between",
                          gap: 1,
                        }}
                      >
                        <Typography variant="body2">
                          {time(hold.starts_at)}–{time(hold.ends_at)} ·{" "}
                          {data.clinicians.find(
                            (clinician) => clinician.id === hold.clinician_id,
                          )?.name ?? "Clinician"}
                          {hold.patient_id
                            ? ` · ${hold.patient_name || `Patient #${hold.patient_id}`}`
                            : ""}
                          {hold.room_id
                            ? ` · ${data.rooms.find((room) => room.id === hold.room_id)?.name ?? "Room"}`
                            : ""}
                          {` · Expires ${new Date(hold.expires_at).toLocaleString("en-US", { timeZone: timezone })}`}
                        </Typography>
                        {canBook && (
                          <Button
                            size="small"
                            disabled={busy}
                            aria-label={`Release hold for ${time(hold.starts_at)} with ${data.clinicians.find((clinician) => clinician.id === hold.clinician_id)?.name ?? "clinician"}`}
                            onClick={() => void releaseHold(hold)}
                          >
                            Release hold
                          </Button>
                        )}
                        {canBook &&
                          hold.patient_id &&
                          (!initialPatientId ||
                            initialPatientId === hold.patient_id) && (
                            <Button
                              size="small"
                              variant="contained"
                              disabled={
                                busy ||
                                Date.parse(hold.expires_at) <=
                                  businessNow().getTime()
                              }
                              onClick={() =>
                                setBooking({
                                  site_id: Number(siteId),
                                  clinician_id: hold.clinician_id,
                                  room_id: hold.room_id ?? undefined,
                                  starts_at: hold.starts_at,
                                  ends_at: hold.ends_at,
                                  hold,
                                })
                              }
                            >
                              Book held slot
                            </Button>
                          )}
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              )}
              <Paper
                variant="outlined"
                sx={{
                  width: "100%",
                  minWidth: 0,
                  overflow: "hidden",
                  borderRadius: 2,
                  boxShadow: "0 16px 36px rgba(32, 53, 47, 0.06)",
                }}
              >
                <Box
                  sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}
                >
                  <Typography
                    component="h2"
                    variant="subtitle1"
                    sx={{ fontWeight: 700 }}
                  >
                    {dateLabel(day)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedDay?.appointments.length ?? 0} appointments ·
                    Select an open time to book. Capacity counts clinician time,
                    not additional room capacity.
                  </Typography>
                </Box>
                <Box
                  sx={{
                    overflowX: "auto",
                    overflowY: "auto",
                    maxHeight: "70vh",
                    scrollbarGutter: "stable",
                    minWidth: 0,
                  }}
                  role="region"
                  aria-label="Day schedule"
                  tabIndex={0}
                >
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: `88px repeat(${lanes.length}, minmax(250px, 1fr))`,
                      gridTemplateRows: `80px repeat(${ticks.length}, 104px)`,
                      minWidth: 88 + lanes.length * 250,
                    }}
                  >
                    <Box
                      sx={{
                        gridColumn: 1,
                        gridRow: 1,
                        bgcolor: "background.paper",
                        position: "sticky",
                        top: 0,
                        zIndex: 2,
                      }}
                    />
                    {lanes.map((lane, index) => (
                      <Box
                        key={lane.id}
                        sx={{
                          fontWeight: 700,
                          minWidth: 0,
                          gridColumn: index + 2,
                          gridRow: 1,
                          px: 2,
                          py: 1,
                          bgcolor: "background.paper",
                          borderBottom: 1,
                          borderColor: "divider",
                          position: "sticky",
                          top: 0,
                          zIndex: 2,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, overflowWrap: "anywhere" }}
                        >
                          {lane.name}
                        </Typography>
                        {group === "room" &&
                          "kind" in lane &&
                          lane.kind === "telehealth" && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Telehealth · video only
                            </Typography>
                          )}
                      </Box>
                    ))}
                    {ticks.map((minute, index) => (
                      <Typography
                        key={minute}
                        variant="caption"
                        sx={{
                          gridColumn: 1,
                          gridRow: index + 2,
                          p: 1,
                          borderTop: 1,
                          borderColor: "divider",
                          color: "text.secondary",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >{`${Math.floor(minute / 60)
                        .toString()
                        .padStart(
                          2,
                          "0",
                        )}:${(minute % 60).toString().padStart(2, "0")}`}</Typography>
                    ))}
                    {lanes.flatMap((lane, laneIndex) =>
                      ticks.map((minute, index) => {
                        const slots =
                          selectedDay?.slots.filter(
                            (s) =>
                              minuteOfDay(s.starts_at, timezone) === minute &&
                              (group === "clinician"
                                ? s.clinician_id === lane.id
                                : s.room_ids.includes(lane.id)),
                          ) ?? [];
                        const slot = slots[0];
                        return (
                          <Box
                            key={`${lane.id}-${minute}`}
                            sx={{
                              gridColumn: laneIndex + 2,
                              gridRow: index + 2,
                              borderTop: 1,
                              borderLeft: 1,
                              borderColor: "divider",
                              p: 0,
                            }}
                          >
                            {slot && (
                              <ButtonBase
                                disabled={!canBook}
                                aria-label={slotBookingAriaLabel({
                                  startsAt: slot.starts_at,
                                  date: day,
                                  timezone,
                                  clinicianName:
                                    data.clinicians.find(
                                      (clinician) =>
                                        clinician.id === slot.clinician_id,
                                    )?.name ?? "Clinician",
                                  roomName:
                                    group === "room" ? lane.name : undefined,
                                })}
                                sx={{
                                  display: "block",
                                  width: "100%",
                                  height: "100%",
                                  "&:hover": { bgcolor: "action.hover" },
                                  "&.Mui-focusVisible": {
                                    outline: "2px solid",
                                    outlineColor: "primary.main",
                                    outlineOffset: -2,
                                  },
                                }}
                                onClick={() =>
                                  setBooking({
                                    ...slot,
                                    site_id: Number(siteId),
                                    clinician_id:
                                      group === "room"
                                        ? undefined
                                        : slot.clinician_id,
                                    room_id:
                                      group === "room"
                                        ? lane.id
                                        : slot.room_ids[0],
                                  })
                                }
                              />
                            )}
                          </Box>
                        );
                      }),
                    )}
                    {selectedDay?.appointments
                      .filter(
                        (appointment) =>
                          !["cancelled", "no_show"].includes(
                            appointment.status,
                          ),
                      )
                      .map((appointment) => {
                        const column = lanes.findIndex(
                          (lane) =>
                            lane.id ===
                            ((group === "clinician"
                              ? appointment.booked_clinician_id
                              : appointment.room_id) ?? 0),
                        );
                        const start = minuteOfDay(
                          appointment.starts_at,
                          timezone,
                        );
                        const duration = Math.max(
                          30,
                          (new Date(appointment.ends_at).getTime() -
                            new Date(appointment.starts_at).getTime()) /
                            60000,
                        );
                        return (
                          <ButtonBase
                            key={appointment.id}
                            onClick={() => {
                              setSelected(appointment);
                              setMutationError("");
                            }}
                            sx={{
                              gridColumn: column + 2,
                              gridRow: `${Math.floor((start - startMinute) / 30) + 2} / span ${Math.ceil(duration / 30)}`,
                              width: `calc((100% - 8px) / ${tracks.get(appointment.id)?.tracks ?? 1})`,
                              marginLeft: `calc(4px + (100% - 8px) * ${tracks.get(appointment.id)?.track ?? 0} / ${tracks.get(appointment.id)?.tracks ?? 1})`,
                              alignSelf: "start",
                              transform: `translateY(${((start % 30) / 30) * 104}px)`,
                              textAlign: "left",
                              justifyContent: "flex-start",
                              display: "block",
                              mt: 0.5,
                              mb: 0.5,
                              mr: 0.5,
                              p: 1.5,
                              bgcolor: "action.hover",
                              border: 1,
                              borderLeft: 4,
                              borderColor: "divider",
                              borderLeftColor: appointment.conflict
                                ? "error.main"
                                : "primary.main",
                              borderRadius: 1,
                              zIndex: 1,
                              minHeight: 88,
                              boxShadow: "0 2px 5px rgba(32, 53, 47, 0.04)",
                              "&.Mui-focusVisible": { outline: "2px solid" },
                            }}
                          >
                            <Typography
                              variant="body1"
                              sx={{ fontWeight: 700 }}
                            >
                              {appointment.patient?.display_name ??
                                "Patient name unavailable"}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ display: "block", color: "text.secondary" }}
                            >
                              {time(appointment.starts_at)}–
                              {time(appointment.ends_at)} ·{" "}
                              {workflowStatusLabel(appointment.calendar_status)}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ display: "block", color: "text.secondary" }}
                            >
                              {appointment.visit_type_name ??
                                "Visit type not set"}{" "}
                              ·{" "}
                              {appointment.clinician_name ??
                                "Clinician not assigned"}
                              {group === "clinician" &&
                                ` · ${appointment.room_name ?? "No room"}`}
                            </Typography>
                            {appointment.conflict && (
                              <Chip
                                size="small"
                                color="error"
                                label="Conflict"
                              />
                            )}
                            {appointment.overbooked && (
                              <Chip size="small" label="Overbooked" />
                            )}
                            {appointment.walk_in && (
                              <Chip size="small" color="warning" label="Walk-in" />
                            )}
                            {appointment.series_id && (
                              <Chip size="small" label="Repeats weekly" />
                            )}
                          </ButtonBase>
                        );
                      })}
                  </Box>
                </Box>
              </Paper>
              {selectedDay?.appointments
                .filter((appointment) =>
                  ["cancelled", "no_show"].includes(appointment.status),
                )
                .map((appointment) => (
                  <Button
                    key={appointment.id}
                    variant="outlined"
                    sx={{ justifyContent: "flex-start" }}
                    onClick={() => {
                      setSelected(appointment);
                      setMutationError("");
                    }}
                  >
                    {appointment.patient?.display_name} ·{" "}
                    {time(appointment.starts_at)} ·{" "}
                    {workflowStatusLabel(appointment.status)}
                  </Button>
                ))}
            </>
          )}
        </>
      )}
      <Dialog
        open={Boolean(booking)}
        maxWidth="md"
        fullWidth
        aria-labelledby="schedule-appointment-title"
        onClose={() => {
          /* Explicit close preserves the server-owned working draft. */
        }}
      >
        <DialogContent>
          {booking &&
            renderBooking(
              booking,
              booked,
              () => refreshCalendar.current(),
              () => {
                setBooking(undefined);
                refreshCalendar.current();
              },
              () => setBooking(undefined),
            )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(selected)}
        onClose={() => !busy && setSelected(undefined)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {selected?.patient?.display_name ?? "Appointment"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            {selected && (
              <>
                <Typography>
                  {time(selected.starts_at)}–{time(selected.ends_at)} ·{" "}
                  {dateLabel(
                    calendarDate(new Date(selected.starts_at), timezone),
                  )}
                </Typography>
                <Typography>
                  {selected.visit_type_name} ·{" "}
                  {selected.clinician_name ?? "Clinician not assigned"} ·{" "}
                  {selected.room_name ?? "No room"}
                </Typography>
                <Chip
                  sx={{ alignSelf: "start" }}
                  label={workflowStatusLabel(selected.calendar_status)}
                />
                {selected.overbooked && (
                  <Typography variant="body2">
                    Overbooked · {selected.overbook_reason}
                  </Typography>
                )}
                {selected.walk_in && (
                  <Typography variant="body2">
                    Walk-in capacity exception · {selected.capacity_override_reason}
                  </Typography>
                )}
                {selected.series_id && (
                  <Button
                    sx={{ alignSelf: "start" }}
                    onClick={() => {
                      setSeriesId(selected.series_id ?? null);
                      setSelected(undefined);
                    }}
                  >
                    Recurring visit {selected.series_sequence} · View series
                  </Button>
                )}
                <Typography variant="body2">
                  Check in only after the patient arrives. This opens their
                  encounter and places the visit on the Tracking Board.
                </Typography>
              </>
            )}
            {mutationError && <Alert severity="error">{mutationError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setSelected(undefined)}>
            Close
          </Button>
          <Button href="/clinic/front-desk">Open front desk</Button>
          {selected && context.capabilities.appointments_status_transition && (
            <Button
              color="error"
              disabled={
                busy ||
                Boolean(selected.encounter_id) ||
                !["scheduled", "confirmed"].includes(selected.status)
              }
              onClick={() => setCancelConfirmationOpen(true)}
            >
              Cancel appointment
            </Button>
          )}
          {selected &&
            data?.policy?.overbook === "configured" &&
            context.capabilities.appointments_overbook &&
            ["scheduled", "confirmed"].includes(selected.status) && (
              <Button
                onClick={() => {
                  setBooking({
                    site_id: Number(siteId),
                    clinician_id: selected.booked_clinician_id ?? undefined,
                    starts_at: selected.starts_at,
                    ends_at: selected.ends_at,
                    overbook: true,
                  });
                  setSelected(undefined);
                }}
              >
                Schedule another at this time
              </Button>
            )}
          {selected &&
            !selected.encounter_id &&
            ["scheduled", "confirmed"].includes(selected.status) &&
            context.capabilities.encounters && (
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => void checkIn()}
              >
                {busy ? "Checking in…" : "Check in patient"}
              </Button>
            )}
          {selected?.encounter_id && (
            <Button href="/clinic" data-clinic-view="tracking">
              Open Tracking Board
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={cancelConfirmationOpen && Boolean(selected)}
        onClose={() => !busy && setCancelConfirmationOpen(false)}
        aria-labelledby="cancel-appointment-title"
        aria-describedby="cancel-appointment-description"
        role="alertdialog"
      >
        <DialogTitle id="cancel-appointment-title">
          Cancel appointment?
        </DialogTitle>
        <DialogContent>
          <Typography id="cancel-appointment-description">
            This updates the schedule and cancels pending reminders. No
            cancellation message will be sent to the patient.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setCancelConfirmationOpen(false)}>
            Go back
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            onClick={() => {
              setCancelConfirmationOpen(false);
              void cancelSelectedAppointment();
            }}
          >
            Confirm cancellation
          </Button>
        </DialogActions>
      </Dialog>
      <SeriesManagement
        seriesId={seriesId}
        canChange={canBook}
        canCancel={Boolean(context.capabilities.appointments_status_transition)}
        onClose={() => setSeriesId(null)}
        onChanged={() => refreshCalendar.current()}
      />
    </Stack>
  );
}

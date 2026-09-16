import { useEffect, useState, type ReactNode } from "react";
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
  CalendarResponse,
} from "../../api/contracts";
import { api } from "../../api/client";
import { businessNow } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

export type CalendarBooking = {
  site_id: number;
  clinician_id?: number;
  room_id?: number;
  starts_at?: string;
  ends_at?: string;
};

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
const statusText: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  checked_in: "Checked in",
  in_progress: "In progress",
  completed: "Completed",
  no_show: "No-show",
};
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
  return `Book ${time} on ${dateLabel(date)} with ${clinicianName}${
    roomName ? ` in ${roomName}` : ""
  }`;
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
  ) => ReactNode;
}) {
  const context = useClinic();
  const timezone = context.practice.timezone;
  const today = calendarDate(businessNow(), timezone);
  const routeParams = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const initialMonth = /^\d{4}-\d{2}$/.test(routeParams.get("month") || "")
    ? routeParams.get("month")!
    : today.slice(0, 7);
  const initialDay = /^\d{4}-\d{2}-\d{2}$/.test(routeParams.get("day") || "")
    ? routeParams.get("day")!
    : `${initialMonth}-01`;
  const [month, setMonth] = useState(initialMonth);
  const [day, setDay] = useState(
    initialDay.startsWith(initialMonth) ? initialDay : `${initialMonth}-01`,
  );
  const [view, setView] = useState<"month" | "day">(
    routeParams.get("view") === "day" ? "day" : "month",
  );
  const [group, setGroup] = useState<"clinician" | "room">(
    routeParams.get("group") === "room" ? "room" : "clinician",
  );
  const [siteId, setSiteId] = useState(
    routeParams.get("site_id") ||
      String(context.current_site?.id ?? context.sites[0]?.id ?? ""),
  );
  const [booking, setBooking] = useState<CalendarBooking>();
  const [selected, setSelected] = useState<CalendarAppointment>();
  const [notice, setNotice] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [busy, setBusy] = useState(false);
  const patient = useResource<{ patients: Patient[] }>(
    `/api/clinic/patients/lookup?id=${initialPatientId ?? ""}`,
    { enabled: Boolean(initialPatientId) },
  );
  const patientName = patient.data?.patients.find(
    (item) => item.id === initialPatientId,
  )?.display_name;
  const calendar = useResource<CalendarResponse>(
    `/api/clinic/schedule_calendar?site_id=${siteId}&date=${month}-01`,
    { enabled: Boolean(siteId), retainDataOnRefresh: true },
  );
  // Retained responses must never be displayed under another location/month.
  const data =
    calendar.data?.month === month && String(calendar.data.site_id) === siteId
      ? calendar.data
      : undefined;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("month", month);
    params.set("day", day);
    params.set("view", view);
    params.set("group", group);
    if (siteId) params.set("site_id", siteId);
    else params.delete("site_id");
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  }, [day, group, month, siteId, view]);
  const selectedDay = data?.days.find((item) => item.date === day);
  const time = (value: string) =>
    new Date(value).toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    });
  const actionLabel = initialPatientId
    ? "Schedule first appointment"
    : "Book appointment";
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
    const escape = (value: string) =>
      value
        .replaceAll("\\", "\\\\")
        .replaceAll(";", "\\;")
        .replaceAll(",", "\\,")
        .replaceAll("\n", "\\n");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Meta Clinic//Schedule//EN",
    ];
    appointments.forEach((appointment) => {
      lines.push(
        "BEGIN:VEVENT",
        `UID:meta-clinic-${appointment.id}@local`,
        `DTSTART:${new Date(appointment.starts_at)
          .toISOString()
          .replaceAll("-", "")
          .replaceAll(":", "")
          .replace(/\.\d{3}Z$/, "Z")}`,
        `DTEND:${new Date(appointment.ends_at)
          .toISOString()
          .replaceAll("-", "")
          .replaceAll(":", "")
          .replace(/\.\d{3}Z$/, "Z")}`,
        `SUMMARY:${escape(appointment.visit_type_name || "Clinic appointment")}`,
        `DESCRIPTION:${escape(appointment.patient?.display_name || "Patient appointment")}`,
        "END:VEVENT",
      );
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([`${lines.join("\r\n")}\r\n`], {
      type: "text/calendar;charset=utf-8",
    });
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
    <Stack spacing={2}>
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
          <Typography component="h1" variant="h4">
            Schedule
          </Typography>
          <Typography variant="body2" color="text.secondary">
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
                const starts_at = calendarInstant(day, 9, timezone);
                setBooking({
                  site_id: Number(siteId),
                  starts_at,
                  ends_at: new Date(
                    Date.parse(starts_at) + 30 * 60000,
                  ).toISOString(),
                });
              }}
            >
              {actionLabel}
            </Button>
          )}
        </Stack>
      </Stack>
      {initialPatientId && (
        <Alert severity="info">
          {patientName
            ? `Scheduling for ${patientName}.`
            : "Verifying the patient selected from Patient Flow."}{" "}
          Choose a day and available time to schedule their first appointment.
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
        <Button variant="outlined" onClick={exportCalendar} disabled={!data}>
          Export {view === "day" ? "day" : "month"}
        </Button>
      </Stack>
      {calendar.error && (
        <Alert severity="error">
          {calendar.error} <Button onClick={calendar.refresh}>Retry</Button>
        </Alert>
      )}
      {!siteId ? (
        <Alert severity="info">Choose a location to view its schedule.</Alert>
      ) : !data ? (
        <Typography role="status">Loading calendar…</Typography>
      ) : (
        <>
          {!data.capacity_configured && (
            <Alert severity="info">
              Clinician availability is not configured for this location.
              Appointments are shown; available capacity is unknown.{" "}
              <Button href="/clinic/waitlist">Set clinician capacity</Button>
            </Alert>
          )}
          {(!data.policy ||
            data.policy.recurrence === "not_configured" ||
            data.policy.overbook === "not_configured") && (
            <Alert severity="warning">
              Recurrence and overbook behavior are not configured for this
              location. The calendar will only offer explicit free slots from
              the current capacity rules; external calendar sync is limited to
              the read-only export above.
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
                {data.days.map((item) => (
                  <ButtonBase
                    key={item.date}
                    onClick={() => openDay(item.date)}
                    aria-label={`${dateLabel(item.date)}: ${item.scheduled} scheduled, ${item.confirmed} confirmed, ${item.available ?? "unknown"} available, ${item.conflicts} conflicts`}
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
                    <Typography variant="body2">
                      {item.scheduled} scheduled
                    </Typography>
                    <Typography variant="body2">
                      {item.confirmed} confirmed
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ display: "block" }}
                      color="text.secondary"
                    >
                      {item.available === null
                        ? "Capacity not set"
                        : `${item.available} open · ${data.slot_minutes} min`}
                    </Typography>
                    {item.conflicts > 0 && (
                      <Typography variant="caption" color="error">
                        {item.conflicts} conflicts
                      </Typography>
                    )}
                  </ButtonBase>
                ))}
              </Box>
            </Paper>
          ) : (
            <>
              <Stack direction="row" sx={{ alignItems: "center", gap: 2 }}>
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
                <Typography variant="h6">{dateLabel(day)}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {selectedDay?.appointments.length ?? 0} appointments · Select an
                open time to book. Capacity counts clinician time, not
                additional room capacity.
              </Typography>
              <Paper
                variant="outlined"
                sx={{ overflow: "auto", maxHeight: "70vh" }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: `72px repeat(${lanes.length}, minmax(220px, 1fr))`,
                    gridTemplateRows: `44px repeat(${ticks.length}, 84px)`,
                    minWidth: 72 + lanes.length * 220,
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
                    <Typography
                      key={lane.id}
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        gridColumn: index + 2,
                        gridRow: 1,
                        p: 1,
                        bgcolor: "background.paper",
                        borderBottom: 1,
                        borderColor: "divider",
                        position: "sticky",
                        top: 0,
                        zIndex: 2,
                      }}
                    >
                      {lane.name}
                    </Typography>
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
                      return (
                        <Box
                          key={`${lane.id}-${minute}`}
                          sx={{
                            gridColumn: laneIndex + 2,
                            gridRow: index + 2,
                            borderTop: 1,
                            borderLeft: 1,
                            borderColor: "divider",
                            p: 0.5,
                          }}
                        >
                          {slots.map((slot) => (
                            <Button
                              key={`${slot.starts_at}-${slot.clinician_id}`}
                              size="small"
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
                              sx={{ justifyContent: "flex-start" }}
                              onClick={() =>
                                setBooking({
                                  ...slot,
                                  site_id: Number(siteId),
                                  room_id:
                                    group === "room"
                                      ? lane.id
                                      : slot.room_ids[0],
                                })
                              }
                            >
                              {group === "room"
                                ? `Open · ${data.clinicians.find((c) => c.id === slot.clinician_id)?.name ?? "Clinician"}`
                                : "Open · Book"}
                            </Button>
                          ))}
                        </Box>
                      );
                    }),
                  )}
                  {selectedDay?.appointments
                    .filter(
                      (appointment) =>
                        !["cancelled", "no_show"].includes(appointment.status),
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
                            transform: `translateY(${((start % 30) / 30) * 84}px)`,
                            textAlign: "left",
                            justifyContent: "flex-start",
                            display: "block",
                            mt: 0.5,
                            mb: 0.5,
                            mr: 0.5,
                            p: 1,
                            bgcolor: "background.paper",
                            border: 1,
                            borderLeft: 4,
                            borderColor: appointment.conflict
                              ? "error.main"
                              : "primary.main",
                            borderRadius: 1,
                            zIndex: 1,
                            minHeight: 52,
                            "&.Mui-focusVisible": { outline: "2px solid" },
                          }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {appointment.patient?.display_name ??
                              "Patient name unavailable"}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ display: "block" }}
                          >
                            {time(appointment.starts_at)}–
                            {time(appointment.ends_at)} ·{" "}
                            {statusText[appointment.calendar_status] ??
                              appointment.calendar_status}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ display: "block" }}
                          >
                            {appointment.visit_type_name ??
                              "Visit type not set"}{" "}
                            ·{" "}
                            {appointment.clinician_name ??
                              "Clinician not assigned"}{" "}
                            · {appointment.room_name ?? "No room"}
                          </Typography>
                          {appointment.conflict && (
                            <Chip size="small" color="error" label="Conflict" />
                          )}
                        </ButtonBase>
                      );
                    })}
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
                    {statusText[appointment.status]}
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
        onClose={() => {
          /* Explicit close preserves the server-owned working draft. */
        }}
      >
        <DialogTitle>{actionLabel}</DialogTitle>
        <DialogContent>
          {booking && renderBooking(booking, booked)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBooking(undefined)}>
            Close · keep draft
          </Button>
        </DialogActions>
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
                  label={
                    statusText[selected.calendar_status] ??
                    selected.calendar_status
                  }
                />
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
          <Button href="/clinic/front-desk">Manage appointment</Button>
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
    </Stack>
  );
}

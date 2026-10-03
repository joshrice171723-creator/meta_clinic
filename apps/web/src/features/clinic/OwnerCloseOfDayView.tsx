import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import type { CalendarResponse, CashDrawer } from "../../api/contracts";
import { businessNow } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";
import { cashCloseoutHref } from "./cashCloseoutRoute";
import { calendarDate } from "./ClinicSchedule";
import { useClinic } from "./Workspace";

function recordedDay(value: string | null, timezone: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return calendarDate(new Date(value), timezone);
}

// Pad minor units and group digits without converting the server's decimal
// string to a floating-point number or rounding away recorded precision.
function recordedCash(value: string | null, currency: string | null) {
  if (value === null) return "Not recorded";
  if (!currency) return `${value} (currency unavailable)`;
  const amount = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!amount) return `${currency} ${value}`;
  try {
    const digits = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).resolvedOptions().minimumFractionDigits;
    const fraction = (amount[3] ?? "").padEnd(digits, "0");
    const whole = amount[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${currency} ${amount[1]}${whole}${fraction ? `.${fraction}` : ""}`;
  } catch {
    return `${currency} ${value}`;
  }
}

function displayDay(value: string | null) {
  if (!value) return "Date unavailable";
  const day = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(day.getTime())
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(day)
    : "Date unavailable";
}

function displaySnapshot(value: string | null | undefined, timezone: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function OwnerCloseOfDayView() {
  const clinic = useClinic();
  const timezone =
    clinic.current_site?.timezone_override || clinic.practice.timezone;
  return (
    <CloseOfDaySnapshot
      key={`${clinic.user_id}:${clinic.practice.id}:${clinic.membership_id}:${clinic.current_site?.id}:${timezone}`}
      timezone={timezone}
    />
  );
}

function CloseOfDaySnapshot({ timezone }: { timezone: string }) {
  const { capabilities, current_site: site, practice } = useClinic();
  const today = calendarDate(businessNow(), timezone);
  // Advance the clinic-local calendar date, not the instant by 24 hours.
  const nextDay = new Date(`${today}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const tomorrow = nextDay.toISOString().slice(0, 10);
  const canSchedule = capabilities.appointments_read === true;
  const canClose = capabilities.billing_payment_record === true;
  const canDrawer = canClose || capabilities.billing_cash_reconcile === true;
  const drawers = useResource<{ drawers: CashDrawer[] }>(
    "/api/clinic/cash_drawers",
    { enabled: Boolean(site && canDrawer) },
  );
  const calendar = useResource<CalendarResponse>(
    `/api/clinic/schedule_calendar?site_id=${site?.id ?? ""}&date=${tomorrow}`,
    { enabled: Boolean(site && canSchedule) },
  );
  const sessions = drawers.data?.drawers.filter(
    (drawer) =>
      drawer.site_id === site?.id &&
      (drawer.status === "open" ||
        (drawer.status === "closed" &&
          recordedDay(drawer.closed_at, timezone) === today)),
  );
  const undatedCloses = drawers.data?.drawers.filter(
    (drawer) =>
      drawer.site_id === site?.id &&
      drawer.status === "closed" &&
      recordedDay(drawer.closed_at, timezone) === null,
  ).length;
  const projection = calendar.data;
  const day =
    projection?.site_id === site?.id &&
    projection?.month === tomorrow.slice(0, 7) &&
    projection?.timezone === timezone
      ? projection.days.find((item) => item.date === tomorrow)
      : undefined;
  const countsAvailable =
    day &&
    Number.isSafeInteger(day.scheduled) &&
    day.scheduled >= 0 &&
    Number.isSafeInteger(day.confirmed) &&
    day.confirmed >= 0;

  return (
    <Box
      component="section"
      aria-labelledby="close-of-day-heading"
      sx={{ mb: 3 }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ mb: 1.5, justifyContent: "space-between", alignItems: "start" }}
      >
        <Box>
          <Typography component="h2" variant="h6" id="close-of-day-heading">
            Close of day
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {site?.name || site?.code || "Location not selected"} ·{" "}
            {displayDay(today)} · {timezone}. Refresh this snapshot before
            reviewing closeout.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          disabled={!site || (!canDrawer && !canSchedule)}
          onClick={() => {
            if (canDrawer) drawers.refresh();
            if (canSchedule) calendar.refresh();
          }}
        >
          Refresh close of day
        </Button>
      </Stack>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
          Drawer closeout context
        </Typography>
        {!site ? (
          <Typography>Select a location to read drawer context.</Typography>
        ) : !canDrawer ? (
          <Typography>Cash drawer access is restricted.</Typography>
        ) : drawers.error ? (
          <Typography role="status">
            Drawer context unavailable: {drawers.error}
          </Typography>
        ) : !sessions ? (
          <Typography role="status">Reading drawer sessions.</Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary">
              Open sessions and closes recorded today at this location. Amounts
              stay separate by session and currency.
            </Typography>
            {sessions.length === 0 && (
              <Typography>
                No open sessions or closes recorded today.
              </Typography>
            )}
            {Boolean(undatedCloses) && (
              <Typography>
                {undatedCloses} closed sessions have an unavailable closing
                date; they cannot be assigned to today.
              </Typography>
            )}
            <Stack divider={<Divider />}>
              {sessions.map((drawer) => (
                <Stack
                  key={drawer.id}
                  direction={{ xs: "column", md: "row" }}
                  spacing={1}
                  sx={{
                    py: 1.5,
                    justifyContent: "space-between",
                    alignItems: "start",
                  }}
                >
                  <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <Typography sx={{ fontWeight: 700 }}>
                      Session #{drawer.id} ·{" "}
                      {drawer.currency ?? "Currency unavailable"} ·{" "}
                      {drawer.status === "open" ? "Open" : "Recorded closed"}
                    </Typography>
                    <Typography variant="body2">
                      Opened{" "}
                      {displayDay(recordedDay(drawer.opened_at, timezone))}
                      {drawer.status === "closed" &&
                        ` · Closed ${displayDay(recordedDay(drawer.closed_at, timezone))}`}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      Expected cash:{" "}
                      {recordedCash(drawer.expected_cash, drawer.currency)}
                    </Typography>
                    {drawer.status === "closed" && (
                      <Typography
                        variant="body2"
                        sx={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        Counted:{" "}
                        {recordedCash(drawer.counted_cash, drawer.currency)} ·{" "}
                        Discrepancy:{" "}
                        {recordedCash(drawer.discrepancy, drawer.currency)} ·{" "}
                        Reconciliation:{" "}
                        {drawer.reconciliation_status?.replaceAll("_", " ") ??
                          "Not recorded"}
                      </Typography>
                    )}
                  </Box>
                  {drawer.status === "open" && canClose && (
                    <Button
                      component="a"
                      href={cashCloseoutHref(practice.id, drawer)}
                      size="small"
                    >
                      Count and close session #{drawer.id}
                    </Button>
                  )}
                </Stack>
              ))}
            </Stack>
          </>
        )}
        <Divider sx={{ my: 1.5 }} />
        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
          Tomorrow's appointments · {displayDay(tomorrow)}
        </Typography>
        {!site ? (
          <Typography>Select a location to read tomorrow's counts.</Typography>
        ) : !canSchedule ? (
          <Typography>Appointment counts are restricted.</Typography>
        ) : calendar.error ? (
          <Typography role="status">
            Tomorrow's counts unavailable: {calendar.error}
          </Typography>
        ) : !projection ? (
          <Typography role="status">
            Reading tomorrow's appointments.
          </Typography>
        ) : !countsAvailable ? (
          <Typography role="status">
            Tomorrow's counts unavailable for this location, date and timezone.
          </Typography>
        ) : (
          <>
            <Typography>
              {day.scheduled} scheduled · {day.confirmed} confirmed
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Recorded scheduled and confirmed appointments only. Calendar
              snapshot:{" "}
              <time dateTime={projection.as_of ?? undefined}>
                {displaySnapshot(projection.as_of, timezone)}
              </time>
              .
            </Typography>
            <Button
              component="a"
              size="small"
              href={`/clinic/schedule?site_id=${site.id}&month=${tomorrow.slice(0, 7)}&day=${tomorrow}&view=day`}
            >
              Open tomorrow's schedule
            </Button>
          </>
        )}
      </Paper>
    </Box>
  );
}

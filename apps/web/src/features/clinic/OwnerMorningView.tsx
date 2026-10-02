import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import type {
  BillingDashboard,
  CalendarResponse,
  CashDrawer,
} from "../../api/contracts";
import { businessNow } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";
import type { ScheduleBootstrap } from "../workforce/scheduleTypes";
import { billingMoney } from "./BillingInsights";
import { cashCloseoutHref } from "./cashCloseoutRoute";
import { calendarDate } from "./ClinicSchedule";
import { useClinic } from "./Workspace";

function monday(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function Fact({
  title,
  value,
  detail,
  href,
  link,
  sessionLinks,
}: {
  title: string;
  value: string;
  detail: string;
  href?: string;
  link?: string;
  sessionLinks?: { href: string; label: string }[];
}) {
  return (
    <Box
      component="section"
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          md: "minmax(130px, .75fr) minmax(135px, .7fr) minmax(0, 1.6fr) auto",
        },
        gap: { xs: 0.5, md: 2 },
        alignItems: "center",
        py: 1.5,
      }}
    >
      <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="h6">{value}</Typography>
      <Typography variant="body2" color="text.secondary">
        {detail}
      </Typography>
      {href && link && (
        <Button
          component="a"
          href={href}
          size="small"
          sx={{ justifySelf: "start" }}
        >
          {link}
        </Button>
      )}
      {sessionLinks && (
        <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
          {sessionLinks.map((session) => (
            <Button key={session.href} href={session.href} size="small">
              {session.label}
            </Button>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export function OwnerMorningView() {
  const { capabilities, current_site: site, practice } = useClinic();
  const timezone = site?.timezone_override || practice.timezone;
  const today = calendarDate(businessNow(), timezone);
  const siteId = site?.id;
  const canSchedule = capabilities.appointments_read === true;
  const canDrawer =
    capabilities.billing_payment_record === true ||
    capabilities.billing_cash_reconcile === true;
  const canBilling = capabilities.billing_read === true;
  const canStaff = capabilities.workforce_schedule_read === true;
  const calendar = useResource<CalendarResponse>(
    `/api/clinic/schedule_calendar?site_id=${siteId ?? ""}&date=${today}`,
    { enabled: Boolean(siteId && canSchedule) },
  );
  const drawers = useResource<{ drawers: CashDrawer[] }>(
    "/api/clinic/cash_drawers",
    {
      enabled: canDrawer,
    },
  );
  const billing = useResource<BillingDashboard>(
    "/api/clinic/billing?per_page=1",
    { enabled: canBilling },
  );
  const staffing = useResource<ScheduleBootstrap>(
    `/api/clinic/workforce/schedules?site_id=${siteId ?? ""}`,
    { enabled: Boolean(siteId && canStaff) },
  );

  const calendarData = calendar.data;
  const day =
    calendarData &&
    calendarData.site_id === siteId &&
    calendarData.month === today.slice(0, 7)
      ? calendarData.days.find((item) => item.date === today)
      : undefined;
  const appointments = day?.appointments.filter(
    (appointment) => !["cancelled", "no_show"].includes(appointment.status),
  );
  const upcomingTimes = appointments
    ?.filter(
      (appointment) =>
        ["scheduled", "confirmed"].includes(appointment.status) &&
        Date.parse(appointment.ends_at) > businessNow().getTime(),
    )
    .sort(
      (left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at),
    )
    .slice(0, 3)
    .map((appointment) =>
      new Date(appointment.starts_at).toLocaleTimeString(undefined, {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  const siteOpenDrawers = drawers.data?.drawers.filter(
    (drawer) => drawer.site_id === siteId && drawer.status === "open",
  );
  const openDrawer =
    siteOpenDrawers?.length === 1 ? siteOpenDrawers[0] : undefined;
  const latestDrawer = drawers.data?.drawers.find(
    (drawer) => drawer.site_id === siteId,
  );
  const currencies = billing.data?.metrics.currencies ?? [];
  const openInvoices = currencies.reduce(
    (sum, currency) => sum + currency.open_invoice_count,
    0,
  );
  const publication =
    staffing.data?.site.id === String(siteId)
      ? staffing.data.publications.find(
          (item) => item.week_start_on === monday(today),
        )
      : undefined;
  const shiftsToday = publication?.shifts.filter(
    (shift) =>
      calendarDate(new Date(shift.starts_at), timezone) <= today &&
      calendarDate(new Date(Date.parse(shift.ends_at) - 1), timezone) >= today,
  );
  const unassigned = appointments?.filter(
    (appointment) =>
      ["scheduled", "confirmed"].includes(appointment.status) &&
      appointment.booked_clinician_id === null,
  ).length;
  const scheduleHref = siteId
    ? `/clinic/schedule?site_id=${siteId}&month=${today.slice(0, 7)}&day=${today}&view=day`
    : "/clinic/schedule";

  const scheduleValue = !canSchedule
    ? "Access restricted"
    : calendar.error
      ? "Unavailable"
      : appointments
        ? `${appointments.length} visits`
        : "Loading…";
  const drawerValue = !canDrawer
    ? "Access restricted"
    : drawers.error
      ? "Unavailable"
      : openDrawer
        ? "Open"
        : (siteOpenDrawers?.length ?? 0) > 1
          ? `${siteOpenDrawers!.length} open sessions`
          : !drawers.data
            ? "Loading…"
            : latestDrawer?.closed_at &&
                calendarDate(new Date(latestDrawer.closed_at), timezone) ===
                  today
              ? "Closed today"
              : "Not open";
  const staffingValue = !canStaff
    ? "Access restricted"
    : staffing.error
      ? "Unavailable"
      : !staffing.data
        ? "Loading…"
        : !publication
          ? "Schedule not shown"
          : shiftsToday?.length === 0
            ? "No shifts today"
            : unassigned
              ? `${unassigned} visits need a clinician`
              : "Review coverage";

  return (
    <Box
      component="section"
      aria-labelledby="owner-morning-heading"
      sx={{ mb: 3 }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          mb: 1.5,
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
        }}
      >
        <Box>
          <Typography component="h2" variant="h6" id="owner-morning-heading">
            Today at {site?.name || site?.code || practice.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {today} · {timezone}. Invoice totals cover the whole clinic.
          </Typography>
        </Box>
        <Button
          onClick={() => {
            calendar.refresh();
            drawers.refresh();
            billing.refresh();
            staffing.refresh();
          }}
          size="small"
          variant="outlined"
        >
          Refresh morning view
        </Button>
      </Stack>
      <Paper variant="outlined" sx={{ px: 2 }}>
        <Fact
          title="Today's schedule"
          value={scheduleValue}
          detail={
            !canSchedule
              ? "Schedule access is required."
              : calendar.error ||
                (appointments
                  ? `${upcomingTimes?.length ? `Next: ${upcomingTimes.join(", ")}. ` : appointments.length ? "No more visits today. " : "No visits booked today. "}${day?.conflicts ?? 0} scheduling conflicts recorded.`
                  : "Reading today's appointments.")
          }
          href={canSchedule ? scheduleHref : undefined}
          link="Open today's schedule"
        />
        <Divider />
        <Fact
          title="Cash drawer"
          value={drawerValue}
          detail={
            !canDrawer
              ? "Cash drawer access is required."
              : drawers.error ||
                (openDrawer
                  ? `Expected cash: ${openDrawer.currency ? billingMoney(openDrawer.expected_cash, openDrawer.currency) : "currency unavailable"}.`
                  : (siteOpenDrawers?.length ?? 0) > 1
                    ? "Choose the recorded session before closeout."
                    : "No open drawer at this location.")
          }
          href={
            canDrawer &&
            !(
              (siteOpenDrawers?.length ?? 0) > 1 &&
              capabilities.billing_payment_record === true
            )
              ? openDrawer && capabilities.billing_payment_record === true
                ? cashCloseoutHref(practice.id, openDrawer)
                : "/clinic/billing?tab=cash"
              : undefined
          }
          sessionLinks={
            capabilities.billing_payment_record === true &&
            (siteOpenDrawers?.length ?? 0) > 1
              ? siteOpenDrawers!.map((drawer) => ({
                  href: cashCloseoutHref(practice.id, drawer),
                  label: `Count and close ${drawer.currency ?? "unspecified currency"} session #${drawer.id}`,
                }))
              : undefined
          }
          link={
            openDrawer && capabilities.billing_payment_record === true
              ? "Count and close drawer"
              : "Open cash drawer"
          }
        />
        <Divider />
        <Fact
          title="Open invoices"
          value={
            !canBilling
              ? "Access restricted"
              : billing.error
                ? "Unavailable"
                : billing.data
                  ? `${openInvoices} invoices`
                  : "Loading…"
          }
          detail={
            !canBilling
              ? "Billing access is required."
              : billing.error ||
                (billing.data
                  ? currencies.length
                    ? currencies
                        .map(
                          (item) =>
                            `${billingMoney(item.outstanding, item.currency)} outstanding`,
                        )
                        .join(" · ")
                    : "No outstanding balance recorded."
                  : "Reading invoice balances.")
          }
          href={canBilling ? "/clinic/billing" : undefined}
          link="Open invoice ledger"
        />
        <Divider />
        <Fact
          title="Staffing gaps"
          value={staffingValue}
          detail={
            !canStaff
              ? "Team schedule access is required."
              : staffing.error ||
                (!staffing.data
                  ? "Reading the published team schedule."
                  : !publication
                    ? "Current week is absent from the recent published schedules."
                    : `${shiftsToday?.length ?? 0} published staff shifts today${unassigned === undefined ? "; appointment assignments unavailable" : ` · ${unassigned} appointments without a clinician`}.`)
          }
          href={canStaff ? "/clinic/workforce/schedule" : undefined}
          link="Open team schedule"
        />
      </Paper>
    </Box>
  );
}

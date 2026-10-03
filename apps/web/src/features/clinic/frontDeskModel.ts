import type { Appointment, ClinicSite } from "../../api/contracts";
import { businessNow } from "../../shared/businessDate";

export type FrontDeskAppointment = Appointment & {
  queue_context?: {
    previsit_intake:
      | { status: "unavailable" }
      | { status: "not_recorded" }
      | {
          status: "draft" | "incomplete" | "complete";
          answered_count: number;
          question_count: number;
        };
    encounter_intake: {
      status:
        | "unavailable"
        | "not_started"
        | "not_recorded"
        | "incomplete"
        | "ready_for_handoff"
        | "unable_to_complete";
    };
    balance_due:
      | { status: "unavailable" }
      | {
          status: "available" | "no_posted_invoices";
          currencies: { currency: string; balance_amount: string }[];
        };
  };
  room_code?: string | null;
  closure_reason?: string;
  updated_at?: string;
  encounter_status?: "open" | "completed" | null;
  encounter_started_at?: string | null;
  encounter_ended_at?: string | null;
};

export type FrontDeskAppointmentResponse = {
  appointments: FrontDeskAppointment[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

export type AppointmentTransition = "confirmed" | "cancelled" | "no_show";

export function previsitIntakeLabel(appointment: FrontDeskAppointment) {
  const intake = appointment.queue_context?.previsit_intake;
  if (!intake || intake.status === "unavailable")
    return "Previsit intake: completeness unavailable";
  if (intake.status === "not_recorded") return "Previsit intake: not recorded";
  const state =
    intake.status === "complete"
      ? "form complete; clinical review separate"
      : intake.status === "draft"
        ? "draft; not submitted"
        : "incomplete";
  return `Previsit intake: ${state} (${intake.answered_count}/${intake.question_count} questions addressed)`;
}

export function encounterIntakeLabel(appointment: FrontDeskAppointment) {
  const status = appointment.queue_context?.encounter_intake.status;
  const labels = {
    unavailable: "unavailable",
    not_started: "visit not started",
    not_recorded: "not recorded",
    incomplete: "incomplete",
    ready_for_handoff: "ready for handoff",
    unable_to_complete: "unable to complete",
  };
  return `Encounter intake: ${status ? labels[status] : "unavailable"}`;
}

export function balanceDueLabel(
  appointment: FrontDeskAppointment,
  canBilling: boolean,
) {
  if (!canBilling) return "Balance due: unavailable for this account";
  const balance = appointment.queue_context?.balance_due;
  if (!balance || balance.status === "unavailable")
    return "Balance due: unavailable; open Billing to review";
  if (balance.status === "no_posted_invoices")
    return "Balance due: no posted invoices";
  if (!balance.currencies.length)
    return "Balance due: unavailable; open Billing to review";
  const amounts = balance.currencies.map(({ currency, balance_amount }) => {
    // Preserve decimal strings; never infer a copay or combine currencies.
    const [whole, fraction = ""] = balance_amount.split(".");
    const amount = `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
    return /^0+(?:\.0+)?$/.test(balance_amount)
      ? `${amount} (none due)`
      : amount;
  });
  return `Balance due: ${amounts.join("; ")} (posted invoices)`;
}

export function clinicDateValue(date: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function buildAppointmentQueuePath({
  date,
  siteId,
  query,
  page,
  perPage = 25,
  closedSite = false,
}: {
  date: string;
  siteId: string;
  query: string;
  page: number;
  perPage?: number;
  closedSite?: boolean;
}) {
  const params = new URLSearchParams({
    queue_context: "true",
    page: String(page),
    per_page: String(perPage),
  });
  if (closedSite) params.set("closed_site", "true");
  else params.set("date", date);
  if (siteId) params.set("site_id", siteId);
  if (query.trim()) params.set("q", query.trim());
  return `/api/clinic/appointments?${params}`;
}

export function appointmentActions(appointment: FrontDeskAppointment) {
  const hasEncounter = appointment.encounter_id !== null;
  const activeAppointment = ["scheduled", "confirmed"].includes(
    appointment.status,
  );
  const startsAt = Date.parse(appointment.starts_at);
  const hasStarted =
    Number.isFinite(startsAt) && startsAt <= businessNow().valueOf();
  return {
    canConfirm: !hasEncounter && appointment.status === "scheduled",
    canStartVisit: !hasEncounter && activeAppointment,
    canReschedule:
      !hasEncounter && activeAppointment && Boolean(appointment.updated_at),
    canScheduleReplacement:
      !hasEncounter && ["cancelled", "no_show"].includes(appointment.status),
    canCancel: !hasEncounter && activeAppointment,
    canMarkNoShow: !hasEncounter && activeAppointment && hasStarted,
  };
}

export function localDateTimeInput(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return "";
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(
    date.getDate(),
  )}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

export function appointmentStatus(appointment: FrontDeskAppointment) {
  if (appointment.encounter_status === "open") {
    return { label: "Visit in progress", color: "warning" as const };
  }
  if (appointment.encounter_status === "completed") {
    return { label: "Visit completed", color: "success" as const };
  }
  const labels: Record<string, string> = {
    scheduled: "Scheduled",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    no_show: "No show",
    completed: "Completed",
  };
  const color =
    appointment.status === "confirmed" || appointment.status === "completed"
      ? ("success" as const)
      : appointment.status === "cancelled" || appointment.status === "no_show"
        ? ("default" as const)
        : ("info" as const);
  return { label: labels[appointment.status] || appointment.status, color };
}

export function appointmentTimeRange(
  appointment: FrontDeskAppointment,
  timezone: string,
) {
  try {
    const startsAt = new Date(appointment.starts_at);
    const endsAt = new Date(appointment.ends_at);
    if (
      !Number.isFinite(startsAt.valueOf()) ||
      !Number.isFinite(endsAt.valueOf()) ||
      endsAt <= startsAt
    )
      return "Time unavailable";
    const crossesDay =
      clinicDateValue(startsAt, timezone) !== clinicDateValue(endsAt, timezone);
    const format = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      ...(crossesDay
        ? { month: "short" as const, day: "numeric" as const }
        : {}),
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
    return format.formatRange(startsAt, endsAt);
  } catch {
    return "Time unavailable";
  }
}

export function queueDateLabel(date: string, _timezone: string) {
  const value = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(value.valueOf())) return "Selected day";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(value);
  } catch {
    return date;
  }
}

export function freshnessLabel(date: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
}

export function siteLabel(sites: ClinicSite[], siteId: number | null) {
  if (siteId === null) return "No site recorded";
  const site = sites.find((site) => site.id === siteId);
  return site?.name?.trim() || site?.code || "Site name unavailable";
}

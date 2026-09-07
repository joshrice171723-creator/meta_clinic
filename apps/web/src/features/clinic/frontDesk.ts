import type { Appointment, ClinicSite } from "../../api/contracts";

export type FrontDeskAppointment = Appointment & {
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

export function clinicDateValue(date: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
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
}: {
  date: string;
  siteId: string;
  query: string;
  page: number;
  perPage?: number;
}) {
  const params = new URLSearchParams({
    date,
    page: String(page),
    per_page: String(perPage),
  });
  if (siteId) params.set("site_id", siteId);
  if (query.trim()) params.set("q", query.trim());
  return `/api/clinic/appointments?${params}`;
}

export function appointmentActions(appointment: FrontDeskAppointment) {
  const hasEncounter = appointment.encounter_id !== null;
  const activeAppointment = ["scheduled", "confirmed"].includes(
    appointment.status,
  );
  return {
    canConfirm: !hasEncounter && appointment.status === "scheduled",
    canStartVisit: !hasEncounter && activeAppointment,
    canReschedule:
      !hasEncounter && activeAppointment && Boolean(appointment.updated_at),
    canCancel: !hasEncounter && activeAppointment,
    canMarkNoShow: !hasEncounter && activeAppointment,
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
    const format = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    });
    return `${format.format(new Date(appointment.starts_at))}–${format.format(
      new Date(appointment.ends_at),
    )}`;
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
  return sites.find((site) => site.id === siteId)?.code || "Assigned site";
}

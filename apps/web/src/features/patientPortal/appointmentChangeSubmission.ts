import { ApiError } from "../../api/client";

type Source = {
  id: number;
  updated_at: string;
  starts_at: string;
  ends_at: string;
  status: string;
  site: { id: number } | null;
  visit_modality?: string;
};
type Kind = "reschedule" | "cancel";
type Window = { starts_at: string; ends_at: string };
type Attempt = Readonly<{
  request_key: string;
  request_kind: Kind;
  source_appointment_id: number;
  source_appointment_updated_at: string;
  starts_at?: string;
  ends_at?: string;
}>;
export type AppointmentChangeAcknowledgement = {
  id: number;
  request_key: string;
  request_kind: string;
  starts_at: string | null;
  ends_at: string | null;
  requested_modality: string | null;
  site: unknown;
  visit_type: unknown;
  source_appointment: Source | null;
  status: string;
};

function sameInstant(actual: string, expected: string) {
  if (typeof actual !== "string") return false;
  const remainder = (value: string) =>
    (value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "")
      .slice(3)
      .replace(/0+$/, "");
  return (
    Number.isFinite(Date.parse(actual)) &&
    Date.parse(actual) === Date.parse(expected) &&
    remainder(actual) === remainder(expected)
  );
}

// Original source snapshot and uncertain intent stay in this owning dialog only.
export class AppointmentChangeSubmission {
  private attempt: Attempt | null = null;
  private readonly source: Readonly<
    Omit<Source, "site"> & { siteId: number | null }
  >;
  busy = false;
  outcomeUnconfirmed = false;

  constructor(
    source: Source,
    private readonly kind: Kind,
    private readonly deliver: (
      attempt: Attempt,
    ) => Promise<AppointmentChangeAcknowledgement>,
  ) {
    const { site, ...snapshot } = source;
    this.source = Object.freeze({ ...snapshot, siteId: site?.id ?? null });
  }

  async submit(window?: Window): Promise<boolean> {
    if (this.busy) return false;
    if (!this.attempt && this.kind === "reschedule") {
      const duration = window
        ? Date.parse(window.ends_at) - Date.parse(window.starts_at)
        : NaN;
      if (
        !window ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > 4 * 60 * 60 * 1_000
      )
        return false;
    }
    const attempt = (this.attempt ??= Object.freeze({
      request_key: crypto.randomUUID(),
      request_kind: this.kind,
      source_appointment_id: this.source.id,
      source_appointment_updated_at: this.source.updated_at,
      ...(this.kind === "reschedule" ? window : {}),
    }));
    this.busy = true;
    try {
      const saved = await this.deliver(attempt);
      const source = saved?.source_appointment;
      if (
        !saved ||
        !Number.isSafeInteger(saved.id) ||
        saved.id <= 0 ||
        saved.request_key !== attempt.request_key ||
        saved.request_kind !== this.kind ||
        !source ||
        source.id !== this.source.id ||
        !sameInstant(source.updated_at, this.source.updated_at) ||
        !sameInstant(source.starts_at, this.source.starts_at) ||
        !sameInstant(source.ends_at, this.source.ends_at) ||
        source.status !== this.source.status ||
        (this.source.siteId === null
          ? source.site !== null
          : source.site?.id !== this.source.siteId) ||
        saved.site !== null ||
        saved.visit_type !== null ||
        saved.requested_modality !==
          (this.kind === "cancel"
            ? null
            : this.source.visit_modality || "in_person") ||
        (this.kind === "cancel"
          ? saved.starts_at !== null || saved.ends_at !== null
          : !sameInstant(saved.starts_at!, attempt.starts_at!) ||
            !sameInstant(saved.ends_at!, attempt.ends_at!)) ||
        !["pending", "approved", "declined", "cancelled", "expired"].includes(
          saved.status,
        )
      ) {
        throw new Error(
          "The saved appointment change request could not be confirmed.",
        );
      }
      this.attempt = null;
      this.outcomeUnconfirmed = false;
      return true;
    } catch (reason) {
      this.outcomeUnconfirmed ||=
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      if (!this.outcomeUnconfirmed) this.attempt = null;
      throw reason;
    } finally {
      this.busy = false;
    }
  }
}

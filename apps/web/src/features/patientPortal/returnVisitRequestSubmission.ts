import { ApiError } from "../../api/client";

export type ReturnVisitPreference = {
  starts_at: string;
  ends_at: string;
  site_id: number;
  visit_type_id?: number;
  requested_modality: "in_person" | "video";
};
type Attempt = Readonly<
  ReturnVisitPreference & {
    request_key: string;
    request_kind: "new_booking";
  }
>;
export type ReturnVisitAcknowledgement = {
  id: number;
  request_key: string;
  request_kind: string;
  starts_at: string;
  ends_at: string;
  site: { id: number } | null;
  visit_type: { id: number } | null;
  requested_modality: string;
  source_appointment: unknown;
  status: string;
};

function sameInstant(actual: string, expected: string) {
  if (typeof actual !== "string") return false;
  const fraction = actual.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "";
  return (
    !/[1-9]/.test(fraction.slice(3)) &&
    Number.isFinite(Date.parse(actual)) &&
    Date.parse(actual) === Date.parse(expected)
  );
}

// An exact existing-request retry is distinct from eligibility for a new request.
// The portal API remains authoritative for patient/identity and booking access.
export class ReturnVisitRequestSubmission {
  private attempt: Attempt | null = null;
  busy = false;
  outcomeUnconfirmed = false;

  constructor(
    private readonly deliver: (
      attempt: Attempt,
    ) => Promise<ReturnVisitAcknowledgement>,
  ) {}

  canSubmit(canRequestNewBooking: boolean) {
    return !this.busy && (canRequestNewBooking || this.outcomeUnconfirmed);
  }

  async submit(
    preference: ReturnVisitPreference,
    canRequestNewBooking: boolean,
  ): Promise<boolean> {
    if (!this.canSubmit(canRequestNewBooking)) return false;
    const attempt = (this.attempt ??= Object.freeze({
      ...preference,
      request_key: crypto.randomUUID(),
      request_kind: "new_booking" as const,
    }));
    this.busy = true;
    try {
      const response = await this.deliver(attempt);
      if (
        !response ||
        !Number.isSafeInteger(response.id) ||
        response.id <= 0 ||
        response.request_key !== attempt.request_key ||
        response.request_kind !== "new_booking" ||
        !sameInstant(response.starts_at, attempt.starts_at) ||
        !sameInstant(response.ends_at, attempt.ends_at) ||
        response.site?.id !== attempt.site_id ||
        (response.visit_type?.id ?? undefined) !== attempt.visit_type_id ||
        response.requested_modality !== attempt.requested_modality ||
        response.source_appointment !== null ||
        !["pending", "approved", "declined", "cancelled", "expired"].includes(
          response.status,
        )
      ) {
        throw new Error(
          "The saved appointment request could not be confirmed.",
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

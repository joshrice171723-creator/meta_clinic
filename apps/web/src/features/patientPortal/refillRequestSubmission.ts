import { ApiError } from "../../api/client";
import type { PatientRefillRequest } from "../../api/contracts";

type Values = {
  medicationName: string;
  pharmacyDestination: string;
  requestNote: string;
};
type Attempt = Readonly<Values & { requestKey: string }>;
export type RefillRequestAcknowledgement = Pick<
  PatientRefillRequest,
  | "id"
  | "status"
  | "medication_name"
  | "pharmacy_destination"
  | "request_note"
  | "source"
> & { request_key: string; request_type: string };

// Memory only; the patient panel remounts when its owning context changes.
export class RefillRequestSubmission {
  private attempt: Attempt | null = null;
  busy = false;
  outcomeUnconfirmed = false;

  constructor(
    private readonly deliver: (
      attempt: Attempt,
    ) => Promise<RefillRequestAcknowledgement>,
  ) {}

  async submit(values: Values): Promise<boolean> {
    if (this.busy) return false;
    const normalized = {
      medicationName: values.medicationName.trim(),
      pharmacyDestination: values.pharmacyDestination.trim(),
      requestNote: values.requestNote.trim(),
    };
    if (
      !this.attempt &&
      (!normalized.medicationName || !normalized.pharmacyDestination)
    )
      return false;
    const attempt = (this.attempt ??= Object.freeze({
      requestKey: crypto.randomUUID(),
      ...normalized,
    }));
    this.busy = true;
    try {
      const saved = await this.deliver(attempt);
      if (
        !saved ||
        !Number.isSafeInteger(saved.id) ||
        saved.id <= 0 ||
        saved.request_key !== attempt.requestKey ||
        saved.request_type !== "refill" ||
        saved.source !== "patient" ||
        saved.medication_name !== attempt.medicationName ||
        saved.pharmacy_destination !== attempt.pharmacyDestination ||
        !(
          saved.request_note === null || typeof saved.request_note === "string"
        ) ||
        (saved.request_note ?? "") !== attempt.requestNote ||
        !["pending", "in_review", "resolved", "declined"].includes(saved.status)
      )
        throw new Error("The saved refill request could not be confirmed.");
      this.attempt = null;
      this.outcomeUnconfirmed = false;
      return true;
    } catch (reason) {
      this.outcomeUnconfirmed ||=
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      // A rejected retry does not disprove an earlier possibly committed write.
      if (!this.outcomeUnconfirmed) this.attempt = null;
      throw reason;
    } finally {
      this.busy = false;
    }
  }
}

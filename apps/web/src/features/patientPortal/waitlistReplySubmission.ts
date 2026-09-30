import { ApiError } from "../../api/client";
import type { WaitlistItem } from "../clinic/WaitlistWorkspace";

export type WaitlistReplyOffer = Pick<
  WaitlistItem,
  | "id"
  | "version"
  | "state"
  | "site_id"
  | "clinician_id"
  | "visit_type_id"
  | "offer_starts_at"
  | "offer_ends_at"
  | "offer_expires_at"
>;
export type WaitlistReplyAcknowledgement = WaitlistReplyOffer & {
  recorded_state: string;
  appointment_id: number | null;
};
export type WaitlistReplyAttempt = Readonly<{
  offer: Readonly<WaitlistReplyOffer>;
  body: Readonly<{
    waitlist: Readonly<{
      action: "accept" | "decline";
      expected_version: number;
      request_key: string;
    }>;
  }>;
}>;

// In-memory only. The exact PATCH verifies the existing server-owned receipt;
// a later list status cannot prove which reply produced that status.
export class WaitlistReplySubmission {
  private attempt: WaitlistReplyAttempt | null = null;
  private disposed = false;
  busy = false;
  outcomeUnconfirmed = false;

  constructor(
    private readonly deliver: (
      attempt: WaitlistReplyAttempt,
    ) => Promise<WaitlistReplyAcknowledgement>,
  ) {}

  get pendingReply() {
    return this.attempt;
  }

  dispose() {
    this.disposed = true;
    this.attempt = null;
  }

  async submit(
    offer: WaitlistReplyOffer,
    action: "accept" | "decline",
    canAccept: boolean,
  ): Promise<WaitlistReplyAcknowledgement | null> {
    if (this.disposed || this.busy) return null;
    if (
      !this.attempt &&
      (offer.state !== "offered" || (action === "accept" && !canAccept))
    )
      return null;
    const attempt = (this.attempt ??= Object.freeze({
      offer: Object.freeze({ ...offer }),
      body: Object.freeze({
        waitlist: Object.freeze({
          action,
          expected_version: offer.version,
          request_key: crypto.randomUUID(),
        }),
      }),
    }));
    this.busy = true;
    try {
      const response = await this.deliver(attempt);
      if (this.disposed) return null;
      if (!this.matches(attempt, response))
        throw new Error(
          "The original waitlist response could not be confirmed.",
        );
      this.attempt = null;
      this.outcomeUnconfirmed = false;
      return response;
    } catch (reason) {
      if (this.disposed) return null;
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

  private matches(
    attempt: WaitlistReplyAttempt,
    response: WaitlistReplyAcknowledgement,
  ) {
    const { offer, body } = attempt;
    const accepting = body.waitlist.action === "accept";
    const state = accepting ? "booked" : "waiting";
    return (
      response &&
      response.id === offer.id &&
      response.site_id === offer.site_id &&
      response.clinician_id === offer.clinician_id &&
      response.visit_type_id === offer.visit_type_id &&
      response.version === offer.version + 1 &&
      response.state === state &&
      response.recorded_state === state &&
      (accepting
        ? Number.isSafeInteger(response.appointment_id) &&
          response.appointment_id! > 0 &&
          response.offer_starts_at === offer.offer_starts_at &&
          response.offer_ends_at === offer.offer_ends_at &&
          response.offer_expires_at === offer.offer_expires_at
        : response.appointment_id === null &&
          response.offer_starts_at === null &&
          response.offer_ends_at === null &&
          response.offer_expires_at === null)
    );
  }
}

import { ApiError } from "../../api/client";

type Attempt = Readonly<{ requestKey: string; content: string }>;
export type BillingSupportAcknowledgement = {
  id: number;
  request_key: string;
  request_type: string;
  content: string;
};

// Memory only: the owning patient component must be remounted on context changes.
export class BillingSupportSubmission {
  private attempt: Attempt | null = null;
  busy = false;
  outcomeUnconfirmed = false;

  constructor(
    private readonly deliver: (
      attempt: Attempt,
    ) => Promise<BillingSupportAcknowledgement>,
  ) {}

  async submit(content: string): Promise<boolean> {
    if (this.busy) return false;
    const value = content.trim();
    if (!this.attempt && !value) return false;
    const attempt = (this.attempt ??= Object.freeze({
      requestKey: crypto.randomUUID(),
      content: value,
    }));
    this.busy = true;
    try {
      const acknowledgement = await this.deliver(attempt);
      if (
        !acknowledgement ||
        !Number.isSafeInteger(acknowledgement.id) ||
        acknowledgement.id <= 0 ||
        acknowledgement.request_key !== attempt.requestKey ||
        acknowledgement.request_type !== "message" ||
        acknowledgement.content !== attempt.content
      ) {
        throw new Error("The saved request could not be confirmed.");
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
      // A later rejection cannot disprove an earlier possibly committed request.
      if (!this.outcomeUnconfirmed) this.attempt = null;
      throw reason;
    } finally {
      this.busy = false;
    }
  }
}

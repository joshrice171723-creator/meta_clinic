import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import {
  ReturnVisitRequestSubmission,
  type ReturnVisitAcknowledgement,
  type ReturnVisitPreference,
} from "../src/features/patientPortal/returnVisitRequestSubmission";

type Attempt = Parameters<
  ConstructorParameters<typeof ReturnVisitRequestSubmission>[0]
>[0];
const preference: ReturnVisitPreference = {
  starts_at: "2026-10-10T09:00:00.000Z",
  ends_at: "2026-10-10T10:00:00.000Z",
  site_id: 11,
  visit_type_id: 22,
  requested_modality: "in_person",
};
function saved(attempt: Attempt): ReturnVisitAcknowledgement {
  return {
    id: 31,
    request_key: attempt.request_key,
    request_kind: "new_booking",
    starts_at: attempt.starts_at.replace(".000Z", ".000000Z"),
    ends_at: attempt.ends_at.replace(".000Z", ".000000Z"),
    site: { id: attempt.site_id },
    visit_type: attempt.visit_type_id ? { id: attempt.visit_type_id } : null,
    requested_modality: attempt.requested_modality,
    source_appointment: null,
    status: "pending",
  };
}

describe("patient return-request recovery", () => {
  it("confirms the same committed return request after new-booking eligibility changes", async () => {
    const requests = new Map<string, ReturnVisitAcknowledgement>();
    let loseAcknowledgement = true;
    const deliver = vi.fn(async (attempt: Attempt) => {
      const record = requests.get(attempt.request_key) ?? saved(attempt);
      requests.set(attempt.request_key, record);
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new ApiError(503, "Synthetic lost acknowledgement");
      }
      return record;
    });
    const submission = new ReturnVisitRequestSubmission(deliver);
    await expect(submission.submit(preference, true)).rejects.toThrow();
    expect(deliver).toHaveBeenCalledTimes(1); // No automatic resend.
    expect(submission.canSubmit(false)).toBe(true);
    expect(
      await submission.submit(
        { ...preference, site_id: 99, requested_modality: "video" },
        false,
      ),
    ).toBe(true);
    expect(deliver.mock.calls[1][0]).toEqual(deliver.mock.calls[0][0]);
    expect(requests.size).toBe(1);
    expect(submission.outcomeUnconfirmed).toBe(false);
    expect(submission.canSubmit(false)).toBe(false);
    expect(await submission.submit(preference, false)).toBe(false);
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("never sends a fresh request when new booking is unavailable", async () => {
    const deliver = vi.fn(async (attempt: Attempt) => saved(attempt));
    const submission = new ReturnVisitRequestSubmission(deliver);
    expect(await submission.submit(preference, false)).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("keeps the original immutable preference after a later rejected retry", async () => {
    const deliver = vi
      .fn<(attempt: Attempt) => Promise<ReturnVisitAcknowledgement>>()
      .mockRejectedValueOnce(new TypeError("Synthetic network interruption"))
      .mockRejectedValueOnce(new ApiError(422, "Synthetic booking unavailable"))
      .mockImplementation(async (attempt) => saved(attempt));
    const submission = new ReturnVisitRequestSubmission(deliver);
    const draft = { ...preference };
    await expect(submission.submit(draft, true)).rejects.toThrow();
    draft.starts_at = "2026-10-12T09:00:00.000Z";
    draft.site_id = 99;
    await expect(submission.submit(draft, false)).rejects.toThrow();
    expect(submission.outcomeUnconfirmed).toBe(true);
    await submission.submit(draft, false);
    expect(deliver.mock.calls.map(([attempt]) => attempt)).toEqual([
      deliver.mock.calls[0][0],
      deliver.mock.calls[0][0],
      deliver.mock.calls[0][0],
    ]);
    expect(deliver.mock.calls[2][0].starts_at).toBe(preference.starts_at);
    expect(deliver.mock.calls[2][0].site_id).toBe(preference.site_id);
  });

  it("allows a corrected fresh preference after an initial definitive rejection", async () => {
    const deliver = vi
      .fn<(attempt: Attempt) => Promise<ReturnVisitAcknowledgement>>()
      .mockRejectedValueOnce(new ApiError(422, "Synthetic invalid window"))
      .mockImplementation(async (attempt) => saved(attempt));
    const submission = new ReturnVisitRequestSubmission(deliver);
    await expect(submission.submit(preference, true)).rejects.toThrow();
    expect(submission.outcomeUnconfirmed).toBe(false);
    await submission.submit({ ...preference, visit_type_id: undefined }, true);
    expect(deliver.mock.calls[1][0].request_key).not.toBe(
      deliver.mock.calls[0][0].request_key,
    );
    expect(deliver.mock.calls[1][0].visit_type_id).toBeUndefined();
  });

  it.each([
    new ApiError(408, "Synthetic timeout"),
    new ApiError(409, "Synthetic uncertain outcome", "outcome_unconfirmed"),
    new ApiError(504, "Synthetic timeout"),
  ])("keeps a retry available after %s", async (reason) => {
    const submission = new ReturnVisitRequestSubmission(async () => {
      throw reason;
    });
    await expect(submission.submit(preference, true)).rejects.toThrow();
    expect(submission.canSubmit(false)).toBe(true);
  });

  it.each([
    { request_key: "unrelated" },
    { request_kind: "reschedule" },
    { starts_at: "2026-10-10T09:00:00.000001Z" },
    { ends_at: "2026-10-10T11:00:00.000000Z" },
    { site: { id: 99 } },
    { visit_type: { id: 99 } },
    { requested_modality: "video" },
    { source_appointment: { id: 99 } },
    { status: "unknown" },
    { id: 0 },
  ])(
    "does not acknowledge a mismatched return request: %s",
    async (mismatch) => {
      const deliver = vi.fn(async (attempt: Attempt) => ({
        ...saved(attempt),
        ...mismatch,
      }));
      const submission = new ReturnVisitRequestSubmission(deliver);
      await expect(submission.submit(preference, true)).rejects.toThrow(
        "could not be confirmed",
      );
      expect(submission.outcomeUnconfirmed).toBe(true);
    },
  );

  it.each(["approved", "declined", "cancelled", "expired"])(
    "acknowledges a matching existing request whose current status is %s",
    async (status) => {
      const submission = new ReturnVisitRequestSubmission(async (attempt) => ({
        ...saved(attempt),
        status,
      }));
      expect(await submission.submit(preference, true)).toBe(true);
    },
  );

  it("does not send a second in-flight request or share attempts between owning components", async () => {
    let acknowledge!: (response: ReturnVisitAcknowledgement) => void;
    const deliverA = vi.fn(
      (_: Attempt) =>
        new Promise<ReturnVisitAcknowledgement>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const deliverB = vi.fn(async (attempt: Attempt) => saved(attempt));
    const ownerA = new ReturnVisitRequestSubmission(deliverA);
    const ownerB = new ReturnVisitRequestSubmission(deliverB);
    const first = ownerA.submit(preference, true);
    expect(await ownerA.submit(preference, true)).toBe(false);
    expect(deliverA).toHaveBeenCalledTimes(1);
    await ownerB.submit({ ...preference, site_id: 99 }, true);
    expect(deliverB.mock.calls[0][0].request_key).not.toBe(
      deliverA.mock.calls[0][0].request_key,
    );
    acknowledge(saved(deliverA.mock.calls[0][0]));
    expect(await first).toBe(true);
  });
});

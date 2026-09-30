import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import {
  RefillRequestSubmission,
  type RefillRequestAcknowledgement,
} from "../src/features/patientPortal/refillRequestSubmission";

type Attempt = Parameters<
  ConstructorParameters<typeof RefillRequestSubmission>[0]
>[0];
const values = {
  medicationName: " Synthetic medication ",
  pharmacyDestination: " Synthetic pharmacy ",
  requestNote: " Synthetic note ",
};
function saved(attempt: Attempt): RefillRequestAcknowledgement {
  return {
    id: 12,
    request_key: attempt.requestKey,
    request_type: "refill",
    source: "patient",
    status: "pending",
    medication_name: attempt.medicationName,
    pharmacy_destination: attempt.pharmacyDestination,
    request_note: attempt.requestNote || null,
  };
}

describe("patient refill exact recovery", () => {
  it("recovers one committed request after lost acknowledgement without changing semantic intent", async () => {
    const records = new Map<string, RefillRequestAcknowledgement>();
    let loseResponse = true;
    const deliver = vi.fn(async (attempt: Attempt) => {
      const record = records.get(attempt.requestKey) ?? saved(attempt);
      records.set(attempt.requestKey, record);
      if (loseResponse) {
        loseResponse = false;
        throw new TypeError("Synthetic lost response");
      }
      return record;
    });
    const owner = new RefillRequestSubmission(deliver);
    await expect(owner.submit(values)).rejects.toThrow();
    expect(owner.outcomeUnconfirmed).toBe(true);
    expect(deliver).toHaveBeenCalledTimes(1);
    await owner.submit({
      medicationName: "Changed medication",
      pharmacyDestination: "Changed pharmacy",
      requestNote: "Changed note",
    });
    expect(deliver.mock.calls[1][0]).toEqual(deliver.mock.calls[0][0]);
    expect(deliver.mock.calls[1][0]).toMatchObject({
      medicationName: "Synthetic medication",
      pharmacyDestination: "Synthetic pharmacy",
      requestNote: "Synthetic note",
    });
    expect(Object.isFrozen(deliver.mock.calls[0][0])).toBe(true);
    expect(records.size).toBe(1);
    expect(owner.outcomeUnconfirmed).toBe(false);
    await owner.submit(values);
    expect(records.size).toBe(2);
  });

  it.each([
    new Error("Synthetic transport"),
    new ApiError(408, "Synthetic timeout"),
    new ApiError(503, "Synthetic interrupted"),
    new ApiError(409, "Synthetic unknown", "outcome_unconfirmed"),
  ])("retains original after %s then a later rejection", async (reason) => {
    const deliver = vi
      .fn<(attempt: Attempt) => Promise<RefillRequestAcknowledgement>>()
      .mockRejectedValueOnce(reason)
      .mockRejectedValueOnce(new ApiError(403, "Synthetic denied"))
      .mockImplementation(async (attempt) => saved(attempt));
    const owner = new RefillRequestSubmission(deliver);
    await expect(owner.submit(values)).rejects.toThrow();
    await expect(
      owner.submit({ ...values, requestNote: "Changed" }),
    ).rejects.toThrow();
    expect(owner.outcomeUnconfirmed).toBe(true);
    await owner.submit({
      medicationName: "",
      pharmacyDestination: "",
      requestNote: "",
    });
    expect(deliver.mock.calls.map(([attempt]) => attempt)).toEqual(
      Array(3).fill(deliver.mock.calls[0][0]),
    );
  });

  it("allows correction only after a definitive initial rejection", async () => {
    const deliver = vi
      .fn<(attempt: Attempt) => Promise<RefillRequestAcknowledgement>>()
      .mockRejectedValueOnce(new ApiError(422, "Synthetic invalid"))
      .mockImplementation(async (attempt) => saved(attempt));
    const owner = new RefillRequestSubmission(deliver);
    await expect(owner.submit(values)).rejects.toThrow();
    expect(owner.outcomeUnconfirmed).toBe(false);
    await owner.submit({ ...values, requestNote: "Corrected note" });
    expect(deliver.mock.calls[1][0].requestKey).not.toBe(
      deliver.mock.calls[0][0].requestKey,
    );
    expect(deliver.mock.calls[1][0].requestNote).toBe("Corrected note");
  });

  it.each([
    ["id", 0],
    ["request_key", "other-key"],
    ["request_type", "message"],
    ["source", "staff"],
    ["status", "booked"],
    ["medication_name", "Other medication"],
    ["pharmacy_destination", "Other pharmacy"],
    ["request_note", "Other note"],
    ["request_note", undefined],
  ])("retains uncertainty for mismatched %s=%s", async (field, value) => {
    const deliver = vi.fn(
      async (attempt: Attempt) =>
        ({ ...saved(attempt), [field]: value }) as RefillRequestAcknowledgement,
    );
    const owner = new RefillRequestSubmission(deliver);
    await expect(owner.submit(values)).rejects.toThrow(
      "could not be confirmed",
    );
    expect(owner.outcomeUnconfirmed).toBe(true);
  });

  it.each(["pending", "in_review", "resolved", "declined"] as const)(
    "acknowledges exact existing %s without asserting pending review",
    async (status) => {
      const owner = new RefillRequestSubmission(async (attempt) => ({
        ...saved(attempt),
        status,
      }));
      expect(await owner.submit({ ...values, requestNote: " " })).toBe(true);
      expect(owner.outcomeUnconfirmed).toBe(false);
    },
  );

  it("serializes repeated clicks and rejects empty fresh requests", async () => {
    let acknowledge!: (saved: RefillRequestAcknowledgement) => void;
    const deliver = vi.fn(
      (_attempt: Attempt) =>
        new Promise<RefillRequestAcknowledgement>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const owner = new RefillRequestSubmission(deliver);
    expect(await owner.submit({ ...values, medicationName: " " })).toBe(false);
    expect(await owner.submit({ ...values, pharmacyDestination: " " })).toBe(
      false,
    );
    const first = owner.submit(values);
    expect(await owner.submit(values)).toBe(false);
    expect(deliver).toHaveBeenCalledTimes(1);
    acknowledge(saved(deliver.mock.calls[0][0]));
    expect(await first).toBe(true);
    expect(owner.busy).toBe(false);
  });

  it("keeps different owning patients' attempts separate", async () => {
    const deliverA = vi.fn(
      async (_attempt: Attempt): Promise<RefillRequestAcknowledgement> => {
        throw new ApiError(503, "Synthetic unknown");
      },
    );
    const deliverB = vi.fn(async (attempt: Attempt) => saved(attempt));
    const a = new RefillRequestSubmission(deliverA);
    const b = new RefillRequestSubmission(deliverB);
    await expect(a.submit(values)).rejects.toThrow();
    await b.submit({
      ...values,
      medicationName: "Synthetic patient B medication",
    });
    expect(deliverA.mock.calls[0][0].requestKey).not.toBe(
      deliverB.mock.calls[0][0].requestKey,
    );
    expect(a.outcomeUnconfirmed).toBe(true);
    expect(b.outcomeUnconfirmed).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import {
  BillingSupportSubmission,
  type BillingSupportAcknowledgement,
} from "../src/features/patientPortal/billingSupportSubmission";

type Attempt = Parameters<
  ConstructorParameters<typeof BillingSupportSubmission>[0]
>[0];

function saved(attempt: Attempt): BillingSupportAcknowledgement {
  return {
    id: 12,
    request_key: attempt.requestKey,
    request_type: "message",
    content: attempt.content,
  };
}

describe("patient billing support recovery", () => {
  it("recovers a committed request after a lost acknowledgement without creating another", async () => {
    const records = new Map<string, BillingSupportAcknowledgement>();
    let loseAcknowledgement = true;
    const deliver = vi.fn(async (attempt: Attempt) => {
      const record = records.get(attempt.requestKey) ?? saved(attempt);
      records.set(attempt.requestKey, record);
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        throw new TypeError("Synthetic connection interruption");
      }
      return record;
    });
    const submission = new BillingSupportSubmission(deliver);

    await expect(
      submission.submit("  Synthetic invoice question  "),
    ).rejects.toThrow();
    expect(submission.outcomeUnconfirmed).toBe(true);
    expect(deliver).toHaveBeenCalledTimes(1); // No automatic replay.
    expect(await submission.submit("A changed question must not be sent")).toBe(
      true,
    );
    expect(deliver.mock.calls[1][0]).toEqual(deliver.mock.calls[0][0]);
    expect(deliver.mock.calls[1][0].content).toBe("Synthetic invoice question");
    expect(records.size).toBe(1);
    expect(submission.outcomeUnconfirmed).toBe(false);

    await submission.submit("Synthetic second question");
    expect(deliver.mock.calls[2][0].requestKey).not.toBe(
      deliver.mock.calls[0][0].requestKey,
    );
    expect(records.size).toBe(2);
  });

  it.each([
    new ApiError(408, "Synthetic timeout"),
    new ApiError(503, "Synthetic unavailable"),
    new ApiError(409, "Synthetic uncertain outcome", "outcome_unconfirmed"),
    new Error("Synthetic transport error"),
  ])("retains exact retries after %s", async (reason) => {
    const deliver = vi
      .fn<(attempt: Attempt) => Promise<BillingSupportAcknowledgement>>()
      .mockRejectedValueOnce(reason)
      .mockImplementation(async (attempt) => saved(attempt));
    const submission = new BillingSupportSubmission(deliver);
    await expect(submission.submit("Synthetic original")).rejects.toThrow();
    expect(submission.outcomeUnconfirmed).toBe(true);
    await submission.submit("Synthetic changed");
    expect(deliver.mock.calls[1][0]).toEqual(deliver.mock.calls[0][0]);
  });

  it("allows a corrected draft after a definitive first rejection", async () => {
    const deliver = vi
      .fn<(attempt: Attempt) => Promise<BillingSupportAcknowledgement>>()
      .mockRejectedValueOnce(new ApiError(422, "Synthetic invalid request"))
      .mockImplementation(async (attempt) => saved(attempt));
    const submission = new BillingSupportSubmission(deliver);
    await expect(submission.submit("Synthetic invalid")).rejects.toThrow();
    expect(submission.outcomeUnconfirmed).toBe(false);
    await submission.submit("Synthetic corrected");
    expect(deliver.mock.calls[1][0].content).toBe("Synthetic corrected");
    expect(deliver.mock.calls[1][0].requestKey).not.toBe(
      deliver.mock.calls[0][0].requestKey,
    );
  });

  it("does not discard an uncertain original when its retry is rejected", async () => {
    const deliver = vi
      .fn<(attempt: Attempt) => Promise<BillingSupportAcknowledgement>>()
      .mockRejectedValueOnce(
        new ApiError(503, "Synthetic interrupted response"),
      )
      .mockRejectedValueOnce(new ApiError(403, "Synthetic access denied"))
      .mockImplementation(async (attempt) => saved(attempt));
    const submission = new BillingSupportSubmission(deliver);
    await expect(submission.submit("Synthetic original")).rejects.toThrow();
    await expect(submission.submit("Synthetic changed")).rejects.toThrow();
    expect(submission.outcomeUnconfirmed).toBe(true);
    await submission.submit("Synthetic changed again");
    expect(deliver.mock.calls.map(([attempt]) => attempt)).toEqual([
      deliver.mock.calls[0][0],
      deliver.mock.calls[0][0],
      deliver.mock.calls[0][0],
    ]);
  });

  it.each(["request_key", "request_type", "content", "id"] as const)(
    "rejects an acknowledgement with mismatched %s",
    async (field) => {
      const deliver = vi.fn(async (attempt: Attempt) => ({
        ...saved(attempt),
        [field]: field === "id" ? 0 : "Synthetic unrelated response",
      }));
      const submission = new BillingSupportSubmission(deliver);
      await expect(submission.submit("Synthetic question")).rejects.toThrow(
        "could not be confirmed",
      );
      expect(submission.outcomeUnconfirmed).toBe(true);
    },
  );

  it("serializes rapid submissions and never sends an empty draft", async () => {
    let acknowledge!: (record: BillingSupportAcknowledgement) => void;
    const deliver = vi.fn(
      (_: Attempt) =>
        new Promise<BillingSupportAcknowledgement>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const submission = new BillingSupportSubmission(deliver);
    expect(await submission.submit("   ")).toBe(false);
    const first = submission.submit("Synthetic question");
    expect(await submission.submit("Synthetic double click")).toBe(false);
    expect(deliver).toHaveBeenCalledTimes(1);
    acknowledge(saved(deliver.mock.calls[0][0]));
    expect(await first).toBe(true);
    expect(submission.busy).toBe(false);
  });

  it("keeps independent owning components' attempts separate", async () => {
    const deliverA = vi
      .fn<(attempt: Attempt) => Promise<BillingSupportAcknowledgement>>()
      .mockRejectedValue(new ApiError(503, "Synthetic unavailable"));
    const deliverB = vi.fn(async (attempt: Attempt) => saved(attempt));
    const ownerA = new BillingSupportSubmission(deliverA);
    const ownerB = new BillingSupportSubmission(deliverB);
    await expect(
      ownerA.submit("Synthetic patient A question"),
    ).rejects.toThrow();
    await ownerB.submit("Synthetic patient B question");
    expect(deliverB.mock.calls[0][0].content).toBe(
      "Synthetic patient B question",
    );
    expect(deliverB.mock.calls[0][0].requestKey).not.toBe(
      deliverA.mock.calls[0][0].requestKey,
    );
    expect(ownerA.outcomeUnconfirmed).toBe(true);
    expect(ownerB.outcomeUnconfirmed).toBe(false);
  });
});

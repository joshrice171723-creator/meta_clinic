import { describe, expect, it } from "vitest";
import {
  acceptMuseReceipt,
  museCountdown,
} from "../src/features/qa/museCheckIn";

const principal = "synthetic-muse-principal";
const receipt = {
  id: "receipt-1",
  authenticatedActorId: principal,
  receivedAtMs: 10_000,
};

describe("Muse authenticated check-in contract", () => {
  it("requires a matching verified actor receipt, independent of QA timestamps", () => {
    expect(museCountdown(undefined, principal, 60_000, 20_000).label).toBe(
      "Not connected",
    );
    expect(museCountdown(receipt, "visitor", 60_000, 20_000).label).toBe(
      "Not connected",
    );
    expect(museCountdown(receipt, "", 60_000, 20_000).label).toBe(
      "Not connected",
    );
    expect(
      acceptMuseReceipt(
        undefined,
        { ...receipt, authenticatedActorId: "self-reported-Muse" },
        principal,
        20_000,
      ),
    ).toBeUndefined();
  });
  it("shows No schedule only after a valid receipt and rejects invalid cadence", () => {
    for (const cadence of [
      undefined,
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ])
      expect(museCountdown(receipt, principal, cadence, 20_000).label).toBe(
        "No schedule",
      );
  });
  it("empties toward the deadline, reads Due now for one tick and then Overdue", () => {
    expect(museCountdown(receipt, principal, 60_000, 10_000).fraction).toBe(1);
    expect(museCountdown(receipt, principal, 60_000, 40_000).fraction).toBe(
      0.5,
    );
    expect(museCountdown(receipt, principal, 60_000, 70_000)).toMatchObject({
      label: "Due now",
      fraction: 0,
    });
    expect(museCountdown(receipt, principal, 60_000, 70_999).label).toBe(
      "Due now",
    );
    expect(museCountdown(receipt, principal, 60_000, 71_000)).toMatchObject({
      label: "Overdue",
      fraction: 0,
    });
  });
  it("refresh cannot refill or rewrite an existing receipt; a newer authenticated receipt can", () => {
    const replay = { ...receipt, receivedAtMs: 30_000 };
    const kept = acceptMuseReceipt(receipt, replay, principal, 40_000);
    expect(kept).toBe(receipt);
    expect(museCountdown(kept, principal, 60_000, 40_000).fraction).toBe(0.5);
    expect(
      acceptMuseReceipt(
        receipt,
        { ...receipt, id: "older", receivedAtMs: 5_000 },
        principal,
        40_000,
      ),
    ).toBe(receipt);
    const next = { ...receipt, id: "receipt-2", receivedAtMs: 40_000 };
    expect(
      museCountdown(
        acceptMuseReceipt(receipt, next, principal, 40_000),
        principal,
        60_000,
        40_000,
      ).fraction,
    ).toBe(1);
  });
  it("fails closed for future/invalid timestamps, missing receipts and changed actor bindings", () => {
    for (const receivedAtMs of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      30_000,
    ])
      expect(
        acceptMuseReceipt(
          receipt,
          { ...receipt, receivedAtMs },
          principal,
          20_000,
        ),
      ).toBeUndefined();
    expect(
      acceptMuseReceipt(receipt, undefined, principal, 20_000),
    ).toBeUndefined();
    expect(
      acceptMuseReceipt(receipt, receipt, "new-binding", 20_000),
    ).toBeUndefined();
    expect(museCountdown(receipt, principal, 60_000, 5_000).label).toBe(
      "Not connected",
    );
  });
});

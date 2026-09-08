import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import {
  resolveSubscriptionActionAttempt,
  submitSubscriptionActionAttempt,
  subscriptionActionFailure,
  subscriptionActionResponse,
} from "../src/features/clinic/subscriptions/SubscriptionBilling";

describe("membership action recovery", () => {
  it("retries an uncertain action with the exact frozen request body and key", async () => {
    const input = { approved: true };
    const first = resolveSubscriptionActionAttempt(
      null,
      42,
      "review",
      input,
      "review-key-42",
    );
    expect(first).not.toBeNull();
    expect(first?.body).toEqual({
      approved: true,
      request_key: "review-key-42",
    });
    expect(Object.isFrozen(first?.body)).toBe(true);
    input.approved = false;
    expect(first?.body.approved).toBe(true);

    const networkError = new TypeError("Connection lost");
    const request = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ id: 42, state: "review_approved" });
    await expect(submitSubscriptionActionAttempt(first!, request)).rejects.toBe(
      networkError,
    );

    const failure = subscriptionActionFailure(first!, networkError);
    const retry = resolveSubscriptionActionAttempt(
      failure.pendingAttempt,
      42,
      "review",
      { approved: false },
      "replacement-key-must-not-be-used",
    );
    expect(retry).toBe(first);
    await expect(
      submitSubscriptionActionAttempt(retry!, request),
    ).resolves.toMatchObject({ id: 42, state: "review_approved" });

    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toBe(
      "/api/clinic/subscriptions/42/review",
    );
    expect(request.mock.calls[1][0]).toBe(request.mock.calls[0][0]);
    expect(request.mock.calls[1][1].body).toBe(request.mock.calls[0][1].body);
    expect(request.mock.calls[1][1].body).toBe(first?.body);
  });

  it("retains uncertain failures and releases a deterministic rejection", () => {
    const attempt = resolveSubscriptionActionAttempt(
      null,
      9,
      "cancel",
      {},
      "cancel-key-9",
    )!;
    for (const reason of [
      new TypeError("Network unavailable"),
      new ApiError(408, "Timed out"),
      new ApiError(503, "Unavailable"),
      new ApiError(409, "Unknown", "outcome_unconfirmed"),
    ]) {
      expect(subscriptionActionFailure(attempt, reason)).toEqual({
        outcomeUnconfirmed: true,
        pendingAttempt: attempt,
      });
    }

    expect(
      subscriptionActionFailure(
        attempt,
        new ApiError(422, "Cancellation is not allowed"),
      ),
    ).toEqual({ outcomeUnconfirmed: false, pendingAttempt: null });
    expect(
      resolveSubscriptionActionAttempt(
        attempt,
        10,
        "cancel",
        {},
        "different-key",
      ),
    ).toBeNull();
  });

  it("accepts the direct Rails projection and rejects malformed 2xx bodies", () => {
    expect(subscriptionActionResponse({ id: 7, state: "active" }, 7)).toEqual({
      id: 7,
      state: "active",
    });

    for (const response of [
      { subscription: { id: 7, state: "active" } },
      { id: 8, state: "active" },
      { id: 7 },
      { id: 7, state: "" },
    ]) {
      expect(() => subscriptionActionResponse(response, 7)).toThrow(
        "invalid response",
      );
    }
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import { PackageEntitlementBalances } from "../src/features/clinic/subscriptions/PackageEntitlements";
import {
  createEntitlementAttempt,
  entitlementActionAllowed,
  entitlementLedgerResponse,
  entitlementOutcomeUnknown,
  entitlementResponse,
  submitEntitlementAttempt,
} from "../src/features/clinic/subscriptions/entitlementActions";
import type {
  PackageEntitlement,
  PackageEntitlementEntry,
  Subscription,
} from "../src/features/clinic/subscriptions/contracts";

const balance: PackageEntitlement = {
  service_id: 4,
  name: "Synthetic package service",
  frequency: "term",
  purchased_quantity: 3,
  opening_quantity: null,
  used_quantity: 0,
  reversed_quantity: 0,
  remaining_quantity: null,
  status: "not_recorded",
  can_use: false,
  source: "staff_recorded_package_ledger",
};
const subscription: Subscription = {
  id: 42,
  patient_id: 7,
  invoice_id: 15,
  version_id: 6,
  state: "active",
  amount: "15.00",
  currency: "USD",
  balance: "0.00",
  invoice_status: "posted",
  starts_at: "2026-09-30T20:00:00Z",
  ends_at: "2026-10-30T20:00:00Z",
  cancellation_effective_at: null,
  events: [],
  entitlements: [balance],
  terms: {
    family_id: 1,
    family_name: "Synthetic family",
    package_id: 2,
    package_name: "Three units",
    description: "",
    tier: "",
    amount: "15.00",
    currency: "USD",
    duration: 1,
    duration_unit: "months",
    renewal: "none",
    cancellation: "immediate",
    refund_policy: "manual_review",
    terms: "Synthetic terms",
    eligibility_review: false,
    max_per_patient: 1,
    available_from: null,
    available_until: null,
    components: [],
  },
};
const available = {
  ...balance,
  opening_quantity: 3,
  remaining_quantity: 3,
  status: "available",
  can_use: true,
};
const original: PackageEntitlementEntry = {
  id: 9,
  kind: "use",
  service_id: 4,
  quantity: 2,
  reversed_entry_id: null,
  source_reference: "synthetic-use",
  occurred_at: "2026-09-30T20:01:00Z",
};

describe("fixed-term package actions", () => {
  it("shows unknown as unknown, with a reviewed opening action and no service-use action", () => {
    const html = renderToStaticMarkup(
      <PackageEntitlementBalances
        subscription={subscription}
        canWrite
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("Unknown — opening balance not recorded");
    expect(html).toContain("Record reviewed opening balance");
    expect(html).not.toContain(">Record service use<");
    expect(html).not.toContain("Remaining: 3 units");
  });

  it("requires whole, bounded explicit opening units and a source reference", () => {
    for (const units of ["", "-1", "0.5", "4", "1e0", "NaN"])
      expect(() =>
        createEntitlementAttempt(
          subscription,
          balance,
          true,
          "opening",
          units,
          "reviewed",
          undefined,
          "key",
        ),
      ).toThrow();
    expect(() =>
      createEntitlementAttempt(
        subscription,
        balance,
        true,
        "opening",
        "3",
        " ",
        undefined,
        "key",
      ),
    ).toThrow(/source reference/);
    expect(() =>
      createEntitlementAttempt(
        subscription,
        balance,
        true,
        "opening",
        "3",
        "x".repeat(161),
        undefined,
        "key",
      ),
    ).toThrow();
    expect(
      createEntitlementAttempt(
        subscription,
        balance,
        true,
        "opening",
        "0",
        "reviewed-zero",
        undefined,
        "key",
      ).body.entitlement.quantity,
    ).toBe(0);
  });

  it("preserves permission, active-state, period and server-use gates", () => {
    expect(
      entitlementActionAllowed(subscription, balance, false, "opening"),
    ).toBe(false);
    for (const state of [
      "pending_payment",
      "processing",
      "outcome_unknown",
      "payment_failed",
      "expired",
      "refunded",
      "canceled",
    ]) {
      expect(
        entitlementActionAllowed(
          { ...subscription, state },
          balance,
          true,
          "opening",
        ),
      ).toBe(false);
      expect(
        entitlementActionAllowed(
          { ...subscription, state },
          available,
          true,
          "use",
        ),
      ).toBe(false);
    }
    expect(
      entitlementActionAllowed(
        subscription,
        { ...available, can_use: false },
        true,
        "use",
      ),
    ).toBe(false);
    expect(
      entitlementActionAllowed(
        subscription,
        { ...available, remaining_quantity: 0, status: "exhausted" },
        true,
        "use",
      ),
    ).toBe(false);
    expect(
      entitlementActionAllowed(
        subscription,
        { ...available, frequency: "week" },
        true,
        "use",
      ),
    ).toBe(false);
    expect(
      entitlementActionAllowed(
        {
          ...subscription,
          terms: { ...subscription.terms, renewal: "automatic" },
        },
        available,
        true,
        "use",
      ),
    ).toBe(false);
    expect(
      entitlementActionAllowed(
        { ...subscription, state: "expired" },
        available,
        true,
        "reversal",
      ),
    ).toBe(true);
  });

  it("renders remaining units and hides mutations for read-only or inactive staff", () => {
    const sub = { ...subscription, entitlements: [available] };
    const render = (value: Subscription, canWrite: boolean) =>
      renderToStaticMarkup(
        <PackageEntitlementBalances
          subscription={value}
          canWrite={canWrite}
          onSelect={() => {}}
        />,
      );
    expect(render(sub, true)).toContain("Record service use");
    expect(render(sub, true)).toContain("3 units");
    expect(render(sub, false)).not.toContain("Record service use");
    expect(
      render(
        {
          ...sub,
          state: "expired",
          entitlements: [{ ...available, status: "inactive", can_use: false }],
        },
        true,
      ),
    ).toContain("cannot be used");
    expect(render({ ...sub, state: "expired" }, true)).not.toContain(
      "Record service use",
    );
  });

  it.each(["opening", "use", "reversal"] as const)(
    "freezes %s and replays the exact original body after transport uncertainty",
    async (kind) => {
      const attempt = createEntitlementAttempt(
        subscription,
        kind === "opening" ? balance : available,
        true,
        kind,
        "2",
        "synthetic-source",
        kind === "reversal" ? original : undefined,
        "exact-key",
      );
      const entry = {
        ...original,
        id: 10,
        kind,
        source_reference: "synthetic-source",
        reversed_entry_id: kind === "reversal" ? original.id : null,
      };
      const request = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("Response lost after commit"))
        .mockResolvedValueOnce({ entry, subscription });
      expect(Object.isFrozen(attempt)).toBe(true);
      expect(Object.isFrozen(attempt.body.entitlement)).toBe(true);
      await expect(submitEntitlementAttempt(attempt, request)).rejects.toThrow(
        /lost/,
      );
      const result = await submitEntitlementAttempt(attempt, request);
      expect(result.entry.id).toBe(10);
      expect(request.mock.calls[0][1].body).toBe(request.mock.calls[1][1].body);
      expect(request.mock.calls[1][1].body.entitlement.request_key).toBe(
        "exact-key",
      );
      expect(request.mock.calls[1][0]).toBe(
        "/api/clinic/subscriptions/42/entitlement",
      );
    },
  );

  it("reverses only the exact use, with server-owned units and service omitted from the request", () => {
    const attempt = createEntitlementAttempt(
      subscription,
      available,
      true,
      "reversal",
      "999",
      "correction",
      original,
      "reverse-key",
    );
    expect(attempt.body.entitlement).toEqual({
      kind: "reversal",
      reversed_entry_id: 9,
      source_reference: "correction",
      request_key: "reverse-key",
    });
    expect(() =>
      createEntitlementAttempt(
        subscription,
        available,
        true,
        "reversal",
        "",
        "correction",
        { ...original, kind: "opening" },
        "key",
      ),
    ).toThrow();
    expect(() =>
      createEntitlementAttempt(
        subscription,
        available,
        true,
        "reversal",
        "",
        "correction",
        { ...original, service_id: 999 },
        "key",
      ),
    ).toThrow();
  });

  it("retains uncertain outcomes and permits correction after deterministic denial", () => {
    expect(entitlementOutcomeUnknown(new TypeError("Lost response"))).toBe(
      true,
    );
    expect(entitlementOutcomeUnknown(new ApiError(503, "Unavailable"))).toBe(
      true,
    );
    expect(entitlementOutcomeUnknown(new ApiError(408, "Timeout"))).toBe(true);
    expect(entitlementOutcomeUnknown(new ApiError(403, "No permission"))).toBe(
      false,
    );
    expect(
      entitlementOutcomeUnknown(new ApiError(422, "Units exhausted")),
    ).toBe(false);
  });

  it("rejects wrong membership, source, service, units and reversal response ownership", () => {
    const attempt = createEntitlementAttempt(
      subscription,
      available,
      true,
      "reversal",
      "",
      "corrected-source",
      original,
      "key",
    );
    const valid = {
      entry: {
        ...original,
        id: 10,
        kind: "reversal" as const,
        reversed_entry_id: 9,
        source_reference: "corrected-source",
      },
      subscription,
    };
    expect(entitlementResponse(valid, attempt).entry.id).toBe(10);
    for (const override of [
      { service_id: 999 },
      { quantity: 1 },
      { reversed_entry_id: 8 },
      { source_reference: "another-source" },
      { id: -1 },
    ])
      expect(() =>
        entitlementResponse(
          { ...valid, entry: { ...valid.entry, ...override } },
          attempt,
        ),
      ).toThrow(/exact request/);
    expect(() =>
      entitlementResponse(
        { ...valid, subscription: { ...subscription, id: 43 } },
        attempt,
      ),
    ).toThrow();
    expect(() => entitlementResponse(null, attempt)).toThrow();
  });

  it("accepts only the requested history page and exact membership context", () => {
    const value = {
      subscription,
      entries: [original],
      page: 2,
      per_page: 50,
      total_count: 51,
      total_pages: 2,
    };
    expect(entitlementLedgerResponse(value, 42, 2)).toBe(value);
    expect(() => entitlementLedgerResponse(value, 43, 2)).toThrow(
      /membership and page/,
    );
    expect(() => entitlementLedgerResponse(value, 42, 1)).toThrow();
    expect(() =>
      entitlementLedgerResponse({ ...value, total_pages: 1 }, 42, 2),
    ).toThrow();
    expect(() =>
      entitlementLedgerResponse(
        {
          ...value,
          subscription: { ...subscription, entitlements: undefined },
        },
        42,
        2,
      ),
    ).toThrow();
  });
});

import { api, ApiError } from "../../../api/client";
import type {
  PackageEntitlement,
  PackageEntitlementEntry,
  Subscription,
} from "./contracts";

export type EntitlementKind = "opening" | "use" | "reversal";
export type EntitlementAttempt = {
  subscriptionId: number;
  serviceId: number;
  quantity: number;
  body: {
    readonly entitlement: Readonly<{
      kind: EntitlementKind;
      service_id?: number;
      quantity?: number;
      reversed_entry_id?: number;
      source_reference: string;
      request_key: string;
    }>;
  };
};

export function entitlementActionAllowed(
  subscription: Subscription,
  balance: PackageEntitlement,
  canWrite: boolean,
  kind: EntitlementKind,
) {
  if (
    !canWrite ||
    subscription.terms.renewal === "automatic" ||
    balance.frequency !== "term"
  )
    return false;
  if (kind === "reversal") return true;
  if (subscription.state !== "active") return false;
  return kind === "opening"
    ? balance.status === "not_recorded" && balance.remaining_quantity === null
    : balance.can_use &&
        balance.status === "available" &&
        balance.remaining_quantity !== null &&
        balance.remaining_quantity > 0;
}

export function createEntitlementAttempt(
  subscription: Subscription,
  balance: PackageEntitlement,
  canWrite: boolean,
  kind: EntitlementKind,
  quantity: string,
  sourceReference: string,
  original?: PackageEntitlementEntry,
  requestKey: string = crypto.randomUUID(),
): EntitlementAttempt {
  if (!entitlementActionAllowed(subscription, balance, canWrite, kind))
    throw new Error("This package action is not currently available.");
  const source_reference = sourceReference.trim();
  if (!source_reference || source_reference.length > 160)
    throw new Error("Enter a source reference of at most 160 characters.");
  let fields: {
    service_id?: number;
    quantity?: number;
    reversed_entry_id?: number;
  };
  if (kind === "reversal") {
    if (
      !original ||
      original.kind !== "use" ||
      original.service_id !== balance.service_id
    )
      throw new Error("Select the exact recorded use to reverse.");
    fields = { reversed_entry_id: original.id };
  } else {
    const units = Number(quantity);
    const maximum =
      kind === "opening"
        ? balance.purchased_quantity
        : balance.remaining_quantity!;
    if (
      !/^\d+$/.test(quantity) ||
      !Number.isSafeInteger(units) ||
      units < (kind === "opening" ? 0 : 1) ||
      units > maximum
    )
      throw new Error(
        `Enter whole units between ${kind === "opening" ? 0 : 1} and ${maximum}.`,
      );
    fields = { service_id: balance.service_id, quantity: units };
  }
  return Object.freeze({
    subscriptionId: subscription.id,
    serviceId: balance.service_id,
    quantity: original?.quantity ?? fields.quantity!,
    body: Object.freeze({
      entitlement: Object.freeze({
        kind,
        ...fields,
        source_reference,
        request_key: requestKey,
      }),
    }),
  });
}

export function entitlementOutcomeUnknown(reason: unknown) {
  return (
    !(reason instanceof ApiError) ||
    reason.status === 408 ||
    reason.status >= 500 ||
    reason.code === "outcome_unconfirmed"
  );
}

export function entitlementAttemptAfterFailure(
  attempt: EntitlementAttempt,
  reason: unknown,
  previouslyUnconfirmed: EntitlementAttempt | null = null,
) {
  // A retry denial says nothing about whether the earlier request committed.
  // Only an owned successful response or reconciliation may resolve that request.
  return (
    previouslyUnconfirmed ??
    (entitlementOutcomeUnknown(reason) ? attempt : null)
  );
}

export function entitlementResponse(
  value: unknown,
  attempt: EntitlementAttempt,
): { entry: PackageEntitlementEntry; subscription: Subscription } {
  const response = value as {
    entry?: PackageEntitlementEntry;
    subscription?: Subscription;
  } | null;
  const expected = attempt.body.entitlement;
  const entry = response?.entry;
  const subscription = response?.subscription;
  if (
    !entry ||
    !Number.isSafeInteger(entry.id) ||
    entry.id <= 0 ||
    entry.kind !== expected.kind ||
    entry.source_reference !== expected.source_reference ||
    entry.service_id !== attempt.serviceId ||
    entry.quantity !== attempt.quantity ||
    (expected.kind === "reversal"
      ? entry.reversed_entry_id !== expected.reversed_entry_id
      : entry.service_id !== expected.service_id ||
        entry.quantity !== expected.quantity) ||
    !subscription ||
    subscription.id !== attempt.subscriptionId ||
    typeof subscription.state !== "string" ||
    !Array.isArray(subscription.entitlements)
  ) {
    throw new Error(
      "The package action response did not confirm this exact request. Retry the same action.",
    );
  }
  return { entry, subscription };
}

export async function submitEntitlementAttempt(
  attempt: EntitlementAttempt,
  request: (
    path: string,
    options: { method: "POST"; body: EntitlementAttempt["body"] },
  ) => Promise<unknown> = api,
) {
  const value = await request(
    `/api/clinic/subscriptions/${attempt.subscriptionId}/entitlement`,
    { method: "POST", body: attempt.body },
  );
  return entitlementResponse(value, attempt);
}

export type EntitlementLedger = {
  subscription: Subscription;
  entries: PackageEntitlementEntry[];
  page: number;
  per_page: number;
  total_count: number;
  total_pages: number;
};

export function entitlementLedgerResponse(
  value: unknown,
  subscriptionId: number,
  page: number,
): EntitlementLedger {
  const response = value as EntitlementLedger | null;
  if (
    !response ||
    response.subscription?.id !== subscriptionId ||
    typeof response.subscription.state !== "string" ||
    !response.subscription.terms ||
    !Array.isArray(response.subscription.entitlements) ||
    !Array.isArray(response.entries) ||
    response.page !== page ||
    response.per_page !== 50 ||
    !Number.isSafeInteger(response.total_count) ||
    response.total_count < 0 ||
    response.total_pages !== Math.ceil(response.total_count / 50)
  ) {
    throw new Error(
      "Package records did not match this membership and page. Refresh before recording an action.",
    );
  }
  return response;
}

import { api, ApiError } from "../../api/client";
import { offeringImportFields } from "./offeringTextImportModel";
import type { OfferingTextBatchItem } from "./offeringTextBatchModel";

export type BatchContext = {
  actor_id: number;
  actor_membership_id: number;
  practice_id: number;
  site_id: number | null;
  authorization_generation: number;
};
export type SavedTextBatch = {
  request_key: string;
  created_at: string;
  context: BatchContext;
  source: { practiceId: number; digest: string; generatedAt: string };
  items: (OfferingTextBatchItem & {
    retryPermitted?: boolean;
    receiptId?: number;
    receiptCheckedAt?: string;
  })[];
  retention_policy: string;
};
export type BatchCatalog = {
  context: BatchContext;
  capped: boolean;
  batches: Pick<SavedTextBatch, "request_key" | "created_at" | "source">[];
};
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
};
const identity = (item: OfferingTextBatchItem) =>
  JSON.stringify(
    canonical([item.attempt.method, item.attempt.path, item.attempt.body]),
  );
export function validateSavedTextBatch(
  value: SavedTextBatch,
  context: BatchContext,
  expected?: { key: string; items: OfferingTextBatchItem[] },
) {
  const valid =
    value &&
    value.request_key &&
    JSON.stringify(canonical(value.context)) ===
      JSON.stringify(canonical(context)) &&
    (!expected ||
      (value.request_key === expected.key &&
        value.items?.length === expected.items.length)) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.length <= 500 &&
    value.items.every(
      (item, index) =>
        item.plan &&
        item.attempt?.method === "PATCH" &&
        item.attempt.path ===
          `/api/clinic/service_offerings/${item.plan.targetId}` &&
        ["ready", "unknown", "failed", "applied"].includes(item.status) &&
        item.plan.changes.length > 0 &&
        item.plan.changes.every((change) =>
          Object.hasOwn(offeringImportFields, change.field),
        ) &&
        Number.isSafeInteger(item.plan.targetId) &&
        item.plan.targetId > 0 &&
        Number.isSafeInteger(item.plan.expectedVersion) &&
        item.plan.expectedVersion >= 0 &&
        item.plan.sourcePracticeId === value.source.practiceId &&
        item.plan.sourceDigest === value.source.digest &&
        Object.keys(item.plan.attributes).length === item.plan.changes.length &&
        item.plan.changes.every(
          (change) =>
            typeof change.after === "string" &&
            item.plan.attributes[change.field] === change.after,
        ) &&
        JSON.stringify(Object.keys(item.attempt.body).sort()) ===
          JSON.stringify(["service_offering"]) &&
        Object.keys(item.attempt.body.service_offering).length ===
          item.plan.changes.length + 2 &&
        item.attempt.body.service_offering.lock_version ===
          item.plan.expectedVersion &&
        item.plan.changes.every(
          (change) =>
            item.attempt.body.service_offering[change.field] === change.after,
        ) &&
        typeof item.attempt.body.service_offering.request_key === "string" &&
        (!expected || identity(item) === identity(expected.items[index])),
    );
  if (!valid)
    throw new ApiError(
      502,
      "The original saved batch identity could not be confirmed.",
      "outcome_unconfirmed",
    );
  return value;
}
export async function readSavedTextBatch(key: string, context: BatchContext) {
  const batch = validateSavedTextBatch(
    await api<SavedTextBatch>(
      `/api/clinic/offering_text_batches/${encodeURIComponent(key)}`,
    ),
    context,
  );
  // Reload never grants an exact repeat from a stale preparation flag. The
  // operator must explicitly reconcile current receipts in this session.
  return {
    ...batch,
    items: batch.items.map((item) =>
      item.status === "unknown" ? { ...item, retryPermitted: false } : item,
    ),
  };
}
export async function changeSavedTextBatch(
  batch: SavedTextBatch,
  index: number,
  operation: "prepare" | "apply" | "reconcile",
) {
  return validateSavedTextBatch(
    await api<SavedTextBatch>(
      `/api/clinic/offering_text_batches/${encodeURIComponent(batch.request_key)}/items/${index}/${operation}`,
      {
        method: "POST",
        body: { context: batch.context },
      },
    ),
    batch.context,
    { key: batch.request_key, items: batch.items },
  );
}

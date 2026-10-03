import { api, ApiError } from "../../api/client";
import {
  offeringMappedFields,
  offeringMappedValueValid,
  offeringReferenceGroups,
  type OfferingReferenceField,
} from "./offeringFieldImportModel";
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
  const same = (left: unknown, right: unknown) =>
    JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  const positive = (id: unknown) => Number.isSafeInteger(id) && Number(id) > 0;
  const valid =
    value &&
    typeof value.request_key === "string" &&
    !!value.request_key.trim() &&
    same(value.context, context) &&
    value.source &&
    positive(value.source.practiceId) &&
    typeof value.source.digest === "string" &&
    /^[a-f0-9]{64}$/.test(value.source.digest) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.length <= 500 &&
    (!expected ||
      (value.request_key === expected.key &&
        value.items.length === expected.items.length)) &&
    new Set(value.items.map((item) => item.plan?.targetId)).size ===
      value.items.length &&
    new Set(value.items.map((item) => item.plan?.sourceOfferingId)).size ===
      value.items.length &&
    new Set(
      value.items.map(
        (item) => item.attempt?.body?.service_offering?.request_key,
      ),
    ).size === value.items.length &&
    value.items.every((item, index) => {
      const plan = item.plan;
      const attempt = item.attempt;
      if (
        !plan ||
        !attempt ||
        attempt.method !== "PATCH" ||
        attempt.path !== `/api/clinic/service_offerings/${plan.targetId}` ||
        !["ready", "unknown", "failed", "applied"].includes(item.status) ||
        (item.rolledBack !== undefined &&
          typeof item.rolledBack !== "boolean") ||
        (item.rolledBack === true && item.status !== "applied") ||
        !positive(plan.targetId) ||
        !positive(plan.sourceOfferingId) ||
        !Number.isSafeInteger(plan.expectedVersion) ||
        plan.expectedVersion < 0 ||
        plan.sourcePracticeId !== value.source.practiceId ||
        plan.sourceDigest !== value.source.digest ||
        !Array.isArray(plan.changes) ||
        !plan.changes.length ||
        !plan.attributes ||
        new Set(plan.changes.map((change) => change.field)).size !==
          plan.changes.length ||
        Object.keys(plan.attributes).length !== plan.changes.length ||
        !attempt.body ||
        !same(Object.keys(attempt.body), ["service_offering"]) ||
        !attempt.body.service_offering ||
        Object.keys(attempt.body.service_offering).length !==
          plan.changes.length + 2 ||
        attempt.body.service_offering.lock_version !== plan.expectedVersion ||
        typeof attempt.body.service_offering.request_key !== "string" ||
        !attempt.body.service_offering.request_key.trim()
      )
        return false;
      const mappings = plan.referenceMappings ?? [];
      if (
        !Array.isArray(mappings) ||
        mappings.some(
          (mapping) =>
            !Object.hasOwn(offeringReferenceGroups, mapping.field) ||
            !positive(mapping.sourceId) ||
            !positive(mapping.targetId),
        ) ||
        new Set(
          mappings.map((mapping) => `${mapping.field}:${mapping.sourceId}`),
        ).size !== mappings.length ||
        mappings.some(
          (mapping) =>
            !plan.changes.some((change) => change.field === mapping.field),
        )
      )
        return false;
      if (
        !plan.changes.every((change) => {
          if (
            !Object.hasOwn(offeringMappedFields, change.field) ||
            !offeringMappedValueValid(change.field, change.after) ||
            !same(plan.attributes[change.field], change.after) ||
            !same(attempt.body.service_offering[change.field], change.after) ||
            !Object.hasOwn(change, "before") ||
            same(change.before, change.after) ||
            Object.keys(change).some(
              (key) =>
                ![
                  "field",
                  "before",
                  "after",
                  "sourceValue",
                  "beforeLabel",
                  "afterLabel",
                ].includes(key),
            )
          )
            return false;
          const kind = offeringMappedFields[change.field].kind;
          if (
            change.before !== null &&
            ((kind === "text" && typeof change.before !== "string") ||
              (kind === "boolean" && typeof change.before !== "boolean") ||
              (kind === "number" && !Number.isSafeInteger(change.before)) ||
              (kind === "enum" &&
                !["in_person", "video", "either"].includes(
                  String(change.before),
                )) ||
              (kind === "reference" &&
                (change.field === "site_ids" || change.field === "clinician_ids"
                  ? !Array.isArray(change.before) ||
                    !change.before.every(positive) ||
                    new Set(change.before).size !== change.before.length
                  : !positive(change.before))))
          )
            return false;
          if (offeringMappedFields[change.field].kind !== "reference")
            return true;
          const sourceIds = Array.isArray(change.sourceValue)
            ? change.sourceValue
            : [change.sourceValue];
          const destinationIds = Array.isArray(change.after)
            ? change.after
            : [change.after];
          if (
            (change.field === "site_ids" || change.field === "clinician_ids"
              ? !Array.isArray(change.sourceValue)
              : Array.isArray(change.sourceValue)) ||
            !sourceIds.length ||
            sourceIds.length !== destinationIds.length ||
            !sourceIds.every(positive) ||
            new Set(sourceIds).size !== sourceIds.length ||
            sourceIds.some(
              (id, offset) =>
                offset > 0 && Number(sourceIds[offset - 1]) >= Number(id),
            ) ||
            typeof change.beforeLabel !== "string" ||
            typeof change.afterLabel !== "string"
          )
            return false;
          const field = change.field as OfferingReferenceField;
          const fieldMappings = mappings.filter(
            (mapping) => mapping.field === field,
          );
          return (
            fieldMappings.length === sourceIds.length &&
            sourceIds.every((sourceId) =>
              fieldMappings.some((mapping) => mapping.sourceId === sourceId),
            ) &&
            same(
              fieldMappings
                .map((mapping) => mapping.targetId)
                .sort((a, b) => a - b),
              [...destinationIds].sort((a, b) => Number(a) - Number(b)),
            )
          );
        })
      )
        return false;
      return (
        !expected ||
        (identity(item) === identity(expected.items[index]) &&
          same(plan, expected.items[index].plan))
      );
    });
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
  operation: "prepare" | "apply" | "reconcile" | "rollback",
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

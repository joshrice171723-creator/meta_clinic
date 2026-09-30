import type { ConfigurationManifest } from "./configurationMapping";
import {
  offeringTextImportAttempt,
  offeringTextImportPlan,
  type OfferingImportField,
  type OfferingTextTarget,
} from "./offeringTextImportModel";

export type OfferingTextMapping = {
  targetId: number;
  sourceOfferingId: number;
  fields: OfferingImportField[];
};
export type OfferingTextBatchItem = {
  plan: ReturnType<typeof offeringTextImportPlan>;
  attempt: ReturnType<typeof offeringTextImportAttempt>;
  status: "ready" | "sending" | "applied" | "failed" | "unknown";
  message: string;
};

export function offeringTextBatchPlan(
  source: ConfigurationManifest,
  targets: OfferingTextTarget[],
  mappings: OfferingTextMapping[],
) {
  if (!mappings.length || mappings.length > 500)
    throw new Error("Select between 1 and 500 existing destination drafts.");
  if (
    new Set(targets.map((target) => target.id)).size !== targets.length ||
    new Set(targets.map((target) => target.practice_id)).size !== 1
  )
    throw new Error("Reload one destination clinic's offering list.");
  if (
    new Set(mappings.map((mapping) => mapping.targetId)).size !==
      mappings.length ||
    new Set(mappings.map((mapping) => mapping.sourceOfferingId)).size !==
      mappings.length
  )
    throw new Error(
      "Select each source and destination offering at most once. Consolidation is not supported.",
    );
  const plans = mappings.map((mapping) => {
    const target = targets.find((row) => row.id === mapping.targetId);
    if (!target)
      throw new Error(
        "Select an existing destination draft from the loaded list.",
      );
    return offeringTextImportPlan(
      source,
      mapping.sourceOfferingId,
      target,
      mapping.fields,
      targets
        .filter((row) => row.id !== target.id && row.code !== null)
        .map((row) => row.code!),
    );
  });
  const codes = plans.flatMap((plan) =>
    plan.attributes.code ? [plan.attributes.code] : [],
  );
  if (new Set(codes).size !== codes.length)
    throw new Error(
      "Selected destination codes collide with another item in this review.",
    );
  return plans;
}

// Allocate each exact request once at review time. Partial application never
// rebuilds requests from refreshed destinations or creates new retry keys.
export function offeringTextBatchItems(
  plans: ReturnType<typeof offeringTextBatchPlan>,
  requestKey: () => string,
): OfferingTextBatchItem[] {
  const keys = plans.map(() => requestKey());
  if (keys.some((key) => !key.trim()) || new Set(keys).size !== keys.length)
    throw new Error("Each reviewed item needs its own request identity.");
  return plans.map((plan, index) => ({
    plan,
    attempt: offeringTextImportAttempt(plan, keys[index]),
    status: "ready",
    message: "Not attempted",
  }));
}

export function offeringTextBatchFailure(
  previousStatus: OfferingTextBatchItem["status"],
  failure: { status: number; code?: string; message: string } | null,
): Pick<OfferingTextBatchItem, "status" | "message"> {
  const unknown =
    previousStatus === "unknown" ||
    !failure ||
    failure.status < 400 ||
    failure.status === 408 ||
    failure.status >= 500 ||
    failure.code === "outcome_unconfirmed" ||
    failure.code === "session_changed";
  return {
    status: unknown ? "unknown" : "failed",
    message:
      (unknown
        ? "Outcome unknown. Retain and retry this exact request."
        : "Change rejected. Close and reload before a new review.") +
      (failure ? ` ${failure.message}` : ""),
  };
}

export function offeringTextBatchSummary(items: OfferingTextBatchItem[]) {
  const applied = items.filter((item) => item.status === "applied").length;
  const unknown = items.filter((item) => item.status === "unknown").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const ready = items.filter((item) => item.status === "ready").length;
  const sending = items.filter((item) => item.status === "sending").length;
  return {
    applied,
    unknown,
    failed,
    ready,
    sending,
    complete: items.length > 0 && applied === items.length,
    canClose: !items.some(
      (item) => item.status === "unknown" || item.status === "sending",
    ),
  };
}

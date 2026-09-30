import {
  readMappingSource,
  type ConfigurationManifest,
} from "./configurationMapping";

export const offeringImportFields = {
  name: { label: "Offering name", maximum: 160 },
  code: { label: "Local offering code", maximum: 50 },
  contact_instructions: { label: "Contact instructions", maximum: 500 },
  referral_instructions: { label: "Referral instructions", maximum: 500 },
} as const;
export type OfferingImportField = keyof typeof offeringImportFields;
export type OfferingTextTarget = {
  id: number;
  practice_id: number;
  status: string;
  lock_version: number;
  name: string;
  code: string | null;
  contact_instructions: string | null;
  referral_instructions: string | null;
};

export function offeringTextImportPlan(
  saved: ConfigurationManifest,
  sourceOfferingId: number,
  target: OfferingTextTarget,
  fields: OfferingImportField[],
  reservedCodes: string[],
) {
  const source = readMappingSource(saved);
  if (source.configuration.practice.id === target.practice_id)
    throw new Error("Choose a snapshot from a different source clinic.");
  if (target.status !== "draft")
    throw new Error(
      "Text import is available only for an existing draft offering.",
    );
  if (
    !Number.isSafeInteger(target.practice_id) ||
    target.practice_id <= 0 ||
    !Number.isSafeInteger(target.id) ||
    target.id <= 0 ||
    !Number.isSafeInteger(target.lock_version) ||
    target.lock_version < 0
  )
    throw new Error("Reload the destination offering before importing text.");
  const offering = source.configuration.service_offerings.find(
    (row) => row.id === sourceOfferingId,
  );
  if (!offering) throw new Error("Select one source offering explicitly.");
  if (
    !fields.length ||
    new Set(fields).size !== fields.length ||
    fields.some((field) => !Object.hasOwn(offeringImportFields, field))
  )
    throw new Error("Select each supported text field once.");
  const changes = fields
    .map((field) => {
      const raw = offering[field];
      if (
        typeof raw !== "string" ||
        !raw.trim() ||
        [...raw.trim()].length > offeringImportFields[field].maximum
      )
        throw new Error(
          `${offeringImportFields[field].label}: the source needs nonempty text of at most ${offeringImportFields[field].maximum} characters. Missing values never clear destination text.`,
        );
      const after = raw.trim();
      if (field === "code" && reservedCodes.includes(after))
        throw new Error(
          "That local offering code is already used by another destination offering.",
        );
      return { field, before: target[field], after };
    })
    .filter((change) => change.before !== change.after);
  if (!changes.length)
    throw new Error("No selected text differs from this destination offering.");
  const attributes: Partial<Record<OfferingImportField, string>> =
    Object.fromEntries(changes.map((change) => [change.field, change.after]));
  return {
    sourcePracticeId: source.configuration.practice.id,
    sourceOfferingId: offering.id,
    sourceDigest: source.source_digest,
    targetId: target.id,
    expectedVersion: target.lock_version,
    changes,
    attributes,
  };
}

export function offeringTextImportAttempt(
  plan: ReturnType<typeof offeringTextImportPlan>,
  requestKey: string,
) {
  return {
    method: "PATCH" as const,
    path: `/api/clinic/service_offerings/${plan.targetId}`,
    body: {
      service_offering: {
        ...plan.attributes,
        request_key: requestKey,
        lock_version: plan.expectedVersion,
      },
    },
    success:
      "Selected source text was saved to this draft offering. Review the draft before publishing.",
  };
}

import {
  readMappingSource,
  type ConfigurationManifest,
  type ConfigurationRecord,
} from "./configurationMapping";
import {
  offeringImportFields,
  type OfferingTextTarget,
} from "./offeringTextImportModel";

export const offeringMappedFields = {
  name: { ...offeringImportFields.name, kind: "text" },
  code: { ...offeringImportFields.code, kind: "text" },
  contact_instructions: {
    ...offeringImportFields.contact_instructions,
    kind: "text",
  },
  referral_instructions: {
    ...offeringImportFields.referral_instructions,
    kind: "text",
  },
  description: { label: "Description", kind: "text", maximum: 500 },
  duration_minutes: { label: "Duration (minutes)", kind: "number" },
  modality: { label: "Modality", kind: "enum" },
  booking_required: { label: "Booking required", kind: "boolean" },
  requires_room: { label: "Room required", kind: "boolean" },
  public_visible: { label: "Public visibility", kind: "boolean" },
  visit_type_id: { label: "Visit type", kind: "reference" },
  billing_service_id: { label: "Billing service", kind: "reference" },
  site_ids: { label: "Eligible locations (replace list)", kind: "reference" },
  clinician_ids: {
    label: "Eligible clinicians (replace list)",
    kind: "reference",
  },
} as const;
export type OfferingMappedField = keyof typeof offeringMappedFields;
export type OfferingMappedValue = string | number | boolean | number[];
export type OfferingReferenceField =
  "visit_type_id" | "billing_service_id" | "site_ids" | "clinician_ids";
export type OfferingReferenceMapping = {
  field: OfferingReferenceField;
  sourceId: number;
  targetId: number;
};
export type OfferingReferenceCatalog = {
  visit_types: { id: number; label: string }[];
  billing_services: { id: number; label: string }[];
  sites: { id: number; label: string }[];
  clinicians: { id: number; label: string }[];
  billing_available: boolean;
  excluded?: string[];
};
export type OfferingMappedTarget = OfferingTextTarget & {
  description?: string | null;
  duration_minutes?: number | null;
  modality?: string;
  booking_required?: boolean;
  requires_room?: boolean;
  public_visible?: boolean;
  visit_type_id?: number | null;
  billing_service_id?: number | null;
  eligible_site_ids?: number[];
  eligible_clinician_ids?: number[];
  site_ids?: number[];
  clinician_ids?: number[];
};
export type OfferingFieldPlan = {
  sourcePracticeId: number;
  sourceOfferingId: number;
  sourceDigest: string;
  targetId: number;
  expectedVersion: number;
  changes: {
    field: OfferingMappedField;
    before: OfferingMappedValue | null;
    after: OfferingMappedValue;
    sourceValue?: OfferingMappedValue;
    beforeLabel?: string;
    afterLabel?: string;
  }[];
  attributes: Partial<Record<OfferingMappedField, OfferingMappedValue>>;
  referenceMappings?: OfferingReferenceMapping[];
};
const positive = (id: unknown): id is number =>
  Number.isSafeInteger(id) && Number(id) > 0;
export const offeringReferenceGroups = {
  visit_type_id: "visit_types",
  billing_service_id: "billing_services",
  site_ids: "sites",
  clinician_ids: "clinicians",
} as const;
export function offeringReferenceSourceIds(
  row: ConfigurationRecord,
  field: OfferingMappedField,
): number[] {
  if (!Object.hasOwn(offeringReferenceGroups, field)) return [];
  const value = row[field];
  const ids =
    field === "site_ids" || field === "clinician_ids" ? value : [value];
  return Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every(positive) &&
    new Set(ids).size === ids.length
    ? [...ids].sort((a, b) => a - b)
    : [];
}
export function offeringMappedCurrentValue(
  target: OfferingMappedTarget,
  field: OfferingMappedField,
): OfferingMappedValue | null | undefined {
  if (field === "site_ids" || field === "clinician_ids") {
    const ids =
      field === "site_ids"
        ? (target.eligible_site_ids ?? target.site_ids)
        : (target.eligible_clinician_ids ?? target.clinician_ids);
    return ids ? [...ids].sort((a, b) => a - b) : undefined;
  }
  return target[field];
}
export function offeringMappedValueLabel(
  value: OfferingMappedValue | null | undefined,
  field: OfferingMappedField,
  catalog?: OfferingReferenceCatalog,
): string {
  if (value === undefined) return "Unavailable";
  if (value === null) return "Not configured";
  if (Object.hasOwn(offeringReferenceGroups, field)) {
    const rows =
      catalog?.[offeringReferenceGroups[field as OfferingReferenceField]] ?? [];
    const label = (id: number) =>
      `${rows.find((row) => row.id === id)?.label ?? "Unlisted reference"} (#${id})`;
    return Array.isArray(value)
      ? value.length
        ? value.map(label).join(", ")
        : "Empty list (all clinicians when applicable)"
      : label(Number(value));
  }
  return typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
}
export function offeringMappedValueValid(
  field: OfferingMappedField,
  value: unknown,
): value is OfferingMappedValue {
  const specification = offeringMappedFields[field];
  if (!specification) return false;
  if (specification.kind === "text")
    return (
      typeof value === "string" &&
      !!value.trim() &&
      value === value.trim() &&
      [...value].length <= specification.maximum
    );
  if (specification.kind === "number")
    return (
      Number.isSafeInteger(value) && Number(value) >= 5 && Number(value) <= 1440
    );
  if (specification.kind === "boolean") return typeof value === "boolean";
  if (specification.kind === "enum")
    return (
      typeof value === "string" &&
      ["in_person", "video", "either"].includes(value)
    );
  if (
    specification.kind === "reference" &&
    field !== "site_ids" &&
    field !== "clinician_ids"
  )
    return positive(value);
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(positive) &&
    value.every((id, index) => index === 0 || value[index - 1] < id)
  );
}
export function offeringFieldImportPlan(
  saved: ConfigurationManifest,
  sourceOfferingId: number,
  target: OfferingMappedTarget,
  fields: OfferingMappedField[],
  reservedCodes: string[],
  referenceMappings: OfferingReferenceMapping[] = [],
  catalog?: OfferingReferenceCatalog,
): OfferingFieldPlan {
  const source = readMappingSource(saved);
  if (source.configuration.practice.id === target.practice_id)
    throw new Error("Choose a snapshot from a different source clinic.");
  if (
    target.status !== "draft" ||
    !positive(target.id) ||
    !positive(target.practice_id) ||
    !Number.isSafeInteger(target.lock_version) ||
    target.lock_version < 0
  )
    throw new Error("Reload an existing destination draft before import.");
  const row = source.configuration.service_offerings.find(
    (record) => record.id === sourceOfferingId,
  );
  if (!row) throw new Error("Select one source offering explicitly.");
  if (
    !fields.length ||
    new Set(fields).size !== fields.length ||
    fields.some((field) => !Object.hasOwn(offeringMappedFields, field))
  )
    throw new Error("Select each supported field once.");
  const selectedReferences: OfferingReferenceMapping[] = [];
  const changes = fields
    .map((field) => {
      const spec = offeringMappedFields[field];
      const before = offeringMappedCurrentValue(target, field);
      if (before === undefined)
        throw new Error(
          `${spec.label}: reload the complete destination value before preview.`,
        );
      const raw = row[field];
      let after: unknown =
        spec.kind === "text" && typeof raw === "string" ? raw.trim() : raw;
      if (spec.kind === "reference") {
        const referenceField = field as OfferingReferenceField;
        if (
          !catalog ||
          (field === "billing_service_id" && !catalog.billing_available)
        )
          throw new Error(
            `${spec.label}: authorized destination catalog is unavailable.`,
          );
        const ids = offeringReferenceSourceIds(row, field);
        if (!ids.length)
          throw new Error(
            `${spec.label}: source references must be explicit nonempty positive IDs. Clearing and all-clinician defaults are excluded.`,
          );
        const destinationIds = ids.map((sourceId) => {
          const matches = referenceMappings.filter(
            (mapping) =>
              mapping.field === field && mapping.sourceId === sourceId,
          );
          if (
            matches.length !== 1 ||
            !positive(matches[0].targetId) ||
            !catalog[offeringReferenceGroups[referenceField]].some(
              (entry) => entry.id === matches[0].targetId,
            )
          )
            throw new Error(
              `${spec.label}: explicitly map source #${sourceId} to one existing authorized destination reference.`,
            );
          selectedReferences.push(matches[0]);
          return matches[0].targetId;
        });
        if (new Set(destinationIds).size !== destinationIds.length)
          throw new Error(
            `${spec.label}: reference consolidation is excluded.`,
          );
        after =
          field === "site_ids" || field === "clinician_ids"
            ? [...destinationIds].sort((a, b) => a - b)
            : destinationIds[0];
      }
      if (!offeringMappedValueValid(field, after))
        throw new Error(
          `${spec.label}: source value is missing or outside the existing draft update contract.`,
        );
      if (field === "code" && reservedCodes.includes(String(after)))
        throw new Error(
          "That local offering code is already used by another destination offering.",
        );
      return {
        field,
        before,
        after,
        ...(spec.kind === "reference"
          ? {
              sourceValue: (field === "site_ids" || field === "clinician_ids"
                ? offeringReferenceSourceIds(row, field)
                : raw) as OfferingMappedValue,
              beforeLabel: offeringMappedValueLabel(before, field, catalog),
              afterLabel: offeringMappedValueLabel(after, field, catalog),
            }
          : {}),
      };
    })
    .filter(
      (change) =>
        JSON.stringify(change.before) !== JSON.stringify(change.after),
    );
  if (!changes.length)
    throw new Error(
      "No selected field differs from this destination offering.",
    );
  if (
    referenceMappings.some((mapping) => !selectedReferences.includes(mapping))
  )
    throw new Error(
      "Remove reference mappings that are not explicitly selected by this plan.",
    );
  return {
    sourcePracticeId: source.configuration.practice.id,
    sourceOfferingId: row.id,
    sourceDigest: source.source_digest,
    targetId: target.id,
    expectedVersion: target.lock_version,
    changes,
    attributes: Object.fromEntries(
      changes.map((change) => [change.field, change.after]),
    ),
    referenceMappings: selectedReferences.filter((mapping) =>
      changes.some((change) => change.field === mapping.field),
    ),
  };
}
export function offeringFieldImportAttempt(
  plan: OfferingFieldPlan,
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
      "Selected mapped fields were saved to this draft offering. Review the draft before publishing.",
  };
}

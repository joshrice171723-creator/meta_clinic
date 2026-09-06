import type { CatalogItem, PackageTerms } from "./contracts";

/** Presentation of unsaved fields only. Validation and totals belong to Rails. */
export function draftMembershipTerms(
  edit: {
    id?: number;
    name: string;
    family_id?: number;
    draft?: Partial<PackageTerms>;
  },
  families: CatalogItem[],
  services: CatalogItem[],
): PackageTerms {
  const draft = edit.draft || {};
  return {
    family_id: edit.family_id || 0,
    family_name:
      families.find((family) => family.id === edit.family_id)?.name || "",
    package_id: edit.id || 0,
    package_name: edit.name,
    description: draft.description || "",
    tier: draft.tier || "",
    amount: draft.amount || "",
    currency: "USD",
    duration: draft.duration ?? 1,
    duration_unit: draft.duration_unit || "months",
    renewal: draft.renewal || "none",
    cancellation: draft.cancellation || "immediate",
    refund_policy: draft.refund_policy || "manual_review",
    terms: draft.terms || "",
    eligibility_review: draft.eligibility_review || false,
    max_per_patient: draft.max_per_patient ?? 1,
    available_from: draft.available_from || null,
    available_until: draft.available_until || null,
    display_order: draft.display_order ?? 0,
    components: (draft.components || []).map((component) => {
      const service = services.find(
        (service) => service.id === component.service_id,
      );
      return {
        ...component,
        name: service?.name || "",
        description: service?.description || "",
        min: component.mode === "choose_one" ? 1 : component.min,
        max: component.mode === "choose_one" ? 1 : component.max,
        price_adjustment:
          component.mode === "included" ? "0" : component.price_adjustment,
      };
    }),
  };
}

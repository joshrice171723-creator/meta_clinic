import type { PackageTerms } from "../clinic/subscriptions/contracts";

export function patientPortalLabel(value: string) {
  const cleaned = value
    .replace(/\bdev\s+seed\s*/gi, "")
    .replace(/\bsynthetic\s*/gi, "")
    .replace(/\bSYN[_-]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned ? `${cleaned[0].toUpperCase()}${cleaned.slice(1)}` : cleaned;
}

export function patientPortalTerms(terms: PackageTerms): PackageTerms {
  const presentComponent = (component: PackageTerms["components"][number]) => ({
    ...component,
    name: patientPortalLabel(component.name),
    description: patientPortalLabel(component.description),
    group: patientPortalLabel(component.group),
  });
  return {
    ...terms,
    family_name: patientPortalLabel(terms.family_name),
    package_name: patientPortalLabel(terms.package_name),
    description: patientPortalLabel(terms.description),
    terms: patientPortalLabel(terms.terms),
    components: terms.components.map(presentComponent),
    selected_components: terms.selected_components?.map(presentComponent),
  };
}

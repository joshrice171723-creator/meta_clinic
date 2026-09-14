export function requiresLocationSelection(
  sites: readonly { id: number }[],
  selectionMade: boolean,
) {
  return sites.length > 1 && !selectionMade;
}

export function canLoadClinicOverview(
  sites: readonly { id: number }[] | undefined,
  selectionMade: boolean,
  overviewRequired = true,
) {
  return overviewRequired && !!sites && !requiresLocationSelection(sites, selectionMade);
}

export function clinicOverviewRequired(path: string) {
  return path === "/clinic/operations" || path.startsWith("/clinic/inventory");
}

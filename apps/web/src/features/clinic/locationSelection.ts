export function requiresLocationSelection(
  sites: readonly { id: number }[],
  selectionMade: boolean,
) {
  return sites.length > 1 && !selectionMade;
}

export function canLoadClinicOverview(
  sites: readonly { id: number }[] | undefined,
  selectionMade: boolean,
) {
  return !!sites && !requiresLocationSelection(sites, selectionMade);
}

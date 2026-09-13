export function requiresLocationSelection(
  sites: readonly { id: number }[],
  selectionMade: boolean,
) {
  return sites.length > 1 && !selectionMade;
}

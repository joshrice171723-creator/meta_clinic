const instructionalDescriptions = new Set([
  "Example catalog for learning the subscription editor.",
  "A configurable catalog for the local subscription walkthrough.",
]);

export function catalogDisplayLabel(value: string) {
  return value.replace(/^dev\s+seed\s+/i, "").trim();
}

export function catalogDisplayDescription(value: string) {
  const cleaned = catalogDisplayLabel(value);
  return instructionalDescriptions.has(cleaned) ? "" : cleaned;
}

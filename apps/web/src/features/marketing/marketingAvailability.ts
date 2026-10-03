// These specialty workflows are not built. Keep their drafts out of public
// routes and discovery until there is implementation evidence to review.
const unavailableSpecialties = new Set([
  "hormone-health",
  "hormone-therapy",
  "rehabilitation-pt",
  "physical-therapy",
  "aesthetics",
  "med-spa",
  "infusion",
  "iv-therapy",
]);

const unavailableRelatedPages = new Set([
  "/longevity/hormone-management",
  "/mens-health/hormone-management",
  "/mens-health/testosterone-management",
  "/mens-health/trt",
  "/mens-health/trt-workflows",
  "/resources/guides/infusion-chair-scheduling",
  "/resources/guides/infusion-inventory-management",
  "/resources/templates/infusion-treatment-schedule",
  "/resources/guides/start-a-trt-clinic",
  "/resources/guides/trt-patient-intake",
  "/resources/templates/trt-intake-form",
]);

export function isUnavailableMarketingPath(path: string): boolean {
  const internalPath = path
    .split(/[?#]/, 1)[0]
    .replace(/^\/meta-clinic(?=\/|$)/, "")
    .replace(/\/$/, "");
  return (
    unavailableSpecialties.has(internalPath.split("/")[1]) ||
    unavailableRelatedPages.has(internalPath)
  );
}

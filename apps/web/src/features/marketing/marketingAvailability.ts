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

// Consolidated pages keep a useful destination; they do not hide app capabilities.
// Insurance's available capture only demonstrates disabled configuration. AI and
// integration leaf drafts repeated evaluation prompts, so their factual parent
// now owns the current scope rather than advertising separate capabilities.
export function marketingReplacement(path: string): string | undefined {
  const internal = path
    .split(/[?#]/, 1)[0]
    .replace(/^\/meta-clinic(?=\/|$)/, "")
    .replace(/\/$/, "");
  if (["/demo", "/sandbox", "/try"].includes(internal)) return "/demo";
  if (
    /(?:^|\/)(?:optional-insurance|insurance|insurance-verification|benefits-verification|prior-authorization)$/.test(
      internal,
    )
  )
    return "/meta-clinic/features/cash-billing";
  if (["/company", "/founder"].includes(internal)) return "/meta-clinic/about";
  if (
    internal.startsWith("/security/") ||
    ["/legal/hipaa", "/legal/baa"].includes(internal)
  )
    return "/meta-clinic/security";
  if (internal.startsWith("/ai/")) return "/meta-clinic/ai";
  if (internal.startsWith("/integrations/")) return "/meta-clinic/integrations";
  return undefined;
}

export function isUnavailableMarketingPath(path: string): boolean {
  const internalPath = path
    .split(/[?#]/, 1)[0]
    .replace(/^\/meta-clinic(?=\/|$)/, "")
    .replace(/\/$/, "");
  return (
    Boolean(marketingReplacement(path)) ||
    unavailableSpecialties.has(internalPath.split("/")[1]) ||
    unavailableRelatedPages.has(internalPath)
  );
}

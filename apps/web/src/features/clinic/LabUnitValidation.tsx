import { Typography } from "@mui/material";

export type LabUnitValidationReceipt = {
  status: "configured_match" | "unconfigured" | "unmapped" | "not_applicable";
  configuration_revision: number;
  dimension: string | null;
};
export function LabUnitValidation({ receipt, valueKind }: { receipt?: LabUnitValidationReceipt | null; valueKind?: string }) {
  if (receipt?.status === "not_applicable" || (!receipt && valueKind && !["numeric", "range"].includes(valueKind))) return null;
  const label = receipt?.status === "configured_match"
    ? `Matched clinic unit declaration · dimension: ${receipt.dimension} · configuration revision ${receipt.configuration_revision}`
    : receipt?.status === "unmapped" ? "Unit/dimension compatibility unvalidated: no configured mapping for this test."
    : receipt?.status === "unconfigured" ? "Unit/dimension compatibility unvalidated: clinic mappings were unconfigured."
    : "Unit/dimension compatibility not recorded for this version.";
  return <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>;
}

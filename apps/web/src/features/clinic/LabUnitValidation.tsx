import { Typography } from "@mui/material";

export type LabUnitValidationReceipt = {
  status: "configured_match" | "dimensionally_validated" | "configuration_incomplete" | "unconfigured" | "unmapped" | "not_applicable";
  configuration_revision: number;
  dimension: string | null;
  expected_dimension_unit?: string | null;
  dimension_vector?: Record<string, number> | null;
  validation_engine?: string | null;
};
export function LabUnitValidation({ receipt, valueKind }: { receipt?: LabUnitValidationReceipt | null; valueKind?: string }) {
  if (receipt?.status === "not_applicable" || (!receipt && valueKind && !["numeric", "range"].includes(valueKind))) return null;
  const label = receipt?.status === "dimensionally_validated" && receipt.validation_engine === "ucum-2.2-linear-dimensions-v1"
    ? `UCUM linear dimensions matched expected reference ${receipt.expected_dimension_unit} · clinic description: ${receipt.dimension} · configuration revision ${receipt.configuration_revision}`
    : receipt?.status === "configuration_incomplete" || receipt?.status === "configured_match"
      ? "Unit/dimension compatibility unvalidated: this configuration or historical receipt has only a supplied-label membership check."
    : receipt?.status === "unmapped" ? "Unit/dimension compatibility unvalidated: no configured mapping for this test."
    : receipt?.status === "unconfigured" ? "Unit/dimension compatibility unvalidated: clinic mappings were unconfigured."
    : "Unit/dimension compatibility not recorded for this version.";
  return <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label}</Typography>;
}

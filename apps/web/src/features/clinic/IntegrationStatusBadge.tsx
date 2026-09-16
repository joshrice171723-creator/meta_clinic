import { Chip } from "@mui/material";

export type IntegrationStatus =
  "configured" | "simulated" | "unavailable" | "live";

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  configured: "Configured",
  simulated: "Simulated",
  unavailable: "Unavailable",
  live: "Live",
};

const STATUS_COLORS: Record<
  IntegrationStatus,
  "default" | "success" | "warning" | "error"
> = {
  configured: "success",
  simulated: "warning",
  unavailable: "default",
  live: "success",
};

export function IntegrationStatusBadge({
  status,
  label,
}: {
  status: IntegrationStatus;
  label?: string;
}) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={STATUS_COLORS[status]}
      label={label ?? STATUS_LABELS[status]}
      data-integration-status={status}
    />
  );
}

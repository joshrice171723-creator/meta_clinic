import { Alert, Button, Chip, Divider, Stack, Typography } from "@mui/material";
import type { ClinicCapabilities } from "../../api/contracts";
import { Card } from "../../shared/ui";

type ReportDestination = {
  title: string;
  href: string;
  action: string;
  available: boolean;
  source: string;
  freshness: string;
  permission: string;
};

function destinations(capabilities: ClinicCapabilities): ReportDestination[] {
  const payrollAccess =
    capabilities.workforce_payroll_export === true ||
    capabilities.workforce_payroll_configure === true;
  return [
    {
      title: "Invoice ledger",
      href: "/clinic/billing",
      action: "Open billing ledger",
      available: capabilities.billing_read === true,
      source: "Posted invoices, payments, balances, and collection records.",
      freshness: "The billing workspace reloads server records when opened.",
      permission:
        "Requires billing read access. Payment and refund actions have separate permissions.",
    },
    {
      title: "Inventory movement ledger",
      href: "/clinic/inventory/activity",
      action: "Open movement ledger",
      available: capabilities.inventory === true,
      source: "Posted stock movements with their recorded source and operator.",
      freshness:
        "The inventory workspace reloads the server ledger when opened.",
      permission:
        "Requires inventory access. This view does not grant stock-changing actions.",
    },
    {
      title: "Payroll exports",
      href: "/clinic/workforce/payroll",
      action: "Open payroll exports",
      available: payrollAccess,
      source:
        "Approved timecard versions for the selected site and saved export configuration.",
      freshness:
        "Preview uses current eligible records; generated batches retain a source digest.",
      permission:
        capabilities.workforce_payroll_export === true
          ? "Payroll export access is enabled. Configuration remains a separate permission."
          : capabilities.workforce_payroll_configure === true
            ? "Configuration access only; generated batches and export rows remain restricted by the server."
            : "Requires payroll export or payroll configuration access.",
    },
  ];
}

export function OperationsReportsCatalog({
  capabilities,
}: {
  capabilities: ClinicCapabilities;
}) {
  return (
    <Card title="Reports and exports">
      <Stack spacing={2} divider={<Divider flexItem />}>
        {destinations(capabilities).map((item) => (
          <Stack key={item.href} spacing={0.75}>
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap", alignItems: "center" }}
            >
              <Typography variant="h6" component="h3">
                {item.title}
              </Typography>
              <Chip
                size="small"
                label={item.available ? "Available" : "Unavailable"}
                variant="outlined"
              />
            </Stack>
            <Typography variant="body2">
              <strong>Source:</strong> {item.source}
            </Typography>
            <Typography variant="body2">
              <strong>Freshness:</strong> {item.freshness}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Access:</strong> {item.permission}
            </Typography>
            {item.available && (
              <Button
                component="a"
                href={item.href}
                variant="text"
                sx={{ alignSelf: "flex-start", px: 0 }}
              >
                {item.action}
              </Button>
            )}
          </Stack>
        ))}
      </Stack>
      <Alert severity="info" sx={{ mt: 2 }}>
        This catalog links to existing server-owned views. It does not combine
        records into a new cross-domain report, and no consolidated export is
        currently available. Each destination keeps its source filters,
        permission boundary, and export/reference metadata so a report can be
        reconciled back to the ledger that produced it.
      </Alert>
    </Card>
  );
}

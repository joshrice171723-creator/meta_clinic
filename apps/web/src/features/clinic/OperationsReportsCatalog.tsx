import {
  Alert,
  Button,
  Chip,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState, type FormEvent } from "react";
import type { ClinicCapabilities } from "../../api/contracts";
import { Card, LoadState, useResource } from "../../shared/ui";

type DailyVisitsReport = {
  definition: { revision: number; source: string; date_basis: string };
  date: string;
  timezone: string;
  as_of: string;
  freshness: string;
  counts: Record<string, number>;
  total: number;
  unknown_state_count: number;
};

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
  siteId,
}: {
  capabilities: ClinicCapabilities;
  siteId?: number;
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
      {siteId && capabilities.appointments_read === true && (
        <DailyVisitsByState siteId={siteId} />
      )}
    </Card>
  );
}

function DailyVisitsByState({ siteId }: { siteId: number }) {
  const requestedDate = new URLSearchParams(window.location.search).get("date");
  const initialDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : "";
  const [inputDate, setInputDate] = useState(initialDate);
  const [loadedDate, setLoadedDate] = useState(initialDate);
  const path = `/api/clinic/reports/daily_visits_by_state?date=${encodeURIComponent(loadedDate)}&site_id=${siteId}`;
  const result = useResource<{ report: DailyVisitsReport }>(path, {
    enabled: Boolean(loadedDate),
  });
  const report = result.data?.report;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inputDate) {
      const url = new URL(window.location.href);
      url.searchParams.set("date", inputDate);
      window.history.replaceState(window.history.state, "", url);
      if (inputDate === loadedDate) result.refresh();
      else setLoadedDate(inputDate);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ mt: 3 }}>
      <Divider />
      <Typography variant="h6" component="h3">
        Daily visits by state
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Current appointment states for one clinic location and local date.
        Counts include cancelled and no-show visits; requests and holds are
        excluded.
      </Typography>
      <Stack
        component="form"
        onSubmit={submit}
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{ alignItems: { sm: "center" } }}
      >
        <TextField
          label="Clinic date"
          type="date"
          value={inputDate}
          onChange={(event) => setInputDate(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          size="small"
        />
        <Button type="submit" variant="outlined" disabled={!inputDate}>
          {loadedDate && loadedDate === inputDate
            ? "Refresh report"
            : "Show report"}
        </Button>
      </Stack>
      {loadedDate && !report && (
        <LoadState error={result.error} onRetry={result.refresh} />
      )}
      {report && (
        <Stack spacing={1} aria-live="polite">
          <Typography>
            {report.date} · {report.total} visits
          </Typography>
          <Button
            href={`/clinic/schedule?site_id=${siteId}&month=${report.date.slice(0, 7)}&day=${report.date}&view=day`}
            size="small"
            sx={{ alignSelf: "flex-start" }}
          >
            Open source schedule
          </Button>
          {Object.entries(report.counts).map(([state, count]) => (
            <Typography variant="body2" key={state}>
              {state.replaceAll("_", " ")}: {count}
            </Typography>
          ))}
          {report.unknown_state_count > 0 && (
            <Typography variant="body2">
              Unknown states: {report.unknown_state_count}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Source: {report.definition.source} · Definition revision{" "}
            {report.definition.revision}
            {" · "}Date basis: {report.definition.date_basis} ·{" "}
            {report.timezone}
            {" · "}As of {report.as_of} · {report.freshness}. No export is
            available.
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}

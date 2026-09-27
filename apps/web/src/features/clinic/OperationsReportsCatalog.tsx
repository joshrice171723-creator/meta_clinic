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

type DailyInvoicesReport = {
  definition: {
    revision: number;
    source: string;
    date_basis: string;
    exclusions: string;
  };
  date: string;
  timezone: string;
  as_of: string;
  currencies: {
    currency: string;
    counts: Record<string, number>;
    posted_line_total: string;
  }[];
};

type DailyStockReport = {
  definition: {
    revision: number;
    source: string;
    date_basis: string;
    exclusions: string;
  };
  date: string;
  timezone: string;
  as_of: string;
  movements: {
    stock_type: string;
    stock_unit: string;
    kind: string;
    count: number;
    signed_quantity: string;
  }[];
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
      {((siteId && capabilities.appointments_read === true) ||
        capabilities.billing_read === true ||
        capabilities.inventory === true) && (
        <DailyVisitsByState siteId={siteId} capabilities={capabilities} />
      )}
    </Card>
  );
}

function DailyVisitsByState({
  siteId,
  capabilities,
}: {
  siteId?: number;
  capabilities: ClinicCapabilities;
}) {
  const requestedDate = new URLSearchParams(window.location.search).get("date");
  const initialDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : "";
  const [inputDate, setInputDate] = useState(initialDate);
  const [loadedDate, setLoadedDate] = useState(initialDate);
  const path = `/api/clinic/reports/daily_visits_by_state?date=${encodeURIComponent(loadedDate)}&site_id=${siteId}`;
  const result = useResource<{ report: DailyVisitsReport }>(path, {
    enabled: Boolean(loadedDate && siteId && capabilities.appointments_read),
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
        Daily source reports
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Select a clinic-local date to review source-owned visit, invoice and
        stock activity. Each report follows its own access permission.
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
      {loadedDate && siteId && capabilities.appointments_read && !report && (
        <LoadState error={result.error} onRetry={result.refresh} />
      )}
      {report && (
        <Stack spacing={1} aria-live="polite">
          <Typography variant="subtitle1" component="h4">
            Visits by current state
          </Typography>
          <Typography>
            {report.date} · {report.total} visits
          </Typography>
          {siteId && (
            <Button
              href={`/clinic/schedule?site_id=${siteId}&month=${report.date.slice(0, 7)}&day=${report.date}&view=day`}
              size="small"
              sx={{ alignSelf: "flex-start" }}
            >
              Open source schedule
            </Button>
          )}
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
            {" · "}As of {report.as_of} · {report.freshness}.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
            onClick={() => downloadVisitCsv(report)}
          >
            Download visit counts CSV
          </Button>
        </Stack>
      )}
      {capabilities.billing_read && <DailyInvoices date={loadedDate} />}
      {capabilities.inventory && <DailyStockMovements date={loadedDate} />}
    </Stack>
  );
}

function downloadVisitCsv(report: DailyVisitsReport) {
  const rows = [
    ["report", "daily_visits_by_state"],
    ["definition_revision", String(report.definition.revision)],
    ["source", report.definition.source],
    ["date_basis", report.definition.date_basis],
    ["clinic_date", report.date],
    ["timezone", report.timezone],
    ["as_of", report.as_of],
    ["state", "count"],
    ...Object.entries(report.counts).map(([state, count]) => [
      state,
      String(count),
    ]),
    ["unknown_state", String(report.unknown_state_count)],
    ["total", String(report.total)],
  ];
  const csv = rows
    .map((row) =>
      row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `daily-visits-${report.date}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function DailyInvoices({ date }: { date: string }) {
  const result = useResource<{ report: DailyInvoicesReport }>(
    `/api/clinic/reports/daily_invoices?date=${encodeURIComponent(date)}`,
    { enabled: Boolean(date) },
  );
  if (!date) return null;
  const report = result.data?.report;
  return (
    <Stack spacing={0.75}>
      <Divider />
      <Typography variant="subtitle1" component="h4">
        Invoices created
      </Typography>
      {!report ? (
        <LoadState error={result.error} onRetry={result.refresh} />
      ) : (
        <>
          {report.currencies.length === 0 ? (
            <Typography variant="body2">
              No invoices were created on this date.
            </Typography>
          ) : (
            report.currencies.map((row) => (
              <Typography variant="body2" key={row.currency}>
                {row.currency}:{" "}
                {Object.entries(row.counts)
                  .map(([state, count]) => `${state} ${count}`)
                  .join(" · ")}{" "}
                · Posted line total {row.posted_line_total}
              </Typography>
            ))
          )}
          <Typography variant="caption" color="text.secondary">
            Source: {report.definition.source} · Definition revision{" "}
            {report.definition.revision} · {report.definition.date_basis} ·{" "}
            {report.timezone} · As of {report.as_of}.{" "}
            {report.definition.exclusions}
          </Typography>
          <Button
            href="/clinic/billing"
            size="small"
            sx={{ alignSelf: "flex-start" }}
          >
            Open source billing ledger
          </Button>
        </>
      )}
    </Stack>
  );
}

function DailyStockMovements({ date }: { date: string }) {
  const result = useResource<{ report: DailyStockReport }>(
    `/api/clinic/reports/daily_stock_movements?date=${encodeURIComponent(date)}`,
    { enabled: Boolean(date) },
  );
  if (!date) return null;
  const report = result.data?.report;
  return (
    <Stack spacing={0.75}>
      <Divider />
      <Typography variant="subtitle1" component="h4">
        Stock movements
      </Typography>
      {!report ? (
        <LoadState error={result.error} onRetry={result.refresh} />
      ) : (
        <>
          {report.movements.length === 0 ? (
            <Typography variant="body2">
              No stock movements were recorded on this date.
            </Typography>
          ) : (
            report.movements.map((row) => (
              <Typography
                variant="body2"
                key={`${row.stock_type}-${row.stock_unit}-${row.kind}`}
              >
                {row.stock_type} · {row.kind}: {row.count} entries · signed
                quantity {row.signed_quantity} {row.stock_unit}
              </Typography>
            ))
          )}
          <Typography variant="caption" color="text.secondary">
            Source: {report.definition.source} · Definition revision{" "}
            {report.definition.revision} · {report.definition.date_basis} ·{" "}
            {report.timezone} · As of {report.as_of}.{" "}
            {report.definition.exclusions}
          </Typography>
          <Button
            href="/clinic/inventory/activity"
            size="small"
            sx={{ alignSelf: "flex-start" }}
          >
            Open source movement ledger
          </Button>
        </>
      )}
    </Stack>
  );
}

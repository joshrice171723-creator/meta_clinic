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

type ReportPagination = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

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
  records: {
    id: number;
    patient_id: number;
    currency: string;
    status: string;
    created_at: string;
    current_outstanding_balance: string;
  }[];
  pagination: ReportPagination;
  currencies: {
    currency: string;
    counts: Record<string, number>;
    posted_line_total: string;
    current_outstanding_balance: string;
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
  records: {
    id: number;
    stock_type: string;
    stock_unit: string;
    kind: string;
    signed_quantity: string;
    occurred_at: string;
    item_id: number | null;
    batch_id: number | null;
  }[];
  pagination: ReportPagination;
  movements: {
    stock_type: string;
    stock_unit: string;
    kind: string;
    count: number;
    signed_quantity: string;
  }[];
};

type DailyPaymentReport = {
  definition: {
    revision: number;
    source: string;
    date_basis: string;
    exclusions: string;
  };
  date: string;
  timezone: string;
  as_of: string;
  payment_records: {
    id: number;
    patient_id: number;
    currency: string;
    amount: string;
    created_at: string;
  }[];
  payment_pagination: ReportPagination;
  refund_records: {
    id: number;
    patient_id: number;
    payment_event_id: number;
    currency: string;
    amount: string;
    created_at: string;
  }[];
  refund_pagination: ReportPagination;
  currencies: {
    currency: string;
    payment_count: number;
    payment_amount: string;
    refund_count: number;
    refund_amount: string;
  }[];
};

type OpenClinicalWorkReport = {
  definition: { revision: number; source: string; exclusions: string };
  site_id: number | null;
  as_of: string;
  total: number;
  overdue_count: number;
  kinds: { kind: string; total: number; counts: Record<string, number> }[];
};

type ConfigurationManifest = {
  format: number;
  purpose: string;
  generated_at: string;
  source_digest: string;
  configuration: {
    practice: { id: number; name: string; features: { revision: number } };
    sites: { id: number }[];
    service_offerings: { id: number }[];
  };
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
        capabilities.inventory === true ||
        capabilities.billing_payment_record === true ||
        capabilities.billing_cash_reconcile === true ||
        capabilities.billing_write === true) && (
        <DailyVisitsByState siteId={siteId} capabilities={capabilities} />
      )}
      {siteId && capabilities.patients && capabilities.encounters && (
        <OpenClinicalWork siteId={siteId} />
      )}
      {capabilities.configuration_manifest_read && (
        <ConfigurationManifestDownload />
      )}
    </Card>
  );
}

function OpenClinicalWork({ siteId }: { siteId?: number }) {
  const path = `/api/clinic/reports/open_clinical_work${siteId ? `?site_id=${siteId}` : ""}`;
  const result = useResource<{ report: OpenClinicalWorkReport }>(path);
  const report = result.data?.report;

  return (
    <Stack spacing={1} sx={{ mt: 3 }}>
      <Divider />
      <Typography variant="h6" component="h3">
        Current clinical follow-up work
      </Typography>
      {!report && <LoadState error={result.error} onRetry={result.refresh} />}
      {report && (
        <Stack spacing={1} aria-live="polite">
          <Typography>
            {report.total} active tasks · {report.overdue_count} past due
          </Typography>
          {report.kinds.map((item) => (
            <Typography key={item.kind} variant="body2">
              {item.kind.replaceAll("_", " ")}: {item.total} (
              {Object.entries(item.counts)
                .filter(([, count]) => count > 0)
                .map(
                  ([state, count]) => `${state.replaceAll("_", " ")} ${count}`,
                )
                .join(", ")}
              )
            </Typography>
          ))}
          <Button
            href="/clinic/operations"
            size="small"
            sx={{ alignSelf: "flex-start" }}
          >
            Open follow-up worklist
          </Button>
          <Typography variant="caption" color="text.secondary">
            Source: {report.definition.source} · Revision{" "}
            {report.definition.revision} · As of {report.as_of}.{" "}
            {report.definition.exclusions}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
            onClick={result.refresh}
          >
            Refresh current work
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

function ConfigurationManifestDownload() {
  const result = useResource<{ manifest: ConfigurationManifest }>(
    "/api/clinic/operations/configuration_manifest",
  );
  const manifest = result.data?.manifest;
  const [comparison, setComparison] = useState<string | null>(null);
  const [comparisonError, setComparisonError] = useState("");
  const compareFile = async (file?: File) => {
    if (!file || !manifest) return;
    setComparison(null);
    setComparisonError("");
    try {
      if (file.size > 1_000_000)
        throw new Error("Choose a JSON file smaller than 1 MB.");
      const saved = JSON.parse(await file.text()) as ConfigurationManifest;
      if (
        !saved ||
        typeof saved !== "object" ||
        saved.format !== manifest.format ||
        saved.configuration?.practice?.id !==
          manifest.configuration.practice.id ||
        !Array.isArray(saved.configuration.sites) ||
        !Array.isArray(saved.configuration.service_offerings) ||
        [
          ...saved.configuration.sites,
          ...saved.configuration.service_offerings,
        ].some((row) => !Number.isInteger(row?.id))
      ) {
        throw new Error(
          "Choose a configuration snapshot from this clinic and format.",
        );
      }
      const changes = (older: { id: number }[], current: { id: number }[]) => {
        const previous = new Map(
          older.map((row) => [row.id, JSON.stringify(row)]),
        );
        const latest = new Map(
          current.map((row) => [row.id, JSON.stringify(row)]),
        );
        return `${[...latest.keys()].filter((id) => !previous.has(id)).length} added, ${[...previous.keys()].filter((id) => !latest.has(id)).length} removed, ${[...latest.keys()].filter((id) => previous.has(id) && previous.get(id) !== latest.get(id)).length} changed`;
      };
      setComparison(
        JSON.stringify(saved.configuration) ===
          JSON.stringify(manifest.configuration)
          ? "Saved snapshot matches the currently loaded clinic configuration."
          : `Saved snapshot differs: clinic settings ${JSON.stringify(saved.configuration.practice) === JSON.stringify(manifest.configuration.practice) ? "unchanged" : "changed"}; locations ${changes(saved.configuration.sites, manifest.configuration.sites)}; service offerings ${changes(saved.configuration.service_offerings, manifest.configuration.service_offerings)}.`,
      );
    } catch (error) {
      setComparisonError(
        error instanceof Error
          ? error.message
          : "The snapshot could not be read.",
      );
    }
  };
  const download = () => {
    if (!manifest) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(manifest, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clinic-configuration-${manifest.configuration.practice.features.revision}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <Stack spacing={1} sx={{ mt: 3 }}>
      <Divider />
      <Typography variant="h6" component="h3">
        Clinic configuration snapshot
      </Typography>
      {!manifest && <LoadState error={result.error} onRetry={result.refresh} />}
      {manifest && (
        <>
          <Typography variant="body2">
            {manifest.configuration.practice.name} ·{" "}
            {manifest.configuration.sites.length} locations ·{" "}
            {manifest.configuration.service_offerings.length} service offerings
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Read at {manifest.generated_at} · Format {manifest.format} · Source
            digest {manifest.source_digest}. {manifest.purpose}.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
            onClick={download}
          >
            Download configuration JSON
          </Button>
          <Button
            size="small"
            sx={{ alignSelf: "flex-start" }}
            onClick={() => {
              setComparison(null);
              setComparisonError("");
              result.refresh();
            }}
          >
            Refresh snapshot
          </Button>
          <Button
            component="label"
            size="small"
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
          >
            Compare saved JSON
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(event) => {
                void compareFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </Button>
          {comparison && (
            <Alert severity="info">
              {comparison} Comparison is for review only; it does not restore or
              import settings.
            </Alert>
          )}
          {comparisonError && <Alert severity="error">{comparisonError}</Alert>}
        </>
      )}
    </Stack>
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
        Select a clinic-local date to review source-owned visit, invoice,
        payment, refund and stock activity. Each report follows its own access
        permission.
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
      {(capabilities.billing_payment_record ||
        capabilities.billing_cash_reconcile ||
        capabilities.billing_write) && (
        <DailyCashDrawers key={loadedDate} date={loadedDate} />
      )}
      {capabilities.billing_read && (
        <DailyInvoices key={loadedDate} date={loadedDate} />
      )}
      {capabilities.billing_read && (
        <DailyPaymentActivity key={loadedDate} date={loadedDate} />
      )}
      {capabilities.inventory && (
        <DailyStockMovements key={loadedDate} date={loadedDate} />
      )}
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
  downloadCsv(rows, `daily-visits-${report.date}.csv`);
}

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          const safe =
            /^\s*[=+@-]/.test(value) && !/^-?\d+(?:\.\d+)?$/.test(value)
              ? `'${value}`
              : value;
          return `"${safe.replaceAll('"', '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function DailyPaymentActivity({ date }: { date: string }) {
  const [paymentPage, setPaymentPage] = useState(1);
  const [refundPage, setRefundPage] = useState(1);
  const result = useResource<{ report: DailyPaymentReport }>(
    `/api/clinic/reports/daily_payment_activity?date=${encodeURIComponent(date)}&payment_page=${paymentPage}&refund_page=${refundPage}`,
    { enabled: Boolean(date) },
  );
  if (!date) return null;
  const report = result.data?.report;
  return (
    <Stack spacing={0.75}>
      <Divider />
      <Typography variant="subtitle1" component="h4">
        Payments and refunds recorded
      </Typography>
      {!report ? (
        <LoadState error={result.error} onRetry={result.refresh} />
      ) : (
        <>
          {report.currencies.length === 0 ? (
            <Typography variant="body2">
              No payments or refunds were recorded on this date.
            </Typography>
          ) : (
            report.currencies.map((row) => (
              <Typography variant="body2" key={row.currency}>
                {row.currency}: {row.payment_count} payments totaling{" "}
                {row.payment_amount} · {row.refund_count} refunds totaling{" "}
                {row.refund_amount}
              </Typography>
            ))
          )}
          <Typography variant="caption" color="text.secondary">
            Source: {report.definition.source} · Definition revision{" "}
            {report.definition.revision} · {report.definition.date_basis} ·{" "}
            {report.timezone} · As of {report.as_of}.{" "}
            {report.definition.exclusions}
          </Typography>
          {report.payment_records.map((record) => (
            <Button
              key={`payment-${record.id}`}
              size="small"
              href={`/clinic/billing/patients?patient_id=${record.patient_id}&payment_id=${record.id}`}
              sx={{ alignSelf: "flex-start" }}
            >
              Payment {record.id} · {record.currency} {record.amount}
            </Button>
          ))}
          <ReportPageControls
            label="payments"
            pagination={report.payment_pagination}
            onPage={setPaymentPage}
          />
          {report.refund_records.map((record) => (
            <Button
              key={`refund-${record.id}`}
              size="small"
              href={`/clinic/billing/patients?patient_id=${record.patient_id}&payment_id=${record.payment_event_id}&refund_id=${record.id}`}
              sx={{ alignSelf: "flex-start" }}
            >
              Refund {record.id} for payment {record.payment_event_id} ·{" "}
              {record.currency} {record.amount}
            </Button>
          ))}
          <ReportPageControls
            label="refunds"
            pagination={report.refund_pagination}
            onPage={setRefundPage}
          />
          <Button
            size="small"
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
            onClick={() =>
              downloadCsv(
                [
                  ["report", "daily_payment_activity"],
                  ["definition_revision", String(report.definition.revision)],
                  ["source", report.definition.source],
                  ["date_basis", report.definition.date_basis],
                  ["clinic_date", report.date],
                  ["timezone", report.timezone],
                  ["as_of", report.as_of],
                  [
                    "currency",
                    "payment_count",
                    "payment_amount",
                    "refund_count",
                    "refund_amount",
                  ],
                  ...report.currencies.map((row) => [
                    row.currency,
                    String(row.payment_count),
                    row.payment_amount,
                    String(row.refund_count),
                    row.refund_amount,
                  ]),
                ],
                `daily-payment-activity-${report.date}.csv`,
              )
            }
          >
            Download payment activity CSV
          </Button>
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

function DailyInvoices({ date }: { date: string }) {
  const [page, setPage] = useState(1);
  const result = useResource<{ report: DailyInvoicesReport }>(
    `/api/clinic/reports/daily_invoices?date=${encodeURIComponent(date)}&page=${page}`,
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
                · Posted line total {row.posted_line_total} · Current
                outstanding balance {row.current_outstanding_balance}
              </Typography>
            ))
          )}
          <Typography variant="caption" color="text.secondary">
            Source: {report.definition.source} · Definition revision{" "}
            {report.definition.revision} · {report.definition.date_basis} ·{" "}
            {report.timezone} · As of {report.as_of}.{" "}
            {report.definition.exclusions}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Outstanding balance is current for invoices created on this date,
            not a day-end snapshot.
          </Typography>
          {report.records.map((record) => (
            <Button
              key={record.id}
              size="small"
              href={`/clinic/billing/patients?patient_id=${record.patient_id}&invoice_id=${record.id}`}
              sx={{ alignSelf: "flex-start" }}
            >
              Invoice {record.id} · {record.status} · {record.currency} ·
              current balance {record.current_outstanding_balance}
            </Button>
          ))}
          <ReportPageControls
            label="invoices"
            pagination={report.pagination}
            onPage={setPage}
          />
          <Button
            size="small"
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
            onClick={() =>
              downloadCsv(
                [
                  ["report", "daily_invoices"],
                  ["definition_revision", String(report.definition.revision)],
                  ["source", report.definition.source],
                  ["date_basis", report.definition.date_basis],
                  ["exclusions", report.definition.exclusions],
                  ["clinic_date", report.date],
                  ["timezone", report.timezone],
                  ["as_of", report.as_of],
                  [
                    "currency",
                    "state",
                    "count",
                    "posted_line_total",
                    "current_outstanding_balance",
                  ],
                  ...report.currencies.flatMap((row) => [
                    ...Object.entries(row.counts).map(([state, count]) => [
                      row.currency,
                      state,
                      String(count),
                      state === "posted" ? row.posted_line_total : "",
                      "",
                    ]),
                    [
                      row.currency,
                      "all",
                      "",
                      "",
                      row.current_outstanding_balance,
                    ],
                  ]),
                ],
                `daily-invoices-${report.date}.csv`,
              )
            }
          >
            Download invoice counts CSV
          </Button>
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
  const [page, setPage] = useState(1);
  const result = useResource<{ report: DailyStockReport }>(
    `/api/clinic/reports/daily_stock_movements?date=${encodeURIComponent(date)}&page=${page}`,
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
          {report.records.map((record) =>
            record.stock_type === "pharmacy" ? (
              <Button
                key={record.id}
                size="small"
                href={`/clinic/inventory/activity?q=entry%3A${record.id}`}
                sx={{ alignSelf: "flex-start" }}
              >
                Entry {record.id} · pharmacy batch{" "}
                {record.batch_id ?? "unknown"}
                {" · "}
                {record.kind} · {record.signed_quantity} {record.stock_unit}
              </Button>
            ) : (
              <Typography variant="body2" key={record.id}>
                Entry {record.id} · {record.stock_type} item{" "}
                {record.item_id ?? "unknown"} · {record.kind} ·{" "}
                {record.signed_quantity} {record.stock_unit} (no direct office
                entry view)
              </Typography>
            ),
          )}
          <ReportPageControls
            label="stock entries"
            pagination={report.pagination}
            onPage={setPage}
          />
          <Button
            size="small"
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
            onClick={() =>
              downloadCsv(
                [
                  ["report", "daily_stock_movements"],
                  ["definition_revision", String(report.definition.revision)],
                  ["source", report.definition.source],
                  ["date_basis", report.definition.date_basis],
                  ["exclusions", report.definition.exclusions],
                  ["clinic_date", report.date],
                  ["timezone", report.timezone],
                  ["as_of", report.as_of],
                  [
                    "stock_type",
                    "stock_unit",
                    "kind",
                    "count",
                    "signed_quantity",
                  ],
                  ...report.movements.map((row) => [
                    row.stock_type,
                    row.stock_unit,
                    row.kind,
                    String(row.count),
                    row.signed_quantity,
                  ]),
                ],
                `daily-stock-movements-${report.date}.csv`,
              )
            }
          >
            Download stock movements CSV
          </Button>
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

function ReportPageControls({
  label,
  pagination,
  onPage,
}: {
  label: string;
  pagination: ReportPagination;
  onPage: (page: number) => void;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ flexWrap: "wrap", alignItems: "center" }}
    >
      <Typography variant="caption" aria-live="polite">
        {pagination.total} {label} � Page {pagination.page} of{" "}
        {Math.max(1, pagination.total_pages)}
      </Typography>
      <Button
        size="small"
        aria-label={`Previous ${label} page`}
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
      >
        Previous
      </Button>
      <Button
        size="small"
        aria-label={`Next ${label} page`}
        disabled={pagination.page >= pagination.total_pages}
        onClick={() => onPage(pagination.page + 1)}
      >
        Next
      </Button>
      <Typography variant="caption" color="text.secondary">
        Live rows; new activity can shift pages.
      </Typography>
    </Stack>
  );
}

type CashDrawerReport = {
  definition: { source: string; date_basis: string; exclusions: string };
  date: string;
  timezone: string;
  as_of: string;
  open_count: number;
  awaiting_reconciliation_count: number;
  variance_count: number;
  pagination: ReportPagination;
  records: {
    id: number;
    site_name: string;
    status: string;
    reconciliation_status: string;
    currency: string | null;
    payment_currencies: string[];
    opening_float: string;
    cash_received: string;
    cash_refunded: string;
    expected_cash: string;
    counted_cash: string | null;
    discrepancy: string | null;
    expected_at_close: string | null;
    opened_at: string;
    closed_at: string | null;
  }[];
};

function DailyCashDrawers({ date }: { date: string }) {
  const [page, setPage] = useState(1);
  const result = useResource<{ report: CashDrawerReport }>(
    `/api/clinic/reports/daily_cash_drawers?date=${encodeURIComponent(date)}&page=${page}`,
    { enabled: Boolean(date) },
  );
  if (!date) return null;
  const report = result.data?.report;
  return (
    <Stack spacing={1}>
      <Divider />
      <Typography variant="subtitle1" component="h4">
        Cash drawer sessions opened
      </Typography>
      {!report ? (
        <LoadState error={result.error} onRetry={result.refresh} />
      ) : (
        <>
          <Typography>
            {report.open_count} still open;{" "}
            {report.awaiting_reconciliation_count} closed awaiting
            reconciliation; {report.variance_count} closed with a variance.
          </Typography>
          {report.records.map((row) => (
            <Stack key={row.id} spacing={0.5}>
              <Typography variant="body2">
                Drawer {row.id} - {row.site_name} - {row.status} /{" "}
                {row.reconciliation_status}
              </Typography>
              <Typography variant="caption">
                Opened {row.opened_at}; closed {row.closed_at ?? "not yet"}.
                Payment currencies:{" "}
                {row.payment_currencies.join(", ") || "none recorded"}. Drawer
                currency: {row.currency ?? "not recorded"}.
              </Typography>
              {row.payment_currencies.length > 1 ? (
                <Alert severity="warning">
                  Mixed payment currencies: monetary comparison withheld. Review
                  this drawer in billing.
                </Alert>
              ) : (
                <Typography variant="body2">
                  Opening float {row.opening_float}; received{" "}
                  {row.cash_received}; refunded {row.cash_refunded}; current
                  expected {row.expected_cash}.
                  {row.status === "closed" &&
                    ` At close: expected ${row.expected_at_close ?? "unavailable"}; counted ${row.counted_cash ?? "unavailable"}; variance ${row.discrepancy ?? "unavailable"}.`}
                </Typography>
              )}
            </Stack>
          ))}
          <ReportPageControls
            label="drawer sessions"
            pagination={report.pagination}
            onPage={setPage}
          />
          <Typography variant="caption" color="text.secondary">
            Source: {report.definition.source}. Date basis:{" "}
            {report.definition.date_basis}; {report.timezone}. As of{" "}
            {report.as_of}. {report.definition.exclusions}
          </Typography>
          <Button
            size="small"
            href="/clinic/billing"
            sx={{ alignSelf: "flex-start" }}
          >
            Open billing cash drawers
          </Button>
          <Button
            size="small"
            onClick={result.refresh}
            sx={{ alignSelf: "flex-start" }}
          >
            Refresh cash report
          </Button>
        </>
      )}
    </Stack>
  );
}

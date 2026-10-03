import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Chip,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  BillingLocationProvenance,
  BillingSourceSite,
  ClinicCapabilities,
} from "../../api/contracts";
import { ApiError, api } from "../../api/client";
import { businessNow } from "../../shared/businessDate";
import { Card, LoadState, useResource } from "../../shared/ui";
import { ReportExportControl } from "./ReportExportControl";
import { DayEndReconciliation } from "./DayEndReconciliation";
import { clinicDateValue } from "./frontDeskModel";
import { ConfigurationMappingPreview } from "./ConfigurationMappingPreview";
import {
  invoiceLocationLabel,
  paymentLocationLabels,
} from "./billingSourceLocation";
import type {
  ConfigurationManifest,
  ConfigurationRecord,
} from "./configurationMapping";

type ReportPagination = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

type DailyVisitsReport = {
  definition: {
    revision: number;
    source: string;
    date_basis: string;
    state_basis: string;
    population: string;
    exclusions: string;
  };
  practice_id: number;
  site_id: number | null;
  date: string;
  timezone: string;
  interval_start: string;
  interval_end: string;
  as_of: string;
  freshness: string;
  counts: Record<string, number>;
  total: number;
  unknown_state_count: number;
  records: {
    id: number;
    site_id: number | null;
    status: string;
    visit_modality: string;
    local_start: string;
  }[];
  pagination: ReportPagination;
};

type DailyInvoicesReport = {
  definition: {
    revision: number;
    source: string;
    date_basis: string;
    state_basis: string;
    population: string;
    exclusions: string;
  };
  practice_id: number;
  date: string;
  timezone: string;
  interval_start: string;
  interval_end: string;
  as_of: string;
  freshness: string;
  records: (BillingLocationProvenance & {
    id: number;
    patient_id: number;
    encounter_id: number | null;
    currency: string;
    status: string;
    created_at: string;
    current_outstanding_balance: string;
  })[];
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
    population: string;
    exclusions: string;
  };
  practice_id: number;
  date: string;
  timezone: string;
  interval_start: string;
  interval_end: string;
  as_of: string;
  freshness: string;
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
    population: string;
    exclusions: string;
  };
  practice_id: number;
  date: string;
  timezone: string;
  interval_start: string;
  interval_end: string;
  as_of: string;
  freshness: string;
  payment_records: {
    id: number;
    source_sites: BillingSourceSite[];
    patient_id: number;
    currency: string;
    amount: string;
    created_at: string;
  }[];
  payment_pagination: ReportPagination;
  refund_records: {
    id: number;
    source_sites: BillingSourceSite[];
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
  owners: {
    membership_id: number | null;
    label: string;
    total: number;
    overdue_count: number;
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
  timezone,
}: {
  capabilities: ClinicCapabilities;
  siteId?: number;
  timezone?: string;
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
            <Typography variant="body2">{item.source}</Typography>
            {!item.available && (
              <Typography variant="body2" color="text.secondary">
                {item.permission}
              </Typography>
            )}
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
            <Accordion
              disableGutters
              elevation={0}
              sx={{ bgcolor: "transparent", "&::before": { display: "none" } }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreRoundedIcon />}
                sx={{ px: 0, minHeight: 44 }}
              >
                <Typography variant="body2">
                  About {item.title.toLowerCase()}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0, pt: 0 }}>
                <Typography variant="body2" color="text.secondary">
                  {item.freshness}
                </Typography>
                {item.available && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    {item.permission}
                  </Typography>
                )}
              </AccordionDetails>
            </Accordion>
          </Stack>
        ))}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Each report has its own filters, access requirements, and export
        details. A combined export is not available. Open a report to trace its
        figures back to the original records.
      </Typography>
      {((siteId && capabilities.appointments_read === true) ||
        capabilities.billing_read === true ||
        capabilities.inventory === true ||
        capabilities.billing_payment_record === true ||
        capabilities.billing_cash_reconcile === true ||
        capabilities.billing_write === true) && (
        <DailyVisitsByState
          siteId={siteId}
          capabilities={capabilities}
          timezone={timezone}
        />
      )}
      {siteId && capabilities.patients && capabilities.encounters && (
        <OpenClinicalWork siteId={siteId} />
      )}
      {capabilities.inventory && <CurrentStockReport />}
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
          <Typography variant="subtitle2" component="h4">
            By recorded owner
          </Typography>
          {report.owners.map((owner) => (
            <Typography key={owner.membership_id ?? "unassigned"} variant="body2">
              {owner.label}: {owner.total} active · {owner.overdue_count} past due
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
  const [comparison, setComparison] = useState<{
    summary: string;
    details: string[];
    sourceDigest: string;
    generatedAt: string;
  } | null>(null);
  const [comparisonError, setComparisonError] = useState("");
  const [downloadNotice, setDownloadNotice] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string>();
  const downloadFileName = manifest
    ? `clinic-configuration-${manifest.configuration.practice.features.revision}.json`
    : undefined;
  useEffect(() => {
    if (!manifest) {
      setDownloadUrl(undefined);
      return;
    }
    let url: string;
    try {
      url = URL.createObjectURL(
        new Blob([JSON.stringify(manifest, null, 2)], {
          type: "application/json",
        }),
      );
      setDownloadUrl(url);
      setDownloadError("");
    } catch {
      setDownloadUrl(undefined);
      setDownloadError(
        "The configuration download could not be prepared. Refresh this snapshot to try again.",
      );
      return;
    }
    return () => {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };
  }, [manifest]);
  const comparisonGeneration = useRef(0);
  const [mappingGeneration, setMappingGeneration] = useState(0);
  const compareFile = async (file?: File) => {
    const generation = ++comparisonGeneration.current;
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
        [saved.configuration.sites, saved.configuration.service_offerings].some(
          (rows) =>
            rows.some((row) => !Number.isSafeInteger(row?.id) || row.id <= 0) ||
            new Set(rows.map((row) => row.id)).size !== rows.length,
        )
      ) {
        throw new Error(
          "Choose a configuration snapshot from this clinic and format.",
        );
      }
      const stableJson = (value: unknown) =>
        JSON.stringify(value, (_key, item: unknown) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(
                Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
              )
            : item,
        );
      const fields = (
        older: ConfigurationRecord,
        current: ConfigurationRecord,
      ) =>
        [...new Set([...Object.keys(older), ...Object.keys(current)])]
          .filter((key) => stableJson(older[key]) !== stableJson(current[key]))
          .sort()
          .map((key) => key.replaceAll("_", " "))
          .join(", ");
      const details: string[] = [];
      const clinicFields = fields(
        saved.configuration.practice,
        manifest.configuration.practice,
      );
      if (clinicFields)
        details.push(`Clinic settings changed: ${clinicFields}.`);
      const changes = (
        group: string,
        older: ConfigurationRecord[],
        current: ConfigurationRecord[],
      ) => {
        const previous = new Map(older.map((row) => [row.id, row]));
        const latest = new Map(current.map((row) => [row.id, row]));
        const label = (row: ConfigurationRecord) =>
          `${group} ${typeof row.name === "string" ? row.name : "record"} (#${row.id})`;
        const added = current.filter((row) => !previous.has(row.id));
        const removed = older.filter((row) => !latest.has(row.id));
        const changed = current.filter(
          (row) => previous.has(row.id) && fields(previous.get(row.id)!, row),
        );
        added.forEach((row) => details.push(`${label(row)} added.`));
        removed.forEach((row) => details.push(`${label(row)} removed.`));
        changed.forEach((row) =>
          details.push(
            `${label(row)} changed: ${fields(previous.get(row.id)!, row)}.`,
          ),
        );
        return `${added.length} added, ${removed.length} removed, ${changed.length} changed`;
      };
      const locations = changes(
        "Location",
        saved.configuration.sites,
        manifest.configuration.sites,
      );
      const offerings = changes(
        "Service offering",
        saved.configuration.service_offerings,
        manifest.configuration.service_offerings,
      );
      if (generation !== comparisonGeneration.current) return;
      setComparison({
        summary:
          details.length === 0
            ? "Saved snapshot matches the currently loaded clinic configuration."
            : `Saved snapshot differs: clinic settings ${clinicFields ? "changed" : "unchanged"}; locations ${locations}; service offerings ${offerings}.`,
        details,
        sourceDigest: manifest.source_digest,
        generatedAt: manifest.generated_at,
      });
    } catch (error) {
      if (generation !== comparisonGeneration.current) return;
      setComparisonError(
        error instanceof Error
          ? error.message
          : "The snapshot could not be read.",
      );
    }
  };
  const refreshSnapshot = () => {
    setMappingGeneration((current) => current + 1);
    comparisonGeneration.current += 1;
    setComparison(null);
    setComparisonError("");
    setDownloadNotice("");
    setDownloadError("");
    result.refresh();
  };

  return (
    <Stack spacing={1} sx={{ mt: 3 }}>
      <Divider />
      <Typography variant="h6" component="h3">
        Clinic configuration snapshot
      </Typography>
      {!manifest && (
        <LoadState error={result.error} onRetry={refreshSnapshot} />
      )}
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
            component="a"
            href={downloadUrl}
            download={downloadFileName}
            disabled={!downloadUrl}
            size="small"
            variant="outlined"
            sx={{ alignSelf: "flex-start" }}
            onClick={() =>
              setDownloadNotice(
                `Download requested: ${downloadFileName}. Check your browser downloads for the file.`,
              )
            }
          >
            Download configuration JSON
          </Button>
          {downloadNotice && <Alert severity="info">{downloadNotice}</Alert>}
          {downloadError && <Alert severity="error">{downloadError}</Alert>}
          <Button
            size="small"
            sx={{ alignSelf: "flex-start" }}
            onClick={refreshSnapshot}
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
          {comparison &&
            comparison.sourceDigest === manifest.source_digest &&
            comparison.generatedAt === manifest.generated_at && (
              <Alert severity="info">
                {comparison.summary} Comparison is for review only; it does not
                restore or import settings.
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  {comparison.details.slice(0, 20).map((detail) => (
                    <Typography key={detail} variant="body2">
                      {detail}
                    </Typography>
                  ))}
                  {comparison.details.length > 20 && (
                    <Typography variant="body2">
                      Showing 20 of {comparison.details.length} changes. Review
                      both saved and current JSON for the remaining changes.
                    </Typography>
                  )}
                </Stack>
              </Alert>
            )}
          {comparisonError && <Alert severity="error">{comparisonError}</Alert>}
          <ConfigurationMappingPreview
            key={`${mappingGeneration}-${manifest.configuration.practice.id}-${manifest.source_digest}-${manifest.generated_at}`}
            target={manifest}
          />
        </>
      )}
    </Stack>
  );
}

function DailyVisitsByState({
  siteId,
  capabilities,
  timezone,
}: {
  siteId?: number;
  capabilities: ClinicCapabilities;
  timezone?: string;
}) {
  const requestedDate =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("date");
  const initialDate =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : timezone
        ? clinicDateValue(businessNow(), timezone)
        : "";
  const [inputDate, setInputDate] = useState(initialDate);
  const [loadedDate, setLoadedDate] = useState(initialDate);
  const [page, setPage] = useState(1);
  const path = `/api/clinic/reports/daily_visits_by_state?date=${encodeURIComponent(loadedDate)}&site_id=${siteId}&page=${page}`;
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
      else {
        setPage(1);
        setLoadedDate(inputDate);
      }
    }
  };

  return (
    <Stack id="end-of-day-closeout" spacing={1.5} sx={{ mt: 3 }}>
      <Divider />
      <Typography variant="h6" component="h3">
        End-of-day closeout
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Review one report date across visits, invoices and cash drawers. Each
        action opens the source record and keeps its own permission check.
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
      {loadedDate && (
        <Stack component="ol" spacing={1} sx={{ pl: 2.5, my: 0 }}>
          {siteId && capabilities.appointments_read && (
            <li>
              <Typography variant="subtitle2">Review visits</Typography>
              <Button href="#closeout-visits" size="small">
                Check visit states
              </Button>
            </li>
          )}
          {capabilities.billing_read && (
            <li>
              <Typography variant="subtitle2">Review invoices</Typography>
              <Button href="#closeout-invoices" size="small">
                Check invoices and balances
              </Button>
            </li>
          )}
          {(capabilities.billing_payment_record ||
            capabilities.billing_cash_reconcile ||
            capabilities.billing_write) && (
            <li>
              <Typography variant="subtitle2">Review cash drawers</Typography>
              <Button href="#closeout-drawers" size="small">
                Check drawer sessions
              </Button>
              <Button href="/clinic/billing?tab=cash" size="small">
                Close or reconcile in billing
              </Button>
            </li>
          )}
        </Stack>
      )}
      <Alert severity="info">
        These are live source reports, not a saved day-end balance. Invoice
        balances are current, and the drawer report lists sessions opened on the
        selected practice date plus unresolved earlier drawers. Visit dates
        follow the selected site's time zone.
      </Alert>
      {loadedDate && siteId && capabilities.appointments_read && !report && (
        <LoadState error={result.error} onRetry={result.refresh} />
      )}
      {report && (
        <Stack id="closeout-visits" spacing={1} aria-live="polite">
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
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Source appointments
          </Typography>
          {report.records.map((record) => (
            <Typography variant="body2" key={record.id}>
              Appointment {record.id} · {record.local_start} {report.timezone} ·{" "}
              {record.status.replaceAll("_", " ")} ·{" "}
              {record.visit_modality.replaceAll("_", " ")}
              {!siteId && record.site_id ? ` · Site ${record.site_id}` : ""}
            </Typography>
          ))}
          <ReportPageControls
            label="appointments"
            pagination={report.pagination}
            onPage={setPage}
          />
          <Typography variant="caption" color="text.secondary">
            Source: {report.definition.source} · Definition revision{" "}
            {report.definition.revision}
            {" · "}Date basis: {report.definition.date_basis} ·{" "}
            {report.timezone}
            {" · "}As of {report.as_of} · {report.freshness}.
          </Typography>
          <ReportExportControl
            reportId="daily_visits_by_state"
            filters={{
              date: report.date,
              ...(report.site_id === null ? {} : { site_id: report.site_id }),
            }}
            label="Issue and download all matching rows"
          />
          <Typography variant="caption" color="text.secondary">
            The issued CSV captures all matching source rows in one consistent
            snapshot. Screen pagination does not limit the export; requests above
            the export resource limits fail explicitly.
          </Typography>
        </Stack>
      )}
      {(capabilities.billing_payment_record ||
        capabilities.billing_cash_reconcile ||
        capabilities.billing_write) && (
        <DailyCashDrawers
          key={`cash-drawers-${loadedDate}`}
          date={loadedDate}
        />
      )}
      {capabilities.billing_read && (
        <DailyInvoices key={`invoices-${loadedDate}`} date={loadedDate} />
      )}
      {capabilities.billing_read && (
        <DailyPaymentActivity
          key={`payment-activity-${loadedDate}`}
          date={loadedDate}
        />
      )}
      {capabilities.billing_read &&
        (capabilities.billing_cash_reconcile || capabilities.billing_write) && (
          <>
            <DayEndReviews date={loadedDate} />
            {siteId && capabilities.appointments_read && (
              <DayEndReconciliation date={loadedDate} siteId={siteId} />
            )}
          </>
        )}
      {capabilities.inventory && (
        <DailyStockMovements
          key={`stock-movements-${loadedDate}`}
          date={loadedDate}
        />
      )}
    </Stack>
  );
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
              {" · "}Allocation locations:{" "}
              {paymentLocationLabels(record.source_sites)}
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
              {" · "}Payment allocation locations:{" "}
              {paymentLocationLabels(record.source_sites)}
            </Button>
          ))}
          <ReportPageControls
            label="refunds"
            pagination={report.refund_pagination}
            onPage={setRefundPage}
          />
          <ReportExportControl
            reportId="daily_payment_activity"
            filters={{
              date: report.date,
            }}
            label="Issue and download all matching rows"
          />
          <Typography variant="caption" color="text.secondary">
            The issued CSV captures all matching source rows in one consistent
            snapshot. Screen pagination does not limit the export; requests above
            the export resource limits fail explicitly.
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

function DailyInvoices({ date }: { date: string }) {
  const [page, setPage] = useState(1);
  const result = useResource<{ report: DailyInvoicesReport }>(
    `/api/clinic/reports/daily_invoices?date=${encodeURIComponent(date)}&page=${page}`,
    { enabled: Boolean(date) },
  );
  if (!date) return null;
  const report = result.data?.report;
  return (
    <Stack id="closeout-invoices" spacing={0.75}>
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
              {" · "}Location: {invoiceLocationLabel(record)}
            </Button>
          ))}
          <ReportPageControls
            label="invoices"
            pagination={report.pagination}
            onPage={setPage}
          />
          <ReportExportControl
            reportId="daily_invoices"
            filters={{
              date: report.date,
            }}
            label="Issue and download all matching rows"
          />
          <Typography variant="caption" color="text.secondary">
            The issued CSV captures all matching source rows in one consistent
            snapshot. Screen pagination does not limit the export; requests above
            the export resource limits fail explicitly.
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
          <ReportExportControl
            reportId="daily_stock_movements"
            filters={{
              date: report.date,
            }}
            label="Issue and download all matching rows"
          />
          <Typography variant="caption" color="text.secondary">
            The issued CSV captures all matching source rows in one consistent
            snapshot. Screen pagination does not limit the export; requests above
            the export resource limits fail explicitly.
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
  carried_count: number;
  carried_pagination: ReportPagination;
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
  carried_records: CashDrawerReport["records"];
};

function DailyCashDrawers({ date }: { date: string }) {
  const [page, setPage] = useState(1);
  const [carriedPage, setCarriedPage] = useState(1);
  const result = useResource<{ report: CashDrawerReport }>(
    `/api/clinic/reports/daily_cash_drawers?date=${encodeURIComponent(date)}&page=${page}&carried_page=${carriedPage}`,
    { enabled: Boolean(date) },
  );
  if (!date) return null;
  const report = result.data?.report;
  return (
    <Stack id="closeout-drawers" spacing={1}>
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
            reconciliation; {report.variance_count} closed with a variance
            (this count can overlap with reconciliation).
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
              <Button
                size="small"
                href={`/clinic/billing?tab=cash&cash_drawer_id=${row.id}`}
                sx={{ alignSelf: "flex-start" }}
              >
                Review drawer {row.id} in billing
              </Button>
            </Stack>
          ))}
          <ReportPageControls
            label="drawer sessions"
            pagination={report.pagination}
            onPage={setPage}
          />
          <Typography variant="subtitle2" component="h5">
            Earlier drawers still requiring action · {report.carried_count}
          </Typography>
          {report.carried_records.map((row) => (
            <Stack key={row.id} spacing={0.5}>
              <Typography variant="body2">
                Drawer {row.id} · {row.site_name} · opened {row.opened_at} ·{" "}
                {row.status === "open"
                  ? "still open"
                  : "awaiting reconciliation"}
              </Typography>
              <Button
                size="small"
                href={`/clinic/billing?tab=cash&cash_drawer_id=${row.id}`}
                sx={{ alignSelf: "flex-start" }}
              >
                Review drawer {row.id} in billing
              </Button>
            </Stack>
          ))}
          <ReportPageControls
            label="earlier drawers"
            pagination={report.carried_pagination}
            onPage={setCarriedPage}
          />
          <Typography variant="caption" color="text.secondary">
            Source: {report.definition.source}. Date basis:{" "}
            {report.definition.date_basis}; {report.timezone}. As of{" "}
            {report.as_of}. {report.definition.exclusions}
          </Typography>
          <Button
            size="small"
            href="/clinic/billing?tab=cash"
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

type DayEndReview = {
  id: number;
  date: string;
  timezone: string;
  reviewed_at: string;
  reviewed_by: string;
  review_note: string;
  snapshot: {
    invoices: {
      as_of: string;
      currencies: {
        currency: string;
        posted_line_total: string;
        current_outstanding_balance: string;
      }[];
    };
    payments: {
      as_of: string;
      currencies: {
        currency: string;
        payment_amount: string;
        refund_amount: string;
      }[];
    };
    drawers: {
      as_of: string;
      open_count: number;
      awaiting_reconciliation_count: number;
      variance_count: number;
      carried_count: number;
    };
  };
};

function DayEndReviews({ date }: { date: string }) {
  const reviews = useResource<{ reviews: DayEndReview[] }>(
    `/api/clinic/day_end_reviews?date=${encodeURIComponent(date)}`,
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pendingAttempt = useRef<{
    date: string;
    note: string;
    key: string;
  } | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reviewNote = note.trim();
    if (!reviewNote || busy) return;
    if (unknownOutcome && pendingAttempt.current?.date !== date) return;
    const attempt =
      pendingAttempt.current?.date === date &&
      pendingAttempt.current.note === reviewNote
        ? pendingAttempt.current
        : { date, note: reviewNote, key: crypto.randomUUID() };
    pendingAttempt.current = attempt;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/clinic/day_end_reviews", {
        method: "POST",
        body: {
          day_end_review: {
            date: attempt.date,
            review_note: attempt.note,
            request_key: attempt.key,
          },
        },
      });
      pendingAttempt.current = null;
      setUnknownOutcome(false);
      setNote("");
      setNotice(`Review checkpoint recorded for ${attempt.date}.`);
      reviews.refresh();
    } catch (reason) {
      const unknown =
        reason instanceof ApiError &&
        (reason.status === 408 ||
          reason.status >= 500 ||
          reason.code === "outcome_unconfirmed");
      setUnknownOutcome(unknown);
      if (!unknown) pendingAttempt.current = null;
      setError(
        unknown
          ? "The save outcome is unconfirmed. Retry this same review note before changing it."
          : reason instanceof Error
            ? reason.message
            : "The review checkpoint could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Divider />
      <Typography variant="subtitle1" component="h4">
        Saved review checkpoints
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Record who reviewed the practice-date invoice, payment and drawer
        summaries. Each saved checkpoint preserves its source values and review
        note. This is not a balanced ledger or payment settlement.
      </Typography>
      <Stack component="form" onSubmit={submit} spacing={1}>
        <TextField
          label="Review outcome or follow-up"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy || unknownOutcome}
          slotProps={{ htmlInput: { maxLength: 500 } }}
          required
          multiline
          minRows={2}
        />
        <Button
          type="submit"
          variant="outlined"
          disabled={
            busy ||
            !note.trim() ||
            (unknownOutcome && pendingAttempt.current?.date !== date)
          }
          sx={{ alignSelf: "flex-start" }}
        >
          {unknownOutcome ? "Retry same review" : "Record review checkpoint"}
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {unknownOutcome && pendingAttempt.current?.date !== date && (
        <Alert severity="warning">
          Return to {pendingAttempt.current?.date} to retry the unconfirmed
          review.
        </Alert>
      )}
      {notice && <Alert severity="success">{notice}</Alert>}
      {!reviews.data ? (
        <LoadState error={reviews.error} onRetry={reviews.refresh} />
      ) : reviews.data.reviews.length === 0 ? (
        <Typography variant="body2">
          No review checkpoint recorded for this date.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {reviews.data.reviews.map((review) => (
            <Stack key={review.id} spacing={0.5}>
              <Typography variant="subtitle2">
                {review.reviewed_at} · {review.reviewed_by}
              </Typography>
              <Typography variant="body2">{review.review_note}</Typography>
              <Typography variant="body2">
                Drawers: {review.snapshot.drawers.open_count} opened that date
                still open;{" "}
                {review.snapshot.drawers.awaiting_reconciliation_count} awaiting
                reconciliation; {review.snapshot.drawers.carried_count} earlier
                unresolved.
              </Typography>
              {review.snapshot.invoices.currencies.map((row) => (
                <Typography variant="body2" key={`invoice-${row.currency}`}>
                  {row.currency} invoices: posted lines {row.posted_line_total};
                  current outstanding {row.current_outstanding_balance}.
                </Typography>
              ))}
              {review.snapshot.payments.currencies.map((row) => (
                <Typography variant="body2" key={`payment-${row.currency}`}>
                  {row.currency} activity: payments {row.payment_amount};
                  refunds {row.refund_amount}.
                </Typography>
              ))}
              <Typography variant="caption" color="text.secondary">
                Source snapshots: invoices {review.snapshot.invoices.as_of};
                payments {review.snapshot.payments.as_of}; drawers{" "}
                {review.snapshot.drawers.as_of} · {review.timezone}.
              </Typography>
            </Stack>
          ))}
          <Typography variant="caption" color="text.secondary">
            Showing the latest 20 checkpoints for {date}.
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}

type StockSnapshot = {
  practice_id: number;
  status: string;
  as_of: string;
  inventory_date: string;
  timezone: string;
  source: string;
  low_product_count: number;
  low_office_count: number;
  office_quantity: string;
  pharmacy_units: { unit: string; physical: string; available: string }[];
  pagination: ReportPagination;
  office_pagination: ReportPagination;
  pharmacy_records: {
    id: number;
    product_id: number;
    name: string;
    lot: string;
    location: string;
    unit: string;
    physical: string;
    available: boolean;
    status: string;
    expires_on: string;
    expiring: boolean;
  }[];
  office_records: {
    id: number;
    name: string;
    sku: string;
    quantity: string;
    reorder_level: string;
    low_stock: boolean;
  }[];
};

function CurrentStockReport() {
  const [page, setPage] = useState(1);
  const [officePage, setOfficePage] = useState(1);
  const [status, setStatus] = useState("all");
  const result = useResource<{ report: StockSnapshot }>(
    `/api/clinic/reports/current_stock?page=${page}&office_page=${officePage}&status=${status}`,
  );
  const report = result.data?.report;
  return (
    <Stack spacing={1} sx={{ mt: 3 }}>
      <Divider />
      <Typography variant="h6" component="h3">
        Current stock on hand
      </Typography>
      <TextField
        select
        size="small"
        label="Pharmacy stock status"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          setPage(1);
        }}
        sx={{ maxWidth: 280 }}
      >
        {[
          ["all", "All"],
          ["available", "Available"],
          ["held", "Held"],
          ["expired", "Expired"],
        ].map(([value, label]) => (
          <MenuItem key={value} value={value}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      {!report ? (
        <LoadState error={result.error} onRetry={result.refresh} />
      ) : (
        <>
          <Typography variant="body2">
            {report.low_product_count} pharmacy products and{" "}
            {report.low_office_count} office items at or below their reorder
            level across the clinic.
          </Typography>
          <ReportExportControl
            reportId="current_stock"
            filters={{
              status: report.status,
            }}
            label="Issue and download all matching rows"
          />
          <Typography variant="caption" color="text.secondary">
            The issued CSV captures all matching source rows in one consistent
            snapshot. Screen pagination does not limit the export; requests above
            the export resource limits fail explicitly.
          </Typography>
          {report.pharmacy_units.map((row) => (
            <Typography key={row.unit} variant="body2">
              Pharmacy ({report.status}): {row.physical} {row.unit} on hand;{" "}
              {row.available} available.
            </Typography>
          ))}
          {report.pharmacy_records.map((row) => (
            <Stack key={row.id} spacing={0.25}>
              <Typography variant="body2">
                {row.name} - lot {row.lot} - {row.location}: {row.physical}{" "}
                {row.unit}. {row.available ? "Available" : "Unavailable"};{" "}
                {row.status}; expires {row.expires_on}
                {row.expiring ? " (within 30 days)" : ""}.
              </Typography>
              <Button
                href={`/clinic/inventory/lots?product_id=${row.product_id}`}
                size="small"
                sx={{ alignSelf: "flex-start" }}
              >
                Open product {row.product_id}
              </Button>
            </Stack>
          ))}
          <ReportPageControls
            label="pharmacy positions"
            pagination={report.pagination}
            onPage={setPage}
          />
          <Typography variant="subtitle1" component="h4">
            Office stock
          </Typography>
          <Typography variant="body2">
            {report.office_quantity} each across office items. Office stock has
            no location or expiry tracking.
          </Typography>
          {report.office_records.map((row) => (
            <Typography key={row.id} variant="body2">
              {row.name} ({row.sku}): {row.quantity} each; reorder level{" "}
              {row.reorder_level}
              {row.low_stock ? " - reorder needed" : ""}.
            </Typography>
          ))}
          <ReportPageControls
            label="office items"
            pagination={report.office_pagination}
            onPage={setOfficePage}
          />
          <Typography variant="caption" color="text.secondary">
            Source: {report.source}. As of {report.as_of}; inventory date{" "}
            {report.inventory_date} ({report.timezone}). Current balances, not a
            historical snapshot. Available stock follows existing hold, expiry,
            product and location rules. Units and stock types are kept separate.
          </Typography>
          <Button
            size="small"
            onClick={result.refresh}
            sx={{ alignSelf: "flex-start" }}
          >
            Refresh stock snapshot
          </Button>
        </>
      )}
    </Stack>
  );
}

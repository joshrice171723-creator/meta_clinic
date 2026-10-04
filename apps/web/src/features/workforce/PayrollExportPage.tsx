import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Link,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  ApiError,
  api,
  SESSION_CHANGED_EVENT,
  CLINIC_LOCATION_CHANGED_EVENT,
} from "../../api/client";
import { useClinic } from "../clinic/Workspace";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import { businessNow } from "../../shared/businessDate";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

type Column = { field: string; header: string };
type Configuration = {
  id: string;
  site_id: string;
  name: string;
  revision: number;
  effective_from: string;
  columns: Column[];
  employee_identifiers: Record<string, string>;
};
type Batch = {
  id: string;
  created_at: string;
  source_digest: string;
  row_count: number;
  totals: Record<string, string>;
  download_url: string;
  supersedes_batch_id: string | null;
  superseded_by_batch_id: string | null;
  source_periods: {
    employment_id: string;
    period_start: string;
    period_end: string;
  }[];
};
type PayrollData = {
  permissions: { configure: boolean; export: boolean };
  configurations: Configuration[];
  batches: Batch[];
  fields: string[];
  default_columns: Column[];
  employees: { id: string; name: string }[];
  timecards: {
    id: string;
    employment_id: string;
    period_start: string;
    period_end: string;
    version: number;
  }[];
};
type Preview = {
  rows: Record<string, string>[];
  totals: Record<string, string>;
  source_digest: string;
};
type ExportAttempt = {
  configuration_version_id: string;
  timecard_version_ids: string[];
  idempotency_key: string;
  supersedes_batch_id: string | null;
};

function sameWorkweek(
  left: Batch["source_periods"][number],
  right: Batch["source_periods"][number],
) {
  return (
    left.employment_id === right.employment_id &&
    left.period_start === right.period_start &&
    left.period_end === right.period_end
  );
}

export function PayrollExportPage() {
  const clinic = useClinic();
  const { navigate, registerBlocker } = useClinicNavigation();
  const [siteId, setSiteId] = useState(() =>
    String(clinic.current_site?.id || clinic.sites[0]?.id || ""),
  );
  const [data, setData] = useState<PayrollData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const downloadRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const cancelDownload = () => {
      if (!downloadRequest.current) return;
      downloadRequest.current.abort();
      downloadRequest.current = null;
      setBusy(false);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, cancelDownload);
    window.addEventListener(CLINIC_LOCATION_CHANGED_EVENT, cancelDownload);
    return () => {
      downloadRequest.current?.abort();
      downloadRequest.current = null;
      window.removeEventListener(SESSION_CHANGED_EVENT, cancelDownload);
      window.removeEventListener(CLINIC_LOCATION_CHANGED_EVENT, cancelDownload);
    };
  }, []);
  const [reload, setReload] = useState(0);
  const [name, setName] = useState("Payroll hours");
  const [columns, setColumns] = useState<Column[]>([]);
  const [identifiers, setIdentifiers] = useState<Record<string, string>>({});
  const [configurationId, setConfigurationId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [supersedes, setSupersedes] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [unconfirmedExport, setUnconfirmedExport] =
    useState<ExportAttempt | null>(null);
  const canConfigure = data?.permissions.configure === true;
  const canExport = data?.permissions.export === true;
  const configuration = data?.configurations.find(
    (item) => item.id === configurationId,
  );
  const previewColumns = configuration?.columns || [];
  const selectedCards =
    data?.timecards.filter((card) => selected.includes(card.id)) ?? [];
  const originalBatch = data?.batches.find((batch) => batch.id === supersedes);
  const missingCorrectionPeriods =
    originalBatch?.source_periods.filter(
      (period) => !selectedCards.some((card) => sameWorkweek(period, card)),
    ) ?? [];
  const extraCorrectionCards = originalBatch
    ? selectedCards.filter(
        (card) =>
          !originalBatch.source_periods.some((period) =>
            sameWorkweek(period, card),
          ),
      )
    : [];
  const missingPayrollEmployees = [
    ...new Set(selectedCards.map((card) => card.employment_id)),
  ].filter((id) => !configuration?.employee_identifiers[id]?.trim());
  const selectionNotReady =
    !configuration ||
    selectedCards.length !== selected.length ||
    missingPayrollEmployees.length > 0 ||
    missingCorrectionPeriods.length > 0 ||
    extraCorrectionCards.length > 0 ||
    (!!supersedes && !originalBatch);
  const employeeName = (id: string) =>
    data?.employees.find((employee) => employee.id === id)?.name ||
    `Employee ${id}`;
  const controlsLocked = busy || unconfirmedExport !== null;
  const leaveMessage = busy
    ? "A payroll action is still in progress."
    : unconfirmedExport
      ? "The export is unconfirmed. Leaving loses its saved retry. Check export history before creating another file."
      : settingsDirty
        ? "Discard unsaved payroll file settings?"
        : null;
  useDemoNavigationBlocker(() => ({ blocked: busy, message: leaveMessage }));
  useEffect(() => {
    if (!leaveMessage) return;
    const unregister = registerBlocker(() => leaveMessage, {
      preventNavigation: busy,
    });
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = leaveMessage;
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [leaveMessage, busy, registerBlocker]);

  function confirmReload() {
    return !leaveMessage || (!busy && window.confirm(leaveMessage));
  }

  function resetSettings(result: PayrollData) {
    const latest = result.configurations[0];
    setName(latest?.name || "Payroll hours");
    setColumns(latest?.columns || result.default_columns);
    setIdentifiers(latest?.employee_identifiers || {});
    setSettingsDirty(false);
  }

  function refreshRecords() {
    if (!confirmReload()) return;
    setSettingsDirty(false);
    setUnconfirmedExport(null);
    setRequestKey(crypto.randomUUID());
    setData(null);
    setReload((value) => value + 1);
  }
  const canManageEmployees = clinic.capabilities.workforce_admin === true;
  const canOpenTimecards =
    clinic.capabilities.workforce_timecards_read === true ||
    clinic.capabilities.workforce_timecards_review === true ||
    clinic.capabilities.workforce_timecards_approve === true;

  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    setData(null);
    setError("");
    setPreview(null);
    setSelected([]);
    setSupersedes("");
    api<PayrollData>(
      `/api/clinic/workforce/payroll-exports?site_id=${encodeURIComponent(siteId)}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        resetSettings(result);
        setConfigurationId(
          result.configurations.find(
            (item) => new Date(item.effective_from) <= businessNow(),
          )?.id || "",
        );
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load payroll exports.",
          );
      });
    return () => controller.abort();
  }, [siteId, reload]);

  function invalidatePreview() {
    setPreview(null);
    setNotice("");
    setRequestKey(crypto.randomUUID());
  }

  async function saveConfiguration() {
    if (!data || controlsLocked) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/clinic/workforce/payroll-exports/configuration", {
        method: "POST",
        body: {
          site_id: siteId,
          configuration: {
            name,
            effective_from: businessNow().toISOString(),
            expected_revision: data.configurations[0]?.revision || 0,
            columns,
            employee_identifiers: Object.fromEntries(
              Object.entries(identifiers)
                .filter(([, value]) => value.trim())
                .map(([key, value]) => [key, value.trim()]),
            ),
          },
        },
      });
      setNotice("Payroll settings saved as a new version.");
      setSettingsDirty(false);
      setData(null);
      setReload((value) => value + 1);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save payroll settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function generate(isPreview: boolean) {
    if (busy || settingsDirty || !configurationId || !selected.length) return;
    if (!unconfirmedExport && selectionNotReady) return;
    setBusy(true);
    setError("");
    setNotice("");
    const body = unconfirmedExport || {
      configuration_version_id: configurationId,
      timecard_version_ids: selected,
      idempotency_key: requestKey,
      supersedes_batch_id: supersedes || null,
    };
    try {
      if (isPreview) {
        setPreview(null);
        const result = await api<Preview>(
          "/api/clinic/workforce/payroll-exports/preview",
          { method: "POST", body },
        );
        setPreview(result);
      } else {
        setUnconfirmedExport(body);
        const result = await api<{ batch: Batch }>(
          "/api/clinic/workforce/payroll-exports",
          { method: "POST", body },
        );
        setNotice(`Export ${result.batch.id} is saved and ready to download.`);
        setPreview(null);
        setUnconfirmedExport(null);
        setRequestKey(crypto.randomUUID());
        setData(null);
        setReload((value) => value + 1);
      }
    } catch (reason) {
      const knownRejection =
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        ![408, 429].includes(reason.status);
      const confirmedRejection = knownRejection && !unconfirmedExport;
      if (!isPreview && confirmedRejection) {
        setUnconfirmedExport(null);
        setPreview(null);
      }
      setError(
        `${reason instanceof Error ? reason.message : "The export could not be confirmed."} ${isPreview || confirmedRejection ? "Review the selection and preview again." : "The earlier export remains unconfirmed. Retry export to recover the same saved file, or refresh and check export history."}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function download(batch: Batch) {
    if (busy || downloadRequest.current || !canExport) return;
    const controller = new AbortController();
    downloadRequest.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const file = await api<{
        filename: string;
        content_type: string;
        content: string;
      }>(`${batch.download_url}?response_format=json`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (typeof file.content !== "string" || typeof file.filename !== "string")
        throw new Error("The payroll file response was incomplete.");
      const bytes = new TextEncoder().encode(file.content);
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      )
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      if (controller.signal.aborted) return;
      if (digest !== batch.source_digest)
        throw new Error(
          "The file did not match this saved export. Refresh export history before downloading again.",
        );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      setNotice(
        `Download requested for ${file.filename}. Check your browser downloads for the file.`,
      );
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          `${reason instanceof Error ? reason.message : "The download could not be completed."} The saved export remains available; retry its download without creating a new export.`,
        );
    } finally {
      if (downloadRequest.current === controller) {
        downloadRequest.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" component="h2">
          Payroll exports
        </Typography>
        <Typography color="text.secondary">
          Review approved hours and download a payroll file. Exporting does not
          send payments.
        </Typography>
      </Box>
      <TextField
        select
        label="Location"
        value={siteId}
        onChange={(event) => {
          if (!confirmReload()) return;
          setSiteId(event.target.value);
          setData(null);
          setSettingsDirty(false);
          setUnconfirmedExport(null);
          setSupersedes("");
          invalidatePreview();
        }}
        disabled={controlsLocked}
        sx={{ maxWidth: 360 }}
      >
        {clinic.sites.map((site) => (
          <MenuItem key={site.id} value={String(site.id)}>
            {site.name || site.code}
          </MenuItem>
        ))}
      </TextField>
      <Button
        onClick={refreshRecords}
        disabled={busy || !siteId}
        sx={{ alignSelf: "start" }}
      >
        {error && !data
          ? "Retry loading payroll records"
          : "Refresh payroll records"}
      </Button>
      {!siteId && (
        <Alert severity="info">
          Add an eligible location before configuring payroll exports.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {unconfirmedExport && (
        <Alert severity="warning">
          The export has not been confirmed. Retry export with the saved
          selection before changing it. Refreshing discards this retry; check
          export history before creating another file.
        </Alert>
      )}
      {!data && siteId && !error && (
        <Typography role="status">Loading payroll records…</Typography>
      )}
      {data && (
        <>
          {canExport && (
            <Stack
              component="section"
              spacing={2}
              aria-label="Prepare payroll file"
            >
              <Typography variant="h6">Approved timecards</Typography>
              <Stack direction={{ xs: "column", md: "row" }} sx={{ gap: 2 }}>
                <TextField
                  select
                  label="Configuration version"
                  value={configurationId}
                  onChange={(event) => {
                    setConfigurationId(event.target.value);
                    invalidatePreview();
                  }}
                  disabled={controlsLocked}
                  sx={{ minWidth: 240 }}
                >
                  {data.configurations.map((configuration) => (
                    <MenuItem
                      key={configuration.id}
                      value={configuration.id}
                      disabled={
                        new Date(configuration.effective_from) > businessNow()
                      }
                    >
                      {configuration.name} · version {configuration.revision}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Correct a previous export"
                  value={supersedes}
                  onChange={(event) => {
                    const batchId = event.target.value;
                    setSupersedes(batchId);
                    const original = data.batches.find(
                      (batch) => batch.id === batchId,
                    );
                    setSelected(
                      original
                        ? data.timecards
                            .filter((card) =>
                              original.source_periods.some(
                                (period) =>
                                  period.employment_id === card.employment_id &&
                                  period.period_start === card.period_start &&
                                  period.period_end === card.period_end,
                              ),
                            )
                            .map((card) => card.id)
                        : [],
                    );
                    invalidatePreview();
                  }}
                  disabled={controlsLocked}
                  sx={{ minWidth: 240 }}
                >
                  <MenuItem value="">New export</MenuItem>
                  {data.batches
                    .filter((batch) => !batch.superseded_by_batch_id)
                    .map((batch) => (
                      <MenuItem key={batch.id} value={batch.id}>
                        Export {batch.id} ·{" "}
                        {new Date(batch.created_at).toLocaleDateString()}
                      </MenuItem>
                    ))}
                </TextField>
              </Stack>
              {supersedes && (
                <Alert severity="info">
                  A correction must include the same employees and workweeks as
                  export {supersedes}. Their latest approved cards have been
                  selected where available. Recalculate and approve any missing
                  cards, then refresh before continuing.
                </Alert>
              )}
              {missingCorrectionPeriods.length > 0 && (
                <Alert severity="warning">
                  Select an approved timecard for every employee and workweek in
                  the original export:
                  <Stack component="ul" spacing={0.5} sx={{ my: 1, pl: 2 }}>
                    {missingCorrectionPeriods.map((period) => (
                      <Typography
                        component="li"
                        key={`${period.employment_id}-${period.period_start}-${period.period_end}`}
                      >
                        {employeeName(period.employment_id)} ·{" "}
                        {period.period_start} to {period.period_end} (end
                        exclusive) ·{" "}
                        {data.timecards.some((card) =>
                          sameWorkweek(period, card),
                        )
                          ? "available below, not selected"
                          : "no eligible approved card available"}
                      </Typography>
                    ))}
                  </Stack>
                  {canOpenTimecards && (
                    <Button
                      color="inherit"
                      onClick={() => navigate("/clinic/workforce/timecards")}
                    >
                      Review timecards
                    </Button>
                  )}
                </Alert>
              )}
              {configuration && missingPayrollEmployees.length > 0 && (
                <Alert severity="warning">
                  The selected file configuration has no payroll ID for{" "}
                  {missingPayrollEmployees.map(employeeName).join(", ")}.{" "}
                  {canConfigure
                    ? "Save their IDs in File settings, then select the new configuration version."
                    : "Ask a payroll configuration administrator to save their IDs before previewing this selection."}
                </Alert>
              )}
              <Typography role="status">
                {selectedCards.length} timecards selected for{" "}
                {new Set(selectedCards.map((card) => card.employment_id)).size}{" "}
                employees.
              </Typography>
              {settingsDirty && (
                <Alert severity="info">
                  Save or discard file-setting changes before preparing an
                  export.
                </Alert>
              )}
              {!configurationId && (
                <Alert severity="info">
                  Save file settings before preparing an export.
                </Alert>
              )}
              {data.timecards.map((card) => (
                <FormControlLabel
                  key={card.id}
                  control={
                    <Checkbox
                      disabled={
                        controlsLocked ||
                        (!!originalBatch &&
                          !originalBatch.source_periods.some((period) =>
                            sameWorkweek(period, card),
                          ))
                      }
                      checked={selected.includes(card.id)}
                      onChange={(event) => {
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, card.id]
                            : current.filter((id) => id !== card.id),
                        );
                        invalidatePreview();
                      }}
                    />
                  }
                  label={`${data.employees.find((employee) => employee.id === card.employment_id)?.name || "Employee"} · ${card.period_start} to ${card.period_end} (end exclusive) · version ${card.version}`}
                />
              ))}
              {!data.timecards.length && (
                <Alert
                  severity="info"
                  action={
                    canOpenTimecards ? (
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => navigate("/clinic/workforce/timecards")}
                      >
                        Open Timecards
                      </Button>
                    ) : undefined
                  }
                >
                  No approved timecards are available.{" "}
                  {canOpenTimecards
                    ? "Check the current cards in Timecards; resolve exceptions and follow the configured submission and approval path before exporting."
                    : "Ask an authorized employee or timecard reviewer to resolve exceptions and complete the configured submission and approval path before exporting."}
                </Alert>
              )}
              <Stack direction="row" sx={{ gap: 2 }}>
                <Button
                  variant="outlined"
                  disabled={
                    controlsLocked ||
                    settingsDirty ||
                    !selected.length ||
                    !configurationId ||
                    selectionNotReady
                  }
                  onClick={() => void generate(true)}
                >
                  Preview export
                </Button>
                <Button
                  variant="contained"
                  disabled={
                    busy ||
                    settingsDirty ||
                    (!unconfirmedExport && (!preview || selectionNotReady))
                  }
                  onClick={() => void generate(false)}
                >
                  {unconfirmedExport ? "Retry export" : "Create export"}
                </Button>
              </Stack>
              {preview && (
                <Box>
                  <Typography>
                    {preview.rows.length} rows · {preview.totals.paid_hours}{" "}
                    paid hours · {preview.totals.overtime_hours} overtime hours
                  </Typography>
                  <TableContainer>
                    <Table size="small" aria-label="Payroll preview">
                      <TableHead>
                        <TableRow>
                          {previewColumns.map((column) => (
                            <TableCell key={column.field}>
                              {column.header}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {preview.rows.slice(0, 25).map((row, index) => (
                          <TableRow key={index}>
                            {previewColumns.map((column) => (
                              <TableCell key={column.field}>
                                {row[column.field]}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {preview.rows.length > 25 && (
                    <Typography>
                      Showing the first 25 rows. All {preview.rows.length} rows
                      are included in the file.
                    </Typography>
                  )}
                </Box>
              )}
            </Stack>
          )}
          {canExport && (
            <Stack component="section" spacing={1} aria-label="Export history">
              <Typography variant="h6">Export history</Typography>
              {data.batches.map((batch) => (
                <Box
                  key={batch.id}
                  sx={{ borderBottom: 1, borderColor: "divider", py: 1 }}
                >
                  <Button disabled={busy} onClick={() => void download(batch)}>
                    Download export {batch.id}
                  </Button>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(batch.created_at).toLocaleString()} ·{" "}
                    {batch.row_count} rows · {batch.totals.paid_hours} paid
                    hours
                    {batch.supersedes_batch_id
                      ? ` · corrects export ${batch.supersedes_batch_id}`
                      : ""}
                    {batch.superseded_by_batch_id
                      ? ` · replaced by export ${batch.superseded_by_batch_id}`
                      : ""}
                  </Typography>
                </Box>
              ))}
              {!data.batches.length && (
                <Typography>
                  No payroll files have been created for this location.
                </Typography>
              )}
            </Stack>
          )}
          {canConfigure && (
            <Stack
              component="section"
              spacing={2}
              aria-label="Payroll file settings"
            >
              <Typography variant="h6">File settings</Typography>
              <Typography color="text.secondary">
                Custom CSV. Column headings and employee payroll IDs are saved
                for this location. Enable payroll exports in{" "}
                {clinic.capabilities.workforce_settings === true ? (
                  <Link
                    component="button"
                    type="button"
                    onClick={() =>
                      navigate(
                        `/clinic/workforce/settings?site_id=${encodeURIComponent(siteId)}&focus=payroll_export_enabled`,
                      )
                    }
                  >
                    Location rules
                  </Link>
                ) : (
                  "Location rules"
                )}{" "}
                before generating a file.
              </Typography>
              <TextField
                label="Configuration name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSettingsDirty(true);
                }}
                disabled={controlsLocked}
                slotProps={{ htmlInput: { maxLength: 100 } }}
                sx={{ maxWidth: 440 }}
              />
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
                {columns.map((column, index) => (
                  <TextField
                    key={column.field}
                    label={`${column.field.replaceAll("_", " ")} column`}
                    value={column.header}
                    onChange={(event) => {
                      setSettingsDirty(true);
                      setColumns((current) =>
                        current.map((item, position) =>
                          position === index
                            ? { ...item, header: event.target.value }
                            : item,
                        ),
                      );
                    }}
                    disabled={controlsLocked}
                    slotProps={{ htmlInput: { maxLength: 80 } }}
                  />
                ))}
              </Stack>
              <TableContainer>
                <Table size="small" aria-label="Employee payroll identifiers">
                  <TableHead>
                    <TableRow>
                      <TableCell>Employee</TableCell>
                      <TableCell>Payroll ID</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.employees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>{employee.name}</TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            label={`Payroll ID for ${employee.name}`}
                            value={identifiers[employee.id] || ""}
                            onChange={(event) => {
                              setSettingsDirty(true);
                              setIdentifiers((current) => ({
                                ...current,
                                [employee.id]: event.target.value,
                              }));
                            }}
                            disabled={controlsLocked}
                            slotProps={{ htmlInput: { maxLength: 100 } }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {!data.employees.length && (
                <Alert
                  severity="info"
                  action={
                    canManageEmployees ? (
                      <Button
                        color="inherit"
                        size="small"
                        onClick={() => navigate("/clinic/workforce/employees")}
                      >
                        Manage employees
                      </Button>
                    ) : undefined
                  }
                >
                  No employees are assigned to this location.{" "}
                  {canManageEmployees
                    ? "Activate or link employees and assign this location before mapping payroll IDs."
                    : "Ask a workforce administrator to assign employees to this location."}
                </Alert>
              )}
              <Button
                variant="outlined"
                onClick={() => void saveConfiguration()}
                disabled={
                  controlsLocked ||
                  !name.trim() ||
                  (!settingsDirty && data.configurations.length > 0)
                }
                sx={{ alignSelf: "start" }}
              >
                Save file settings
              </Button>
              {settingsDirty && (
                <Button
                  onClick={() => resetSettings(data)}
                  disabled={controlsLocked}
                  sx={{ alignSelf: "start" }}
                >
                  Discard file-setting changes
                </Button>
              )}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}

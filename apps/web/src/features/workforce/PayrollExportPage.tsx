import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
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
import { api } from "../../api/client";
import { useClinic } from "../clinic/Workspace";
import { businessNow } from "../../shared/businessDate";

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
};
type PayrollData = {
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

export function PayrollExportPage() {
  const clinic = useClinic();
  const [siteId, setSiteId] = useState(() =>
    String(clinic.current_site?.id || clinic.sites[0]?.id || ""),
  );
  const [data, setData] = useState<PayrollData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [name, setName] = useState("Payroll hours");
  const [columns, setColumns] = useState<Column[]>([]);
  const [identifiers, setIdentifiers] = useState<Record<string, string>>({});
  const [configurationId, setConfigurationId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [supersedes, setSupersedes] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const canConfigure = clinic.capabilities.workforce_payroll_configure === true;
  const canExport = clinic.capabilities.workforce_payroll_export === true;

  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    setData(null);
    setError("");
    setPreview(null);
    setSelected([]);
    api<PayrollData>(
      `/api/clinic/workforce/payroll-exports?site_id=${encodeURIComponent(siteId)}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        const latest = result.configurations[0];
        setName(latest?.name || "Payroll hours");
        setColumns(latest?.columns || result.default_columns);
        setIdentifiers(latest?.employee_identifiers || {});
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
    if (!data) return;
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
    setBusy(true);
    setError("");
    setNotice("");
    const body = {
      configuration_version_id: configurationId,
      timecard_version_ids: selected,
      idempotency_key: requestKey,
      supersedes_batch_id: supersedes || null,
    };
    try {
      if (isPreview) {
        const result = await api<Preview>(
          "/api/clinic/workforce/payroll-exports/preview",
          { method: "POST", body },
        );
        setPreview(result);
      } else {
        const result = await api<{ batch: Batch }>(
          "/api/clinic/workforce/payroll-exports",
          { method: "POST", body },
        );
        setNotice(`Export ${result.batch.id} is saved and ready to download.`);
        setPreview(null);
        setRequestKey(crypto.randomUUID());
        setReload((value) => value + 1);
      }
    } catch (reason) {
      setError(
        `${reason instanceof Error ? reason.message : "The export could not be confirmed."} You can retry with the same selection.`,
      );
    } finally {
      setBusy(false);
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
          setSiteId(event.target.value);
          setSupersedes("");
          invalidatePreview();
        }}
        disabled={busy}
        sx={{ maxWidth: 360 }}
      >
        {clinic.sites.map((site) => (
          <MenuItem key={site.id} value={String(site.id)}>
            {site.name || site.code}
          </MenuItem>
        ))}
      </TextField>
      {!siteId && (
        <Alert severity="info">
          Add an eligible location before configuring payroll exports.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {!data && siteId && !error && (
        <Typography role="status">Loading payroll records…</Typography>
      )}
      {data && (
        <>
          {canConfigure && (
            <Stack
              component="section"
              spacing={2}
              aria-label="Payroll file settings"
            >
              <Typography variant="h6">File settings</Typography>
              <Typography color="text.secondary">
                Custom CSV. Column headings and employee payroll IDs are saved
                for this location. Enable payroll exports in Location rules
                before generating a file.
              </Typography>
              <TextField
                label="Configuration name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
                slotProps={{ htmlInput: { maxLength: 100 } }}
                sx={{ maxWidth: 440 }}
              />
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
                {columns.map((column, index) => (
                  <TextField
                    key={column.field}
                    label={`${column.field.replaceAll("_", " ")} column`}
                    value={column.header}
                    onChange={(event) =>
                      setColumns((current) =>
                        current.map((item, position) =>
                          position === index
                            ? { ...item, header: event.target.value }
                            : item,
                        ),
                      )
                    }
                    disabled={busy}
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
                            onChange={(event) =>
                              setIdentifiers((current) => ({
                                ...current,
                                [employee.id]: event.target.value,
                              }))
                            }
                            disabled={busy}
                            slotProps={{ htmlInput: { maxLength: 100 } }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {!data.employees.length && (
                <Typography>
                  No employees are assigned to this location.
                </Typography>
              )}
              <Button
                variant="outlined"
                onClick={() => void saveConfiguration()}
                disabled={busy || !name.trim()}
                sx={{ alignSelf: "start" }}
              >
                Save file settings
              </Button>
            </Stack>
          )}
          {canExport && <Stack
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
                disabled={busy}
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
                  setSupersedes(event.target.value);
                  invalidatePreview();
                }}
                disabled={busy}
                sx={{ minWidth: 240 }}
              >
                <MenuItem value="">New export</MenuItem>
                {data.batches.map((batch) => (
                  <MenuItem key={batch.id} value={batch.id}>
                    Export {batch.id} ·{" "}
                    {new Date(batch.created_at).toLocaleDateString()}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
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
                    disabled={busy}
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
              <Typography>
                No approved timecards are available. Resolve exceptions and
                approve hours in Timecards first.
              </Typography>
            )}
            <Stack direction="row" sx={{ gap: 2 }}>
              <Button
                variant="outlined"
                disabled={busy || !selected.length || !configurationId}
                onClick={() => void generate(true)}
              >
                Preview export
              </Button>
              <Button
                variant="contained"
                disabled={busy || !preview}
                onClick={() => void generate(false)}
              >
                Create export
              </Button>
            </Stack>
            {preview && (
              <Box>
                <Typography>
                  {preview.rows.length} rows · {preview.totals.paid_hours} paid
                  hours · {preview.totals.overtime_hours} overtime hours
                </Typography>
                <TableContainer>
                  <Table size="small" aria-label="Payroll preview">
                    <TableHead>
                      <TableRow>
                        {Object.keys(preview.rows[0] || {}).map((key) => (
                          <TableCell key={key}>
                            {key.replaceAll("_", " ")}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.rows.slice(0, 25).map((row, index) => (
                        <TableRow key={index}>
                          {Object.entries(row).map(([key, value]) => (
                            <TableCell key={key}>{value}</TableCell>
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
          </Stack>}
          {canExport && <Stack component="section" spacing={1} aria-label="Export history">
            <Typography variant="h6">Export history</Typography>
            {data.batches.map((batch) => (
              <Box
                key={batch.id}
                sx={{ borderBottom: 1, borderColor: "divider", py: 1 }}
              >
                <Button component="a" href={batch.download_url}>
                  Download export {batch.id}
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {new Date(batch.created_at).toLocaleString()} ·{" "}
                  {batch.row_count} rows · {batch.totals.paid_hours} paid hours
                  {batch.supersedes_batch_id
                    ? ` · corrects export ${batch.supersedes_batch_id}`
                    : ""}
                </Typography>
              </Box>
            ))}
            {!data.batches.length && (
              <Typography>
                No payroll files have been created for this location.
              </Typography>
            )}
          </Stack>}
        </>
      )}
    </Stack>
  );
}

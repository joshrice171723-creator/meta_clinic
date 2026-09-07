import AddIcon from "@mui/icons-material/Add";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useClinic } from "./Workspace";
import { localDateTimeInput } from "./frontDeskModel";

export type LabResult = {
  name: string;
  code: string | null;
  value: string;
  unit: string | null;
  reference_range: string | null;
  flag: string | null;
};
export type LabReportVersion = {
  id: number;
  lab_report_id: number;
  patient_id: number;
  version_number: number;
  title: string;
  status: "preliminary" | "final" | "amended" | "corrected" | "cancelled";
  collected_at: string | null;
  issued_at: string | null;
  results: LabResult[];
  entry_kind: "manual";
  content_digest: string;
  recorded_at: string;
  recorded_by: number | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
};
export type LabReport = {
  id: number;
  patient_id: number;
  source_name: string;
  external_report_id: string | null;
  current_version_id: number;
  current_version: LabReportVersion;
  created_at: string;
  updated_at: string;
  versions?: LabReportVersion[];
};
type Index = {
  reports: LabReport[];
  pagination: { page: number; per_page: number; total: number };
  can_write: boolean;
  can_review: boolean;
};
type Form = {
  source_name: string;
  external_report_id: string;
  title: string;
  status: LabReportVersion["status"];
  collected_at: string;
  issued_at: string;
  results: LabResult[];
  confirmed: boolean;
};
const blankResult = (): LabResult => ({
  name: "",
  code: null,
  value: "",
  unit: null,
  reference_range: null,
  flag: null,
});
const blankForm = (): Form => ({
  source_name: "",
  external_report_id: "",
  title: "",
  status: "final",
  collected_at: "",
  issued_at: "",
  results: [blankResult()],
  confirmed: false,
});
const versionForm = (report: LabReport): Form => ({
  source_name: report.source_name,
  external_report_id: report.external_report_id ?? "",
  title: report.current_version.title,
  status: report.current_version.status,
  collected_at: report.current_version.collected_at ?? "",
  issued_at: report.current_version.issued_at ?? "",
  results: report.current_version.results.map((row) => ({ ...row })),
  confirmed: false,
});
const initialPage = () => {
  const page = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
};
const initialDirectReview = () => {
  const params = new URLSearchParams(window.location.search);
  const reportId = Number(params.get("lab_report_id"));
  const versionId = Number(params.get("lab_version_id"));
  return Number.isSafeInteger(reportId) &&
    reportId > 0 &&
    Number.isSafeInteger(versionId) &&
    versionId > 0
    ? { reportId, versionId }
    : null;
};
const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString()
    : "Date not recorded";
};

export function PatientLabReports({
  patientId,
  patientName,
}: {
  patientId: number;
  patientName?: string;
}) {
  const { capabilities } = useClinic();
  const [data, setData] = useState<Index>();
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form>(blankForm);
  const [formBaseline, setFormBaseline] = useState<Form>(blankForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LabReport | null>(null);
  const [history, setHistory] = useState<LabReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(initialPage);
  const [reload, setReload] = useState(0);
  const [retryPending, setRetryPending] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    report: LabReport;
    version: LabReportVersion;
  } | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewRetryPending, setReviewRetryPending] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [directReviewError, setDirectReviewError] = useState("");
  const attempt = useRef<{ key: string; body: unknown; path: string } | null>(
    null,
  );
  const reviewAttempt = useRef<{ key: string; path: string } | null>(null);
  const directReview = useRef(initialDirectReview());
  const canRead =
    capabilities.patients === true && capabilities.notes_read === true;
  const canWrite =
    capabilities.observations_write === true && data?.can_write === true;
  const canReview =
    capabilities.notes_write === true && data?.can_review === true;
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController();
    setError("");
    api<Index>(
      `/api/clinic/patients/${patientId}/lab_reports?page=${page}&per_page=25`,
      { signal: controller.signal },
    )
      .then((result) => !controller.signal.aborted && setData(result))
      .catch(
        (reason: unknown) =>
          !controller.signal.aborted &&
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load lab reports.",
          ),
      );
    return () => controller.abort();
  }, [canRead, page, patientId, reload]);
  useEffect(() => {
    const target = directReview.current;
    if (!canRead || !data || !target) return;
    directReview.current = null;
    const controller = new AbortController();
    api<{ report: LabReport }>(
      `/api/clinic/patients/${patientId}/lab_reports/${target.reportId}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const report = result.report;
        const version =
          report.current_version_id === target.versionId &&
          report.current_version.id === target.versionId &&
          report.current_version.reviewed_at === null
            ? report.current_version
            : null;
        if (
          report.id !== target.reportId ||
          report.patient_id !== patientId ||
          !version
        ) {
          setHistory(report);
          setDirectReviewError(
            "This report version is no longer current or has already been reviewed. The report history is open so you can check the current record.",
          );
          return;
        }
        if (canReview) {
          setReviewTarget({ report, version });
          setReviewConfirmed(false);
        } else {
          setHistory(report);
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setDirectReviewError(
          reason instanceof Error
            ? reason.message
            : "Unable to open the selected lab report.",
        );
      });
    return () => controller.abort();
  }, [canRead, canReview, data, patientId]);
  const save = async () => {
    if (
      !canWrite ||
      !form.confirmed ||
      !form.source_name.trim() ||
      !form.title.trim() ||
      !Number.isFinite(new Date(form.collected_at).getTime()) ||
      !Number.isFinite(new Date(form.issued_at).getTime()) ||
      !form.results.length ||
      form.results.some((row) => !row.name.trim() || !row.value.trim())
    ) {
      setError(
        "Enter the report source, title, collection and report times, each result name and value, then confirm the patient match.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const current =
        attempt.current ??
        (() => {
          const key = crypto.randomUUID();
          const report = {
            request_key: key,
            confirmed_patient: true,
            ...(editing
              ? {}
              : {
                  source_name: form.source_name.trim(),
                  external_report_id: form.external_report_id.trim() || null,
                }),
            title: form.title.trim(),
            status: form.status,
            collected_at: new Date(form.collected_at).toISOString(),
            issued_at: new Date(form.issued_at).toISOString(),
            results: form.results.map((row) => ({
              name: row.name.trim(),
              code: row.code?.trim() || null,
              value: row.value.trim(),
              unit: row.unit?.trim() || null,
              reference_range: row.reference_range?.trim() || null,
              flag: row.flag?.trim() || null,
            })),
          };
          const next = editing
            ? {
                key,
                path: `/api/clinic/patients/${patientId}/lab_reports/${editing.id}/versions`,
                body: {
                  lab_report_version: {
                    ...report,
                    expected_current_version_id: editing.current_version_id,
                  },
                },
              }
            : {
                key,
                path: `/api/clinic/patients/${patientId}/lab_reports`,
                body: { lab_report: report },
              };
          attempt.current = next;
          return next;
        })();
      await api(current.path, { method: "POST", body: current.body });
      attempt.current = null;
      setRetryPending(false);
      setEditing(null);
      setFormOpen(false);
      setForm(blankForm());
      setFormBaseline(blankForm());
      setNotice(
        editing ? "Correction version recorded." : "Lab report recorded.",
      );
      setReload((current) => current + 1);
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        if (reason.code !== "outcome_unconfirmed") attempt.current = null;
        setRetryPending(reason.code === "outcome_unconfirmed");
        setError(
          reason.code === "outcome_unconfirmed"
            ? "The save outcome is unknown. Retry this unchanged report before editing it."
            : reason.status === 409
              ? "This report changed. Reload it before recording a correction."
              : reason.message,
        );
      } else {
        setRetryPending(true);
        setError(
          "The save outcome is unknown. Retry this unchanged report before editing it.",
        );
      }
    } finally {
      setBusy(false);
    }
  };
  const review = async () => {
    const target = reviewTarget;
    if (!canReview || !target || !reviewConfirmed) return;
    const current = reviewAttempt.current ?? {
      key: crypto.randomUUID(),
      path: `/api/clinic/patients/${patientId}/lab_reports/${target.report.id}/versions/${target.version.id}/review`,
    };
    reviewAttempt.current = current;
    setBusy(true);
    setError("");
    try {
      await api(current.path, {
        method: "POST",
        body: { review: { request_key: current.key, confirmed_patient: true } },
      });
      setNotice("Lab version marked reviewed.");
      reviewAttempt.current = null;
      setReviewRetryPending(false);
      setReviewTarget(null);
      setReload((current) => current + 1);
      if (history?.id === target.report.id) setHistory(null);
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        reason.code !== "outcome_unconfirmed"
      ) {
        reviewAttempt.current = null;
        setReviewRetryPending(false);
        setError(reason.message);
      } else {
        setReviewRetryPending(true);
        setError(
          "The review outcome is unknown. Retry this exact review request.",
        );
      }
    } finally {
      setBusy(false);
    }
  };
  const openHistory = async (report: LabReport) => {
    setError("");
    try {
      const result = await api<{ report: LabReport }>(
        `/api/clinic/patients/${patientId}/lab_reports/${report.id}`,
      );
      setHistory(result.report);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load report history.",
      );
    }
  };
  const formDirty = JSON.stringify(form) !== JSON.stringify(formBaseline);
  const closeForm = () => {
    if (busy || retryPending) return;
    setFormOpen(false);
    setEditing(null);
    setForm(blankForm());
    setFormBaseline(blankForm());
  };
  const requestCloseForm = () => {
    if (busy || retryPending) return;
    if (formDirty) setDiscardOpen(true);
    else closeForm();
  };
  if (!canRead)
    return (
      <Alert severity="warning">
        Lab report access is not enabled for this account.
      </Alert>
    );
  return (
    <Stack spacing={2}>
      <Box>
        <Typography component="h2" variant="h6">
          Lab reports
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Record reported results manually. Review is a separate action.
        </Typography>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {directReviewError && (
        <Alert severity="warning">{directReviewError}</Alert>
      )}
      {notice && <Alert severity="success">{notice}</Alert>}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ justifyContent: "space-between" }}
          >
            <Typography variant="subtitle1">Recorded reports</Typography>
            {canWrite && (
              <Button
                startIcon={<AddIcon />}
                disabled={formOpen || busy || retryPending}
                onClick={() => {
                  setEditing(null);
                  const nextForm = blankForm();
                  setForm(nextForm);
                  setFormBaseline(nextForm);
                  setFormOpen(true);
                }}
              >
                New report
              </Button>
            )}
          </Stack>
          {!data ? (
            <Typography color="text.secondary">Loading reports…</Typography>
          ) : data.reports.length === 0 ? (
            <Typography color="text.secondary">
              No lab reports are recorded for this patient.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Report</TableCell>
                  <TableCell>Results</TableCell>
                  <TableCell>Review</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600 }}>
                        {report.current_version.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {report.source_name} · {report.current_version.status} ·{" "}
                        {formatDateTime(report.current_version.issued_at)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {report.current_version.results.slice(0, 2).map((row) => (
                        <Typography key={row.name} variant="body2">
                          {row.name}: {row.value}
                          {row.unit ? ` ${row.unit}` : ""}
                          {row.reference_range
                            ? ` (${row.reference_range})`
                            : ""}
                          {row.flag ? ` · ${row.flag}` : ""}
                        </Typography>
                      ))}
                    </TableCell>
                    <TableCell>
                      {report.current_version.reviewed_at
                        ? "Reviewed"
                        : "Needs review"}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row">
                        {!report.current_version.reviewed_at && canReview && (
                          <Button
                            size="small"
                            disabled={busy || reviewRetryPending}
                            onClick={() => {
                              setError("");
                              setReviewTarget({
                                report,
                                version: report.current_version,
                              });
                              setReviewConfirmed(false);
                            }}
                          >
                            Review
                          </Button>
                        )}
                        <Button
                          size="small"
                          startIcon={<HistoryOutlinedIcon />}
                          onClick={() => void openHistory(report)}
                        >
                          History
                        </Button>
                        {canWrite && (
                          <Button
                            size="small"
                            disabled={formOpen || busy || retryPending}
                            onClick={() => {
                              setEditing(report);
                              const nextForm = versionForm(report);
                              setForm(nextForm);
                              setFormBaseline(nextForm);
                              setFormOpen(true);
                            }}
                          >
                            Correct
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Paper>
      {data && data.pagination.total > data.pagination.per_page && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Button
            size="small"
            disabled={page <= 1 || busy || retryPending}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary">
            Page {data.pagination.page} of{" "}
            {Math.ceil(data.pagination.total / data.pagination.per_page)}
          </Typography>
          <Button
            size="small"
            disabled={
              data.pagination.page >=
                Math.ceil(data.pagination.total / data.pagination.per_page) ||
              busy ||
              retryPending
            }
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </Stack>
      )}
      {canWrite && formOpen && (
        <LabForm
          form={form}
          setForm={setForm}
          editing={editing}
          busy={busy}
          disabled={busy || retryPending}
          onCancel={requestCloseForm}
          onSave={() => void save()}
        />
      )}
      <Dialog
        open={history !== null}
        onClose={() => setHistory(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Report history</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {history?.versions?.map((version) => (
              <Paper key={version.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  sx={{ justifyContent: "space-between" }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>
                      Version {version.version_number} · {version.status}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Recorded {formatDateTime(version.recorded_at)}
                    </Typography>
                  </Box>
                  {!version.reviewed_at &&
                    version.id === history?.current_version_id &&
                    canReview && (
                      <Button
                        disabled={busy}
                        onClick={() => {
                          if (history) {
                            setReviewTarget({ report: history, version });
                            setReviewConfirmed(false);
                          }
                        }}
                      >
                        Mark reviewed
                      </Button>
                    )}
                </Stack>
                {version.results.map((row) => (
                  <Typography key={`${version.id}-${row.name}`} variant="body2">
                    {row.name}: {row.value}
                    {row.unit ? ` ${row.unit}` : ""} ·{" "}
                    {row.reference_range || "Range not recorded"}
                    {row.flag ? ` · ${row.flag}` : ""}
                  </Typography>
                ))}
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setHistory(null)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={discardOpen}
        onClose={() => !busy && !retryPending && setDiscardOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Discard report changes?</DialogTitle>
        <DialogContent dividers>
          <Typography>
            Your unsaved report changes will be discarded.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy || retryPending}
            onClick={() => setDiscardOpen(false)}
          >
            Keep editing
          </Button>
          <Button
            color="error"
            disabled={busy || retryPending}
            onClick={() => {
              setDiscardOpen(false);
              closeForm();
            }}
          >
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={reviewTarget !== null}
        onClose={() => !busy && !reviewRetryPending && setReviewTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Review lab version</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {error && <Alert severity="error">{error}</Alert>}
            {reviewTarget && (
              <>
                <Typography>
                  {patientName ? `${patientName} · ` : ""}Patient #{patientId} ·{" "}
                  {reviewTarget.version.title} · Version{" "}
                  {reviewTarget.version.version_number}
                </Typography>
                {reviewTarget.version.results.map((row) => (
                  <Typography key={row.name} variant="body2">
                    {row.name}: {row.value}
                    {row.unit ? ` ${row.unit}` : ""} ·{" "}
                    {row.reference_range || "Range not recorded"}
                    {row.flag ? ` · ${row.flag}` : ""}
                  </Typography>
                ))}
              </>
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={reviewConfirmed}
                  disabled={busy || reviewRetryPending}
                  onChange={(event) => setReviewConfirmed(event.target.checked)}
                />
              }
              label="I confirmed this lab version belongs to the selected patient."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={busy || reviewRetryPending}
            onClick={() => setReviewTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!reviewConfirmed || busy}
            onClick={() => void review()}
          >
            {reviewRetryPending ? "Retry exact review" : "Mark reviewed"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function LabForm({
  form,
  setForm,
  editing,
  busy,
  disabled,
  onCancel,
  onSave,
}: {
  form: Form;
  setForm: (form: Form) => void;
  editing: LabReport | null;
  busy: boolean;
  disabled: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const update = (changes: Partial<Form>) => {
    if (!disabled) setForm({ ...form, ...changes });
  };
  const result = (index: number, changes: Partial<LabResult>) =>
    update({
      results: form.results.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...changes } : row,
      ),
    });
  return (
    <Paper component="section" variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle1">
          {editing
            ? `Correction for ${editing.current_version.title}`
            : "Record lab report"}
        </Typography>
        <Box
          component="fieldset"
          disabled={disabled}
          sx={{ border: 0, p: 0, m: 0, minWidth: 0, display: "grid", gap: 1.5 }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Source"
              required
              value={form.source_name}
              disabled={Boolean(editing)}
              onChange={(event) => update({ source_name: event.target.value })}
              fullWidth
            />
            <TextField
              label="Accession or external ID"
              value={form.external_report_id}
              disabled={Boolean(editing)}
              onChange={(event) =>
                update({ external_report_id: event.target.value })
              }
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Title"
              required
              value={form.title}
              onChange={(event) => update({ title: event.target.value })}
              fullWidth
            />
            <TextField
              select
              label="Status"
              value={form.status}
              onChange={(event) =>
                update({ status: event.target.value as Form["status"] })
              }
              sx={{ minWidth: 160 }}
            >
              {[
                "preliminary",
                "final",
                "amended",
                "corrected",
                "cancelled",
              ].map((status) => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Collected at"
              required
              type="datetime-local"
              value={
                form.collected_at ? localDateTimeInput(form.collected_at) : ""
              }
              onChange={(event) => update({ collected_at: event.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Your local time"
            />
            <TextField
              label="Reported at"
              required
              type="datetime-local"
              value={form.issued_at ? localDateTimeInput(form.issued_at) : ""}
              onChange={(event) => update({ issued_at: event.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Your local time"
            />
          </Stack>
          {form.results.map((row, index) => (
            <Stack
              key={index}
              direction={{ xs: "column", md: "row" }}
              spacing={1}
            >
              <TextField
                label="Test"
                value={row.name}
                onChange={(event) =>
                  result(index, { name: event.target.value })
                }
              />
              <TextField
                label="Value"
                value={row.value}
                onChange={(event) =>
                  result(index, { value: event.target.value })
                }
              />
              <TextField
                label="Unit"
                value={row.unit ?? ""}
                onChange={(event) =>
                  result(index, { unit: event.target.value || null })
                }
              />
              <TextField
                label="Reference range"
                value={row.reference_range ?? ""}
                onChange={(event) =>
                  result(index, { reference_range: event.target.value || null })
                }
              />
              <TextField
                label="Reported flag"
                value={row.flag ?? ""}
                onChange={(event) =>
                  result(index, { flag: event.target.value || null })
                }
              />
            </Stack>
          ))}
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={form.results.length >= 100}
            onClick={() =>
              update({ results: [...form.results, blankResult()] })
            }
          >
            Add result
          </Button>
          <FormControlLabel
            control={
              <Checkbox
                checked={form.confirmed}
                onChange={(event) =>
                  update({ confirmed: event.target.checked })
                }
              />
            }
            label="I confirmed this report belongs to the selected patient."
          />
        </Box>
        <Button variant="contained" disabled={busy} onClick={onSave}>
          {busy
            ? "Saving…"
            : disabled
              ? "Retry unchanged report"
              : editing
                ? "Record correction"
                : "Record report"}
        </Button>
        <Button disabled={busy || disabled} onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    </Paper>
  );
}

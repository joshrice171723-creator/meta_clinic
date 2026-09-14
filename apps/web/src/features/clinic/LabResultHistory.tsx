import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useResource } from "../../shared/ui";

type Source = {
  report_id: number;
  version_id: number;
  result_index: number;
  name: string;
  code: string | null;
  unit: string | null;
  source_name: string | null;
};

type ResultHistoryItem = {
  report_id: number;
  version_id: number;
  result_index: number;
  version_number: number;
  title: string;
  status: string;
  collected_at: string | null;
  issued_at: string | null;
  recorded_at: string;
  value: string;
  value_kind?: string;
  absent_reason?: string | null;
  unit: string | null;
  reference_range: string | null;
  flag: string | null;
  reviewed_at: string | null;
};

type Response = {
  selected: Source;
  items: ResultHistoryItem[];
  pagination: { page: number; per_page: number; total: number };
  coverage: {
    reports_searched: number;
    total_reports: number;
    truncated: boolean;
  };
};

function dateLabel(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function stateLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function LabResultHistory({
  patientId,
  patientName,
  reportId,
  versionId,
  resultIndex,
  onClose,
  onOpenReport,
}: {
  patientId: number;
  patientName?: string;
  reportId: number;
  versionId: number;
  resultIndex: number;
  onClose: () => void;
  onOpenReport: (reportId: number, versionId: number) => void;
}) {
  const [page, setPage] = useState(1);
  const resource = useResource<Response>(
    `/api/clinic/patients/${patientId}/lab_reports/${reportId}/versions/${versionId}/results/${resultIndex}/history?page=${page}&per_page=25`,
  );
  const data = resource.data;
  const totalPages = data
    ? Math.max(1, Math.ceil(data.pagination.total / data.pagination.per_page))
    : 1;
  const outOfRange = data !== undefined && page > totalPages;

  useEffect(() => {
    if (outOfRange) setPage(totalPages);
  }, [outOfRange, totalPages]);

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      aria-labelledby="lab-result-history-title"
    >
      <DialogTitle id="lab-result-history-title">
        Lab result history
        {patientName && (
          <Typography component="div" variant="body2" color="text.secondary">
            {patientName}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {!data && !resource.error && (
            <Typography role="status" color="text.secondary">
              Loading matching results…
            </Typography>
          )}
          {resource.error && (
            <Alert
              severity="error"
              action={
                <Stack direction="row" spacing={1}>
                  <Button
                    color="inherit"
                    size="small"
                    onClick={resource.refresh}
                  >
                    Retry
                  </Button>
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => onOpenReport(reportId, versionId)}
                  >
                    Reload source report
                  </Button>
                </Stack>
              }
            >
              {resource.error}
            </Alert>
          )}
          {data && !outOfRange && (
            <>
              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle2">
                  {data.selected.name}
                  {data.selected.code ? ` (${data.selected.code})` : ""}
                  {data.selected.unit
                    ? ` · ${data.selected.unit}`
                    : " · Unit not recorded"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {data.selected.source_name || "Source not recorded"}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Results match this source, test name, code, and unit. Current
                  noncancelled report versions only.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Specimen and method may differ; compare the reported ranges.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Searched {data.coverage.reports_searched} of{" "}
                  {data.coverage.total_reports} reports.
                  {data.coverage.truncated
                    ? " Earlier reports are not included."
                    : ""}
                </Typography>
              </Paper>
              {data.pagination.total === 0 ? (
                <Box sx={{ py: 4, textAlign: "center" }}>
                  <Typography>
                    No matching result history is available.
                  </Typography>
                </Box>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Showing {data.items.length} of {data.pagination.total}{" "}
                    matching results, newest first.
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small" sx={{ minWidth: 820 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Collection date</TableCell>
                          <TableCell>Value</TableCell>
                          <TableCell>Range / flag</TableCell>
                          <TableCell>Report</TableCell>
                          <TableCell>State</TableCell>
                          <TableCell align="right"> </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.items.map((item) => {
                          const selected =
                            item.report_id === reportId &&
                            item.version_id === versionId &&
                            item.result_index === resultIndex;
                          return (
                            <TableRow
                              key={`${item.report_id}-${item.version_id}-${item.result_index}`}
                              selected={selected}
                            >
                              <TableCell>
                                {dateLabel(item.collected_at)}
                                {selected && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    Selected source
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell>
                                {item.value_kind === "absent" ? `Not available: ${item.absent_reason}` : item.value}
                                {item.unit
                                  ? ` ${item.unit}`
                                  : " Unit not recorded"}
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {item.reference_range || "Range not reported"}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {item.flag || "No flag reported"}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {item.title}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Version {item.version_number} · Recorded{" "}
                                  {dateLabel(item.recorded_at)}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">
                                  {stateLabel(item.status)}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {item.reviewed_at
                                    ? "Reviewed"
                                    : "Not reviewed"}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  onClick={() =>
                                    onOpenReport(
                                      item.report_id,
                                      item.version_id,
                                    )
                                  }
                                >
                                  Open report
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
              {data.pagination.total > data.pagination.per_page && (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: "center" }}
                >
                  <Button
                    size="small"
                    disabled={page <= 1}
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                  >
                    Previous
                  </Button>
                  <Typography variant="body2" color="text.secondary">
                    Page {data.pagination.page} of {totalPages}
                  </Typography>
                  <Button
                    size="small"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </Stack>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default LabResultHistory;

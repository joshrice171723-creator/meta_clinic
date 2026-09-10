import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useResource } from "../../shared/ui";
import { patientReferenceLabel } from "./patientReference";
import { useClinic } from "./Workspace";

type LabReviewItem = {
  patient: { id: number; display_name: string; reference: string | null };
  report_id: number;
  current_version: {
    id: number;
    title: string;
    status: string;
    result_priority: "routine" | "urgent" | "critical";
    issued_at: string | null;
    result_count: number;
  };
};
type LabReviewResponse = {
  items: LabReviewItem[];
  pagination: { page: number; per_page: number; total: number };
  can_review: boolean;
};

function dateLabel(value: string | null) {
  if (!value) return "Reported date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Reported date not recorded"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function LabReviewWorklist() {
  const { capabilities } = useClinic();
  const canRead =
    capabilities.patients === true && capabilities.notes_read === true;

  if (!canRead) return null;

  return <LabReviewInbox />;
}

function LabReviewInbox() {
  const [page, setPage] = useState(1);
  const resource = useResource<LabReviewResponse>(
    `/api/clinic/lab_reports/review_queue?page=${page}&per_page=25`,
  );
  const response = resource.data;
  const totalPages = response
    ? Math.max(
        1,
        Math.ceil(response.pagination.total / response.pagination.per_page),
      )
    : 1;
  const outOfRange = response !== undefined && page > totalPages;

  useEffect(() => {
    if (outOfRange) setPage(totalPages);
  }, [outOfRange, totalPages]);

  return (
    <Stack spacing={2.5} sx={{ mb: 3.5 }}>
      <Box>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <Typography component="h2" variant="h5" sx={{ fontWeight: 700 }}>
            Lab review inbox
          </Typography>
          <Button onClick={resource.refresh}>Refresh</Button>
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: "70ch" }}>
          Current lab reports that still need review. Open the exact patient
          report to review it.
        </Typography>
      </Box>
      <Paper
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <Box sx={{ p: { xs: 2, md: 2.5 } }}>
          {!response && !resource.error && (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ py: 4, alignItems: "center" }}
              role="status"
            >
              <CircularProgress size={20} />
              <Typography>Loading lab reports needing review…</Typography>
            </Stack>
          )}
          {resource.error && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={resource.refresh}>
                  Retry
                </Button>
              }
            >
              The lab review inbox could not be loaded. {resource.error}
            </Alert>
          )}
          {outOfRange && (
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ py: 4, alignItems: "center" }}
              role="status"
            >
              <CircularProgress size={20} />
              <Typography>Loading available lab reports…</Typography>
            </Stack>
          )}
          {response && response.pagination.total === 0 && (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <AssignmentTurnedInOutlinedIcon
                sx={{ color: "text.disabled", fontSize: 40, mb: 1 }}
              />
              <Typography variant="h6">No lab reports need review</Typography>
              <Typography color="text.secondary">
                New current reports will appear here when they are recorded.
              </Typography>
            </Box>
          )}
          {response && !outOfRange && response.items.length > 0 && (
            <Stack divider={<Divider flexItem />}>
              <Typography variant="body2" color="text.secondary" sx={{ pb: 1 }}>
                Showing {response.items.length} of {response.pagination.total}{" "}
                current unreviewed reports, oldest reported first.
              </Typography>
              {response.items.map((item) => {
                const reference = patientReferenceLabel(item.patient.reference);
                const query = new URLSearchParams({
                  lab_report_id: String(item.report_id),
                  lab_version_id: String(item.current_version.id),
                });
                return (
                  <Box
                    key={`${item.report_id}-${item.current_version.id}`}
                    sx={{
                      py: 2,
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        md: "minmax(0, 1fr) auto",
                      },
                      gap: 2,
                      alignItems: "center",
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        sx={{ flexWrap: "wrap", alignItems: "center" }}
                      >
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 700 }}
                        >
                          {item.patient.display_name}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={item.current_version.status}
                        />
                        {item.current_version.result_priority !== "routine" && (
                          <Chip
                            size="small"
                            color={
                              item.current_version.result_priority ===
                              "critical"
                                ? "error"
                                : "warning"
                            }
                            label={item.current_version.result_priority}
                          />
                        )}
                      </Stack>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {reference ? `${reference} · ` : ""}
                        {item.current_version.title}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        Reported: {dateLabel(item.current_version.issued_at)} ·{" "}
                        {item.current_version.result_count} recorded{" "}
                        {item.current_version.result_count === 1
                          ? "result"
                          : "results"}
                      </Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      href={`/clinic/patients/${item.patient.id}?${query.toString()}`}
                      sx={{ justifySelf: { xs: "start", md: "end" } }}
                    >
                      {response.can_review ? "Review report" : "Open report"}
                    </Button>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Box>
      </Paper>
      {response && response.pagination.total > response.pagination.per_page && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Button
            size="small"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary">
            Page {response.pagination.page} of {totalPages}
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
    </Stack>
  );
}

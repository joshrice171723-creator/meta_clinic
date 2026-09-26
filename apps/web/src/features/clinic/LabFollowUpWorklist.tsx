import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
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
import { businessNow, isBeforeBusinessTime } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";
import { patientReferenceLabel } from "./patientReference";
import type { LabFollowUp } from "./PatientLabReports";
import { useClinic } from "./Workspace";

type LabFollowUpItem = {
  patient: { id: number; display_name: string; reference: string | null };
  report_id: number;
  current_version_id: number;
  version: {
    id: number;
    version_number: number;
    title: string;
    issued_at: string | null;
    result_priority: "routine" | "urgent" | "critical";
  };
  follow_up: LabFollowUp;
};
type LabFollowUpResponse = {
  items: LabFollowUpItem[];
  pagination: { page: number; per_page: number; total: number };
  can_complete: boolean;
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

function ageLabel(value: string) {
  const recordedAt = new Date(value).getTime();
  if (Number.isNaN(recordedAt)) return "Age not recorded";
  const hours = Math.max(
    0,
    Math.floor((businessNow().getTime() - recordedAt) / 3_600_000),
  );
  if (hours < 24) return hours === 1 ? "1 hour open" : `${hours} hours open`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day open" : `${days} days open`;
}

function dueLabel(value: string | null) {
  if (!value) return null;
  const dueAt = new Date(value);
  if (Number.isNaN(dueAt.valueOf())) return null;
  const overdue = isBeforeBusinessTime(dueAt);
  return `${overdue ? "Overdue" : "Due"} ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(dueAt)}`;
}

export function LabFollowUpWorklist() {
  const { capabilities } = useClinic();
  const canRead =
    capabilities.patients === true && capabilities.notes_read === true;

  if (!canRead) return null;
  return <LabFollowUpInbox />;
}

function LabFollowUpInbox() {
  const [page, setPage] = useState(1);
  const resource = useResource<LabFollowUpResponse>(
    `/api/clinic/lab_reports/follow_up_queue?page=${page}&per_page=25`,
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
            Lab follow-ups
          </Typography>
          <Button onClick={resource.refresh}>Refresh</Button>
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: "70ch" }}>
          Open follow-ups remain visible when a corrected report needs a new
          review. Open the exact version to record its outcome.
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
              <Typography>Loading open lab follow-ups…</Typography>
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
              The lab follow-up list could not be loaded. {resource.error}
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
              <Typography>Loading available lab follow-ups…</Typography>
            </Stack>
          )}
          {response && response.pagination.total === 0 && (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <AssignmentOutlinedIcon
                sx={{ color: "text.disabled", fontSize: 40, mb: 1 }}
              />
              <Typography variant="h6">No open lab follow-ups</Typography>
              <Typography color="text.secondary">
                Open lab follow-ups will appear here.
              </Typography>
            </Box>
          )}
          {response && !outOfRange && response.items.length > 0 && (
            <Stack divider={<Divider flexItem />}>
              <Typography variant="body2" color="text.secondary" sx={{ pb: 1 }}>
                Showing {response.items.length} of {response.pagination.total}{" "}
                open follow-ups.
              </Typography>
              {response.items.map((item) => {
                const reference = patientReferenceLabel(item.patient.reference);
                const query = new URLSearchParams({
                  lab_report_id: String(item.report_id),
                  lab_version_id: String(item.version.id),
                });
                return (
                  <Box
                    key={item.follow_up.id}
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
                          color="warning"
                          label={ageLabel(item.follow_up.recorded_at)}
                        />
                        {item.version.result_priority !== "routine" && (
                          <Chip
                            size="small"
                            color={
                              item.version.result_priority === "critical"
                                ? "error"
                                : "warning"
                            }
                            label={item.version.result_priority}
                          />
                        )}
                        {item.version.id !== item.current_version_id && (
                          <Chip
                            size="small"
                            color="info"
                            label="Report corrected"
                          />
                        )}
                        {dueLabel(item.follow_up.due_at) && (
                          <Chip
                            size="small"
                            color={
                              isBeforeBusinessTime(
                                item.follow_up.due_at as string,
                              )
                                ? "error"
                                : "default"
                            }
                            variant="outlined"
                            label={dueLabel(item.follow_up.due_at)}
                          />
                        )}
                      </Stack>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        {reference ? `${reference} · ` : ""}
                        {item.version.title} · Version{" "}
                        {item.version.version_number}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        Instructions:{" "}
                        {item.follow_up.instructions ||
                          "Instructions not recorded"}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        Reported: {dateLabel(item.version.issued_at)} ·
                        Follow-up recorded:{" "}
                        {dateLabel(item.follow_up.recorded_at)}
                      </Typography>
                      {item.follow_up.contact_attempts.map((attempt) => (
                        <Typography key={attempt.id} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Contact attempt: {attempt.contact_method.replaceAll("_", " ")} · {attempt.outcome.replaceAll("_", " ")} · {dateLabel(attempt.attempted_at)} · next action #{attempt.next_action.task_id} owned
                        </Typography>
                      ))}
                    </Box>
                    <Button
                      variant="outlined"
                      href={`/clinic/patients/${item.patient.id}?${query.toString()}`}
                      sx={{ justifySelf: { xs: "start", md: "end" } }}
                    >
                      {response.can_complete
                        ? "Complete follow-up"
                        : "Open report"}
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
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary">
            Page {response.pagination.page} of {totalPages}
          </Typography>
          <Button
            size="small"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

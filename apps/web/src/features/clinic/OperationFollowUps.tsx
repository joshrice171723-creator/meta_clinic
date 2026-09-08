import AssignmentLateOutlinedIcon from "@mui/icons-material/AssignmentLateOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

type FollowUpFilter = "all" | "mine" | "overdue" | "unassigned";
type FollowUpRequest = {
  id: number;
  conversation_id: number;
  subject: string;
  requested_action?: string | null;
  state: string;
  due_at: string | null;
  assignee_label?: string | null;
  assigned_to_me: boolean;
  overdue: boolean;
};
type FollowUpResponse = {
  summary: { open: number; overdue: number; mine: number; unassigned: number };
  requests: FollowUpRequest[];
  reminder_attention_count: number | null;
};

const filters: {
  value: FollowUpFilter;
  label: string;
  summaryKey: keyof FollowUpResponse["summary"];
}[] = [
  { value: "all", label: "Open", summaryKey: "open" },
  { value: "mine", label: "Mine", summaryKey: "mine" },
  { value: "overdue", label: "Overdue", summaryKey: "overdue" },
  { value: "unassigned", label: "Unassigned", summaryKey: "unassigned" },
];

function dateLabel(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function OperationFollowUps() {
  const { capabilities } = useClinic();
  if (capabilities.staff_messaging_read !== true) return null;
  return <FollowUpWorklist />;
}

function FollowUpWorklist() {
  const { current_site } = useClinic();
  const [filter, setFilter] = useState<FollowUpFilter>("all");
  const params = new URLSearchParams({ filter });
  if (current_site?.id) params.set("site_id", String(current_site.id));
  const resource = useResource<FollowUpResponse>(
    `/api/clinic/operations/follow_ups?${params.toString()}`,
  );
  const response = resource.data;
  const filteredCount = response?.summary[filter === "all" ? "open" : filter];

  return (
    <Stack spacing={2.5} sx={{ mb: 3.5 }}>
      <Box>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 700 }}>
            Follow-up worklist
          </Typography>
          <Button onClick={resource.refresh}>Refresh</Button>
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: "70ch" }}>
          Review open staff requests and continue the conversation where the
          request is managed.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {current_site ? current_site.name || current_site.code : "All accessible locations"} · Your active conversations
        </Typography>
      </Box>
      {response?.reminder_attention_count !== null &&
        response?.reminder_attention_count !== undefined && (
          <Alert
            severity={response.reminder_attention_count > 0 ? "warning" : "info"}
            icon={<NotificationsNoneOutlinedIcon />}
            action={
              <Button color="inherit" size="small" href="/clinic/reminders?view=attention">
                Review reminders
              </Button>
            }
          >
            {response.reminder_attention_count > 0
              ? `${response.reminder_attention_count} reminder${response.reminder_attention_count === 1 ? " needs" : "s need"} attention.`
              : "No reminders need attention."}
          </Alert>
        )}
      <Paper
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <Tabs
          value={filter}
          onChange={(_, value: FollowUpFilter) => setFilter(value)}
          aria-label="Follow-up request filters"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: { xs: 1, md: 2 },
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          {filters.map((item) => (
            <Tab
              key={item.value}
              value={item.value}
              label={`${item.label}${response ? ` (${response.summary[item.summaryKey]})` : ""}`}
            />
          ))}
        </Tabs>
        <Box sx={{ p: { xs: 2, md: 2.5 } }}>
          {!response && !resource.error && (
            <Stack direction="row" spacing={1.5} sx={{ py: 4, alignItems: "center" }} role="status">
              <CircularProgress size={20} />
              <Typography>Loading follow-up requests…</Typography>
            </Stack>
          )}
          {resource.error && (
            <Alert
              severity="error"
              action={<Button color="inherit" size="small" onClick={resource.refresh}>Retry</Button>}
            >
              The follow-up worklist could not be loaded. {resource.error}
            </Alert>
          )}
          {response && response.requests.length === 0 && (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <AssignmentLateOutlinedIcon sx={{ color: "text.disabled", fontSize: 40, mb: 1 }} />
              <Typography variant="h6">
                No {filter === "all" ? "open" : filters.find((item) => item.value === filter)?.label.toLowerCase()} follow-ups
              </Typography>
              <Typography color="text.secondary">
                New requests in conversations you can access will appear here.
              </Typography>
            </Box>
          )}
          {response && response.requests.length > 0 && (
            <Stack divider={<Divider flexItem />}>
              <Typography variant="body2" color="text.secondary">
                Showing {response.requests.length} of {filteredCount} requests, earliest due first.
                {filteredCount !== undefined && filteredCount > response.requests.length && " Open Messages for the full conversation history."}
              </Typography>
              {response.requests.map((request) => (
                <Box
                  key={request.id}
                  sx={{
                    py: 2,
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
                    gap: 2,
                    alignItems: "center",
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {request.requested_action || request.subject}
                      </Typography>
                      <Chip size="small" variant="outlined" label={request.state.replaceAll("_", " ")} />
                      {request.overdue && <Chip size="small" color="warning" label="Overdue" />}
                    </Stack>
                    {request.requested_action && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {request.subject}
                      </Typography>
                    )}
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 0.25, sm: 2 }} sx={{ mt: 0.75 }}>
                      <Typography variant="body2" color={request.overdue ? "warning.main" : "text.secondary"}>
                        Due: {dateLabel(request.due_at)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {request.assigned_to_me ? "Assigned to you" : request.assignee_label ? `Assigned to ${request.assignee_label}` : "Unassigned"}
                      </Typography>
                    </Stack>
                  </Box>
                  <Button
                    variant="outlined"
                    href={`/clinic/messages?conversation_id=${request.conversation_id}`}
                    startIcon={<ForumOutlinedIcon />}
                    sx={{ justifySelf: { xs: "start", md: "end" } }}
                  >
                    Open conversation
                  </Button>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Paper>
    </Stack>
  );
}
